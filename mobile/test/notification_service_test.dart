import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yourprinter/models/printer_status.dart';
import 'package:yourprinter/services/notification_service.dart';
import 'package:yourprinter/services/preferences_service.dart';

// Test harness that records notification triggers without relying on native Android channels
class TestNotificationService extends NotificationService {
  final List<String> watchdogAlerts = [];
  final List<String> completeAlerts = [];
  final List<String> pauseAlerts = [];
  final List<String> cooldownAlerts = [];
  final List<String> foregroundUpdates = [];
  int foregroundStopCount = 0;

  TestNotificationService({required super.prefs});

  @override
  Future<void> showWatchdogAlert({
    required String jobName,
    required double confidence,
    required double threshold,
    required bool autoPaused,
  }) async {
    watchdogAlerts.add('$jobName|conf:$confidence|thresh:$threshold|paused:$autoPaused');
  }

  @override
  Future<void> showPrintComplete({required String jobName}) async {
    completeAlerts.add(jobName);
  }

  @override
  Future<void> showPrintPaused({required String jobName}) async {
    pauseAlerts.add(jobName);
  }

  @override
  Future<void> showPrinterCooled({
    required String printerName,
    required double bedTemp,
  }) async {
    cooldownAlerts.add('$printerName|$bedTemp');
  }

  @override
  Future<void> updateForegroundService({
    required String printerName,
    required PrinterStatusData status,
  }) async {
    foregroundUpdates.add('$printerName|${status.printerState}|${status.progress}%');
  }

  @override
  Future<void> stopForegroundService() async {
    foregroundStopCount++;
  }
}

PrinterStatusData createStatus({
  String printerState = 'Idle',
  double bedTemp = 25.0,
  double progress = 0.0,
  String? jobName,
  WatchdogStatusData? watchdog,
}) {
  return PrinterStatusData(
    printerState: printerState,
    bedTemperature: bedTemp,
    bedTargetTemperature: 0.0,
    nozzleTemperature: 25.0,
    nozzleTargetTemperature: 0.0,
    progress: progress,
    currentLayer: 1,
    totalLayers: 100,
    jobName: jobName,
    watchdog: watchdog,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('PreferencesService Notification Settings', () {
    late PreferencesService prefs;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final sp = await SharedPreferences.getInstance();
      prefs = PreferencesService(sp);
    });

    test('All notification toggles default to true', () {
      expect(prefs.isNotificationsEnabled(), isTrue);
      expect(prefs.isWatchdogAlertsEnabled(), isTrue);
      expect(prefs.isPrintCompleteAlertsEnabled(), isTrue);
      expect(prefs.isPrinterCooledAlertsEnabled(), isTrue);
      expect(prefs.isBackgroundMonitoringEnabled(), isTrue);
    });

    test('Notification toggles can be modified and persist', () async {
      await prefs.setNotificationsEnabled(false);
      await prefs.setWatchdogAlertsEnabled(false);
      await prefs.setPrintCompleteAlertsEnabled(false);
      await prefs.setPrinterCooledAlertsEnabled(false);
      await prefs.setBackgroundMonitoringEnabled(false);

      expect(prefs.isNotificationsEnabled(), isFalse);
      expect(prefs.isWatchdogAlertsEnabled(), isFalse);
      expect(prefs.isPrintCompleteAlertsEnabled(), isFalse);
      expect(prefs.isPrinterCooledAlertsEnabled(), isFalse);
      expect(prefs.isBackgroundMonitoringEnabled(), isFalse);
    });
  });

  group('NotificationService Telemetry Triggering', () {
    late PreferencesService prefs;
    late TestNotificationService service;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final sp = await SharedPreferences.getInstance();
      prefs = PreferencesService(sp);
      service = TestNotificationService(prefs: prefs);
    });

    test('Watchdog alert triggers when confidence exceeds threshold and deduplicates', () {
      final statusAlerting = createStatus(
        printerState: 'Printing',
        jobName: 'dragon_v2.gcode',
        watchdog: const WatchdogStatusData(
          online: true,
          state: 'alert',
          confidence: 0.85,
          threshold: 0.20,
          autoPauseEnabled: true,
          autoPauseTriggered: true,
        ),
      );

      // First tick: should trigger alert
      service.processTelemetryUpdate(statusAlerting, printerName: 'Creator 5 Pro');
      expect(service.watchdogAlerts.length, 1);
      expect(service.watchdogAlerts.first, contains('dragon_v2.gcode|conf:0.85|thresh:0.2|paused:true'));

      // Subsequent identical ticks: deduplicated, no additional alerts
      service.processTelemetryUpdate(statusAlerting, printerName: 'Creator 5 Pro');
      expect(service.watchdogAlerts.length, 1);

      // Alert clears
      final statusCleared = createStatus(
        printerState: 'Printing',
        jobName: 'dragon_v2.gcode',
        watchdog: const WatchdogStatusData(
          online: true,
          state: 'monitoring',
          confidence: 0.05,
          threshold: 0.20,
          autoPauseEnabled: true,
          autoPauseTriggered: false,
        ),
      );
      service.processTelemetryUpdate(statusCleared, printerName: 'Creator 5 Pro');
      expect(service.watchdogAlerts.length, 1);

      // New alert triggers again after clearing
      service.processTelemetryUpdate(statusAlerting, printerName: 'Creator 5 Pro');
      expect(service.watchdogAlerts.length, 2);
    });

    test('Print complete triggers once and initiates bed cooldown tracking', () {
      final statusPrinting = createStatus(
        printerState: 'Printing',
        bedTemp: 60.0,
        progress: 80.0,
        jobName: 'bracket.gcode',
      );
      service.processTelemetryUpdate(statusPrinting, printerName: 'Creator 5 Pro');
      expect(service.completeAlerts, isEmpty);
      expect(service.cooldownAlerts, isEmpty);

      // Completed
      final statusComplete = createStatus(
        printerState: 'Complete',
        bedTemp: 55.0,
        progress: 100.0,
        jobName: 'bracket.gcode',
      );
      service.processTelemetryUpdate(statusComplete, printerName: 'Creator 5 Pro');
      expect(service.completeAlerts.length, 1);
      expect(service.completeAlerts.first, 'bracket.gcode');
      expect(service.cooldownAlerts, isEmpty);

      // Repeat complete status does not send duplicate alert
      service.processTelemetryUpdate(statusComplete, printerName: 'Creator 5 Pro');
      expect(service.completeAlerts.length, 1);

      // Bed cools down to 42°C (still > 40°C) -> no cooldown alert yet
      final statusCooling1 = createStatus(
        printerState: 'Idle',
        bedTemp: 42.0,
        progress: 100.0,
        jobName: 'bracket.gcode',
      );
      service.processTelemetryUpdate(statusCooling1, printerName: 'Creator 5 Pro');
      expect(service.cooldownAlerts, isEmpty);

      // Bed cools down to 38°C (<= 40°C) -> cooldown alert fires!
      final statusCooling2 = createStatus(
        printerState: 'Idle',
        bedTemp: 38.0,
        progress: 100.0,
        jobName: 'bracket.gcode',
      );
      service.processTelemetryUpdate(statusCooling2, printerName: 'Creator 5 Pro');
      expect(service.cooldownAlerts.length, 1);
      expect(service.cooldownAlerts.first, contains('Creator 5 Pro|38.0'));

      // Cooldown alert does not duplicate on subsequent idle ticks
      service.processTelemetryUpdate(statusCooling2, printerName: 'Creator 5 Pro');
      expect(service.cooldownAlerts.length, 1);
    });

    test('Print paused triggers when transitioning from printing to paused', () {
      final statusPrinting = createStatus(
        printerState: 'Printing',
        progress: 50.0,
        jobName: 'phone_mount.3mf',
      );
      service.processTelemetryUpdate(statusPrinting, printerName: 'Creator 5 Pro');
      expect(service.pauseAlerts, isEmpty);

      final statusPaused = createStatus(
        printerState: 'Paused',
        progress: 50.0,
        jobName: 'phone_mount.3mf',
      );
      service.processTelemetryUpdate(statusPaused, printerName: 'Creator 5 Pro');
      expect(service.pauseAlerts.length, 1);
      expect(service.pauseAlerts.first, 'phone_mount.3mf');
    });

    test('Foreground service is updated during active print and stopped when idle', () {
      final statusPrinting = createStatus(
        printerState: 'Printing',
        bedTemp: 60.0,
        progress: 25.0,
        jobName: 'test.gcode',
      );
      service.processTelemetryUpdate(statusPrinting, printerName: 'Creator 5 Pro');
      expect(service.foregroundUpdates.length, 1);
      expect(service.foregroundUpdates.first, 'Creator 5 Pro|Printing|25.0%');

      // Transitions to idle -> stops foreground service
      final statusIdle = createStatus(
        printerState: 'Idle',
        bedTemp: 25.0,
        progress: 0.0,
      );
      service.processTelemetryUpdate(statusIdle, printerName: 'Creator 5 Pro');
      expect(service.foregroundStopCount, 1);
    });

    test('Disabling master notifications suppresses all alerts and stops foreground service', () async {
      await prefs.setNotificationsEnabled(false);

      final statusAlerting = createStatus(
        printerState: 'Printing',
        jobName: 'failure.gcode',
        watchdog: const WatchdogStatusData(
          online: true,
          state: 'alert',
          confidence: 0.99,
          threshold: 0.10,
          autoPauseEnabled: true,
          autoPauseTriggered: true,
        ),
      );

      service.processTelemetryUpdate(statusAlerting, printerName: 'Creator 5 Pro');
      expect(service.watchdogAlerts, isEmpty);
      expect(service.completeAlerts, isEmpty);
      expect(service.foregroundUpdates, isEmpty);
    });
  });
}

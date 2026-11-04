import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/printer_status.dart';
import '../state/auth_provider.dart';
import 'preferences_service.dart';

@pragma('vm:entry-point')
void startForegroundTaskCallback() {
  FlutterForegroundTask.setTaskHandler(PrinterMonitorTaskHandler());
}

class PrinterMonitorTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    debugPrint('[ForegroundTask] Service started by ${starter.name}');
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Keep-alive heartbeat
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    debugPrint('[ForegroundTask] Service destroyed (timeout: $isTimeout)');
  }
}

@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse notificationResponse) {
  debugPrint('[NotificationService] Background notification tapped: ${notificationResponse.payload}');
}

class NotificationService {
  final PreferencesService _prefs;
  final FlutterLocalNotificationsPlugin _localNotifications;

  static const String channelIdWatchdog = 'yourprinter_watchdog_channel';
  static const String channelNameWatchdog = 'Watchdog Failure Alerts';
  static const String channelIdLifecycle = 'yourprinter_lifecycle_channel';
  static const String channelNameLifecycle = 'Print Job Lifecycle';
  static const String channelIdForeground = 'yourprinter_foreground_channel';
  static const String channelNameForeground = 'Background Monitoring';

  static const int notificationIdWatchdog = 1001;
  static const int notificationIdPrintComplete = 1002;
  static const int notificationIdPrintPaused = 1003;
  static const int notificationIdPrinterCooled = 1004;
  static const int notificationIdTest = 1099;

  bool _initialized = false;
  bool _wasPrinting = false;
  bool _wasWatchdogAlertTriggered = false;
  String? _completedAlertSentForJob;
  bool _bedWasHot = false;
  bool _cooldownAlertPending = false;
  String? _lastForegroundStatusText;

  NotificationService({
    required PreferencesService prefs,
    FlutterLocalNotificationsPlugin? localNotifications,
  })  : _prefs = prefs,
        _localNotifications = localNotifications ?? FlutterLocalNotificationsPlugin();

  bool get isInitialized => _initialized;

  Future<void> initialize() async {
    if (_initialized) return;

    try {
      const AndroidInitializationSettings androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const DarwinInitializationSettings darwinSettings =
          DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );

      const InitializationSettings initSettings = InitializationSettings(
        android: androidSettings,
        iOS: darwinSettings,
      );

      await _localNotifications.initialize(
        settings: initSettings,
        onDidReceiveNotificationResponse: (response) {
          debugPrint('[NotificationService] Notification tapped: ${response.payload}');
        },
        onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
      );

      // Create Android Notification Channels
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (androidPlugin != null) {
        await androidPlugin.createNotificationChannel(
          const AndroidNotificationChannel(
            channelIdWatchdog,
            channelNameWatchdog,
            description: 'Critical alerts when print failure or spaghetti is detected by AI Watchdog',
            importance: Importance.max,
            playSound: true,
            enableVibration: true,
          ),
        );

        await androidPlugin.createNotificationChannel(
          const AndroidNotificationChannel(
            channelIdLifecycle,
            channelNameLifecycle,
            description: 'Alerts for print completion, pause events, and build plate cooldown',
            importance: Importance.high,
            playSound: true,
            enableVibration: true,
          ),
        );

        await androidPlugin.createNotificationChannel(
          const AndroidNotificationChannel(
            channelIdForeground,
            channelNameForeground,
            description: 'Persistent low-priority notification keeping background monitoring active',
            importance: Importance.low,
            playSound: false,
            enableVibration: false,
          ),
        );
      }

      // Initialize foreground task options
      _initForegroundTask();

      _initialized = true;
      debugPrint('[NotificationService] Successfully initialized');
    } catch (e) {
      debugPrint('[NotificationService] Initialization error: $e');
    }
  }

  void _initForegroundTask() {
    try {
      FlutterForegroundTask.init(
        androidNotificationOptions: AndroidNotificationOptions(
          channelId: channelIdForeground,
          channelName: channelNameForeground,
          channelDescription: 'Persistent low-priority notification keeping background monitoring active',
          channelImportance: NotificationChannelImportance.LOW,
          priority: NotificationPriority.LOW,
          onlyAlertOnce: true,
        ),
        iosNotificationOptions: const IOSNotificationOptions(
          showNotification: false,
          playSound: false,
        ),
        foregroundTaskOptions: ForegroundTaskOptions(
          eventAction: ForegroundTaskEventAction.repeat(10000),
          autoRunOnBoot: false,
          autoRunOnMyPackageReplaced: false,
          allowWakeLock: true,
          allowWifiLock: true,
        ),
      );
    } catch (e) {
      debugPrint('[NotificationService] Failed to init foreground task: $e');
    }
  }

  Future<bool> requestPermissions() async {
    try {
      bool granted = false;
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (androidPlugin != null) {
        final res = await androidPlugin.requestNotificationsPermission();
        granted = res ?? false;
      }

      final fgPermission = await FlutterForegroundTask.checkNotificationPermission();
      if (fgPermission != NotificationPermission.granted) {
        await FlutterForegroundTask.requestNotificationPermission();
      }

      return granted;
    } catch (e) {
      debugPrint('[NotificationService] Request permission error: $e');
      return false;
    }
  }

  Future<void> sendTestNotification() async {
    await initialize();
    try {
      const androidDetails = AndroidNotificationDetails(
        channelIdLifecycle,
        channelNameLifecycle,
        channelDescription: 'Notification test channel',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      );
      const notificationDetails = NotificationDetails(android: androidDetails);

      await _localNotifications.show(
        id: notificationIdTest,
        title: '🔔 YourPrinter Alert Test',
        body: 'Local push notifications and background channels are operating normally.',
        notificationDetails: notificationDetails,
        payload: 'test_alert',
      );
    } catch (e) {
      debugPrint('[NotificationService] Failed to send test notification: $e');
    }
  }

  Future<void> showWatchdogAlert({
    required String jobName,
    required double confidence,
    required double threshold,
    required bool autoPaused,
  }) async {
    if (!_prefs.isNotificationsEnabled() || !_prefs.isWatchdogAlertsEnabled()) return;
    await initialize();

    try {
      final confPercent = (confidence * 100).toStringAsFixed(0);
      final threshPercent = (threshold * 100).toStringAsFixed(0);
      final title = autoPaused
          ? '🚨 AI Watchdog Auto-Paused Print!'
          : '⚠️ AI Watchdog Alert: Print Anomaly!';
      final body = autoPaused
          ? 'Print anomaly detected ($confPercent% conf, threshold $threshPercent%). Job paused automatically.'
          : 'Print anomaly detected ($confPercent% conf, threshold $threshPercent%). Check printer immediately.';

      final androidDetails = AndroidNotificationDetails(
        channelIdWatchdog,
        channelNameWatchdog,
        channelDescription: 'Critical alerts when print failure or spaghetti is detected by AI Watchdog',
        importance: Importance.max,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        enableVibration: true,
        playSound: true,
        styleInformation: BigTextStyleInformation(
          body,
          contentTitle: title,
          summaryText: jobName.isNotEmpty ? jobName : 'Watchdog Alert',
        ),
      );

      final notificationDetails = NotificationDetails(android: androidDetails);

      await _localNotifications.show(
        id: notificationIdWatchdog,
        title: title,
        body: body,
        notificationDetails: notificationDetails,
        payload: 'watchdog_alert',
      );
    } catch (e) {
      debugPrint('[NotificationService] Failed to show watchdog alert: $e');
    }
  }

  Future<void> showPrintComplete({required String jobName}) async {
    if (!_prefs.isNotificationsEnabled() || !_prefs.isPrintCompleteAlertsEnabled()) return;
    await initialize();

    try {
      final name = jobName.isNotEmpty ? jobName : 'Print job';
      final androidDetails = AndroidNotificationDetails(
        channelIdLifecycle,
        channelNameLifecycle,
        channelDescription: 'Alerts for print completion',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        enableVibration: true,
        playSound: true,
        styleInformation: BigTextStyleInformation(
          'Print "$name" has finished successfully.',
          contentTitle: '✅ Print Complete',
          summaryText: name,
        ),
      );

      final notificationDetails = NotificationDetails(android: androidDetails);

      await _localNotifications.show(
        id: notificationIdPrintComplete,
        title: '✅ Print Complete',
        body: 'Print "$name" has finished successfully.',
        notificationDetails: notificationDetails,
        payload: 'print_complete',
      );
    } catch (e) {
      debugPrint('[NotificationService] Failed to show print complete notification: $e');
    }
  }

  Future<void> showPrintPaused({required String jobName}) async {
    if (!_prefs.isNotificationsEnabled() || !_prefs.isPrintCompleteAlertsEnabled()) return;
    await initialize();

    try {
      final name = jobName.isNotEmpty ? jobName : 'Print job';
      const androidDetails = AndroidNotificationDetails(
        channelIdLifecycle,
        channelNameLifecycle,
        channelDescription: 'Alerts for print pause events',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        enableVibration: true,
        playSound: true,
      );

      const notificationDetails = NotificationDetails(android: androidDetails);

      await _localNotifications.show(
        id: notificationIdPrintPaused,
        title: '⏸️ Print Paused',
        body: 'Print "$name" was paused.',
        notificationDetails: notificationDetails,
        payload: 'print_paused',
      );
    } catch (e) {
      debugPrint('[NotificationService] Failed to show print paused notification: $e');
    }
  }

  Future<void> showPrinterCooled({
    required String printerName,
    required double bedTemp,
  }) async {
    if (!_prefs.isNotificationsEnabled() || !_prefs.isPrinterCooledAlertsEnabled()) return;
    await initialize();

    try {
      final name = printerName.isNotEmpty ? printerName : 'Printer';
      final body = '$name heated bed has cooled to ${bedTemp.toStringAsFixed(0)}°C. Safe to remove parts from build plate.';
      final androidDetails = AndroidNotificationDetails(
        channelIdLifecycle,
        channelNameLifecycle,
        channelDescription: 'Alerts for build plate cooldown',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        enableVibration: true,
        playSound: true,
        styleInformation: BigTextStyleInformation(
          body,
          contentTitle: '❄️ Bed Cooled Down',
          summaryText: name,
        ),
      );

      final notificationDetails = NotificationDetails(android: androidDetails);

      await _localNotifications.show(
        id: notificationIdPrinterCooled,
        title: '❄️ Bed Cooled Down',
        body: body,
        notificationDetails: notificationDetails,
        payload: 'bed_cooled',
      );
    } catch (e) {
      debugPrint('[NotificationService] Failed to show bed cooled notification: $e');
    }
  }

  Future<void> updateForegroundService({
    required String printerName,
    required PrinterStatusData status,
  }) async {
    if (!_prefs.isNotificationsEnabled() || !_prefs.isBackgroundMonitoringEnabled()) {
      await stopForegroundService();
      return;
    }

    try {
      final title = '$printerName • ${status.printerState}';
      final jobDisplay = status.jobName != null && status.jobName!.isNotEmpty
          ? status.jobName!
          : 'Print Job';
      final text = '$jobDisplay • ${status.progress.toStringAsFixed(0)}% (L${status.currentLayer}/${status.totalLayers}) • Bed: ${status.bedTemperature.toStringAsFixed(0)}°C Nozzle: ${status.nozzleTemperature.toStringAsFixed(0)}°C';

      if (text == _lastForegroundStatusText) return;
      _lastForegroundStatusText = text;

      final isRunning = await FlutterForegroundTask.isRunningService;
      if (!isRunning) {
        await FlutterForegroundTask.startService(
          serviceId: 256,
          serviceTypes: [ForegroundServiceTypes.dataSync],
          notificationTitle: title,
          notificationText: text,
          callback: startForegroundTaskCallback,
        );
      } else {
        await FlutterForegroundTask.updateService(
          notificationTitle: title,
          notificationText: text,
        );
      }
    } catch (e) {
      debugPrint('[NotificationService] Foreground service update error: $e');
    }
  }

  Future<void> stopForegroundService() async {
    try {
      final isRunning = await FlutterForegroundTask.isRunningService;
      if (isRunning) {
        await FlutterForegroundTask.stopService();
        _lastForegroundStatusText = null;
      }
    } catch (e) {
      debugPrint('[NotificationService] Stop foreground service error: $e');
    }
  }

  void processTelemetryUpdate(PrinterStatusData status, {String? printerName}) {
    if (!_prefs.isNotificationsEnabled()) return;

    final pName = printerName ?? 'YourPrinter';
    final job = status.jobName ?? '';

    // 1. Watchdog Alert Check
    if (_prefs.isWatchdogAlertsEnabled() && status.watchdog != null) {
      final wd = status.watchdog!;
      final isAlert = wd.autoPauseTriggered ||
          wd.state == 'alert' ||
          (wd.confidence >= wd.threshold && wd.confidence > 0);

      if (isAlert && !_wasWatchdogAlertTriggered) {
        _wasWatchdogAlertTriggered = true;
        showWatchdogAlert(
          jobName: job,
          confidence: wd.confidence,
          threshold: wd.threshold,
          autoPaused: wd.autoPauseTriggered,
        );
      } else if (!isAlert && _wasWatchdogAlertTriggered) {
        _wasWatchdogAlertTriggered = false;
      }
    }

    // 2. Print Paused Check
    if (_wasPrinting && status.isPaused && !status.isCompleted) {
      if (status.watchdog?.autoPauseTriggered != true) {
        showPrintPaused(jobName: job);
      }
    }

    // 3. Print Completed Check
    final isDone = status.isCompleted || (_wasPrinting && status.progress >= 99.5 && !status.isPrinting);
    if (isDone && _prefs.isPrintCompleteAlertsEnabled()) {
      final jobKey = job.isNotEmpty ? job : 'job_${DateTime.now().hour}_${DateTime.now().minute}';
      if (_completedAlertSentForJob != jobKey) {
        _completedAlertSentForJob = jobKey;
        _cooldownAlertPending = true;
        showPrintComplete(jobName: job);
      }
    }

    // 4. Cooldown Check
    if (status.bedTemperature >= 50.0) {
      _bedWasHot = true;
    }
    if (_bedWasHot &&
        _cooldownAlertPending &&
        !status.isPrinting &&
        status.bedTemperature <= 40.0 &&
        status.bedTemperature > 0) {
      _bedWasHot = false;
      _cooldownAlertPending = false;
      showPrinterCooled(printerName: pName, bedTemp: status.bedTemperature);
    }

    // 5. Background Foreground Monitoring Task
    if (_prefs.isBackgroundMonitoringEnabled()) {
      if (status.isPrinting || status.isPaused) {
        updateForegroundService(printerName: pName, status: status);
      } else if (_wasPrinting && !status.isPrinting) {
        // Print ended/cancelled, stop foreground service
        stopForegroundService();
      }
    } else {
      stopForegroundService();
    }

    _wasPrinting = status.isPrinting;
  }
}

final notificationServiceProvider = Provider<NotificationService>((ref) {
  final prefs = ref.watch(preferencesServiceProvider);
  return NotificationService(prefs: prefs);
});

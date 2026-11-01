import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yourprinter/models/job_file.dart';
import 'package:yourprinter/models/print_history.dart';
import 'package:yourprinter/models/printer_context.dart';
import 'package:yourprinter/models/printer_status.dart';
import 'package:yourprinter/services/preferences_service.dart';
import 'package:yourprinter/state/auth_provider.dart';
import 'package:yourprinter/state/printer_context_provider.dart';
import 'package:yourprinter/state/telemetry_provider.dart';
import 'package:yourprinter/ui/controls/device_info_sheet.dart';

class MockTelemetryNotifier extends StateNotifier<TelemetryState> implements TelemetryNotifier {
  MockTelemetryNotifier(PrinterStatusData status)
      : super(TelemetryState(isLoading: false, status: status));

  @override
  void resetForContextSwitch() {}

  @override
  Future<void> fetchStatus({String? contextId}) async {}

  @override
  void updateStatus(PrinterStatusData newStatus) {
    state = state.copyWith(isLoading: false, status: newStatus);
  }
}

class MockPrinterContextNotifier extends StateNotifier<PrinterContextState> implements PrinterContextNotifier {
  MockPrinterContextNotifier(PrinterContext context)
      : super(PrinterContextState(isLoading: false, contexts: [context], activeContextId: context.contextId));

  @override
  Future<void> fetchContexts() async {}

  @override
  Future<void> switchContext(String contextId) async {}
}

void main() {
  group('Milestone 5: Print History & Stats Models', () {
    test('PrintHistoryItem serializes and deserializes cleanly with all properties', () {
      final now = DateTime.now();
      final item = PrintHistoryItem(
        id: 'test-123',
        filename: 'benchy.gcode',
        displayName: '3D Benchy Speed',
        printerName: 'Flashforge Creator 5 Pro',
        contextId: 'c5p-01',
        startTime: now.subtract(const Duration(hours: 1)),
        endTime: now,
        durationSeconds: 3600,
        filamentMeters: 14.5,
        filamentGrams: 42.0,
        layers: 240,
        status: 'completed',
        thumbnailUrl: 'http://127.0.0.1:3080/thumb.png',
      );

      final json = item.toJson();
      expect(json['id'], 'test-123');
      expect(json['filename'], 'benchy.gcode');
      expect(json['displayName'], '3D Benchy Speed');
      expect(json['filamentMeters'], 14.5);
      expect(json['status'], 'completed');

      final reconstructed = PrintHistoryItem.fromJson(json);
      expect(reconstructed.id, item.id);
      expect(reconstructed.filename, item.filename);
      expect(reconstructed.displayName, item.displayName);
      expect(reconstructed.durationSeconds, 3600);
      expect(reconstructed.filamentMeters, 14.5);
      expect(reconstructed.status, 'completed');
    });

    test('PrintHistoryStats calculates totals, success rate, and duration accurately', () {
      final now = DateTime.now();
      final items = [
        PrintHistoryItem(
          id: '1',
          filename: 'job1.gcode',
          displayName: 'Job 1',
          printerName: 'Printer 1',
          startTime: now.subtract(const Duration(hours: 2)),
          endTime: now.subtract(const Duration(hours: 1)),
          durationSeconds: 3600,
          filamentMeters: 10.0,
          status: 'completed',
        ),
        PrintHistoryItem(
          id: '2',
          filename: 'job2.gcode',
          displayName: 'Job 2',
          printerName: 'Printer 1',
          startTime: now.subtract(const Duration(minutes: 50)),
          endTime: now.subtract(const Duration(minutes: 40)),
          durationSeconds: 600,
          filamentMeters: 2.5,
          status: 'cancelled',
        ),
        PrintHistoryItem(
          id: '3',
          filename: 'job3.gcode',
          displayName: 'Job 3',
          printerName: 'Printer 1',
          startTime: now.subtract(const Duration(minutes: 30)),
          endTime: now.subtract(const Duration(minutes: 20)),
          durationSeconds: 600,
          filamentMeters: 1.5,
          status: 'failed',
        ),
        PrintHistoryItem(
          id: '4',
          filename: 'job4.gcode',
          displayName: 'Job 4',
          printerName: 'Printer 1',
          startTime: now.subtract(const Duration(minutes: 15)),
          endTime: now,
          durationSeconds: 900,
          filamentMeters: 3.0,
          status: 'completed',
        ),
      ];

      final stats = PrintHistoryStats.fromItems(items);
      expect(stats.totalPrints, 4);
      expect(stats.completedCount, 2);
      expect(stats.cancelledCount, 1);
      expect(stats.failedCount, 1);
      expect(stats.successRatePercent, 50); // 2 out of 4 = 50%
      expect(stats.totalDurationSeconds, 5700); // 3600 + 600 + 600 + 900
      expect(stats.totalFilamentMeters, 17.0); // 10.0 + 2.5 + 1.5 + 3.0
    });

    test('PrintHistoryStats returns graceful 100% success rate on empty list', () {
      final stats = PrintHistoryStats.fromItems([]);
      expect(stats.totalPrints, 0);
      expect(stats.completedCount, 0);
      expect(stats.successRatePercent, 100);
      expect(stats.totalDurationSeconds, 0);
      expect(stats.totalFilamentMeters, 0.0);
    });
  });

  group('Milestone 5: PreferencesService History Storage', () {
    test('PreferencesService saves, retrieves, and clears print history', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await PreferencesService.create();

      expect(prefs.getPrintHistory(), isEmpty);

      final now = DateTime.now();
      final item1 = PrintHistoryItem(
        id: '1',
        filename: 'file1.gcode',
        displayName: 'File 1',
        printerName: 'Printer A',
        startTime: now.subtract(const Duration(hours: 1)),
        endTime: now,
        durationSeconds: 3600,
        status: 'completed',
      );

      await prefs.addPrintHistoryItem(item1);
      expect(prefs.getPrintHistory().length, 1);
      expect(prefs.getPrintHistory().first.filename, 'file1.gcode');

      // Duplicate within 60s should be ignored
      await prefs.addPrintHistoryItem(item1);
      expect(prefs.getPrintHistory().length, 1);

      // Remove item
      await prefs.removePrintHistoryItem('1');
      expect(prefs.getPrintHistory(), isEmpty);

      // Seed history from recent jobs
      final recentJobs = [
        const WebUIJobFile(filename: 'recent1.gcode', displayName: 'Recent 1', printTime: 1200, filamentLength: 5000),
        const WebUIJobFile(filename: 'recent2.gcode', displayName: 'Recent 2', printTime: 2400, filamentLength: 8000),
      ];

      await prefs.seedHistoryFromRecentJobs(recentJobs, 'Flashforge C5P', 'ctx-1');
      final seeded = prefs.getPrintHistory();
      expect(seeded.length, 2);
      expect(seeded.first.filename, 'recent1.gcode');
      expect(seeded.first.filamentMeters, 5.0); // 5000 / 1000

      // Clear all
      await prefs.clearPrintHistory();
      expect(prefs.getPrintHistory(), isEmpty);
    });
  });

  group('Milestone 6: DeviceInfoSheet Widget Tests', () {
    testWidgets('DeviceInfoSheet displays lifetime telemetry and device attributes', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await PreferencesService.create();

      const mockContext = PrinterContext(
        contextId: 'c5p-01',
        name: 'Workshop Creator 5 Pro',
        model: 'Flashforge Creator 5 Pro',
        isConnected: true,
        isSelected: true,
        printerDetails: PrinterDetails(
          ipAddress: '192.168.1.100',
        ),
      );

      const mockStatus = PrinterStatusData(
        printerState: 'Printing',
        cumulativePrintTime: 7380, // 2h 3m
        cumulativeFilament: 125.4, // 125.4 m
        nozzleTemperature: 215.0,
        nozzleTargetTemperature: 220.0,
        bedTemperature: 60.0,
        bedTargetTemperature: 60.0,
        progress: 45.0,
        currentLayer: 45,
        totalLayers: 100,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(prefs),
            printerContextProvider.overrideWith((ref) => MockPrinterContextNotifier(mockContext)),
            telemetryProvider.overrideWith((ref) => MockTelemetryNotifier(mockStatus)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: DeviceInfoSheet(),
            ),
          ),
        ),
      );

      await tester.pump();

      // Check header and name
      expect(find.text('Device Information'), findsOneWidget);
      expect(find.text('Workshop Creator 5 Pro'), findsNWidgets(2)); // in header + row

      // Check model and operational state
      expect(find.text('Flashforge Creator 5 Pro'), findsOneWidget);
      expect(find.text('Printing'), findsOneWidget);

      // Check lifetime statistics: 2h 3m and 125.4 m
      expect(find.text('2h 3m'), findsOneWidget);
      expect(find.text('125.4 m'), findsOneWidget);

      // Check network IP address
      expect(find.text('192.168.1.100'), findsOneWidget);
    });
  });
}

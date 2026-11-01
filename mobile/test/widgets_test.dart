import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yourprinter/services/preferences_service.dart';
import 'package:yourprinter/state/auth_provider.dart';
import 'package:yourprinter/ui/common/status_badge.dart';
import 'package:yourprinter/ui/common/skeleton_shimmer.dart';
import 'package:yourprinter/ui/common/connection_error_card.dart';
import 'package:yourprinter/ui/common/yourprinter_logo.dart';
import 'package:yourprinter/ui/dashboard/job_progress_card.dart';
import 'package:yourprinter/state/telemetry_provider.dart';
import 'package:yourprinter/models/printer_status.dart';
import 'package:yourprinter/models/printer_context.dart';
import 'package:yourprinter/models/printer_capabilities.dart';
import 'package:yourprinter/models/printer_features.dart';
import 'package:yourprinter/core/network/api_client.dart';
import 'package:yourprinter/services/printer_service.dart';
import 'package:yourprinter/state/printer_context_provider.dart';
import 'package:yourprinter/ui/controls/control_panel_card.dart';
import 'package:yourprinter/ui/dashboard/temperature_card.dart';

class TestTelemetryNotifier extends StateNotifier<TelemetryState> implements TelemetryNotifier {
  TestTelemetryNotifier([super.state = const TelemetryState(isLoading: true)]);

  @override
  void resetForContextSwitch() {
    state = const TelemetryState(isLoading: true);
  }

  @override
  Future<void> fetchStatus({String? contextId}) async {}

  @override
  void updateStatus(PrinterStatusData newStatus) {
    state = state.copyWith(isLoading: false, status: newStatus);
  }
}

class MockPrinterService extends PrinterService {
  MockPrinterService() : super(apiClient: ApiClient(baseUrl: 'http://127.0.0.1:3000'));

  int? lastSpeedSet;
  String? lastSpeedContextId;
  int? lastFanSet;
  String? lastFanContextId;
  double? lastChamberTempSet;
  String? lastChamberContextId;
  bool lastChamberOffCalled = false;
  double? lastBedTempSet;
  bool lastBedOffCalled = false;
  double? lastExtruderTempSet;
  int? lastExtruderToolIndex;
  bool lastExtruderOffCalled = false;
  bool lastHomeCalled = false;
  bool? lastLEDSet;
  bool lastClearStatusCalled = false;

  void reset() {
    lastSpeedSet = null;
    lastSpeedContextId = null;
    lastFanSet = null;
    lastFanContextId = null;
    lastChamberTempSet = null;
    lastChamberContextId = null;
    lastChamberOffCalled = false;
    lastBedTempSet = null;
    lastBedOffCalled = false;
    lastExtruderTempSet = null;
    lastExtruderToolIndex = null;
    lastExtruderOffCalled = false;
    lastHomeCalled = false;
    lastLEDSet = null;
    lastClearStatusCalled = false;
  }

  @override
  Future<bool> setPrintSpeed(int speedPercent, {String? contextId}) async {
    lastSpeedSet = speedPercent;
    lastSpeedContextId = contextId;
    return true;
  }

  @override
  Future<bool> setFanSpeed(int fanPercent, {String? contextId}) async {
    lastFanSet = fanPercent;
    lastFanContextId = contextId;
    return true;
  }

  @override
  Future<bool> setCoolingFanSpeed(int fanPercent, {String? contextId}) =>
      setFanSpeed(fanPercent, contextId: contextId);

  @override
  Future<bool> setChamberTemp(double temp, {String? contextId}) async {
    lastChamberTempSet = temp;
    lastChamberContextId = contextId;
    return true;
  }

  @override
  Future<bool> setChamberOff({String? contextId}) async {
    lastChamberOffCalled = true;
    lastChamberContextId = contextId;
    return true;
  }

  @override
  Future<bool> setBedTemp(double temp, {String? contextId}) async {
    lastBedTempSet = temp;
    return true;
  }

  @override
  Future<bool> setBedOff({String? contextId}) async {
    lastBedOffCalled = true;
    return true;
  }

  @override
  Future<bool> setExtruderTemp(double temp, {int toolIndex = 0, String? contextId}) async {
    lastExtruderTempSet = temp;
    lastExtruderToolIndex = toolIndex;
    return true;
  }

  @override
  Future<bool> setExtruderOff({int toolIndex = 0, String? contextId}) async {
    lastExtruderOffCalled = true;
    lastExtruderToolIndex = toolIndex;
    return true;
  }

  @override
  Future<bool> homeAxes({String? contextId}) async {
    lastHomeCalled = true;
    return true;
  }

  @override
  Future<bool> setLED(bool on, {String? contextId}) async {
    lastLEDSet = on;
    return true;
  }

  @override
  Future<bool> clearStatus({String? contextId}) async {
    lastClearStatusCalled = true;
    return true;
  }
}

class TestPrinterContextNotifier extends PrinterContextNotifier {
  TestPrinterContextNotifier(super.ref, [PrinterContextState? initialState]) {
    if (initialState != null) {
      state = initialState;
    }
  }

  @override
  Future<void> fetchContexts() async {}

  @override
  Future<void> switchContext(String newContextId) async {}
}

PrinterStatusData createTestStatus({
  String printerState = 'IDLE',
  double bedTemperature = 25.0,
  double bedTargetTemperature = 0.0,
  double nozzleTemperature = 25.0,
  double nozzleTargetTemperature = 0.0,
  double? chamberTemperature,
  double? chamberTargetTemperature,
  double progress = 0.0,
  int currentLayer = 0,
  int totalLayers = 0,
  double printSpeed = 100.0,
  double coolingFanSpeed = 0.0,
}) {
  return PrinterStatusData(
    printerState: printerState,
    bedTemperature: bedTemperature,
    bedTargetTemperature: bedTargetTemperature,
    nozzleTemperature: nozzleTemperature,
    nozzleTargetTemperature: nozzleTargetTemperature,
    chamberTemperature: chamberTemperature,
    chamberTargetTemperature: chamberTargetTemperature,
    progress: progress,
    currentLayer: currentLayer,
    totalLayers: totalLayers,
    printSpeed: printSpeed,
    coolingFanSpeed: coolingFanSpeed,
  );
}

void main() {
  late PreferencesService testPrefs;
  late MockPrinterService mockPrinterService;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    testPrefs = await PreferencesService.create();
    mockPrinterService = MockPrinterService();
  });

  group('UI Widgets Tests', () {
    testWidgets('StatusBadge displays correct text for printing state', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StatusBadge(
              statusText: 'Printing',
              isPrinting: true,
              isCompleted: false,
            ),
          ),
        ),
      );

      expect(find.text('Printing'), findsOneWidget);
    });

    testWidgets('StatusBadge displays correct text for completed state', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StatusBadge(
              statusText: 'Completed',
              isPrinting: false,
              isCompleted: true,
            ),
          ),
        ),
      );

      expect(find.text('Completed'), findsOneWidget);
    });

    testWidgets('SkeletonShimmer renders with specified dimensions', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SkeletonShimmer(
              width: 120,
              height: 24,
              borderRadius: 6,
            ),
          ),
        ),
      );

      expect(find.byType(SkeletonShimmer), findsOneWidget);
    });

    testWidgets('JobProgressCard renders shimmer skeleton when telemetry is loading', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(const TelemetryState(isLoading: true))),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: JobProgressCard(),
            ),
          ),
        ),
      );

      expect(find.byType(SkeletonShimmer), findsWidgets);
    });

    testWidgets('JobProgressCard renders active print progress and metrics', (WidgetTester tester) async {
      const mockStatus = PrinterStatusData(
        printerState: 'PRINTING',
        progress: 68.5,
        currentLayer: 250,
        totalLayers: 365,
        jobName: 'gear_bearing_v2.gcode',
        timeRemaining: 1820,
        timeElapsed: 3900,
        nozzleTemperature: 215.0,
        nozzleTargetTemperature: 215.0,
        bedTemperature: 60.0,
        bedTargetTemperature: 60.0,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(const TelemetryState(isLoading: false, status: mockStatus))),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: JobProgressCard(),
            ),
          ),
        ),
      );

      expect(find.text('gear_bearing_v2.gcode'), findsOneWidget);
      expect(find.text('68.5%'), findsOneWidget);
      expect(find.text('Layer 250 / 365'), findsOneWidget);
    });

    testWidgets('ConnectionErrorCard displays generic friendly message and expands to show true message', (WidgetTester tester) async {
      const rawError = 'DioException [connection timeout]: The request connection took longer than 0:00:10.000000 and it was aborted.';

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ConnectionErrorCard(rawError: rawError),
          ),
        ),
      );

      // Verify generic summary is visible
      expect(find.text('Connection Failed'), findsOneWidget);
      expect(find.text('Connection timed out. The server took too long to respond.'), findsOneWidget);
      expect(find.text('View Technical Details'), findsOneWidget);

      // Raw error should NOT be visible initially
      expect(find.text(rawError), findsNothing);

      // Tap dropdown to expand
      await tester.tap(find.text('View Technical Details'));
      await tester.pumpAndSettle();

      // Now true error message should be visible
      expect(find.text('Hide Technical Details'), findsOneWidget);
      expect(find.text('RAW ERROR LOG'), findsOneWidget);
      expect(find.text(rawError), findsOneWidget);

      // Tap to collapse
      await tester.tap(find.text('Hide Technical Details'));
      await tester.pumpAndSettle();

      expect(find.text('View Technical Details'), findsOneWidget);
      expect(find.text(rawError), findsNothing);
    });

    testWidgets('YourPrinterLogo renders with custom dimensions and badge tile', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: YourPrinterLogo(size: 64, showBadge: true),
            ),
          ),
        ),
      );

      expect(find.byType(YourPrinterLogo), findsOneWidget);
      expect(find.descendant(of: find.byType(YourPrinterLogo), matching: find.byType(CustomPaint)), findsOneWidget);
    });
  });

  group('TemperatureCard Widget Tests (Chamber Parity & Cold Visibility)', () {
    const c5Context = PrinterContext(
      contextId: 'c5_ctx',
      name: 'Creator 5 Pro',
      model: 'FlashForge Creator 5 Pro',
      isConnected: true,
      isSelected: true,
      printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'Creator 5 Pro'),
    );

    const a1Context = PrinterContext(
      contextId: 'a1_ctx',
      name: 'Bambu Lab A1 Mini',
      model: 'A1 Mini',
      isConnected: true,
      isSelected: true,
      printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'A1 Mini'),
    );

    testWidgets('Cold Creator 5 Pro chamber displays at 0°C with target 0°C and allows tap to setpoint', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printerState: 'IDLE',
        nozzleTemperature: 25.0,
        nozzleTargetTemperature: 0.0,
        bedTemperature: 25.0,
        bedTargetTemperature: 0.0,
        chamberTemperature: 0.0,
        chamberTargetTemperature: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            hasChamberHeater: true,
            maxChamberTemp: 80.0,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('temp_row_chamber')), findsOneWidget);
      expect(find.text('Chamber'), findsOneWidget);
      expect(find.text('0°C'), findsWidgets);
      expect(find.text(' / 0°C'), findsWidgets);
    });

    testWidgets('Creator 5 Pro chamber shows heating indicator when target > current', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printerState: 'IDLE',
        nozzleTemperature: 25.0,
        nozzleTargetTemperature: 0.0,
        bedTemperature: 25.0,
        bedTargetTemperature: 0.0,
        chamberTemperature: 28.0,
        chamberTargetTemperature: 50.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            hasChamberHeater: true,
            maxChamberTemp: 80.0,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      expect(find.text('28°C'), findsOneWidget);
      expect(find.text(' / 50°C'), findsOneWidget);
    });

    testWidgets('Tap cold chamber row opens setpoint dialog and selecting ABS/ASA dispatches setChamberTemp(50)', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printerState: 'IDLE',
        nozzleTemperature: 25.0,
        nozzleTargetTemperature: 0.0,
        bedTemperature: 25.0,
        bedTargetTemperature: 0.0,
        chamberTemperature: 0.0,
        chamberTargetTemperature: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            hasChamberHeater: true,
            maxChamberTemp: 80.0,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      expect(find.text('Set Chamber Temperature'), findsOneWidget);
      expect(find.text('ABS/ASA (50°C)'), findsOneWidget);

      await tester.tap(find.text('ABS/ASA (50°C)'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberTempSet, 50.0);
      expect(mockPrinterService.lastChamberContextId, 'c5_ctx');
    });

    testWidgets('Tap chamber row, selecting Off dispatches setChamberOff', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printerState: 'IDLE',
        nozzleTemperature: 25.0,
        nozzleTargetTemperature: 0.0,
        bedTemperature: 25.0,
        bedTargetTemperature: 0.0,
        chamberTemperature: 45.0,
        chamberTargetTemperature: 50.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            hasChamberHeater: true,
            maxChamberTemp: 80.0,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Off (0°C)'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberOffCalled, true);
      expect(mockPrinterService.lastChamberContextId, 'c5_ctx');
    });

    testWidgets('Non-Creator 5 printer without chamber heater omits chamber row', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printerState: 'IDLE',
        nozzleTemperature: 25.0,
        nozzleTargetTemperature: 0.0,
        bedTemperature: 25.0,
        bedTargetTemperature: 0.0,
        chamberTemperature: null,
        chamberTargetTemperature: null,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            hasChamberHeater: false,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [a1Context],
                  activeContextId: 'a1_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('temp_row_chamber')), findsNothing);
      expect(find.text('Chamber'), findsNothing);
    });

    testWidgets('Dynamic maxChamberTemp from capabilities is passed to setpoint dialog', (WidgetTester tester) async {
      const customContext = PrinterContext(
        contextId: 'custom_ctx',
        name: 'Generic Enclosed',
        model: 'Custom Enclosed',
        isConnected: true,
        isSelected: true,
        printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'Custom Enclosed'),
      );

      final mockStatus = createTestStatus(
        printerState: 'IDLE',
        nozzleTemperature: 25.0,
        nozzleTargetTemperature: 0.0,
        bedTemperature: 25.0,
        bedTargetTemperature: 0.0,
        chamberTemperature: 25.0,
        chamberTargetTemperature: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: false,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            hasChamberHeater: true,
            maxChamberTemp: 70.0,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [customContext],
                  activeContextId: 'custom_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      expect(find.text('Set Chamber Temperature'), findsOneWidget);

      // Enter value exceeding maxTemp (75 > 70)
      await tester.enterText(find.byType(TextField), '75');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      // Dialog should still be open because 75 > 70
      expect(find.text('Set Chamber Temperature'), findsOneWidget);
      expect(mockPrinterService.lastChamberTempSet, isNull);

      // Enter valid value within maxTemp (70 <= 70)
      await tester.enterText(find.byType(TextField), '70');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      // Dialog should close and setChamberTemp(70) should be called
      expect(find.text('Set Chamber Temperature'), findsNothing);
      expect(mockPrinterService.lastChamberTempSet, 70.0);
    });
  });

  group('ControlPanelCard Widget Tests (Speed & Fan Parity)', () {
    const c5Context = PrinterContext(
      contextId: 'c5_ctx',
      name: 'Creator 5 Pro',
      model: 'FlashForge Creator 5 Pro',
      isConnected: true,
      isSelected: true,
      printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'Creator 5 Pro'),
    );

    const a1Context = PrinterContext(
      contextId: 'a1_ctx',
      name: 'Bambu Lab A1 Mini',
      model: 'A1 Mini',
      isConnected: true,
      isSelected: true,
      printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'A1 Mini'),
    );

    testWidgets('Speed controls render header readout, badge, and 3 presets with 100% active highlight', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('control_panel_speed_section')), findsOneWidget);
      expect(find.text('Print Speed Rate'), findsOneWidget);
      expect(find.text('100% (Standard)'), findsOneWidget);
      expect(find.text('Quiet'), findsOneWidget);
      expect(find.text('Standard'), findsOneWidget);
      expect(find.text('Sport'), findsOneWidget);
      expect(find.byKey(const Key('speed_preset_50')), findsOneWidget);
      expect(find.byKey(const Key('speed_preset_100')), findsOneWidget);
      expect(find.byKey(const Key('speed_preset_140')), findsOneWidget);
    });

    testWidgets('Tapping 50% Quiet preset dispatches setPrintSpeed(50) and updates highlight', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('speed_preset_50')));
      await tester.pump();

      expect(mockPrinterService.lastSpeedSet, 50);
      expect(mockPrinterService.lastSpeedContextId, 'c5_ctx');
      expect(find.text('50% (Quiet)'), findsOneWidget);

      await tester.tap(find.byKey(const Key('speed_preset_140')));
      await tester.pump();

      expect(mockPrinterService.lastSpeedSet, 140);
      expect(mockPrinterService.lastSpeedContextId, 'c5_ctx');
      expect(find.text('140% (Sport)'), findsOneWidget);
    });

    testWidgets('Speed controls omitted when canAdjustSpeed is false', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: false,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('control_panel_speed_section')), findsNothing);
    });

    testWidgets('Part cooling fan renders 0% initial state with 5 preset chips and slider', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('part_cooling_fan_section')), findsOneWidget);
      expect(find.byKey(const Key('fan_speed_readout')), findsOneWidget);
      expect(find.text('0%'), findsWidgets);
      expect(find.byKey(const Key('fan_speed_slider')), findsOneWidget);
      expect(find.byKey(const Key('fan_preset_0')), findsOneWidget);
      expect(find.byKey(const Key('fan_preset_25')), findsOneWidget);
      expect(find.byKey(const Key('fan_preset_50')), findsOneWidget);
      expect(find.byKey(const Key('fan_preset_75')), findsOneWidget);
      expect(find.byKey(const Key('fan_preset_100')), findsOneWidget);
      expect(find.text('Off'), findsWidgets);
      expect(find.text('25%'), findsOneWidget);
      expect(find.text('50%'), findsOneWidget);
      expect(find.text('75%'), findsOneWidget);
      expect(find.text('100%'), findsOneWidget);
    });

    testWidgets('Part cooling fan preset tap dispatches setFanSpeed and uses pump without animation timeout', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      // Tap 50% fan preset chip
      await tester.tap(find.byKey(const Key('fan_preset_50')));
      // Crucial: Use pump() with explicit duration, NOT pumpAndSettle(), because repeating fan animation runs!
      await tester.pump(const Duration(milliseconds: 100));

      expect(mockPrinterService.lastFanSet, 50);
      expect(mockPrinterService.lastFanContextId, 'c5_ctx');
      expect(find.text('50%'), findsWidgets);

      // Reset to 0% to stop the animation before teardown
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));

      expect(mockPrinterService.lastFanSet, 0);
    });

    testWidgets('Firmware idle notice renders when fanSpeed > 0 in idle/ready state, hides when fan is 0', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printerState: 'idle',
        printSpeed: 100.0,
        coolingFanSpeed: 50.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byKey(const Key('fan_idle_notice')), findsOneWidget);
      expect(find.text('Note: Toolhead fans engage when a print job starts.'), findsOneWidget);

      // Tap 0% preset to turn fan off
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byKey(const Key('fan_idle_notice')), findsNothing);
    });

    testWidgets('Creator 5 Pro pins hasPartCoolingFan true even if capabilities say false', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: false, // Explicitly false!
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('part_cooling_fan_section')), findsOneWidget);
    });

    testWidgets('Non-Creator 5 printer with hasPartCoolingFan false omits fan section', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: false,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [a1Context],
                  activeContextId: 'a1_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('part_cooling_fan_section')), findsNothing);
    });

    testWidgets('Dragging fan slider dispatches setFanSpeed on release', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        printSpeed: 100.0,
        coolingFanSpeed: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: const PrinterFeatures(
          hasCamera: false,
          hasLED: true,
          hasFiltration: false,
          hasMaterialStation: false,
          canPause: true,
          canResume: true,
          canCancel: true,
          ledUsesLegacyAPI: false,
          capabilities: PrinterNetworkCapabilities(
            canAdjustSpeed: true,
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context],
                  activeContextId: 'c5_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: ControlPanelCard()),
            ),
          ),
        ),
      );

      final sliderFinder = find.byKey(const Key('fan_speed_slider'));
      expect(sliderFinder, findsOneWidget);

      // Drag slider to the right
      await tester.drag(sliderFinder, const Offset(100.0, 0.0));
      await tester.pump(const Duration(milliseconds: 100));

      expect(mockPrinterService.lastFanSet, isNotNull);
      expect(mockPrinterService.lastFanSet! > 0, true);

      // Reset to 0 to stop animation
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yourprinter/services/preferences_service.dart';
import 'package:yourprinter/state/auth_provider.dart';
import 'package:yourprinter/state/telemetry_provider.dart';
import 'package:yourprinter/models/printer_status.dart';
import 'package:yourprinter/models/printer_context.dart';
import 'package:yourprinter/models/printer_capabilities.dart';
import 'package:yourprinter/models/printer_features.dart';
import 'package:yourprinter/core/network/api_client.dart';
import 'package:yourprinter/services/printer_service.dart';
import 'package:yourprinter/state/printer_context_provider.dart';
import 'package:yourprinter/ui/dashboard/temperature_card.dart';

class MockPrinterService extends PrinterService {
  MockPrinterService() : super(apiClient: ApiClient(baseUrl: 'http://127.0.0.1:3000'));

  double? lastChamberTempSet;
  String? lastChamberContextId;
  int chamberTempCallCount = 0;

  bool lastChamberOffCalled = false;
  String? lastChamberOffContextId;
  int chamberOffCallCount = 0;

  double? lastBedTempSet;
  bool lastBedOffCalled = false;
  double? lastExtruderTempSet;
  int? lastExtruderToolIndex;
  bool lastExtruderOffCalled = false;

  void reset() {
    lastChamberTempSet = null;
    lastChamberContextId = null;
    chamberTempCallCount = 0;
    lastChamberOffCalled = false;
    lastChamberOffContextId = null;
    chamberOffCallCount = 0;
    lastBedTempSet = null;
    lastBedOffCalled = false;
    lastExtruderTempSet = null;
    lastExtruderToolIndex = null;
    lastExtruderOffCalled = false;
  }

  @override
  Future<bool> setChamberTemp(double temp, {String? contextId}) async {
    lastChamberTempSet = temp;
    lastChamberContextId = contextId;
    chamberTempCallCount++;
    return true;
  }

  @override
  Future<bool> setChamberOff({String? contextId}) async {
    lastChamberOffCalled = true;
    lastChamberOffContextId = contextId;
    chamberOffCallCount++;
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
}

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

  void updateState(TelemetryState newState) {
    state = newState;
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
  Future<void> switchContext(String newContextId) async {
    state = state.copyWith(activeContextId: newContextId);
  }

  void setState(PrinterContextState newState) {
    state = newState;
  }
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

  const c5Context = PrinterContext(
    contextId: 'c5_ctx',
    name: 'FlashForge Creator 5 Pro',
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

  const ad5mContext = PrinterContext(
    contextId: 'ad5m_ctx',
    name: 'Adventurer 5M',
    model: 'FlashForge Adventurer 5M',
    isConnected: true,
    isSelected: true,
    printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'Adventurer 5M'),
  );

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    testPrefs = await PreferencesService.create();
    mockPrinterService = MockPrinterService();
  });

  group('Adversarial Stress Test: Creator 5 Pro Cold Chamber Visibility', () {
    testWidgets('Cold Creator 5 Pro: current 0°C, target 0°C renders Chamber row permanently', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
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

      // Verify row exists and displays correct cold values
      expect(find.byKey(const Key('temp_row_chamber')), findsOneWidget);
      expect(find.text('Chamber'), findsOneWidget);
      expect(find.text('0°C'), findsWidgets);
      expect(find.text(' / 0°C'), findsWidgets);
    });

    testWidgets('Cold Creator 5 Pro with null chamber temperatures renders safely as 0°C / 0°C without crash', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
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

    testWidgets('Creator 5 Pro without network capabilities (null capabilities) still renders Chamber row from model string matching', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        chamberTemperature: 0.0,
        chamberTargetTemperature: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: null,
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
    });

    testWidgets('Creator 5 Pro name variations: uppercase FLASHFORGE CREATOR 5 PRO renders Chamber row', (WidgetTester tester) async {
      const upperContext = PrinterContext(
        contextId: 'upper_ctx',
        name: 'CREATOR 5 PRO LAB',
        model: 'FLASHFORGE CREATOR 5 PRO',
        isConnected: true,
        isSelected: true,
        printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'Creator 5 Pro'),
      );

      final mockStatus = createTestStatus(chamberTemperature: 0.0, chamberTargetTemperature: 0.0);
      final telemetryState = TelemetryState(isLoading: false, status: mockStatus);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [upperContext],
                  activeContextId: 'upper_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(body: TemperatureCard()),
          ),
        ),
      );

      expect(find.byKey(const Key('temp_row_chamber')), findsOneWidget);
    });

    testWidgets('Creator 5 Pro alias matching: model ad5x with name c5_unit renders Chamber row', (WidgetTester tester) async {
      const aliasContext = PrinterContext(
        contextId: 'alias_ctx',
        name: 'c5_unit',
        model: 'FlashForge ad5x',
        isConnected: true,
        isSelected: true,
        printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'ad5x'),
      );

      final mockStatus = createTestStatus(chamberTemperature: 0.0, chamberTargetTemperature: 0.0);
      final telemetryState = TelemetryState(isLoading: false, status: mockStatus);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith(
              (ref) => TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [aliasContext],
                  activeContextId: 'alias_ctx',
                ),
              ),
            ),
            telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
          ],
          child: const MaterialApp(
            home: Scaffold(body: TemperatureCard()),
          ),
        ),
      );

      expect(find.byKey(const Key('temp_row_chamber')), findsOneWidget);
    });
  });

  group('Adversarial Stress Test: Non-Chamber Printers Exclusion', () {
    testWidgets('Bambu Lab A1 Mini (hasChamberHeater = false) omits Chamber row completely', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
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

    testWidgets('Bambu Lab A1 Mini with stray positive chamber temp (25°C) still omits Chamber row when hasChamberHeater = false', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        chamberTemperature: 25.0,
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

    testWidgets('FlashForge Adventurer 5M (hasChamberHeater = false) omits Chamber row', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
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
                  contexts: [ad5mContext],
                  activeContextId: 'ad5m_ctx',
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

    testWidgets('Non-chamber printer with null capabilities and chamberTemperature = 0.0 omits Chamber row', (WidgetTester tester) async {
      final mockStatus = createTestStatus(
        chamberTemperature: 0.0,
        chamberTargetTemperature: 0.0,
      );

      final telemetryState = TelemetryState(
        isLoading: false,
        status: mockStatus,
        features: null,
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
  });

  group('Adversarial Stress Test: Pre-heating Dialog from 0°C & Inputs', () {
    Widget buildC5Card() {
      final mockStatus = createTestStatus(
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

      return ProviderScope(
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
      );
    }

    testWidgets('Pre-heating from 0°C opens dialog with empty input and chamber chips', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      expect(find.text('Set Chamber Temperature'), findsOneWidget);
      expect(find.text('Enter target °C (0 to turn off)'), findsOneWidget);
      expect(find.text('Off (0°C)'), findsOneWidget);
      expect(find.text('Warm (40°C)'), findsOneWidget);
      expect(find.text('ABS/ASA (50°C)'), findsOneWidget);
      expect(find.text('Nylon/PC (60°C)'), findsOneWidget);

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.controller?.text, '');
    });

    testWidgets('Pre-heating dialog: Warm (40°C) chip sets target and dispatches setChamberTemp(40)', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Warm (40°C)'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberTempSet, 40.0);
      expect(mockPrinterService.lastChamberContextId, 'c5_ctx');
      expect(mockPrinterService.chamberTempCallCount, 1);
    });

    testWidgets('Pre-heating dialog: ABS/ASA (50°C) chip sets target and dispatches setChamberTemp(50)', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('ABS/ASA (50°C)'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberTempSet, 50.0);
      expect(mockPrinterService.lastChamberContextId, 'c5_ctx');
      expect(mockPrinterService.chamberTempCallCount, 1);
    });

    testWidgets('Pre-heating dialog: Nylon/PC (60°C) chip sets target and dispatches setChamberTemp(60)', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Nylon/PC (60°C)'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberTempSet, 60.0);
      expect(mockPrinterService.lastChamberContextId, 'c5_ctx');
      expect(mockPrinterService.chamberTempCallCount, 1);
    });

    testWidgets('Pre-heating dialog: Manual custom input 55°C dispatches setChamberTemp(55)', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '55');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberTempSet, 55.0);
      expect(mockPrinterService.lastChamberContextId, 'c5_ctx');
      expect(mockPrinterService.chamberTempCallCount, 1);
    });

    testWidgets('Pre-heating dialog: Setting 0°C via Off chip calls setChamberOff', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Off (0°C)'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(mockPrinterService.lastChamberOffCalled, true);
      expect(mockPrinterService.lastChamberOffContextId, 'c5_ctx');
      expect(mockPrinterService.chamberOffCallCount, 1);
    });

    testWidgets('Pre-heating dialog: Adversarial inputs exceeding maxChamberTemp (85°C > 80°C) are blocked', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '85');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(find.text('Set Chamber Temperature'), findsOneWidget);
      expect(mockPrinterService.chamberTempCallCount, 0);

      await tester.enterText(find.byType(TextField), '80');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();

      expect(find.text('Set Chamber Temperature'), findsNothing);
      expect(mockPrinterService.lastChamberTempSet, 80.0);
      expect(mockPrinterService.chamberTempCallCount, 1);
    });

    testWidgets('Pre-heating dialog: Adversarial inputs (negative, non-numeric) are blocked', (WidgetTester tester) async {
      await tester.pumpWidget(buildC5Card());

      await tester.tap(find.byKey(const Key('temp_row_chamber')));
      await tester.pumpAndSettle();

      // Negative value
      await tester.enterText(find.byType(TextField), '-10');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();
      expect(find.text('Set Chamber Temperature'), findsOneWidget);
      expect(mockPrinterService.chamberTempCallCount, 0);

      // Non-numeric value
      await tester.enterText(find.byType(TextField), 'invalid');
      await tester.tap(find.text('Set Target'));
      await tester.pumpAndSettle();
      expect(find.text('Set Chamber Temperature'), findsOneWidget);
      expect(mockPrinterService.chamberTempCallCount, 0);

      // Cancel button dismisses without dispatching
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Set Chamber Temperature'), findsNothing);
      expect(mockPrinterService.chamberTempCallCount, 0);
      expect(mockPrinterService.chamberOffCallCount, 0);
    });
  });

  group('Adversarial Stress Test: Dynamic State Transitions & Context Switching', () {
    testWidgets('Dynamic switching from Creator 5 Pro to A1 Mini removes Chamber row immediately', (WidgetTester tester) async {
      final c5Status = createTestStatus(chamberTemperature: 0.0, chamberTargetTemperature: 0.0);
      final a1Status = createTestStatus(chamberTemperature: null, chamberTargetTemperature: null);

      final telemetryNotifier = TestTelemetryNotifier(
        TelemetryState(
          isLoading: false,
          status: c5Status,
          features: const PrinterFeatures(
            hasCamera: false,
            hasLED: true,
            hasFiltration: false,
            hasMaterialStation: false,
            canPause: true,
            canResume: true,
            canCancel: true,
            ledUsesLegacyAPI: false,
            capabilities: PrinterNetworkCapabilities(hasChamberHeater: true, maxChamberTemp: 80.0),
          ),
        ),
      );

      late TestPrinterContextNotifier contextNotifier;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            printerServiceProvider.overrideWithValue(mockPrinterService),
            printerContextProvider.overrideWith((ref) {
              contextNotifier = TestPrinterContextNotifier(
                ref,
                const PrinterContextState(
                  contexts: [c5Context, a1Context],
                  activeContextId: 'c5_ctx',
                ),
              );
              return contextNotifier;
            }),
            telemetryProvider.overrideWith((ref) => telemetryNotifier),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      // Initially Creator 5 Pro -> Chamber row is visible
      expect(find.byKey(const Key('temp_row_chamber')), findsOneWidget);

      // Switch context to A1 Mini and update telemetry
      contextNotifier.setState(const PrinterContextState(
        contexts: [c5Context, a1Context],
        activeContextId: 'a1_ctx',
      ));
      telemetryNotifier.updateState(
        TelemetryState(
          isLoading: false,
          status: a1Status,
          features: const PrinterFeatures(
            hasCamera: false,
            hasLED: true,
            hasFiltration: false,
            hasMaterialStation: false,
            canPause: true,
            canResume: true,
            canCancel: true,
            ledUsesLegacyAPI: false,
            capabilities: PrinterNetworkCapabilities(hasChamberHeater: false),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Now Chamber row should be completely gone
      expect(find.byKey(const Key('temp_row_chamber')), findsNothing);

      // Switch back to Creator 5 Pro
      contextNotifier.setState(const PrinterContextState(
        contexts: [c5Context, a1Context],
        activeContextId: 'c5_ctx',
      ));
      telemetryNotifier.updateState(
        TelemetryState(
          isLoading: false,
          status: c5Status,
          features: const PrinterFeatures(
            hasCamera: false,
            hasLED: true,
            hasFiltration: false,
            hasMaterialStation: false,
            canPause: true,
            canResume: true,
            canCancel: true,
            ledUsesLegacyAPI: false,
            capabilities: PrinterNetworkCapabilities(hasChamberHeater: true, maxChamberTemp: 80.0),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Chamber row is back
      expect(find.byKey(const Key('temp_row_chamber')), findsOneWidget);
    });

    testWidgets('Chamber temperature telemetry updates from 0°C to 45°C dynamically', (WidgetTester tester) async {
      final initialStatus = createTestStatus(chamberTemperature: 0.0, chamberTargetTemperature: 50.0);
      final heatedStatus = createTestStatus(chamberTemperature: 45.0, chamberTargetTemperature: 50.0);

      final telemetryNotifier = TestTelemetryNotifier(
        TelemetryState(
          isLoading: false,
          status: initialStatus,
          features: const PrinterFeatures(
            hasCamera: false,
            hasLED: true,
            hasFiltration: false,
            hasMaterialStation: false,
            canPause: true,
            canResume: true,
            canCancel: true,
            ledUsesLegacyAPI: false,
            capabilities: PrinterNetworkCapabilities(hasChamberHeater: true, maxChamberTemp: 80.0),
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
            telemetryProvider.overrideWith((ref) => telemetryNotifier),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: TemperatureCard(),
            ),
          ),
        ),
      );

      expect(find.text('0°C'), findsWidgets);
      expect(find.text(' / 50°C'), findsOneWidget);

      // Telemetry update received
      telemetryNotifier.updateStatus(heatedStatus);
      await tester.pump();

      expect(find.text('45°C'), findsOneWidget);
      expect(find.text(' / 50°C'), findsOneWidget);
    });
  });
}

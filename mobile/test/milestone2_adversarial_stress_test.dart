import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yourprinter/services/preferences_service.dart';
import 'package:yourprinter/services/printer_service.dart';
import 'package:yourprinter/core/network/api_client.dart';
import 'package:yourprinter/state/auth_provider.dart';
import 'package:yourprinter/state/telemetry_provider.dart';
import 'package:yourprinter/state/printer_context_provider.dart';
import 'package:yourprinter/models/printer_status.dart';
import 'package:yourprinter/models/printer_context.dart';
import 'package:yourprinter/models/printer_capabilities.dart';
import 'package:yourprinter/models/printer_features.dart';
import 'package:yourprinter/ui/controls/control_panel_card.dart';

class MockPrinterService extends PrinterService {
  MockPrinterService() : super(apiClient: ApiClient(baseUrl: 'http://127.0.0.1:3000'));

  int? lastSpeedSet;
  String? lastSpeedContextId;
  int speedCallCount = 0;

  int? lastFanSet;
  String? lastFanContextId;
  int fanCallCount = 0;

  void reset() {
    lastSpeedSet = null;
    lastSpeedContextId = null;
    speedCallCount = 0;
    lastFanSet = null;
    lastFanContextId = null;
    fanCallCount = 0;
  }

  @override
  Future<bool> setPrintSpeed(int speedPercent, {String? contextId}) async {
    lastSpeedSet = speedPercent;
    lastSpeedContextId = contextId;
    speedCallCount++;
    return true;
  }

  @override
  Future<bool> setFanSpeed(int fanPercent, {String? contextId}) async {
    lastFanSet = fanPercent;
    lastFanContextId = contextId;
    fanCallCount++;
    return true;
  }

  @override
  Future<bool> setCoolingFanSpeed(int fanPercent, {String? contextId}) =>
      setFanSpeed(fanPercent, contextId: contextId);
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

const c5Context = PrinterContext(
  contextId: 'c5_ctx',
  name: 'Creator 5 Pro',
  model: 'FlashForge Creator 5 Pro',
  isConnected: true,
  isSelected: true,
  printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'Creator 5 Pro'),
);

const genericContext = PrinterContext(
  contextId: 'generic_ctx',
  name: 'Adventurer 5M',
  model: 'AD5M',
  isConnected: true,
  isSelected: true,
  printerDetails: PrinterDetails(ipAddress: '127.0.0.1', model: 'AD5M'),
);

PrinterStatusData createStatus({
  String printerState = 'idle',
  double printSpeed = 100.0,
  double coolingFanSpeed = 0.0,
}) {
  return PrinterStatusData(
    printerState: printerState,
    printSpeed: printSpeed,
    coolingFanSpeed: coolingFanSpeed,
    bedTemperature: 25.0,
    bedTargetTemperature: 0.0,
    nozzleTemperature: 25.0,
    nozzleTargetTemperature: 0.0,
    progress: 0.0,
    currentLayer: 0,
    totalLayers: 0,
  );
}

PrinterFeatures createFeatures({PrinterNetworkCapabilities? capabilities}) {
  return PrinterFeatures(
    hasCamera: false,
    hasLED: true,
    hasFiltration: false,
    hasMaterialStation: false,
    canPause: true,
    canResume: true,
    canCancel: true,
    ledUsesLegacyAPI: false,
    capabilities: capabilities,
  );
}

Widget buildTestHarness({
  required PreferencesService prefs,
  required MockPrinterService printerService,
  required TelemetryState telemetryState,
  PrinterContext context = c5Context,
  Key? cardKey,
}) {
  return ProviderScope(
    key: cardKey != null ? ValueKey('scope_$cardKey') : null,
    overrides: [
      preferencesServiceProvider.overrideWithValue(prefs),
      printerServiceProvider.overrideWithValue(printerService),
      printerContextProvider.overrideWith(
        (ref) => TestPrinterContextNotifier(
          ref,
          PrinterContextState(
            contexts: [context],
            activeContextId: context.contextId,
          ),
        ),
      ),
      telemetryProvider.overrideWith((ref) => TestTelemetryNotifier(telemetryState)),
    ],
    child: MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: ControlPanelCard(key: cardKey)),
      ),
    ),
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

  group('Milestone 2 Stress Test: Fan Slider Boundaries & Steps', () {
    testWidgets('1.1 Boundary 0% fan: slider at 0.0, readout "0%", icon stopped', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true, canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      final slider = tester.widget<Slider>(find.byKey(const Key('fan_speed_slider')));
      expect(slider.value, 0.0);
      expect(slider.min, 0.0);
      expect(slider.max, 100.0);
      expect(slider.divisions, 20);

      expect(find.byKey(const Key('fan_speed_readout')), findsOneWidget);
      expect(find.text('0%'), findsWidgets);
    });

    testWidgets('1.2 Boundary 100% fan: slider at 100.0, readout "100%"', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 100.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true, canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      final slider = tester.widget<Slider>(find.byKey(const Key('fan_speed_slider')));
      expect(slider.value, 100.0);
      expect(find.text('100%'), findsWidgets);

      // Stop fan to prevent teardown timeout
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
    });

    testWidgets('1.3 Adversarial negative fan speed in telemetry clamps cleanly to 0%', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: -50.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true, canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      final slider = tester.widget<Slider>(find.byKey(const Key('fan_speed_slider')));
      expect(slider.value, 0.0);
      expect(find.text('0%'), findsWidgets);
    });

    testWidgets('1.4 Adversarial overflow fan speed (255%) clamps cleanly to 100%', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 255.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true, canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      final slider = tester.widget<Slider>(find.byKey(const Key('fan_speed_slider')));
      expect(slider.value, 100.0);
      expect(find.text('100%'), findsWidgets);

      // Stop fan
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
    });

    testWidgets('1.5 Fractional fan speed (42.7%) rounds to 43%', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 42.7),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true, canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      final slider = tester.widget<Slider>(find.byKey(const Key('fan_speed_slider')));
      expect(slider.value, 43.0);
      expect(find.text('43%'), findsOneWidget);

      // Stop fan
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
    });

    testWidgets('1.6 Dragging slider invokes onChangeEnd with clamped integer and active contextId', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true, canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      final sliderFinder = find.byKey(const Key('fan_speed_slider'));
      await tester.drag(sliderFinder, const Offset(80.0, 0.0));
      await tester.pump(const Duration(milliseconds: 100));

      expect(mockPrinterService.lastFanSet, isNotNull);
      expect(mockPrinterService.lastFanContextId, 'c5_ctx');
      expect(mockPrinterService.fanCallCount, 1);

      // Stop fan
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
    });
  });

  group('Milestone 2 Stress Test: Speed Preset Chips Highlight Tolerance', () {
    // Proximity rule: |currentSpeed - percent| < 10
    // Preset 50: [41..59] selected, 40 and 60 NOT selected
    // Preset 100: [91..109] selected, 90 and 110 NOT selected
    // Preset 140: [131..149] selected, 130 and 150 NOT selected

    Future<void> renderSpeedAndCheck({
      required WidgetTester tester,
      required double speed,
      required bool expect50Selected,
      required bool expect100Selected,
      required bool expect140Selected,
    }) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(printSpeed: speed),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
        cardKey: ValueKey('speed_card_$speed'),
      ));

      bool isChipSelected(int percent) {
        final inkWell = find.byKey(Key('speed_preset_$percent'));
        final container = find.descendant(of: inkWell, matching: find.byType(Container)).first;
        final decoration = tester.widget<Container>(container).decoration as BoxDecoration?;
        final border = decoration?.border as Border?;
        return border?.top.color == const Color(0xFFF59E0B);
      }

      expect(isChipSelected(50), expect50Selected,
          reason: 'Speed $speed: preset 50 selected should be $expect50Selected');
      expect(isChipSelected(100), expect100Selected,
          reason: 'Speed $speed: preset 100 selected should be $expect100Selected');
      expect(isChipSelected(140), expect140Selected,
          reason: 'Speed $speed: preset 140 selected should be $expect140Selected');
    }

    testWidgets('2.1 Tolerance boundary around 50% Quiet preset (40, 41, 50, 59, 60)', (tester) async {
      await renderSpeedAndCheck(tester: tester, speed: 40.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 41.0, expect50Selected: true, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 50.0, expect50Selected: true, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 59.0, expect50Selected: true, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 60.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
    });

    testWidgets('2.2 Tolerance boundary around 100% Standard preset (90, 91, 100, 109, 110)', (tester) async {
      await renderSpeedAndCheck(tester: tester, speed: 90.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 91.0, expect50Selected: false, expect100Selected: true, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 100.0, expect50Selected: false, expect100Selected: true, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 109.0, expect50Selected: false, expect100Selected: true, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 110.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
    });

    testWidgets('2.3 Tolerance boundary around 140% Sport preset (130, 131, 140, 149, 150)', (tester) async {
      await renderSpeedAndCheck(tester: tester, speed: 130.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 131.0, expect50Selected: false, expect100Selected: false, expect140Selected: true);
      await renderSpeedAndCheck(tester: tester, speed: 140.0, expect50Selected: false, expect100Selected: false, expect140Selected: true);
      await renderSpeedAndCheck(tester: tester, speed: 149.0, expect50Selected: false, expect100Selected: false, expect140Selected: true);
      await renderSpeedAndCheck(tester: tester, speed: 150.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
    });

    testWidgets('2.4 Intermediate custom speeds select NO preset chip', (tester) async {
      await renderSpeedAndCheck(tester: tester, speed: 75.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 115.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
      await renderSpeedAndCheck(tester: tester, speed: 125.0, expect50Selected: false, expect100Selected: false, expect140Selected: false);
    });
  });

  group('Milestone 2 Stress Test: Custom Speed Percentage Badge Descriptors', () {
    Future<void> checkBadgeText(WidgetTester tester, double speed, String expectedText) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(printSpeed: speed),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
        cardKey: ValueKey('badge_card_$speed'),
      ));

      final badgeFinder = find.byKey(const Key('control_panel_speed_badge'));
      expect(badgeFinder, findsOneWidget);
      expect(find.descendant(of: badgeFinder, matching: find.text(expectedText)), findsOneWidget,
          reason: 'Speed $speed should render badge text "$expectedText"');
    }

    testWidgets('3.1 Quiet mode boundary: speeds <= 70% get (Quiet) descriptor', (tester) async {
      await checkBadgeText(tester, 20.0, '20% (Quiet)');
      await checkBadgeText(tester, 50.0, '50% (Quiet)');
      await checkBadgeText(tester, 70.0, '70% (Quiet)');
    });

    testWidgets('3.2 Standard mode boundary: 71% <= speed <= 120% get (Standard) descriptor', (tester) async {
      await checkBadgeText(tester, 71.0, '71% (Standard)');
      await checkBadgeText(tester, 100.0, '100% (Standard)');
      // Adversarial challenge: Verify what 115% produces!
      // In WebUI parity: ControlPanelCard.tsx:203 sets <= 120 to (Standard).
      // So 115% is '115% (Standard)'.
      await checkBadgeText(tester, 115.0, '115% (Standard)');
      await checkBadgeText(tester, 120.0, '120% (Standard)');
    });

    testWidgets('3.3 Sport mode boundary: speeds > 120% get (Sport) descriptor', (tester) async {
      await checkBadgeText(tester, 121.0, '121% (Sport)');
      await checkBadgeText(tester, 140.0, '140% (Sport)');
      await checkBadgeText(tester, 200.0, '200% (Sport)');
    });

    testWidgets('3.4 Optimistic speed updates badge immediately on preset tap', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(printSpeed: 100.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(canAdjustSpeed: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      expect(find.text('100% (Standard)'), findsOneWidget);

      // Tap 50% preset
      await tester.tap(find.byKey(const Key('speed_preset_50')));
      await tester.pump();

      // Badge should immediately reflect optimistic speed (50% Quiet)
      expect(find.text('50% (Quiet)'), findsOneWidget);
      expect(mockPrinterService.lastSpeedSet, 50);
      expect(mockPrinterService.lastSpeedContextId, 'c5_ctx');
    });
  });

  group('Milestone 2 Stress Test: Firmware Idle Notice Visibility Conditions', () {
    // Condition: _fanSpeed > 0 && (stateStr == 'ready' || stateStr == 'idle')
    final testCases = <Map<String, dynamic>>[
      {'fan': 0.0, 'state': 'ready', 'visible': false},
      {'fan': 0.0, 'state': 'idle', 'visible': false},
      {'fan': 0.0, 'state': 'printing', 'visible': false},
      {'fan': 0.0, 'state': 'paused', 'visible': false},
      {'fan': 0.0, 'state': 'busy', 'visible': false},
      {'fan': 0.0, 'state': 'error', 'visible': false},
      {'fan': 0.0, 'state': '', 'visible': false},
      {'fan': 25.0, 'state': 'ready', 'visible': true},
      {'fan': 25.0, 'state': 'idle', 'visible': true},
      {'fan': 25.0, 'state': 'READY', 'visible': true}, // Case-insensitivity check
      {'fan': 25.0, 'state': 'IDLE', 'visible': true},  // Case-insensitivity check
      {'fan': 25.0, 'state': 'printing', 'visible': false},
      {'fan': 25.0, 'state': 'PRINTING', 'visible': false},
      {'fan': 25.0, 'state': 'paused', 'visible': false},
      {'fan': 25.0, 'state': 'PAUSED', 'visible': false},
      {'fan': 25.0, 'state': 'busy', 'visible': false},
      {'fan': 25.0, 'state': 'error', 'visible': false},
      {'fan': 25.0, 'state': '', 'visible': false},
      {'fan': 100.0, 'state': 'ready', 'visible': true},
      {'fan': 100.0, 'state': 'idle', 'visible': true},
      {'fan': 100.0, 'state': 'printing', 'visible': false},
    ];

    for (final tc in testCases) {
      final fan = tc['fan'] as double;
      final state = tc['state'] as String;
      final expectedVisible = tc['visible'] as bool;

      testWidgets(
        '4.1 Notice condition: fan=$fan, state="$state" -> ${expectedVisible ? "VISIBLE" : "HIDDEN"}',
        (tester) async {
          final telemetryState = TelemetryState(
            isLoading: false,
            status: createStatus(coolingFanSpeed: fan, printerState: state),
            features: createFeatures(
              capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true),
            ),
          );

          await tester.pumpWidget(buildTestHarness(
            prefs: testPrefs,
            printerService: mockPrinterService,
            telemetryState: telemetryState,
          ));

          if (fan > 0) {
            await tester.pump(const Duration(milliseconds: 100));
          }

          final noticeFinder = find.byKey(const Key('fan_idle_notice'));
          if (expectedVisible) {
            expect(noticeFinder, findsOneWidget,
                reason: 'fan=$fan and state="$state" should show idle notice');
            expect(find.text('Note: Toolhead fans engage when a print job starts.'), findsOneWidget);
          } else {
            expect(noticeFinder, findsNothing,
                reason: 'fan=$fan and state="$state" should NOT show idle notice');
          }

          // Teardown: stop fan animation if active
          if (fan > 0) {
            await tester.tap(find.byKey(const Key('fan_preset_0')));
            await tester.pump(const Duration(milliseconds: 100));
          }
        },
      );
    }

    testWidgets('4.2 Dynamic notice toggle via fan preset taps', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0, printerState: 'idle'),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      expect(find.byKey(const Key('fan_idle_notice')), findsNothing);

      // Tap 50% preset -> notice appears
      await tester.tap(find.byKey(const Key('fan_preset_50')));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('fan_idle_notice')), findsOneWidget);

      // Tap 0% (Off) preset -> notice disappears
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('fan_idle_notice')), findsNothing);
    });
  });

  group('Milestone 2 Stress Test: Animation Safety & Ticker Lifecycle in Widget Tests', () {
    testWidgets('5.1 pumpAndSettle fails when repeating animation is active, pump(duration) succeeds', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 50.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      dynamic caughtError;
      try {
        await tester.pumpAndSettle(
          const Duration(milliseconds: 50),
          EnginePhase.sendSemanticsUpdate,
          const Duration(milliseconds: 200),
        );
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError, isNotNull);
      expect(caughtError.toString(), contains('pumpAndSettle timed out'));

      // In contrast, explicit pump(duration) executes safely without timeout
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('fan_speed_readout')), findsOneWidget);

      // Once fan is stopped (0%), pumpAndSettle succeeds cleanly with no timeout
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('5.2 Fan speed <= 50% uses 2500ms duration, > 50% uses 1000ms duration', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      // Tap 25% preset (<= 50%)
      await tester.tap(find.byKey(const Key('fan_preset_25')));
      await tester.pump(const Duration(milliseconds: 100));

      final fanSection = find.byKey(const Key('part_cooling_fan_section'));
      final rotTransition1 = tester.widget<RotationTransition>(
        find.descendant(of: fanSection, matching: find.byType(RotationTransition)).first,
      );
      final anim1 = rotTransition1.turns;
      expect((anim1 as AnimationController).duration, const Duration(milliseconds: 2500));

      // Tap 75% preset (> 50%)
      await tester.tap(find.byKey(const Key('fan_preset_75')));
      await tester.pump(const Duration(milliseconds: 100));

      final rotTransition2 = tester.widget<RotationTransition>(
        find.descendant(of: fanSection, matching: find.byType(RotationTransition)).first,
      );
      final anim2 = rotTransition2.turns;
      expect((anim2 as AnimationController).duration, const Duration(milliseconds: 1000));

      // Stop fan
      await tester.tap(find.byKey(const Key('fan_preset_0')));
      await tester.pump(const Duration(milliseconds: 100));
    });

    testWidgets('5.3 Widget unmount/teardown while fan is rotating disposes cleanly without assertion', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 75.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      await tester.pump(const Duration(milliseconds: 100));

      // Replace with empty container (triggers dispose while fan is actively repeating)
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SizedBox())));
      await tester.pump(const Duration(milliseconds: 100));

      // Teardown succeeds with zero unhandled exceptions
    });

    testWidgets('5.4 Rapid toggling between 0 and 100% does not throw or desynchronize state', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(hasPartCoolingFan: true),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
      ));

      for (int i = 0; i < 5; i++) {
        await tester.tap(find.byKey(const Key('fan_preset_100')));
        await tester.pump(const Duration(milliseconds: 50));
        await tester.tap(find.byKey(const Key('fan_preset_0')));
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(mockPrinterService.lastFanSet, 0);
      expect(find.text('0%'), findsWidgets);
    });
  });

  group('Milestone 2 Stress Test: Model Pinning & Capability Gating', () {
    testWidgets('6.1 FlashForge Creator 5 Pro pins hasPartCoolingFan true even when capabilities say false', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(
            hasPartCoolingFan: false, // Explicitly false!
            canAdjustSpeed: true,
          ),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
        context: c5Context,
      ));

      expect(find.byKey(const Key('part_cooling_fan_section')), findsOneWidget);
    });

    testWidgets('6.2 Non-Creator 5 printer honors hasPartCoolingFan=false and hides fan section', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(coolingFanSpeed: 0.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(
            hasPartCoolingFan: false,
            canAdjustSpeed: true,
          ),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
        context: genericContext,
      ));

      expect(find.byKey(const Key('part_cooling_fan_section')), findsNothing);
    });

    testWidgets('6.3 canAdjustSpeed=false hides speed controls section', (tester) async {
      final telemetryState = TelemetryState(
        isLoading: false,
        status: createStatus(printSpeed: 100.0),
        features: createFeatures(
          capabilities: const PrinterNetworkCapabilities(
            canAdjustSpeed: false, // Disabled
            hasPartCoolingFan: true,
          ),
        ),
      );

      await tester.pumpWidget(buildTestHarness(
        prefs: testPrefs,
        printerService: mockPrinterService,
        telemetryState: telemetryState,
        context: c5Context,
      ));

      expect(find.byKey(const Key('control_panel_speed_section')), findsNothing);
    });
  });
}

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

void main() {
  late PreferencesService testPrefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    testPrefs = await PreferencesService.create();
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
}

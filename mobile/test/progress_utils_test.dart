import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yourprinter/models/printer_status.dart';
import 'package:yourprinter/services/preferences_service.dart';
import 'package:yourprinter/state/auth_provider.dart';
import 'package:yourprinter/state/telemetry_provider.dart';
import 'package:yourprinter/ui/dashboard/job_progress_card.dart';
import 'package:yourprinter/utils/progress_utils.dart';

class _TestTelemetryNotifier extends TelemetryNotifier {
  _TestTelemetryNotifier(TelemetryState initialState, Ref ref) : super(ref) {
    state = initialState;
  }

  @override
  Future<void> fetchStatus({String? contextId}) async {}
}

void main() {
  group('progress_utils', () {
    test('normalizeProgressPercent preserves 1% integer and scales < 1.0 decimals', () {
      expect(normalizeProgressPercent(1.0), 1.0);
      expect(normalizeProgressPercent(0.42), closeTo(42.0, 0.001));
      expect(normalizeProgressPercent(150.0), 100.0);
      expect(normalizeProgressPercent(-5.0), 0.0);
      expect(normalizeProgressPercent(null, isCompleted: true), 100.0);
      expect(normalizeProgressPercent(99.0, isCompleted: true), 100.0);
    });

    test('formatRemainingMinutes renders multi-hour timeRemaining correctly', () {
      expect(formatRemainingMinutes(480), '8h 0m left');
      expect(formatRemainingMinutes(125), '2h 5m left');
      expect(formatRemainingMinutes(45), '45m left');
      expect(formatRemainingMinutes(0), '< 1m left');
    });

    test('formatDurationSeconds renders elapsed seconds cleanly', () {
      expect(formatDurationSeconds(0), '--');
      expect(formatDurationSeconds(95), '1m 35s');
      expect(formatDurationSeconds(7260), '2h 1m');
    });
  });

  group('JobProgressCard remaining/elapsed unit rendering', () {
    testWidgets('renders 480 minutes remaining as 8h 0m left instead of 8m left', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final testPrefs = PreferencesService(prefs);

      const mockStatus = PrinterStatusData(
        printerState: 'Printing',
        progress: 1.0,
        currentLayer: 2,
        totalLayers: 400,
        jobName: 'multi_hour_print.gcode',
        timeRemaining: 480,
        timeElapsed: 5,
        elapsedTimeSeconds: 0,
        bedTemperature: 60.0,
        bedTargetTemperature: 60.0,
        nozzleTemperature: 220.0,
        nozzleTargetTemperature: 220.0,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            preferencesServiceProvider.overrideWithValue(testPrefs),
            telemetryProvider.overrideWith((ref) => _TestTelemetryNotifier(
                  const TelemetryState(isLoading: false, status: mockStatus),
                  ref,
                )),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: JobProgressCard(),
            ),
          ),
        ),
      );

      expect(find.text('1.0%'), findsOneWidget);
      expect(find.text('8h 0m left'), findsOneWidget);
      expect(find.text('8m left'), findsNothing);
      expect(find.text('5m 0s'), findsOneWidget);
    });
  });
}

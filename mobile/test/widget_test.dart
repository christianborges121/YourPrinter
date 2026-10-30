import 'package:flutter_test/flutter_test.dart';
import 'package:yourprinter/models/printer_status.dart';

void main() {
  group('Watchdog Models & Snapshot Tests', () {
    test('WatchdogStatusData parses properly with defect trigger', () {
      final json = {
        'online': true,
        'state': 'monitoring',
        'confidence': 0.85,
        'threshold': 0.20,
        'auto_pause_enabled': true,
        'auto_pause_triggered': true,
        'consecutive_failures': 3,
        'check_interval_sec': 15,
      };

      final data = WatchdogStatusData.fromJson(json);
      expect(data.online, isTrue);
      expect(data.state, 'monitoring');
      expect(data.confidence, 0.85);
      expect(data.threshold, 0.20);
      expect(data.autoPauseEnabled, isTrue);
      expect(data.autoPauseTriggered, isTrue);
      expect(data.consecutiveFailures, 3);
      expect(data.checkIntervalSec, 15);
    });

    test('WatchdogSnapshotItem parses properly with layer and confidence', () {
      final json = {
        'filename': 'snap_001.jpg',
        'timestamp': '2026-10-28T12:00:00Z',
        'confidence': 0.75,
        'layer': '42',
      };

      final item = WatchdogSnapshotItem.fromJson(json);
      expect(item.filename, 'snap_001.jpg');
      expect(item.timestamp, '2026-10-28T12:00:00Z');
      expect(item.confidence, 0.75);
      expect(item.layer, '42');
    });
  });
}

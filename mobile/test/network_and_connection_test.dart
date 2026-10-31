import 'package:flutter_test/flutter_test.dart';
import 'package:yourprinter/core/network/api_client.dart';

void main() {
  group('Network & WebSocket URL Tests', () {
    test('buildWebSocketUrl correctly preserves query string without percent-encoding question mark', () {
      final client = ApiClient(baseUrl: 'http://192.168.1.100:3000');
      final wsUrl = client.buildWebSocketUrl('/api/go2rtc/api/ws?src=creator5');

      // Crucial test: must contain '?src=creator5' and NOT '%3Fsrc=creator5'
      expect(wsUrl, contains('?src=creator5'));
      expect(wsUrl, isNot(contains('%3F')));
      expect(wsUrl, equals('ws://192.168.1.100:3000/api/go2rtc/api/ws?src=creator5'));
    });

    test('buildWebSocketUrl correctly handles https and wss schemes', () {
      final client = ApiClient(baseUrl: 'https://yp.internal:8443');
      final wsUrl = client.buildWebSocketUrl('/api/ws?src=a1mini');

      expect(wsUrl, startsWith('wss://yp.internal:8443/api/ws?src=a1mini'));
    });

    test('buildWebSocketUrl appends authToken token query param if set', () {
      final client = ApiClient(baseUrl: 'http://192.168.1.100:3000', authToken: 'secret123');
      final wsUrl = client.buildWebSocketUrl('/api/go2rtc/api/ws?src=creator5');

      expect(wsUrl, contains('src=creator5'));
      expect(wsUrl, contains('token=secret123'));
    });
  });
}

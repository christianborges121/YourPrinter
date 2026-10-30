import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../models/material_station.dart';
import '../../models/printer_status.dart';
import 'api_client.dart';

typedef StatusUpdateCallback = void Function(PrinterStatusData status);
typedef SpoolmanUpdateCallback = void Function(String contextId, ActiveSpoolData? spool);
typedef ConnectionChangeCallback = void Function(bool connected);

class WebSocketClient {
  final ApiClient apiClient;

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  bool _isConnected = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  bool _manualDisconnect = false;

  final List<StatusUpdateCallback> _statusCallbacks = [];
  final List<SpoolmanUpdateCallback> _spoolmanCallbacks = [];
  final List<ConnectionChangeCallback> _connectionCallbacks = [];

  WebSocketClient({required this.apiClient});

  bool get isConnected => _isConnected;

  void addStatusListener(StatusUpdateCallback callback) => _statusCallbacks.add(callback);
  void removeStatusListener(StatusUpdateCallback callback) => _statusCallbacks.remove(callback);

  void addSpoolmanListener(SpoolmanUpdateCallback callback) => _spoolmanCallbacks.add(callback);
  void removeSpoolmanListener(SpoolmanUpdateCallback callback) => _spoolmanCallbacks.remove(callback);

  void addConnectionListener(ConnectionChangeCallback callback) => _connectionCallbacks.add(callback);
  void removeConnectionListener(ConnectionChangeCallback callback) => _connectionCallbacks.remove(callback);

  void connect() {
    _manualDisconnect = false;
    _cleanupSocket();

    try {
      final wsUrl = apiClient.buildWebSocketUrl('/ws');
      debugPrint('[WebSocket] Connecting to $wsUrl');

      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

      _subscription = _channel!.stream.listen(
        (dynamic event) {
          if (!_isConnected) {
            _setConnected(true);
            _reconnectAttempts = 0;
            _startPingTimer();
            // Request fresh status snapshot immediately on connect
            sendCommand({'command': 'REQUEST_STATUS'});
          }

          if (event is String) {
            _handleMessage(event);
          }
        },
        onError: (dynamic error) {
          debugPrint('[WebSocket] Error: $error');
          _handleDisconnect();
        },
        onDone: () {
          debugPrint('[WebSocket] Connection closed');
          _handleDisconnect();
        },
      );
    } catch (e) {
      debugPrint('[WebSocket] Connection exception: $e');
      _handleDisconnect();
    }
  }

  void _handleMessage(String rawJson) {
    try {
      final Map<String, dynamic> msg = jsonDecode(rawJson);
      final String? type = msg['type'] as String?;

      switch (type) {
        case 'AUTH_SUCCESS':
          debugPrint('[WebSocket] Authenticated client: ${msg['clientId']}');
          sendCommand({'command': 'REQUEST_STATUS'});
          break;

        case 'STATUS_UPDATE':
          if (msg['status'] != null) {
            final status = PrinterStatusData.fromJson(msg['status'] as Map<String, dynamic>);
            for (final cb in _statusCallbacks) {
              cb(status);
            }
          }
          break;

        case 'SPOOLMAN_UPDATE':
          final contextId = msg['contextId'] as String?;
          final spoolJson = msg['spool'] as Map<String, dynamic>?;
          if (contextId != null) {
            final spool = spoolJson != null ? ActiveSpoolData.fromJson(spoolJson) : null;
            for (final cb in _spoolmanCallbacks) {
              cb(contextId, spool);
            }
          }
          break;

        case 'PONG':
          break;

        case 'ERROR':
          debugPrint('[WebSocket] Server reported error: ${msg['error']}');
          break;
      }
    } catch (e) {
      debugPrint('[WebSocket] Failed to parse message: $e');
    }
  }

  void sendCommand(Map<String, dynamic> command) {
    if (_channel != null && _isConnected) {
      _channel!.sink.add(jsonEncode(command));
    }
  }

  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_isConnected) {
        sendCommand({'command': 'PING'});
      }
    });
  }

  void _setConnected(bool connected) {
    if (_isConnected != connected) {
      _isConnected = connected;
      for (final cb in _connectionCallbacks) {
        cb(connected);
      }
    }
  }

  void _handleDisconnect() {
    _setConnected(false);
    _cleanupSocket();

    if (!_manualDisconnect && _reconnectAttempts < _maxReconnectAttempts) {
      _reconnectAttempts++;
      final delaySeconds = (_reconnectAttempts * 2).clamp(2, 20);
      debugPrint('[WebSocket] Reconnecting in $delaySeconds seconds (attempt $_reconnectAttempts)...');
      _reconnectTimer?.cancel();
      _reconnectTimer = Timer(Duration(seconds: delaySeconds), () => connect());
    }
  }

  void _cleanupSocket() {
    _pingTimer?.cancel();
    _pingTimer = null;
    _subscription?.cancel();
    _subscription = null;
    _channel?.sink.close();
    _channel = null;
  }

  void disconnect() {
    _manualDisconnect = true;
    _reconnectTimer?.cancel();
    _setConnected(false);
    _cleanupSocket();
  }
}

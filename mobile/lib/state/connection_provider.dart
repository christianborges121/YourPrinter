import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/constants/api_endpoints.dart';
import 'auth_provider.dart';
import 'fleet_provider.dart';
import 'printer_context_provider.dart';

enum ServerConnectionStatus {
  initial,
  checking,
  connected,
  unreachable,
}

class ConnectionState {
  final ServerConnectionStatus status;
  final String serverUrl;
  final String? errorMessage;
  final bool isConnecting;

  const ConnectionState({
    this.status = ServerConnectionStatus.initial,
    required this.serverUrl,
    this.errorMessage,
    this.isConnecting = false,
  });

  ConnectionState copyWith({
    ServerConnectionStatus? status,
    String? serverUrl,
    String? errorMessage,
    bool? isConnecting,
  }) {
    return ConnectionState(
      status: status ?? this.status,
      serverUrl: serverUrl ?? this.serverUrl,
      errorMessage: errorMessage,
      isConnecting: isConnecting ?? this.isConnecting,
    );
  }
}

class ConnectionNotifier extends StateNotifier<ConnectionState> {
  final Ref _ref;

  ConnectionNotifier(this._ref)
      : super(ConnectionState(
          serverUrl: _ref.read(preferencesServiceProvider).getServerUrl(),
        ));

  void markConnected() {
    if (state.status != ServerConnectionStatus.connected) {
      state = state.copyWith(
        status: ServerConnectionStatus.connected,
        errorMessage: null,
        isConnecting: false,
      );
    }
  }

  void markUnreachable(String error) {
    if (state.status != ServerConnectionStatus.unreachable || state.errorMessage != error) {
      state = state.copyWith(
        status: ServerConnectionStatus.unreachable,
        errorMessage: error,
        isConnecting: false,
      );
    }
  }

  Future<bool> checkCurrentConnection({bool silent = false}) async {
    if (!silent) {
      state = state.copyWith(
        status: ServerConnectionStatus.checking,
        isConnecting: true,
        errorMessage: null,
      );
    }

    try {
      final printerService = _ref.read(printerServiceProvider);
      final isUp = await printerService.checkConnection();

      if (isUp) {
        state = state.copyWith(
          status: ServerConnectionStatus.connected,
          isConnecting: false,
          errorMessage: null,
        );
        return true;
      } else {
        state = state.copyWith(
          status: ServerConnectionStatus.unreachable,
          isConnecting: false,
          errorMessage: 'Server at ${state.serverUrl} responded with an error or is unreachable.',
        );
        return false;
      }
    } catch (e) {
      state = state.copyWith(
        status: ServerConnectionStatus.unreachable,
        isConnecting: false,
        errorMessage: _formatErrorMessage(e, state.serverUrl),
      );
      return false;
    }
  }

  Future<({bool success, String message})> testAndSaveServerUrl(String rawUrl) async {
    var trimmed = rawUrl.trim();
    if (trimmed.isEmpty) {
      return (success: false, message: 'Server URL cannot be empty.');
    }

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'http://$trimmed';
    }

    if (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }

    state = state.copyWith(isConnecting: true, errorMessage: null);

    try {
      final testDio = Dio(BaseOptions(
        baseUrl: trimmed,
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
        headers: {'Accept': 'application/json'},
      ));

      // Test auth status or status endpoint
      final testRes = await testDio.get(ApiEndpoints.authStatus);
      if (testRes.statusCode != null && testRes.statusCode! >= 200 && testRes.statusCode! < 400) {
        // Success! Save to preferences and update clients
        final prefs = _ref.read(preferencesServiceProvider);
        final apiClient = _ref.read(apiClientProvider);

        await prefs.setServerUrl(trimmed);
        apiClient.updateConfig(baseUrl: trimmed, authToken: prefs.getAuthToken());

        state = state.copyWith(
          status: ServerConnectionStatus.connected,
          serverUrl: trimmed,
          isConnecting: false,
          errorMessage: null,
        );

        // Refresh all providers
        _ref.read(webSocketClientProvider).connect();
        await _ref.read(authProvider.notifier).checkAuthStatus();
        await _ref.read(printerContextProvider.notifier).fetchContexts();
        await _ref.read(fleetProvider.notifier).fetchOverview();

        return (success: true, message: 'Connected to YourPrinter server at $trimmed');
      } else {
        final err = 'Server returned unexpected status code: ${testRes.statusCode}';
        state = state.copyWith(
          status: ServerConnectionStatus.unreachable,
          serverUrl: trimmed,
          isConnecting: false,
          errorMessage: err,
        );
        return (success: false, message: err);
      }
    } catch (e) {
      final err = _formatErrorMessage(e, trimmed);
      state = state.copyWith(
        status: ServerConnectionStatus.unreachable,
        serverUrl: trimmed,
        isConnecting: false,
        errorMessage: err,
      );
      return (success: false, message: err);
    }
  }

  String _formatErrorMessage(dynamic error, String url) {
    if (error is DioException) {
      if (error.type == DioExceptionType.connectionTimeout || error.type == DioExceptionType.receiveTimeout) {
        return 'Connection timed out trying to reach $url. Verify the IP address, port, and your network connection.';
      }
      if (error.type == DioExceptionType.connectionError) {
        return 'Connection refused at $url. Ensure YourPrinter server is running and WebUI is enabled.';
      }
      return 'Network error: ${error.message ?? error.toString()}';
    }
    return error.toString();
  }
}

final connectionProvider = StateNotifierProvider<ConnectionNotifier, ConnectionState>((ref) {
  return ConnectionNotifier(ref);
});

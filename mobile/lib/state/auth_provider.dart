import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/api_client.dart';
import '../core/network/websocket_client.dart';
import '../services/preferences_service.dart';
import '../services/printer_service.dart';
import 'fleet_provider.dart';
import 'printer_context_provider.dart';

final preferencesServiceProvider = Provider<PreferencesService>((ref) {
  throw UnimplementedError('Initialize preferencesServiceProvider in main');
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final prefs = ref.watch(preferencesServiceProvider);
  return ApiClient(
    baseUrl: prefs.getServerUrl(),
    authToken: prefs.getAuthToken(),
  );
});

final webSocketClientProvider = Provider<WebSocketClient>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final client = WebSocketClient(apiClient: apiClient);
  ref.onDispose(() => client.disconnect());
  return client;
});

final printerServiceProvider = Provider<PrinterService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return PrinterService(apiClient: apiClient);
});

class AuthState {
  final bool isLoading;
  final bool isAuthenticated;
  final bool authRequired;
  final String? error;

  const AuthState({
    this.isLoading = false,
    this.isAuthenticated = false,
    this.authRequired = false,
    this.error,
  });

  AuthState copyWith({
    bool? isLoading,
    bool? isAuthenticated,
    bool? authRequired,
    String? error,
  }) {
    return AuthState(
      isLoading: isLoading ?? this.isLoading,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      authRequired: authRequired ?? this.authRequired,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final Ref _ref;

  AuthNotifier(this._ref) : super(const AuthState());

  Future<void> checkAuthStatus() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final printerService = _ref.read(printerServiceProvider);
      final prefs = _ref.read(preferencesServiceProvider);
      final authStatus = await printerService.getAuthStatus();

      final savedToken = prefs.getAuthToken();
      final isAuthenticated = !authStatus.authRequired || (savedToken != null && savedToken.isNotEmpty);

      state = state.copyWith(
        isLoading: false,
        authRequired: authStatus.authRequired,
        isAuthenticated: isAuthenticated,
      );

      if (isAuthenticated) {
        _ref.read(webSocketClientProvider).connect();
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> login(String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final printerService = _ref.read(printerServiceProvider);
      final prefs = _ref.read(preferencesServiceProvider);
      final apiClient = _ref.read(apiClientProvider);

      final res = await printerService.login(password);
      if (res.success && res.token != null) {
        await prefs.setAuthToken(res.token);
        apiClient.updateConfig(baseUrl: apiClient.baseUrl, authToken: res.token);
        state = state.copyWith(isLoading: false, isAuthenticated: true);
        _ref.read(webSocketClientProvider).connect();
        return true;
      } else {
        state = state.copyWith(isLoading: false, error: res.error ?? res.message ?? 'Login failed');
        return false;
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<void> updateServerUrl(String newUrl) async {
    final prefs = _ref.read(preferencesServiceProvider);
    final apiClient = _ref.read(apiClientProvider);

    await prefs.setServerUrl(newUrl);
    apiClient.updateConfig(baseUrl: newUrl, authToken: prefs.getAuthToken());

    await checkAuthStatus();
    await _ref.read(printerContextProvider.notifier).fetchContexts();
    await _ref.read(fleetProvider.notifier).fetchOverview();
  }

  Future<void> logout() async {
    final prefs = _ref.read(preferencesServiceProvider);
    final apiClient = _ref.read(apiClientProvider);

    await prefs.setAuthToken(null);
    apiClient.updateConfig(baseUrl: apiClient.baseUrl, authToken: null);
    _ref.read(webSocketClientProvider).disconnect();

    state = state.copyWith(isAuthenticated: false);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});

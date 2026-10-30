import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/printer_context.dart';
import 'auth_provider.dart';
import 'camera_provider.dart';
import 'connection_provider.dart';
import 'telemetry_provider.dart';

class PrinterContextState {
  final bool isLoading;
  final List<PrinterContext> contexts;
  final String? activeContextId;
  final String? error;

  const PrinterContextState({
    this.isLoading = false,
    this.contexts = const [],
    this.activeContextId,
    this.error,
  });

  PrinterContext? get activeContext {
    if (activeContextId == null) return null;
    try {
      return contexts.firstWhere((c) => c.contextId == activeContextId);
    } catch (_) {
      return null;
    }
  }

  PrinterContextState copyWith({
    bool? isLoading,
    List<PrinterContext>? contexts,
    String? activeContextId,
    String? error,
  }) {
    return PrinterContextState(
      isLoading: isLoading ?? this.isLoading,
      contexts: contexts ?? this.contexts,
      activeContextId: activeContextId ?? this.activeContextId,
      error: error,
    );
  }
}

class PrinterContextNotifier extends StateNotifier<PrinterContextState> {
  final Ref _ref;

  PrinterContextNotifier(this._ref) : super(const PrinterContextState());

  Future<void> fetchContexts() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final printerService = _ref.read(printerServiceProvider);
      final prefs = _ref.read(preferencesServiceProvider);
      final contexts = await printerService.getContexts();

      String? activeId = state.activeContextId;
      if (activeId == null || !contexts.any((c) => c.contextId == activeId)) {
        final lastSaved = prefs.getLastContextId();
        if (lastSaved != null && contexts.any((c) => c.contextId == lastSaved)) {
          activeId = lastSaved;
        } else if (contexts.isNotEmpty) {
          activeId = contexts.first.contextId;
        }
      }

      state = state.copyWith(
        isLoading: false,
        contexts: contexts,
        activeContextId: activeId,
      );

      _ref.read(connectionProvider.notifier).markConnected();

      if (activeId != null) {
        await _ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      if (state.contexts.isEmpty) {
        _ref.read(connectionProvider.notifier).markUnreachable(e.toString());
      }
    }
  }

  Future<void> switchContext(String newContextId) async {
    if (state.activeContextId == newContextId) return;

    // 1. Trigger immediate loading animations and wipe stale telemetry
    _ref.read(telemetryProvider.notifier).resetForContextSwitch();
    _ref.read(cameraStreamServiceProvider).showConnectingState();

    state = state.copyWith(activeContextId: newContextId);

    try {
      final printerService = _ref.read(printerServiceProvider);
      final prefs = _ref.read(preferencesServiceProvider);

      await prefs.setLastContextId(newContextId);
      await printerService.switchContext(newContextId);

      // 2. Fetch fresh telemetry for the target printer
      await _ref.read(telemetryProvider.notifier).fetchStatus(contextId: newContextId);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

final printerContextProvider = StateNotifierProvider<PrinterContextNotifier, PrinterContextState>((ref) {
  return PrinterContextNotifier(ref);
});

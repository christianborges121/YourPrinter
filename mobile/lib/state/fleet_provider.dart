import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/printer_context.dart';
import 'auth_provider.dart';
import 'connection_provider.dart';

class FleetState {
  final bool isLoading;
  final List<FleetOverviewPrinter> printers;
  final Map<String, String> cameraErrors; // printerName -> error message
  final String? error;

  const FleetState({
    this.isLoading = false,
    this.printers = const [],
    this.cameraErrors = const {},
    this.error,
  });

  FleetState copyWith({
    bool? isLoading,
    List<FleetOverviewPrinter>? printers,
    Map<String, String>? cameraErrors,
    String? error,
  }) {
    return FleetState(
      isLoading: isLoading ?? this.isLoading,
      printers: printers ?? this.printers,
      cameraErrors: cameraErrors ?? this.cameraErrors,
      error: error,
    );
  }
}

class FleetNotifier extends StateNotifier<FleetState> {
  final Ref _ref;
  Timer? _pollTimer;

  FleetNotifier(this._ref) : super(const FleetState()) {
    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => fetchOverview(silent: true));
  }

  Future<void> fetchOverview({bool silent = false}) async {
    if (!silent) {
      state = state.copyWith(isLoading: true, error: null);
    }
    try {
      final printerService = _ref.read(printerServiceProvider);
      final printers = await printerService.getFleetOverview();
      state = state.copyWith(isLoading: false, printers: printers);
      _ref.read(connectionProvider.notifier).markConnected();
    } catch (e) {
      if (!silent) {
        state = state.copyWith(isLoading: false, error: e.toString());
      }
      if (state.printers.isEmpty) {
        _ref.read(connectionProvider.notifier).markUnreachable(e.toString());
      }
    }
  }

  void setCardCameraError(String printerName, String errorMessage) {
    final updated = Map<String, String>.from(state.cameraErrors);
    updated[printerName] = errorMessage;
    state = state.copyWith(cameraErrors: updated);
  }

  void clearCardCameraError(String printerName) {
    final updated = Map<String, String>.from(state.cameraErrors);
    updated.remove(printerName);
    state = state.copyWith(cameraErrors: updated);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}

final fleetProvider = StateNotifierProvider<FleetNotifier, FleetState>((ref) {
  return FleetNotifier(ref);
});

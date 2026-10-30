import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/material_station.dart';
import '../models/printer_features.dart';
import '../models/printer_status.dart';
import 'auth_provider.dart';

class TelemetryState {
  final bool isLoading;
  final PrinterStatusData? status;
  final PrinterFeatures? features;
  final MaterialStationStatus? materialStation;
  final ActiveSpoolData? activeSpool;
  final String? error;

  const TelemetryState({
    this.isLoading = false,
    this.status,
    this.features,
    this.materialStation,
    this.activeSpool,
    this.error,
  });

  TelemetryState copyWith({
    bool? isLoading,
    PrinterStatusData? status,
    PrinterFeatures? features,
    MaterialStationStatus? materialStation,
    ActiveSpoolData? activeSpool,
    String? error,
    bool clearStatus = false,
  }) {
    return TelemetryState(
      isLoading: isLoading ?? this.isLoading,
      status: clearStatus ? null : (status ?? this.status),
      features: features ?? this.features,
      materialStation: materialStation ?? this.materialStation,
      activeSpool: activeSpool ?? this.activeSpool,
      error: error,
    );
  }
}

class TelemetryNotifier extends StateNotifier<TelemetryState> {
  final Ref _ref;

  TelemetryNotifier(this._ref) : super(const TelemetryState()) {
    final wsClient = _ref.read(webSocketClientProvider);

    // Register live WebSocket telemetry listener
    wsClient.addStatusListener((newStatus) {
      state = state.copyWith(isLoading: false, status: newStatus);
    });

    // Register live Spoolman listener
    wsClient.addSpoolmanListener((contextId, spool) {
      state = state.copyWith(activeSpool: spool);
    });
  }

  /// Immediately reset telemetry state to loading shimmer during printer swap
  void resetForContextSwitch() {
    state = const TelemetryState(isLoading: true);
  }

  Future<void> fetchStatus({String? contextId}) async {
    try {
      final printerService = _ref.read(printerServiceProvider);
      final status = await printerService.getPrinterStatus(contextId: contextId);
      final features = await printerService.getPrinterFeatures(contextId: contextId);
      final station = await printerService.getMaterialStation(contextId: contextId);

      state = state.copyWith(
        isLoading: false,
        status: status,
        features: features,
        materialStation: station,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void updateStatus(PrinterStatusData newStatus) {
    state = state.copyWith(isLoading: false, status: newStatus);
  }
}

final telemetryProvider = StateNotifierProvider<TelemetryNotifier, TelemetryState>((ref) {
  return TelemetryNotifier(ref);
});

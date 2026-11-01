import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/connection_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';

class DeviceInfoSheet extends ConsumerWidget {
  const DeviceInfoSheet({super.key});

  String _formatLifetimeTime(int? seconds) {
    if (seconds == null || seconds <= 0) return '0h 0m';
    final hrs = seconds ~/ 3600;
    final mins = (seconds % 3600) ~/ 60;
    return '${hrs}h ${mins}m';
  }

  String _formatFilament(double? meters) {
    if (meters == null || meters <= 0) return '0.0 m';
    return '${meters.toStringAsFixed(1)} m';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contextState = ref.watch(printerContextProvider);
    final activeContext = contextState.activeContext;
    final telemetry = ref.watch(telemetryProvider);
    final status = telemetry.status;
    final connState = ref.watch(connectionProvider);
    final isConnected = connState.status == ServerConnectionStatus.connected;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 14,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.borderSubtle,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.accentGreenSubtle,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(LucideIcons.info, size: 18, color: AppColors.accentGreen),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Device Information',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.textPrimary),
                    ),
                    Text(
                      activeContext?.name ?? 'Flashforge Printer',
                      style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(LucideIcons.x, size: 18, color: AppColors.textMuted),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Card 1: Hardware & Device
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceSecondary,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(LucideIcons.cpu, size: 14, color: AppColors.accentGreen),
                    SizedBox(width: 6),
                    Text(
                      'HARDWARE & DEVICE',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textPrimary, letterSpacing: 0.5),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _buildInfoRow('Printer Model', activeContext?.model ?? 'FlashForge Printer'),
                const SizedBox(height: 6),
                _buildInfoRow('Assigned Name', activeContext?.name ?? '--'),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Operational State', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.accentGreenSubtle,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.accentGreen.withValues(alpha: 0.3)),
                      ),
                      child: Text(
                        status?.printerState ?? 'Ready',
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.accentGreen),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Card 2: Lifetime Statistics
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceSecondary,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(LucideIcons.activity, size: 14, color: AppColors.warning),
                    SizedBox(width: 6),
                    Text(
                      'LIFETIME STATISTICS',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textPrimary, letterSpacing: 0.5),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(LucideIcons.clock, size: 12, color: AppColors.accentGreen),
                                SizedBox(width: 4),
                                Text('Total Print Time', style: TextStyle(fontSize: 10, color: AppColors.textMuted)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _formatLifetimeTime(status?.cumulativePrintTime),
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(LucideIcons.scale, size: 12, color: AppColors.info),
                                SizedBox(width: 4),
                                Text('Filament Extruded', style: TextStyle(fontSize: 10, color: AppColors.textMuted)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _formatFilament(status?.cumulativeFilament),
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Card 3: Network & Connectivity
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceSecondary,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(LucideIcons.wifi, size: 14, color: AppColors.info),
                    SizedBox(width: 6),
                    Text(
                      'NETWORK & CONNECTION',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textPrimary, letterSpacing: 0.5),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _buildInfoRow('IP Address', activeContext?.printerDetails.ipAddress ?? '--'),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('WebSocket Stream', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                    Text(
                      isConnected ? 'Connected (Live)' : 'Disconnected',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: isConnected ? AppColors.accentGreen : AppColors.error,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 14),

          // Close button
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close', style: TextStyle(color: AppColors.textPrimary)),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
        Text(
          value,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
        ),
      ],
    );
  }
}

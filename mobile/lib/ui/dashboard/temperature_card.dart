import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';
import '../common/skeleton_shimmer.dart';
import '../controls/temp_setpoint_dialog.dart';

class TemperatureCard extends ConsumerWidget {
  const TemperatureCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final telemetryState = ref.watch(telemetryProvider);
    final activeContext = ref.watch(printerContextProvider).activeContext;
    final printerService = ref.read(printerServiceProvider);

    if (telemetryState.isLoading || telemetryState.status == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            children: [
              SkeletonShimmer(width: double.infinity, height: 32),
              SizedBox(height: 12),
              SkeletonShimmer(width: double.infinity, height: 32),
            ],
          ),
        ),
      );
    }

    final status = telemetryState.status!;
    final bool hasMultipleTools = status.toolTemps.length > 1;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(LucideIcons.thermometer, size: 16, color: AppColors.bedHeat),
                SizedBox(width: 8),
                Text(
                  'Temperatures',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Heated Bed Row
            _buildTempRow(
              context: context,
              icon: LucideIcons.layers,
              iconColor: AppColors.bedHeat,
              label: 'Heated Bed',
              currentTemp: status.bedTemperature,
              targetTemp: status.bedTargetTemperature,
              onTap: () async {
                final target = await showTempSetpointDialog(
                  context: context,
                  title: 'Set Bed Temperature',
                  currentVal: status.bedTargetTemperature,
                  maxTemp: 120,
                );
                if (target != null) {
                  if (target == 0) {
                    await printerService.setBedOff(contextId: activeContext?.contextId);
                  } else {
                    await printerService.setBedTemp(target, contextId: activeContext?.contextId);
                  }
                }
              },
            ),
            const Divider(height: 16),

            // Extruder Rows (Dynamic Tool 0 / Tool 1 for Creator 5 Pro, single for A1 Mini)
            if (hasMultipleTools) ...[
              for (int i = 0; i < status.toolTemps.length; i++) ...[
                if (i > 0) const Divider(height: 16),
                _buildTempRow(
                  context: context,
                  icon: LucideIcons.flame,
                  iconColor: i == 0 ? AppColors.toolheadT0 : AppColors.toolheadT1,
                  label: i == 0 ? 'Extruder (T0 Left)' : 'Extruder (T1 Right)',
                  currentTemp: status.toolTemps[i],
                  targetTemp: i < status.toolTargetTemps.length ? status.toolTargetTemps[i] : 0.0,
                  onTap: () async {
                    final target = await showTempSetpointDialog(
                      context: context,
                      title: 'Set Tool $i Temperature',
                      currentVal: i < status.toolTargetTemps.length ? status.toolTargetTemps[i] : 0.0,
                      maxTemp: 320,
                    );
                    if (target != null) {
                      if (target == 0) {
                        await printerService.setExtruderOff(toolIndex: i, contextId: activeContext?.contextId);
                      } else {
                        await printerService.setExtruderTemp(target, toolIndex: i, contextId: activeContext?.contextId);
                      }
                    }
                  },
                ),
              ],
            ] else ...[
              _buildTempRow(
                context: context,
                icon: LucideIcons.flame,
                iconColor: AppColors.toolheadT0,
                label: 'Extruder',
                currentTemp: status.nozzleTemperature,
                targetTemp: status.nozzleTargetTemperature,
                onTap: () async {
                  final target = await showTempSetpointDialog(
                    context: context,
                    title: 'Set Extruder Temperature',
                    currentVal: status.nozzleTargetTemperature,
                    maxTemp: 320,
                  );
                  if (target != null) {
                    if (target == 0) {
                      await printerService.setExtruderOff(toolIndex: 0, contextId: activeContext?.contextId);
                    } else {
                      await printerService.setExtruderTemp(target, toolIndex: 0, contextId: activeContext?.contextId);
                    }
                  }
                },
              ),
            ],

            // Chamber Row (if supported)
            if (status.chamberTemperature != null && status.chamberTemperature! > 0) ...[
              const Divider(height: 16),
              _buildTempRow(
                context: context,
                icon: LucideIcons.box,
                iconColor: AppColors.chamber,
                label: 'Chamber',
                currentTemp: status.chamberTemperature!,
                targetTemp: status.chamberTargetTemperature ?? 0.0,
                onTap: null,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildTempRow({
    required BuildContext context,
    required IconData icon,
    required Color iconColor,
    required String label,
    required double currentTemp,
    required double targetTemp,
    VoidCallback? onTap,
  }) {
    final bool isHeating = targetTemp > 0 && currentTemp < (targetTemp - 2);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Row(
          children: [
            Icon(icon, size: 16, color: iconColor),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            const Spacer(),
            if (isHeating)
              Container(
                margin: const EdgeInsets.only(right: 6),
                width: 6,
                height: 6,
                decoration: const BoxDecoration(color: AppColors.bedHeat, shape: BoxShape.circle),
              ),
            Text(
              '${currentTemp.toStringAsFixed(0)}\u00B0C',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
            ),
            Text(
              ' / ${targetTemp.toStringAsFixed(0)}\u00B0C',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            if (onTap != null) ...[
              const SizedBox(width: 4),
              const Icon(LucideIcons.chevronRight, size: 14, color: AppColors.textMuted),
            ],
          ],
        ),
      ),
    );
  }
}

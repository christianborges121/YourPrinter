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

    final modelStr = (activeContext?.model ?? '').toLowerCase();
    final nameStr = (activeContext?.name ?? '').toLowerCase();
    final bool isCreator5 = modelStr.contains('creator') ||
        nameStr.contains('creator') ||
        (modelStr.contains('ad5x') && nameStr.contains('c5'));

    final capabilities = telemetryState.features?.capabilities;
    final bool isMultiHead = hasMultipleTools || isCreator5;
    final bool hasChamberHeater = isCreator5 ||
        (capabilities?.hasChamberHeater ??
            (status.chamberTemperature != null && status.chamberTemperature! > 0));
    final double maxChamberTemp =
        capabilities?.maxChamberTemp ?? (isCreator5 ? 80.0 : 60.0);

    final toolColors = [AppColors.toolheadT0, AppColors.toolheadT1, AppColors.warning, AppColors.info];
    String getToolLabel(int i, int total) {
      if (isMultiHead || total > 1) {
        return 'Head ${i + 1}';
      }
      return 'Nozzle';
    }

    final tiles = <Widget>[
      // Heated Bed Tile
      _buildTempRow(
        context: context,
        icon: LucideIcons.layers,
        iconColor: AppColors.bedHeat,
        label: 'Bed',
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

      // Chamber Tile (if supported)
      if (hasChamberHeater)
        _buildTempRow(
          key: const Key('temp_row_chamber'),
          context: context,
          icon: LucideIcons.box,
          iconColor: AppColors.chamber,
          label: 'Chamber',
          currentTemp: status.chamberTemperature ?? 0.0,
          targetTemp: status.chamberTargetTemperature ?? 0.0,
          onTap: () async {
            final target = await showTempSetpointDialog(
              context: context,
              title: 'Set Chamber Temperature',
              currentVal: status.chamberTargetTemperature ?? 0.0,
              maxTemp: maxChamberTemp,
            );
            if (target != null) {
              if (target == 0) {
                await printerService.setChamberOff(contextId: activeContext?.contextId);
              } else {
                await printerService.setChamberTemp(target, contextId: activeContext?.contextId);
              }
            }
          },
        ),

      // Extruder Tiles
      if (hasMultipleTools) ...[
        for (int i = 0; i < status.toolTemps.length; i++)
          _buildTempRow(
            context: context,
            icon: LucideIcons.flame,
            iconColor: toolColors[i % toolColors.length],
            label: getToolLabel(i, status.toolTemps.length),
            currentTemp: status.toolTemps[i],
            targetTemp: i < status.toolTargetTemps.length ? status.toolTargetTemps[i] : 0.0,
            onTap: () async {
              final target = await showTempSetpointDialog(
                context: context,
                title: 'Set ${getToolLabel(i, status.toolTemps.length)} Temperature',
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
      ] else ...[
        _buildTempRow(
          context: context,
          icon: LucideIcons.flame,
          iconColor: AppColors.toolheadT0,
          label: isMultiHead ? 'Head 1' : 'Nozzle',
          currentTemp: status.nozzleTemperature,
          targetTemp: status.nozzleTargetTemperature,
          onTap: () async {
            final target = await showTempSetpointDialog(
              context: context,
              title: isMultiHead ? 'Set Head 1 Temperature' : 'Set Nozzle Temperature',
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
    ];

    final gridRows = <Widget>[];
    for (int i = 0; i < tiles.length; i += 2) {
      if (i > 0) gridRows.add(const SizedBox(height: 8));
      gridRows.add(
        Row(
          children: [
            Expanded(child: tiles[i]),
            const SizedBox(width: 8),
            if (i + 1 < tiles.length)
              Expanded(child: tiles[i + 1])
            else
              const Expanded(child: SizedBox.shrink()),
          ],
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(LucideIcons.thermometer, size: 15, color: AppColors.bedHeat),
                SizedBox(width: 8),
                Text(
                  'Temperatures',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Column(children: gridRows),
          ],
        ),
      ),
    );
  }

  Widget _buildTempRow({
    Key? key,
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
      key: key,
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
        decoration: BoxDecoration(
          color: AppColors.surfaceSecondary.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: isHeating ? iconColor.withValues(alpha: 0.2) : AppColors.surface,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(icon, size: 14, color: isHeating ? iconColor : AppColors.textMuted),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 4),
            if (isHeating)
              Container(
                margin: const EdgeInsets.only(right: 4),
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: iconColor, shape: BoxShape.circle),
              ),
            Text(
              '${currentTemp.toStringAsFixed(0)}\u00B0C',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
            ),
            Text(
              ' / ${targetTemp.toStringAsFixed(0)}\u00B0C',
              style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

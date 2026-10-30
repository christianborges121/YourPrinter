import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';
import 'jog_bottom_sheet.dart';

class ControlPanelCard extends ConsumerStatefulWidget {
  const ControlPanelCard({super.key});

  @override
  ConsumerState<ControlPanelCard> createState() => _ControlPanelCardState();
}

class _ControlPanelCardState extends ConsumerState<ControlPanelCard> {
  bool _ledOn = true;

  @override
  Widget build(BuildContext context) {
    final telemetry = ref.watch(telemetryProvider);
    final activeContext = ref.watch(printerContextProvider).activeContext;
    final printerService = ref.read(printerServiceProvider);
    final features = telemetry.features;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(LucideIcons.sliders, size: 16, color: AppColors.info),
                SizedBox(width: 8),
                Text(
                  'Hardware Controls',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Button Grid
            Row(
              children: [
                // Axis Movement / Jog
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: (telemetry.status?.hasActiveJob ?? false)
                        ? null
                        : () {
                            showModalBottomSheet(
                              context: context,
                              isScrollControlled: true,
                              backgroundColor: AppColors.surface,
                              builder: (_) => const JogBottomSheet(),
                            );
                          },
                    icon: const Icon(LucideIcons.move, size: 14),
                    label: Text(
                      (telemetry.status?.hasActiveJob ?? false) ? 'Jog (Busy)' : 'Axes / Jog',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Home All Axes
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: (telemetry.status?.hasActiveJob ?? false)
                        ? null
                        : () async {
                            final ok = await printerService.homeAxes(contextId: activeContext?.contextId);
                            if (context.mounted && ok) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Homing axes...'), duration: Duration(seconds: 2)),
                              );
                            }
                          },
                    icon: const Icon(LucideIcons.home, size: 14),
                    label: Text(
                      (telemetry.status?.hasActiveJob ?? false) ? 'Home (Busy)' : 'Home All',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            Row(
              children: [
                // LED Toggle
                if (features?.hasLED ?? true) ...[
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _ledOn ? AppColors.warning : AppColors.textMuted,
                      ),
                      onPressed: () async {
                        setState(() => _ledOn = !_ledOn);
                        await printerService.setLED(_ledOn, contextId: activeContext?.contextId);
                      },
                      icon: Icon(_ledOn ? LucideIcons.lightbulb : LucideIcons.lightbulbOff, size: 14),
                      label: Text(_ledOn ? 'LED: On' : 'LED: Off', style: const TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],

                // Clear / Reset Status
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      await printerService.clearStatus(contextId: activeContext?.contextId);
                      ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                    },
                    icon: const Icon(LucideIcons.rotateCcw, size: 14),
                    label: const Text('Clear Status', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),

            // Filtration (for AD5M Pro / Creator 5 Pro with filtration)
            if (features?.hasFiltration ?? false) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('Filtration:', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Off', style: TextStyle(fontSize: 11)),
                    selected: telemetry.status?.filtrationMode == 'none',
                    onSelected: (_) => printerService.setFiltration('off', contextId: activeContext?.contextId),
                  ),
                  const SizedBox(width: 4),
                  ChoiceChip(
                    label: const Text('Internal', style: TextStyle(fontSize: 11)),
                    selected: telemetry.status?.filtrationMode == 'internal',
                    onSelected: (_) => printerService.setFiltration('internal', contextId: activeContext?.contextId),
                  ),
                  const SizedBox(width: 4),
                  ChoiceChip(
                    label: const Text('External', style: TextStyle(fontSize: 11)),
                    selected: telemetry.status?.filtrationMode == 'external',
                    onSelected: (_) => printerService.setFiltration('external', contextId: activeContext?.contextId),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';

class JogBottomSheet extends ConsumerStatefulWidget {
  const JogBottomSheet({super.key});

  @override
  ConsumerState<JogBottomSheet> createState() => _JogBottomSheetState();
}

class _JogBottomSheetState extends ConsumerState<JogBottomSheet> {
  double _stepSize = 10.0;

  void _jogAxis(String axis, double distance) {
    final wsClient = ref.read(webSocketClientProvider);
    // Relative motion G-code: G91; G1 <axis><distance> F3000; G90
    final gcode = 'G91\nG1 $axis$distance F3000\nG90';
    wsClient.sendCommand({
      'command': 'EXECUTE_GCODE',
      'gcode': gcode,
    });
  }

  @override
  Widget build(BuildContext context) {
    final activeContext = ref.watch(printerContextProvider).activeContext;
    final printerService = ref.read(printerServiceProvider);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(color: AppColors.borderSubtle, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(height: 12),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Manual Jog & Extruder (${activeContext?.name ?? 'Printer'})',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
              ),
              IconButton(
                icon: const Icon(LucideIcons.x, size: 18),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const Divider(height: 16),

          // Step Size Chips
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Step:', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
              const SizedBox(width: 8),
              for (final step in [0.1, 1.0, 10.0, 50.0])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text('${step >= 1 ? step.toInt() : step}mm', style: const TextStyle(fontSize: 11)),
                    selected: _stepSize == step,
                    onSelected: (_) => setState(() => _stepSize = step),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),

          // Jog Direction Cross Pad
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // X/Y D-Pad
              Column(
                children: [
                  IconButton.filledTonal(
                    icon: const Icon(LucideIcons.chevronUp, size: 24),
                    onPressed: () => _jogAxis('Y', _stepSize),
                    tooltip: 'Y+ (Back)',
                  ),
                  Row(
                    children: [
                      IconButton.filledTonal(
                        icon: const Icon(LucideIcons.chevronLeft, size: 24),
                        onPressed: () => _jogAxis('X', -_stepSize),
                        tooltip: 'X- (Left)',
                      ),
                      const SizedBox(width: 44, child: Center(child: Text('XY', style: TextStyle(fontWeight: FontWeight.bold)))),
                      IconButton.filledTonal(
                        icon: const Icon(LucideIcons.chevronRight, size: 24),
                        onPressed: () => _jogAxis('X', _stepSize),
                        tooltip: 'X+ (Right)',
                      ),
                    ],
                  ),
                  IconButton.filledTonal(
                    icon: const Icon(LucideIcons.chevronDown, size: 24),
                    onPressed: () => _jogAxis('Y', -_stepSize),
                    tooltip: 'Y- (Front)',
                  ),
                ],
              ),

              // Z Axis Up/Down
              Column(
                children: [
                  IconButton.filledTonal(
                    icon: const Icon(LucideIcons.chevronsUp, size: 24),
                    onPressed: () => _jogAxis('Z', _stepSize),
                    tooltip: 'Z+ (Up)',
                  ),
                  const SizedBox(height: 8),
                  const Text('Z Axis', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  const SizedBox(height: 8),
                  IconButton.filledTonal(
                    icon: const Icon(LucideIcons.chevronsDown, size: 24),
                    onPressed: () => _jogAxis('Z', -_stepSize),
                    tooltip: 'Z- (Down)',
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 16),

          // Home Axes Shortcut & Note
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final ok = await printerService.homeAxes(contextId: activeContext?.contextId);
                    if (context.mounted && ok) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Homing axes...'), duration: Duration(seconds: 2)),
                      );
                    }
                  },
                  icon: const Icon(LucideIcons.home, size: 14),
                  label: const Text('Home All Axes', style: TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Note: Material load and unload are controlled per-slot in the Material / AMS card.',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

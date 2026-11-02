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

class _ControlPanelCardState extends ConsumerState<ControlPanelCard>
    with TickerProviderStateMixin {
  bool _ledOn = true;
  late final AnimationController _fanAnimController;
  int _fanSpeed = 0;
  int? _optimisticSpeed;

  @override
  void initState() {
    super.initState();
    final initialSpeed =
        ref.read(telemetryProvider).status?.coolingFanSpeed.round() ?? 0;
    _fanSpeed = initialSpeed.clamp(0, 100);
    _fanAnimController = AnimationController(
      vsync: this,
      duration: _fanSpeed > 50
          ? const Duration(milliseconds: 1000)
          : const Duration(milliseconds: 2500),
    );
    if (_fanSpeed > 0) {
      _fanAnimController.repeat();
    }
  }

  @override
  void dispose() {
    _fanAnimController.dispose();
    super.dispose();
  }

  void _updateFanAnimation(int speed) {
    if (speed > 0) {
      final targetDuration = speed > 50
          ? const Duration(milliseconds: 1000)
          : const Duration(milliseconds: 2500);
      if (_fanAnimController.duration != targetDuration) {
        _fanAnimController.duration = targetDuration;
      }
      if (!_fanAnimController.isAnimating) {
        _fanAnimController.repeat();
      }
    } else {
      if (_fanAnimController.isAnimating) {
        _fanAnimController.stop();
        _fanAnimController.reset();
      }
    }
  }

  void _onFanSpeedChanged(int speed, String? contextId) {
    final clamped = speed.clamp(0, 100);
    setState(() => _fanSpeed = clamped);
    _updateFanAnimation(clamped);
    ref.read(printerServiceProvider).setFanSpeed(clamped, contextId: contextId);
  }

  String _getSpeedModeLabel(int speed) {
    if (speed <= 70) return 'Quiet';
    if (speed <= 120) return 'Standard';
    return 'Sport';
  }

  Widget _buildSpeedPresetButton({
    required int percent,
    required String label,
    required String desc,
    required int currentSpeed,
    required VoidCallback onTap,
  }) {
    final isSelected = (currentSpeed - percent).abs() < 10;
    return Expanded(
      child: InkWell(
        key: Key('speed_preset_$percent'),
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.warningSubtle : AppColors.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? AppColors.warning : AppColors.border,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? AppColors.warning : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                desc,
                style: TextStyle(
                  fontSize: 10,
                  color: isSelected ? AppColors.warning.withValues(alpha: 0.8) : AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final telemetry = ref.watch(telemetryProvider);
    final activeContext = ref.watch(printerContextProvider).activeContext;
    final printerService = ref.read(printerServiceProvider);
    final features = telemetry.features;

    // Synchronize telemetry coolingFanSpeed updates into local state
    ref.listen<double?>(
      telemetryProvider.select((s) => s.status?.coolingFanSpeed),
      (prev, next) {
        if (next != null) {
          final rounded = next.round().clamp(0, 100);
          if (mounted && _fanSpeed != rounded) {
            setState(() => _fanSpeed = rounded);
            _updateFanAnimation(rounded);
          }
        }
      },
    );

    // Synchronize telemetry printSpeed updates
    ref.listen<double?>(
      telemetryProvider.select((s) => s.status?.printSpeed),
      (prev, next) {
        if (next != null) {
          final rounded = next.round().clamp(10, 300);
          if (mounted && _optimisticSpeed == rounded) {
            setState(() => _optimisticSpeed = null);
          }
        }
      },
    );

    final modelStr = (activeContext?.model ?? '').toLowerCase();
    final nameStr = (activeContext?.name ?? '').toLowerCase();
    final isCreator5 = modelStr.contains('creator') ||
        nameStr.contains('creator') ||
        (modelStr.contains('ad5x') && nameStr.contains('c5'));

    final capabilities = features?.capabilities;
    final hasPartCoolingFan = isCreator5 ? true : (capabilities?.hasPartCoolingFan ?? true);
    final canAdjustSpeed = capabilities?.canAdjustSpeed ?? true;

    final stateStr = (telemetry.status?.printerState ?? '').toLowerCase();
    final isIdleOrReady = stateStr == 'ready' || stateStr == 'idle';
    final showIdleNotice = _fanSpeed > 0 && isIdleOrReady;

    final statusSpeed = telemetry.status?.printSpeed.round() ?? 100;
    final currentSpeed = _optimisticSpeed ?? statusSpeed;
    final modeLabel = _getSpeedModeLabel(currentSpeed);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.sliders, size: 16, color: AppColors.info),
                const SizedBox(width: 8),
                const Text(
                  'Hardware Controls',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
                const Spacer(),
                if (features?.hasLED ?? true)
                  InkWell(
                    key: const Key('led_toggle_btn'),
                    borderRadius: BorderRadius.circular(8),
                    onTap: () async {
                      setState(() => _ledOn = !_ledOn);
                      await printerService.setLED(_ledOn, contextId: activeContext?.contextId);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: _ledOn ? AppColors.warningSubtle : AppColors.surface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _ledOn ? AppColors.warning.withValues(alpha: 0.5) : AppColors.border,
                        ),
                      ),
                      child: Icon(
                        _ledOn ? LucideIcons.lightbulb : LucideIcons.lightbulbOff,
                        size: 16,
                        color: _ledOn ? AppColors.warning : AppColors.textMuted,
                      ),
                    ),
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
            // Part Cooling Fan Speed Section
            if (hasPartCoolingFan) ...[
              const SizedBox(height: 12),
              Container(
                key: const Key('part_cooling_fan_section'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSecondary.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header readout
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            RotationTransition(
                              turns: _fanAnimController,
                              child: Icon(
                                LucideIcons.fan,
                                size: 15,
                                color: _fanSpeed > 0
                                    ? AppColors.accentGreen
                                    : AppColors.textMuted,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Text(
                              'Part Cooling Fan',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          '$_fanSpeed%',
                          key: const Key('fan_speed_readout'),
                          style: TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.bold,
                            color: _fanSpeed > 0
                                ? AppColors.accentGreen
                                : AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Continuous Slider (0-100%, step 5)
                    SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        trackHeight: 4,
                        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                        overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                        activeTrackColor: AppColors.accentGreen,
                        inactiveTrackColor: AppColors.surface,
                        thumbColor: AppColors.accentGreen,
                        overlayColor: AppColors.accentGreenSubtle,
                      ),
                      child: Slider(
                        key: const Key('fan_speed_slider'),
                        value: _fanSpeed.toDouble().clamp(0.0, 100.0),
                        min: 0,
                        max: 100,
                        divisions: 20,
                        onChanged: (val) {
                          final speed = val.round().clamp(0, 100);
                          setState(() => _fanSpeed = speed);
                          _updateFanAnimation(speed);
                        },
                        onChangeEnd: (val) {
                          _onFanSpeedChanged(val.round(), activeContext?.contextId);
                        },
                      ),
                    ),
                    const SizedBox(height: 6),

                    // 5 Preset Chips: Off (0%), 25%, 50%, 75%, 100%
                    Row(
                      children: [0, 25, 50, 75, 100].map((preset) {
                        final isSelected = _fanSpeed == preset;
                        return Expanded(
                          child: Padding(
                            padding: EdgeInsets.only(right: preset == 100 ? 0 : 6),
                            child: Material(
                              color: isSelected
                                  ? AppColors.accentGreenSubtle
                                  : AppColors.surface,
                              borderRadius: BorderRadius.circular(6),
                              child: InkWell(
                                key: Key('fan_preset_$preset'),
                                onTap: () => _onFanSpeedChanged(
                                    preset, activeContext?.contextId),
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 6),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(
                                      color: isSelected
                                          ? AppColors.accentGreen
                                          : AppColors.border,
                                    ),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    preset == 0 ? 'Off' : '$preset%',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: isSelected
                                          ? AppColors.accentGreen
                                          : AppColors.textMuted,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),

                    // Firmware idle notice
                    if (showIdleNotice) ...[
                      const SizedBox(height: 6),
                      const Text(
                        'Note: Toolhead fans engage when a print job starts.',
                        key: Key('fan_idle_notice'),
                        style: TextStyle(
                          fontSize: 10,
                          fontStyle: FontStyle.italic,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],

            // Print Speed Rate Control Section
            if (canAdjustSpeed) ...[
              const SizedBox(height: 12),
              Container(
                key: const Key('control_panel_speed_section'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSecondary.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header Readout
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Icon(LucideIcons.gauge, size: 15, color: AppColors.warning),
                            SizedBox(width: 6),
                            Text(
                              'Print Speed Rate',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        Container(
                          key: const Key('control_panel_speed_badge'),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.warningSubtle,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
                          ),
                          child: Text(
                            '$currentSpeed% ($modeLabel)',
                            style: const TextStyle(
                              fontSize: 11,
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.bold,
                              color: AppColors.warning,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Preset Chips Row: 50% Quiet, 100% Standard, 140% Sport
                    Row(
                      children: [
                        _buildSpeedPresetButton(
                          percent: 50,
                          label: 'Quiet',
                          desc: '50% Speed',
                          currentSpeed: currentSpeed,
                          onTap: () async {
                            setState(() => _optimisticSpeed = 50);
                            await printerService.setPrintSpeed(50, contextId: activeContext?.contextId);
                            if (context.mounted) {
                              ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                            }
                          },
                        ),
                        const SizedBox(width: 8),
                        _buildSpeedPresetButton(
                          percent: 100,
                          label: 'Standard',
                          desc: '100% Speed',
                          currentSpeed: currentSpeed,
                          onTap: () async {
                            setState(() => _optimisticSpeed = 100);
                            await printerService.setPrintSpeed(100, contextId: activeContext?.contextId);
                            if (context.mounted) {
                              ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                            }
                          },
                        ),
                        const SizedBox(width: 8),
                        _buildSpeedPresetButton(
                          percent: 140,
                          label: 'Sport',
                          desc: '140% Speed',
                          currentSpeed: currentSpeed,
                          onTap: () async {
                            setState(() => _optimisticSpeed = 140);
                            await printerService.setPrintSpeed(140, contextId: activeContext?.contextId);
                            if (context.mounted) {
                              ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                            }
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 12),

            // Clear / Reset Status
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  await printerService.clearStatus(contextId: activeContext?.contextId);
                  ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                },
                icon: const Icon(LucideIcons.rotateCcw, size: 14),
                label: const Text('Clear Status', style: TextStyle(fontSize: 12)),
              ),
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

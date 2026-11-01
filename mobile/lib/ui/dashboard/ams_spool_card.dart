import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/material_station.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';
import '../controls/spool_select_sheet.dart';

class AmsSpoolCard extends ConsumerStatefulWidget {
  const AmsSpoolCard({super.key});

  @override
  ConsumerState<AmsSpoolCard> createState() => _AmsSpoolCardState();
}

class _AmsSpoolCardState extends ConsumerState<AmsSpoolCard> {
  bool _isActionBusy = false;

  bool _isMultiHeadPrinter(TelemetryState telemetry, PrinterContextState contextState) {
    final toolTemps = telemetry.status?.toolTemps;
    if (toolTemps != null && toolTemps.length > 1) {
      return true;
    }
    final activeId = contextState.activeContextId;
    if (activeId != null) {
      final ctx = contextState.contexts.where((c) => c.contextId == activeId).firstOrNull;
      final model = '${ctx?.model ?? ''} ${ctx?.name ?? ''}';
      if (RegExp(r'creator\s*(5|pro|4)', caseSensitive: false).hasMatch(model)) {
        return true;
      }
    }
    return false;
  }

  Future<void> _handleRefresh() async {
    final activeId = ref.read(printerContextProvider).activeContextId;
    await ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
  }

  Future<void> _handleLoadSlot(int slotId, int slotNum) async {
    if (_isActionBusy) return;
    setState(() => _isActionBusy = true);
    final activeId = ref.read(printerContextProvider).activeContextId;
    try {
      final ok = await ref.read(printerServiceProvider).loadMaterialSlot(slotId, contextId: activeId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ok ? 'Loading filament from Slot $slotNum...' : 'Failed to load Slot $slotNum'),
            backgroundColor: ok ? AppColors.accentGreen : AppColors.error,
          ),
        );
      }
      await Future.delayed(const Duration(milliseconds: 1200));
      if (mounted) {
        await ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading Slot $slotNum'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _isActionBusy = false);
    }
  }

  Future<void> _handleUnload() async {
    if (_isActionBusy) return;
    setState(() => _isActionBusy = true);
    final activeId = ref.read(printerContextProvider).activeContextId;
    try {
      final ok = await ref.read(printerServiceProvider).unloadMaterial(contextId: activeId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ok ? 'Unloading filament...' : 'Failed to unload filament'),
            backgroundColor: ok ? AppColors.accentGreen : AppColors.error,
          ),
        );
      }
      await Future.delayed(const Duration(milliseconds: 1200));
      if (mounted) {
        await ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error unloading filament'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _isActionBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final telemetry = ref.watch(telemetryProvider);
    final contextState = ref.watch(printerContextProvider);
    final station = telemetry.materialStation;
    final activeSpool = telemetry.activeSpool;

    final hasHardwareAms = (station != null && station.connected && station.slots.isNotEmpty);
    if (!hasHardwareAms) {
      return _buildDedicatedSpoolmanCard(context, activeSpool);
    }

    final isMultiHead = _isMultiHeadPrinter(telemetry, contextState);
    final toolTemps = telemetry.status?.toolTemps ?? const [];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Row matching WebUI Multi Material Panel
            Row(
              children: [
                const Icon(LucideIcons.layers, size: 16, color: AppColors.accentGreen),
                const SizedBox(width: 8),
                const Text(
                  'Multi Material',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
                const Spacer(),
                if (station.connected)
                  _buildStatusPill(station, isMultiHead),
                const SizedBox(width: 6),
                InkWell(
                  onTap: _handleRefresh,
                  borderRadius: BorderRadius.circular(6),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(LucideIcons.refreshCw, size: 14, color: AppColors.textMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Material Station Slots Grid (2x2 on mobile for full readability like WebUI cards)
            if (station.slots.isNotEmpty) ...[
              LayoutBuilder(
                builder: (context, constraints) {
                  // 2 columns if >2 slots so spool disc, hex code, and Load/Unload fit cleanly
                  final count = station.slots.length;
                  if (count <= 2) {
                    return Row(
                      children: [
                        for (int i = 0; i < count; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          Expanded(
                            child: _buildSlotCard(
                              station.slots[i],
                              index: i,
                              isMultiHead: isMultiHead,
                              headTemp: i < toolTemps.length ? toolTemps[i] : null,
                            ),
                          ),
                        ],
                      ],
                    );
                  }

                  final rows = <Widget>[];
                  for (int i = 0; i < count; i += 2) {
                    if (i > 0) rows.add(const SizedBox(height: 8));
                    rows.add(
                      Row(
                        children: [
                          Expanded(
                            child: _buildSlotCard(
                              station.slots[i],
                              index: i,
                              isMultiHead: isMultiHead,
                              headTemp: i < toolTemps.length ? toolTemps[i] : null,
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (i + 1 < count)
                            Expanded(
                              child: _buildSlotCard(
                                station.slots[i + 1],
                                index: i + 1,
                                isMultiHead: isMultiHead,
                                headTemp: (i + 1) < toolTemps.length ? toolTemps[i + 1] : null,
                              ),
                            )
                          else
                            const Expanded(child: SizedBox.shrink()),
                        ],
                      ),
                    );
                  }
                  return Column(children: rows);
                },
              ),
              if (activeSpool != null) const Divider(height: 20),
            ],

            // Active Spoolman Details
            if (activeSpool != null) ...[
              Row(
                children: [
                  Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: _parseColor(activeSpool.colorHex, false),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white24, width: 1),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${activeSpool.vendor ?? 'Generic'} ${activeSpool.name}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${activeSpool.material ?? 'PLA'} \u00B7 ${activeSpool.remainingWeight.toStringAsFixed(0)}g left',
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDedicatedSpoolmanCard(BuildContext context, ActiveSpoolData? activeSpool) {
    final spoolColor = activeSpool != null ? _parseColor(activeSpool.colorHex, false) : AppColors.accentGreen;
    final remainingWeight = activeSpool != null ? activeSpool.remainingWeight.clamp(0.0, 5000.0) : 0.0;
    final remainingPercent = ((remainingWeight / 1000.0) * 100).clamp(0.0, 100.0);

    return Card(
      key: const Key('dedicated_spoolman_card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                const Icon(LucideIcons.disc, size: 16, color: AppColors.accentGreen),
                const SizedBox(width: 8),
                const Text(
                  'Active Filament & Spool',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
                const Spacer(),
                InkWell(
                  onTap: _handleRefresh,
                  borderRadius: BorderRadius.circular(6),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(LucideIcons.refreshCw, size: 14, color: AppColors.textMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (activeSpool != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSecondary,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        // Spool Disc Visual
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: spoolColor,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white24, width: 2),
                            boxShadow: [
                              BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 4),
                            ],
                          ),
                          child: Center(
                            child: Container(
                              width: 14,
                              height: 14,
                              decoration: const BoxDecoration(
                                color: AppColors.surface,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(LucideIcons.disc, size: 8, color: Colors.white54),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),

                        // Spool Metadata
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${activeSpool.vendor ?? 'Generic'} ${activeSpool.name}',
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${activeSpool.material ?? 'PLA'} \u00B7 ${remainingWeight.toStringAsFixed(0)}g left',
                                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Progress Bar
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (remainingPercent / 100.0).clamp(0.0, 1.0),
                        minHeight: 6,
                        backgroundColor: AppColors.border,
                        valueColor: AlwaysStoppedAnimation<Color>(spoolColor),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // Action Buttons: Change & Clear
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('spoolman_change_btn'),
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: AppColors.surface,
                          builder: (_) => const SpoolSelectSheet(),
                        );
                      },
                      icon: const Icon(LucideIcons.pencil, size: 14),
                      label: const Text('Change Spool', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    key: const Key('spoolman_clear_btn'),
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                    onPressed: () async {
                      final activeId = ref.read(printerContextProvider).activeContextId;
                      await ref.read(printerServiceProvider).clearActiveSpool(contextId: activeId);
                      await ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
                    },
                    icon: const Icon(LucideIcons.trash2, size: 14),
                    label: const Text('Clear', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ] else ...[
              // Empty State
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSecondary,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    const Icon(LucideIcons.disc, size: 32, color: AppColors.textMuted),
                    const SizedBox(height: 8),
                    const Text(
                      'No Spool Assigned',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Assign a spool from Spoolman to track filament consumption and colors.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      key: const Key('spoolman_select_spool_btn'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.accentGreen,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      ),
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: AppColors.surface,
                          builder: (_) => const SpoolSelectSheet(),
                        );
                      },
                      icon: const Icon(LucideIcons.plus, size: 14),
                      label: const Text('Select Spool', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusPill(MaterialStationStatus station, bool isMultiHead) {
    final status = station.overallStatus;
    String text;
    Color color = AppColors.accentGreen;

    if (status == 'error') {
      text = 'Error';
      color = AppColors.error;
    } else if (status == 'warming') {
      text = 'Warming';
      color = AppColors.warning;
    } else if (isMultiHead) {
      if (station.activeSlot != null && station.activeSlot! >= 0) {
        final activeHead = station.activeSlot! >= 1 ? station.activeSlot! : station.activeSlot! + 1;
        text = 'Head $activeHead Active';
      } else {
        text = '${station.slots.length} Heads Ready';
      }
    } else {
      if (station.activeSlot != null && station.activeSlot! >= 0) {
        final activeSlotNum = station.activeSlot! >= 1 ? station.activeSlot! : station.activeSlot! + 1;
        text = 'Slot $activeSlotNum Feeding';
      } else {
        text = 'Ready';
      }
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35), width: 1),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }

  Widget _buildSlotCard(
    MaterialSlot slot, {
    required int index,
    required bool isMultiHead,
    double? headTemp,
  }) {
    final slotNum = slot.slotId >= 1 ? slot.slotId : index + 1;
    final isEmpty = slot.isEmpty;
    final isActive = slot.isActive;
    final rawColorStr = slot.materialColor ?? (isEmpty ? '#333333' : '#888888');
    final discColor = _parseColor(rawColorStr, isEmpty);
    final materialLabel = isEmpty ? 'Empty' : (slot.materialType ?? 'Generic');
    final isLight = _isColorLight(discColor);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isActive ? AppColors.accentGreenSubtle.withValues(alpha: 0.35) : AppColors.surfaceSecondary,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isActive ? AppColors.accentGreen : AppColors.border,
          width: isActive ? 1.5 : 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Badge Row: Slot/Head number + Temp + Active Pill
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.borderSubtle, width: 0.5),
                ),
                child: Text(
                  isMultiHead ? 'Head $slotNum' : 'Slot $slotNum',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textSecondary),
                ),
              ),
              if (isMultiHead && headTemp != null) ...[
                const SizedBox(width: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(LucideIcons.thermometer, size: 10, color: AppColors.textMuted),
                    const SizedBox(width: 2),
                    Text(
                      '${headTemp.toStringAsFixed(0)}\u00B0C',
                      style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ],
              const Spacer(),
              if (isActive)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AppColors.accentGreen,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Text(
                      'Active',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.accentGreen),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 10),

          // Middle Spool Visual: Spool Disc with inner Hub + Material Type & Hex
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: discColor,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isLight ? Colors.black26 : Colors.white24,
                    width: 1.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.25),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Center(
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isLight ? Colors.black26 : Colors.white24,
                        width: 1,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      materialLabel,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: isEmpty ? AppColors.textMuted : AppColors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (!isEmpty && slot.materialColor != null && slot.materialColor!.isNotEmpty)
                      Text(
                        slot.materialColor!.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: AppColors.textMuted,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Bottom Action Row: Multi-Head Tool Pill OR AMS Load / Unload Buttons
          if (isMultiHead)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 8),
              decoration: BoxDecoration(
                color: isActive ? AppColors.accentGreen.withValues(alpha: 0.15) : AppColors.surface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isActive ? AppColors.accentGreen.withValues(alpha: 0.4) : AppColors.borderSubtle,
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isActive ? LucideIcons.flame : LucideIcons.printer,
                    size: 12,
                    color: isActive ? AppColors.accentGreen : AppColors.textMuted,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    isActive ? 'Active Extruder' : 'Direct Feed',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: isActive ? AppColors.accentGreen : AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            )
          else
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 26,
                    child: OutlinedButton.icon(
                      onPressed: (isActive || isEmpty || _isActionBusy)
                          ? null
                          : () => _handleLoadSlot(slot.slotId, slotNum),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        side: BorderSide(
                          color: (isActive || isEmpty) ? AppColors.borderSubtle : AppColors.border,
                        ),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                      ),
                      icon: const Icon(LucideIcons.arrowDownToLine, size: 11),
                      label: const Text('Load', style: TextStyle(fontSize: 10)),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: SizedBox(
                    height: 26,
                    child: OutlinedButton.icon(
                      onPressed: (!isActive || _isActionBusy) ? null : _handleUnload,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        side: BorderSide(
                          color: !isActive ? AppColors.borderSubtle : AppColors.border,
                        ),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                      ),
                      icon: const Icon(LucideIcons.arrowUpFromLine, size: 11),
                      label: const Text('Unload', style: TextStyle(fontSize: 10)),
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Color _parseColor(String? hexString, bool isEmpty) {
    if (hexString == null || hexString.isEmpty) {
      return isEmpty ? const Color(0xFF333333) : const Color(0xFF888888);
    }
    try {
      final clean = hexString.replaceAll('#', '').trim();
      if (clean.length == 6) {
        return Color(int.parse('FF$clean', radix: 16));
      } else if (clean.length == 8) {
        return Color(int.parse(clean, radix: 16));
      }
      return const Color(0xFF888888);
    } catch (_) {
      return const Color(0xFF888888);
    }
  }

  bool _isColorLight(Color color) {
    final r = (color.r * 255).round();
    final g = (color.g * 255).round();
    final b = (color.b * 255).round();
    final brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 190;
  }
}

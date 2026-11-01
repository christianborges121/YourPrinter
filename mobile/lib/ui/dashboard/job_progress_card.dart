import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';
import '../common/skeleton_shimmer.dart';
import '../common/status_badge.dart';

class JobProgressCard extends ConsumerWidget {
  const JobProgressCard({super.key});

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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SkeletonShimmer(width: 80, height: 18),
                  Spacer(),
                  SkeletonShimmer(width: 60, height: 18),
                ],
              ),
              SizedBox(height: 14),
              SkeletonShimmer(width: double.infinity, height: 8),
              SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  SkeletonShimmer(width: 70, height: 14),
                  SkeletonShimmer(width: 70, height: 14),
                  SkeletonShimmer(width: 70, height: 14),
                ],
              ),
            ],
          ),
        ),
      );
    }

    final status = telemetryState.status!;
    final isPrinting = status.isPrinting;
    final isCompleted = status.isCompleted;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Job Title & Status Badge
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        status.jobName != null && status.jobName!.isNotEmpty
                            ? status.jobName!
                            : 'No Active Print Job',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        activeContext != null ? '${activeContext.name} (${activeContext.model})' : '3D Printer',
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                StatusBadge(
                  statusText: status.printerState,
                  isPrinting: isPrinting,
                  isCompleted: isCompleted,
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Progress Bar
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (status.progress / 100.0).clamp(0.0, 1.0),
                minHeight: 8,
                backgroundColor: AppColors.border,
                valueColor: AlwaysStoppedAnimation<Color>(
                  isCompleted ? AppColors.info : AppColors.accentGreen,
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Metrics Row: % | Layers | Time Remaining
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${status.progress.toStringAsFixed(1)}%',
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary, fontSize: 13),
                ),
                Text(
                  'Layer ${status.currentLayer} / ${status.totalLayers}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
                Text(
                  status.timeRemaining != null
                      ? _formatSeconds(status.timeRemaining!)
                      : (status.formattedEta ?? '--:--'),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ],
            ),

            // Metadata Grid: Time Left, Elapsed, Filament Est.
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surfaceSecondary,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(LucideIcons.clock, size: 12, color: AppColors.textMuted),
                            SizedBox(width: 4),
                            Text('Time Left', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          status.timeRemaining != null
                              ? _formatDuration(status.timeRemaining!)
                              : (status.formattedEta ?? '--'),
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(LucideIcons.timer, size: 12, color: AppColors.textMuted),
                            SizedBox(width: 4),
                            Text('Elapsed', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _formatDuration(status.elapsedTimeSeconds > 0 ? status.elapsedTimeSeconds : (status.timeElapsed ?? 0)),
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                        ),
                      ],
                    ),
                  ),
                  if (status.estimatedLength != null || status.estimatedWeight != null)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Filament Est.', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                          const SizedBox(height: 2),
                          Text(
                            '${status.estimatedLength != null ? "${(status.estimatedLength! / 1000).toStringAsFixed(1)}m" : ""}${status.estimatedWeight != null ? " (${status.estimatedWeight!.toStringAsFixed(0)}g)" : ""}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),

            // Speed Rate Quick Bar (Active Print)
            if (status.hasActiveJob) ...[
              const SizedBox(height: 10),
              Container(
                key: const Key('job_speed_quick_bar'),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSecondary,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.gauge, size: 14, color: AppColors.warning),
                    const SizedBox(width: 6),
                    Text(
                      'Speed: ${status.printSpeed.round()}%',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.warning),
                    ),
                    const Spacer(),
                    for (final preset in [
                      (50, '50% Quiet'),
                      (100, '100% Std'),
                      (140, '140% Sport'),
                    ]) ...[
                      Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: OutlinedButton(
                          key: Key('job_speed_preset_${preset.$1}'),
                          style: OutlinedButton.styleFrom(
                            backgroundColor: (status.printSpeed - preset.$1).abs() < 15
                                ? AppColors.warning.withValues(alpha: 0.2)
                                : AppColors.surface,
                            foregroundColor: (status.printSpeed - preset.$1).abs() < 15
                                ? AppColors.warning
                                : AppColors.textSecondary,
                            side: BorderSide(
                              color: (status.printSpeed - preset.$1).abs() < 15
                                  ? AppColors.warning
                                  : AppColors.border,
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                          ),
                          onPressed: () async {
                            await printerService.setPrintSpeed(preset.$1, contextId: activeContext?.contextId);
                          },
                          child: Text(preset.$2, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],

            // Completed Banner with Clear Action
            if (isCompleted) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.infoSubtle,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.info.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.checkCircle2, size: 16, color: AppColors.info),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Print finished successfully!',
                        style: TextStyle(fontSize: 12, color: AppColors.textPrimary),
                      ),
                    ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        minimumSize: Size.zero,
                      ),
                      onPressed: () async {
                        await printerService.clearStatus(contextId: activeContext?.contextId);
                        ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                      },
                      child: const Text('Dismiss', style: TextStyle(fontSize: 11)),
                    ),
                  ],
                ),
              ),
            ],

            // Job Control Buttons (Pause / Resume / Cancel) when printing
            if (status.hasActiveJob) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        if (status.isPaused) {
                          await printerService.resumeJob(contextId: activeContext?.contextId);
                        } else {
                          await printerService.pauseJob(contextId: activeContext?.contextId);
                        }
                      },
                      icon: Icon(
                        status.isPaused ? LucideIcons.play : LucideIcons.pause,
                        size: 14,
                      ),
                      label: Text(
                        status.isPaused ? 'Resume' : 'Pause',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                      onPressed: () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Cancel Print?'),
                            content: const Text('Are you sure you want to cancel the active print job?'),
                            actions: [
                              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('No')),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
                                onPressed: () => Navigator.of(ctx).pop(true),
                                child: const Text('Cancel Print'),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          await printerService.cancelJob(contextId: activeContext?.contextId);
                        }
                      },
                      icon: const Icon(LucideIcons.square, size: 14),
                      label: const Text('Stop', style: TextStyle(fontSize: 12)),
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

  String _formatDuration(int totalSeconds) {
    if (totalSeconds <= 0) return '--';
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m ${totalSeconds % 60}s';
  }

  String _formatSeconds(int totalSeconds) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m left';
    }
    return '${minutes}m left';
  }
}

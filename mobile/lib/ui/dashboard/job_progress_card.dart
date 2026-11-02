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
          padding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SkeletonShimmer(width: 80, height: 16),
                  Spacer(),
                  SkeletonShimmer(width: 60, height: 16),
                ],
              ),
              SizedBox(height: 10),
              SkeletonShimmer(width: double.infinity, height: 6),
              SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  SkeletonShimmer(width: 70, height: 12),
                  SkeletonShimmer(width: 70, height: 12),
                  SkeletonShimmer(width: 70, height: 12),
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Job Title, Status Badge, & Header Action Buttons
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
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        activeContext != null ? '${activeContext.name} (${activeContext.model})' : '3D Printer',
                        style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                StatusBadge(
                  statusText: status.printerState,
                  isPrinting: isPrinting,
                  isCompleted: isCompleted,
                ),
                if (status.hasActiveJob) ...[
                  const SizedBox(width: 6),
                  IconButton(
                    iconSize: 16,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                    onPressed: () async {
                      if (status.isPaused) {
                        await printerService.resumeJob(contextId: activeContext?.contextId);
                      } else {
                        await printerService.pauseJob(contextId: activeContext?.contextId);
                      }
                    },
                    icon: Icon(
                      status.isPaused ? LucideIcons.play : LucideIcons.pause,
                      color: status.isPaused ? AppColors.accentGreen : AppColors.textPrimary,
                    ),
                    tooltip: status.isPaused ? 'Resume' : 'Pause',
                  ),
                  IconButton(
                    iconSize: 16,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
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
                    icon: const Icon(LucideIcons.square, color: AppColors.error),
                    tooltip: 'Cancel',
                  ),
                ],
              ],
            ),
            const SizedBox(height: 10),

            // Progress Bar
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (status.progress / 100.0).clamp(0.0, 1.0),
                minHeight: 6,
                backgroundColor: AppColors.border,
                valueColor: AlwaysStoppedAnimation<Color>(
                  isCompleted ? AppColors.info : AppColors.accentGreen,
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Primary Metrics Row: % & Time Remaining (Left) and Layer (Right)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${status.progress.toStringAsFixed(1)}%',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary, fontSize: 13),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      status.timeRemaining != null
                          ? _formatSeconds(status.timeRemaining!)
                          : (status.formattedEta ?? '--:--'),
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                    ),
                  ],
                ),
                Text(
                  'Layer ${status.currentLayer} / ${status.totalLayers}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 6),

            // Secondary Stats Strip: Elapsed & Filament Est.
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Elapsed', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                    const SizedBox(width: 4),
                    Text(
                      _formatDuration(status.elapsedTimeSeconds > 0 ? status.elapsedTimeSeconds : (status.timeElapsed ?? 0)),
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                    ),
                  ],
                ),
                if (status.estimatedLength != null || status.estimatedWeight != null)
                  Text(
                    '${status.estimatedLength != null ? "${(status.estimatedLength! / 1000).toStringAsFixed(1)}m" : ""}${status.estimatedWeight != null ? " (${status.estimatedWeight!.toStringAsFixed(0)}g)" : ""}',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                  ),
              ],
            ),

            // Completed Banner with Clear Action
            if (isCompleted) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.infoSubtle,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.info.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.checkCircle2, size: 14, color: AppColors.info),
                    const SizedBox(width: 6),
                    const Expanded(
                      child: Text(
                        'Print finished successfully!',
                        style: TextStyle(fontSize: 11, color: AppColors.textPrimary),
                      ),
                    ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        minimumSize: Size.zero,
                      ),
                      onPressed: () async {
                        await printerService.clearStatus(contextId: activeContext?.contextId);
                        ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeContext?.contextId);
                      },
                      child: const Text('Dismiss', style: TextStyle(fontSize: 10)),
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

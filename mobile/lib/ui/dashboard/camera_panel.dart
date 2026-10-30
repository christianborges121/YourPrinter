import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/printer_status.dart';
import '../../services/camera_stream_service.dart';
import '../../state/camera_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';
import '../camera/camera_hud_screen.dart';
import '../controls/watchdog_sheet.dart';

class CameraPanel extends ConsumerWidget {
  const CameraPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cameraService = ref.watch(cameraStreamServiceProvider);
    final activeContext = ref.watch(printerContextProvider).activeContext;
    final telemetry = ref.watch(telemetryProvider);
    final watchdog = telemetry.status?.watchdog;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                const Icon(LucideIcons.video, size: 16, color: AppColors.accentGreen),
                const SizedBox(width: 8),
                const Text(
                  'Camera Feed',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
                const Spacer(),
                // AI Watchdog Guard status chip
                _buildWatchdogChip(context, watchdog),
                const SizedBox(width: 8),
                // Fullscreen HUD Button
                IconButton(
                  icon: const Icon(LucideIcons.maximize2, size: 16, color: AppColors.textSecondary),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: 'Fullscreen Camera HUD',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const CameraHudScreen()),
                    );
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Video View Stage (16:10 aspect ratio matching 4:3 / 5:3 / 16:9)
          AspectRatio(
            aspectRatio: 16 / 10,
            child: Container(
              color: Colors.black,
              child: Stack(
                children: [
                  // Video / MJPEG Surface
                  if (cameraService.state == CameraPlayState.streaming)
                    cameraService.lastJpegBytes != null
                        ? Image.memory(
                            cameraService.lastJpegBytes!,
                            gaplessPlayback: true,
                            fit: BoxFit.contain,
                            width: double.infinity,
                            height: double.infinity,
                          )
                        : RTCVideoView(
                            cameraService.renderer,
                            objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                          ),

                  // Connecting Spinner State
                  if (cameraService.state == CameraPlayState.connecting)
                    const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.accentGreen),
                          SizedBox(height: 12),
                          Text(
                            'Connecting to camera feed...',
                            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),

                  // Busy / In-Use Error Overlay Card
                  if (cameraService.state == CameraPlayState.busy)
                    _buildBusyOverlay(context, cameraService, activeContext?.contextId),

                  // Standard Paused Overlay Card
                  if (cameraService.state == CameraPlayState.paused || cameraService.state == CameraPlayState.idle)
                    _buildPausedOverlay(context, cameraService, activeContext?.contextId),

                  // Top Right Live / Countdown Badge
                  if (cameraService.state == CameraPlayState.streaming)
                    Positioned(
                      top: 10,
                      right: 10,
                      child: _buildLiveBadge(cameraService),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveBadge(CameraStreamService service) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.accentGreen.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: const BoxDecoration(
              color: AppColors.accentGreen,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            service.continuousOverride ? 'Continuous' : 'Live \u00B7 ${service.remainingSeconds}s',
            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => service.pauseStream(),
            child: const Icon(LucideIcons.pause, size: 12, color: Colors.white70),
          ),
        ],
      ),
    );
  }

  Widget _buildBusyOverlay(BuildContext context, CameraStreamService service, String? contextId) {
    return Container(
      color: Colors.black.withValues(alpha: 0.92),
      padding: const EdgeInsets.all(16),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warningSubtle,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
              ),
              child: const Icon(LucideIcons.videoOff, size: 24, color: AppColors.warning),
            ),
            const SizedBox(height: 10),
            const Text(
              'Camera In Use or Offline',
              style: TextStyle(color: AppColors.warningLight, fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(
              service.concurrencyNotice ??
                  'The camera feed may currently be open in another application (such as Flash Studio, FlashPrint, or another browser window). YourPrinter devices only support one active video stream.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 11, height: 1.4),
            ),
            const SizedBox(height: 14),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.warning,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              ),
              onPressed: () => service.startStream(contextId: contextId),
              icon: const Icon(LucideIcons.refreshCw, size: 14),
              label: const Text('Retry Stream', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPausedOverlay(BuildContext context, CameraStreamService service, String? contextId) {
    return Container(
      color: Colors.black.withValues(alpha: 0.85),
      padding: const EdgeInsets.all(16),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.accentGreenSubtle,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.accentGreen.withValues(alpha: 0.4)),
              ),
              child: const Icon(LucideIcons.play, size: 24, color: AppColors.accentGreen),
            ),
            const SizedBox(height: 10),
            const Text(
              'Camera Standby',
              style: TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ElevatedButton.icon(
                  onPressed: () {
                    service.setContinuousOverride(false);
                    service.startStream(contextId: contextId);
                  },
                  icon: const Icon(LucideIcons.play, size: 14),
                  label: const Text('View (30s)', style: TextStyle(fontSize: 12)),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  onPressed: () {
                    service.setContinuousOverride(true);
                    service.startStream(contextId: contextId);
                  },
                  icon: const Icon(LucideIcons.infinity, size: 14),
                  label: const Text('Continuous', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWatchdogChip(BuildContext context, WatchdogStatusData? watchdog) {
    final isOnline = watchdog?.online ?? false;
    final confidence = watchdog?.confidence ?? 0.0;
    final threshold = watchdog?.threshold ?? 0.20;
    final isAlert = isOnline && confidence >= threshold;

    final String label;
    final Color statusColor;
    final Color bgColor;

    if (!isOnline) {
      label = 'AI Guard: Off';
      statusColor = AppColors.textMuted;
      bgColor = AppColors.surfaceSecondary;
    } else if (confidence > 0) {
      label = 'AI Guard: ${(confidence * 100).toStringAsFixed(0)}% Risk';
      statusColor = isAlert ? AppColors.error : AppColors.accentGreen;
      bgColor = isAlert ? AppColors.error.withValues(alpha: 0.15) : AppColors.accentGreen.withValues(alpha: 0.15);
    } else {
      label = 'AI Guard: Ready';
      statusColor = AppColors.accentGreen;
      bgColor = AppColors.accentGreen.withValues(alpha: 0.15);
    }

    return InkWell(
      onTap: () {
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          backgroundColor: AppColors.surface,
          builder: (_) => const WatchdogSheet(),
        );
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: statusColor.withValues(alpha: 0.35)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isOnline ? LucideIcons.shieldCheck : LucideIcons.shieldAlert,
              size: 13,
              color: statusColor,
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: statusColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

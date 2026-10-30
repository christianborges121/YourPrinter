import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../../core/constants/app_colors.dart';
import '../../services/camera_stream_service.dart';
import '../../state/camera_provider.dart';
import '../../state/telemetry_provider.dart';

class CameraHudScreen extends ConsumerStatefulWidget {
  const CameraHudScreen({super.key});

  @override
  ConsumerState<CameraHudScreen> createState() => _CameraHudScreenState();
}

class _CameraHudScreenState extends ConsumerState<CameraHudScreen> {
  @override
  void initState() {
    super.initState();
    // Lock to landscape & keep screen awake
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    WakelockPlus.enable();
  }

  @override
  void dispose() {
    // Restore portrait orientation & system overlays
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cameraService = ref.watch(cameraStreamServiceProvider);
    final telemetry = ref.watch(telemetryProvider);
    final status = telemetry.status;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Fullscreen WebRTC / MJPEG Video Stage
          Positioned.fill(
            child: cameraService.state == CameraPlayState.streaming
                ? (cameraService.lastJpegBytes != null
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
                      ))
                : const Center(
                    child: CircularProgressIndicator(color: AppColors.accentGreen),
                  ),
          ),

          // Top Left: AI Guard Status Pill
          Positioned(
            top: 16,
            left: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white24),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.shieldCheck, size: 14, color: AppColors.accentGreen),
                  const SizedBox(width: 6),
                  Text(
                    status?.watchdog?.online ?? false ? 'AI Guard: Active' : 'AI Guard: Standby',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),

          // Top Right: Live Badge & Exit Fullscreen Button
          Positioned(
            top: 16,
            right: 16,
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.accentGreen.withValues(alpha: 0.5)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(color: AppColors.accentGreen, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        cameraService.continuousOverride ? 'Continuous' : '${cameraService.remainingSeconds}s',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                IconButton(
                  icon: const Icon(LucideIcons.minimize2, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),

          // Bottom Left: Semi-Transparent Dark Glass Telemetry Pill
          if (status != null)
            Positioned(
              bottom: 16,
              left: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      status.jobName ?? 'Active Print',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text('${status.progress.toStringAsFixed(1)}%',
                            style: const TextStyle(color: AppColors.accentGreen, fontWeight: FontWeight.bold, fontSize: 12)),
                        const SizedBox(width: 8),
                        Text('Layer ${status.currentLayer}/${status.totalLayers}',
                            style: const TextStyle(color: Colors.white70, fontSize: 11)),
                        const SizedBox(width: 12),
                        Text('Nozzle: ${status.nozzleTemperature.toStringAsFixed(0)}\u00B0C',
                            style: const TextStyle(color: AppColors.toolheadT0, fontSize: 11)),
                        const SizedBox(width: 8),
                        Text('Bed: ${status.bedTemperature.toStringAsFixed(0)}\u00B0C',
                            style: const TextStyle(color: AppColors.bedHeat, fontSize: 11)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/printer_context.dart';
import '../../services/camera_stream_service.dart';
import '../../state/auth_provider.dart';
import '../../state/fleet_provider.dart';
import '../common/status_badge.dart';

class FleetPrinterCard extends ConsumerStatefulWidget {
  final FleetOverviewPrinter printer;
  final VoidCallback onTap;

  const FleetPrinterCard({
    super.key,
    required this.printer,
    required this.onTap,
  });

  @override
  ConsumerState<FleetPrinterCard> createState() => _FleetPrinterCardState();
}

class _FleetPrinterCardState extends ConsumerState<FleetPrinterCard> {
  CameraStreamService? _cardCamera;
  bool _isPlaying = false;

  void _onCameraChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _cardCamera?.removeListener(_onCameraChanged);
    _cardCamera?.dispose();
    super.dispose();
  }

  void _togglePlay() {
    if (_isPlaying) {
      _cardCamera?.pauseStream();
      setState(() => _isPlaying = false);
    } else {
      if (_cardCamera == null) {
        final apiClient = ref.read(apiClientProvider);
        _cardCamera = CameraStreamService(apiClient: apiClient);
        _cardCamera!.addListener(_onCameraChanged);
        _cardCamera!.initRenderer().then((_) {
          if (mounted) {
            _cardCamera!.startStream(contextId: widget.printer.contextId);
            setState(() => _isPlaying = true);
          }
        });
      } else {
        _cardCamera!.startStream(contextId: widget.printer.contextId);
        setState(() => _isPlaying = true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.printer;
    final isPrinting = p.statusText.toLowerCase().contains('print') || p.statusText.toLowerCase().contains('busy');
    final isCompleted = p.statusText.toLowerCase().contains('complete') || (p.progress >= 100 && !isPrinting && p.jobName != null);
    final cardCameraState = _cardCamera?.state ?? CameraPlayState.idle;
    final fleetErrors = ref.watch(fleetProvider).cameraErrors;
    final hasCameraError = cardCameraState == CameraPlayState.busy || fleetErrors.containsKey(p.name);

    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 2,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: widget.onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Prominent Top Header (Printer Name, Model, Status, Chevron)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: isPrinting ? AppColors.accentGreen : (p.statusText.toLowerCase().contains('idle') ? AppColors.accentGreen : AppColors.textMuted),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Row(
                      children: [
                        Flexible(
                          child: Text(
                            p.name,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.textPrimary),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceSecondary,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Text(
                            p.model,
                            style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusBadge(
                    statusText: p.statusText,
                    isPrinting: isPrinting,
                    isCompleted: isCompleted,
                  ),
                  const SizedBox(width: 6),
                  const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.textMuted),
                ],
              ),
            ),

            // 2. Widescreen 16:9 Camera Stage
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Container(
                color: Colors.black,
                child: Stack(
                  children: [
                    // Video / MJPEG View
                    if (_isPlaying && cardCameraState == CameraPlayState.streaming && _cardCamera != null)
                      _cardCamera!.lastJpegBytes != null
                          ? Image.memory(
                              _cardCamera!.lastJpegBytes!,
                              gaplessPlayback: true,
                              fit: BoxFit.contain,
                              width: double.infinity,
                              height: double.infinity,
                            )
                          : RTCVideoView(
                              _cardCamera!.renderer,
                              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                            ),

                    // Connecting Spinner
                    if (_isPlaying && cardCameraState == CameraPlayState.connecting)
                      const Center(child: CircularProgressIndicator(color: AppColors.accentGreen, strokeWidth: 2)),

                    // Busy / Offline Notice
                    if (hasCameraError)
                      Container(
                        color: Colors.black.withValues(alpha: 0.9),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        child: Center(
                          child: SingleChildScrollView(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(LucideIcons.videoOff, size: 22, color: AppColors.warning),
                                const SizedBox(height: 4),
                                const Text(
                                  'Camera In Use / Offline',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: AppColors.warningLight, fontSize: 12, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  p.model.toLowerCase().contains('creator') || p.model.toLowerCase().contains('5m')
                                      ? 'May be open in Flash Studio or another app'
                                      : 'May be open in another viewer',
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
                                ),
                                const SizedBox(height: 6),
                                ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.warning,
                                    foregroundColor: Colors.black,
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                                    minimumSize: Size.zero,
                                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  ),
                                  onPressed: () {
                                    ref.read(fleetProvider.notifier).clearCardCameraError(p.name);
                                    _cardCamera?.startStream(contextId: p.contextId);
                                  },
                                  child: const Text('Retry', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),

                    // Standby Overlay (Default on page open)
                    if (!_isPlaying && !hasCameraError)
                      Container(
                        color: Colors.black.withValues(alpha: 0.75),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: AppColors.accentGreen.withValues(alpha: 0.15),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(LucideIcons.video, size: 26, color: AppColors.accentGreen),
                              ),
                              const SizedBox(height: 8),
                              ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.surfaceSecondary,
                                  foregroundColor: AppColors.textPrimary,
                                  side: const BorderSide(color: AppColors.border),
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                  minimumSize: Size.zero,
                                ),
                                onPressed: _togglePlay,
                                icon: const Icon(LucideIcons.play, size: 14, color: AppColors.accentGreen),
                                label: const Text('Watch Live Feed', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        ),
                      ),

                    // Live Badge in corner when streaming
                    if (_isPlaying && cardCameraState == CameraPlayState.streaming) ...[
                      Positioned(
                        top: 8,
                        left: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.7),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(color: AppColors.accentGreen, shape: BoxShape.circle),
                              ),
                              const SizedBox(width: 5),
                              const Text('LIVE', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        top: 8,
                        right: 8,
                        child: GestureDetector(
                          onTap: _togglePlay,
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.65), shape: BoxShape.circle),
                            child: const Icon(LucideIcons.pause, size: 14, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            // 3. Telemetry & Job Section
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (p.jobName != null && p.jobName!.isNotEmpty) ...[
                    Row(
                      children: [
                        const Icon(LucideIcons.fileCode, size: 14, color: AppColors.accentGreen),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            p.jobName!,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${p.progress.toStringAsFixed(0)}%',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.accentGreen),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (p.progress / 100.0).clamp(0.0, 1.0),
                        minHeight: 6,
                        backgroundColor: AppColors.border,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          isCompleted ? AppColors.info : AppColors.accentGreen,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Layer ${p.currentLayer} of ${p.totalLayers}',
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                        ),
                        Text(
                          isPrinting ? 'Printing' : (isCompleted ? 'Finished' : 'Paused'),
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ] else ...[
                    const Row(
                      children: [
                        Icon(LucideIcons.checkCircle2, size: 14, color: AppColors.accentGreen),
                        SizedBox(width: 6),
                        Text('Ready · No active print job', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],

                  // Temperature Badges & Quick Action
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSecondary,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.flame, size: 13, color: AppColors.toolheadT0),
                            const SizedBox(width: 5),
                            Text(
                              'Nozzle: ${p.nozzleTemp.toStringAsFixed(0)}\u00B0C',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSecondary,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.thermometer, size: 13, color: AppColors.bedHeat),
                            const SizedBox(width: 5),
                            Text(
                              'Bed: ${p.bedTemp.toStringAsFixed(0)}\u00B0C',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      const Text(
                        'Open Device ›',
                        style: TextStyle(fontSize: 11, color: AppColors.accentGreen, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

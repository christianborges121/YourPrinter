import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/connection_provider.dart';
import '../../state/fleet_provider.dart';
import '../../state/printer_context_provider.dart';
import '../common/not_configured_view.dart';
import '../common/yourprinter_logo.dart';
import 'fleet_printer_card.dart';

class FleetScreen extends ConsumerStatefulWidget {
  final Function(int) onTabSelected;

  const FleetScreen({super.key, required this.onTabSelected});

  @override
  ConsumerState<FleetScreen> createState() => _FleetScreenState();
}

class _FleetScreenState extends ConsumerState<FleetScreen> {
  bool _camerasVisible = true;
  bool? _overrideStreaming;
  int? _timedCountdown;
  Timer? _countdownTimer;

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _toggleTimedPreview() {
    if (_timedCountdown != null) {
      _countdownTimer?.cancel();
      setState(() {
        _timedCountdown = null;
        _overrideStreaming = false;
      });
    } else {
      setState(() {
        _timedCountdown = 30;
        _overrideStreaming = true;
      });
      _countdownTimer?.cancel();
      _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        if (_timedCountdown != null && _timedCountdown! > 1) {
          setState(() => _timedCountdown = _timedCountdown! - 1);
        } else {
          timer.cancel();
          setState(() {
            _timedCountdown = null;
            _overrideStreaming = false;
          });
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final fleetState = ref.watch(fleetProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const YourPrinterLogo(size: 24),
            const SizedBox(width: 10),
            const Text('Fleet Overview'),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.surfaceSecondary,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                '${fleetState.printers.length} Printers',
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            tooltip: 'Refresh Fleet',
            onPressed: () => ref.read(fleetProvider.notifier).fetchOverview(),
          ),
        ],
      ),
      body: fleetState.isLoading && fleetState.printers.isEmpty
          ? const Center(child: CircularProgressIndicator(color: AppColors.accentGreen))
          : ref.watch(connectionProvider).status == ServerConnectionStatus.unreachable
              ? NotConfiguredView(onOpenSettings: () => widget.onTabSelected(3))
              : fleetState.printers.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.printer, size: 48, color: AppColors.textMuted),
                            const SizedBox(height: 12),
                            const Text('No Printers Added Yet', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 6),
                            const Text(
                              'Connected to YourPrinter server, but no active printers were found. Add your printer in the YourPrinter desktop application.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                            ),
                            const SizedBox(height: 16),
                            OutlinedButton.icon(
                              onPressed: () => ref.read(fleetProvider.notifier).fetchOverview(),
                              icon: const Icon(LucideIcons.refreshCw, size: 14),
                              label: const Text('Refresh Fleet'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : Column(
                      children: [
                        // Master Fleet Controls Bar (Show/Hide Cameras, Stream/Pause All, 30s Timed Preview)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: const BoxDecoration(
                            color: AppColors.surface,
                            border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
                          ),
                          child: Row(
                            children: [
                              // 1. Show / Hide Cameras Toggle
                              InkWell(
                                onTap: () => setState(() => _camerasVisible = !_camerasVisible),
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: _camerasVisible ? AppColors.accentGreenSubtle : AppColors.surfaceSecondary,
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: _camerasVisible ? AppColors.accentGreen.withValues(alpha: 0.4) : AppColors.border),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        _camerasVisible ? LucideIcons.video : LucideIcons.videoOff,
                                        size: 13,
                                        color: _camerasVisible ? AppColors.accentGreen : AppColors.textMuted,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        _camerasVisible ? 'Cameras' : 'Hidden',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _camerasVisible ? AppColors.accentGreen : AppColors.textMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                              const Spacer(),

                              // 2. Stream All / Pause All Batch Trigger
                              InkWell(
                                onTap: () {
                                  final next = !(_overrideStreaming == true);
                                  setState(() {
                                    _overrideStreaming = next;
                                    if (!next && _timedCountdown != null) {
                                      _countdownTimer?.cancel();
                                      _timedCountdown = null;
                                    }
                                  });
                                },
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: _overrideStreaming == true ? AppColors.accentGreenSubtle : AppColors.surfaceSecondary,
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: _overrideStreaming == true ? AppColors.accentGreen.withValues(alpha: 0.4) : AppColors.border),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        _overrideStreaming == true ? LucideIcons.pause : LucideIcons.play,
                                        size: 13,
                                        color: _overrideStreaming == true ? AppColors.accentGreen : AppColors.textMuted,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        _overrideStreaming == true ? 'Pause All' : 'Stream All',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _overrideStreaming == true ? AppColors.accentGreen : AppColors.textMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                              const SizedBox(width: 6),

                              // 3. 30s Timed Preview
                              InkWell(
                                onTap: _toggleTimedPreview,
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: _timedCountdown != null ? AppColors.infoSubtle : AppColors.surfaceSecondary,
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: _timedCountdown != null ? AppColors.info : AppColors.border),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        LucideIcons.clock,
                                        size: 13,
                                        color: _timedCountdown != null ? AppColors.info : AppColors.textMuted,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        _timedCountdown != null ? '${_timedCountdown}s' : '30s Preview',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _timedCountdown != null ? AppColors.info : AppColors.textMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Printer List View
                        Expanded(
                          child: RefreshIndicator(
                            color: AppColors.accentGreen,
                            onRefresh: () => ref.read(fleetProvider.notifier).fetchOverview(),
                            child: ListView.separated(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              itemCount: fleetState.printers.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 14),
                              itemBuilder: (context, index) {
                                final printer = fleetState.printers[index];
                                return FleetPrinterCard(
                                  printer: printer,
                                  camerasVisible: _camerasVisible,
                                  overrideStreaming: _overrideStreaming,
                                  onTap: () {
                                    if (printer.contextId != null) {
                                      ref.read(printerContextProvider.notifier).switchContext(printer.contextId!);
                                    }
                                    // Switch to Dashboard Tab (index 1)
                                    widget.onTabSelected(1);
                                  },
                                );
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
    );
  }
}

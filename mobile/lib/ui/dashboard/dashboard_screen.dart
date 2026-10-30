import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/printer_context.dart';
import '../../state/auth_provider.dart';
import '../../state/connection_provider.dart';
import '../../state/fleet_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';
import '../common/not_configured_view.dart';
import '../common/status_badge.dart';
import '../controls/control_panel_card.dart';
import '../controls/watchdog_sheet.dart';
import 'ams_spool_card.dart';
import 'camera_panel.dart';
import 'job_progress_card.dart';
import 'temperature_card.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  late PageController _pageController;
  int _lastKnownPageIndex = 0;

  @override
  void initState() {
    super.initState();
    final contextState = ref.read(printerContextProvider);
    final activeId = contextState.activeContextId;
    final initialIndex = contextState.contexts.indexWhere((c) => c.contextId == activeId);
    _lastKnownPageIndex = initialIndex >= 0 ? initialIndex : 0;
    _pageController = PageController(initialPage: _lastKnownPageIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _syncPageWithActiveContext(List<PrinterContext> contexts, String? activeId) {
    if (!_pageController.hasClients || contexts.isEmpty || activeId == null) return;
    final targetIndex = contexts.indexWhere((c) => c.contextId == activeId);
    if (targetIndex >= 0 && targetIndex != _lastKnownPageIndex) {
      _lastKnownPageIndex = targetIndex;
      if (_pageController.page?.round() != targetIndex) {
        _pageController.animateToPage(
          targetIndex,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final contextState = ref.watch(printerContextProvider);
    final telemetry = ref.watch(telemetryProvider);
    final connState = ref.watch(connectionProvider);
    final fleetState = ref.watch(fleetProvider);

    // Sync external context changes (e.g. picked via Fleet card or Dropdown)
    ref.listen<PrinterContextState>(printerContextProvider, (previous, next) {
      if (next.activeContextId != previous?.activeContextId) {
        _syncPageWithActiveContext(next.contexts, next.activeContextId);
      }
    });

    if (connState.status == ServerConnectionStatus.unreachable) {
      return Scaffold(
        appBar: AppBar(title: const Text('Device Dashboard'), centerTitle: true),
        body: const NotConfiguredView(),
      );
    }

    if (contextState.isLoading && contextState.contexts.isEmpty) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.accentGreen)),
      );
    }

    if (contextState.contexts.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Device Dashboard'), centerTitle: true),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.printer, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                const Text('No Printers Connected', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                const Text(
                  'YourPrinter server is running, but no printers are active. Add your printer in the desktop application.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => ref.read(printerContextProvider.notifier).fetchContexts(),
                  icon: const Icon(LucideIcons.refreshCw, size: 14),
                  label: const Text('Refresh Printers'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final activeIndex = contextState.contexts.indexWhere((c) => c.contextId == contextState.activeContextId);
    final safeIndex = activeIndex >= 0 ? activeIndex : 0;

    return Scaffold(
      appBar: AppBar(
        title: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: contextState.contexts.any((c) => c.contextId == contextState.activeContextId)
                ? contextState.activeContextId
                : contextState.contexts.first.contextId,
            dropdownColor: AppColors.surface,
            icon: const Icon(LucideIcons.chevronDown, size: 16, color: AppColors.textPrimary),
            items: contextState.contexts.map((ctx) {
              return DropdownMenuItem<String>(
                value: ctx.contextId,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: ctx.isConnected ? AppColors.accentGreen : AppColors.textMuted,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      ctx.name,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '(${ctx.model})',
                      style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              );
            }).toList(),
            onChanged: (newId) {
              if (newId != null) {
                ref.read(printerContextProvider.notifier).switchContext(newId);
              }
            },
          ),
        ),
        actions: [
          // AI Watchdog Guard icon button (Always visible)
          Builder(
            builder: (ctx) {
              final watchdog = telemetry.status?.watchdog;
              final isOnline = watchdog?.online ?? false;
              final isAlert = isOnline && (watchdog?.confidence ?? 0.0) >= (watchdog?.threshold ?? 0.20);
              final icon = isOnline ? LucideIcons.shieldCheck : LucideIcons.shieldAlert;
              final color = !isOnline
                  ? AppColors.textMuted
                  : (isAlert ? AppColors.error : AppColors.accentGreen);
              final tooltip = !isOnline
                  ? 'AI Watchdog Guard: Offline'
                  : (isAlert
                      ? 'AI Watchdog: Defect Alert (${((watchdog?.confidence ?? 0.0) * 100).toStringAsFixed(0)}%)'
                      : 'AI Watchdog Guard: Active');

              return IconButton(
                icon: Icon(icon, size: 20, color: color),
                tooltip: tooltip,
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: AppColors.surface,
                    builder: (_) => const WatchdogSheet(),
                  );
                },
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // If more than 1 printer, display sleek swipe & cycle indicator bar
          if (contextState.contexts.length > 1)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
              ),
              child: Row(
                children: [
                  // Previous printer chevron
                  IconButton(
                    icon: const Icon(LucideIcons.chevronLeft, size: 18),
                    color: safeIndex > 0 ? AppColors.textPrimary : AppColors.textMuted.withValues(alpha: 0.3),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    tooltip: 'Previous Printer',
                    onPressed: safeIndex > 0
                        ? () => _pageController.animateToPage(
                              safeIndex - 1,
                              duration: const Duration(milliseconds: 300),
                              curve: Curves.easeInOut,
                            )
                        : null,
                  ),
                  const SizedBox(width: 8),

                  // Carousel dot indicators
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: List.generate(contextState.contexts.length, (dotIdx) {
                      final isSelected = dotIdx == safeIndex;
                      return GestureDetector(
                        onTap: () {
                          if (dotIdx != safeIndex) {
                            _pageController.animateToPage(
                              dotIdx,
                              duration: const Duration(milliseconds: 300),
                              curve: Curves.easeInOut,
                            );
                          }
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: isSelected ? 18 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: isSelected ? AppColors.accentGreen : AppColors.borderSubtle,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(width: 8),

                  // Next printer chevron
                  IconButton(
                    icon: const Icon(LucideIcons.chevronRight, size: 18),
                    color: safeIndex < contextState.contexts.length - 1
                        ? AppColors.textPrimary
                        : AppColors.textMuted.withValues(alpha: 0.3),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    tooltip: 'Next Printer',
                    onPressed: safeIndex < contextState.contexts.length - 1
                        ? () => _pageController.animateToPage(
                              safeIndex + 1,
                              duration: const Duration(milliseconds: 300),
                              curve: Curves.easeInOut,
                            )
                        : null,
                  ),

                  const Spacer(),
                  Text(
                    '${safeIndex + 1}/${contextState.contexts.length}',
                    style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),

          // Horizontal PageView for cycling printers via left/right swipe
          Expanded(
            child: PageView.builder(
              controller: _pageController,
              itemCount: contextState.contexts.length,
              physics: const BouncingScrollPhysics(),
              onPageChanged: (newIndex) {
                _lastKnownPageIndex = newIndex;
                final targetContext = contextState.contexts[newIndex];
                if (targetContext.contextId != contextState.activeContextId) {
                  ref.read(printerContextProvider.notifier).switchContext(targetContext.contextId);
                }
              },
              itemBuilder: (context, index) {
                final ctx = contextState.contexts[index];
                if (index == safeIndex) {
                  // Active interactive dashboard
                  return RefreshIndicator(
                    color: AppColors.accentGreen,
                    onRefresh: () async {
                      await ref.read(printerContextProvider.notifier).fetchContexts();
                    },
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final isWide = constraints.maxWidth > 768;
                        final watchdog = telemetry.status?.watchdog;
                        final hasAutoPause = watchdog?.autoPauseTriggered == true;

                        Widget content;
                        if (isWide) {
                          content = Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (hasAutoPause) _buildAutoPauseBanner(context, ctx.contextId),
                              const Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Left Column: Camera + Job Progress
                                  Expanded(
                                    flex: 5,
                                    child: Column(
                                      children: [
                                        CameraPanel(),
                                        SizedBox(height: 10),
                                        JobProgressCard(),
                                      ],
                                    ),
                                  ),
                                  SizedBox(width: 12),
                                  // Right Column: Temperatures + AMS/Spoolman + Controls
                                  Expanded(
                                    flex: 5,
                                    child: Column(
                                      children: [
                                        TemperatureCard(),
                                        SizedBox(height: 10),
                                        AmsSpoolCard(),
                                        SizedBox(height: 10),
                                        ControlPanelCard(),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 24),
                            ],
                          );
                        } else {
                          content = Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (hasAutoPause) _buildAutoPauseBanner(context, ctx.contextId),
                              const CameraPanel(),
                              const SizedBox(height: 10),
                              const JobProgressCard(),
                              const SizedBox(height: 10),
                              const TemperatureCard(),
                              const SizedBox(height: 10),
                              const AmsSpoolCard(),
                              const SizedBox(height: 10),
                              const ControlPanelCard(),
                              const SizedBox(height: 24),
                            ],
                          );
                        }

                        return Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 1060),
                            child: ListView(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              children: [content],
                            ),
                          ),
                        );
                      },
                    ),
                  );
                } else {
                  // Adjacent preview card while swiping
                  final fleetPrinter = fleetState.printers.cast<FleetOverviewPrinter?>().firstWhere(
                        (p) => p?.contextId == ctx.contextId,
                        orElse: () => null,
                      );
                  return _buildPrinterPreview(ctx, fleetPrinter);
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAutoPauseBanner(BuildContext context, String? contextId) {
    final printerService = ref.read(printerServiceProvider);
    final watchdog = ref.watch(telemetryProvider).status?.watchdog;
    final confidenceStr = watchdog != null && watchdog.confidence > 0
        ? ' (${(watchdog.confidence * 100).toStringAsFixed(0)}% risk)'
        : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.65), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(LucideIcons.triangleAlert, color: AppColors.error, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Print Paused by AI Watchdog: Defect detected$confidenceStr',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Spaghetti, detached print, or failure detected in chamber.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.textPrimary,
                  side: const BorderSide(color: AppColors.border),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: AppColors.surface,
                    builder: (_) => const WatchdogSheet(),
                  );
                },
                icon: const Icon(LucideIcons.eye, size: 14, color: AppColors.accentGreen),
                label: const Text('Inspect Snapshot', style: TextStyle(fontSize: 12)),
              ),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accentGreen,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: () async {
                  final success = await printerService.resumePrint(contextId: contextId);
                  if (context.mounted && !success) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Failed to resume print')),
                    );
                  }
                },
                icon: const Icon(LucideIcons.play, size: 14),
                label: const Text('Resume', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: () async {
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Cancel Print?'),
                      content: const Text('Are you sure you want to cancel the active print job?'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(ctx).pop(false),
                          child: const Text('Keep Paused'),
                        ),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
                          onPressed: () => Navigator.of(ctx).pop(true),
                          child: const Text('Cancel Print'),
                        ),
                      ],
                    ),
                  );
                  if (confirm == true) {
                    await printerService.cancelPrint(contextId: contextId);
                  }
                },
                icon: const Icon(LucideIcons.x, size: 14),
                label: const Text('Cancel', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPrinterPreview(PrinterContext ctx, FleetOverviewPrinter? fleetPrinter) {
    final isPrinting = fleetPrinter != null &&
        (fleetPrinter.statusText.toLowerCase().contains('print') ||
            fleetPrinter.statusText.toLowerCase().contains('busy'));
    final isCompleted = fleetPrinter != null &&
        (fleetPrinter.statusText.toLowerCase().contains('complete') ||
            (fleetPrinter.progress >= 100 && !isPrinting));

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Card(
                clipBehavior: Clip.antiAlias,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: AppColors.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.accentGreen.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(LucideIcons.printer, size: 28, color: AppColors.accentGreen),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ctx.name,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppColors.textPrimary),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  ctx.model,
                                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                                ),
                              ],
                            ),
                          ),
                          if (fleetPrinter != null)
                            StatusBadge(
                              statusText: fleetPrinter.statusText,
                              isPrinting: isPrinting,
                              isCompleted: isCompleted,
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Divider(),
                      const SizedBox(height: 12),
                      if (fleetPrinter != null && fleetPrinter.jobName != null && fleetPrinter.jobName!.isNotEmpty) ...[
                        Row(
                          children: [
                            const Icon(LucideIcons.fileCode, size: 14, color: AppColors.accentGreen),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                fleetPrinter.jobName!,
                                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              '${fleetPrinter.progress.toStringAsFixed(0)}%',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (fleetPrinter.progress / 100.0).clamp(0.0, 1.0),
                            minHeight: 6,
                            backgroundColor: AppColors.border,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              isCompleted ? AppColors.info : AppColors.accentGreen,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            Text('Nozzle: ${fleetPrinter.nozzleTemp.toStringAsFixed(0)}\u00B0C',
                                style: const TextStyle(fontSize: 12, color: AppColors.toolheadT0)),
                            Text('Bed: ${fleetPrinter.bedTemp.toStringAsFixed(0)}\u00B0C',
                                style: const TextStyle(fontSize: 12, color: AppColors.bedHeat)),
                          ],
                        ),
                      ] else ...[
                        const Text(
                          'Ready to print',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSecondary,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.arrowLeftRight, size: 14, color: AppColors.accentGreen),
                            const SizedBox(width: 6),
                            Text(
                              'Release swipe to switch to ${ctx.name}',
                              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

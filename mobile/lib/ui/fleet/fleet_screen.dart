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

class FleetScreen extends ConsumerWidget {
  final Function(int) onTabSelected;

  const FleetScreen({super.key, required this.onTabSelected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              ? NotConfiguredView(onOpenSettings: () => onTabSelected(3))
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
                  : RefreshIndicator(
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
                        onTap: () {
                          if (printer.contextId != null) {
                            ref.read(printerContextProvider.notifier).switchContext(printer.contextId!);
                          }
                          // Switch to Dashboard Tab (index 1)
                          onTabSelected(1);
                        },
                      );
                    },
                  ),
                ),
    );
  }
}

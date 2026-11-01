import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/material_station.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';

class SpoolSelectSheet extends ConsumerStatefulWidget {
  const SpoolSelectSheet({super.key});

  @override
  ConsumerState<SpoolSelectSheet> createState() => _SpoolSelectSheetState();
}

class _SpoolSelectSheetState extends ConsumerState<SpoolSelectSheet> {
  final TextEditingController _searchController = TextEditingController();
  List<ActiveSpoolData> _spools = [];
  bool _isLoading = false;
  int? _selectingSpoolId;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchSpools();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchSpools([String query = '']) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final printerService = ref.read(printerServiceProvider);
      final spools = await printerService.searchSpoolmanSpools(search: query);
      if (mounted) {
        setState(() {
          _spools = spools;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to connect to Spoolman server';
          _isLoading = false;
        });
      }
    }
  }

  Color _parseColor(String hex) {
    var clean = hex.replaceAll('#', '').trim();
    if (clean.length == 6) {
      clean = 'FF$clean';
    }
    final val = int.tryParse(clean, radix: 16);
    return val != null ? Color(val) : AppColors.accentGreen;
  }

  Future<void> _handleSelectSpool(ActiveSpoolData spool) async {
    setState(() => _selectingSpoolId = spool.id);
    final activeId = ref.read(printerContextProvider).activeContextId;
    final printerService = ref.read(printerServiceProvider);
    try {
      final ok = await printerService.selectSpool(spool.id, contextId: activeId);
      if (mounted) {
        if (ok) {
          await ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
          if (mounted) Navigator.of(context).pop();
        } else {
          setState(() {
            _error = 'Failed to assign spool';
            _selectingSpoolId = null;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Error assigning spool';
          _selectingSpoolId = null;
        });
      }
    }
  }

  Future<void> _handleClearSpool() async {
    final activeId = ref.read(printerContextProvider).activeContextId;
    final printerService = ref.read(printerServiceProvider);
    setState(() => _isLoading = true);
    try {
      final ok = await printerService.clearActiveSpool(contextId: activeId);
      if (mounted) {
        if (ok) {
          await ref.read(telemetryProvider.notifier).fetchStatus(contextId: activeId);
          if (mounted) Navigator.of(context).pop();
        } else {
          setState(() {
            _error = 'Failed to clear spool';
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Error clearing spool';
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeSpool = ref.watch(telemetryProvider).activeSpool;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.85;

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.borderSubtle,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Header
            Row(
              children: [
                const Icon(LucideIcons.layers, size: 18, color: AppColors.accentGreen),
                const SizedBox(width: 8),
                const Text(
                  'Select Spoolman Spool',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                ),
                const Spacer(),
                if (activeSpool != null)
                  TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: AppColors.error),
                    onPressed: _handleClearSpool,
                    icon: const Icon(LucideIcons.x, size: 14),
                    label: const Text('Clear Active', style: TextStyle(fontSize: 12)),
                  ),
                IconButton(
                  icon: const Icon(LucideIcons.x, size: 18),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Search Bar
            TextField(
              controller: _searchController,
              onChanged: (val) => _fetchSpools(val),
              style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Search by filament, vendor, or material...',
                hintStyle: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                prefixIcon: const Icon(LucideIcons.search, size: 16, color: AppColors.textMuted),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(LucideIcons.x, size: 14),
                        onPressed: () {
                          _searchController.clear();
                          _fetchSpools();
                        },
                      )
                    : null,
                filled: true,
                fillColor: AppColors.surfaceSecondary,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppColors.accentGreen),
                ),
              ),
            ),
            const SizedBox(height: 10),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.alertCircle, size: 16, color: AppColors.error),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.error))),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],

            // Spool List
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: AppColors.accentGreen))
                  : _spools.isEmpty
                      ? const Center(
                          child: Text(
                            'No spools found matching search',
                            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                          ),
                        )
                      : ListView.separated(
                          itemCount: _spools.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final spool = _spools[index];
                            final isSelected = activeSpool?.id == spool.id;
                            final isSelecting = _selectingSpoolId == spool.id;
                            final discColor = _parseColor(spool.colorHex);

                            return InkWell(
                              key: Key('spool_item_${spool.id}'),
                              onTap: isSelecting ? null : () => _handleSelectSpool(spool),
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? AppColors.accentGreen.withValues(alpha: 0.1)
                                      : AppColors.surfaceSecondary,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected ? AppColors.accentGreen : AppColors.border,
                                    width: isSelected ? 1.5 : 1,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    // Spool color swatch
                                    Container(
                                      width: 32,
                                      height: 32,
                                      decoration: BoxDecoration(
                                        color: discColor,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
                                        boxShadow: [
                                          BoxShadow(
                                            color: Colors.black.withValues(alpha: 0.2),
                                            blurRadius: 4,
                                          ),
                                        ],
                                      ),
                                      child: const Center(
                                        child: Icon(LucideIcons.disc, size: 12, color: Colors.white70),
                                      ),
                                    ),
                                    const SizedBox(width: 12),

                                    // Spool details
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            '${spool.vendor ?? 'Generic'} ${spool.name}',
                                            style: const TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.textPrimary,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${spool.material ?? 'PLA'} \u00B7 ${spool.remainingWeight.toStringAsFixed(0)}g left',
                                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                                          ),
                                        ],
                                      ),
                                    ),

                                    // Selection state / loading indicator
                                    if (isSelecting)
                                      const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accentGreen),
                                      )
                                    else if (isSelected)
                                      const Icon(LucideIcons.check, size: 18, color: AppColors.accentGreen),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

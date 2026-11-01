import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/job_file.dart';
import '../../models/print_history.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';

class FilesScreen extends ConsumerStatefulWidget {
  const FilesScreen({super.key});

  @override
  ConsumerState<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends ConsumerState<FilesScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  List<WebUIJobFile> _recentFiles = [];
  List<WebUIJobFile> _localFiles = [];
  List<PrintHistoryItem> _historyItems = [];
  String _searchQuery = '';
  String _historyFilter = 'all'; // 'all', 'completed', 'cancelled', 'failed'
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadFiles();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadFiles() async {
    setState(() => _isLoading = true);
    final activeContext = ref.read(printerContextProvider).activeContext;
    final printerService = ref.read(printerServiceProvider);
    final prefs = ref.read(preferencesServiceProvider);

    try {
      final recent = await printerService.getRecentJobs(contextId: activeContext?.contextId);
      final local = await printerService.getLocalJobs(contextId: activeContext?.contextId);

      // Seed history from recent jobs if history is currently empty
      if (recent.isNotEmpty) {
        await prefs.seedHistoryFromRecentJobs(
          recent,
          activeContext?.name ?? 'Printer',
          activeContext?.contextId,
        );
      }
      final history = prefs.getPrintHistory();

      if (mounted) {
        setState(() {
          _recentFiles = recent;
          _localFiles = local;
          _historyItems = history;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        final history = prefs.getPrintHistory();
        setState(() {
          _historyItems = history;
          _isLoading = false;
        });
      }
    }
  }

  String _formatDuration(int seconds) {
    if (seconds <= 0) return '--';
    final hrs = seconds ~/ 3600;
    final mins = (seconds % 3600) ~/ 60;
    return hrs > 0 ? '${hrs}h ${mins}m' : '${mins}m';
  }

  String _formatDate(DateTime dt) {
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return 'Today ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final filteredRecent = _recentFiles.where((f) {
      if (_searchQuery.isEmpty) return true;
      final name = (f.displayName ?? f.filename).toLowerCase();
      return name.contains(_searchQuery);
    }).toList();

    final filteredLocal = _localFiles.where((f) {
      if (_searchQuery.isEmpty) return true;
      final name = (f.displayName ?? f.filename).toLowerCase();
      return name.contains(_searchQuery);
    }).toList();

    final filteredHistory = _historyItems.where((item) {
      if (_historyFilter != 'all' && item.status.toLowerCase() != _historyFilter) {
        return false;
      }
      if (_searchQuery.isEmpty) return true;
      final name = (item.displayName.isNotEmpty ? item.displayName : item.filename).toLowerCase();
      final printer = item.printerName.toLowerCase();
      return name.contains(_searchQuery) || printer.contains(_searchQuery);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Device Files'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.accentGreen,
          labelColor: AppColors.accentGreen,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'Recent Prints'),
            Tab(text: 'Local Storage'),
            Tab(text: 'Print History'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            tooltip: 'Refresh Files',
            onPressed: _loadFiles,
          ),
        ],
      ),
      body: Column(
        children: [
          // Global Search Bar across all 3 tabs
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
            ),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
              onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Search prints by name or printer...',
                hintStyle: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                prefixIcon: const Icon(LucideIcons.search, size: 16, color: AppColors.textMuted),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(LucideIcons.x, size: 16, color: AppColors.textMuted),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      )
                    : null,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                filled: true,
                fillColor: AppColors.surfaceSecondary,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: AppColors.accentGreen),
                ),
              ),
            ),
          ),

          // Main Tab Views
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.accentGreen))
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _buildFileList(filteredRecent, emptyMsg: 'No recent print jobs found'),
                      _buildFileList(filteredLocal, emptyMsg: 'No local files stored on printer'),
                      _buildHistoryTab(filteredHistory),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildFileList(List<WebUIJobFile> files, {required String emptyMsg}) {
    if (files.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.fileCode, size: 36, color: AppColors.textMuted),
              const SizedBox(height: 8),
              Text(
                _searchQuery.isNotEmpty ? 'No files matching "$_searchQuery"' : emptyMsg,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: files.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final file = files[index];
        return Card(
          elevation: 1,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: AppColors.border),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            leading: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: AppColors.surfaceSecondary,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: const Icon(LucideIcons.fileCode, color: AppColors.accentGreen, size: 20),
            ),
            title: Text(
              file.displayName ?? file.filename,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textPrimary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Row(
              children: [
                if (file.printTime != null)
                  Text('${(file.printTime! ~/ 60)} min \u00B7 ', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                if (file.filamentWeight != null)
                  Text('${file.filamentWeight!.toStringAsFixed(1)}g', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
              ],
            ),
            trailing: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentGreen,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                minimumSize: Size.zero,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
              onPressed: () => _showStartPrintDialog(file),
              icon: const Icon(LucideIcons.play, size: 12),
              label: const Text('Print', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHistoryTab(List<PrintHistoryItem> items) {
    final stats = PrintHistoryStats.fromItems(_historyItems);

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        // 1. History Telemetry Header (4-box metrics grid matching WebUI)
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceSecondary,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(LucideIcons.barChart3, size: 16, color: AppColors.accentGreen),
                      SizedBox(width: 6),
                      Text(
                        'Print Farm Analytics',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textPrimary),
                      ),
                    ],
                  ),
                  if (_historyItems.isNotEmpty)
                    InkWell(
                      onTap: _confirmClearHistory,
                      borderRadius: BorderRadius.circular(4),
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        child: Row(
                          children: [
                            Icon(LucideIcons.trash2, size: 13, color: AppColors.error),
                            SizedBox(width: 4),
                            Text('Clear', style: TextStyle(fontSize: 11, color: AppColors.error, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: _buildMetricTile('Total Prints', '${stats.totalPrints}', LucideIcons.layers, AppColors.textPrimary)),
                  const SizedBox(width: 8),
                  Expanded(child: _buildMetricTile('Success Rate', '${stats.successRatePercent}%', LucideIcons.checkCircle2, AppColors.accentGreen)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _buildMetricTile('Cumulative Time', _formatDuration(stats.totalDurationSeconds), LucideIcons.clock, AppColors.textPrimary)),
                  const SizedBox(width: 8),
                  Expanded(child: _buildMetricTile('Filament Used', '${stats.totalFilamentMeters.toStringAsFixed(1)}m', LucideIcons.scale, AppColors.info)),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // 2. Status Filter Chips Row
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildFilterChip('All', 'all', _historyItems.length),
              const SizedBox(width: 6),
              _buildFilterChip('Completed', 'completed', stats.completedCount),
              const SizedBox(width: 6),
              _buildFilterChip('Cancelled', 'cancelled', stats.cancelledCount),
              const SizedBox(width: 6),
              _buildFilterChip('Failed', 'failed', stats.failedCount),
            ],
          ),
        ),

        const SizedBox(height: 10),

        // 3. Historical Prints List
        if (items.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 36),
              child: Column(
                children: [
                  const Icon(LucideIcons.clock, size: 36, color: AppColors.textMuted),
                  const SizedBox(height: 8),
                  Text(
                    _searchQuery.isNotEmpty
                        ? 'No historical prints matching "$_searchQuery"'
                        : 'No history found for current filter',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ),
          )
        else
          ...items.map((item) => _buildHistoryCard(item)),
      ],
    );
  }

  Widget _buildMetricTile(String label, String value, IconData icon, Color valColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
                Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: valColor)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String filterKey, int count) {
    final isSelected = _historyFilter == filterKey;
    return ChoiceChip(
      label: Text('$label ($count)', style: TextStyle(fontSize: 11, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
      selected: isSelected,
      selectedColor: AppColors.accentGreen.withValues(alpha: 0.2),
      backgroundColor: AppColors.surfaceSecondary,
      labelStyle: TextStyle(color: isSelected ? AppColors.accentGreen : AppColors.textMuted),
      side: BorderSide(color: isSelected ? AppColors.accentGreen : AppColors.border),
      onSelected: (_) => setState(() => _historyFilter = filterKey),
    );
  }

  Widget _buildHistoryCard(PrintHistoryItem item) {
    Color statusColor;
    IconData statusIcon;
    switch (item.status.toLowerCase()) {
      case 'completed':
        statusColor = AppColors.accentGreen;
        statusIcon = LucideIcons.checkCircle2;
        break;
      case 'cancelled':
        statusColor = AppColors.warning;
        statusIcon = LucideIcons.alertTriangle;
        break;
      case 'failed':
      default:
        statusColor = AppColors.error;
        statusIcon = LucideIcons.xCircle;
        break;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusIcon, size: 12, color: statusColor),
                      const SizedBox(width: 4),
                      Text(
                        item.status.toUpperCase(),
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: statusColor),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    item.displayName.isNotEmpty ? item.displayName : item.filename,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textPrimary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  icon: const Icon(LucideIcons.trash2, size: 14, color: AppColors.textMuted),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: 'Delete Entry',
                  onPressed: () => _deleteHistoryItem(item.id),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      _buildDetailBadge(LucideIcons.printer, item.printerName),
                      _buildDetailBadge(LucideIcons.calendar, _formatDate(item.endTime)),
                      _buildDetailBadge(LucideIcons.clock, _formatDuration(item.durationSeconds)),
                      if (item.filamentMeters != null && item.filamentMeters! > 0)
                        _buildDetailBadge(LucideIcons.scale, '${item.filamentMeters!.toStringAsFixed(1)}m'),
                    ],
                  ),
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.surfaceSecondary,
                    foregroundColor: AppColors.textPrimary,
                    side: const BorderSide(color: AppColors.border),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  ),
                  onPressed: () => _showStartPrintDialog(
                    WebUIJobFile(filename: item.filename, displayName: item.displayName),
                  ),
                  icon: const Icon(LucideIcons.rotateCcw, size: 12, color: AppColors.accentGreen),
                  label: const Text('Re-print', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailBadge(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: AppColors.textMuted),
        const SizedBox(width: 3),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
      ],
    );
  }

  Future<void> _deleteHistoryItem(String id) async {
    final prefs = ref.read(preferencesServiceProvider);
    await prefs.removePrintHistoryItem(id);
    setState(() {
      _historyItems = prefs.getPrintHistory();
    });
  }

  Future<void> _confirmClearHistory() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear Print History?'),
        content: const Text('This will clear all local print records and lifetime statistics from this device.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Clear All', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final prefs = ref.read(preferencesServiceProvider);
      await prefs.clearPrintHistory();
      setState(() {
        _historyItems = [];
      });
    }
  }

  void _showStartPrintDialog(WebUIJobFile file) {
    bool autoLeveling = true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Start Print Job?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                file.displayName ?? file.filename,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
              const SizedBox(height: 12),
              CheckboxListTile(
                title: const Text('Auto-Bed Leveling before start', style: TextStyle(fontSize: 13)),
                value: autoLeveling,
                activeColor: AppColors.accentGreen,
                contentPadding: EdgeInsets.zero,
                onChanged: (val) => setDialogState(() => autoLeveling = val ?? true),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                Navigator.of(ctx).pop();
                final activeContext = ref.read(printerContextProvider).activeContext;
                final printerService = ref.read(printerServiceProvider);
                final ok = await printerService.startJob(
                  file.filename,
                  leveling: autoLeveling,
                  contextId: activeContext?.contextId,
                );
                if (!context.mounted) return;
                if (ok) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Starting print job...')),
                  );
                }
              },
              child: const Text('Start Print'),
            ),
          ],
        ),
      ),
    );
  }
}

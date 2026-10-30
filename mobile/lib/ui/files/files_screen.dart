import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../models/job_file.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';

class FilesScreen extends ConsumerStatefulWidget {
  const FilesScreen({super.key});

  @override
  ConsumerState<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends ConsumerState<FilesScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<WebUIJobFile> _recentFiles = [];
  List<WebUIJobFile> _localFiles = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadFiles();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadFiles() async {
    setState(() => _isLoading = true);
    final activeContext = ref.read(printerContextProvider).activeContext;
    final printerService = ref.read(printerServiceProvider);

    try {
      final recent = await printerService.getRecentJobs(contextId: activeContext?.contextId);
      final local = await printerService.getLocalJobs(contextId: activeContext?.contextId);
      setState(() {
        _recentFiles = recent;
        _localFiles = local;
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            onPressed: _loadFiles,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.accentGreen))
          : TabBarView(
              controller: _tabController,
              children: [
                _buildFileList(_recentFiles),
                _buildFileList(_localFiles),
              ],
            ),
    );
  }

  Widget _buildFileList(List<WebUIJobFile> files) {
    if (files.isEmpty) {
      return const Center(
        child: Text('No print files found on printer', style: TextStyle(color: AppColors.textMuted)),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: files.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final file = files[index];
        return Card(
          child: ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: AppColors.surfaceSecondary, borderRadius: BorderRadius.circular(6)),
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
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                minimumSize: Size.zero,
              ),
              onPressed: () => _showStartPrintDialog(file),
              icon: const Icon(LucideIcons.play, size: 12),
              label: const Text('Print', style: TextStyle(fontSize: 11)),
            ),
          ),
        );
      },
    );
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/constants/app_colors.dart';
import '../../models/printer_status.dart';
import '../../state/auth_provider.dart';
import '../../state/printer_context_provider.dart';
import '../../state/telemetry_provider.dart';

class WatchdogSheet extends ConsumerStatefulWidget {
  const WatchdogSheet({super.key});

  @override
  ConsumerState<WatchdogSheet> createState() => _WatchdogSheetState();
}

class _WatchdogSheetState extends ConsumerState<WatchdogSheet> {
  double _threshold = 0.20;
  bool _autoPause = true;
  int _checkIntervalSec = 15;
  List<WatchdogSnapshotItem> _snapshots = [];
  bool _loadingSnapshots = false;
  String? _selectedSnapshotFilename;

  @override
  void initState() {
    super.initState();
    final watchdog = ref.read(telemetryProvider).status?.watchdog;
    if (watchdog != null) {
      _threshold = watchdog.threshold;
      _autoPause = watchdog.autoPauseEnabled;
      _checkIntervalSec = watchdog.checkIntervalSec;
    }
    _fetchSnapshots();
  }

  Future<void> _fetchSnapshots() async {
    setState(() => _loadingSnapshots = true);
    try {
      final activeId = ref.read(printerContextProvider).activeContextId;
      final printerService = ref.read(printerServiceProvider);
      final snaps = await printerService.getWatchdogSnapshots(contextId: activeId);
      if (mounted) {
        setState(() {
          _snapshots = snaps;
          _loadingSnapshots = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingSnapshots = false);
      }
    }
  }

  String _formatSnapshotTime(String raw) {
    try {
      final dt = DateTime.tryParse(raw);
      if (dt != null) {
        final local = dt.toLocal();
        final h = local.hour.toString().padLeft(2, '0');
        final m = local.minute.toString().padLeft(2, '0');
        final s = local.second.toString().padLeft(2, '0');
        return '$h:$m:$s';
      }
    } catch (_) {}
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    final telemetry = ref.watch(telemetryProvider);
    final watchdog = telemetry.status?.watchdog;
    final printerService = ref.read(printerServiceProvider);
    final apiClient = ref.read(apiClientProvider);

    final previewUrl = _selectedSnapshotFilename != null
        ? '${apiClient.baseUrl}${ApiEndpoints.watchdogSnapshot(_selectedSnapshotFilename!)}'
        : '${apiClient.baseUrl}${ApiEndpoints.watchdogSnapshotLatest}?t=${DateTime.now().millisecondsSinceEpoch}';

    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(color: AppColors.borderSubtle, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 12),

            Row(
              children: [
                Icon(
                  (watchdog?.online ?? false) ? LucideIcons.shieldCheck : LucideIcons.shieldAlert,
                  color: (watchdog?.online ?? false)
                      ? ((watchdog?.confidence ?? 0.0) >= _threshold ? AppColors.error : AppColors.accentGreen)
                      : AppColors.textMuted,
                  size: 20,
                ),
                const SizedBox(width: 8),
                const Text(
                  'AI Watchdog Guard (Darknet YOLO)',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                ),
                const Spacer(),
                IconButton(icon: const Icon(LucideIcons.x, size: 18), onPressed: () => Navigator.of(context).pop()),
              ],
            ),
            const Divider(height: 16),

            // Status & Confidence
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Status: ${watchdog?.state.toUpperCase() ?? 'OFFLINE'}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: (watchdog?.online ?? false) ? AppColors.accentGreen : AppColors.textMuted,
                    fontSize: 13,
                  ),
                ),
                Text(
                  'Defect Risk: ${((watchdog?.confidence ?? 0.0) * 100).toStringAsFixed(1)}%',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: (watchdog?.confidence ?? 0.0) >= _threshold ? AppColors.error : AppColors.textPrimary,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Sensitivity Threshold Slider
            Text('Detection Sensitivity: ${(_threshold * 100).toStringAsFixed(0)}%', style: const TextStyle(fontSize: 13)),
            Slider(
              value: _threshold,
              min: 0.05,
              max: 0.95,
              divisions: 18,
              activeColor: AppColors.accentGreen,
              onChanged: (val) {
                setState(() => _threshold = val);
              },
              onChangeEnd: (val) {
                printerService.updateWatchdogConfig(threshold: val, autoPause: _autoPause, checkIntervalSec: _checkIntervalSec);
              },
            ),
            const SizedBox(height: 8),

            // Auto-Pause Switch
            SwitchListTile(
              title: const Text('Auto-Pause on Defect', style: TextStyle(fontSize: 13)),
              subtitle: const Text('Automatically pause printer when failure threshold is exceeded', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
              value: _autoPause,
              activeThumbColor: AppColors.accentGreen,
              contentPadding: EdgeInsets.zero,
              onChanged: (val) {
                setState(() => _autoPause = val);
                printerService.updateWatchdogConfig(threshold: _threshold, autoPause: val, checkIntervalSec: _checkIntervalSec);
              },
            ),
            const SizedBox(height: 12),

            // Inspection Interval Dropdown
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Inspection Interval', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    Text('How often frames are checked during prints', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.borderSubtle),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<int>(
                      value: _checkIntervalSec,
                      dropdownColor: AppColors.surfaceSecondary,
                      isDense: true,
                      items: const [
                        DropdownMenuItem(value: 10, child: Text('10 sec', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 15, child: Text('15 sec (Default)', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 30, child: Text('30 sec', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 60, child: Text('60 sec (1 min)', style: TextStyle(fontSize: 13))),
                        DropdownMenuItem(value: 120, child: Text('120 sec (2 min)', style: TextStyle(fontSize: 13))),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setState(() => _checkIntervalSec = val);
                          printerService.updateWatchdogConfig(
                            threshold: _threshold,
                            autoPause: _autoPause,
                            checkIntervalSec: val,
                          );
                        }
                      },
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Main Snapshot Preview Header
            Row(
              children: [
                Text(
                  _selectedSnapshotFilename == null ? 'Latest Inspection Snapshot:' : 'Selected Defect Snapshot:',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                if (_selectedSnapshotFilename != null)
                  TextButton.icon(
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: () {
                      setState(() => _selectedSnapshotFilename = null);
                    },
                    icon: const Icon(LucideIcons.rotateCcw, size: 12, color: AppColors.accentGreen),
                    label: const Text('Back to Latest', style: TextStyle(fontSize: 11, color: AppColors.accentGreen)),
                  ),
              ],
            ),
            const SizedBox(height: 8),

            // Main Snapshot Image
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Image.network(
                  previewUrl,
                  headers: apiClient.authToken != null ? {'Authorization': 'Bearer ${apiClient.authToken}'} : null,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: Colors.black45,
                    child: const Center(
                      child: Text('No AI snapshot available yet', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Defect Snapshot History Gallery
            Row(
              children: [
                const Icon(LucideIcons.images, size: 14, color: AppColors.accentGreen),
                const SizedBox(width: 6),
                Text(
                  'Defect Snapshot History ${_snapshots.isNotEmpty ? '(${_snapshots.length})' : ''}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(LucideIcons.refreshCw, size: 14, color: AppColors.textMuted),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: 'Refresh History',
                  onPressed: _loadingSnapshots ? null : _fetchSnapshots,
                ),
              ],
            ),
            const SizedBox(height: 8),

            if (_loadingSnapshots)
              const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accentGreen),
                ),
              )
            else if (_snapshots.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSecondary,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.borderSubtle),
                ),
                child: const Center(
                  child: Text(
                    'No defect snapshots recorded for this print.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ),
              )
            else
              SizedBox(
                height: 110,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  itemCount: _snapshots.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final item = _snapshots[index];
                    final isSelected = _selectedSnapshotFilename == item.filename;
                    final itemUrl = '${apiClient.baseUrl}${ApiEndpoints.watchdogSnapshot(item.filename)}';

                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          _selectedSnapshotFilename = item.filename;
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 120,
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSecondary,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isSelected ? AppColors.accentGreen : AppColors.borderSubtle,
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  Image.network(
                                    itemUrl,
                                    headers: apiClient.authToken != null ? {'Authorization': 'Bearer ${apiClient.authToken}'} : null,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      color: Colors.black26,
                                      child: const Icon(LucideIcons.imageOff, size: 20, color: AppColors.textMuted),
                                    ),
                                  ),
                                  Positioned(
                                    top: 4,
                                    right: 4,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: Colors.black87,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        '${(item.confidence * 100).toStringAsFixed(0)}%',
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.bold,
                                          color: item.confidence >= _threshold ? AppColors.error : AppColors.accentGreen,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                              color: AppColors.surface,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'L${item.layer}',
                                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                                  ),
                                  Text(
                                    _formatSnapshotTime(item.timestamp),
                                    style: const TextStyle(fontSize: 9, color: AppColors.textMuted),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

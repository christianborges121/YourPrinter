import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../state/connection_provider.dart';
import 'connection_error_card.dart';
import 'yourprinter_logo.dart';

class NotConfiguredView extends ConsumerStatefulWidget {
  final VoidCallback? onOpenSettings;

  const NotConfiguredView({super.key, this.onOpenSettings});

  @override
  ConsumerState<NotConfiguredView> createState() => _NotConfiguredViewState();
}

class _NotConfiguredViewState extends ConsumerState<NotConfiguredView> {
  late TextEditingController _urlController;
  String? _inlineError;

  @override
  void initState() {
    super.initState();
    final currentUrl = ref.read(connectionProvider).serverUrl;
    _urlController = TextEditingController(text: currentUrl);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _handleConnect() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _inlineError = null;
    });

    final res = await ref.read(connectionProvider.notifier).testAndSaveServerUrl(_urlController.text);
    if (!mounted) return;

    if (res.success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res.message),
          backgroundColor: AppColors.accentGreen,
        ),
      );
    } else {
      setState(() => _inlineError = res.message);
    }
  }

  void _applyPort(int port) {
    var text = _urlController.text.trim();
    if (text.isEmpty) {
      text = 'http://192.168.1.50:$port';
    } else {
      final uri = Uri.tryParse(text);
      if (uri != null && uri.host.isNotEmpty) {
        text = '${uri.scheme}://${uri.host}:$port';
      } else {
        text = text.replaceAll(RegExp(r':\d+'), '');
        text = '$text:$port';
      }
    }
    _urlController.text = text;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final connState = ref.watch(connectionProvider);
    final isBusy = connState.isConnecting;
    final displayError = _inlineError ?? connState.errorMessage;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Brand Logo Badge
              const Center(
                child: YourPrinterLogo(size: 68),
              ),
              const SizedBox(height: 16),

              // Title
              const Text(
                'Server Not Configured',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'YourPrinter Mobile cannot reach the server at the configured address:',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textMuted),
              ),
              const SizedBox(height: 10),

              // Current URL Pill
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSecondary,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(
                    connState.serverUrl,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: AppColors.warningLight,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Inline Setup Form Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Connect to YourPrinter Server',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _urlController,
                        enabled: !isBusy,
                        keyboardType: TextInputType.url,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _handleConnect(),
                        decoration: InputDecoration(
                          labelText: 'Server Base URL',
                          hintText: 'http://192.168.1.100:3080',
                          prefixIcon: const Icon(LucideIcons.globe, size: 18),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                      const SizedBox(height: 8),

                      // Quick Port Chips
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          ActionChip(
                            label: const Text('Port :3080', style: TextStyle(fontSize: 11)),
                            onPressed: isBusy ? null : () => _applyPort(3080),
                            backgroundColor: AppColors.surfaceSecondary,
                          ),
                          ActionChip(
                            label: const Text('Port :3000', style: TextStyle(fontSize: 11)),
                            onPressed: isBusy ? null : () => _applyPort(3000),
                            backgroundColor: AppColors.surfaceSecondary,
                          ),
                          ActionChip(
                            label: const Text('Port :8080', style: TextStyle(fontSize: 11)),
                            onPressed: isBusy ? null : () => _applyPort(8080),
                            backgroundColor: AppColors.surfaceSecondary,
                          ),
                          ActionChip(
                            label: const Text('Reset', style: TextStyle(fontSize: 11)),
                            onPressed: isBusy
                                ? null
                                : () {
                                    _urlController.text = 'http://localhost:3080';
                                    setState(() {});
                                  },
                            backgroundColor: AppColors.surfaceSecondary,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Connect Button
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.accentGreen,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          textStyle: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        onPressed: isBusy ? null : _handleConnect,
                        icon: isBusy
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                              )
                            : const Icon(LucideIcons.plug, size: 18),
                        label: Text(isBusy ? 'Testing Connection...' : 'Test Connection & Connect'),
                      ),

                      // Error Banner with generic message and dropdown for the true message
                      if (displayError != null && displayError.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        ConnectionErrorCard(rawError: displayError),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Checklist Card
              Card(
                color: AppColors.surfaceSecondary,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(LucideIcons.info, size: 16, color: AppColors.textMuted),
                          SizedBox(width: 8),
                          Text(
                            'Troubleshooting Checklist',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      _buildCheckItem(
                        icon: LucideIcons.monitor,
                        text: 'Ensure the YourPrinter desktop server is open and running on your PC.',
                      ),
                      _buildCheckItem(
                        icon: LucideIcons.wifi,
                        text: 'Ensure phone and PC are on the same Wi-Fi network, or both connected to Tailscale.',
                      ),
                      _buildCheckItem(
                        icon: LucideIcons.hash,
                        text: 'Verify the port number. The default WebUI port is usually 3000 or 8080.',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Bottom Actions
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed: isBusy
                        ? null
                        : () => ref.read(connectionProvider.notifier).checkCurrentConnection(),
                    icon: const Icon(LucideIcons.refreshCw, size: 14),
                    label: const Text('Retry Current URL'),
                  ),
                  if (widget.onOpenSettings != null) ...[
                    const SizedBox(width: 12),
                    TextButton.icon(
                      onPressed: widget.onOpenSettings,
                      icon: const Icon(LucideIcons.settings, size: 14),
                      label: const Text('Settings'),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCheckItem({required IconData icon, required String text}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}

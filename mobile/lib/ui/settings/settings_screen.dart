import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';
import '../../services/notification_service.dart';
import '../../state/auth_provider.dart';
import '../../state/camera_provider.dart';
import '../../state/connection_provider.dart';
import '../common/connection_error_card.dart';
import '../common/yourprinter_logo.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late TextEditingController _urlController;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    final prefs = ref.read(preferencesServiceProvider);
    _urlController = TextEditingController(text: prefs.getServerUrl());
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(preferencesServiceProvider);
    final cameraService = ref.watch(cameraStreamServiceProvider);
    final authState = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('App Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Server Configuration Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(LucideIcons.server, size: 16, color: AppColors.accentGreen),
                      SizedBox(width: 8),
                      Text('YourPrinter Server', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _urlController,
                    decoration: InputDecoration(
                      labelText: 'Server Base URL',
                      hintText: 'http://192.168.1.100:3080',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      ElevatedButton(
                        onPressed: () async {
                          final newUrl = _urlController.text.trim();
                          if (newUrl.isNotEmpty) {
                            setState(() => _saveError = null);
                            final res = await ref.read(connectionProvider.notifier).testAndSaveServerUrl(newUrl);
                            if (context.mounted) {
                              if (res.success) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(res.message),
                                    backgroundColor: AppColors.accentGreen,
                                  ),
                                );
                              } else {
                                setState(() => _saveError = res.message);
                              }
                            }
                          }
                        },
                        child: const Text('Save & Reconnect'),
                      ),
                      const SizedBox(width: 8),
                      if (authState.isAuthenticated && authState.authRequired)
                        OutlinedButton(
                          onPressed: () => ref.read(authProvider.notifier).logout(),
                          child: const Text('Logout'),
                        ),
                    ],
                  ),
                  if (_saveError != null && _saveError!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    ConnectionErrorCard(rawError: _saveError!),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Camera Settings Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(LucideIcons.video, size: 16, color: AppColors.accentGreen),
                      SizedBox(width: 8),
                      Text('Camera Streaming', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SwitchListTile(
                    title: const Text('Stream Continuously', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: const Text(
                      'Override the 30-second camera timeout limit.',
                      style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                    value: cameraService.continuousOverride,
                    activeThumbColor: AppColors.accentGreen,
                    contentPadding: EdgeInsets.zero,
                    onChanged: (val) async {
                      await prefs.setStreamTimeoutOverridden(val);
                      cameraService.setContinuousOverride(val);
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Notifications & Background Monitoring Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(LucideIcons.bell, size: 16, color: AppColors.accentGreen),
                      SizedBox(width: 8),
                      Text('Notifications & Monitoring', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SwitchListTile(
                    title: const Text('Enable Notifications', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: const Text(
                      'Receive native push notifications on this device over Tailscale.',
                      style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                    value: prefs.isNotificationsEnabled(),
                    activeThumbColor: AppColors.accentGreen,
                    contentPadding: EdgeInsets.zero,
                    onChanged: (val) async {
                      await prefs.setNotificationsEnabled(val);
                      if (val) {
                        await ref.read(notificationServiceProvider).requestPermissions();
                      } else {
                        await ref.read(notificationServiceProvider).stopForegroundService();
                      }
                      setState(() {});
                    },
                  ),
                  if (prefs.isNotificationsEnabled()) ...[
                    const Divider(height: 16),
                    SwitchListTile(
                      title: const Text('AI Watchdog Alerts', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text(
                        'Heads-up alert with vibration when print failure is detected.',
                        style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                      value: prefs.isWatchdogAlertsEnabled(),
                      activeThumbColor: AppColors.accentGreen,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (val) async {
                        await prefs.setWatchdogAlertsEnabled(val);
                        setState(() {});
                      },
                    ),
                    SwitchListTile(
                      title: const Text('Print Finished & Paused', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text(
                        'Notify when print jobs complete or pause.',
                        style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                      value: prefs.isPrintCompleteAlertsEnabled(),
                      activeThumbColor: AppColors.accentGreen,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (val) async {
                        await prefs.setPrintCompleteAlertsEnabled(val);
                        setState(() {});
                      },
                    ),
                    SwitchListTile(
                      title: const Text('Bed Cooldown Alert', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text(
                        'Notify when bed reaches ≤ 40°C for safe removal.',
                        style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                      value: prefs.isPrinterCooledAlertsEnabled(),
                      activeThumbColor: AppColors.accentGreen,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (val) async {
                        await prefs.setPrinterCooledAlertsEnabled(val);
                        setState(() {});
                      },
                    ),
                    SwitchListTile(
                      title: const Text('Background Monitoring Service', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text(
                        'Keep live WebSocket telemetry alive in background during prints.',
                        style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                      value: prefs.isBackgroundMonitoringEnabled(),
                      activeThumbColor: AppColors.accentGreen,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (val) async {
                        await prefs.setBackgroundMonitoringEnabled(val);
                        if (!val) {
                          await ref.read(notificationServiceProvider).stopForegroundService();
                        }
                        setState(() {});
                      },
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await ref.read(notificationServiceProvider).sendTestNotification();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Test notification dispatched'),
                              backgroundColor: AppColors.accentGreen,
                            ),
                          );
                        }
                      },
                      icon: const Icon(LucideIcons.bellRing, size: 14),
                      label: const Text('Send Test Notification', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // About App Card
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  YourPrinterLogo(size: 40),
                  SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('YourPrinter Mobile v1.0.39', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        SizedBox(height: 4),
                        Text('Cross-platform 3D printing telemetry and camera client for YourPrinter and Bambu Lab printers.',
                            style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                      ],
                    ),
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

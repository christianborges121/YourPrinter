import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../state/connection_provider.dart';
import '../common/not_configured_view.dart';
import '../dashboard/dashboard_screen.dart';
import '../files/files_screen.dart';
import '../fleet/fleet_screen.dart';
import '../settings/settings_screen.dart';

class AppScaffold extends ConsumerStatefulWidget {
  const AppScaffold({super.key});

  @override
  ConsumerState<AppScaffold> createState() => _AppScaffoldState();
}

class _AppScaffoldState extends ConsumerState<AppScaffold> {
  int _currentIndex = 1; // Default to Device Dashboard (index 1)

  @override
  Widget build(BuildContext context) {
    final connState = ref.watch(connectionProvider);
    final isUnreachable = connState.status == ServerConnectionStatus.unreachable;

    final screens = [
      FleetScreen(onTabSelected: (index) => setState(() => _currentIndex = index)),
      const DashboardScreen(),
      const FilesScreen(),
      const SettingsScreen(),
    ];

    Widget body;
    if (isUnreachable && _currentIndex != 3) {
      body = Scaffold(
        appBar: AppBar(
          title: const Text('YourPrinter Mobile'),
          centerTitle: true,
        ),
        body: NotConfiguredView(
          onOpenSettings: () => setState(() => _currentIndex = 3),
        ),
      );
    } else {
      body = IndexedStack(
        index: _currentIndex,
        children: screens,
      );
    }

    return Scaffold(
      body: body,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(LucideIcons.layoutGrid, size: 20),
            label: 'Fleet',
          ),
          BottomNavigationBarItem(
            icon: Icon(LucideIcons.printer, size: 20),
            label: 'Device',
          ),
          BottomNavigationBarItem(
            icon: Icon(LucideIcons.folderOpen, size: 20),
            label: 'Files',
          ),
          BottomNavigationBarItem(
            icon: Icon(LucideIcons.settings, size: 20),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

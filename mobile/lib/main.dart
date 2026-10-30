import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'services/preferences_service.dart';
import 'state/auth_provider.dart';
import 'state/connection_provider.dart';
import 'state/printer_context_provider.dart';
import 'ui/auth/server_login_screen.dart';
import 'ui/common/app_scaffold.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefsService = await PreferencesService.create();

  runApp(
    ProviderScope(
      overrides: [
        preferencesServiceProvider.overrideWithValue(prefsService),
      ],
      child: const YourPrinterMobileApp(),
    ),
  );
}

class YourPrinterMobileApp extends ConsumerStatefulWidget {
  const YourPrinterMobileApp({super.key});

  @override
  ConsumerState<YourPrinterMobileApp> createState() => _YourPrinterMobileAppState();
}

class _YourPrinterMobileAppState extends ConsumerState<YourPrinterMobileApp> {
  @override
  void initState() {
    super.initState();
    // Initialize Connection, Auth & Contexts
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(connectionProvider.notifier).checkCurrentConnection(silent: true);
      await ref.read(authProvider.notifier).checkAuthStatus();
      await ref.read(printerContextProvider.notifier).fetchContexts();
    });
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return MaterialApp(
      title: 'YourPrinter Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: authState.authRequired && !authState.isAuthenticated
          ? const ServerLoginScreen()
          : const AppScaffold(),
    );
  }
}

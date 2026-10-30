import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/camera_stream_service.dart';
import 'auth_provider.dart';

final cameraStreamServiceProvider = ChangeNotifierProvider<CameraStreamService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final service = CameraStreamService(apiClient: apiClient);
  service.initRenderer();

  final prefs = ref.watch(preferencesServiceProvider);
  service.setContinuousOverride(prefs.isStreamTimeoutOverridden());

  return service;
});

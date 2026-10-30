class CameraProxyConfigResponse {
  final bool success;
  final String? wsUrl;
  final String? directWsUrl;
  final String? streamType;
  final String? sourceType;
  final String? streamName;
  final int? apiPort;
  final String? mode;
  final bool showCameraFps;
  final String? concurrencyNotice;
  final String? error;

  const CameraProxyConfigResponse({
    required this.success,
    this.wsUrl,
    this.directWsUrl,
    this.streamType,
    this.sourceType,
    this.streamName,
    this.apiPort,
    this.mode,
    this.showCameraFps = false,
    this.concurrencyNotice,
    this.error,
  });

  factory CameraProxyConfigResponse.fromJson(Map<String, dynamic> json) {
    return CameraProxyConfigResponse(
      success: json['success'] as bool? ?? false,
      wsUrl: json['wsUrl'] as String?,
      directWsUrl: json['directWsUrl'] as String?,
      streamType: json['streamType'] as String?,
      sourceType: json['sourceType'] as String?,
      streamName: json['streamName'] as String?,
      apiPort: (json['apiPort'] as num?)?.toInt(),
      mode: json['mode'] as String?,
      showCameraFps: json['showCameraFps'] as bool? ?? false,
      concurrencyNotice: json['concurrencyNotice'] as String?,
      error: json['error'] as String?,
    );
  }
}

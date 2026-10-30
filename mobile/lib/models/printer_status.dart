class WatchdogSnapshotItem {
  final String filename;
  final String timestamp;
  final double confidence;
  final String layer;

  const WatchdogSnapshotItem({
    required this.filename,
    required this.timestamp,
    required this.confidence,
    required this.layer,
  });

  factory WatchdogSnapshotItem.fromJson(Map<String, dynamic> json) {
    return WatchdogSnapshotItem(
      filename: json['filename'] as String? ?? '',
      timestamp: json['timestamp'] as String? ?? '',
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.0,
      layer: json['layer']?.toString() ?? '0',
    );
  }
}

class WatchdogStatusData {
  final bool online;
  final String state; // 'idle' | 'monitoring' | 'alert' | 'paused' | 'offline'
  final double confidence;
  final double threshold;
  final bool autoPauseEnabled;
  final bool autoPauseTriggered;
  final int consecutiveFailures;
  final int checkIntervalSec;
  final String? activeJob;

  const WatchdogStatusData({
    required this.online,
    required this.state,
    required this.confidence,
    required this.threshold,
    required this.autoPauseEnabled,
    required this.autoPauseTriggered,
    this.consecutiveFailures = 0,
    this.checkIntervalSec = 15,
    this.activeJob,
  });

  factory WatchdogStatusData.fromJson(Map<String, dynamic> json) {
    return WatchdogStatusData(
      online: json['online'] as bool? ?? false,
      state: json['state'] as String? ?? 'offline',
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.0,
      threshold: (json['threshold'] as num?)?.toDouble() ?? 0.20,
      autoPauseEnabled: json['auto_pause_enabled'] as bool? ?? false,
      autoPauseTriggered: json['auto_pause_triggered'] as bool? ?? false,
      consecutiveFailures: (json['consecutive_failures'] as num?)?.toInt() ?? 0,
      checkIntervalSec: (json['check_interval_sec'] as num?)?.toInt() ?? 15,
      activeJob: json['active_job'] as String?,
    );
  }
}

class PrinterStatusData {
  final String printerState;
  final double bedTemperature;
  final double bedTargetTemperature;
  final double nozzleTemperature;
  final double nozzleTargetTemperature;
  final double? chamberTemperature;
  final double? chamberTargetTemperature;
  final List<double> toolTemps;
  final List<double> toolTargetTemps;
  final double progress;
  final int currentLayer;
  final int totalLayers;
  final String? jobName;
  final int? timeElapsed;
  final int? timeRemaining;
  final String filtrationMode; // 'external' | 'internal' | 'none'
  final double? estimatedWeight;
  final double? estimatedLength;
  final String? thumbnailData;
  final String? formattedEta;
  final WatchdogStatusData? watchdog;

  const PrinterStatusData({
    required this.printerState,
    required this.bedTemperature,
    required this.bedTargetTemperature,
    required this.nozzleTemperature,
    required this.nozzleTargetTemperature,
    this.chamberTemperature,
    this.chamberTargetTemperature,
    this.toolTemps = const [],
    this.toolTargetTemps = const [],
    required this.progress,
    required this.currentLayer,
    required this.totalLayers,
    this.jobName,
    this.timeElapsed,
    this.timeRemaining,
    this.filtrationMode = 'none',
    this.estimatedWeight,
    this.estimatedLength,
    this.thumbnailData,
    this.formattedEta,
    this.watchdog,
  });

  bool get isPaused => printerState.toLowerCase().contains('pause');

  bool get isPrinting =>
      printerState.toLowerCase().contains('print') ||
      printerState.toLowerCase().contains('busy') ||
      printerState.toLowerCase().contains('running') ||
      printerState.toLowerCase().contains('heat');

  bool get hasActiveJob => isPrinting || isPaused;

  bool get isCompleted =>
      printerState.toLowerCase().contains('complete') ||
      (progress >= 100.0 && !hasActiveJob && jobName != null);

  factory PrinterStatusData.fromJson(Map<String, dynamic> json) {
    return PrinterStatusData(
      printerState: json['printerState'] as String? ?? 'Idle',
      bedTemperature: (json['bedTemperature'] as num?)?.toDouble() ?? 0.0,
      bedTargetTemperature: (json['bedTargetTemperature'] as num?)?.toDouble() ?? 0.0,
      nozzleTemperature: (json['nozzleTemperature'] as num?)?.toDouble() ?? 0.0,
      nozzleTargetTemperature: (json['nozzleTargetTemperature'] as num?)?.toDouble() ?? 0.0,
      chamberTemperature: (json['chamberTemperature'] as num?)?.toDouble(),
      chamberTargetTemperature: (json['chamberTargetTemperature'] as num?)?.toDouble(),
      toolTemps: (json['toolTemps'] as List<dynamic>?)?.map((e) => (e as num).toDouble()).toList() ?? const [],
      toolTargetTemps: (json['toolTargetTemps'] as List<dynamic>?)?.map((e) => (e as num).toDouble()).toList() ?? const [],
      progress: (json['progress'] as num?)?.toDouble() ?? 0.0,
      currentLayer: (json['currentLayer'] as num?)?.toInt() ?? 0,
      totalLayers: (json['totalLayers'] as num?)?.toInt() ?? 0,
      jobName: json['jobName'] as String?,
      timeElapsed: (json['timeElapsed'] as num?)?.toInt() ?? (json['elapsedTimeSeconds'] as num?)?.toInt(),
      timeRemaining: (json['timeRemaining'] as num?)?.toInt(),
      filtrationMode: json['filtrationMode'] as String? ?? 'none',
      estimatedWeight: (json['estimatedWeight'] as num?)?.toDouble(),
      estimatedLength: (json['estimatedLength'] as num?)?.toDouble(),
      thumbnailData: json['thumbnailData'] as String?,
      formattedEta: json['formattedEta'] as String?,
      watchdog: json['watchdog'] != null
          ? WatchdogStatusData.fromJson(json['watchdog'] as Map<String, dynamic>)
          : null,
    );
  }
}

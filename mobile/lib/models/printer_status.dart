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

  Map<String, dynamic> toJson() {
    return {
      'filename': filename,
      'timestamp': timestamp,
      'confidence': confidence,
      'layer': layer,
    };
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
  final int consecutiveRequired;
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
    this.consecutiveRequired = 2,
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
      consecutiveRequired: (json['consecutive_required'] as num?)?.toInt() ?? 2,
      checkIntervalSec: (json['check_interval_sec'] as num?)?.toInt() ?? 15,
      activeJob: json['active_job'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'online': online,
      'state': state,
      'confidence': confidence,
      'threshold': threshold,
      'auto_pause_enabled': autoPauseEnabled,
      'auto_pause_triggered': autoPauseTriggered,
      'consecutive_failures': consecutiveFailures,
      'consecutive_required': consecutiveRequired,
      'check_interval_sec': checkIntervalSec,
      if (activeJob != null) 'active_job': activeJob,
    };
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
  final double? layerProgress;
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

  // WebUI parity telemetry fields
  final double printSpeed;
  final double coolingFanSpeed;
  final double chamberFanSpeed;
  final bool ledState;
  final int elapsedTimeSeconds;
  final double cumulativeFilament;
  final int cumulativePrintTime;

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
    this.layerProgress,
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
    this.printSpeed = 100.0,
    this.coolingFanSpeed = 0.0,
    this.chamberFanSpeed = 0.0,
    this.ledState = false,
    this.elapsedTimeSeconds = 0,
    this.cumulativeFilament = 0.0,
    this.cumulativePrintTime = 0,
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
      layerProgress: (json['layerProgress'] as num?)?.toDouble(),
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
      printSpeed: (json['printSpeed'] as num?)?.toDouble() ??
          (json['currentPrintSpeed'] as num?)?.toDouble() ??
          (json['speed'] as num?)?.toDouble() ??
          100.0,
      coolingFanSpeed: (json['coolingFanSpeed'] as num?)?.toDouble() ??
          (json['fanSpeed'] as num?)?.toDouble() ??
          0.0,
      chamberFanSpeed: (json['chamberFanSpeed'] as num?)?.toDouble() ??
          (json['chamberFan'] as num?)?.toDouble() ??
          0.0,
      ledState: json['ledState'] as bool? ??
          json['led'] as bool? ??
          false,
      elapsedTimeSeconds: (json['elapsedTimeSeconds'] as num?)?.toInt() ??
          (json['timeElapsed'] as num?)?.toInt() ??
          0,
      cumulativeFilament: (json['cumulativeFilament'] as num?)?.toDouble() ??
          (json['totalFilamentUsed'] as num?)?.toDouble() ??
          0.0,
      cumulativePrintTime: (json['cumulativePrintTime'] as num?)?.toInt() ??
          (json['totalPrintTime'] as num?)?.toInt() ??
          0,
    );
  }

  PrinterStatusData copyWith({
    String? printerState,
    double? bedTemperature,
    double? bedTargetTemperature,
    double? nozzleTemperature,
    double? nozzleTargetTemperature,
    double? chamberTemperature,
    double? chamberTargetTemperature,
    List<double>? toolTemps,
    List<double>? toolTargetTemps,
    double? progress,
    double? layerProgress,
    int? currentLayer,
    int? totalLayers,
    String? jobName,
    int? timeElapsed,
    int? timeRemaining,
    String? filtrationMode,
    double? estimatedWeight,
    double? estimatedLength,
    String? thumbnailData,
    String? formattedEta,
    WatchdogStatusData? watchdog,
    double? printSpeed,
    double? coolingFanSpeed,
    double? chamberFanSpeed,
    bool? ledState,
    int? elapsedTimeSeconds,
    double? cumulativeFilament,
    int? cumulativePrintTime,
  }) {
    return PrinterStatusData(
      printerState: printerState ?? this.printerState,
      bedTemperature: bedTemperature ?? this.bedTemperature,
      bedTargetTemperature: bedTargetTemperature ?? this.bedTargetTemperature,
      nozzleTemperature: nozzleTemperature ?? this.nozzleTemperature,
      nozzleTargetTemperature: nozzleTargetTemperature ?? this.nozzleTargetTemperature,
      chamberTemperature: chamberTemperature ?? this.chamberTemperature,
      chamberTargetTemperature: chamberTargetTemperature ?? this.chamberTargetTemperature,
      toolTemps: toolTemps ?? this.toolTemps,
      toolTargetTemps: toolTargetTemps ?? this.toolTargetTemps,
      progress: progress ?? this.progress,
      layerProgress: layerProgress ?? this.layerProgress,
      currentLayer: currentLayer ?? this.currentLayer,
      totalLayers: totalLayers ?? this.totalLayers,
      jobName: jobName ?? this.jobName,
      timeElapsed: timeElapsed ?? this.timeElapsed,
      timeRemaining: timeRemaining ?? this.timeRemaining,
      filtrationMode: filtrationMode ?? this.filtrationMode,
      estimatedWeight: estimatedWeight ?? this.estimatedWeight,
      estimatedLength: estimatedLength ?? this.estimatedLength,
      thumbnailData: thumbnailData ?? this.thumbnailData,
      formattedEta: formattedEta ?? this.formattedEta,
      watchdog: watchdog ?? this.watchdog,
      printSpeed: printSpeed ?? this.printSpeed,
      coolingFanSpeed: coolingFanSpeed ?? this.coolingFanSpeed,
      chamberFanSpeed: chamberFanSpeed ?? this.chamberFanSpeed,
      ledState: ledState ?? this.ledState,
      elapsedTimeSeconds: elapsedTimeSeconds ?? this.elapsedTimeSeconds,
      cumulativeFilament: cumulativeFilament ?? this.cumulativeFilament,
      cumulativePrintTime: cumulativePrintTime ?? this.cumulativePrintTime,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'printerState': printerState,
      'bedTemperature': bedTemperature,
      'bedTargetTemperature': bedTargetTemperature,
      'nozzleTemperature': nozzleTemperature,
      'nozzleTargetTemperature': nozzleTargetTemperature,
      if (chamberTemperature != null) 'chamberTemperature': chamberTemperature,
      if (chamberTargetTemperature != null) 'chamberTargetTemperature': chamberTargetTemperature,
      'toolTemps': toolTemps,
      'toolTargetTemps': toolTargetTemps,
      'progress': progress,
      if (layerProgress != null) 'layerProgress': layerProgress,
      'currentLayer': currentLayer,
      'totalLayers': totalLayers,
      if (jobName != null) 'jobName': jobName,
      if (timeElapsed != null) 'timeElapsed': timeElapsed,
      if (timeRemaining != null) 'timeRemaining': timeRemaining,
      'filtrationMode': filtrationMode,
      if (estimatedWeight != null) 'estimatedWeight': estimatedWeight,
      if (estimatedLength != null) 'estimatedLength': estimatedLength,
      if (thumbnailData != null) 'thumbnailData': thumbnailData,
      if (formattedEta != null) 'formattedEta': formattedEta,
      if (watchdog != null) 'watchdog': watchdog!.toJson(),
      'printSpeed': printSpeed,
      'coolingFanSpeed': coolingFanSpeed,
      'chamberFanSpeed': chamberFanSpeed,
      'ledState': ledState,
      'elapsedTimeSeconds': elapsedTimeSeconds,
      'cumulativeFilament': cumulativeFilament,
      'cumulativePrintTime': cumulativePrintTime,
    };
  }
}

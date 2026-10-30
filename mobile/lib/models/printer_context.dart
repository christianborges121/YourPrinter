class PrinterDetails {
  final String ipAddress;
  final String? serialNumber;
  final String? checkCode;
  final String? model;
  final String? make;
  final bool? showCameraFps;

  const PrinterDetails({
    required this.ipAddress,
    this.serialNumber,
    this.checkCode,
    this.model,
    this.make,
    this.showCameraFps,
  });

  factory PrinterDetails.fromJson(Map<String, dynamic> json) {
    return PrinterDetails(
      ipAddress: json['IPAddress'] as String? ?? json['ipAddress'] as String? ?? '',
      serialNumber: json['serialNumber'] as String?,
      checkCode: json['checkCode'] as String?,
      model: json['model'] as String?,
      make: json['make'] as String?,
      showCameraFps: json['showCameraFps'] as bool?,
    );
  }
}

class PrinterContext {
  final String contextId;
  final String name;
  final String model;
  final bool isConnected;
  final bool isSelected;
  final PrinterDetails printerDetails;

  const PrinterContext({
    required this.contextId,
    required this.name,
    required this.model,
    required this.isConnected,
    required this.isSelected,
    required this.printerDetails,
  });

  factory PrinterContext.fromJson(Map<String, dynamic> json) {
    return PrinterContext(
      contextId: json['contextId'] as String? ?? json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Printer',
      model: json['model'] as String? ?? '3D Printer',
      isConnected: json['isConnected'] as bool? ?? json['connected'] as bool? ?? false,
      isSelected: json['isSelected'] as bool? ?? json['active'] as bool? ?? false,
      printerDetails: PrinterDetails.fromJson(
        json['printerDetails'] as Map<String, dynamic>? ?? json,
      ),
    );
  }
}

class FleetOverviewPrinter {
  final String name;
  final String model;
  final String? contextId;
  final bool isConnected;
  final bool hasCamera;
  final String? jobName;
  final double progress;
  final int currentLayer;
  final int totalLayers;
  final int? timeRemaining;
  final double bedTemp;
  final double bedTarget;
  final double nozzleTemp;
  final double nozzleTarget;
  final String statusText;
  final String? thumbnailData;

  const FleetOverviewPrinter({
    required this.name,
    required this.model,
    this.contextId,
    required this.isConnected,
    required this.hasCamera,
    this.jobName,
    required this.progress,
    required this.currentLayer,
    required this.totalLayers,
    this.timeRemaining,
    required this.bedTemp,
    required this.bedTarget,
    required this.nozzleTemp,
    required this.nozzleTarget,
    required this.statusText,
    this.thumbnailData,
  });

  factory FleetOverviewPrinter.fromJson(Map<String, dynamic> json) {
    final status = json['status'] as Map<String, dynamic>? ?? {};
    return FleetOverviewPrinter(
      name: json['name'] as String? ?? 'Printer',
      model: json['model'] as String? ?? 'YourPrinter',
      contextId: json['contextId'] as String?,
      isConnected: json['isConnected'] as bool? ?? false,
      hasCamera: json['hasCamera'] as bool? ?? false,
      jobName: status['jobName'] as String?,
      progress: (status['progress'] as num?)?.toDouble() ?? 0.0,
      currentLayer: (status['currentLayer'] as num?)?.toInt() ?? 0,
      totalLayers: (status['totalLayers'] as num?)?.toInt() ?? 0,
      timeRemaining: (status['timeRemaining'] as num?)?.toInt(),
      bedTemp: (status['bedTemperature'] as num?)?.toDouble() ?? 0.0,
      bedTarget: (status['bedTargetTemperature'] as num?)?.toDouble() ?? 0.0,
      nozzleTemp: (status['nozzleTemperature'] as num?)?.toDouble() ?? 0.0,
      nozzleTarget: (status['nozzleTargetTemperature'] as num?)?.toDouble() ?? 0.0,
      statusText: (status['printerState'] as String? ?? 'Idle'),
      thumbnailData: status['thumbnailData'] as String?,
    );
  }
}

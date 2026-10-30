class PrinterFeatures {
  final bool hasCamera;
  final bool hasLED;
  final bool hasFiltration;
  final bool hasMaterialStation;
  final bool canPause;
  final bool canResume;
  final bool canCancel;
  final bool ledUsesLegacyAPI;

  const PrinterFeatures({
    required this.hasCamera,
    required this.hasLED,
    required this.hasFiltration,
    required this.hasMaterialStation,
    required this.canPause,
    required this.canResume,
    required this.canCancel,
    required this.ledUsesLegacyAPI,
  });

  factory PrinterFeatures.fromJson(Map<String, dynamic> json) {
    return PrinterFeatures(
      hasCamera: json['hasCamera'] as bool? ?? false,
      hasLED: json['hasLED'] as bool? ?? false,
      hasFiltration: json['hasFiltration'] as bool? ?? false,
      hasMaterialStation: json['hasMaterialStation'] as bool? ?? false,
      canPause: json['canPause'] as bool? ?? true,
      canResume: json['canResume'] as bool? ?? true,
      canCancel: json['canCancel'] as bool? ?? true,
      ledUsesLegacyAPI: json['ledUsesLegacyAPI'] as bool? ?? false,
    );
  }
}

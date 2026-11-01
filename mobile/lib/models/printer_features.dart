import 'printer_capabilities.dart';

class PrinterFeatures {
  final bool hasCamera;
  final bool hasLED;
  final bool hasFiltration;
  final bool hasMaterialStation;
  final bool canPause;
  final bool canResume;
  final bool canCancel;
  final bool ledUsesLegacyAPI;
  final PrinterNetworkCapabilities? capabilities;

  const PrinterFeatures({
    required this.hasCamera,
    required this.hasLED,
    required this.hasFiltration,
    required this.hasMaterialStation,
    required this.canPause,
    required this.canResume,
    required this.canCancel,
    required this.ledUsesLegacyAPI,
    this.capabilities,
  });

  factory PrinterFeatures.fromJson(Map<String, dynamic> json) {
    final capsJson = json['capabilities'] as Map<String, dynamic>?;
    return PrinterFeatures(
      hasCamera: json['hasCamera'] as bool? ?? false,
      hasLED: json['hasLED'] as bool? ?? false,
      hasFiltration: json['hasFiltration'] as bool? ?? false,
      hasMaterialStation: json['hasMaterialStation'] as bool? ?? false,
      canPause: json['canPause'] as bool? ?? true,
      canResume: json['canResume'] as bool? ?? true,
      canCancel: json['canCancel'] as bool? ?? true,
      ledUsesLegacyAPI: json['ledUsesLegacyAPI'] as bool? ?? false,
      capabilities: capsJson != null
          ? PrinterNetworkCapabilities.fromJson(capsJson)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'hasCamera': hasCamera,
      'hasLED': hasLED,
      'hasFiltration': hasFiltration,
      'hasMaterialStation': hasMaterialStation,
      'canPause': canPause,
      'canResume': canResume,
      'canCancel': canCancel,
      'ledUsesLegacyAPI': ledUsesLegacyAPI,
      'capabilities': capabilities?.toJson(),
    };
  }

  PrinterFeatures copyWith({
    bool? hasCamera,
    bool? hasLED,
    bool? hasFiltration,
    bool? hasMaterialStation,
    bool? canPause,
    bool? canResume,
    bool? canCancel,
    bool? ledUsesLegacyAPI,
    PrinterNetworkCapabilities? capabilities,
  }) {
    return PrinterFeatures(
      hasCamera: hasCamera ?? this.hasCamera,
      hasLED: hasLED ?? this.hasLED,
      hasFiltration: hasFiltration ?? this.hasFiltration,
      hasMaterialStation: hasMaterialStation ?? this.hasMaterialStation,
      canPause: canPause ?? this.canPause,
      canResume: canResume ?? this.canResume,
      canCancel: canCancel ?? this.canCancel,
      ledUsesLegacyAPI: ledUsesLegacyAPI ?? this.ledUsesLegacyAPI,
      capabilities: capabilities ?? this.capabilities,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! PrinterFeatures) return false;
    return other.hasCamera == hasCamera &&
        other.hasLED == hasLED &&
        other.hasFiltration == hasFiltration &&
        other.hasMaterialStation == hasMaterialStation &&
        other.canPause == canPause &&
        other.canResume == canResume &&
        other.canCancel == canCancel &&
        other.ledUsesLegacyAPI == ledUsesLegacyAPI &&
        other.capabilities == capabilities;
  }

  @override
  int get hashCode => Object.hash(
        hasCamera,
        hasLED,
        hasFiltration,
        hasMaterialStation,
        canPause,
        canResume,
        canCancel,
        ledUsesLegacyAPI,
        capabilities,
      );
}

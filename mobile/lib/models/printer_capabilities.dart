/// Declarative network capabilities contract defining hardware features,
/// supported axes, thermal boundaries, and control options exposed over LAN.
/// Mirrors `shared/types/printer-backend/adapter.ts:12-48`.
class PrinterNetworkCapabilities {
  // Movement & Positioning
  final bool canJog;
  final bool canHome;
  final bool canBedLevel;
  final List<String> supportedAxes;

  // Thermal Hardware
  final bool hasBedHeater;
  final bool hasExtruderHeater;
  final bool hasChamberHeater;
  final int nozzleCount;
  final double maxBedTemp;
  final double maxExtruderTemp;
  final double? maxChamberTemp;

  // Ventilation & Accessories
  final bool hasPartCoolingFan;
  final bool hasChamberFan;
  final bool hasAuxFan;
  final bool hasFiltration;
  final bool hasLedControl;

  // Overrides & Tuning
  final bool canAdjustSpeed;
  final bool canAdjustZOffset;

  // Ecosystem & Job
  final bool hasCamera;
  final bool hasMaterialStation;
  final int? maxMaterialSlots;

  // Job Execution
  final bool canPause;
  final bool canResume;
  final bool canCancel;

  const PrinterNetworkCapabilities({
    this.canJog = false,
    this.canHome = false,
    this.canBedLevel = false,
    this.supportedAxes = const ['X', 'Y', 'Z'],
    this.hasBedHeater = true,
    this.hasExtruderHeater = true,
    this.hasChamberHeater = false,
    this.nozzleCount = 1,
    this.maxBedTemp = 100.0,
    this.maxExtruderTemp = 260.0,
    this.maxChamberTemp,
    this.hasPartCoolingFan = true,
    this.hasChamberFan = false,
    this.hasAuxFan = false,
    this.hasFiltration = false,
    this.hasLedControl = false,
    this.canAdjustSpeed = true,
    this.canAdjustZOffset = true,
    this.hasCamera = false,
    this.hasMaterialStation = false,
    this.maxMaterialSlots,
    this.canPause = true,
    this.canResume = true,
    this.canCancel = true,
  });

  factory PrinterNetworkCapabilities.fromJson(Map<String, dynamic> json) {
    return PrinterNetworkCapabilities(
      canJog: json['canJog'] as bool? ?? false,
      canHome: json['canHome'] as bool? ?? false,
      canBedLevel: json['canBedLevel'] as bool? ?? false,
      supportedAxes: (json['supportedAxes'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const ['X', 'Y', 'Z'],
      hasBedHeater: json['hasBedHeater'] as bool? ?? true,
      hasExtruderHeater: json['hasExtruderHeater'] as bool? ?? true,
      hasChamberHeater: json['hasChamberHeater'] as bool? ?? false,
      nozzleCount: (json['nozzleCount'] as num?)?.toInt() ?? 1,
      maxBedTemp: (json['maxBedTemp'] as num?)?.toDouble() ?? 100.0,
      maxExtruderTemp: (json['maxExtruderTemp'] as num?)?.toDouble() ?? 260.0,
      maxChamberTemp: (json['maxChamberTemp'] as num?)?.toDouble(),
      hasPartCoolingFan: json['hasPartCoolingFan'] as bool? ?? true,
      hasChamberFan: json['hasChamberFan'] as bool? ?? false,
      hasAuxFan: json['hasAuxFan'] as bool? ?? false,
      hasFiltration: json['hasFiltration'] as bool? ?? false,
      hasLedControl: json['hasLedControl'] as bool? ?? false,
      canAdjustSpeed: json['canAdjustSpeed'] as bool? ?? true,
      canAdjustZOffset: json['canAdjustZOffset'] as bool? ?? true,
      hasCamera: json['hasCamera'] as bool? ?? false,
      hasMaterialStation: json['hasMaterialStation'] as bool? ?? false,
      maxMaterialSlots: (json['maxMaterialSlots'] as num?)?.toInt(),
      canPause: json['canPause'] as bool? ?? true,
      canResume: json['canResume'] as bool? ?? true,
      canCancel: json['canCancel'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'canJog': canJog,
      'canHome': canHome,
      'canBedLevel': canBedLevel,
      'supportedAxes': supportedAxes,
      'hasBedHeater': hasBedHeater,
      'hasExtruderHeater': hasExtruderHeater,
      'hasChamberHeater': hasChamberHeater,
      'nozzleCount': nozzleCount,
      'maxBedTemp': maxBedTemp,
      'maxExtruderTemp': maxExtruderTemp,
      'maxChamberTemp': maxChamberTemp,
      'hasPartCoolingFan': hasPartCoolingFan,
      'hasChamberFan': hasChamberFan,
      'hasAuxFan': hasAuxFan,
      'hasFiltration': hasFiltration,
      'hasLedControl': hasLedControl,
      'canAdjustSpeed': canAdjustSpeed,
      'canAdjustZOffset': canAdjustZOffset,
      'hasCamera': hasCamera,
      'hasMaterialStation': hasMaterialStation,
      'maxMaterialSlots': maxMaterialSlots,
      'canPause': canPause,
      'canResume': canResume,
      'canCancel': canCancel,
    };
  }

  PrinterNetworkCapabilities copyWith({
    bool? canJog,
    bool? canHome,
    bool? canBedLevel,
    List<String>? supportedAxes,
    bool? hasBedHeater,
    bool? hasExtruderHeater,
    bool? hasChamberHeater,
    int? nozzleCount,
    double? maxBedTemp,
    double? maxExtruderTemp,
    double? maxChamberTemp,
    bool? hasPartCoolingFan,
    bool? hasChamberFan,
    bool? hasAuxFan,
    bool? hasFiltration,
    bool? hasLedControl,
    bool? canAdjustSpeed,
    bool? canAdjustZOffset,
    bool? hasCamera,
    bool? hasMaterialStation,
    int? maxMaterialSlots,
    bool? canPause,
    bool? canResume,
    bool? canCancel,
  }) {
    return PrinterNetworkCapabilities(
      canJog: canJog ?? this.canJog,
      canHome: canHome ?? this.canHome,
      canBedLevel: canBedLevel ?? this.canBedLevel,
      supportedAxes: supportedAxes ?? this.supportedAxes,
      hasBedHeater: hasBedHeater ?? this.hasBedHeater,
      hasExtruderHeater: hasExtruderHeater ?? this.hasExtruderHeater,
      hasChamberHeater: hasChamberHeater ?? this.hasChamberHeater,
      nozzleCount: nozzleCount ?? this.nozzleCount,
      maxBedTemp: maxBedTemp ?? this.maxBedTemp,
      maxExtruderTemp: maxExtruderTemp ?? this.maxExtruderTemp,
      maxChamberTemp: maxChamberTemp ?? this.maxChamberTemp,
      hasPartCoolingFan: hasPartCoolingFan ?? this.hasPartCoolingFan,
      hasChamberFan: hasChamberFan ?? this.hasChamberFan,
      hasAuxFan: hasAuxFan ?? this.hasAuxFan,
      hasFiltration: hasFiltration ?? this.hasFiltration,
      hasLedControl: hasLedControl ?? this.hasLedControl,
      canAdjustSpeed: canAdjustSpeed ?? this.canAdjustSpeed,
      canAdjustZOffset: canAdjustZOffset ?? this.canAdjustZOffset,
      hasCamera: hasCamera ?? this.hasCamera,
      hasMaterialStation: hasMaterialStation ?? this.hasMaterialStation,
      maxMaterialSlots: maxMaterialSlots ?? this.maxMaterialSlots,
      canPause: canPause ?? this.canPause,
      canResume: canResume ?? this.canResume,
      canCancel: canCancel ?? this.canCancel,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! PrinterNetworkCapabilities) return false;
    return other.canJog == canJog &&
        other.canHome == canHome &&
        other.canBedLevel == canBedLevel &&
        _listEquals(other.supportedAxes, supportedAxes) &&
        other.hasBedHeater == hasBedHeater &&
        other.hasExtruderHeater == hasExtruderHeater &&
        other.hasChamberHeater == hasChamberHeater &&
        other.nozzleCount == nozzleCount &&
        other.maxBedTemp == maxBedTemp &&
        other.maxExtruderTemp == maxExtruderTemp &&
        other.maxChamberTemp == maxChamberTemp &&
        other.hasPartCoolingFan == hasPartCoolingFan &&
        other.hasChamberFan == hasChamberFan &&
        other.hasAuxFan == hasAuxFan &&
        other.hasFiltration == hasFiltration &&
        other.hasLedControl == hasLedControl &&
        other.canAdjustSpeed == canAdjustSpeed &&
        other.canAdjustZOffset == canAdjustZOffset &&
        other.hasCamera == hasCamera &&
        other.hasMaterialStation == hasMaterialStation &&
        other.maxMaterialSlots == maxMaterialSlots &&
        other.canPause == canPause &&
        other.canResume == canResume &&
        other.canCancel == canCancel;
  }

  @override
  int get hashCode => Object.hashAll([
        canJog,
        canHome,
        canBedLevel,
        Object.hashAll(supportedAxes),
        hasBedHeater,
        hasExtruderHeater,
        hasChamberHeater,
        nozzleCount,
        maxBedTemp,
        maxExtruderTemp,
        maxChamberTemp,
        hasPartCoolingFan,
        hasChamberFan,
        hasAuxFan,
        hasFiltration,
        hasLedControl,
        canAdjustSpeed,
        canAdjustZOffset,
        hasCamera,
        hasMaterialStation,
        maxMaterialSlots,
        canPause,
        canResume,
        canCancel,
      ]);

  static bool _listEquals(List<String> a, List<String> b) {
    if (identical(a, b)) return true;
    if (a.length != b.length) return false;
    for (int i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

/// Type alias for convenience and backward compatibility.
typedef PrinterCapabilities = PrinterNetworkCapabilities;

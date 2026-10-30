class MaterialSlot {
  final int slotId;
  final String? materialType;
  final String? materialColor;
  final bool isEmpty;
  final double? remainingPercent;
  final bool isActive;
  final String? materialName;
  final double? targetTemp;

  const MaterialSlot({
    required this.slotId,
    this.materialType,
    this.materialColor,
    this.isEmpty = false,
    this.remainingPercent,
    this.isActive = false,
    this.materialName,
    this.targetTemp,
  });

  // Backwards-compatible aliases
  int get id => slotId;
  String? get type => materialType;
  String? get colorHex => materialColor;

  factory MaterialSlot.fromJson(Map<String, dynamic> json, {int? stationActiveSlot, int index = 0}) {
    final parsedId = (json['slotId'] as num?)?.toInt() ?? (json['id'] as num?)?.toInt() ?? (index + 1);
    final slotNum = parsedId >= 1 ? parsedId : index + 1;
    final empty = json['isEmpty'] as bool? ?? false;

    final activeFromStation = stationActiveSlot != null &&
        (stationActiveSlot == parsedId ||
            stationActiveSlot + 1 == slotNum ||
            stationActiveSlot == index);
    final explicitActive = json['isActive'] as bool? ?? json['active'] as bool? ?? false;

    return MaterialSlot(
      slotId: parsedId,
      materialType: json['materialType'] as String? ?? json['type'] as String? ?? json['material'] as String?,
      materialColor: json['materialColor'] as String? ?? json['colorHex'] as String? ?? json['color'] as String?,
      isEmpty: empty,
      remainingPercent: (json['remainingPercent'] as num?)?.toDouble() ?? (json['remain'] as num?)?.toDouble(),
      isActive: activeFromStation || explicitActive,
      materialName: json['materialName'] as String? ?? json['name'] as String?,
      targetTemp: (json['targetTemp'] as num?)?.toDouble(),
    );
  }
}

class MaterialStationStatus {
  final bool connected;
  final List<MaterialSlot> slots;
  final int? activeSlot;
  final String overallStatus;

  const MaterialStationStatus({
    required this.connected,
    required this.slots,
    this.activeSlot,
    this.overallStatus = 'ready',
  });

  int? get activeSlotIndex => activeSlot;

  factory MaterialStationStatus.fromJson(Map<String, dynamic> json) {
    final rawSlots = json['slots'] as List<dynamic>? ?? [];
    final activeSlotVal = (json['activeSlot'] as num?)?.toInt() ?? (json['activeSlotIndex'] as num?)?.toInt();
    final parsedSlots = <MaterialSlot>[];

    for (var i = 0; i < rawSlots.length; i++) {
      parsedSlots.add(
        MaterialSlot.fromJson(
          rawSlots[i] as Map<String, dynamic>,
          stationActiveSlot: activeSlotVal,
          index: i,
        ),
      );
    }

    return MaterialStationStatus(
      connected: json['connected'] as bool? ?? false,
      slots: parsedSlots,
      activeSlot: activeSlotVal,
      overallStatus: json['overallStatus'] as String? ?? 'ready',
    );
  }
}

class ActiveSpoolData {
  final int id;
  final String name;
  final String? vendor;
  final String? material;
  final String colorHex;
  final double remainingWeight;
  final double remainingLength;

  const ActiveSpoolData({
    required this.id,
    required this.name,
    this.vendor,
    this.material,
    required this.colorHex,
    required this.remainingWeight,
    required this.remainingLength,
  });

  factory ActiveSpoolData.fromJson(Map<String, dynamic> json) {
    return ActiveSpoolData(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? 'Spool',
      vendor: json['vendor'] as String?,
      material: json['material'] as String?,
      colorHex: json['colorHex'] as String? ?? '#00AE42',
      remainingWeight: (json['remainingWeight'] as num?)?.toDouble() ?? 0.0,
      remainingLength: (json['remainingLength'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

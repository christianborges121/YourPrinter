class WebUIJobFile {
  final String filename;
  final String? displayName;
  final int? size;
  final int? printTime;
  final double? filamentLength;
  final double? filamentWeight;
  final String? thumbnail;
  final DateTime? modifiedTime;
  final String? layerHeight;
  final String? source; // 'recent' | 'local'

  const WebUIJobFile({
    required this.filename,
    this.displayName,
    this.size,
    this.printTime,
    this.filamentLength,
    this.filamentWeight,
    this.thumbnail,
    this.modifiedTime,
    this.layerHeight,
    this.source,
  });

  factory WebUIJobFile.fromJson(Map<String, dynamic> json) {
    return WebUIJobFile(
      filename: json['filename'] as String? ?? json['name'] as String? ?? '',
      displayName: json['displayName'] as String? ?? json['filename'] as String?,
      size: (json['size'] as num?)?.toInt(),
      printTime: (json['printTime'] as num?)?.toInt() ?? (json['estimatedPrintTime'] as num?)?.toInt(),
      filamentLength: (json['filamentLength'] as num?)?.toDouble() ?? (json['filamentUsage'] as num?)?.toDouble(),
      filamentWeight: (json['filamentWeight'] as num?)?.toDouble(),
      thumbnail: json['thumbnail'] as String? ?? json['thumbnailData'] as String?,
      modifiedTime: json['modifiedTime'] != null
          ? DateTime.tryParse(json['modifiedTime'] as String)
          : null,
      layerHeight: json['layerHeight'] as String?,
      source: json['source'] as String? ?? 'recent',
    );
  }
}

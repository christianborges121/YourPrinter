class PrintHistoryItem {
  final String id;
  final String filename;
  final String displayName;
  final String printerName;
  final String? contextId;
  final DateTime startTime;
  final DateTime endTime;
  final int durationSeconds;
  final double? filamentMeters;
  final double? filamentGrams;
  final int? layers;
  final String status; // 'completed' | 'cancelled' | 'failed'
  final String? thumbnailUrl;

  const PrintHistoryItem({
    required this.id,
    required this.filename,
    required this.displayName,
    required this.printerName,
    this.contextId,
    required this.startTime,
    required this.endTime,
    required this.durationSeconds,
    this.filamentMeters,
    this.filamentGrams,
    this.layers,
    required this.status,
    this.thumbnailUrl,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'filename': filename,
        'displayName': displayName,
        'printerName': printerName,
        if (contextId != null) 'contextId': contextId,
        'startTime': startTime.toIso8601String(),
        'endTime': endTime.toIso8601String(),
        'durationSeconds': durationSeconds,
        if (filamentMeters != null) 'filamentMeters': filamentMeters,
        if (filamentGrams != null) 'filamentGrams': filamentGrams,
        if (layers != null) 'layers': layers,
        'status': status,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      };

  factory PrintHistoryItem.fromJson(Map<String, dynamic> json) {
    return PrintHistoryItem(
      id: json['id'] as String? ?? '',
      filename: json['filename'] as String? ?? '',
      displayName: json['displayName'] as String? ?? json['filename'] as String? ?? '',
      printerName: json['printerName'] as String? ?? 'Flashforge Printer',
      contextId: json['contextId'] as String?,
      startTime: DateTime.tryParse(json['startTime'] as String? ?? '') ?? DateTime.now(),
      endTime: DateTime.tryParse(json['endTime'] as String? ?? '') ?? DateTime.now(),
      durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
      filamentMeters: (json['filamentMeters'] as num?)?.toDouble(),
      filamentGrams: (json['filamentGrams'] as num?)?.toDouble(),
      layers: (json['layers'] as num?)?.toInt(),
      status: json['status'] as String? ?? 'completed',
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }
}

class PrintHistoryStats {
  final int totalPrints;
  final int completedCount;
  final int cancelledCount;
  final int failedCount;
  final int successRatePercent;
  final int totalDurationSeconds;
  final double totalFilamentMeters;

  const PrintHistoryStats({
    required this.totalPrints,
    required this.completedCount,
    required this.cancelledCount,
    required this.failedCount,
    required this.successRatePercent,
    required this.totalDurationSeconds,
    required this.totalFilamentMeters,
  });

  factory PrintHistoryStats.fromItems(List<PrintHistoryItem> items) {
    if (items.isEmpty) {
      return const PrintHistoryStats(
        totalPrints: 0,
        completedCount: 0,
        cancelledCount: 0,
        failedCount: 0,
        successRatePercent: 100,
        totalDurationSeconds: 0,
        totalFilamentMeters: 0.0,
      );
    }

    int completed = 0;
    int cancelled = 0;
    int failed = 0;
    int totalDuration = 0;
    double totalFilament = 0.0;

    for (final item in items) {
      if (item.status == 'completed') {
        completed++;
      } else if (item.status == 'cancelled') {
        cancelled++;
      } else if (item.status == 'failed') {
        failed++;
      }
      if (item.durationSeconds > 0) {
        totalDuration += item.durationSeconds;
      }
      if (item.filamentMeters != null && item.filamentMeters! > 0) {
        totalFilament += item.filamentMeters!;
      }
    }

    final successRate = items.isNotEmpty ? ((completed / items.length) * 100).round() : 100;

    return PrintHistoryStats(
      totalPrints: items.length,
      completedCount: completed,
      cancelledCount: cancelled,
      failedCount: failed,
      successRatePercent: successRate,
      totalDurationSeconds: totalDuration,
      totalFilamentMeters: totalFilament,
    );
  }
}

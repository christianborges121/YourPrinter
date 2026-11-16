/// Normalize progress percentage into a clamped 0-100 range.
/// Values strictly between 0 and 1 (exclusive) are scaled from decimal ratios,
/// preserving integer 1 as 1% instead of promoting it to 100%.
double normalizeProgressPercent(double? rawProgress, {bool isCompleted = false}) {
  if (isCompleted) return 100.0;
  if (rawProgress == null || rawProgress.isNaN || rawProgress <= 0) return 0.0;
  final scaled = rawProgress < 1.0 ? rawProgress * 100.0 : rawProgress;
  return scaled.clamp(0.0, 100.0).toDouble();
}

/// Format remaining print duration expressed in minutes (backend JobProgress.timeRemaining).
String formatRemainingMinutes(int totalMinutes) {
  if (totalMinutes <= 0) return '< 1m left';
  final hours = totalMinutes ~/ 60;
  final minutes = totalMinutes % 60;
  if (hours > 0) {
    return '${hours}h ${minutes}m left';
  }
  return '${minutes}m left';
}

/// Format elapsed print duration expressed in seconds.
String formatDurationSeconds(int totalSeconds) {
  if (totalSeconds <= 0) return '--';
  final hours = totalSeconds ~/ 3600;
  final minutes = (totalSeconds % 3600) ~/ 60;
  if (hours > 0) {
    return '${hours}h ${minutes}m';
  }
  return '${minutes}m ${totalSeconds % 60}s';
}

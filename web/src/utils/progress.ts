/**
 * Normalize progress percentages to a clamped 0-100 range.
 * Values strictly between 0 and 1 (exclusive) are treated as decimal ratios (0.0-1.0),
 * preserving integer 1 as 1% instead of falsely promoting it to 100%.
 */
export function normalizeProgressPercent(rawProgress?: number | null, isCompleted = false): number {
  if (isCompleted) return 100;
  if (typeof rawProgress !== 'number' || !Number.isFinite(rawProgress) || rawProgress <= 0) {
    return 0;
  }
  const scaled = rawProgress < 1.0 ? rawProgress * 100 : rawProgress;
  return Math.min(100, Math.max(0, scaled));
}

/**
 * Format elapsed duration expressed in seconds (e.g. "2h 15m" or "14m 30s").
 */
export function formatDurationSeconds(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '--';
  }
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m ${totalSec % 60}s`;
}

/**
 * Format remaining print time expressed in minutes (backend contract: JobProgress.timeRemaining).
 */
export function formatRemainingMinutes(minutes?: number | null): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    return '--';
  }
  if (minutes === 0) {
    return '< 1m left';
  }
  const totalMins = Math.round(minutes);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m left`;
  }
  return `${mins}m left`;
}

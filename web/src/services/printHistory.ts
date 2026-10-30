/**
 * @fileoverview Persistent Print History and Analytics service.
 * Stores completed, cancelled, and failed print jobs in localStorage and calculates farm telemetry.
 */

import type { WebUIJobFile } from '../types';

export interface PrintHistoryItem {
  id: string;
  filename: string;
  displayName: string;
  printerName: string;
  contextId?: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  durationSeconds: number;
  filamentMeters?: number;
  filamentGrams?: number;
  layers?: number;
  status: 'completed' | 'cancelled' | 'failed';
  thumbnailUrl?: string;
}

export interface PrintHistoryStats {
  totalPrints: number;
  completedCount: number;
  cancelledCount: number;
  failedCount: number;
  successRatePercent: number;
  totalDurationSeconds: number;
  totalFilamentMeters: number;
}

const STORAGE_KEY = 'yourprinter_print_history';

/**
 * Retrieve full print history from localStorage
 */
export function getPrintHistory(): PrintHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist print history items
 */
function savePrintHistory(items: PrintHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 200))); // Keep latest 200
  } catch {
    // Ignore quota issues
  }
}

/**
 * Add a new print history item
 */
export function addPrintHistoryItem(item: Omit<PrintHistoryItem, 'id'>): PrintHistoryItem {
  const current = getPrintHistory();
  const newItem: PrintHistoryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  };

  // Avoid exact duplicate within 1 minute
  const isDuplicate = current.some(
    (existing) =>
      existing.filename === newItem.filename &&
      Math.abs(new Date(existing.endTime).getTime() - new Date(newItem.endTime).getTime()) < 60000
  );

  if (!isDuplicate) {
    const updated = [newItem, ...current];
    savePrintHistory(updated);
  }

  return newItem;
}

/**
 * Remove an item by id
 */
export function removePrintHistoryItem(id: string): void {
  const current = getPrintHistory();
  const filtered = current.filter((i) => i.id !== id);
  savePrintHistory(filtered);
}

/**
 * Clear all print history
 */
export function clearPrintHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Calculate farm / printer analytics from history
 */
export function getPrintHistoryStats(items?: PrintHistoryItem[]): PrintHistoryStats {
  const history = items || getPrintHistory();
  const totalPrints = history.length;
  if (totalPrints === 0) {
    return {
      totalPrints: 0,
      completedCount: 0,
      cancelledCount: 0,
      failedCount: 0,
      successRatePercent: 100,
      totalDurationSeconds: 0,
      totalFilamentMeters: 0,
    };
  }

  let completedCount = 0;
  let cancelledCount = 0;
  let failedCount = 0;
  let totalDurationSeconds = 0;
  let totalFilamentMeters = 0;

  for (const item of history) {
    if (item.status === 'completed') {
      completedCount++;
    } else if (item.status === 'cancelled') {
      cancelledCount++;
    } else if (item.status === 'failed') {
      failedCount++;
    }

    if (item.durationSeconds && item.durationSeconds > 0) {
      totalDurationSeconds += item.durationSeconds;
    }
    if (item.filamentMeters && item.filamentMeters > 0) {
      totalFilamentMeters += item.filamentMeters;
    }
  }

  const successRatePercent = totalPrints > 0 ? Math.round((completedCount / totalPrints) * 100) : 100;

  return {
    totalPrints,
    completedCount,
    cancelledCount,
    failedCount,
    successRatePercent,
    totalDurationSeconds,
    totalFilamentMeters,
  };
}

/**
 * Seed print history from backend recent jobs if history is currently empty
 */
export function seedHistoryFromRecentJobs(
  recentJobs: WebUIJobFile[],
  printerName: string,
  contextId?: string
): void {
  const current = getPrintHistory();
  if (current.length > 0 || !recentJobs || recentJobs.length === 0) {
    return;
  }

  const now = Date.now();
  const initialItems: PrintHistoryItem[] = recentJobs.slice(0, 10).map((job, idx) => {
    // Stagger simulated end dates by a day each for realism
    const end = new Date(now - idx * 86400000 - 3600000);
    const duration = job.printTime || 3600;
    const start = new Date(end.getTime() - duration * 1000);

    return {
      id: `seed-${idx}-${Date.now()}`,
      filename: job.filename,
      displayName: job.displayName || job.filename.replace(/\.(gcode|3mf|gx|g)$/i, ''),
      printerName: printerName || 'Flashforge Printer',
      contextId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationSeconds: duration,
      filamentMeters: job.filamentLength ? job.filamentLength / 1000 : undefined,
      filamentGrams: job.filamentWeight,
      status: 'completed',
    };
  });

  savePrintHistory(initialItems);
}

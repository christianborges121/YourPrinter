/**
 * @fileoverview Service for communicating with the Obico Darknet YOLO AI Watchdog.
 *
 * Provides status polling, real-time config updates, auto-pause coordination,
 * and snapshot proxying between FlashForgeUI and the watchdog container.
 */

import http from 'http';

export interface WatchdogStatus {
  online: boolean;
  state: 'idle' | 'monitoring' | 'alert' | 'paused' | 'offline';
  confidence: number;
  max_confidence?: number;
  consecutive_failures: number;
  consecutive_required: number;
  threshold: number;
  inference_time_ms: number;
  last_check: string | null;
  active_job: string | null;
  layer: string | null;
  auto_pause_enabled: boolean;
  auto_pause_triggered: boolean;
  total_inspections: number;
  total_failures_detected: number;
  printer_status: string;
  check_interval_sec?: number;
}

export interface WatchdogSnapshotItem {
  filename: string;
  timestamp: string;
  confidence: number;
  layer: string;
}

const DEFAULT_WATCHDOG_URL = process.env.WATCHDOG_URL || 'http://localhost:8085';

export class WatchdogService {
  private static instance: WatchdogService | null = null;
  private readonly baseUrl: string;
  private statusCache = new Map<string, { status: WatchdogStatus; timestamp: number }>();
  private activeFetches = new Map<string, Promise<WatchdogStatus>>();

  public constructor(baseUrl: string = DEFAULT_WATCHDOG_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public static getInstance(): WatchdogService {
    if (!WatchdogService.instance) {
      WatchdogService.instance = new WatchdogService();
    }
    return WatchdogService.instance;
  }

  public getCachedStatus(contextId?: string): WatchdogStatus {
    const key = contextId || '__default__';
    const cached = this.statusCache.get(key) || (key !== '__default__' ? this.statusCache.get('__default__') : undefined);
    if (cached) {
      return cached.status;
    }
    return {
      online: false,
      state: 'offline',
      confidence: 0,
      consecutive_failures: 0,
      consecutive_required: 2,
      threshold: 0.2,
      inference_time_ms: 0,
      last_check: null,
      active_job: null,
      layer: null,
      auto_pause_enabled: true,
      auto_pause_triggered: false,
      total_inspections: 0,
      total_failures_detected: 0,
      printer_status: 'unknown',
    };
  }

  public async getStatus(contextId?: string): Promise<WatchdogStatus> {
    const key = contextId || '__default__';
    const now = Date.now();
    const cached = this.statusCache.get(key);

    // Cache status for up to 2 seconds to avoid flooding
    if (cached && now - cached.timestamp < 2000) {
      return cached.status;
    }

    const inFlight = this.activeFetches.get(key);
    if (inFlight) {
      return inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        const url = `${this.baseUrl}/status${contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''}`;
        const resp = await fetch(url, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const data = (await resp.json()) as Record<string, unknown>;
          const status: WatchdogStatus = {
            online: true,
            state: (data.state as WatchdogStatus['state']) || 'monitoring',
            confidence: Number(data.confidence || 0),
            max_confidence: Number(data.max_confidence || 0),
            consecutive_failures: Number(data.consecutive_failures || 0),
            consecutive_required: Number(data.consecutive_required || 2),
            threshold: Number(data.threshold || 0.2),
            inference_time_ms: Number(data.inference_time_ms || 0),
            last_check: (data.last_check as string) || null,
            active_job: (data.active_job as string) || null,
            layer: (data.layer as string) || null,
            auto_pause_enabled: Boolean(data.auto_pause_enabled),
            auto_pause_triggered: Boolean(data.auto_pause_triggered),
            total_inspections: Number(data.total_inspections || 0),
            total_failures_detected: Number(data.total_failures_detected || 0),
            printer_status: (data.printer_status as string) || 'idle',
            check_interval_sec: Number(data.check_interval_sec || 15),
          };
          this.statusCache.set(key, { status, timestamp: now });
          if (!this.statusCache.has('__default__') || key === '__default__') {
            this.statusCache.set('__default__', { status, timestamp: now });
          }
          return status;
        }
      } catch {
        // Watchdog offline or unreachable
      } finally {
        this.activeFetches.delete(key);
      }

      const offlineStatus: WatchdogStatus = {
        online: false,
        state: 'offline',
        confidence: 0,
        consecutive_failures: 0,
        consecutive_required: 2,
        threshold: 0.2,
        inference_time_ms: 0,
        last_check: null,
        active_job: null,
        layer: null,
        auto_pause_enabled: true,
        auto_pause_triggered: false,
        total_inspections: 0,
        total_failures_detected: 0,
        printer_status: 'unknown',
      };
      this.statusCache.set(key, { status: offlineStatus, timestamp: now });
      return offlineStatus;
    })();

    this.activeFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  public async updateConfig(config: {
    threshold?: number;
    consecutive_required?: number;
    auto_pause_enabled?: boolean;
    check_interval_sec?: number;
  }): Promise<{ success: boolean; config?: unknown; error?: string }> {
    try {
      const resp = await fetch(`${this.baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { success: boolean; config?: unknown };
        this.statusCache.clear(); // Invalidate all cached status
        return data;
      }
      return { success: false, error: `HTTP ${resp.status}` };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Watchdog unreachable' };
    }
  }

  public async getSnapshotsList(contextId?: string): Promise<WatchdogSnapshotItem[]> {
    try {
      const url = `${this.baseUrl}/snapshots${contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = (await resp.json()) as { snapshots?: WatchdogSnapshotItem[] };
        return data.snapshots || [];
      }
    } catch {
      // Ignore
    }
    return [];
  }

  public getSnapshotStream(pathSuffix: string, contextId?: string): Promise<{ status: number; contentType: string; data: Buffer } | null> {
    return new Promise((resolve) => {
      const cleanPath = pathSuffix.replace(/^\/+/, '');
      const queryGlue = cleanPath.includes('?') ? '&' : '?';
      const targetUrl = `${this.baseUrl}/${cleanPath}${contextId ? `${queryGlue}contextId=${encodeURIComponent(contextId)}` : ''}`;
      http
        .get(targetUrl, (res) => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: 200,
              contentType: res.headers['content-type'] || 'image/jpeg',
              data: Buffer.concat(chunks),
            });
          });
        })
        .on('error', () => resolve(null));
    });
  }
}

export function getWatchdogService(): WatchdogService {
  return WatchdogService.getInstance();
}

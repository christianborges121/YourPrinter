/**
 * REST API client matching the YourPrinter Express API.
 */
import type {
  ActiveSpoolData,
  CameraProxyConfig,
  DiscordConfigData,
  FleetOverviewPrinter,
  MaterialStationStatus,
  PrinterContext,
  PrinterFeatures,
  PrinterNetworkCapabilities,
  PrinterStatusData,
  SpoolmanConfigData,
  SpoolmanSpoolSummary,
  WatchdogStatusData,
  WebUIAuthStatus,
  WebUIJobFile,
} from '../types';
import { getAuthToken, getServerUrl } from './config';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const baseUrl = getServerUrl();
    let url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          searchParams.append(key, String(val));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        url += `${url.includes('?') ? '&' : '?'}${qs}`;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message || errorData.error) {
          errorMsg = errorData.message || errorData.error;
        }
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }

    return response.json() as Promise<T>;
  }

  // Auth
  async getAuthStatus(): Promise<WebUIAuthStatus> {
    return this.request<WebUIAuthStatus>('/api/auth/status');
  }

  async login(password: string): Promise<{ success: boolean; token?: string; message?: string }> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  // Contexts & Printers
  async getContexts(): Promise<{ contexts: PrinterContext[]; activeContextId?: string }> {
    return this.request('/api/contexts');
  }

  async switchContext(contextId: string): Promise<{ success: boolean; message?: string }> {
    return this.request('/api/contexts/switch', {
      method: 'POST',
      body: JSON.stringify({ contextId }),
    });
  }

  async selectPrinter(nameOrIndex: string | number): Promise<{ success: boolean }> {
    return this.request(`/api/printers/${nameOrIndex}/select`, {
      method: 'POST',
    });
  }

  async getPrintersOverview(): Promise<{ success: boolean; printers: FleetOverviewPrinter[] }> {
    return this.request('/api/printers/overview');
  }

  // Telemetry & Features
  async getPrinterStatus(contextId?: string): Promise<{ success: boolean; status: PrinterStatusData }> {
    return this.request('/api/printer/status', {}, { contextId });
  }

  async getPrinterFeatures(contextId?: string): Promise<{ success: boolean; features: PrinterFeatures }> {
    return this.request('/api/printer/features', {}, { contextId });
  }

  async getPrinterCapabilities(contextId?: string): Promise<{ success: boolean; capabilities: PrinterNetworkCapabilities }> {
    return this.request('/api/printer/capabilities', {}, { contextId });
  }

  async getMaterialStation(contextId?: string): Promise<{ success: boolean; status: MaterialStationStatus | null }> {
    return this.request('/api/printer/material-station', {}, { contextId });
  }

  // Camera
  async getCameraProxyConfig(contextId?: string): Promise<CameraProxyConfig> {
    return this.request('/api/camera/proxy-config', {}, { contextId });
  }

  getStreamMjpegUrl(streamName: string): string {
    const baseUrl = getServerUrl();
    return `${baseUrl}/api/go2rtc/api/stream.mjpeg?src=${encodeURIComponent(streamName)}`;
  }

  getSnapshotUrl(contextId?: string, cacheBuster?: number): string {
    const baseUrl = getServerUrl();
    const ts = cacheBuster || Date.now();
    const cid = contextId ? `&contextId=${encodeURIComponent(contextId)}` : '';
    return `${baseUrl}/api/camera/snapshot?t=${ts}${cid}`;
  }

  // Job Controls
  async pauseJob(contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/pause', { method: 'POST', body: JSON.stringify({ contextId }) });
  }

  async resumeJob(contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/resume', { method: 'POST', body: JSON.stringify({ contextId }) });
  }

  async cancelJob(contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/cancel', { method: 'POST', body: JSON.stringify({ contextId }) });
  }

  async homeAxes(contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/home', { method: 'POST', body: JSON.stringify({ contextId }) });
  }

  async setLed(on: boolean, contextId?: string): Promise<{ success: boolean }> {
    const endpoint = on ? '/api/printer/control/led-on' : '/api/printer/control/led-off';
    return this.request(endpoint, { method: 'POST', body: JSON.stringify({ contextId }) });
  }

  async loadMaterialSlot(slotId: number, contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/material/load', {
      method: 'POST',
      body: JSON.stringify({ slotId, contextId }),
    });
  }

  async unloadMaterial(contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/material/unload', {
      method: 'POST',
      body: JSON.stringify({ contextId }),
    });
  }

  // Temperatures
  async setBedTemp(target: number, contextId?: string): Promise<{ success: boolean }> {
    if (target <= 0) {
      return this.request('/api/printer/temperature/bed/off', { method: 'POST', body: JSON.stringify({ contextId }) });
    }
    return this.request('/api/printer/temperature/bed', {
      method: 'POST',
      body: JSON.stringify({ temperature: target, contextId }),
    });
  }

  async setExtruderTemp(target: number, toolIndex = 0, contextId?: string): Promise<{ success: boolean }> {
    if (target <= 0) {
      return this.request('/api/printer/temperature/extruder/off', {
        method: 'POST',
        body: JSON.stringify({ tool: toolIndex, contextId }),
      });
    }
    return this.request('/api/printer/temperature/extruder', {
      method: 'POST',
      body: JSON.stringify({ temperature: target, tool: toolIndex, contextId }),
    });
  }

  async setChamberTemp(target: number, contextId?: string): Promise<{ success: boolean }> {
    if (target <= 0) {
      return this.request('/api/printer/temperature/chamber/off', {
        method: 'POST',
        body: JSON.stringify({ contextId }),
      });
    }
    return this.request('/api/printer/temperature/chamber', {
      method: 'POST',
      body: JSON.stringify({ temperature: target, contextId }),
    });
  }

  // Filtration
  async setFiltration(mode: 'off' | 'internal' | 'external', contextId?: string): Promise<{ success: boolean }> {
    const endpoint =
      mode === 'external'
        ? '/api/printer/filtration/external'
        : mode === 'internal'
        ? '/api/printer/filtration/internal'
        : '/api/printer/filtration/off';
    return this.request(endpoint, { method: 'POST', body: JSON.stringify({ contextId }) });
  }

  // Fan Control
  async setFanSpeed(percent: number, contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/fan', {
      method: 'POST',
      body: JSON.stringify({ coolingFan: percent, contextId }),
    });
  }

  async setChamberFanSpeed(percent: number, contextId?: string): Promise<{ success: boolean }> {
    return this.request('/api/printer/control/fan', {
      method: 'POST',
      body: JSON.stringify({ chamberFan: percent, contextId }),
    });
  }

  // Files & Jobs
  async getRecentJobs(contextId?: string): Promise<{ success: boolean; files: WebUIJobFile[] }> {
    return this.request('/api/jobs/recent', {}, { contextId });
  }

  async getLocalJobs(contextId?: string): Promise<{ success: boolean; files: WebUIJobFile[] }> {
    return this.request('/api/jobs/local', {}, { contextId });
  }

  async startJob(filename: string, contextId?: string, leveling = false): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request('/api/jobs/start', {
      method: 'POST',
      body: JSON.stringify({ filename, contextId, leveling, startNow: true }),
    });
  }

  // Printer Management
  async addPrinter(printer: {
    name: string;
    ipAddress: string;
    serialNumber?: string;
    checkCode?: string;
    printerModel?: string;
    connectNow?: boolean;
  }): Promise<{ success: boolean; message?: string; error?: string; connectionError?: string }> {
    return this.request('/api/printers', {
      method: 'POST',
      body: JSON.stringify(printer),
    });
  }

  async deletePrinter(identifier: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/printers/${encodeURIComponent(identifier)}`, {
      method: 'DELETE',
    });
  }

  async updatePrinterSettings(
    identifier: string,
    settings: {
      customCameraEnabled?: boolean;
      customCameraUrl?: string;
      Name?: string;
      IPAddress?: string;
      CheckCode?: string;
      printerModel?: string;
    }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/printers/${encodeURIComponent(identifier)}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async fetchSnapshotBlob(contextId?: string): Promise<Blob> {
    const baseUrl = getServerUrl();
    const url = `${baseUrl}/api/camera/snapshot${contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''}`;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Snapshot request failed (${res.status})`);
    return res.blob();
  }

  // Watchdog AI
  async getWatchdogStatus(contextId?: string): Promise<{ success: boolean; status: WatchdogStatusData }> {
    return this.request('/api/watchdog/status', {}, { contextId });
  }

  async updateWatchdogConfig(
    config: {
      threshold?: number;
      auto_pause_enabled?: boolean;
      check_interval_sec?: number;
    },
    contextId?: string
  ): Promise<{ success: boolean }> {
    return this.request('/api/watchdog/config', {
      method: 'POST',
      body: JSON.stringify({ ...config, contextId }),
    });
  }

  getWatchdogSnapshotUrl(filename?: string): string {
    const baseUrl = getServerUrl();
    if (filename) {
      return `${baseUrl}/api/watchdog/snapshot/${encodeURIComponent(filename)}`;
    }
    return `${baseUrl}/api/watchdog/snapshot/latest?t=${Date.now()}`;
  }

  // Spoolman
  async getSpoolmanConfig(): Promise<SpoolmanConfigData> {
    return this.request('/api/spoolman/config');
  }

  async searchSpoolmanSpools(search?: string): Promise<{ success: boolean; spools: SpoolmanSpoolSummary[] }> {
    return this.request('/api/spoolman/spools', {}, { search });
  }

  async getActiveSpool(contextId?: string): Promise<{ success: boolean; spool: ActiveSpoolData | null }> {
    const cid = contextId || 'default';
    return this.request(`/api/spoolman/active/${encodeURIComponent(cid)}`);
  }

  async selectSpoolmanSpool(spoolId: number, contextId?: string): Promise<{ success: boolean; spool?: ActiveSpoolData }> {
    return this.request('/api/spoolman/select', {
      method: 'POST',
      body: JSON.stringify({ spoolId, contextId }),
    });
  }

  async clearSpoolmanSpool(contextId?: string): Promise<{ success: boolean; message?: string }> {
    return this.request('/api/spoolman/select', {
      method: 'DELETE',
      body: JSON.stringify({ contextId }),
    });
  }

  // Discord Notifications
  async getDiscordConfig(): Promise<{ success: boolean } & DiscordConfigData> {
    return this.request('/api/notifications/discord');
  }

  async updateDiscordConfig(config: {
    enabled?: boolean;
    webhookUrl?: string;
    includeCameraSnapshots?: boolean;
    updateIntervalMinutes?: number;
  }): Promise<{ success: boolean; message?: string }> {
    return this.request('/api/notifications/discord', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async testDiscordWebhook(options?: {
    webhookUrl?: string;
    includeCameraSnapshots?: boolean;
    contextId?: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request('/api/notifications/discord/test', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  }
}

export const api = new ApiClient();

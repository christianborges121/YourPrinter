/**
 * Real-time WebSocket client for live printer telemetry and Spoolman events.
 */
import type { ActiveSpoolData, PrinterStatusData, WebSocketMessage } from '../types';
import { getAuthToken, getServerUrl } from './config';

export type StatusListener = (status: PrinterStatusData) => void;
export type SpoolListener = (spool: ActiveSpoolData | null) => void;
export type ConnectionListener = (connected: boolean) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  private statusListeners = new Set<StatusListener>();
  private spoolListeners = new Set<SpoolListener>();
  private connectionListeners = new Set<ConnectionListener>();

  public isConnected = false;

  connect(): void {
    this.isExplicitlyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const httpUrl = getServerUrl();
      const wsUrl = httpUrl.replace(/^http/, 'ws') + '/ws';

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnection(true);

        const token = getAuthToken();
        if (token && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'AUTH', token }));
        }

        // Request initial status snapshot
        this.sendCommand({ command: 'REQUEST_STATUS' });

        // Start ping heartbeat
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          if (msg.type === 'STATUS_UPDATE' && msg.status) {
            this.notifyStatus(msg.status);
          } else if (msg.type === 'SPOOLMAN_UPDATE') {
            this.notifySpool(msg.spool || null);
          }
        } catch {
          // ignore unparsable payload
        }
      };

      this.ws.onerror = () => {
        // Handled in onclose
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyConnection(false);
        this.stopPing();

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ command: 'PING' }));
      }
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.notifyConnection(false);
  }

  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  sendCommand(payload: { command: string; gcode?: string; data?: unknown }): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  executeGcode(gcode: string): boolean {
    return this.sendCommand({
      command: 'EXECUTE_GCODE',
      gcode,
    });
  }

  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onSpool(cb: SpoolListener): () => void {
    this.spoolListeners.add(cb);
    return () => this.spoolListeners.delete(cb);
  }

  onConnection(cb: ConnectionListener): () => void {
    this.connectionListeners.add(cb);
    return () => this.connectionListeners.delete(cb);
  }

  private notifyStatus(status: PrinterStatusData): void {
    this.statusListeners.forEach((cb) => cb(status));
  }

  private notifySpool(spool: ActiveSpoolData | null): void {
    this.spoolListeners.forEach((cb) => cb(spool));
  }

  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach((cb) => cb(connected));
  }
}

export const wsClient = new WebSocketClient();

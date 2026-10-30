/**
 * @fileoverview Local MJPEG HTTP bridge for Bambu Lab A1 / P1 series printer cameras.
 *
 * Bambu Lab A1 mini streams JPEG frames over TLS on port 6000 using a proprietary 80-byte
 * binary authentication packet. This bridge connects to the printer's port 6000, authenticates
 * using the LAN access code, and exposes a standard HTTP multipart MJPEG stream endpoint
 * on localhost. This allows go2rtc to ingest the camera feed as an OEM MJPEG source and
 * serve WebRTC/MSE streams to the UI.
 */

import { EventEmitter } from 'node:events';
import http from 'node:http';
import tls from 'node:tls';

export interface BambuCameraConfig {
  readonly ip: string;
  readonly accessCode: string;
}

export class BambuCameraSession extends EventEmitter {
  private socket: tls.TLSSocket | null = null;
  private incomingBuffer = Buffer.alloc(0);
  private clients = new Set<http.ServerResponse>();
  private idleTimeoutTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private latestFrame: Buffer | null = null;

  constructor(
    public readonly printerId: string,
    public readonly config: BambuCameraConfig
  ) {
    super();
  }

  /**
   * Build the 80-byte binary authentication packet for port 6000
   */
  public static createAuthPacket(accessCode: string): Buffer {
    const packet = Buffer.alloc(80);
    // 0x40 (64 bytes payload length following 16-byte header)
    packet.writeUInt32LE(0x40, 0);
    // Packet type 0x3000
    packet.writeUInt32LE(0x3000, 4);
    packet.writeUInt32LE(0, 8);
    packet.writeUInt32LE(0, 12);
    // Username: 'bblp' null-padded 32 bytes (offset 16-47)
    packet.write('bblp', 16, 'ascii');
    // Password: access code null-padded 32 bytes (offset 48-79)
    packet.write(accessCode, 48, 'ascii');
    return packet;
  }

  /**
   * Connect to printer port 6000 over TLS
   */
  public async connect(): Promise<boolean> {
    if (this.socket && !this.socket.destroyed) {
      return true;
    }
    if (this.isConnecting) {
      return false;
    }

    this.isConnecting = true;
    this.cancelIdleTimer();

    return new Promise((resolve) => {
      try {
        const socket = tls.connect(
          {
            host: this.config.ip,
            port: 6000,
            rejectUnauthorized: false,
            timeout: 4000,
          },
          () => {
            this.isConnecting = false;
            this.socket = socket;
            const authPacket = BambuCameraSession.createAuthPacket(this.config.accessCode);
            socket.write(authPacket);
            resolve(true);
          }
        );

        socket.on('timeout', () => {
          console.warn(`[BambuCameraSession:${this.printerId}] TLS socket timeout on port 6000 (camera standby/idle)`);
          socket.destroy();
          this.cleanupSocket();
          resolve(false);
        });

        socket.on('data', (data: Buffer) => {
          this.handleIncomingData(data);
        });

        socket.on('error', (err: Error) => {
          console.warn(`[BambuCameraSession:${this.printerId}] TLS socket error:`, err.message);
          this.cleanupSocket();
          resolve(false);
        });

        socket.on('close', () => {
          this.cleanupSocket();
          resolve(false);
        });
      } catch (err) {
        this.isConnecting = false;
        console.error(`[BambuCameraSession:${this.printerId}] Connection exception:`, err);
        resolve(false);
      }
    });
  }

  private handleIncomingData(data: Buffer): void {
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, data]);

    while (this.incomingBuffer.length >= 16) {
      const payloadSize = this.incomingBuffer.readUInt32LE(0);

      // Sanity check payload size (< 5MB and > 0)
      if (payloadSize <= 0 || payloadSize > 5 * 1024 * 1024) {
        // Discard 1 byte and realign
        this.incomingBuffer = this.incomingBuffer.subarray(1);
        continue;
      }

      if (this.incomingBuffer.length < 16 + payloadSize) {
        // Wait for more data
        break;
      }

      const frame = this.incomingBuffer.subarray(16, 16 + payloadSize);
      this.incomingBuffer = this.incomingBuffer.subarray(16 + payloadSize);

      // Verify JPEG header: 0xFF, 0xD8
      if (frame.length > 2 && frame[0] === 0xff && frame[1] === 0xd8) {
        this.latestFrame = frame;
        this.broadcastFrame(frame);
      }
    }
  }

  private broadcastFrame(frame: Buffer): void {
    for (const res of this.clients) {
      if (res.writableEnded || res.destroyed) {
        this.clients.delete(res);
        continue;
      }
      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      } catch {
        this.clients.delete(res);
      }
    }

    if (this.clients.size === 0 && !this.idleTimeoutTimer) {
      this.scheduleIdleDisconnect();
    }
  }

  public addClient(res: http.ServerResponse): void {
    this.cancelIdleTimer();
    this.clients.add(res);

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'close',
    });

    if (this.latestFrame) {
      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.latestFrame.length}\r\n\r\n`);
        res.write(this.latestFrame);
        res.write('\r\n');
      } catch {
        this.clients.delete(res);
      }
    }

    res.on('close', () => {
      this.clients.delete(res);
      if (this.clients.size === 0) {
        this.scheduleIdleDisconnect();
      }
    });

    if (!this.socket || this.socket.destroyed) {
      void this.connect();
    }
  }

  public getSnapshot(): Buffer | null {
    if (!this.socket || this.socket.destroyed) {
      void this.connect();
    }
    return this.latestFrame;
  }

  private scheduleIdleDisconnect(): void {
    this.cancelIdleTimer();
    this.idleTimeoutTimer = setTimeout(() => {
      if (this.clients.size === 0) {
        this.cleanupSocket();
      }
    }, 15000); // 15 seconds grace period
  }

  private cancelIdleTimer(): void {
    if (this.idleTimeoutTimer) {
      clearTimeout(this.idleTimeoutTimer);
      this.idleTimeoutTimer = null;
    }
  }

  private cleanupSocket(): void {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        // Ignore
      }
      this.socket = null;
    }
    this.isConnecting = false;
    this.incomingBuffer = Buffer.alloc(0);
  }

  public dispose(): void {
    this.cancelIdleTimer();
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
    this.cleanupSocket();
  }
}

export class BambuCameraBridge {
  private static instance: BambuCameraBridge | null = null;
  private server: http.Server | null = null;
  private port: number = 0;
  private printers = new Map<string, BambuCameraConfig>();
  private sessions = new Map<string, BambuCameraSession>();

  private constructor() {}

  public static getInstance(): BambuCameraBridge {
    if (!BambuCameraBridge.instance) {
      BambuCameraBridge.instance = new BambuCameraBridge();
    }
    return BambuCameraBridge.instance;
  }

  public async start(): Promise<number> {
    if (this.server && this.port > 0) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          this.server = server;
          console.log(`[BambuCameraBridge] HTTP bridge listening on 127.0.0.1:${this.port}`);
          resolve(this.port);
        } else {
          reject(new Error('Failed to obtain bridge server port'));
        }
      });

      server.on('error', (err) => {
        console.error('[BambuCameraBridge] HTTP server error:', err);
      });
    });
  }

  public getPort(): number {
    return this.port;
  }

  public registerPrinter(printerId: string, config: BambuCameraConfig): void {
    this.printers.set(printerId, config);
  }

  public unregisterPrinter(printerId: string): void {
    this.printers.delete(printerId);
    const session = this.sessions.get(printerId);
    if (session) {
      session.dispose();
      this.sessions.delete(printerId);
    }
  }

  public async ensureSession(printerId: string): Promise<boolean> {
    const session = this.getOrCreateSession(printerId);
    if (!session) {
      return false;
    }
    return await session.connect();
  }

  /**
   * Get the latest decoded JPEG snapshot from the printer session
   */
  public getSnapshot(printerId: string): Buffer | null {
    const session = this.sessions.get(printerId) || this.getOrCreateSession(printerId);
    return session ? session.getSnapshot() : null;
  }

  private getOrCreateSession(printerId: string): BambuCameraSession | null {
    let session = this.sessions.get(printerId);
    if (session) {
      return session;
    }

    const config = this.printers.get(printerId);
    if (!config) {
      return null;
    }

    session = new BambuCameraSession(printerId, config);
    this.sessions.set(printerId, session);
    return session;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '';
    // Format: /bambu/:printerId/stream.mjpeg or /bambu/:printerId/snapshot.jpg
    const streamMatch = url.match(/^\/bambu\/([^/]+)\/stream\.mjpeg/);
    if (streamMatch) {
      const printerId = streamMatch[1];
      const session = this.getOrCreateSession(printerId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Printer camera session not found');
        return;
      }
      session.addClient(res);
      return;
    }

    const snapshotMatch = url.match(/^\/bambu\/([^/]+)\/snapshot\.jpg/);
    if (snapshotMatch) {
      const printerId = snapshotMatch[1];
      const session = this.getOrCreateSession(printerId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Printer camera session not found');
        return;
      }
      const snapshot = session.getSnapshot();
      if (!snapshot) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Snapshot unavailable yet');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': snapshot.length,
        'Cache-Control': 'no-cache',
      });
      res.end(snapshot);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  public async stop(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.printers.clear();

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
      this.port = 0;
    }
  }
}

export function getBambuCameraBridge(): BambuCameraBridge {
  return BambuCameraBridge.getInstance();
}

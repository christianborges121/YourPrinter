/**
 * @fileoverview Bambu Lab MQTT client for LAN-mode printer communication.
 *
 * Implements TLS MQTT connection to Bambu Lab printers (such as A1 mini)
 * on port 8883 using the 'bblp' username and the printer's LAN Access Code.
 * Handles pushall polling, partial report merging, and command publication.
 */

import { EventEmitter } from 'events';
import * as mqtt from 'mqtt';

export interface BambuMqttClientOptions {
  readonly ip: string;
  readonly serial: string;
  readonly accessCode: string;
}

export class BambuMqttClient extends EventEmitter {
  private readonly ip: string;
  private readonly serial: string;
  private readonly accessCode: string;
  private client: mqtt.MqttClient | null = null;
  private sequenceId = 1;
  private pushallInterval: NodeJS.Timeout | null = null;
  private state: Record<string, unknown> = {};
  private isJobAcknowledged = false;

  constructor(options: BambuMqttClientOptions) {
    super();
    this.ip = options.ip;
    this.serial = options.serial;
    this.accessCode = options.accessCode;
  }

  /**
   * Connect to printer's local MQTT broker over TLS on port 8883
   */
  public async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const brokerUrl = `mqtts://${this.ip}:8883`;
    const clientId = `ffui_${Math.random().toString(16).slice(2, 10)}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      try {
        this.client = mqtt.connect(brokerUrl, {
          username: 'bblp',
          password: this.accessCode,
          rejectUnauthorized: false,
          clientId,
          reconnectPeriod: 5000,
          connectTimeout: 10000,
        });

        this.client.on('connect', () => {
          const reportTopic = `device/${this.serial}/report`;
          this.client?.subscribe(reportTopic, (err) => {
            if (err) {
              console.error(`[BambuMqttClient] Failed to subscribe to ${reportTopic}:`, err);
            } else {
              console.log(`[BambuMqttClient] Subscribed to ${reportTopic}`);
              void this.pushall();
            }
          });

          // Periodic full status sync every 5 minutes
          if (this.pushallInterval) {
            clearInterval(this.pushallInterval);
          }
          this.pushallInterval = setInterval(() => {
            void this.pushall();
          }, 5 * 60 * 1000);

          this.emit('connected');
          if (!isResolved) {
            isResolved = true;
            resolve();
          }
        });

        this.client.on('message', (_topic: string, message: Buffer) => {
          try {
            const parsed = JSON.parse(message.toString('utf-8')) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object') {
              const printData = parsed.print as Record<string, unknown> | undefined;
              if (printData && typeof printData === 'object') {
                this.mergePrintData(printData);
                this.emit('status', this.state);
              }
            }
          } catch (err) {
            console.warn('[BambuMqttClient] Error parsing incoming MQTT message:', err);
          }
        });

        this.client.on('error', (err) => {
          console.error('[BambuMqttClient] MQTT error:', err);
          this.emit('error', err);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        });

        this.client.on('close', () => {
          this.emit('offline');
        });
      } catch (error) {
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      }
    });
  }

  /**
   * Deep-merge partial report data into local cache with AMS preservation
   */
  private mergePrintData(incoming: Record<string, unknown>): void {
    const rawGcodeState = incoming.gcode_state;
    if (typeof rawGcodeState === 'string' && (rawGcodeState === 'RUNNING' || rawGcodeState === 'PREPARE')) {
      this.isJobAcknowledged = false;
    }

    for (const [key, val] of Object.entries(incoming)) {
      if (key === 'ams') {
        this.mergeAmsData(val as Record<string, unknown>);
      } else if (key === 'vt_tray') {
        this.state.vt_tray = val;
      } else if (this.isJobAcknowledged && key === 'gcode_state' && val === 'FINISH') {
        // Suppress stale FINISH state if user has acknowledged the completed print
        this.state.gcode_state = 'IDLE';
      } else if (this.isJobAcknowledged && (key === 'subtask_name' || key === 'gcode_file' || key === 'mc_percent')) {
        // Suppress stale job telemetry after user dismissal
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        const existing = (this.state[key] ?? {}) as Record<string, unknown>;
        this.state[key] = { ...existing, ...(val as Record<string, unknown>) };
      } else {
        this.state[key] = val;
      }
    }
  }

  /**
   * Specialized merge for AMS structures to avoid wiping sibling slots on partial updates
   */
  private mergeAmsData(incomingAms: Record<string, unknown> | undefined): void {
    if (!incomingAms || typeof incomingAms !== 'object') {
      return;
    }

    const prevAms = (this.state.ams ?? {}) as Record<string, unknown>;
    const mergedAms: Record<string, unknown> = { ...prevAms };

    // Copy scalar AMS properties
    if (incomingAms.tray_now !== undefined) mergedAms.tray_now = incomingAms.tray_now;
    if (incomingAms.tray_exist_bits !== undefined) mergedAms.tray_exist_bits = incomingAms.tray_exist_bits;
    if (incomingAms.ams_exist_bits !== undefined) mergedAms.ams_exist_bits = incomingAms.ams_exist_bits;

    // Merge unit array by id
    const incomingUnits = Array.isArray(incomingAms.ams) ? incomingAms.ams : [];
    const prevUnits = Array.isArray(prevAms.ams) ? (prevAms.ams as Record<string, unknown>[]) : [];

    if (incomingUnits.length > 0) {
      const mergedUnits: Record<string, unknown>[] = [];

      for (const incUnit of incomingUnits as Record<string, unknown>[]) {
        const unitId = String(incUnit.id ?? '0');
        const prevUnit = prevUnits.find((u) => String(u.id ?? '0') === unitId) ?? {};
        const mergedUnit: Record<string, unknown> = { ...prevUnit, ...incUnit };

        // Merge tray array by id
        const incTrays = Array.isArray(incUnit.tray) ? (incUnit.tray as Record<string, unknown>[]) : [];
        const prevTrays = Array.isArray(prevUnit.tray) ? (prevUnit.tray as Record<string, unknown>[]) : [];

        if (incTrays.length > 0) {
          const trayMap = new Map<string, Record<string, unknown>>();
          for (const pt of prevTrays) {
            trayMap.set(String(pt.id ?? '0'), { ...pt });
          }
          for (const it of incTrays) {
            const tId = String(it.id ?? '0');
            // If incoming tray object has only 'id', it signifies an empty/cleared slot
            const isClearedSlot = Object.keys(it).length <= 1;
            if (isClearedSlot) {
              trayMap.set(tId, { id: tId });
            } else {
              const existingTray = trayMap.get(tId) ?? {};
              trayMap.set(tId, { ...existingTray, ...it });
            }
          }
          mergedUnit.tray = Array.from(trayMap.values());
        }

        mergedUnits.push(mergedUnit);
      }

      mergedAms.ams = mergedUnits;
    }

    this.state.ams = mergedAms;
  }

  /**
   * Publish command payload to printer's request topic
   */
  public async publish(payload: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error('MQTT client is not connected');
    }

    const topic = `device/${this.serial}/request`;
    const message = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      this.client?.publish(topic, message, { qos: 0 }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Request full state push from printer
   */
  public async pushall(): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      pushing: {
        sequence_id: seq,
        command: 'pushall',
      },
    });
  }

  /**
   * Request Bambu camera to start streaming (wakes camera sensor if idle)
   */
  public async startCameraStream(): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      pushing: {
        sequence_id: seq,
        command: 'start',
      },
    });
  }

  /**
   * Clear active print error / acknowledge completed print job on Bambu printer
   */
  public async cleanPrintError(): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      print: {
        sequence_id: seq,
        command: 'clean_print_error',
      },
    });
  }

  /**
   * Reset local job state to idle/ready and notify listeners
   */
  public clearJobStatus(): void {
    this.isJobAcknowledged = true;
    this.state.gcode_state = 'IDLE';
    this.state.subtask_name = '';
    this.state.gcode_file = '';
    this.state.mc_percent = 0;
    this.state.mc_remaining_time = 0;
    this.state.layer_num = 0;
    this.state.total_layer_num = 0;
    this.emit('status', this.state);
  }

  /**
   * Pause current active print job
   */
  public async pause(): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      print: {
        sequence_id: seq,
        command: 'pause',
      },
    });
  }

  /**
   * Resume paused print job
   */
  public async resume(): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      print: {
        sequence_id: seq,
        command: 'resume',
      },
    });
  }

  /**
   * Stop / cancel print job
   */
  public async stop(): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      print: {
        sequence_id: seq,
        command: 'stop',
      },
    });
  }

  /**
   * Execute raw G-code line (must end in newline)
   */
  public async gcode(line: string): Promise<void> {
    const seq = String(this.sequenceId++);
    const formatted = line.endsWith('\n') ? line : `${line}\n`;
    await this.publish({
      print: {
        sequence_id: seq,
        command: 'gcode_line',
        param: formatted,
      },
    });
  }

  /**
   * Control printer chamber light
   */
  public async setLight(enabled: boolean): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      system: {
        sequence_id: seq,
        command: 'ledctrl',
        led_node: 'chamber_light',
        led_mode: enabled ? 'on' : 'off',
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 0,
        interval_time: 0,
      },
    });
  }

  /**
   * Start a print job from an uploaded .3mf or .gcode file
   */
  public async startProjectFile(
    fileName: string,
    opts?: { useAms?: boolean; amsMapping?: number[]; bedLeveling?: boolean }
  ): Promise<void> {
    const seq = String(this.sequenceId++);
    const cleanFileName = fileName.startsWith('/') ? fileName.slice(1) : fileName;
    const useAms = opts?.useAms ?? false;
    const amsMapping = opts?.amsMapping ?? [0];
    const bedLeveling = opts?.bedLeveling ?? true;

    const printPayload: Record<string, unknown> = {
      sequence_id: seq,
      command: 'project_file',
      param: 'Metadata/plate_1.gcode',
      url: `ftp:///${cleanFileName}`,
      subtask_name: cleanFileName,
      use_ams: useAms,
      timelapse: false,
      bed_leveling: bedLeveling,
      flow_cali: false,
      vibration_cali: true,
      layer_inspect: false,
      md5: '',
    };

    if (useAms && Array.isArray(amsMapping)) {
      printPayload.ams_mapping = amsMapping;
    }

    await this.publish({
      print: printPayload,
    });
  }

  /**
   * Load or unload filament using AMS Lite (target 255 unloads)
   */
  public async ams(target: number, temp = 220): Promise<void> {
    const seq = String(this.sequenceId++);
    await this.publish({
      print: {
        sequence_id: seq,
        command: 'ams_change_filament',
        target,
        curr_temp: temp,
        tar_temp: temp,
      },
    });
  }

  /**
   * Return current cached printer state
   */
  public getState(): Record<string, unknown> {
    return { ...this.state };
  }

  /**
   * Disconnect MQTT client and clear intervals
   */
  public async disconnect(): Promise<void> {
    if (this.pushallInterval) {
      clearInterval(this.pushallInterval);
      this.pushallInterval = null;
    }

    if (this.client) {
      try {
        await this.client.endAsync();
      } catch (err) {
        console.warn('[BambuMqttClient] Error during MQTT client disconnect:', err);
      } finally {
        this.client = null;
      }
    }
  }
}

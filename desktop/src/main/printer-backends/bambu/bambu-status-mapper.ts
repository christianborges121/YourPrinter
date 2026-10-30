/**
 * @fileoverview Status mapping functions between Bambu Lab MQTT telemetry and WebUI PrinterStatus.
 *
 * Converts raw Bambu JSON print reports into the application's unified StatusResult
 * interface used by all printer backends and dashboard UI widgets.
 */

import type { StatusResult } from '@shared/types/printer-backend/index.js';

export interface BambuStatusSnapshot {
  readonly printerState: string;
  readonly nozzleTemperature: number;
  readonly nozzleTargetTemperature: number;
  readonly bedTemperature: number;
  readonly bedTargetTemperature: number;
  readonly progress: number;
  readonly currentJob?: string;
  readonly remainingTime?: number;
  readonly currentLayer?: number;
  readonly totalLayers?: number;
  readonly toolTemps: number[];
  readonly toolTargetTemps: number[];
  readonly bedTargetTemp: number;
  readonly isLightOn: boolean;
}

/**
 * Map Bambu gcode_state string to WebUI standardized printerState
 */
export function mapBambuGCodeState(gcodeState?: unknown): string {
  if (typeof gcodeState !== 'string') {
    return 'Ready';
  }

  switch (gcodeState.toUpperCase()) {
    case 'IDLE':
      return 'Ready';
    case 'PREPARE':
      return 'Busy';
    case 'RUNNING':
      return 'Printing';
    case 'PAUSE':
      return 'Paused';
    case 'FINISH':
      return 'Completed';
    case 'FAILED':
      return 'Error';
    default:
      return gcodeState.charAt(0).toUpperCase() + gcodeState.slice(1).toLowerCase();
  }
}

/**
 * Safely parse numeric telemetry value with fallback
 */
function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && !Number.isNaN(val)) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Map raw Bambu Lab MQTT state object into unified StatusResult
 */
export function mapBambuStateToPrinterStatus(state: Record<string, unknown> | null | undefined): StatusResult {
  try {
    const s = state ?? {};

    const rawGCodeState = s.gcode_state;
    const printerState = mapBambuGCodeState(rawGCodeState);

    const nozzleTemp = safeNumber(s.nozzle_temper, 0);
    const nozzleTarget = safeNumber(s.nozzle_target_temper, 0);
    const bedTemp = safeNumber(s.bed_temper, 0);
    const bedTarget = safeNumber(s.bed_target_temper, 0);

    const isCompleted = printerState.toLowerCase() === 'completed';
    let progress = isCompleted ? 100 : safeNumber(s.mc_percent, 0);

    // Remaining time in seconds (Bambu provides mc_remaining_time in minutes)
    const remainingMinutes = s.mc_remaining_time !== undefined ? safeNumber(s.mc_remaining_time, 0) : undefined;
    const remainingTime = remainingMinutes !== undefined && remainingMinutes >= 0 ? remainingMinutes * 60 : undefined;

    const currentLayer = s.layer_num !== undefined ? safeNumber(s.layer_num, 0) : undefined;
    const totalLayers = s.total_layer_num !== undefined ? safeNumber(s.total_layer_num, 0) : undefined;

    // Guard against stale 100% progress carried over from previous completed job
    if (
      !isCompleted &&
      progress >= 90 &&
      totalLayers !== undefined &&
      totalLayers > 1 &&
      currentLayer !== undefined &&
      currentLayer < totalLayers * 0.5
    ) {
      progress = currentLayer > 0 ? Math.round((currentLayer / totalLayers) * 100) : 0;
    }

    const currentJob = (s.subtask_name as string) || (s.gcode_file as string) || undefined;

    // Detect chamber light mode
    let isLightOn = false;
    if (Array.isArray(s.lights_report)) {
      const chamberLight = s.lights_report.find(
        (l) => l && typeof l === 'object' && (l as { node?: string }).node === 'chamber_light'
      ) as { mode?: string } | undefined;
      isLightOn = chamberLight?.mode === 'on';
    }

    const statusObject = {
      printerState,
      nozzleTemperature: nozzleTemp,
      nozzleTargetTemperature: nozzleTarget,
      bedTemperature: bedTemp,
      bedTargetTemperature: bedTarget,
      progress,
      currentJob,
      remainingTime,
      currentLayer: currentLayer !== undefined && currentLayer > 0 ? currentLayer : undefined,
      totalLayers: totalLayers !== undefined && totalLayers > 0 ? totalLayers : undefined,
      toolTemps: [nozzleTemp],
      toolTargetTemps: [nozzleTarget],
      bedTargetTemp: bedTarget,
      isLightOn,
    };

    return {
      success: true,
      status: statusObject,
      timestamp: new Date(),
    };
  } catch (error) {
    console.warn('[bambu-status-mapper] Error mapping state to printer status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      status: {
        printerState: 'Ready',
        nozzleTemperature: 0,
        nozzleTargetTemperature: 0,
        bedTemperature: 0,
        bedTargetTemperature: 0,
        progress: 0,
        toolTemps: [0],
        toolTargetTemps: [0],
        bedTargetTemp: 0,
      },
      timestamp: new Date(),
    };
  }
}

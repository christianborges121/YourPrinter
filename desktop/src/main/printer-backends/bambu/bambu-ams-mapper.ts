/**
 * @fileoverview AMS Lite telemetry mapper for Bambu Lab A1 mini.
 *
 * Maps Bambu AMS telemetry reports into the unified MaterialStationStatus
 * interface used by the WebUI Material Station component.
 */

import type { MaterialSlotInfo, MaterialStationStatus } from '@shared/types/printer-backend/index.js';

/**
 * Format RRGGBBAA hex color into standard #RRGGBB hex color string
 */
export function formatBambuColorHex(rawColor?: unknown): string | null {
  if (typeof rawColor !== 'string' || rawColor.length < 6) {
    return null;
  }
  const clean = rawColor.startsWith('#') ? rawColor.slice(1) : rawColor;
  return `#${clean.slice(0, 6).toUpperCase()}`;
}

/**
 * Map Bambu Lab AMS telemetry structure into standard MaterialStationStatus
 */
export function mapBambuAms(state: Record<string, unknown> | null | undefined): MaterialStationStatus | null {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const amsObj = state.ams as Record<string, unknown> | undefined;
  if (!amsObj || typeof amsObj !== 'object') {
    return null;
  }

  const amsUnits = Array.isArray(amsObj.ams) ? (amsObj.ams as Record<string, unknown>[]) : [];
  if (amsUnits.length === 0) {
    return null;
  }

  const primaryUnit = amsUnits[0];
  if (!primaryUnit) {
    return null;
  }

  const rawTrays = Array.isArray(primaryUnit.tray) ? (primaryUnit.tray as Record<string, unknown>[]) : [];

  // A1 mini AMS Lite has 4 slots (0..3)
  const slots: MaterialSlotInfo[] = [];

  for (let slotId = 0; slotId < 4; slotId++) {
    const tray = rawTrays.find((t) => Number(t.id) === slotId);

    const rawType = tray?.tray_type as string | undefined;
    const rawColor = tray?.tray_color as string | undefined;

    const isEmpty = !tray || !rawType || rawType.trim() === '';
    const materialType = isEmpty ? null : rawType.trim();
    const materialColor = isEmpty ? null : formatBambuColorHex(rawColor);

    slots.push({
      slotId: slotId + 1,
      isEmpty,
      materialType,
      materialColor,
    });
  }

  // Active slot determination: tray_now = '0'..'3' corresponds to AMS slots
  let activeSlot: number | null = null;
  if (amsObj.tray_now !== undefined) {
    const rawActive = Number(amsObj.tray_now);
    if (!Number.isNaN(rawActive) && rawActive >= 0 && rawActive < 4) {
      activeSlot = rawActive + 1;
    }
  }

  return {
    connected: true,
    slots,
    activeSlot,
    overallStatus: 'ready',
    errorMessage: null,
  };
}

/**
 * Get remaining percentage for a given AMS slot (null if unknown / non-RFID)
 */
export function getAmsRemainPercent(state: Record<string, unknown> | null | undefined, slotId: number): number | null {
  if (!state) return null;
  const amsObj = state.ams as Record<string, unknown> | undefined;
  const amsUnits = Array.isArray(amsObj?.ams) ? (amsObj?.ams as Record<string, unknown>[]) : [];
  const primaryUnit = amsUnits[0];
  const rawTrays = Array.isArray(primaryUnit?.tray) ? (primaryUnit?.tray as Record<string, unknown>[]) : [];
  const tray = rawTrays.find((t) => Number(t.id) === slotId);

  if (tray?.remain !== undefined) {
    const remain = Number(tray.remain);
    if (!Number.isNaN(remain) && remain >= 0) {
      return remain;
    }
  }
  return null;
}

/**
 * Check if the external spool holder (vt_tray) is loaded with filament
 */
export function hasExternalSpool(state: Record<string, unknown> | null | undefined): boolean {
  if (!state) return false;
  const vtTray = state.vt_tray as Record<string, unknown> | undefined;
  const trayType = vtTray?.tray_type as string | undefined;
  return Boolean(trayType && trayType.trim() !== '');
}

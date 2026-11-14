/**
 * @fileoverview Utilities for normalizing printer fault codes, human-readable error descriptions,
 * and boolean chamber light state across FlashForge and Bambu Lab telemetry payloads.
 */

const FLASHFORGE_ERROR_MESSAGES: Record<string, string> = {
  E0001: 'Printer out of range — please home axes',
  E0002: 'MCU communication lost — restart printer',
  E0003: 'TMC stepper driver fault (GSTAT error)',
  E0004: 'TMC stepper chip communication error',
  E0005: 'MCU unable to connect',
  E0006: 'Nozzle temperature below minimum threshold',
  E0007: 'Extruder not heating as expected',
  E0008: 'Extruder thermal runaway or heating timeout',
  E0009: 'Heated bed not heating as expected',
  E0011: 'Host controller error — please restart printer',
  E0012: 'X-axis homing error / sensor not triggered',
  E0013: 'Y-axis homing error / sensor not triggered',
  E0014: 'Z-axis homing error / sensor not triggered',
  E0015: 'Extruder temperature error (< -10°C) — check hotend seating/thermistor',
  E0016: 'Platform bed temperature error (< -10°C) — check bed thermistor',
  E0017: 'Move queue overflow',
  E0018: 'Language initialization failed',
  E0019: 'USB flash drive read error',
  E0020: 'Camera service failure',
  E0021: 'Cannot open camera',
  E0022: 'Insufficient internal storage space',
};

const EMPTY_ERROR_VALUES = new Set(['', '0', '0x0', 'none', 'null', 'undefined', 'ok', 'n/a']);

export interface PrinterErrorInfo {
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/**
 * Parse a single LED/light telemetry field into a strict boolean when explicitly present.
 */
export function parseLedStateValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'open' || normalized === 'on' || normalized === 'true' || normalized === '1') {
      return true;
    }
    if (
      normalized === 'close' ||
      normalized === 'closed' ||
      normalized === 'off' ||
      normalized === 'false' ||
      normalized === '0'
    ) {
      return false;
    }
  }
  return undefined;
}

const LED_STATE_KEYS = [
  'ledState',
  'isLightOn',
  'led',
  'Lights',
  'lights',
  'LightStatus',
  'lightStatus',
] as const;

/**
 * Extract boolean chamber light state from one or more candidate telemetry objects.
 */
export function extractLedStateFromRecords(...sources: unknown[]): boolean | undefined {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    const obj = source as Record<string, unknown>;
    for (const key of LED_STATE_KEYS) {
      if (key in obj) {
        const parsed = parseLedStateValue(obj[key]);
        if (parsed !== undefined) {
          return parsed;
        }
      }
    }
  }
  return undefined;
}

/**
 * Extract normalized errorCode and errorMessage from one or more telemetry objects.
 */
export function extractErrorInfoFromRecords(...sources: unknown[]): PrinterErrorInfo {
  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    const obj = source as Record<string, unknown>;
    if (!errorCode && typeof obj.errorCode === 'string' && obj.errorCode.trim().length > 0) {
      errorCode = obj.errorCode.trim();
    }
    if (!errorMessage && typeof obj.errorMessage === 'string' && obj.errorMessage.trim().length > 0) {
      errorMessage = obj.errorMessage.trim();
    }
  }

  return {
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

/**
 * Normalize a FlashForge error code string (e.g. "E0014") and ignore sentinel zero/empty values.
 */
export function normalizeErrorCode(rawCode: unknown): string | undefined {
  if (rawCode === null || rawCode === undefined) {
    return undefined;
  }
  const str = String(rawCode).trim();
  if (EMPTY_ERROR_VALUES.has(str.toLowerCase()) || /^e0+$/i.test(str)) {
    return undefined;
  }
  return /^e\d+$/i.test(str) ? str.toUpperCase() : str;
}

/**
 * Resolve a FlashForge error code and human-readable message from raw /detail or machineInfo fields.
 */
export function resolveFlashForgeError(rawCode: unknown, rawMessage?: unknown): PrinterErrorInfo {
  const errorCode = normalizeErrorCode(rawCode);
  const cleanedMessage = typeof rawMessage === 'string' && rawMessage.trim().length > 0 ? rawMessage.trim() : undefined;

  if (!errorCode && !cleanedMessage) {
    return {};
  }

  const mappedMessage = errorCode ? FLASHFORGE_ERROR_MESSAGES[errorCode] : undefined;
  return {
    ...(errorCode ? { errorCode } : {}),
    errorMessage: cleanedMessage || mappedMessage || (errorCode ? `Printer reported error ${errorCode}` : undefined),
  };
}

/**
 * Format Bambu Lab 16-bit/32-bit HMS attr/code pair into canonical XXXX-XXXX-XXXX-XXXX identifier.
 */
function formatBambuHmsId(attr: number, code: number): string {
  const highAttr = ((attr >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const lowAttr = (attr & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const highCode = ((code >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const lowCode = (code & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `${highAttr}-${lowAttr}-${highCode}-${lowCode}`;
}

/**
 * Extract Bambu Lab print_error / hms / fail_reason into normalized errorCode + errorMessage fields.
 */
export function formatBambuError(printError: unknown, hmsList?: unknown, failReason?: unknown): PrinterErrorInfo {
  const rawFailReason = typeof failReason === 'string' && failReason.trim().length > 0 ? failReason.trim() : undefined;

  let hmsCode: string | undefined;
  if (Array.isArray(hmsList) && hmsList.length > 0) {
    const first = hmsList[0] as { attr?: unknown; code?: unknown } | null;
    if (first && typeof first.attr === 'number' && typeof first.code === 'number') {
      hmsCode = `HMS_${formatBambuHmsId(first.attr, first.code)}`;
    }
  }

  let printErrCode: string | undefined;
  if (typeof printError === 'number' && printError !== 0 && !Number.isNaN(printError)) {
    printErrCode = `0x${(printError >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  } else if (typeof printError === 'string') {
    const trimmed = printError.trim();
    if (!EMPTY_ERROR_VALUES.has(trimmed.toLowerCase())) {
      printErrCode = trimmed;
    }
  }

  const errorCode = hmsCode || printErrCode;
  if (!errorCode && !rawFailReason) {
    return {};
  }

  const errorMessage =
    rawFailReason ||
    (hmsCode && printErrCode
      ? `Bambu HMS fault ${hmsCode} (print_error ${printErrCode})`
      : hmsCode
      ? `Bambu HMS fault ${hmsCode}`
      : `Bambu print error ${printErrCode}`);

  return {
    ...(errorCode ? { errorCode } : {}),
    errorMessage,
  };
}

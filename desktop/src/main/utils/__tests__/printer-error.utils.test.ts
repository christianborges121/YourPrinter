/**
 * @fileoverview Unit tests for printer error normalization and LED state extraction utilities.
 */

import {
  extractLedStateFromRecords,
  formatBambuError,
  normalizeErrorCode,
  parseLedStateValue,
  resolveFlashForgeError,
} from '../printer-error.utils.js';

describe('printer-error.utils', () => {
  describe('parseLedStateValue & extractLedStateFromRecords', () => {
    it('returns strict booleans for FlashForge lightStatus open/close and booleans', () => {
      expect(parseLedStateValue('open')).toBe(true);
      expect(parseLedStateValue('on')).toBe(true);
      expect(parseLedStateValue('close')).toBe(false);
      expect(parseLedStateValue('off')).toBe(false);
      expect(parseLedStateValue(false)).toBe(false);
      expect(parseLedStateValue(true)).toBe(true);
      expect(parseLedStateValue(0)).toBe(false);
      expect(parseLedStateValue(1)).toBe(true);
    });

    it('never drops false to undefined across record fallback chain', () => {
      expect(extractLedStateFromRecords({ lightStatus: 'close' })).toBe(false);
      expect(extractLedStateFromRecords({ lightStatus: 'open' })).toBe(true);
      expect(extractLedStateFromRecords({ isLightOn: false })).toBe(false);
      expect(extractLedStateFromRecords({ Lights: false }, { lightStatus: 'open' })).toBe(false);
      expect(extractLedStateFromRecords({}, { LightStatus: 'open' })).toBe(true);
      expect(extractLedStateFromRecords({}, {})).toBeUndefined();
    });
  });

  describe('normalizeErrorCode & resolveFlashForgeError', () => {
    it('resolves known FlashForge error codes like E0014', () => {
      expect(resolveFlashForgeError('e0014')).toEqual({
        errorCode: 'E0014',
        errorMessage: 'Z-axis homing error / sensor not triggered',
      });
    });

    it('preserves explicit firmware error messages when supplied', () => {
      expect(resolveFlashForgeError('E0099', 'Custom nozzle fault')).toEqual({
        errorCode: 'E0099',
        errorMessage: 'Custom nozzle fault',
      });
    });

    it('ignores empty or sentinel zero error codes', () => {
      expect(normalizeErrorCode('')).toBeUndefined();
      expect(normalizeErrorCode('0')).toBeUndefined();
      expect(normalizeErrorCode('E0000')).toBeUndefined();
      expect(resolveFlashForgeError('')).toEqual({});
    });
  });

  describe('formatBambuError', () => {
    it('formats HMS attr/code pairs into canonical Bambu HMS strings', () => {
      expect(formatBambuError(0, [{ attr: 0x07000100, code: 0x00020001 }])).toEqual({
        errorCode: 'HMS_0700-0100-0002-0001',
        errorMessage: 'Bambu HMS fault HMS_0700-0100-0002-0001',
      });
    });

    it('formats non-zero numeric print_error codes into hex', () => {
      expect(formatBambuError(0x05008010)).toEqual({
        errorCode: '0x05008010',
        errorMessage: 'Bambu print error 0x05008010',
      });
    });

    it('returns empty object when no Bambu error is active', () => {
      expect(formatBambuError(0, [])).toEqual({});
    });
  });
});

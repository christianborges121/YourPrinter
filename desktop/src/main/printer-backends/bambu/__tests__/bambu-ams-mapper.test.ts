/**
 * @fileoverview Unit tests for Bambu AMS Lite mapper.
 *
 * Verifies mapping of 4-slot AMS Lite telemetry, color hex conversions,
 * slot ordering, active slot detection, and empty slot handling.
 */

import { formatBambuColorHex, getAmsRemainPercent, hasExternalSpool, mapBambuAms } from '../bambu-ams-mapper.js';

describe('bambu-ams-mapper', () => {
  it('returns null when no AMS data is present', () => {
    expect(mapBambuAms(null)).toBeNull();
    expect(mapBambuAms({})).toBeNull();
    expect(mapBambuAms({ ams: {} })).toBeNull();
    expect(mapBambuAms({ ams: { ams: [] } })).toBeNull();
  });

  it('maps a full 4-slot AMS Lite report with ordered slots and hex colors', () => {
    const sample = {
      ams: {
        ams: [
          {
            id: '0',
            tray: [
              { id: '0', tray_type: 'PLA', tray_color: 'FF6A13FF', remain: 85 },
              { id: '1' }, // empty
              { id: '2', tray_type: 'PETG', tray_color: '00FF00FF', remain: 40 },
              { id: '3', tray_type: 'TPU', tray_color: 'FFFFFF80', remain: -1 },
            ],
          },
        ],
        tray_now: '2',
      },
      vt_tray: { tray_type: 'PLA' },
    };

    const res = mapBambuAms(sample);
    expect(res).not.toBeNull();
    expect(res?.connected).toBe(true);
    expect(res?.activeSlot).toBe(3);
    expect(res?.slots).toHaveLength(4);

    expect(res?.slots[0]).toEqual({
      slotId: 1,
      isEmpty: false,
      materialType: 'PLA',
      materialColor: '#FF6A13',
    });

    expect(res?.slots[1]).toEqual({
      slotId: 2,
      isEmpty: true,
      materialType: null,
      materialColor: null,
    });

    expect(res?.slots[2]).toEqual({
      slotId: 3,
      isEmpty: false,
      materialType: 'PETG',
      materialColor: '#00FF00',
    });

    expect(res?.slots[3]).toEqual({
      slotId: 4,
      isEmpty: false,
      materialType: 'TPU',
      materialColor: '#FFFFFF',
    });

    expect(getAmsRemainPercent(sample, 1)).toBe(85);
    expect(getAmsRemainPercent(sample, 4)).toBeNull();
    expect(hasExternalSpool(sample)).toBe(true);
  });

  it('formats color hex accurately', () => {
    expect(formatBambuColorHex('FF0000FF')).toBe('#FF0000');
    expect(formatBambuColorHex('#00FF00FF')).toBe('#00FF00');
    expect(formatBambuColorHex(null)).toBeNull();
    expect(formatBambuColorHex('')).toBeNull();
  });
});

/**
 * @fileoverview Unit tests for Bambu status mapper.
 *
 * Verifies mapping of Bambu MQTT telemetry states, temperatures,
 * print progress, and defensive handling of missing/empty payloads.
 */

import { mapBambuGCodeState, mapBambuStateToPrinterStatus } from '../bambu-status-mapper.js';

describe('bambu-status-mapper', () => {
  describe('mapBambuGCodeState', () => {
    it('maps IDLE to Ready', () => {
      expect(mapBambuGCodeState('IDLE')).toBe('Ready');
      expect(mapBambuGCodeState('idle')).toBe('Ready');
    });

    it('maps PREPARE to Busy', () => {
      expect(mapBambuGCodeState('PREPARE')).toBe('Busy');
    });

    it('maps RUNNING to Printing', () => {
      expect(mapBambuGCodeState('RUNNING')).toBe('Printing');
    });

    it('maps PAUSE to Paused', () => {
      expect(mapBambuGCodeState('PAUSE')).toBe('Paused');
    });

    it('maps FINISH to Completed', () => {
      expect(mapBambuGCodeState('FINISH')).toBe('Completed');
    });

    it('maps FAILED to Error', () => {
      expect(mapBambuGCodeState('FAILED')).toBe('Error');
    });

    it('handles null or unknown states safely', () => {
      expect(mapBambuGCodeState(null)).toBe('Ready');
      expect(mapBambuGCodeState(undefined)).toBe('Ready');
      expect(mapBambuGCodeState('CALIBRATING')).toBe('Calibrating');
    });
  });

  describe('mapBambuStateToPrinterStatus', () => {
    it('handles empty or null state without throwing', () => {
      const res = mapBambuStateToPrinterStatus({});
      expect(res.success).toBe(true);
      expect(res.status.printerState).toBe('Ready');
      expect(res.status.nozzleTemperature).toBe(0);
      expect(res.status.bedTemperature).toBe(0);
      expect(res.status.progress).toBe(0);
    });

    it('maps typical active printing telemetry correctly', () => {
      const sample = {
        gcode_state: 'RUNNING',
        nozzle_temper: 215.4,
        nozzle_target_temper: 220,
        bed_temper: 60.1,
        bed_target_temper: 60,
        mc_percent: 45,
        mc_remaining_time: 25,
        layer_num: 88,
        total_layer_num: 200,
        subtask_name: 'benchy.3mf',
        lights_report: [{ node: 'chamber_light', mode: 'on' }],
      };

      const res = mapBambuStateToPrinterStatus(sample);
      expect(res.success).toBe(true);
      expect(res.status.printerState).toBe('Printing');
      expect(res.status.nozzleTemperature).toBe(215.4);
      expect(res.status.nozzleTargetTemperature).toBe(220);
      expect(res.status.bedTemperature).toBe(60.1);
      expect(res.status.bedTargetTemperature).toBe(60);
      expect(res.status.progress).toBe(45);
      expect(res.status.remainingTime).toBe(25 * 60);
      expect(res.status.currentLayer).toBe(88);
      expect(res.status.totalLayers).toBe(200);
      expect(res.status.currentJob).toBe('benchy.3mf');
      expect((res.status as any).isLightOn).toBe(true);
      expect(res.status.toolTemps).toEqual([215.4]);
      expect(res.status.toolTargetTemps).toEqual([220]);
    });

    it('sets progress to 100 when gcode_state is FINISH (Completed)', () => {
      const sample = {
        gcode_state: 'FINISH',
        mc_percent: 0,
        subtask_name: 'test.gcode',
      };
      const res = mapBambuStateToPrinterStatus(sample);
      expect(res.success).toBe(true);
      expect(res.status.printerState).toBe('Completed');
      expect(res.status.progress).toBe(100);
    });
  });
});

/**
 * @fileoverview Abstract base adapter for FlashForge ecosystem printers.
 *
 * Implements common FlashForge family logic and network capability foundations.
 * Specific models (Adventurer 5M, 5M Pro, AD5X, Creator 5 Pro) extend this class
 * and provide model-specific overrides (e.g. heated chamber, 4 toolheads, filtration).
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import type { PrinterAdapter } from '../PrinterAdapter.js';

export abstract class FlashForgeAdapter implements PrinterAdapter {
  public abstract readonly definition: PrinterModelDefinition;
  public abstract readonly networkCapabilities: PrinterNetworkCapabilities;

  public abstract canHandle(typeName: string, hints?: { ipAddress?: string; rawData?: unknown }): boolean;
  public abstract createBackend(options: BackendInitOptions): BasePrinterBackend;

  /**
   * Helper to construct baseline FlashForge network capabilities with model overrides.
   */
  protected static createFlashForgeCapabilities(overrides: Partial<PrinterNetworkCapabilities> = {}): PrinterNetworkCapabilities {
    return {
      canJog: true,
      canHome: true,
      canBedLevel: true,
      supportedAxes: ['X', 'Y', 'Z'],
      hasBedHeater: true,
      hasExtruderHeater: true,
      hasChamberHeater: false,
      nozzleCount: 1,
      maxBedTemp: 110,
      maxExtruderTemp: 280,
      hasPartCoolingFan: true,
      hasChamberFan: false,
      hasAuxFan: false,
      hasFiltration: false,
      hasLedControl: true,
      canAdjustSpeed: true,
      canAdjustZOffset: true,
      hasCamera: true,
      hasMaterialStation: false,
      canPause: true,
      canResume: true,
      canCancel: true,
      ...overrides,
    };
  }
}

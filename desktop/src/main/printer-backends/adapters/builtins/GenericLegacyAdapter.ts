/**
 * @fileoverview Fallback adapter definition for legacy or generic FlashForge printers.
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import { GenericLegacyBackend } from '../../GenericLegacyBackend.js';
import { FlashForgeAdapter } from './base/FlashForgeAdapter.js';

export class GenericLegacyAdapter extends FlashForgeAdapter {
  public readonly networkCapabilities: PrinterNetworkCapabilities = FlashForgeAdapter.createFlashForgeCapabilities({
    canJog: true,
    canHome: true,
    canBedLevel: false,
    hasBedHeater: true,
    maxBedTemp: 100,
    hasExtruderHeater: true,
    maxExtruderTemp: 260,
    hasChamberHeater: false,
    nozzleCount: 1,
    hasPartCoolingFan: true,
    hasChamberFan: false,
    hasFiltration: false,
    hasLedControl: false,
    hasCamera: false,
    hasMaterialStation: false,
  });

  public readonly definition: PrinterModelDefinition = {
    id: 'generic-legacy',
    displayName: 'Legacy Printer',
    vendor: 'Generic',
    family: 'flashforge-legacy',
    defaultPort: 8899,
    requiresCheckCode: false,
    requiresSerialNumber: false,
    supportsDualAPI: false,
    customCameraSupported: true,
    canOverrideLeds: false,
    networkCapabilities: this.networkCapabilities,
  };

  public canHandle(_typeName: string): boolean {
    // Fallback: handles any otherwise unmatched legacy model
    return true;
  }

  public createBackend(options: BackendInitOptions): BasePrinterBackend {
    return new GenericLegacyBackend(options);
  }
}

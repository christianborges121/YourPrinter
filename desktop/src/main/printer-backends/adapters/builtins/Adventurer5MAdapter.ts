/**
 * @fileoverview Adapter definition for FlashForge Adventurer 5M printers.
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import { Adventurer5MBackend } from '../../Adventurer5MBackend.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import { FlashForgeAdapter } from './base/FlashForgeAdapter.js';

export class Adventurer5MAdapter extends FlashForgeAdapter {
  public readonly networkCapabilities: PrinterNetworkCapabilities = FlashForgeAdapter.createFlashForgeCapabilities({
    canJog: true,
    canHome: true,
    canBedLevel: true,
    hasBedHeater: true,
    maxBedTemp: 110,
    hasExtruderHeater: true,
    maxExtruderTemp: 280,
    hasChamberHeater: false,
    nozzleCount: 1,
    hasPartCoolingFan: true,
    hasChamberFan: false,
    hasFiltration: false,
    hasLedControl: false, // Requires custom LED mod
    hasCamera: false, // Requires custom USB camera
    hasMaterialStation: false,
  });

  public readonly definition: PrinterModelDefinition = {
    id: 'adventurer-5m',
    displayName: 'FlashForge Adventurer 5M',
    vendor: 'FlashForge',
    family: 'flashforge-5m',
    defaultPort: 8899,
    requiresCheckCode: true,
    checkCodeLabel: 'Check Code',
    checkCodePlaceholder: 'e.g. 123456',
    checkCodeHint: 'Found on printer touchscreen under Settings > About',
    requiresSerialNumber: false,
    supportsDualAPI: true,
    customCameraSupported: true,
    canOverrideLeds: true,
    networkCapabilities: this.networkCapabilities,
  };

  public canHandle(typeName: string): boolean {
    if (!typeName) return false;
    const lower = typeName.toLowerCase();
    return lower.includes('5m') && !lower.includes('5m pro') && !lower.includes('5mpro');
  }

  public createBackend(options: BackendInitOptions): BasePrinterBackend {
    return new Adventurer5MBackend(options);
  }
}

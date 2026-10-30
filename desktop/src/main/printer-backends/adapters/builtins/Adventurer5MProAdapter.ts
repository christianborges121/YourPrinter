/**
 * @fileoverview Adapter definition for FlashForge Adventurer 5M Pro printers.
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import { Adventurer5MProBackend } from '../../Adventurer5MProBackend.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import { FlashForgeAdapter } from './base/FlashForgeAdapter.js';

export class Adventurer5MProAdapter extends FlashForgeAdapter {
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
    hasChamberFan: true,
    hasFiltration: true, // Internal & external filtration equipped
    hasLedControl: true, // Factory built-in chamber LEDs
    hasCamera: true, // Built-in OEM camera
    hasMaterialStation: false,
  });

  public readonly definition: PrinterModelDefinition = {
    id: 'adventurer-5m-pro',
    displayName: 'FlashForge Adventurer 5M Pro',
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
    return lower.includes('5m pro') || lower.includes('5mpro');
  }

  public createBackend(options: BackendInitOptions): BasePrinterBackend {
    return new Adventurer5MProBackend(options);
  }
}

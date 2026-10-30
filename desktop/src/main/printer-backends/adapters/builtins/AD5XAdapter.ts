/**
 * @fileoverview Adapter definition for FlashForge AD5X printers with Intelligent Filament Station (IFS).
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import { AD5XBackend } from '../../AD5XBackend.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import { FlashForgeAdapter } from './base/FlashForgeAdapter.js';

export class AD5XAdapter extends FlashForgeAdapter {
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
    hasCamera: true,
    hasMaterialStation: true, // 4-slot IFS
    maxMaterialSlots: 4,
  });

  public readonly definition: PrinterModelDefinition = {
    id: 'ad5x',
    displayName: 'FlashForge AD5X',
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
    return lower.includes('ad5x') || lower.includes('ad-5x');
  }

  public createBackend(options: BackendInitOptions): BasePrinterBackend {
    return new AD5XBackend(options);
  }
}

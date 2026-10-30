/**
 * @fileoverview Dedicated adapter definition for FlashForge Creator 5 / Creator 5 Pro.
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import { AD5XBackend } from '../../AD5XBackend.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import { FlashForgeAdapter } from './base/FlashForgeAdapter.js';

export class Creator5ProAdapter extends FlashForgeAdapter {
  public readonly networkCapabilities: PrinterNetworkCapabilities = FlashForgeAdapter.createFlashForgeCapabilities({
    canJog: false, // HTTP-only OrcaServer; port 8899 TCP closed on C5P
    canHome: false,
    canBedLevel: false,
    hasBedHeater: true,
    maxBedTemp: 120,
    hasExtruderHeater: true,
    maxExtruderTemp: 350,
    hasChamberHeater: true,
    maxChamberTemp: 80,
    nozzleCount: 4,
    hasPartCoolingFan: true,
    hasChamberFan: true,
    hasFiltration: false, // Default to false; dynamically enabled if /product reports internalFanCtrlState or externalFanCtrlState != 0
    hasLedControl: true, // Native HTTP lightControl_cmd
    hasCamera: true,
    hasMaterialStation: true, // 4-head physical tool changer
    maxMaterialSlots: 4,
  });

  public readonly definition: PrinterModelDefinition = {
    id: 'creator-5-pro',
    displayName: 'FlashForge Creator 5 / 5 Pro',
    vendor: 'FlashForge',
    family: 'flashforge-5m',
    defaultPort: 8898,
    requiresCheckCode: true,
    checkCodeLabel: 'Check Code',
    checkCodePlaceholder: 'e.g. 123456',
    checkCodeHint: 'Found on printer touchscreen under Settings > About',
    requiresSerialNumber: true,
    serialNumberHint: 'Found on printer touchscreen under Settings > About (starts with SNMVMF)',
    supportsDualAPI: false, // Port 8899 TCP is closed on Creator 5 Pro
    customCameraSupported: true,
    canOverrideLeds: false,
    networkCapabilities: this.networkCapabilities,
  };

  public canHandle(typeName: string): boolean {
    if (!typeName) return false;
    const lower = typeName.toLowerCase();
    return lower.includes('creator 5') || lower.includes('creator5') || lower.includes('creator-5');
  }

  public createBackend(options: BackendInitOptions): BasePrinterBackend {
    return new AD5XBackend(options);
  }
}

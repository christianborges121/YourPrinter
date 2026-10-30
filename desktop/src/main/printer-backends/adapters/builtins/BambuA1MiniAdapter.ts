/**
 * @fileoverview Adapter definition for Bambu Lab A1 mini printers.
 */

import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import { BambuA1MiniBackend } from '../../BambuA1MiniBackend.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import { BambuAdapter } from './base/BambuAdapter.js';

export class BambuA1MiniAdapter extends BambuAdapter {
  public readonly networkCapabilities: PrinterNetworkCapabilities = BambuAdapter.createBambuCapabilities({
    maxBedTemp: 80,
    maxExtruderTemp: 300,
    hasChamberHeater: false,
    hasChamberFan: false,
    hasAuxFan: false,
    hasFiltration: false,
    hasMaterialStation: true, // AMS Lite
    maxMaterialSlots: 4,
  });

  public readonly definition: PrinterModelDefinition = {
    id: 'bambu-a1-mini',
    displayName: 'Bambu Lab A1 mini',
    vendor: 'Bambu Lab',
    family: 'bambu',
    defaultPort: 8883,
    requiresCheckCode: true,
    checkCodeLabel: 'LAN Access Code',
    checkCodePlaceholder: 'e.g. 12345678',
    checkCodeHint: 'Found on printer touchscreen under Settings > LAN Mode',
    requiresSerialNumber: true,
    serialNumberHint: 'Found on printer touchscreen under Settings > Device (15 chars starting with 030)',
    supportsDualAPI: false,
    customCameraSupported: true,
    canOverrideLeds: false,
    networkCapabilities: this.networkCapabilities,
  };

  public canHandle(typeName: string): boolean {
    if (!typeName) return false;
    return /bambu|a1\s*mini/i.test(typeName);
  }

  public createBackend(options: BackendInitOptions): BasePrinterBackend {
    return new BambuA1MiniBackend(options);
  }
}

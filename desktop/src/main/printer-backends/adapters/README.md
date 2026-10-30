# Extensible Printer Adapter Architecture

This directory provides the unified, pluggable **Printer Adapter System** for `YourPrinter`.

---

## Overview

Previously, the codebase contained hardcoded vendor-specific checks (`isBambuModel`, switch statements on `modelType`, hardcoded HTML form options, and tightly coupled TCP connections).

With this architecture:
1. **Adding a new 3D printer only requires adding a single adapter class** implementing `PrinterAdapter`.
2. The central `PrinterAdapterRegistry` handles model detection, display names, capability queries, and backend instantiation.
3. The WebUI dynamically discovers supported printer models from `GET /api/printers/models`, rendering form dropdowns, check-code labels, placeholder text, and validation rules automatically.

---

## How to Add a New Printer (Example: Klipper / Moonraker)

### Step 1: Create your Backend Driver class
Extend `BasePrinterBackend` to implement status polling, job operations, and telemetry:

```typescript
// src/main/printer-backends/KlipperBackend.ts
import { BasePrinterBackend } from './BasePrinterBackend.js';
import type { StatusResult, JobListResult, BackendInitOptions } from '@shared/types/printer-backend/index.js';

export class KlipperBackend extends BasePrinterBackend {
  constructor(options: BackendInitOptions) {
    super(options);
  }

  public async initialize(): Promise<void> {
    this.connected = true;
    this.initialized = true;
  }

  public async getPrinterStatus(): Promise<StatusResult> {
    // Fetch Moonraker /printer/objects/query status
    return {
      status: {
        state: 'IDLE',
        temperatures: {
          bed: { current: 60, target: 60 },
          extruder: { current: 215, target: 215 }
        },
        job: null,
      }
    };
  }

  public async getJobList(): Promise<JobListResult> {
    return { success: true, files: [] };
  }

  protected buildFeatureSet() {
    return {
      hasCamera: true,
      hasFiltration: false,
      hasLEDs: false,
      hasMaterialStation: false,
    };
  }
}
```

### Step 2: Create your Adapter Definition class
Implement the `PrinterAdapter` interface:

```typescript
// src/main/printer-backends/adapters/builtins/KlipperAdapter.ts
import type { PrinterAdapter, PrinterAdapterConnectionServices } from '../PrinterAdapter.js';
import type { BackendInitOptions, PrinterModelDefinition } from '@shared/types/printer-backend/index.js';
import type { ConnectionResult, PrinterDetails } from '@shared/types/printer.js';
import { KlipperBackend } from '../../KlipperBackend.js';

export class KlipperAdapter implements PrinterAdapter {
  public readonly definition: PrinterModelDefinition = {
    id: 'klipper',
    displayName: 'Klipper / Moonraker',
    vendor: 'Klipper',
    family: 'klipper',
    defaultPort: 7125,
    requiresCheckCode: false,
    requiresSerialNumber: false,
    customCameraSupported: true,
    supportsDualAPI: false,
  };

  public canHandle(typeName: string): boolean {
    return /klipper|moonraker|mainsail|fluidd/i.test(typeName);
  }

  public createBackend(options: BackendInitOptions) {
    return new KlipperBackend(options);
  }

  // Optional: implement custom connection workflow
  public async connect(
    details: PrinterDetails,
    services: PrinterAdapterConnectionServices
  ): Promise<ConnectionResult> {
    const contextId = services.contextManager.createContext(details);
    services.stateManager.setConnected(contextId, details, null, null);
    await services.backendManager.initializeBackend(contextId, { printerDetails: details });
    services.contextManager.switchContext(contextId);
    return { success: true, printerDetails: details };
  }
}
```

### Step 3: Register the Adapter
Register the adapter in `src/main/printer-backends/adapters/PrinterAdapterRegistry.ts` (or at runtime via `registerPrinterAdapter`):

```typescript
import { registerPrinterAdapter } from './PrinterAdapterRegistry.js';
import { KlipperAdapter } from './builtins/KlipperAdapter.js';

registerPrinterAdapter(new KlipperAdapter());
```

**That's it!**
- Model detection automatically recognizes Klipper printers.
- The WebUI "Add Printer" modal dynamically shows `Klipper / Moonraker` in the dropdown.
- Required/optional fields, hints, and connection routing work seamlessly.

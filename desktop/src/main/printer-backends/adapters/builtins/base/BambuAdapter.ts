/**
 * @fileoverview Abstract base adapter for Bambu Lab ecosystem printers.
 *
 * Implements common Bambu Lab family logic:
 * - MQTT and FTP port definitions
 * - LAN mode authentication requirements
 * - Shared connection lifecycle orchestration
 * - Default Bambu family network capabilities
 *
 * Specific printer models (e.g. BambuA1MiniAdapter, BambuP1SAdapter, BambuX1CAdapter)
 * extend this class and override model-specific definitions and capabilities.
 */

import type { ConnectionResult, PrinterDetails } from '@shared/types/printer.js';
import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import type { BasePrinterBackend } from '../../BasePrinterBackend.js';
import type { PrinterAdapter, PrinterAdapterConnectionServices } from '../PrinterAdapter.js';

export abstract class BambuAdapter implements PrinterAdapter {
  public abstract readonly definition: PrinterModelDefinition;
  public abstract readonly networkCapabilities: PrinterNetworkCapabilities;

  /**
   * Determine whether this adapter handles the specified typeName.
   */
  public abstract canHandle(typeName: string, hints?: { ipAddress?: string; rawData?: unknown }): boolean;

  /**
   * Instantiate the backend driver for this Bambu model.
   */
  public abstract createBackend(options: BackendInitOptions): BasePrinterBackend;

  /**
   * Base Bambu Lab connection orchestrator.
   * Connects via LAN mode without requiring FlashForge TCP/UDP probing.
   */
  public async connect(
    details: PrinterDetails,
    services: PrinterAdapterConnectionServices
  ): Promise<ConnectionResult> {
    try {
      services.loadingManager.show({ message: `Connecting to ${details.Name}...`, canCancel: false });

      // Create printer context
      const contextId = services.contextManager.createContext(details);

      // Set connection state for Bambu backend
      services.stateManager.setConnected(
        contextId,
        details,
        null,
        null
      );

      // Initialize backend for this context
      const backendInitResult = await services.backendManager.initializeBackend(contextId, {
        printerDetails: details,
        primaryClient: null,
      });

      if (!backendInitResult.success) {
        services.contextManager.removeContext(contextId);
        return { success: false, error: backendInitResult.error || 'Bambu backend initialization failed' };
      }

      // Switch to the newly connected context
      services.contextManager.switchContext(contextId);
      services.loadingManager.showSuccess(`Connected to ${details.Name} at ${details.IPAddress}`, 4000);

      return {
        success: true,
        printerDetails: details,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Helper to construct baseline Bambu Lab network capabilities with model overrides.
   */
  protected static createBambuCapabilities(overrides: Partial<PrinterNetworkCapabilities> = {}): PrinterNetworkCapabilities {
    return {
      canJog: true,
      canHome: true,
      canBedLevel: true,
      supportedAxes: ['X', 'Y', 'Z'],
      hasBedHeater: true,
      hasExtruderHeater: true,
      hasChamberHeater: false,
      nozzleCount: 1,
      maxBedTemp: 100,
      maxExtruderTemp: 300,
      hasPartCoolingFan: true,
      hasChamberFan: false,
      hasAuxFan: false,
      hasFiltration: false,
      hasLedControl: true,
      canAdjustSpeed: true,
      canAdjustZOffset: true,
      hasCamera: true,
      hasMaterialStation: true,
      maxMaterialSlots: 4,
      canPause: true,
      canResume: true,
      canCancel: true,
      ...overrides,
    };
  }
}

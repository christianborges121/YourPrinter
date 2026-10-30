/**
 * @fileoverview Extensible Printer Adapter interface contract.
 *
 * Each 3D printer adapter implements this interface to declare:
 * - Its metadata (vendor, display name, family, pairing requirements)
 * - Model detection logic (matches firmware typeName strings or discovery payloads)
 * - Factory instantiation of the backend instance
 * - Optional custom connection strategy (e.g. MQTT/FTP/WebSocket/REST)
 */

import type { ConnectionResult, PrinterDetails } from '@shared/types/printer.js';
import type { BackendInitOptions, PrinterModelDefinition, PrinterNetworkCapabilities } from '@shared/types/printer-backend/index.js';
import type { ConnectionStateManager } from '../../services/ConnectionStateManager.js';
import type { LoadingManager } from '../../managers/LoadingManager.js';
import type { PrinterBackendManager } from '../../managers/PrinterBackendManager.js';
import type { PrinterContextManager } from '../../managers/PrinterContextManager.js';
import type { BasePrinterBackend } from '../BasePrinterBackend.js';

export interface PrinterAdapterConnectionServices {
  readonly contextManager: PrinterContextManager;
  readonly stateManager: ConnectionStateManager;
  readonly backendManager: PrinterBackendManager;
  readonly loadingManager: LoadingManager;
}

export interface PrinterAdapter {
  /** Metadata descriptor for model identification, UI rendering, and validation */
  readonly definition: PrinterModelDefinition;

  /** Declarative network capabilities declaring what operations are functional over LAN */
  readonly networkCapabilities?: PrinterNetworkCapabilities;

  /**
   * Determine whether this adapter handles the specified printer model/typeName.
   *
   * @param typeName - Firmware reported type name (e.g. "Creator 5", "Adventurer 5M Pro", "Bambu Lab A1 mini")
   * @param hints - Optional extra detection hints (e.g. IP address, raw discovery packet)
   */
  canHandle(typeName: string, hints?: { ipAddress?: string; rawData?: unknown }): boolean;

  /**
   * Factory method to instantiate the backend driver for this printer.
   *
   * @param options - Initialization options including connection endpoints and credentials
   */
  createBackend(options: BackendInitOptions): BasePrinterBackend;

  /**
   * Optional custom connection strategy.
   * If provided, the connection orchestrator delegates connection directly to this method,
   * bypassing vendor-specific FlashForge TCP/UDP probing.
   */
  connect?(
    details: PrinterDetails,
    services: PrinterAdapterConnectionServices
  ): Promise<ConnectionResult>;
}

/**
 * @fileoverview Type definitions for extensible printer adapters and catalog discovery.
 *
 * Defines the contract that every printer adapter exposes to the system so that
 * backend management, connection flow, and UI model selection are fully decoupled
 * from any specific printer manufacturer or protocol.
 */

/**
 * Declarative network capabilities contract defining what functions are supported over LAN.
 */
export interface PrinterNetworkCapabilities {
  // Movement & Positioning
  readonly canJog: boolean;
  readonly canHome: boolean;
  readonly canBedLevel: boolean;
  readonly supportedAxes: readonly ('X' | 'Y' | 'Z')[];

  // Thermal Hardware
  readonly hasBedHeater: boolean;
  readonly hasExtruderHeater: boolean;
  readonly hasChamberHeater: boolean;
  readonly nozzleCount: number;
  readonly maxBedTemp: number;
  readonly maxExtruderTemp: number;
  readonly maxChamberTemp?: number;

  // Ventilation & Accessories
  readonly hasPartCoolingFan: boolean;
  readonly hasChamberFan: boolean;
  readonly hasAuxFan: boolean;
  readonly hasFiltration: boolean;
  readonly hasLedControl: boolean;

  // Overrides & Tuning
  readonly canAdjustSpeed: boolean;
  readonly canAdjustZOffset: boolean;

  // Ecosystem & Job
  readonly hasCamera: boolean;
  readonly hasMaterialStation: boolean;
  readonly maxMaterialSlots?: number;

  // Job Execution
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canCancel: boolean;
}

export interface PrinterModelDefinition {
  /** Unique machine identifier, e.g. 'ad5x', 'bambu-a1-mini', 'klipper' */
  readonly id: string;

  /** User-friendly display name, e.g. 'FlashForge Creator 5 / AD5X', 'Bambu Lab A1 mini' */
  readonly displayName: string;

  /** Manufacturer or firmware ecosystem, e.g. 'FlashForge', 'Bambu Lab', 'Klipper', 'Prusa' */
  readonly vendor: string;

  /** Protocol family */
  readonly family: 'flashforge-5m' | 'flashforge-legacy' | 'bambu' | 'klipper' | 'octoprint' | 'generic';

  /** Default command/event port if applicable */
  readonly defaultPort?: number;

  /** Whether the printer requires a pairing code, check code, or LAN access code */
  readonly requiresCheckCode: boolean;

  /** Label for check code in UI, e.g. 'LAN Access Code' or 'Check Code' */
  readonly checkCodeLabel?: string;

  /** Placeholder for check code in UI */
  readonly checkCodePlaceholder?: string;

  /** Helper text explaining where to find the check code on the physical printer */
  readonly checkCodeHint?: string;

  /** Whether serial number is required during manual pairing */
  readonly requiresSerialNumber?: boolean;

  /** Helper text for finding the serial number */
  readonly serialNumberHint?: string;

  /** Whether custom camera stream URLs can be specified */
  readonly customCameraSupported?: boolean;

  /** Whether custom LED control override is supported */
  readonly canOverrideLeds?: boolean;

  /** Whether the printer supports dual FlashForge API operations */
  readonly supportsDualAPI?: boolean;

  /** Default discovery/network protocol (e.g. 'udp-broadcast', 'ssdp', 'mdns') */
  readonly discoveryProtocol?: string;

  /** Declarative network capabilities describing what controls are supported over LAN */
  readonly networkCapabilities?: PrinterNetworkCapabilities;
}

export interface PrinterCatalogItem extends PrinterModelDefinition {
  /** Indicates whether this adapter is active in the running server */
  readonly available: boolean;
}

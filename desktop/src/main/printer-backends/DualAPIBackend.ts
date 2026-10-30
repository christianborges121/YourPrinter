/**
 * @fileoverview Abstract base class for dual-API printer backends using both FiveMClient and FlashForgeClient.
 *
 * Provides common implementation for modern printers that support both HTTP and TCP APIs:
 * - Dual client management (FiveMClient for HTTP, FlashForgeClient for G-code)
 * - Product information fetching and caching
 * - Automatic LED and filtration detection from product endpoint
 * - Enhanced job management (local/recent jobs, upload, start with leveling)
 * - Real-time status monitoring via new API
 * - Reduced code duplication across Adventurer 5M/Pro and AD5X backends
 *
 * Key exports:
 * - DualAPIBackend abstract class: Foundation for dual-API printers
 *
 * Child classes must implement:
 * - getChildBaseFeatures(): Define model-specific base features
 * - getMaterialStationStatus(): Material station support (or return empty status)
 *
 * This abstraction extracts common functionality from Adventurer5MBackend, Adventurer5MProBackend,
 * and AD5XBackend, reducing code duplication while maintaining model-specific feature differentiation.
 */

import { FiveMClient, FlashForgeClient, Product } from '@ghosttypes/ff-api';
import {
  BackendInitOptions,
  BasicJobInfo,
  CommandResult,
  GCodeCommandResult,
  JobListResult,
  JobOperationParams,
  JobStartResult,
  PrinterFeatureSet,
  StatusResult,
} from '@shared/types/printer-backend/index.js';
import { BasePrinterBackend } from './BasePrinterBackend.js';

/**
 * Abstract base class for dual-API printer backends
 * Provides common implementation for printers using both FiveMClient and FlashForgeClient
 */
export abstract class DualAPIBackend extends BasePrinterBackend {
  private static readonly FALLBACK_CAMERA_RETRY_MS = 60_000;

  protected fiveMClient!: FiveMClient;
  protected legacyClient: FlashForgeClient | null = null;
  protected productInfo: Product | null = null;
  protected lastFiltrationMode: 'external' | 'internal' | 'none' = 'none';
  private lastFallbackCameraProbeAt = 0;

  /**
   * Cache for last known filament usage data while printing
   * Preserved when print completes so Spoolman can deduct usage
   * Cleared when state returns to Ready or new print starts
   */
  private lastFilamentUsageCache: {
    estimatedRightLen: number;
    estimatedRightWeight: number;
    currentJob: string;
    cachedAt: Date;
  } | null = null;

  constructor(options: BackendInitOptions) {
    super(options);
    this.initializeClients();
  }

  /**
   * Initialize and validate API clients
   * Common initialization logic for all dual-API backends
   */
  protected initializeClients(): void {
    // Validate primary client is FiveMClient
    if (!(this.primaryClient instanceof FiveMClient)) {
      throw new Error(`${this.constructor.name} requires FiveMClient as primary client`);
    }

    // Secondary TCP support is optional because some modern models expose only the authenticated HTTP API.
    if (this.secondaryClient && !(this.secondaryClient instanceof FlashForgeClient)) {
      throw new Error(`${this.constructor.name} received an invalid secondary client`);
    }

    this.fiveMClient = this.primaryClient;
    this.legacyClient = this.secondaryClient ?? null;
  }

  /**
   * Initialize the backend with feature detection
   * Overrides parent to fetch product info before building features
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized()) {
      return;
    }

    try {
      // Validate primary client connection
      await this.validatePrimaryClient();

      // Initialize secondary client if available
      if (this.secondaryClient) {
        await this.validateSecondaryClient();
      }

      // Fetch product info BEFORE building feature set
      try {
        await this.fetchProductInfo();
      } catch (productInfoError) {
        console.warn('[DualAPIBackend] Non-fatal product info fetch failure:', productInfoError);
      }

      // Now call parent initialize which will build features using our product info
      await super.initialize();
    } catch (error) {
      this.emitEvent('error', null, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Check if backend is already initialized
   */
  private isInitialized(): boolean {
    return this.getBackendStatus().initialized;
  }

  /**
   * Perform backend-specific initialization
   * Override in subclasses for model-specific setup
   */
  protected async initializeBackend(): Promise<void> {
    // Log initialization with backend name
    console.log(`${this.constructor.name} initialized for ${this.printerName}`);
    console.log('- Primary client (FiveMClient): Available');
    console.log(`- Secondary client (FlashForgeClient): ${this.legacyClient ? 'Available' : 'Unavailable'}`);

    const printerModel = (this.typeName || '').toLowerCase();
    const printerName = (this.printerName || '').toLowerCase();
    const isCreator5 =
      printerModel.includes('creator 5') ||
      printerModel.includes('creator5') ||
      printerName.includes('creator 5') ||
      printerName.includes('creator5');

    if (this.ipAddress && (isCreator5 || this.modelType === 'adventurer-5m-pro')) {
      const defaultUrl = `http://${this.ipAddress}:8080/?action=stream`;
      console.log(`- Default camera endpoint: ${defaultUrl}`);
      this.updateFallbackCameraStreamUrl(defaultUrl);
    }

    // Log detected features if we have product info
    if (this.productInfo) {
      console.log('Auto-detected features from product endpoint:');
      console.log(`- LED control: ${this.productInfo.lightCtrlState !== 0 ? 'Available' : 'Not available'}`);
      console.log(
        `- Filtration: ${this.productInfo.internalFanCtrlState !== 0 || this.productInfo.externalFanCtrlState !== 0 ? 'Available' : 'Not available'}`
      );
      if (this.productInfo.internalFanCtrlState !== 0 || this.productInfo.externalFanCtrlState !== 0) {
        console.log(`  - Internal fan control: ${this.productInfo.internalFanCtrlState !== 0 ? 'Yes' : 'No'}`);
        console.log(`  - External fan control: ${this.productInfo.externalFanCtrlState !== 0 ? 'Yes' : 'No'}`);
      }
    }

    // Subclasses can extend this for additional initialization
  }

  /**
   * Fetch product info from printer for feature detection
   */
  protected async fetchProductInfo(): Promise<void> {
    try {
      // Call sendProductCommand to populate productInfo
      const success = await this.fiveMClient.sendProductCommand();

      if (!success || !this.fiveMClient.productInfo) {
        console.warn('Failed to retrieve product info for feature detection');
        return;
      }

      // Store product info for use in getBaseFeatures
      this.productInfo = this.fiveMClient.productInfo;
    } catch (error) {
      console.error('Error fetching product info:', error);
      // Continue without product info - features will use defaults
    }
  }

  /**
   * Get base features for dual-API backends
   * Uses product info to determine LED and filtration availability
   */
  protected getBaseFeatures(): PrinterFeatureSet {
    // Get child-specific features first
    const childFeatures = this.getChildBaseFeatures();

    // Override LED and filtration based on product info if available
    if (this.productInfo) {
      // Creator 5 / 5 Pro has factory chamber lighting and filtration/vents over HTTP
      const isCreator5 =
        /creator\s*(5|pro|4)/i.test(this.typeName || '') ||
        /creator\s*(5|pro|4)/i.test((this.printerDetails as any)?.printerModel || '') ||
        /creator\s*(5|pro|4)/i.test((this.printerDetails as any)?.Name || '') ||
        this.modelType === 'creator-5-pro';

      // Creator 5 Pro firmware under-reports fan states in /product, so enable by model
      const hasFiltration =
        isCreator5
          ? true
          : (this.productInfo.internalFanCtrlState !== 0 || this.productInfo.externalFanCtrlState !== 0);

      // For AD5X (except Creator 5), respect the child's LED settings (don't auto-detect)
      const ledBuiltin =
        isCreator5
          ? true
          : (this.modelType === 'ad5x' ? childFeatures.ledControl.builtin : this.productInfo.lightCtrlState !== 0);

      // Return new object with overridden values
      return this.applyTransportAvailability({
        ...childFeatures,
        ledControl: {
          ...childFeatures.ledControl,
          builtin: ledBuiltin,
        },
        filtration: {
          available: hasFiltration,
          controllable: hasFiltration,
          reason: hasFiltration
            ? 'Hardware supports filtration control'
            : 'Hardware does not support filtration control',
        },
      });
    }

    return this.applyTransportAvailability(childFeatures);
  }

  /**
   * Disable TCP-only features when the printer only accepted the authenticated HTTP API.
   */
  private applyTransportAvailability(features: PrinterFeatureSet): PrinterFeatureSet {
    if (this.legacyClient) {
      return features;
    }

    return {
      ...features,
      ledControl: {
        ...features.ledControl,
        customControlEnabled: features.ledControl.builtin ? true : false,
        usesLegacyAPI: false,
      },
      gcodeCommands: {
        available: false,
        usesLegacyAPI: false,
        supportedCommands: [],
      },
      statusMonitoring: {
        ...features.statusMonitoring,
        usesLegacyAPI: false,
      },
    };
  }

  /**
   * Get child-specific base features
   * Must be implemented by child classes
   */
  protected abstract getChildBaseFeatures(): PrinterFeatureSet;

  /**
   * Execute G-code command using legacy API
   * Common implementation for all dual-API backends
   */
  public async executeGCodeCommand(command: string): Promise<GCodeCommandResult> {
    const startTime = Date.now();

    try {
      if (!this.legacyClient) {
        // Handle M140 (bed), M104 (extruder), and M141 (chamber) via HTTP temperatureCtl_cmd
        const bedMatch = command.match(/M140\s+S(-?\d+)/i);
        const nozzleMatch = command.match(/M104(?:\s+T(\d+))?\s+S(-?\d+)|M104\s+S(-?\d+)(?:\s+T(\d+))?/i);
        const chamberMatch = command.match(/M141\s+S(-?\d+)/i);

        if (chamberMatch) {
          const chamberTemp = parseInt(chamberMatch[1], 10);
          const ok = await this.sendHttpTemperatureCommand({ chamber: chamberTemp });
          return {
            success: ok,
            command,
            response: ok ? 'ok' : 'error',
            executionTime: Date.now() - startTime,
            timestamp: new Date(),
          };
        }

        if (bedMatch) {
          const bedTemp = parseInt(bedMatch[1], 10);
          const ok = await this.sendHttpTemperatureCommand({ platform: bedTemp });
          return {
            success: ok,
            command,
            response: ok ? 'ok' : 'error',
            executionTime: Date.now() - startTime,
            timestamp: new Date(),
          };
        }

        if (nozzleMatch) {
          const toolIndexStr = nozzleMatch[1] ?? nozzleMatch[4];
          const tempStr = nozzleMatch[2] ?? nozzleMatch[3];
          const nozzleTemp = parseInt(tempStr, 10);
          const toolIndex = toolIndexStr !== undefined ? parseInt(toolIndexStr, 10) : undefined;
          const ok = await this.sendHttpTemperatureCommand({ nozzle: nozzleTemp, toolIndex });
          return {
            success: ok,
            command,
            response: ok ? 'ok' : 'error',
            executionTime: Date.now() - startTime,
            timestamp: new Date(),
          };
        }

        throw new Error('Legacy TCP API is not available for this printer');
      }

      // G-code commands always use legacy API
      const response = await this.legacyClient.sendRawCmd(command);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        command,
        response: String(response),
        executionTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        command,
        error: errorMessage,
        executionTime,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get current printer status using new API with legacy fallback
   * Common implementation with hooks for backend-specific fields
   */
  public async getPrinterStatus(): Promise<StatusResult> {
    try {
      // Use new API for status monitoring
      const status = await this.fiveMClient.info.getStatus();

      if (!status) {
        throw new Error('Failed to get printer status');
      }

      // Get detailed machine info for additional data
      const machineInfo = await this.fiveMClient.info.get();

      // Allow subclasses to process machine info
      await this.processMachineInfo(machineInfo);

      const raw = (machineInfo || {}) as Record<string, unknown>;

      // In FlashForge firmware, machineInfo.EstimatedTime represents remaining time in seconds.
      // Total duration is (elapsedTimeSeconds + remainingTimeSeconds).
      const rawEstimatedSeconds =
        machineInfo?.EstimatedTime ??
        (raw.estimatedTime as number) ??
        (raw.EstimatedTime as number) ??
        0;
      const elapsedTimeSeconds =
        machineInfo?.PrintDuration ??
        (raw.printDuration as number) ??
        (raw.PrintDuration as number) ??
        0;
      const remainingTimeSeconds = rawEstimatedSeconds > 0 ? rawEstimatedSeconds : 0;
      const totalEstimatedSeconds = elapsedTimeSeconds + remainingTimeSeconds;

      // Extract current filament usage values
      const estimatedRightLen =
        machineInfo?.EstLength ??
        (raw.estLength as number) ??
        (raw.estimatedRightLen as number) ??
        0;
      const estimatedRightWeight =
        machineInfo?.EstWeight ??
        (raw.estWeight as number) ??
        (raw.estimatedRightWeight as number) ??
        0;
      const currentJob =
        machineInfo?.PrintFileName ??
        (raw.printFileName as string) ??
        (raw.fileName as string) ??
        (raw.currentFile as string) ??
        undefined;

      // Cache filament usage while actively printing
      if (
        (status === 'printing' || status === 'paused') &&
        currentJob &&
        (estimatedRightLen > 0 || estimatedRightWeight > 0)
      ) {
        this.lastFilamentUsageCache = {
          estimatedRightLen,
          estimatedRightWeight,
          currentJob,
          cachedAt: new Date(),
        };
      }

      // Use cached values when print is completed
      let finalEstimatedRightLen = estimatedRightLen;
      let finalEstimatedRightWeight = estimatedRightWeight;

      if (status === 'completed' && this.lastFilamentUsageCache) {
        // Verify cache matches current job
        if (this.lastFilamentUsageCache.currentJob === currentJob) {
          finalEstimatedRightLen = this.lastFilamentUsageCache.estimatedRightLen;
          finalEstimatedRightWeight = this.lastFilamentUsageCache.estimatedRightWeight;
          console.log(
            `[DualAPIBackend] Using cached filament usage for completed print: ${finalEstimatedRightWeight}g, ${finalEstimatedRightLen}mm`
          );
        }
      }

      // Clear cache when returning to ready or new print starts
      if (
        status === 'ready' ||
        (status === 'printing' && currentJob && this.lastFilamentUsageCache?.currentJob !== currentJob)
      ) {
        console.log('[DualAPIBackend] Clearing filament usage cache');
        this.lastFilamentUsageCache = null;
      }

      // For multi-nozzle models (e.g. Creator 5 Pro with 4 tool heads), find active tool & extract multi-tool temps
      let activeNozzle = machineInfo?.Extruder;
      let activeNozzleTemp = activeNozzle?.current ?? (raw.nozzleTemp as number) ?? 0;
      let activeNozzleTarget = activeNozzle?.set ?? (raw.nozzleTargetTemp as number) ?? 0;

      // FlashForge multi-tool telemetry sources
      const rawMultiTool =
        (raw.ToolTemps as unknown[]) ??
        (machineInfo?.ToolTemps as unknown[]) ??
        (raw.toolTemps as unknown[]) ??
        (raw.nozzleTemps as unknown[]) ??
        (raw.nozzles as unknown[]) ??
        (machineInfo?.nozzles as unknown[]) ??
        [];

      const rawMultiTarget =
        (raw.nozzleTargetTemps as unknown[]) ??
        (raw.toolTargetTemps as unknown[]) ??
        (raw.nozzleSetTemps as unknown[]) ??
        [];

      const extractedToolTemps: number[] = [];
      const extractedToolTargets: number[] = [];

      if (Array.isArray(rawMultiTool) && rawMultiTool.length > 0) {
        for (let i = 0; i < rawMultiTool.length; i++) {
          const item = rawMultiTool[i];
          let current = 0;
          let target = 0;

          if (typeof item === 'number') {
            current = item >= 0 ? Math.round(item) : 0;
          } else if (typeof item === 'object' && item !== null) {
            const itemObj = item as Record<string, unknown>;
            const curVal = itemObj.current ?? itemObj.cur ?? itemObj.temp;
            if (typeof curVal === 'number' && curVal >= 0) {
              current = Math.round(curVal);
            }
            const setVal = itemObj.set ?? itemObj.target ?? itemObj.targetTemp;
            if (typeof setVal === 'number' && setVal >= 0) {
              target = Math.round(setVal);
            }
          }

          if (Array.isArray(rawMultiTarget) && rawMultiTarget[i] !== undefined) {
            const tItem = rawMultiTarget[i];
            if (typeof tItem === 'number' && tItem >= 0) {
              target = Math.round(tItem);
            } else if (typeof tItem === 'object' && tItem !== null) {
              const tObj = tItem as Record<string, unknown>;
              const setVal = tObj.set ?? tObj.target ?? tObj.targetTemp;
              if (typeof setVal === 'number' && setVal >= 0) {
                target = Math.round(setVal);
              }
            }
          }

          extractedToolTemps.push(current);
          extractedToolTargets.push(target);
        }
      } else if (machineInfo?.rightNozzle || machineInfo?.leftNozzle) {
        const right = machineInfo.rightNozzle as { current?: number; set?: number } | undefined;
        const left = machineInfo.leftNozzle as { current?: number; set?: number } | undefined;
        if (right) {
          extractedToolTemps.push(Math.round(right.current ?? 0));
          extractedToolTargets.push(Math.round(right.set ?? 0));
        }
        if (left) {
          extractedToolTemps.push(Math.round(left.current ?? 0));
          extractedToolTargets.push(Math.round(left.set ?? 0));
        }
      } else if (machineInfo?.Extruder2) {
        const extKeys = ['Extruder', 'Extruder2', 'Extruder3', 'Extruder4'];
        for (const k of extKeys) {
          const ext = (machineInfo as Record<string, unknown>)?.[k] as { current?: number; set?: number } | undefined;
          if (ext && typeof ext === 'object') {
            extractedToolTemps.push(Math.round(ext.current ?? 0));
            extractedToolTargets.push(Math.round(ext.set ?? 0));
          }
        }
      }

      // If multi-tool data was extracted, determine the active nozzle and synchronize targets
      if (extractedToolTemps.length > 0) {
        let bestIndex = 0;
        let maxTarget = -1;
        for (let i = 0; i < extractedToolTemps.length; i++) {
          const current = extractedToolTemps[i];
          const target = extractedToolTargets[i];
          if (target > maxTarget) {
            maxTarget = target;
            bestIndex = i;
          } else if (target === maxTarget && current > activeNozzleTemp) {
            bestIndex = i;
          }
        }

        // If activeNozzleTarget was found from primary Extruder/nozzleTargetTemp (e.g. 215)
        // but the extracted multi-tool targets are all 0 (common when firmware only updates the active tool's global target)
        if (activeNozzleTarget > 0 && extractedToolTargets.every((t) => t === 0)) {
          extractedToolTargets[bestIndex] = activeNozzleTarget;
        }

        // Synchronize activeNozzleTemp and activeNozzleTarget
        if (extractedToolTargets[bestIndex] > 0 || activeNozzleTarget === 0) {
          activeNozzleTemp = extractedToolTemps[bestIndex];
          activeNozzleTarget = extractedToolTargets[bestIndex];
        }
      }

      const bedCurrent =
        machineInfo?.PrintBed?.current ??
        (raw.bedTemp as number) ??
        (raw.bedTemperature as number) ??
        0;
      const bedSet =
        machineInfo?.PrintBed?.set ??
        (raw.bedTargetTemp as number) ??
        (raw.bedTargetTemperature as number) ??
        0;

      const chamberCurrent =
        machineInfo?.Chamber?.current ??
        (raw.chamberTemp as number) ??
        (raw.chamberTemperature as number) ??
        0;
      const chamberSet =
        machineInfo?.Chamber?.set ??
        (raw.chamberTargetTemp as number) ??
        (raw.chamberTargetTemperature as number) ??
        0;

      const isCompleted = (status || '').toLowerCase() === 'completed';
      let progressVal = isCompleted
        ? 100
        : (machineInfo?.PrintProgress ??
          (raw.printProgress as number) ??
          (raw.progress as number) ??
          0);

      // Convert decimal format (0.0 - 1.0) from modern Flashforge backends to percentage (0 - 100)
      if (progressVal > 0 && progressVal <= 1.0) {
        progressVal = progressVal * 100;
      }

      const currentLayerVal =
        machineInfo?.CurrentPrintLayer ??
        (raw.currentLayer as number) ??
        (raw.currentPrintLayer as number) ??
        (raw.layer as number) ??
        undefined;

      const totalLayersVal =
        machineInfo?.TotalPrintLayers ??
        (raw.totalLayers as number) ??
        (raw.totalPrintLayers as number) ??
        undefined;

      // Guard against stale 100% progress carried over from previous completed job
      if (
        !isCompleted &&
        progressVal >= 90 &&
        totalLayersVal !== undefined &&
        totalLayersVal > 1 &&
        currentLayerVal !== undefined &&
        currentLayerVal < totalLayersVal * 0.5
      ) {
        progressVal = currentLayerVal > 0 ? Math.round((currentLayerVal / totalLayersVal) * 100) : 0;
      }

      const printEtaVal =
        machineInfo?.PrintEta ??
        (raw.printEta as string) ??
        (raw.eta as string) ??
        undefined;

      const printerStatus = {
        printerState: status,
        bedTemperature: bedCurrent,
        bedTargetTemperature: bedSet,
        nozzleTemperature: activeNozzleTemp,
        nozzleTargetTemperature: activeNozzleTarget,
        chamberTemperature: chamberCurrent,
        chamberTargetTemperature: chamberSet,
        toolTemps: extractedToolTemps,
        toolTargetTemps: extractedToolTargets,
        nozzleCnt: (raw.nozzleCnt as number) ?? (extractedToolTemps.length || 1),
        progress: progressVal,
        currentJob: currentJob || undefined,
        estimatedTime: totalEstimatedSeconds > 0 ? Math.round(totalEstimatedSeconds / 60) : undefined,
        remainingTime: remainingTimeSeconds > 0 ? Math.round(remainingTimeSeconds / 60) : undefined,
        printDuration: elapsedTimeSeconds,
        currentLayer: currentLayerVal,
        totalLayers: totalLayersVal,
        estimatedRightLen: finalEstimatedRightLen,
        estimatedRightWeight: finalEstimatedRightWeight,
        printEta: printEtaVal,
        cumulativePrintTime: machineInfo?.CumulativePrintTime ?? (raw.cumulativePrintTime as number) ?? 0,
        cumulativeFilament: machineInfo?.CumulativeFilament ?? (raw.cumulativeFilament as number) ?? 0,
        nozzleSize: machineInfo?.NozzleSize ?? (raw.nozzleSize as string) ?? '0.4mm',
        filamentType: machineInfo?.FilamentType ?? (raw.filamentType as string) ?? 'PLA',
        printSpeedAdjust: machineInfo?.PrintSpeedAdjust ?? (raw.printSpeedAdjust as number) ?? 100,
        zAxisCompensation: machineInfo?.ZAxisCompensation ?? (raw.zAxisCompensation as number) ?? 0,
        coolingFanSpeed: machineInfo?.CoolingFanSpeed ?? (raw.coolingFanSpeed as number) ?? 0,
        chamberFanSpeed: machineInfo?.ChamberFanSpeed ?? (raw.chamberFanSpeed as number) ?? 0,
        tvoc: machineInfo?.Tvoc ?? (raw.tvoc as number) ?? 0,
        externalFanOn:
          (machineInfo as any)?.ExternalFanOn === true ||
          raw.externalFanStatus === 'open' ||
          this.lastFiltrationMode === 'external',
        internalFanOn:
          (machineInfo as any)?.InternalFanOn === true ||
          raw.internalFanStatus === 'open' ||
          this.lastFiltrationMode === 'internal',
        filtrationMode:
          raw.externalFanStatus === 'open' || (machineInfo as any)?.ExternalFanOn === true
            ? 'external'
            : raw.internalFanStatus === 'open' || (machineInfo as any)?.InternalFanOn === true
            ? 'internal'
            : this.lastFiltrationMode,
        filtration: {
          available: this.isFeatureAvailable('filtration'),
          mode:
            raw.externalFanStatus === 'open' || (machineInfo as any)?.ExternalFanOn === true
              ? 'external'
              : raw.internalFanStatus === 'open' || (machineInfo as any)?.InternalFanOn === true
              ? 'internal'
              : this.lastFiltrationMode,
        },
        ledState:
          raw.lightStatus === 'open' ||
          raw.lightStatus === 'on' ||
          (machineInfo as any)?.LightStatus === 'open' ||
          (machineInfo as any)?.lightStatus === 'open' ||
          undefined,
        // Allow subclasses to add additional fields
        ...this.getAdditionalStatusFields(machineInfo),
      };

      return {
        success: true,
        status: printerStatus,
        timestamp: new Date(),
      };
    } catch (error) {
      // Fallback to legacy API if new API fails
      return this.getPrinterStatusLegacy(error);
    }
  }

  /**
   * Get printer status using legacy API (fallback)
   */
  protected async getPrinterStatusLegacy(originalError: unknown): Promise<StatusResult> {
    console.warn('[DualAPIBackend] Modern HTTP status failed, falling back to legacy:', originalError);
    try {
      if (!this.legacyClient) {
        const errorMsg = originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`Legacy TCP API is not available for this printer (modern API error: ${errorMsg})`);
      }

      const printerInfo = await this.legacyClient.getPrinterInfo();

      if (!printerInfo) {
        throw new Error('Failed to get printer information from legacy API');
      }

      const infoObj = printerInfo as unknown as Record<string, unknown>;

      const status = {
        printerState: String(infoObj.MachineStatus || infoObj.Status || 'unknown'),
        bedTemperature: parseFloat(String(infoObj.BedTemperature || infoObj.BedTemp || '0')),
        nozzleTemperature: parseFloat(
          String(infoObj.NozzleTemperature || infoObj.NozzleTemp || infoObj.ExtruderTemp || '0')
        ),
        progress: String(infoObj.MachineStatus || infoObj.Status || '').toLowerCase() === 'completed'
          ? 100
          : parseFloat(String(infoObj.Progress || '0')),
        currentJob: infoObj.CurrentFile ? String(infoObj.CurrentFile) : undefined,
        estimatedTime: undefined,
        remainingTime: undefined,
        currentLayer: infoObj.CurrentPrintLayer ? parseInt(String(infoObj.CurrentPrintLayer)) : undefined,
        totalLayers: infoObj.TotalPrintLayers ? parseInt(String(infoObj.TotalPrintLayers)) : undefined,
      };

      return {
        success: true,
        status,
        timestamp: new Date(),
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        timestamp: new Date(),
        status: {
          printerState: 'error',
          bedTemperature: 0,
          nozzleTemperature: 0,
          progress: 0,
          currentLayer: undefined,
          totalLayers: undefined,
        },
      };
    }
  }

  /**
   * Get list of local jobs using new API
   */
  public async getLocalJobs(): Promise<JobListResult> {
    try {
      const localJobs = await this.fiveMClient.files.getLocalFileList();

      if (!localJobs || !Array.isArray(localJobs)) {
        throw new Error('Failed to get local jobs');
      }

      // Local file list returns string[] - convert to BasicJobInfo[]
      const jobs: BasicJobInfo[] = localJobs.map((fileName: string) => ({
        fileName,
        printingTime: 0, // Local file list doesn't provide timing information
      }));

      return {
        success: true,
        jobs,
        totalCount: jobs.length,
        source: 'local',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        jobs: [],
        totalCount: 0,
        source: 'local',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get list of recent jobs using new API
   */
  public async getRecentJobs(): Promise<JobListResult> {
    try {
      const recentJobs = await this.fiveMClient.files.getRecentFileList();

      if (!recentJobs || !Array.isArray(recentJobs)) {
        throw new Error('Failed to get recent jobs');
      }

      // Recent jobs return FFGcodeFileEntry[]
      const jobs: BasicJobInfo[] = recentJobs.map((fileEntry) => ({
        fileName: fileEntry.gcodeFileName,
        printingTime: fileEntry.printingTime,
      }));

      // Allow subclasses to transform job data
      const transformedJobs = this.transformJobList(jobs, 'recent');

      return {
        success: true,
        jobs: transformedJobs,
        totalCount: transformedJobs.length,
        source: 'recent',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        jobs: [],
        totalCount: 0,
        source: 'recent',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Start a job using new API
   */
  public async startJob(params: JobOperationParams): Promise<JobStartResult> {
    try {
      // Handle file upload case
      if (params.filePath) {
        const success = await this.fiveMClient.jobControl.uploadFile(params.filePath, params.startNow, params.leveling);

        if (!success) {
          throw new Error('Failed to upload and start job');
        }

        return {
          success: true,
          fileName: params.fileName || params.filePath,
          started: params.startNow,
          timestamp: new Date(),
        };
      }

      // Handle local file printing case
      if (!params.fileName) {
        throw new Error('fileName or filePath is required');
      }

      // Only proceed with printing if startNow is true
      if (!params.startNow) {
        return {
          success: true,
          fileName: params.fileName,
          started: false,
          timestamp: new Date(),
        };
      }

      const success = await this.fiveMClient.jobControl.printLocalFile(params.fileName, params.leveling);

      if (!success) {
        throw new Error('Failed to start job');
      }

      return {
        success: true,
        fileName: params.fileName,
        started: true,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fileName: params.fileName || '',
        started: false,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Pause current job using new API with legacy fallback
   */
  public async pauseJob(): Promise<CommandResult> {
    try {
      const success = await this.fiveMClient.jobControl.pausePrintJob();

      if (!success) {
        throw new Error('Failed to pause job');
      }

      return {
        success: true,
        data: 'Job paused',
        timestamp: new Date(),
      };
    } catch (_error) {
      // Fallback to legacy API
      try {
        if (!this.legacyClient) {
          throw new Error('Legacy TCP API is not available for this printer');
        }

        await this.legacyClient.sendRawCmd('M25');
        return {
          success: true,
          data: 'Job paused (via legacy API)',
          timestamp: new Date(),
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          timestamp: new Date(),
        };
      }
    }
  }

  /**
   * Resume paused job using new API with legacy fallback
   */
  public async resumeJob(): Promise<CommandResult> {
    try {
      const success = await this.fiveMClient.jobControl.resumePrintJob();

      if (!success) {
        throw new Error('Failed to resume job');
      }

      return {
        success: true,
        data: 'Job resumed',
        timestamp: new Date(),
      };
    } catch (_error) {
      // Fallback to legacy API
      try {
        if (!this.legacyClient) {
          throw new Error('Legacy TCP API is not available for this printer');
        }

        await this.legacyClient.sendRawCmd('M24');
        return {
          success: true,
          data: 'Job resumed (via legacy API)',
          timestamp: new Date(),
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          timestamp: new Date(),
        };
      }
    }
  }

  /**
   * Cancel current job using new API with legacy fallback
   */
  public async cancelJob(): Promise<CommandResult> {
    try {
      const success = await this.fiveMClient.jobControl.cancelPrintJob();

      if (!success) {
        throw new Error('Failed to cancel job');
      }

      return {
        success: true,
        data: 'Job cancelled',
        timestamp: new Date(),
      };
    } catch (_error) {
      // Fallback to legacy API
      try {
        if (!this.legacyClient) {
          throw new Error('Legacy TCP API is not available for this printer');
        }

        await this.legacyClient.sendRawCmd('M26');
        return {
          success: true,
          data: 'Job cancelled (via legacy API)',
          timestamp: new Date(),
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          timestamp: new Date(),
        };
      }
    }
  }

  /**
   * Clear platform / status
   */
  public override async clearStatus(): Promise<boolean> {
    if (this.fiveMClient?.jobControl?.clearPlatform) {
      try {
        return await this.fiveMClient.jobControl.clearPlatform();
      } catch (err) {
        console.warn('[DualAPIBackend] clearPlatform failed:', err);
      }
    }
    return true;
  }

  /**
   * Get model preview image for current print job
   */
  public async getModelPreview(): Promise<string | null> {
    try {
      // First check if printer is currently printing
      const machineInfo = await this.fiveMClient.info.get();

      if (!machineInfo || !machineInfo.PrintFileName || machineInfo.PrintFileName === '') {
        // No active print job, no preview available
        return null;
      }

      // Use the general job thumbnail method for the current job
      return this.getJobThumbnail(machineInfo.PrintFileName);
    } catch (error) {
      console.error('Error getting model preview:', error);
      return null;
    }
  }

  /**
   * Get thumbnail image for any job file by filename
   */
  public async getJobThumbnail(fileName: string): Promise<string | null> {
    try {
      if (!fileName || fileName === '') {
        console.warn('getJobThumbnail: No filename provided');
        return null;
      }

      // Get the thumbnail for the specified file
      const thumbnailBuffer = await this.fiveMClient.files.getGCodeThumbnail(fileName);

      if (!thumbnailBuffer || thumbnailBuffer.length === 0) {
        console.warn(`No thumbnail available for file: ${fileName}`);
        return null;
      }

      // Convert buffer to base64 data URL
      const base64Data = thumbnailBuffer.toString('base64');
      return `data:image/png;base64,${base64Data}`;
    } catch (error) {
      console.error(`Error getting thumbnail for ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Set LED enabled state with smart API routing based on printer model
   * Matches Main UI IPC handler logic for identical behavior across UIs
   *
   * Routing logic:
   * - 5M Pro with builtin LEDs → HTTP API (FiveMClient)
   * - 5M and AD5X → TCP API (FlashForgeClient, auto-enabled)
   * - Generic printers not supported by DualAPIBackend
   */
  public async setLedEnabled(enabled: boolean): Promise<CommandResult> {
    try {
      const isCreator =
        /creator\s*(5|pro|4)/i.test(this.typeName || '') ||
        /creator\s*(5|pro|4)/i.test((this.printerDetails as any)?.printerModel || '') ||
        /creator\s*(5|pro|4)/i.test((this.printerDetails as any)?.Name || '');

      const features = this.getBackendStatus().features;

      if (!features && !isCreator) {
        return {
          success: false,
          error: 'Cannot determine printer features',
          timestamp: new Date(),
        };
      }

      if (features?.ledControl?.builtin || isCreator || !this.legacyClient) {
        // 5M Pro / Creator 5 with HTTP LEDs → Use HTTP lightControl_cmd
        const success = await this.sendHttpLightCommand(enabled);

        return {
          success,
          data: enabled ? 'LED turned on (HTTP API)' : 'LED turned off (HTTP API)',
          error: success ? undefined : 'Failed to control LED via HTTP API',
          timestamp: new Date(),
        };
      } else if (this.modelType === 'adventurer-5m' || this.modelType === 'ad5x') {
        // 5M and AD5X → Always use TCP API (auto-enabled)
        if (!this.legacyClient) {
          return {
            success: false,
            error: 'Legacy TCP API is not available for LED control on this printer',
            timestamp: new Date(),
          };
        }

        const success = enabled ? await this.legacyClient.ledOn() : await this.legacyClient.ledOff();

        return {
          success,
          data: enabled ? 'LED turned on (TCP API - auto-enabled)' : 'LED turned off (TCP API - auto-enabled)',
          error: success ? undefined : 'Failed to control LED',
          timestamp: new Date(),
        };
      } else {
        // Should not reach here for dual-API backends, but handle gracefully
        return {
          success: false,
          error: 'LED control not available for this printer model',
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  // Feature detection methods - common implementations

  protected supportsNewAPI(): boolean {
    return true; // All dual-API backends support new API
  }

  protected supportsCustomLEDControl(): boolean {
    return true; // All current dual-API backends support custom LED control
  }

  protected supportsLocalJobs(): boolean {
    return true; // All dual-API backends support local jobs
  }

  protected supportsRecentJobs(): boolean {
    return true; // All dual-API backends support recent jobs
  }

  protected supportsUploadJobs(): boolean {
    return true; // All dual-API backends support upload jobs
  }

  protected supportsStartJobs(): boolean {
    return true; // All dual-API backends support starting jobs
  }

  protected getSupportedGCodeCommands(): readonly string[] {
    // Common G-code commands supported by all dual-API printers
    return [
      'G0',
      'G1',
      'G28',
      'G29',
      'G90',
      'G91',
      'G92',
      'M0',
      'M1',
      'M17',
      'M18',
      'M20',
      'M21',
      'M23',
      'M24',
      'M25',
      'M26',
      'M104',
      'M105',
      'M106',
      'M107',
      'M109',
      'M140',
      'M190',
      'M200',
      'M201',
      'M203',
      'M204',
      'M205',
      'M206',
      'M207',
      'M208',
      'M209',
      'M220',
      'M221',
      'M301',
      'M302',
      'M303',
      'M304',
      'M400',
      'M500',
      'M501',
      'M502',
      'M503',
      'M504',
      'M905',
      'M906',
      'M907',
      'M908',
    ];
  }

  // Hooks for subclasses to customize behavior

  /**
   * Process machine info for backend-specific handling
   * Override in subclasses that need to store machine info (e.g., AD5X for material station)
   */
  protected async processMachineInfo(machineInfo: unknown): Promise<void> {
    const info = machineInfo as { CameraStreamUrl?: unknown } | null;
    const cameraStreamUrl = typeof info?.CameraStreamUrl === 'string' ? info.CameraStreamUrl : '';
    this.updateOEMCameraStreamUrl(cameraStreamUrl);

    if (cameraStreamUrl.trim() !== '') {
      this.updateFallbackCameraStreamUrl('');
      this.lastFallbackCameraProbeAt = 0;
      return;
    }

    if (this.fallbackCameraStreamUrl.trim() !== '') {
      return;
    }

    const now = Date.now();
    if (now - this.lastFallbackCameraProbeAt < DualAPIBackend.FALLBACK_CAMERA_RETRY_MS) {
      return;
    }

    this.lastFallbackCameraProbeAt = now;
    const detectedCameraStreamUrl = await this.fiveMClient.detectCameraStream();
    this.updateFallbackCameraStreamUrl(detectedCameraStreamUrl);
  }

  /**
   * Get additional status fields for backend-specific data
   * Override in subclasses to add model-specific fields
   */
  protected getAdditionalStatusFields(_machineInfo: unknown): Record<string, unknown> {
    // Default implementation returns empty object
    // 5M Pro backend will override to add filtration fan fields
    return {};
  }

  /**
   * Transform job list for backend-specific formatting
   * Override in subclasses that need custom job formatting (e.g., AD5X)
   */
  protected transformJobList(jobs: BasicJobInfo[], _source: 'local' | 'recent'): BasicJobInfo[] {
    // Default implementation returns jobs unchanged
    return jobs;
  }

  /**
   * Send HTTP light command for printers with HTTP LED control (5M Pro, Creator 5 / 5 Pro)
   */
  public async sendHttpLightCommand(enabled: boolean): Promise<boolean> {
    try {
      if (enabled && typeof (this.fiveMClient?.control as unknown as { setLedOn?: () => Promise<boolean> })?.setLedOn === 'function') {
        const ok = await (this.fiveMClient.control as unknown as { setLedOn: () => Promise<boolean> }).setLedOn();
        if (ok) return true;
      } else if (!enabled && typeof (this.fiveMClient?.control as unknown as { setLedOff?: () => Promise<boolean> })?.setLedOff === 'function') {
        const ok = await (this.fiveMClient.control as unknown as { setLedOff: () => Promise<boolean> }).setLedOff();
        if (ok) return true;
      }
    } catch {
      // Fall through to direct HTTP POST
    }

    try {
      const details = this.printerDetails as Record<string, any> | undefined;
      const serialNumber =
        this.serialNumber ||
        details?.SerialNumber ||
        details?.serialNumber ||
        (this.fiveMClient as unknown as { serialNumber?: string })?.serialNumber ||
        '';
      const checkCode =
        this.checkCode ||
        details?.CheckCode ||
        details?.checkCode ||
        (this.fiveMClient as unknown as { checkCode?: string })?.checkCode ||
        '';
      const ip =
        this.ipAddress ||
        details?.IPAddress ||
        details?.ipAddress ||
        '';

      if (!ip) return false;

      const res = await fetch(`http://${ip}:8898/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber,
          checkCode,
          payload: {
            cmd: 'lightControl_cmd',
            args: { status: enabled ? 'open' : 'close' },
          },
        }),
        signal: AbortSignal.timeout(4000),
      });
      const data = (await res.json()) as { code?: number };
      return data?.code === 0;
    } catch (err) {
      console.warn('[DualAPIBackend] Failed to send HTTP light command:', err);
      return false;
    }
  }

  /**
   * Send HTTP temperature command for HTTP-only printers (Creator 5 / 5 Pro)
   */
  public async sendHttpTemperatureCommand(options: {
    platform?: number;
    nozzle?: number;
    toolIndex?: number;
    chamber?: number;
  }): Promise<boolean> {
    try {
      const TEMP_NO_CHANGE = -200;
      let platform = options.platform !== undefined ? options.platform : TEMP_NO_CHANGE;
      if (platform === 0) platform = -100;

      let chamber = options.chamber !== undefined ? options.chamber : TEMP_NO_CHANGE;
      if (chamber === 0) chamber = -100;

      // Creator 5 firmware treats 0 as nozzle off in the nozzles array
      const nozzleVal = options.nozzle !== undefined ? (options.nozzle === 0 ? 0 : options.nozzle) : TEMP_NO_CHANGE;
      const nozzles = [TEMP_NO_CHANGE, TEMP_NO_CHANGE, TEMP_NO_CHANGE, TEMP_NO_CHANGE];
      if (options.nozzle !== undefined) {
        if (options.toolIndex !== undefined && options.toolIndex >= 0 && options.toolIndex < 4) {
          nozzles[options.toolIndex] = nozzleVal;
        } else {
          nozzles[0] = nozzleVal;
          nozzles[1] = nozzleVal;
          nozzles[2] = nozzleVal;
          nozzles[3] = nozzleVal;
        }
      }

      const rightNozzleVal = options.nozzle !== undefined && (options.toolIndex === undefined || options.toolIndex === 0)
        ? nozzleVal
        : TEMP_NO_CHANGE;
      const leftNozzleVal = options.nozzle !== undefined && options.toolIndex === 1
        ? nozzleVal
        : TEMP_NO_CHANGE;

      const serialNumber =
        this.serialNumber ||
        (this.printerDetails?.serialNumber as string) ||
        (this.fiveMClient as unknown as { serialNumber?: string })?.serialNumber ||
        '';
      const checkCode =
        this.checkCode ||
        (this.printerDetails?.checkCode as string) ||
        (this.fiveMClient as unknown as { checkCode?: string })?.checkCode ||
        '';
      const ip = this.ipAddress || (this.printerDetails?.ipAddress as string) || '';

      const res = await fetch(`http://${ip}:8898/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber,
          checkCode,
          payload: {
            cmd: 'temperatureCtl_cmd',
            args: {
              platform,
              chamber,
              rightNozzle: rightNozzleVal,
              leftNozzle: leftNozzleVal,
              nozzles,
            },
          },
        }),
      });
      const data = (await res.json()) as { code?: number };
      return data?.code === 0;
    } catch (error) {
      console.warn('[DualAPIBackend] Failed to send HTTP temperature command:', error);
      return false;
    }
  }

  /**
   * Send HTTP filtration command for printers with circulation fan control (AD5M Pro / Creator 5)
   * Controls internal HEPA VOC filter circulation and external exhaust vent
   */
  public async sendHttpFiltrationCommand(mode: 'off' | 'internal' | 'external'): Promise<boolean> {
    this.lastFiltrationMode = mode === 'off' ? 'none' : mode;
    try {
      if (mode === 'internal' && typeof (this.fiveMClient?.control as unknown as { setInternalFiltrationOn?: () => Promise<boolean> })?.setInternalFiltrationOn === 'function') {
        const ok = await (this.fiveMClient.control as unknown as { setInternalFiltrationOn: () => Promise<boolean> }).setInternalFiltrationOn();
        if (ok) return true;
      } else if (mode === 'external' && typeof (this.fiveMClient?.control as unknown as { setExternalFiltrationOn?: () => Promise<boolean> })?.setExternalFiltrationOn === 'function') {
        const ok = await (this.fiveMClient.control as unknown as { setExternalFiltrationOn: () => Promise<boolean> }).setExternalFiltrationOn();
        if (ok) return true;
      } else if (mode === 'off' && typeof (this.fiveMClient?.control as unknown as { setFiltrationOff?: () => Promise<boolean> })?.setFiltrationOff === 'function') {
        const ok = await (this.fiveMClient.control as unknown as { setFiltrationOff: () => Promise<boolean> }).setFiltrationOff();
        if (ok) return true;
      }
    } catch {
      // Fall through to direct HTTP POST
    }

    try {
      const details = this.printerDetails as Record<string, any> | undefined;
      const serialNumber =
        this.serialNumber ||
        details?.SerialNumber ||
        details?.serialNumber ||
        (this.fiveMClient as unknown as { serialNumber?: string })?.serialNumber ||
        '';
      const checkCode =
        this.checkCode ||
        details?.CheckCode ||
        details?.checkCode ||
        (this.fiveMClient as unknown as { checkCode?: string })?.checkCode ||
        '';
      const ip =
        this.ipAddress ||
        details?.IPAddress ||
        details?.ipAddress ||
        '';

      if (!ip) return false;

      const internalState = mode === 'internal' ? 'open' : 'close';
      const externalState = mode === 'external' ? 'open' : 'close';

      const res = await fetch(`http://${ip}:8898/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber,
          checkCode,
          payload: {
            cmd: 'circulateCtl_cmd',
            args: {
              internal: internalState,
              external: externalState,
            },
          },
        }),
        signal: AbortSignal.timeout(4000),
      });
      const data = (await res.json()) as { code?: number };
      const success = data?.code === 0;
      if (success) {
        this.lastFiltrationMode = mode === 'off' ? 'none' : mode;
      }
      return success;
    } catch (err) {
      console.warn('[DualAPIBackend] Failed to send HTTP filtration command:', err);
      return false;
    }
  }

  /**
   * Ensure printer camera stream is active (streamCtrl_cmd open)
   */
  public async turnCameraOn(): Promise<boolean> {
    try {
      if (typeof (this.fiveMClient.control as unknown as { turnCameraOn?: () => Promise<boolean> })?.turnCameraOn === 'function') {
        const ok = await (this.fiveMClient.control as unknown as { turnCameraOn: () => Promise<boolean> }).turnCameraOn();
        if (ok) return true;
      }
    } catch {
      // Fall through to HTTP command
    }

    try {
      const details = this.printerDetails as Record<string, any> | undefined;
      const serialNumber =
        this.serialNumber ||
        details?.SerialNumber ||
        details?.serialNumber ||
        (this.fiveMClient as unknown as { serialNumber?: string })?.serialNumber ||
        '';
      const checkCode =
        this.checkCode ||
        details?.CheckCode ||
        details?.checkCode ||
        (this.fiveMClient as unknown as { checkCode?: string })?.checkCode ||
        '';
      const ip =
        this.ipAddress ||
        details?.IPAddress ||
        details?.ipAddress ||
        '';

      if (!ip) {
        console.warn('[DualAPIBackend] Cannot send streamCtrl_cmd: missing IP address');
        return false;
      }

      console.log(`[DualAPIBackend] Sending streamCtrl_cmd open to http://${ip}:8898/control`);
      const res = await fetch(`http://${ip}:8898/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber,
          checkCode,
          payload: {
            cmd: 'streamCtrl_cmd',
            args: { action: 'open' },
          },
        }),
        signal: AbortSignal.timeout(3000),
      });
      const data = (await res.json()) as { code?: number };
      console.log(`[DualAPIBackend] streamCtrl_cmd response:`, data);
      return data?.code === 0;
    } catch (error) {
      console.warn('[DualAPIBackend] Failed to turn camera on:', error);
      return false;
    }
  }

  /**
   * Dispose of backend resources and clear caches
   * Override to clear filament usage cache on disconnect
   */
  public async dispose(): Promise<void> {
    // Clear filament usage cache on disconnect
    this.lastFilamentUsageCache = null;
    this.lastFallbackCameraProbeAt = 0;

    // Call parent dispose to clean up clients
    await super.dispose();
  }
}

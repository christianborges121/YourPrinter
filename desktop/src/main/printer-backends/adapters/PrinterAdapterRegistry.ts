/**
 * @fileoverview Central registry for all 3D printer adapters.
 *
 * Implements the extensible Adapter/Registry pattern. Adding support for a new 3D printer
 * (e.g. Prusa, Klipper, Voron, Creality) requires only implementing the `PrinterAdapter`
 * interface and registering it here via `PrinterAdapterRegistry.getInstance().register(new MyAdapter())`
 * or `registerPrinterAdapter(new MyAdapter())`.
 *
 * The registry coordinates:
 * - Dynamic model detection from firmware string descriptors or discovery packets
 * - Instantiation of appropriate backend drivers via `createBackend()`
 * - UI catalog queries for dynamic model dropdowns, input hints, and validation
 * - Custom connection strategies
 */

import type { BackendInitOptions, PrinterCatalogItem } from '@shared/types/printer-backend/index.js';
import type { BasePrinterBackend } from '../BasePrinterBackend.js';
import { AD5XAdapter } from './builtins/AD5XAdapter.js';
import { Adventurer5MAdapter } from './builtins/Adventurer5MAdapter.js';
import { Adventurer5MProAdapter } from './builtins/Adventurer5MProAdapter.js';
import { BambuA1MiniAdapter } from './builtins/BambuA1MiniAdapter.js';
import { Creator5ProAdapter } from './builtins/Creator5ProAdapter.js';
import { GenericLegacyAdapter } from './builtins/GenericLegacyAdapter.js';
import type { PrinterAdapter } from './PrinterAdapter.js';

export class PrinterAdapterRegistry {
  private static instance: PrinterAdapterRegistry | null = null;

  /** Map of adapter id -> PrinterAdapter */
  private readonly adaptersById = new Map<string, PrinterAdapter>();

  /** Ordered list for detection evaluation */
  private detectionOrder: PrinterAdapter[] = [];

  private constructor() {
    this.registerBuiltinAdapters();
  }

  /**
   * Get singleton registry instance
   */
  public static getInstance(): PrinterAdapterRegistry {
    if (!PrinterAdapterRegistry.instance) {
      PrinterAdapterRegistry.instance = new PrinterAdapterRegistry();
    }
    return PrinterAdapterRegistry.instance;
  }

  /**
   * Register default built-in adapters in order of detection specificity
   */
  private registerBuiltinAdapters(): void {
    // Specific non-FlashForge protocols first
    this.registerInternal(new BambuA1MiniAdapter());

    // Specific modern FlashForge models
    this.registerInternal(new Creator5ProAdapter());
    this.registerInternal(new AD5XAdapter());
    this.registerInternal(new Adventurer5MProAdapter());
    this.registerInternal(new Adventurer5MAdapter());

    // Legacy fallback at the end
    this.registerInternal(new GenericLegacyAdapter());
  }

  private registerInternal(adapter: PrinterAdapter, prioritize = false): void {
    const id = adapter.definition.id;
    this.adaptersById.set(id, adapter);

    // Keep fallback at the very end of detectionOrder
    const isFallback = id === 'generic-legacy';
    this.detectionOrder = this.detectionOrder.filter((a) => a.definition.id !== id);

    if (isFallback) {
      this.detectionOrder.push(adapter);
    } else if (prioritize) {
      this.detectionOrder.unshift(adapter);
    } else {
      const fallbackIdx = this.detectionOrder.findIndex((a) => a.definition.id === 'generic-legacy');
      if (fallbackIdx >= 0) {
        this.detectionOrder.splice(fallbackIdx, 0, adapter);
      } else {
        this.detectionOrder.push(adapter);
      }
    }
  }

  /**
   * Register a new printer adapter.
   * Custom adapters take high priority in detection evaluation.
   *
   * @param adapter - Adapter implementing `PrinterAdapter`
   */
  public register(adapter: PrinterAdapter): void {
    console.log(`[PrinterAdapterRegistry] Registering printer adapter: ${adapter.definition.displayName} (${adapter.definition.id})`);
    this.registerInternal(adapter, true);
  }

  /**
   * Unregister an adapter by its ID
   */
  public unregister(id: string): boolean {
    if (id === 'generic-legacy') {
      console.warn('[PrinterAdapterRegistry] Cannot unregister default generic legacy fallback adapter');
      return false;
    }
    const had = this.adaptersById.delete(id);
    this.detectionOrder = this.detectionOrder.filter((a) => a.definition.id !== id);
    return had;
  }

  /**
   * Retrieve an adapter by its ID
   */
  public getById(id: string): PrinterAdapter | undefined {
    return this.adaptersById.get(id);
  }

  /**
   * Get all registered adapters in detection order
   */
  public getAll(): readonly PrinterAdapter[] {
    return [...this.detectionOrder];
  }

  /**
   * Find matching adapter for a given printer type name or discovery spec
   */
  public findMatchingAdapter(
    typeName?: string | null,
    hints?: { ipAddress?: string; rawData?: unknown }
  ): PrinterAdapter | undefined {
    if (!typeName || typeName.trim() === '') {
      return this.adaptersById.get('generic-legacy');
    }

    const clean = typeName.trim();

    // 1. Check direct ID match first
    const directMatch = this.adaptersById.get(clean);
    if (directMatch) {
      return directMatch;
    }

    // 2. Evaluate canHandle predicates across registered adapters
    for (const adapter of this.detectionOrder) {
      if (adapter.definition.id === 'generic-legacy') {
        continue; // check fallback last
      }
      try {
        if (adapter.canHandle(clean, hints)) {
          return adapter;
        }
      } catch (err) {
        console.warn(`[PrinterAdapterRegistry] Error evaluating adapter ${adapter.definition.id}:`, err);
      }
    }

    // 3. Fall back to generic legacy
    return this.adaptersById.get('generic-legacy');
  }

  /**
   * Detect model identifier from a printer type name
   */
  public detectModelType(typeName?: string | null): string {
    const adapter = this.findMatchingAdapter(typeName);
    return adapter?.definition.id ?? 'generic-legacy';
  }

  /**
   * Get human-readable display name for a model identifier
   */
  public getDisplayName(modelType: string): string {
    const adapter = this.adaptersById.get(modelType) || this.findMatchingAdapter(modelType);
    return adapter?.definition.displayName ?? modelType;
  }

  /**
   * Instantiate backend driver for the given model identifier
   */
  public createBackend(modelType: string, options: BackendInitOptions): BasePrinterBackend {
    const adapter = this.adaptersById.get(modelType) || this.findMatchingAdapter(modelType);
    if (adapter) {
      return adapter.createBackend(options);
    }

    console.warn(`[PrinterAdapterRegistry] Unknown printer model: ${modelType}, falling back to generic legacy`);
    const fallback = this.adaptersById.get('generic-legacy')!;
    return fallback.createBackend({
      ...options,
      printerModel: 'generic-legacy',
    });
  }

  /**
   * Export the catalog of all supported models for UI forms and API endpoints
   */
  public getModelCatalog(): PrinterCatalogItem[] {
    return this.detectionOrder.map((adapter) => ({
      ...adapter.definition,
      available: true,
    }));
  }
}

/**
 * Convenient accessor function for the singleton registry
 */
export const getPrinterAdapterRegistry = (): PrinterAdapterRegistry => {
  return PrinterAdapterRegistry.getInstance();
};

/**
 * Global helper to register a new printer adapter
 */
export const registerPrinterAdapter = (adapter: PrinterAdapter): void => {
  PrinterAdapterRegistry.getInstance().register(adapter);
};

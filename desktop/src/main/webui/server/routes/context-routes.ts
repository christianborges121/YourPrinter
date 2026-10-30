/**
 * @fileoverview Printer context and fleet management routes (list, add, configure, remove, and switch printers).
 */

import type { PrinterDetails } from '@shared/types/printer.js';
import { StandardAPIResponse } from '@shared/types/web-api.types.js';
import type { Response, Router } from 'express';
import { getPrinterDetailsManager } from '../../../managers/PrinterDetailsManager.js';
import { getPrinterAdapterRegistry } from '../../../printer-backends/adapters/index.js';
import { getMultiContextPollingCoordinator } from '../../../services/MultiContextPollingCoordinator.js';
import { toAppError } from '../../../utils/error.utils.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import type { RouteDependencies } from './route-helpers.js';

export function registerContextRoutes(router: Router, deps: RouteDependencies): void {
  /**
   * GET /api/contexts
   * Backward-compatible context list endpoint
   */
  router.get('/contexts', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const allContexts = deps.contextManager.getAllContexts();
      const activeContextId = deps.contextManager.getActiveContextId();

      const contexts = allContexts.map((context) => ({
        id: context.id,
        name: context.printerDetails.Name,
        model: context.printerDetails.printerModel || 'Unknown',
        ipAddress: context.printerDetails.IPAddress,
        serialNumber: context.printerDetails.SerialNumber,
        isActive: context.id === activeContextId,
      }));

      return res.json({
        success: true,
        contexts,
        activeContextId,
      });
    } catch (error) {
      const appError = toAppError(error);
      const response: StandardAPIResponse = {
        success: false,
        error: appError.message,
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/contexts/switch
   * Switch the active printer context
   */
  router.post('/contexts/switch', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contextId } = req.body as { contextId?: string };

      if (!contextId || typeof contextId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Context ID is required',
        });
      }

      const context = deps.contextManager.getContext(contextId);
      if (!context) {
        return res.status(404).json({
          success: false,
          error: `Context ${contextId} not found`,
        });
      }

      deps.contextManager.switchContext(contextId);
      return res.json({
        success: true,
        message: `Switched to printer: ${context.printerDetails.Name}`,
      });
    } catch (error) {
      const appError = toAppError(error);
      const response: StandardAPIResponse = {
        success: false,
        error: appError.message,
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/printers
   * Comprehensive fleet list: all saved printers combined with runtime context statuses.
   * Keyed by distinct printer name so duplicate IPs/hardware can be monitored simultaneously.
   */
  router.get('/printers', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();
      const allContexts = deps.contextManager.getAllContexts();
      const activeContextId = deps.contextManager.getActiveContextId();
      const activeContext = deps.contextManager.getActiveContext();
      const pollingCoordinator = getMultiContextPollingCoordinator();

      const printersMap = new Map<string, Record<string, unknown>>();

      // 1. Add saved printers (keyed by distinct printer Name)
      for (const saved of savedPrinters) {
        const name = saved.Name;
        const ctx = allContexts.find(
          (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === name.trim().toLowerCase()) ||
                 (c.name && c.name.trim().toLowerCase() === name.trim().toLowerCase())
        );

        const ctxId = ctx ? ctx.id : null;
        const pollData = ctxId && !saved.disabled ? pollingCoordinator.getPollingDataForContext(ctxId) : null;
        const pStatus = pollData?.printerStatus ?? null;
        const printerState = pStatus?.printerState || (pStatus as any)?.machineStatus || (pStatus as any)?.state || null;
        const rawProg = typeof pStatus?.currentJob?.progress?.percentage === 'number'
          ? pStatus.currentJob.progress.percentage
          : typeof (pStatus as any)?.progress === 'number'
          ? (pStatus as any).progress
          : null;
        const printProgress = rawProg !== null && rawProg > 0 && rawProg <= 1.0 ? rawProg * 100 : rawProg;
        const jobName = pStatus?.currentJob?.fileName || (pStatus as any)?.jobName || null;

        printersMap.set(name, {
          name: saved.Name,
          serialNumber: saved.SerialNumber,
          ipAddress: saved.IPAddress,
          checkCode: saved.CheckCode || '',
          model: saved.printerModel || 'Creator 5 Pro',
          clientType: saved.ClientType || 'new',
          isConnected: Boolean(ctx && ctx.connectionState === 'connected'),
          isActive: Boolean(ctx && ctx.id === activeContextId),
          contextId: ctxId,
          printerState,
          printProgress,
          jobName,
          lastConnected: saved.lastConnected || null,
          customCameraEnabled: saved.customCameraEnabled,
          customCameraUrl: saved.customCameraUrl,
          disabled: Boolean(saved.disabled),
        });
      }

      // 2. Add any active contexts not yet in saved printers
      for (const ctx of allContexts) {
        const name = ctx.printerDetails.Name || ctx.name || ctx.id;
        if (!printersMap.has(name)) {
          printersMap.set(name, {
            name,
            serialNumber: ctx.printerDetails.SerialNumber || ctx.id,
            ipAddress: ctx.printerDetails.IPAddress,
            checkCode: ctx.printerDetails.CheckCode || '',
            model: ctx.printerDetails.printerModel || 'Creator 5 Pro',
            clientType: ctx.printerDetails.ClientType || 'new',
            isConnected: ctx.connectionState === 'connected',
            isActive: ctx.id === activeContextId,
            contextId: ctx.id,
            lastConnected: ctx.lastActivity || null,
          });
        }
      }

      return res.json({
        success: true,
        printers: Array.from(printersMap.values()),
        activeContextId,
        activeName: activeContext?.printerDetails.Name || activeContext?.name || null,
        activeSerial: activeContext?.printerDetails.SerialNumber || null,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * GET /api/printers/overview
   * Returns all fleet printers enriched with live cached telemetry and camera availability
   * for the Multi-Printer Fleet Dashboard view.
   */
  router.get('/printers/overview', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();
      const allContexts = deps.contextManager.getAllContexts();
      const activeContextId = deps.contextManager.getActiveContextId();
      const pollingCoordinator = getMultiContextPollingCoordinator();

      const buildOverviewItem = (
        name: string,
        serialNumber: string,
        ipAddress: string,
        model: string,
        ctx: (typeof allContexts)[number] | undefined,
        disabled = false
      ) => {
        const contextId = ctx ? ctx.id : null;
        const isConnected = Boolean(!disabled && ctx && ctx.connectionState === 'connected');
        const isActive = Boolean(!disabled && ctx && ctx.id === activeContextId);
        const pollingData = contextId && !disabled ? pollingCoordinator.getPollingDataForContext(contextId) : null;
        const rawStatus = pollingData?.printerStatus ?? null;
        const materialStation = pollingData?.materialStation ?? null;
        const hasCamera = contextId && !disabled ? deps.backendManager.isFeatureAvailable(contextId, 'camera') : false;

        const extruder = rawStatus?.extruders?.[0];
        const rawAny = rawStatus as any;
        const rawBackend = (rawAny?.rawBackendData || rawAny) as Record<string, any> | null;

        const bedCurrent =
          rawStatus?.temperatures?.bed?.current ??
          (typeof rawAny?.bedTemperature === 'number'
            ? rawAny.bedTemperature
            : (rawAny?.bedTemperature?.current ?? 0));

        const bedTarget =
          rawStatus?.temperatures?.bed?.target ??
          (typeof rawAny?.bedTargetTemperature === 'number'
            ? rawAny.bedTargetTemperature
            : (rawAny?.bedTemperature?.target ?? 0));

        const nozzleCurrent =
          rawStatus?.temperatures?.extruder?.current ??
          (typeof rawAny?.nozzleTemperature === 'number'
            ? rawAny.nozzleTemperature
            : (extruder?.temperature?.current ?? 0));

        const nozzleTarget =
          rawStatus?.temperatures?.extruder?.target ??
          (typeof rawAny?.nozzleTargetTemperature === 'number'
            ? rawAny.nozzleTargetTemperature
            : (extruder?.temperature?.target ?? 0));

        const toolTemps = Array.isArray(rawBackend?.toolTemps)
          ? (rawBackend!.toolTemps as number[])
          : (rawStatus?.extruders ? rawStatus.extruders.map((e: any) => e.temperature?.current ?? 0) : undefined);

        const toolTargetTemps = Array.isArray(rawBackend?.toolTargetTemps)
          ? (rawBackend!.toolTargetTemps as number[])
          : (rawStatus?.extruders ? rawStatus.extruders.map((e: any) => e.temperature?.target ?? 0) : undefined);

        const rawOverviewProg = rawStatus?.currentJob?.progress?.percentage ?? rawAny?.progress ?? 0;
        const normOverviewProg = rawOverviewProg > 0 && rawOverviewProg <= 1.0 ? rawOverviewProg * 100 : rawOverviewProg;
        const statusSummary = rawStatus
          ? {
              printerState: rawStatus.state ?? (rawAny?.printerState || 'Ready'),
              bedTemperature: bedCurrent,
              bedTargetTemperature: bedTarget,
              nozzleTemperature: nozzleCurrent,
              nozzleTargetTemperature: nozzleTarget,
              toolTemps,
              toolTargetTemps,
              progress: Math.round(normOverviewProg),
              currentLayer: rawStatus.currentJob?.progress?.currentLayer ?? rawAny?.currentLayer ?? null,
              totalLayers: rawStatus.currentJob?.progress?.totalLayers ?? rawAny?.totalLayers ?? null,
              jobName: rawStatus.currentJob?.fileName ?? rawAny?.jobName ?? rawAny?.currentJob ?? null,
              formattedEta: rawStatus.currentJob?.progress?.formattedEta ?? rawAny?.formattedEta ?? null,
              timeRemaining: rawStatus.currentJob?.progress?.timeRemaining ?? rawAny?.timeRemaining ?? null,
              thumbnailData: pollingData?.thumbnailData ?? null,
            }
          : null;

        return {
          name,
          serialNumber,
          ipAddress,
          model,
          isConnected,
          isActive,
          contextId,
          hasCamera,
          cameraSnapshotUrl: hasCamera && contextId ? `/api/camera/snapshot?contextId=${encodeURIComponent(contextId)}` : null,
          status: statusSummary,
          materialStation,
          disabled,
        };
      };

      const overviewMap = new Map<string, ReturnType<typeof buildOverviewItem>>();

      for (const saved of savedPrinters) {
        const ctx = allContexts.find(
          (c) =>
            (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === saved.Name.trim().toLowerCase()) ||
            (c.name && c.name.trim().toLowerCase() === saved.Name.trim().toLowerCase()) ||
            c.printerDetails.SerialNumber === saved.SerialNumber
        );
        overviewMap.set(
          saved.Name,
          buildOverviewItem(
            saved.Name,
            saved.SerialNumber,
            saved.IPAddress,
            saved.printerModel || 'Creator 5 Pro',
            ctx,
            Boolean(saved.disabled)
          )
        );
      }

      for (const ctx of allContexts) {
        const name = ctx.printerDetails.Name || ctx.name || ctx.id;
        if (!overviewMap.has(name)) {
          overviewMap.set(
            name,
            buildOverviewItem(
              name,
              ctx.printerDetails.SerialNumber || ctx.id,
              ctx.printerDetails.IPAddress,
              ctx.printerDetails.printerModel || 'Creator 5 Pro',
              ctx
            )
          );
        }
      }

      return res.json({
        success: true,
        printers: Array.from(overviewMap.values()),
        totalConfigured: savedPrinters.length,
        activeContextId,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * GET /api/printers/models
   * Returns the catalog of supported printer models from the extensible adapter registry.
   */
  router.get('/printers/models', (_req: AuthenticatedRequest, res: Response) => {
    try {
      const models = getPrinterAdapterRegistry().getModelCatalog();
      return res.json({
        success: true,
        models,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * POST /api/printers
   * Add a new printer to the fleet.
   * Requires a distinct printer name. Allows duplicate IPs for testing multi-printer abilities with 1 printer only.
   */
  router.post('/printers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, ipAddress, checkCode, serialNumber, model, connectNow } = req.body as {
        name?: string;
        ipAddress?: string;
        checkCode?: string;
        serialNumber?: string;
        model?: string;
        connectNow?: boolean;
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Printer name is required' });
      }

      if (!ipAddress || typeof ipAddress !== 'string' || ipAddress.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'IP Address is required' });
      }

      const cleanName = name.trim();
      const cleanIp = ipAddress.trim();
      const cleanModel = (model && model.trim()) || 'Creator 5 Pro';
      const cleanCheckCode = (checkCode && checkCode.trim()) || '';

      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      // Enforce distinct printer names (case-insensitive)
      const nameLower = cleanName.toLowerCase();
      const nameTaken = savedPrinters.some((p) => p.Name.trim().toLowerCase() === nameLower);
      if (nameTaken) {
        return res.status(400).json({
          success: false,
          error: `A printer named "${cleanName}" already exists. Each printer must have a distinct name.`,
        });
      }

      // Allow duplicate IPs for testing multi-printer setups with 1 physical printer.
      // Generate a unique internal SerialNumber key so dictionary storage won't overwrite:
      const baseSerial = (serialNumber && serialNumber.trim()) || `SN-${cleanIp.replace(/\./g, '')}`;
      let cleanSerial = baseSerial;
      const serialExists = savedPrinters.some((p) => p.SerialNumber === cleanSerial);
      if (serialExists) {
        const nameSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 10);
        cleanSerial = `${baseSerial}-${nameSlug || Date.now().toString().slice(-4)}`;
      }

      const printerDetails: PrinterDetails = {
        Name: cleanName,
        IPAddress: cleanIp,
        SerialNumber: cleanSerial,
        CheckCode: cleanCheckCode,
        ClientType: 'new',
        printerModel: cleanModel,
      };

      await detailsManager.savePrinter(printerDetails);

      let connectionSuccess = false;
      let contextId: string | null = null;
      let connectionError: string | null = null;

      if (connectNow !== false) {
        try {
          const adapter = getPrinterAdapterRegistry().findMatchingAdapter(cleanModel);
          const connectResult = adapter?.connect
            ? await deps.connectionManager.connectWithSavedDetails(printerDetails)
            : await deps.connectionManager.connectDirectlyToIP(cleanIp);
          if (connectResult.success) {
            connectionSuccess = true;
            const allContexts = deps.contextManager.getAllContexts();
            let match = allContexts.find(
              (c) => c.printerDetails.Name.trim().toLowerCase() === nameLower || c.name.trim().toLowerCase() === nameLower
            );
            if (!match) {
              match = allContexts.find((c) => c.printerDetails.IPAddress === cleanIp);
              if (match) {
                match.name = cleanName;
                match.printerDetails.Name = cleanName;
                match.printerDetails.SerialNumber = cleanSerial;
              }
            }
            if (match) {
              contextId = match.id;
              deps.contextManager.switchContext(match.id);
            }
          } else {
            connectionError = connectResult.error || 'Could not connect to printer at this IP address.';
          }
        } catch (err: unknown) {
          const errApp = toAppError(err);
          connectionError = errApp.message || 'Connection attempt failed';
        }
      }

      return res.json({
        success: true,
        printer: printerDetails,
        connected: connectionSuccess,
        contextId,
        connectionError,
        message: connectionSuccess
          ? `Added and connected to ${cleanName}!`
          : `Printer ${cleanName} saved.${connectionError ? ` Note: ${connectionError}` : ''}`,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * PUT /api/printers/:identifier
   * Configure settings for a printer in the fleet (identified by printer name or serial)
   */
  router.put('/printers/:identifier', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier).trim();
      const updates = req.body as Partial<PrinterDetails>;

      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      const existing = savedPrinters.find(
        (p) => p.Name.trim().toLowerCase() === identifier.toLowerCase()
      ) || detailsManager.getSavedPrinter(identifier);

      if (!existing) {
        return res.status(404).json({ success: false, error: `Printer "${identifier}" not found` });
      }

      // If Name is being changed, ensure distinct name requirement
      if (updates.Name !== undefined) {
        const newName = updates.Name.trim();
        if (newName.length === 0) {
          return res.status(400).json({ success: false, error: 'Printer name is required' });
        }
        if (newName.toLowerCase() !== existing.Name.trim().toLowerCase()) {
          const isTaken = savedPrinters.some(
            (p) => p !== existing && p.Name.trim().toLowerCase() === newName.toLowerCase()
          );
          if (isTaken) {
            return res.status(400).json({
              success: false,
              error: `A printer named "${newName}" already exists. Each printer must have a distinct name.`,
            });
          }
        }
      }

      const updatedName = updates.Name ? updates.Name.trim() : existing.Name;
      const updatedIp = updates.IPAddress ? updates.IPAddress.trim() : existing.IPAddress;

      const updatedDetails: StoredPrinterDetails = {
        ...existing,
        ...updates,
        Name: updatedName,
        IPAddress: updatedIp,
        disabled: updates.disabled !== undefined ? Boolean(updates.disabled) : Boolean(existing.disabled),
      };

      await detailsManager.savePrinter(updatedDetails);

      // If active context matches, update runtime context details
      const allContexts = deps.contextManager.getAllContexts();
      const ctx = allContexts.find(
        (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === existing.Name.trim().toLowerCase()) ||
               (c.name && c.name.trim().toLowerCase() === existing.Name.trim().toLowerCase()) ||
               c.printerDetails.SerialNumber === existing.SerialNumber
      );
      if (updatedDetails.disabled && ctx) {
        try {
          await deps.backendManager.disconnectBackend(ctx.id);
          deps.contextManager.removeContext(ctx.id);
        } catch (e) {
          console.warn('[ContextRoutes] Error disconnecting disabled printer context:', e);
        }
      } else if (ctx) {
        ctx.name = updatedName;
        ctx.printerDetails.Name = updatedName;
        ctx.printerDetails.IPAddress = updatedIp;
        if (updates.CheckCode !== undefined) ctx.printerDetails.CheckCode = updates.CheckCode;
        if (updates.printerModel) ctx.printerDetails.printerModel = updates.printerModel;
        if (updates.customCameraEnabled !== undefined) {
          ctx.printerDetails.customCameraEnabled = updates.customCameraEnabled;
        }
        if (updates.customCameraUrl !== undefined) {
          ctx.printerDetails.customCameraUrl = updates.customCameraUrl;
        }
        if (typeof (deps.contextManager as any).updatePrinterDetails === 'function') {
          (deps.contextManager as any).updatePrinterDetails(ctx.id, ctx.printerDetails);
        }
      }

      return res.json({
        success: true,
        message: `Updated settings for printer ${updatedName}`,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * DELETE /api/printers/:identifier
   * Remove a printer from the fleet (identified by printer name or serial)
   */
  router.delete('/printers/:identifier', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier).trim();
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      const existing = savedPrinters.find(
        (p) => p.Name.trim().toLowerCase() === identifier.toLowerCase()
      ) || detailsManager.getSavedPrinter(identifier);

      if (!existing) {
        return res.status(404).json({ success: false, error: `Printer "${identifier}" not found` });
      }

      // 1. If there's an active context matching this printer, remove/disconnect it
      const allContexts = deps.contextManager.getAllContexts();
      const ctx = allContexts.find(
        (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === existing.Name.trim().toLowerCase()) ||
               (c.name && c.name.trim().toLowerCase() === existing.Name.trim().toLowerCase()) ||
               c.printerDetails.SerialNumber === existing.SerialNumber
      );
      if (ctx) {
        try {
          await deps.connectionManager.disconnectContext(ctx.id);
        } catch (err) {
          console.warn(`Could not disconnect context for ${existing.Name}:`, err);
          try {
            deps.contextManager.removeContext(ctx.id);
          } catch {
            // ignore
          }
        }
      }

      // 2. Remove from saved config
      await detailsManager.removePrinter(existing.SerialNumber);

      // 3. Switch to another context if one exists
      const remainingContexts = deps.contextManager.getAllContexts();
      if (remainingContexts.length > 0) {
        deps.contextManager.switchContext(remainingContexts[0].id);
      }

      return res.json({
        success: true,
        message: `Printer ${existing.Name} removed successfully`,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * POST /api/printers/:identifier/enable
   * Enable a printer in the fleet
   */
  router.post('/printers/:identifier/enable', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier).trim();
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      const existing = savedPrinters.find(
        (p) => p.Name.trim().toLowerCase() === identifier.toLowerCase()
      ) || detailsManager.getSavedPrinter(identifier);

      if (!existing) {
        return res.status(404).json({ success: false, error: `Printer "${identifier}" not found` });
      }

      const updatedDetails: StoredPrinterDetails = {
        ...existing,
        disabled: false,
      };

      await detailsManager.savePrinter(updatedDetails);

      return res.json({
        success: true,
        message: `Printer "${existing.Name}" enabled successfully`,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * POST /api/printers/:identifier/disable
   * Disable a printer in the fleet and disconnect its runtime context
   */
  router.post('/printers/:identifier/disable', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier).trim();
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      const existing = savedPrinters.find(
        (p) => p.Name.trim().toLowerCase() === identifier.toLowerCase()
      ) || detailsManager.getSavedPrinter(identifier);

      if (!existing) {
        return res.status(404).json({ success: false, error: `Printer "${identifier}" not found` });
      }

      const updatedDetails: StoredPrinterDetails = {
        ...existing,
        disabled: true,
      };

      await detailsManager.savePrinter(updatedDetails);

      // Disconnect runtime context if connected
      const allContexts = deps.contextManager.getAllContexts();
      const ctx = allContexts.find(
        (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === existing.Name.trim().toLowerCase()) ||
               (c.name && c.name.trim().toLowerCase() === existing.Name.trim().toLowerCase()) ||
               c.printerDetails.SerialNumber === existing.SerialNumber
      );

      if (ctx) {
        try {
          await deps.backendManager.disconnectBackend(ctx.id);
          deps.contextManager.removeContext(ctx.id);
        } catch (disconnectErr) {
          console.warn(`[ContextRoutes] Error disconnecting disabled printer context ${ctx.id}:`, disconnectErr);
        }
      }

      return res.json({
        success: true,
        message: `Printer "${existing.Name}" disabled successfully`,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * POST /api/printers/:identifier/connect
   * Connect to an existing saved printer (identified by printer name or serial)
   */
  router.post('/printers/:identifier/connect', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier).trim();
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      const saved = savedPrinters.find(
        (p) => p.Name.trim().toLowerCase() === identifier.toLowerCase()
      ) || detailsManager.getSavedPrinter(identifier);

      if (!saved) {
        return res.status(404).json({ success: false, error: `Saved printer "${identifier}" not found` });
      }

      if (saved.disabled) {
        return res.status(400).json({ success: false, error: `Printer "${saved.Name}" is disabled. Enable it in Settings first.` });
      }

      const isBambu = /bambu|a1\s*mini/i.test(saved.printerModel || '');
      const connectResult = isBambu
        ? await deps.connectionManager.connectWithSavedDetails(saved)
        : await deps.connectionManager.connectDirectlyToIP(saved.IPAddress);
      if (!connectResult.success) {
        return res.status(400).json({ success: false, error: connectResult.error || 'Failed to connect to printer' });
      }

      const allContexts = deps.contextManager.getAllContexts();
      let ctx = allContexts.find(
        (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === saved.Name.trim().toLowerCase()) ||
               (c.name && c.name.trim().toLowerCase() === saved.Name.trim().toLowerCase())
      );
      if (!ctx) {
        ctx = allContexts.find((c) => c.printerDetails.IPAddress === saved.IPAddress);
        if (ctx) {
          ctx.name = saved.Name;
          ctx.printerDetails.Name = saved.Name;
          ctx.printerDetails.SerialNumber = saved.SerialNumber;
        }
      }
      if (ctx) {
        deps.contextManager.switchContext(ctx.id);
      }

      return res.json({
        success: true,
        message: `Connected to ${saved.Name} (${saved.IPAddress})`,
        contextId: ctx ? ctx.id : null,
      });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });

  /**
   * POST /api/printers/:identifier/select
   * Select / switch to a printer by distinct printer name or serial number
   */
  router.post('/printers/:identifier/select', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier).trim();
      const allContexts = deps.contextManager.getAllContexts();
      const detailsManager = getPrinterDetailsManager();
      const savedPrinters = detailsManager.getAllSavedPrinters();

      const saved = savedPrinters.find(
        (p) => p.Name.trim().toLowerCase() === identifier.toLowerCase()
      ) || detailsManager.getSavedPrinter(identifier);

      const targetName = saved ? saved.Name : identifier;

      if (saved && saved.disabled) {
        return res.status(400).json({ success: false, error: `Printer "${saved.Name}" is disabled. Enable it in Settings first.` });
      }

      // 1. Look for existing context by printer name
      let ctx = allContexts.find(
        (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === targetName.trim().toLowerCase()) ||
               (c.name && c.name.trim().toLowerCase() === targetName.trim().toLowerCase())
      );

      if (!ctx && saved) {
        ctx = allContexts.find((c) => c.printerDetails.SerialNumber === saved.SerialNumber);
      }

      if (ctx) {
        deps.contextManager.switchContext(ctx.id);
        return res.json({ success: true, message: `Switched to printer ${ctx.printerDetails.Name}` });
      }

      // 2. If no existing context, connect to the printer
      if (saved) {
        const isBambu = /bambu|a1\s*mini/i.test(saved.printerModel || '');
        const connectResult = isBambu
          ? await deps.connectionManager.connectWithSavedDetails(saved)
          : await deps.connectionManager.connectDirectlyToIP(saved.IPAddress);
        if (connectResult.success) {
          const updatedContexts = deps.contextManager.getAllContexts();
          let newCtx = updatedContexts.find(
            (c) => (c.printerDetails.Name && c.printerDetails.Name.trim().toLowerCase() === targetName.trim().toLowerCase()) ||
                   (c.name && c.name.trim().toLowerCase() === targetName.trim().toLowerCase())
          );
          if (!newCtx) {
            newCtx = updatedContexts.find((c) => c.printerDetails.IPAddress === saved.IPAddress);
            if (newCtx) {
              newCtx.name = saved.Name;
              newCtx.printerDetails.Name = saved.Name;
              newCtx.printerDetails.SerialNumber = saved.SerialNumber;
            }
          }
          if (newCtx) deps.contextManager.switchContext(newCtx.id);
          return res.json({ success: true, message: `Connected and switched to ${saved.Name}` });
        } else {
          return res.status(400).json({ success: false, error: connectResult.error || 'Printer is currently unreachable' });
        }
      }

      return res.status(404).json({ success: false, error: `Printer "${identifier}" not found` });
    } catch (error) {
      const appError = toAppError(error);
      return res.status(500).json({ success: false, error: appError.message });
    }
  });
}

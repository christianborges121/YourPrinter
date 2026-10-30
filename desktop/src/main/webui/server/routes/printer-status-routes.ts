/**
 * @fileoverview Printer status and capability API route registrations for the WebUI server.
 *
 * Handles status polling, feature discovery, and material station insight endpoints with
 * shared context resolution so browser clients can query different printers independently.
 */

import {
  MaterialStationStatusResponse,
  PrinterFeatures,
  PrinterStatusResponse,
  StandardAPIResponse,
} from '@shared/types/web-api.types.js';
import type { Response, Router } from 'express';
import { getWatchdogService } from '../../../services/WatchdogService.js';
import { toAppError } from '../../../utils/error.utils.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers.js';

interface ExtendedPrinterStatus {
  readonly printerState: string;
  readonly bedTemperature: number;
  readonly nozzleTemperature: number;
  readonly progress: number;
  readonly currentJob?: string;
  readonly estimatedTime?: number;
  readonly remainingTime?: number;
  readonly currentLayer?: number;
  readonly totalLayers?: number;
  readonly bedTargetTemperature?: number;
  readonly nozzleTargetTemperature?: number;
  readonly printDuration?: number;
  readonly machineInfo?: {
    readonly PrintBed?: {
      readonly set?: number;
    };
    readonly Extruder?: {
      readonly set?: number;
    };
  };
  readonly filtration?: {
    readonly mode?: 'external' | 'internal' | 'none';
  };
  readonly estimatedRightLen?: number;
  readonly estimatedRightWeight?: number;
  readonly cumulativeFilament?: number;
  readonly cumulativePrintTime?: number;
  readonly printEta?: string;
}

export function registerPrinterStatusRoutes(router: Router, deps: RouteDependencies): void {
  router.get('/printer/status', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<PrinterStatusResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const { contextId } = contextResult;
      const statusResult = await deps.backendManager.getPrinterStatus(contextId);

      if (!statusResult.success || !statusResult.status) {
        return sendErrorResponse<PrinterStatusResponse>(res, 500, statusResult.error || 'Failed to get printer status');
      }

      let bedTargetTemp = 0;
      let nozzleTargetTemp = 0;
      let filtrationMode: 'external' | 'internal' | 'none' = 'none';
      let estimatedWeight: number | undefined;
      let estimatedLength: number | undefined;
      let timeElapsed: number | undefined;
      let elapsedTimeSeconds: number | undefined;
      let formattedEta: string | undefined;
      let cumulativeFilament: number | undefined;
      let cumulativePrintTime: number | undefined;

      if (isExtendedPrinterStatus(statusResult.status)) {
        bedTargetTemp = statusResult.status.bedTargetTemperature || statusResult.status.machineInfo?.PrintBed?.set || 0;
        nozzleTargetTemp =
          statusResult.status.nozzleTargetTemperature || statusResult.status.machineInfo?.Extruder?.set || 0;

        filtrationMode =
          ((statusResult.status as Record<string, unknown>).filtrationMode as 'external' | 'internal' | 'none') ||
          statusResult.status.filtration?.mode ||
          'none';
        estimatedWeight = statusResult.status.estimatedRightWeight;
        estimatedLength = statusResult.status.estimatedRightLen
          ? statusResult.status.estimatedRightLen / 1000
          : undefined;
        // printDuration is raw seconds — convert to minutes for consistency with WebSocket path
        timeElapsed =
          statusResult.status.printDuration !== undefined
            ? Math.round(statusResult.status.printDuration / 60)
            : undefined;
        elapsedTimeSeconds = statusResult.status.printDuration;
        formattedEta = statusResult.status.printEta;

        if ('cumulativeFilament' in statusResult.status) {
          cumulativeFilament = statusResult.status.cumulativeFilament as number;
        }
        if ('cumulativePrintTime' in statusResult.status) {
          cumulativePrintTime = statusResult.status.cumulativePrintTime as number;
        }
      }

      const rawStatus = statusResult.status as Record<string, unknown>;
      const toolTemps = Array.isArray(rawStatus.toolTemps) && rawStatus.toolTemps.length > 0
        ? rawStatus.toolTemps.map((t: unknown) => (typeof t === 'number' ? Math.round(t) : typeof t === 'object' && t !== null ? Math.round((t as { current?: number }).current || 0) : 0))
        : undefined;
      const toolTargetTemps = Array.isArray(rawStatus.toolTargetTemps) && rawStatus.toolTargetTemps.length > 0
        ? rawStatus.toolTargetTemps.map((t: unknown) => (typeof t === 'number' ? Math.round(t) : typeof t === 'object' && t !== null ? Math.round((t as { set?: number; target?: number }).set ?? (t as { set?: number; target?: number }).target ?? 0) : 0))
        : Array.isArray(rawStatus.toolTemps) && rawStatus.toolTemps.length > 0 && rawStatus.toolTemps.some((t: unknown) => typeof t === 'object' && t !== null && ('set' in (t as object) || 'target' in (t as object)))
          ? rawStatus.toolTemps.map((t: unknown) => (typeof t === 'object' && t !== null ? Math.round((t as { set?: number; target?: number }).set ?? (t as { set?: number; target?: number }).target ?? 0) : 0))
          : undefined;

      if (toolTargetTemps && toolTargetTemps.length > 0 && toolTargetTemps.every(t => t === 0) && nozzleTargetTemp > 0) {
        toolTargetTemps[0] = Math.round(nozzleTargetTemp);
      }

      let normProgress = /completed|finish/i.test(statusResult.status.printerState || '') ? 100 : (statusResult.status.progress ?? 0);
      if (normProgress > 0 && normProgress <= 1.0) {
        normProgress = normProgress * 100;
      }

      const response: PrinterStatusResponse = {
        success: true,
        status: {
          printerState: statusResult.status.printerState,
          bedTemperature: statusResult.status.bedTemperature,
          bedTargetTemperature: bedTargetTemp,
          nozzleTemperature: statusResult.status.nozzleTemperature,
          nozzleTargetTemperature: nozzleTargetTemp,
          chamberTemperature: (statusResult.status as Record<string, unknown>).chamberTemperature as number | undefined,
          chamberTargetTemperature: (statusResult.status as Record<string, unknown>).chamberTargetTemperature as number | undefined,
          ledState: (rawStatus.ledState as boolean | undefined),
          coolingFanSpeed: (rawStatus.coolingFanSpeed as number | undefined),
          chamberFanSpeed: (rawStatus.chamberFanSpeed as number | undefined),
          toolTemps,
          toolTargetTemps,
          progress: normProgress,
          currentLayer: statusResult.status.currentLayer ?? 0,
          totalLayers: statusResult.status.totalLayers ?? 0,
          jobName: statusResult.status.currentJob || null,
          timeElapsed,
          timeRemaining: statusResult.status.remainingTime,
          filtrationMode,
          estimatedWeight,
          estimatedLength,
          cumulativeFilament,
          cumulativePrintTime,
          formattedEta,
          elapsedTimeSeconds,
          watchdog: await getWatchdogService().getStatus(contextId),
        },
      };

      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<PrinterStatusResponse>(res, 500, appError.message);
    }
  });

  router.get('/printer/features', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const { contextId } = contextResult;
      const features = deps.backendManager.getFeatures(contextId);

      if (!features) {
        return sendErrorResponse<StandardAPIResponse>(res, 500, 'Failed to get printer features');
      }

      const featureResponse: PrinterFeatures = {
        hasCamera: deps.backendManager.isFeatureAvailable(contextId, 'camera'),
        hasLED: deps.backendManager.isFeatureAvailable(contextId, 'led-control'),
        hasFiltration: deps.backendManager.isFeatureAvailable(contextId, 'filtration'),
        hasMaterialStation: deps.backendManager.isFeatureAvailable(contextId, 'material-station'),
        canPause: features.jobManagement.pauseResume,
        canResume: features.jobManagement.pauseResume,
        canCancel: features.jobManagement.cancelJobs,
        ledUsesLegacyAPI: features.ledControl.customControlEnabled || features.ledControl.usesLegacyAPI,
        capabilities: deps.backendManager.getNetworkCapabilities(contextId) || undefined,
      };

      return res.json({
        success: true,
        features: featureResponse,
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.get('/printer/capabilities', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const { contextId } = contextResult;
      const capabilities = deps.backendManager.getNetworkCapabilities(contextId);

      if (!capabilities) {
        return sendErrorResponse<StandardAPIResponse>(res, 500, 'Failed to get printer network capabilities');
      }

      return res.json({
        success: true,
        capabilities,
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.get('/printer/material-station', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<MaterialStationStatusResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const { contextId } = contextResult;
      if (!deps.backendManager.isFeatureAvailable(contextId, 'material-station')) {
        return res.status(200).json({
          success: false,
          error: 'Material station not available on this printer',
        } satisfies MaterialStationStatusResponse);
      }

      const status = deps.backendManager.getMaterialStationStatus(contextId);
      const response: MaterialStationStatusResponse = {
        success: true,
        status: status ?? null,
      };
      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<MaterialStationStatusResponse>(res, 500, appError.message);
    }
  });
}

function isExtendedPrinterStatus(status: unknown): status is ExtendedPrinterStatus {
  return typeof status === 'object' && status !== null;
}

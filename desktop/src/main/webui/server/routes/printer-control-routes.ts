/**
 * @fileoverview Printer control route registrations (movement, job control, LEDs, status operations).
 */

import { FiveMClient } from '@ghosttypes/ff-api';
import { StandardAPIResponse } from '@shared/types/web-api.types.js';
import type { Response, Router } from 'express';
import { toAppError } from '../../../utils/error.utils.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers.js';

type JobControlExecutor = (contextId: string) => Promise<{ success: boolean; error?: string }>;

interface JobControlRoute {
  readonly path: string;
  readonly executor: JobControlExecutor;
  readonly successMessage: string;
}

export function registerPrinterControlRoutes(router: Router, deps: RouteDependencies): void {
  const controlRoutes: readonly JobControlRoute[] = [
    {
      path: '/printer/control/home',
      executor: async (contextId) => deps.backendManager.executeGCodeCommand(contextId, '~G28'),
      successMessage: 'Homing axes...',
    },
    {
      path: '/printer/control/pause',
      executor: async (contextId) => deps.backendManager.pauseJob(contextId),
      successMessage: 'Print paused',
    },
    {
      path: '/printer/control/resume',
      executor: async (contextId) => deps.backendManager.resumeJob(contextId),
      successMessage: 'Print resumed',
    },
    {
      path: '/printer/control/cancel',
      executor: async (contextId) => deps.backendManager.cancelJob(contextId),
      successMessage: 'Print cancelled',
    },
  ];

  controlRoutes.forEach((route) => {
    router.post(route.path, async (req: AuthenticatedRequest, res: Response) => {
      try {
        const contextResult = resolveContext(req, deps, { requireBackendReady: true });
        if (!contextResult.success) {
          return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
        }

        const result = await route.executor(contextResult.contextId);
        const response: StandardAPIResponse = {
          success: result.success,
          message: result.success ? route.successMessage : undefined,
          error: result.error,
        };
        return res.status(result.success ? 200 : 500).json(response);
      } catch (error) {
        const appError = toAppError(error);
        return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
      }
    });
  });

  router.post('/printer/control/led-on', async (req: AuthenticatedRequest, res: Response) => {
    await handleLedControl(req, res, deps, true);
  });

  router.post('/printer/control/led-off', async (req: AuthenticatedRequest, res: Response) => {
    await handleLedControl(req, res, deps, false);
  });

  router.post('/printer/control/clear-status', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, {
        requireBackendReady: true,
        requireBackendInstance: true,
      });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const backend = contextResult.backend;
      if (!backend) {
        return sendErrorResponse<StandardAPIResponse>(res, 503, 'Backend not available');
      }

      let result = false;
      if (typeof (backend as unknown as { clearStatus?: () => Promise<boolean> }).clearStatus === 'function') {
        result = await (backend as unknown as { clearStatus: () => Promise<boolean> }).clearStatus();
      } else {
        const primaryClient = backend.getPrimaryClient();
        if (
          primaryClient &&
          typeof (primaryClient as unknown as { jobControl?: { clearPlatform?: () => Promise<boolean> } }).jobControl?.clearPlatform === 'function'
        ) {
          result = await (primaryClient as unknown as { jobControl: { clearPlatform: () => Promise<boolean> } }).jobControl.clearPlatform();
        } else {
          result = true;
        }
      }

      const response: StandardAPIResponse = {
        success: result,
        message: result ? 'Status cleared' : 'Error clearing status',
      };
      return res.status(result ? 200 : 500).json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.post('/printer/control/material/load', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true, requireBackendInstance: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }
      const backend = contextResult.backend as { loadAmsSlot?: (slotId: number, temp?: number) => Promise<{ success: boolean; error?: string }> };
      if (typeof backend.loadAmsSlot !== 'function') {
        return sendErrorResponse<StandardAPIResponse>(res, 400, 'Material loading not supported on this printer');
      }
      const { slotId, temp } = req.body as { slotId?: number; temp?: number };
      if (typeof slotId !== 'number') {
        return sendErrorResponse<StandardAPIResponse>(res, 400, 'Valid slotId (0-3) is required');
      }
      const result = await backend.loadAmsSlot(slotId, temp);
      return res.status(result.success ? 200 : 500).json({
        success: result.success,
        message: result.success ? `Loading slot ${slotId + 1}` : undefined,
        error: result.error,
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.post('/printer/control/material/unload', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true, requireBackendInstance: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }
      const backend = contextResult.backend as { unloadAms?: (temp?: number) => Promise<{ success: boolean; error?: string }> };
      if (typeof backend.unloadAms !== 'function') {
        return sendErrorResponse<StandardAPIResponse>(res, 400, 'Material unloading not supported on this printer');
      }
      const { temp } = req.body as { temp?: number };
      const result = await backend.unloadAms(temp);
      return res.status(result.success ? 200 : 500).json({
        success: result.success,
        message: result.success ? 'Unloading filament' : undefined,
        error: result.error,
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });
}

async function handleLedControl(
  req: AuthenticatedRequest,
  res: Response,
  deps: RouteDependencies,
  enabled: boolean
): Promise<Response | void> {
  try {
    const contextResult = resolveContext(req, deps, {
      requireBackendReady: true,
      requireBackendInstance: true,
    });
    if (!contextResult.success) {
      return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
    }

    const { contextId, backend } = contextResult;
    if (!backend) {
      return sendErrorResponse<StandardAPIResponse>(res, 503, 'Backend not available');
    }
    if (!deps.backendManager.isFeatureAvailable(contextId, 'led-control')) {
      return sendErrorResponse<StandardAPIResponse>(res, 400, 'LED control not available on this printer');
    }

    const result = await backend.setLedEnabled(enabled);
    const response: StandardAPIResponse = {
      success: result.success,
      message: result.success ? `LED turned ${enabled ? 'on' : 'off'}` : undefined,
      error: result.error,
    };
    return res.status(result.success ? 200 : 500).json(response);
  } catch (error) {
    const appError = toAppError(error);
    return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
  }
}

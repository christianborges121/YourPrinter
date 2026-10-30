/**
 * @fileoverview Temperature control API routes for the WebUI server.
 */

import { StandardAPIResponse } from '@shared/types/web-api.types.js';
import type { Response, Router } from 'express';
import { toAppError } from '../../../utils/error.utils.js';
import { createValidationError, TemperatureSetRequestSchema } from '../../schemas/web-api.schemas.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers.js';

export function registerTemperatureRoutes(router: Router, deps: RouteDependencies): void {
  router.post('/printer/temperature/bed', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const validation = TemperatureSetRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const validationError = createValidationError(validation.error);
        return sendErrorResponse<StandardAPIResponse>(res, 400, validationError.error);
      }

      const temperature = Math.round(validation.data.temperature);
      const result = await deps.backendManager.executeGCodeCommand(contextResult.contextId, `~M140 S${temperature}`);

      const response: StandardAPIResponse = {
        success: result.success,
        message: result.success ? `Setting bed temperature to ${temperature}°C` : undefined,
        error: result.error,
      };
      return res.status(result.success ? 200 : 500).json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.post('/printer/temperature/bed/off', async (req: AuthenticatedRequest, res: Response) => {
    await handleSimpleTemperatureCommand(req, res, deps, '~M140 S0', 'Bed heating turned off');
  });

  router.post('/printer/temperature/extruder', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const validation = TemperatureSetRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const validationError = createValidationError(validation.error);
        return sendErrorResponse<StandardAPIResponse>(res, 400, validationError.error);
      }

      const temperature = Math.round(validation.data.temperature);
      const toolIndex = validation.data.toolIndex;
      const cmd = toolIndex !== undefined ? `~M104 T${toolIndex} S${temperature}` : `~M104 S${temperature}`;
      const result = await deps.backendManager.executeGCodeCommand(contextResult.contextId, cmd);

      const targetLabel = toolIndex !== undefined ? `Tool ${toolIndex + 1}` : 'extruder';
      const response: StandardAPIResponse = {
        success: result.success,
        message: result.success ? `Setting ${targetLabel} temperature to ${temperature}°C` : undefined,
        error: result.error,
      };
      return res.status(result.success ? 200 : 500).json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.post('/printer/temperature/extruder/off', async (req: AuthenticatedRequest, res: Response) => {
    const toolIndex = typeof req.body?.toolIndex === 'number' ? req.body.toolIndex : undefined;
    const cmd = toolIndex !== undefined ? `~M104 T${toolIndex} S0` : '~M104 S0';
    const label = toolIndex !== undefined ? `Tool ${toolIndex + 1} heating turned off` : 'Extruder heating turned off';
    await handleSimpleTemperatureCommand(req, res, deps, cmd, label);
  });

  router.post('/printer/temperature/chamber', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const validation = TemperatureSetRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const validationError = createValidationError(validation.error);
        return sendErrorResponse<StandardAPIResponse>(res, 400, validationError.error);
      }

      const temperature = Math.round(validation.data.temperature);
      const result = await deps.backendManager.executeGCodeCommand(contextResult.contextId, `~M141 S${temperature}`);

      const response: StandardAPIResponse = {
        success: result.success,
        message: result.success ? `Setting chamber temperature to ${temperature}°C` : undefined,
        error: result.error,
      };
      return res.status(result.success ? 200 : 500).json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.post('/printer/temperature/chamber/off', async (req: AuthenticatedRequest, res: Response) => {
    await handleSimpleTemperatureCommand(req, res, deps, '~M141 S0', 'Chamber heating turned off');
  });
}

async function handleSimpleTemperatureCommand(
  req: AuthenticatedRequest,
  res: Response,
  deps: RouteDependencies,
  command: string,
  successMessage: string
): Promise<Response | void> {
  try {
    const contextResult = resolveContext(req, deps, { requireBackendReady: true });
    if (!contextResult.success) {
      return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
    }

    const result = await deps.backendManager.executeGCodeCommand(contextResult.contextId, command);

    const response: StandardAPIResponse = {
      success: result.success,
      message: result.success ? successMessage : undefined,
      error: result.error,
    };
    return res.status(result.success ? 200 : 500).json(response);
  } catch (error) {
    const appError = toAppError(error);
    return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
  }
}

/**
 * @fileoverview Discord & Push Notification configuration and testing routes for WebUI.
 */

import type { Response, Router } from 'express';
import { toAppError } from '../../../utils/error.utils.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers.js';
import { getGo2rtcService } from '../../../services/Go2rtcService.js';

export function registerNotificationRoutes(router: Router, deps: RouteDependencies): void {
  // Get Discord notification config
  router.get('/notifications/discord', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const config = deps.configManager.getConfig();
      return res.json({
        success: true,
        enabled: Boolean(config.DiscordSync),
        webhookUrl: config.WebhookUrl || '',
        includeCameraSnapshots: Boolean(config.DiscordIncludeCameraSnapshots),
        updateIntervalMinutes: config.DiscordUpdateIntervalMinutes || 5,
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  // Update Discord notification config
  router.post('/notifications/discord', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { enabled, webhookUrl, includeCameraSnapshots, updateIntervalMinutes } = req.body || {};
      const updates: Record<string, any> = {};

      if (typeof enabled === 'boolean') {
        updates.DiscordSync = enabled;
      }
      if (typeof webhookUrl === 'string') {
        updates.WebhookUrl = webhookUrl.trim();
      }
      if (typeof includeCameraSnapshots === 'boolean') {
        updates.DiscordIncludeCameraSnapshots = includeCameraSnapshots;
      }
      if (typeof updateIntervalMinutes === 'number' && updateIntervalMinutes >= 1) {
        updates.DiscordUpdateIntervalMinutes = updateIntervalMinutes;
      }

      await deps.configManager.updateConfig(updates);

      return res.json({
        success: true,
        message: 'Discord notification settings updated',
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  // Test Discord notification webhook
  router.post('/notifications/discord/test', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = deps.configManager.getConfig();
      const webhookUrl = (req.body?.webhookUrl || config.WebhookUrl || '').trim();
      const includeSnapshots =
        typeof req.body?.includeCameraSnapshots === 'boolean'
          ? req.body.includeCameraSnapshots
          : Boolean(config.DiscordIncludeCameraSnapshots);

      if (!webhookUrl) {
        return sendErrorResponse(res, 400, 'Discord Webhook URL is required');
      }

      // Resolve context for snapshot or printer name if possible
      const contextResult = resolveContext(req, deps, { requireActiveContext: false });
      const targetContextId = contextResult.success ? contextResult.contextId : deps.contextManager.getActiveContextId();
      const activeContext = targetContextId ? deps.contextManager.getContext(targetContextId) : null;
      const printerName = activeContext?.name || 'YourPrinter 3D';

      let snapshot: { bytes: Uint8Array; contentType: string; filename: string } | null = null;
      if (includeSnapshots && targetContextId) {
        try {
          snapshot = await getGo2rtcService().captureSnapshot(targetContextId, 3000);
        } catch {
          // ignore snapshot error for test
        }
      }

      const payload = {
        embeds: [
          {
            title: '🧪 YourPrinter Test Notification',
            description: 'Discord Webhook connection is active and working properly!',
            color: 0x00ae42, // Green
            fields: [
              { name: 'Printer', value: printerName, inline: true },
              { name: 'Status', value: 'Verified', inline: true },
              { name: 'Snapshot', value: snapshot ? 'Attached 📷' : 'Disabled', inline: true },
            ],
            footer: { text: 'YourPrinter • Your Way' },
            timestamp: new Date().toISOString(),
            ...(snapshot ? { image: { url: `attachment://${snapshot.filename}` } } : {}),
          },
        ],
      };

      let response: globalThis.Response;
      if (snapshot) {
        const formData = new FormData();
        const blob = new Blob([snapshot.bytes as any], { type: snapshot.contentType });
        formData.append('files[0]', blob, snapshot.filename);
        formData.append('payload_json', JSON.stringify(payload));
        response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        return sendErrorResponse(res, 400, `Discord API error (${response.status}): ${errorText}`);
      }

      return res.json({
        success: true,
        message: 'Test notification sent to Discord!',
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });
}

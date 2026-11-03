/**
 * @fileoverview Express API routes for the Obico AI Watchdog integration.
 *
 * Proxies live detection telemetry, snapshots, and configuration updates
 * between the WebUI and the AI Watchdog daemon.
 */

import type { Response, Router } from 'express';
import { getWatchdogService } from '../../../services/WatchdogService.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import type { RouteDependencies } from './route-helpers.js';

export function registerWatchdogRoutes(router: Router, deps: RouteDependencies): void {
  const watchdog = getWatchdogService();

  router.get('/watchdog/config', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const config = deps.configManager.getConfig();
      return res.json({
        success: true,
        config: {
          threshold: config.WatchdogThreshold,
          consecutive_required: config.WatchdogConsecutiveRequired,
          auto_pause_enabled: config.WatchdogAutoPauseEnabled,
          check_interval_sec: config.WatchdogCheckIntervalSec,
        },
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
    }
  });

  router.get('/watchdog/status', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextId = typeof req.query.contextId === 'string' ? req.query.contextId : undefined;
      const status = await watchdog.getStatus(contextId);
      return res.json({ success: true, status });
    } catch (e) {
      return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
    }
  });

  router.get('/watchdog/snapshots', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextId = typeof req.query.contextId === 'string' ? req.query.contextId : undefined;
      const snapshots = await watchdog.getSnapshotsList(contextId);
      return res.json({ success: true, snapshots });
    } catch (e) {
      return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
    }
  });

  router.get('/watchdog/snapshot/latest', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextId = typeof req.query.contextId === 'string' ? req.query.contextId : undefined;
      const result = await watchdog.getSnapshotStream('snapshot/latest', contextId);
      if (!result) {
        return res.status(404).send('No snapshot available');
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(result.data);
    } catch {
      return res.status(500).send('Error streaming snapshot');
    }
  });

  router.get('/watchdog/snapshot/:filename', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filename = req.params.filename;
      if (!filename || !filename.endsWith('.jpg')) {
        return res.status(400).send('Invalid filename');
      }
      const result = await watchdog.getSnapshotStream(`snapshot/${filename}`);
      if (!result) {
        return res.status(404).send('Snapshot not found');
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(result.data);
    } catch {
      return res.status(500).send('Error streaming snapshot');
    }
  });

  router.post('/watchdog/config', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      const updates: Record<string, unknown> = {};

      if (typeof body.threshold === 'number' && !isNaN(body.threshold)) {
        updates.WatchdogThreshold = Math.max(0.01, Math.min(1.0, body.threshold));
      }
      if (typeof body.consecutive_required === 'number' && !isNaN(body.consecutive_required)) {
        updates.WatchdogConsecutiveRequired = Math.max(1, Math.min(10, Math.round(body.consecutive_required)));
      }
      if (typeof body.auto_pause_enabled === 'boolean') {
        updates.WatchdogAutoPauseEnabled = body.auto_pause_enabled;
      }
      if (typeof body.check_interval_sec === 'number' && !isNaN(body.check_interval_sec)) {
        updates.WatchdogCheckIntervalSec = Math.max(2, Math.min(300, Math.round(body.check_interval_sec)));
      }

      if (Object.keys(updates).length > 0) {
        await deps.configManager.updateConfig(updates);
      }

      const result = await watchdog.updateConfig(body);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
    }
  });
}

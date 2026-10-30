/**
 * @fileoverview Camera status and proxy configuration routes for the WebUI server.
 *
 * Provides endpoints for camera configuration using go2rtc as the streaming gateway.
 * All camera types (MJPEG and RTSP) are handled through go2rtc, which provides
 * unified WebRTC/MSE/MJPEG fallback for browser playback.
 */

import { CameraStatusResponse, StandardAPIResponse } from '@shared/types/web-api.types.js';
import type { Response, Router } from 'express';
import { getBambuCameraBridge } from '../../../services/BambuCameraBridge.js';
import { resolveAndEnsureCameraStream } from '../../../services/CameraStreamCoordinator.js';
import { getGo2rtcService } from '../../../services/Go2rtcService.js';
import { getCameraUserConfig, resolveCameraConfig } from '../../../utils/camera-utils.js';
import { toAppError } from '../../../utils/error.utils.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers.js';

export function registerCameraRoutes(router: Router, deps: RouteDependencies): void {
  router.get('/camera/status', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const isAvailable = deps.backendManager.isFeatureAvailable(contextResult.contextId, 'camera');
      const go2rtcService = getGo2rtcService();
      const backend = deps.backendManager.getBackendForContext(contextResult.contextId);
      const ip =
        contextResult.context.printerDetails.IPAddress ||
        (contextResult.context.printerDetails as any).ipAddress ||
        (backend as any)?.ipAddress ||
        '';
      const cameraConfig =
        backend &&
        resolveCameraConfig({
          printerIpAddress: ip,
          printerFeatures: backend.getBackendStatus().features,
          userConfig: getCameraUserConfig(contextResult.contextId),
        });
      const hasStream =
        !!cameraConfig &&
        cameraConfig.isAvailable &&
        !!cameraConfig.streamUrl &&
        !!cameraConfig.streamType &&
        cameraConfig.sourceType !== 'none' &&
        go2rtcService.hasMatchingStream(
          contextResult.contextId,
          cameraConfig.streamUrl,
          cameraConfig.sourceType,
          cameraConfig.streamType
        );

      const response: CameraStatusResponse = {
        available: isAvailable,
        streaming: hasStream,
        url: isAvailable ? '/api/camera/proxy-config' : undefined,
        clientCount: 0,
      };

      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.get('/camera/proxy-config', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, {
        requireBackendReady: true,
        requireBackendInstance: true,
      });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const { contextId, context, backend } = contextResult;
      if (!backend) {
        return sendErrorResponse<StandardAPIResponse>(res, 503, 'Backend not available');
      }

      const ip =
        context.printerDetails.IPAddress ||
        (context.printerDetails as any).ipAddress ||
        (backend as any)?.ipAddress ||
        '';

      const ensuredStream = await resolveAndEnsureCameraStream({
        contextId,
        printerIpAddress: ip,
        printerFeatures: backend.getBackendStatus().features,
        userConfig: getCameraUserConfig(contextId),
        go2rtcService: getGo2rtcService(),
        backend,
      });

      if (typeof (backend as unknown as { turnCameraOn?: () => Promise<boolean> }).turnCameraOn === 'function') {
        void (backend as unknown as { turnCameraOn: () => Promise<boolean> }).turnCameraOn();
      }

      if (!ensuredStream) {
        return sendErrorResponse<StandardAPIResponse>(res, 503, 'Camera not available for this printer');
      }

      const { cameraConfig, streamConfig } = ensuredStream;

      // Get FPS overlay setting from printer details
      const showCameraFps = context.printerDetails.showCameraFps ?? false;

      const model = (context.printerDetails.model || '').toLowerCase();
      const make = (context.printerDetails.make || '').toLowerCase();
      const isFlashForge =
        model.includes('creator') ||
        model.includes('flashforge') ||
        model.includes('adventurer') ||
        model.includes('5m') ||
        model.includes('ad5') ||
        make.includes('flashforge');

      const concurrencyNotice = isFlashForge
        ? 'FlashForge printers only support one active camera stream at a time. If Flash Studio or FlashPrint is running, please close it to view the camera feed.'
        : 'Printers often limit concurrent camera streams. If another application is viewing the stream, close it and retry.';

      // Build relative WebSocket URL for WebUI client (proxied through WebUI port)
      // and absolute direct WebSocket URL for direct go2rtc connections
      const host = req.hostname || 'localhost';
      const wsUrl = `/api/go2rtc/api/ws?src=${encodeURIComponent(streamConfig.streamName)}`;
      const directWsUrl = `ws://${host}:${streamConfig.apiPort}/api/ws?src=${encodeURIComponent(streamConfig.streamName)}`;

      const response = {
        success: true,
        wsUrl,
        directWsUrl,
        streamType: cameraConfig.streamType,
        sourceType: cameraConfig.sourceType,
        streamName: streamConfig.streamName,
        apiPort: streamConfig.apiPort,
        mode: streamConfig.mode,
        showCameraFps,
        concurrencyNotice,
      };

      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.get('/camera/snapshot', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, {
        requireBackendReady: true,
        requireBackendInstance: true,
      });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(res, contextResult.statusCode, contextResult.error);
      }

      const { contextId, context, backend } = contextResult;
      if (!backend) {
        return sendErrorResponse<StandardAPIResponse>(res, 503, 'Backend not available');
      }

      const ip =
        context.printerDetails.IPAddress ||
        (context.printerDetails as any).ipAddress ||
        (backend as any)?.ipAddress ||
        '';

      const go2rtcService = getGo2rtcService();
      await resolveAndEnsureCameraStream({
        contextId,
        printerIpAddress: ip,
        printerFeatures: backend.getBackendStatus().features,
        userConfig: getCameraUserConfig(contextId),
        go2rtcService,
        backend,
      });

      const snapshot = await go2rtcService.captureSnapshot(contextId, 4000);
      if (snapshot && snapshot.bytes && snapshot.bytes.length > 0) {
        res.setHeader('Content-Type', snapshot.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(Buffer.from(snapshot.bytes));
      }

      // Fallback 1: check if BambuCameraBridge has a decoded snapshot
      const serial = context.printerDetails.SerialNumber;
      if (serial) {
        const bridge = getBambuCameraBridge();
        const bridgeSnapshot = bridge.getSnapshot(serial);
        if (bridgeSnapshot && bridgeSnapshot.length > 0) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          return res.send(bridgeSnapshot);
        }
      }

      // Fallback 2: direct Flashforge & CFW snapshot queries
      const customUrl = (context.printerDetails as any).customCameraUrl;
      const candidateUrls: string[] = [];
      if (customUrl && typeof customUrl === 'string' && customUrl.startsWith('http')) {
        const snapCandidate = customUrl.replace('?action=stream', '?action=snapshot');
        candidateUrls.push(snapCandidate);
        if (snapCandidate !== customUrl) candidateUrls.push(customUrl);
      }
      if (ip) {
        candidateUrls.push(
          `http://${ip}:8080/?action=snapshot`,
          `http://${ip}/webcam/?action=snapshot`,
          `http://${ip}:8080/snapshot`,
        );
      }
      for (const candidate of candidateUrls) {
        try {
          const directResp = await fetch(candidate, {
            signal: AbortSignal.timeout(2000),
          });
          if (directResp.ok) {
            const bytes = Buffer.from(await directResp.arrayBuffer());
            if (bytes.length > 0) {
              res.setHeader('Content-Type', directResp.headers.get('content-type') || 'image/jpeg');
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
              return res.send(bytes);
            }
          }
        } catch {
          // Try next candidate
        }
      }

      return res.status(503).send('Camera snapshot unavailable');
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });
}

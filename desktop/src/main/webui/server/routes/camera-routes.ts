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

interface SnapshotPayload {
  readonly bytes: Buffer;
  readonly contentType: string;
}

const SNAPSHOT_DEDUPE_CACHE_MS = 400;
const TURN_CAMERA_ON_TIMEOUT_MS = 1200;

function isMjpegStreamUrl(url: string): boolean {
  return /\?action=stream\b|\/stream(?:\.mjpeg)?(?:$|\?)/i.test(url);
}

function isLikelyImagePayload(bytes: Buffer, contentType: string): boolean {
  if (bytes.length < 4) {
    return false;
  }
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes('multipart/x-mixed-replace') || normalizedType.startsWith('text/')) {
    return false;
  }
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return isJpeg || isPng || normalizedType.startsWith('image/');
}

async function awaitBoundedTurnCameraOn(backend: unknown): Promise<void> {
  const cameraBackend = backend as { turnCameraOn?: () => Promise<boolean> };
  if (typeof cameraBackend?.turnCameraOn !== 'function') {
    return;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      cameraBackend.turnCameraOn().catch((err) => {
        console.warn('[camera-routes] turnCameraOn failed:', err);
        return false;
      }),
      new Promise<boolean>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(false), TURN_CAMERA_ON_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function registerCameraRoutes(router: Router, deps: RouteDependencies): void {
  const inFlightSnapshots = new Map<string, Promise<SnapshotPayload | null>>();
  const recentSnapshots = new Map<string, { payload: SnapshotPayload; capturedAt: number }>();
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

      await awaitBoundedTurnCameraOn(backend);

      const ensuredStream = await resolveAndEnsureCameraStream({
        contextId,
        printerIpAddress: ip,
        printerFeatures: backend.getBackendStatus().features,
        userConfig: getCameraUserConfig(contextId),
        go2rtcService: getGo2rtcService(),
        backend,
      });

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

      const cached = recentSnapshots.get(contextId);
      if (cached && Date.now() - cached.capturedAt < SNAPSHOT_DEDUPE_CACHE_MS) {
        res.setHeader('Content-Type', cached.payload.contentType);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(cached.payload.bytes);
      }

      let capturePromise = inFlightSnapshots.get(contextId);
      if (!capturePromise) {
        capturePromise = (async (): Promise<SnapshotPayload | null> => {
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
            return {
              bytes: Buffer.from(snapshot.bytes),
              contentType: snapshot.contentType || 'image/jpeg',
            };
          }

          // Fallback 1: check if BambuCameraBridge has a decoded snapshot
          const details = context.printerDetails as unknown as Record<string, unknown>;
          const serial =
            (typeof details.SerialNumber === 'string' && details.SerialNumber) ||
            (typeof details.serialNumber === 'string' && details.serialNumber) ||
            '';
          if (serial) {
            const bridge = getBambuCameraBridge();
            const bridgeSnapshot = bridge.getSnapshot(serial);
            if (bridgeSnapshot && bridgeSnapshot.length > 0) {
              return {
                bytes: bridgeSnapshot,
                contentType: 'image/jpeg',
              };
            }
          }

          // Fallback 2: direct Flashforge & CFW discrete snapshot queries (never open infinite MJPEG streams here)
          const customUrl = details.customCameraUrl;
          const candidateUrls: string[] = [];
          if (typeof customUrl === 'string' && customUrl.startsWith('http')) {
            const snapCandidate = customUrl.replace('?action=stream', '?action=snapshot');
            if (!isMjpegStreamUrl(snapCandidate)) {
              candidateUrls.push(snapCandidate);
            }
          }
          if (ip) {
            candidateUrls.push(
              `http://${ip}:8080/?action=snapshot`,
              `http://${ip}/webcam/?action=snapshot`,
              `http://${ip}:8080/snapshot`
            );
          }

          for (const candidate of candidateUrls) {
            try {
              const directResp = await fetch(candidate, {
                signal: AbortSignal.timeout(2000),
              });
              if (directResp.ok) {
                const contentType = directResp.headers.get('content-type') || 'image/jpeg';
                const bytes = Buffer.from(await directResp.arrayBuffer());
                if (isLikelyImagePayload(bytes, contentType)) {
                  return {
                    bytes,
                    contentType,
                  };
                }
              }
            } catch {
              // Try next candidate
            }
          }

          return null;
        })().finally(() => {
          inFlightSnapshots.delete(contextId);
        });

        inFlightSnapshots.set(contextId, capturePromise);
      }

      const captured = await capturePromise;
      if (captured) {
        recentSnapshots.set(contextId, { payload: captured, capturedAt: Date.now() });
        res.setHeader('Content-Type', captured.contentType);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(captured.bytes);
      }

      return res.status(503).send('Camera snapshot unavailable');
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });
}

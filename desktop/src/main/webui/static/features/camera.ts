/**
 * @fileoverview Camera streaming helpers for the WebUI client using go2rtc.
 *
 * Unified camera streaming using go2rtc as the streaming gateway. All camera types
 * (MJPEG and RTSP) are handled through go2rtc, which provides WebRTC/MSE/MJPEG
 * fallback for browser playback. This eliminates the rotation drift bug caused
 * by JSMpeg's canvas rendering by using native <video> element playback.
 *
 * Key improvements:
 * - Native <video> element (no canvas = no rotation drift)
 * - Lower latency via WebRTC (~500ms vs 1-3s with transcoding)
 * - Automatic reconnection built into go2rtc
 * - Unified handling for all camera types
 * - 30-second stream limit to conserve printer hardware resources and network bandwidth,
 *   with a user option to override and stream continuously
 */

import type { CameraProxyConfigResponse } from '../app.js';
import { state } from '../core/AppState.js';
import { apiRequest } from '../core/Transport.js';
import { $, hideElement, showElement } from '../shared/dom.js';
import { initializeLucideIcons } from '../shared/icons.js';

/**
 * Interface for the video-rtc custom element
 */
interface VideoRTCElement extends HTMLElement {
  src: string;
  mode: string;
  media: string;
}

/** LocalStorage key for persisting the 30-second stream timeout override */
export const STORAGE_KEY_OVERRIDE_30S = 'webui_camera_override_30s';

/** Maximum duration in seconds to keep camera stream active before auto-pausing */
export const CAMERA_STREAM_DURATION_SECONDS = 30;

/** Current video-rtc element instance */
let videoRtcElement: VideoRTCElement | null = null;

/** Whether FPS overlay is enabled */
let showFpsOverlay = false;

/** Timeout timer handle for automatic stream stop */
let streamTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

/** 1-second interval timer handle for countdown badge */
let streamCountdownInterval: ReturnType<typeof setInterval> | null = null;

/** 5-second stream health verification timer */
let streamHealthCheckTimer: ReturnType<typeof setTimeout> | null = null;

/** Cached concurrency notice from backend config response */
let cachedConcurrencyNotice: string | null = null;

/** Remaining seconds for current camera stream session */
let remainingSeconds = CAMERA_STREAM_DURATION_SECONDS;

/** Flag to ensure delegated event listeners are attached once */
let eventListenersAttached = false;

/**
 * Check whether continuous streaming (overriding 30s limit) is enabled
 */
export function isStreamTimeoutOverridden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_OVERRIDE_30S) === 'true';
  } catch {
    return false;
  }
}

/**
 * Update the continuous stream override setting and synchronize UI
 */
export function setStreamTimeoutOverridden(override: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_OVERRIDE_30S, override ? 'true' : 'false');
  } catch {
    // Ignore storage errors in restricted contexts
  }

  updateOverrideUI(override);

  // If stream is active, update countdown badge and timers accordingly
  if (videoRtcElement) {
    if (override) {
      clearStreamTimers();
      const countdownEl = $('camera-stream-countdown');
      if (countdownEl) {
        countdownEl.textContent = 'Continuous';
      }
      const badge = $('camera-stream-badge');
      if (badge) {
        badge.title = 'Camera stream active (continuous mode)';
      }
    } else {
      startStreamTimer();
    }
  }
}

/**
 * Synchronize UI indicators and toggles with the override setting
 */
export function updateOverrideUI(override = isStreamTimeoutOverridden()): void {
  const headerBtn = $('btn-cam-override-timer');
  if (headerBtn) {
    if (override) {
      headerBtn.classList.add('active');
      headerBtn.title = 'Continuous streaming active (click to enforce 30s limit)';
    } else {
      headerBtn.classList.remove('active');
      headerBtn.title = 'Continuous stream (override 30s limit)';
    }
  }

  const pausedCheckbox = $('camera-override-checkbox') as HTMLInputElement | null;
  if (pausedCheckbox) {
    pausedCheckbox.checked = override;
  }

  const settingsCheckbox = $('settings-camera-continuous') as HTMLInputElement | null;
  if (settingsCheckbox) {
    settingsCheckbox.checked = override;
  }
}

/**
 * Update FPS overlay display.
 * Note: video-rtc doesn't expose frame counts directly like JSMpeg did.
 * The FPS overlay will show connection status instead.
 */
function updateFpsDisplay(): void {
  const overlay = $('camera-fps-overlay');
  if (!overlay) return;

  if (!showFpsOverlay) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  // video-rtc handles playback internally, we show stream status instead
  overlay.textContent = videoRtcElement ? 'Streaming' : 'Offline';
}

/**
 * Destroy the current video-rtc player
 */
function destroyVideoRtcPlayer(): void {
  if (videoRtcElement) {
    try {
      // Remove from DOM to stop WebRTC peer connection & media decoding
      videoRtcElement.remove();
    } catch (error) {
      console.warn('[Camera] Failed to destroy video-rtc player:', error);
    } finally {
      videoRtcElement = null;
    }
  }
}

/**
 * Clear all active stream timers and intervals
 */
function clearStreamTimers(): void {
  if (streamTimeoutTimer !== null) {
    clearTimeout(streamTimeoutTimer);
    streamTimeoutTimer = null;
  }
  if (streamCountdownInterval !== null) {
    clearInterval(streamCountdownInterval);
    streamCountdownInterval = null;
  }
  if (streamHealthCheckTimer !== null) {
    clearTimeout(streamHealthCheckTimer);
    streamHealthCheckTimer = null;
  }
}

/**
 * Update countdown text display in the stream badge
 */
function updateCountdownDisplay(seconds: number): void {
  const countdownEl = $('camera-stream-countdown');
  if (countdownEl) {
    countdownEl.textContent = isStreamTimeoutOverridden() ? 'Continuous' : `${seconds}s`;
  }
}

/**
 * Start 30-second stream timer and 1-second countdown ticker (unless continuous override is active)
 */
function startStreamTimer(): void {
  clearStreamTimers();

  showElement('camera-stream-badge');

  if (isStreamTimeoutOverridden()) {
    const countdownEl = $('camera-stream-countdown');
    if (countdownEl) {
      countdownEl.textContent = 'Continuous';
    }
    const badge = $('camera-stream-badge');
    if (badge) {
      badge.title = 'Camera stream active (continuous mode)';
    }
    return;
  }

  remainingSeconds = CAMERA_STREAM_DURATION_SECONDS;
  updateCountdownDisplay(remainingSeconds);
  const badge = $('camera-stream-badge');
  if (badge) {
    badge.title = 'Camera stream active (30s limit)';
  }

  streamCountdownInterval = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearStreamTimers();
      pauseCameraStream(true);
    } else {
      updateCountdownDisplay(remainingSeconds);
    }
  }, 1000);
}

/**
 * Pause camera stream (disconnecting WebRTC stream) and show the resume overlay.
 *
 * @param dueToTimeout Whether the pause was triggered by the 30-second timeout limit
 * @param reason Reason for pause ('timeout', 'user', or 'busy' if feed is occupied by another app)
 * @param customMessage Optional custom message to show on overlay
 */
export function pauseCameraStream(
  dueToTimeout = false,
  reason: 'timeout' | 'user' | 'busy' = dueToTimeout ? 'timeout' : 'user',
  customMessage?: string
): void {
  clearStreamTimers();

  // Destroy WebRTC player to stop network streaming and printer load
  destroyVideoRtcPlayer();

  hideElement('camera-stream-badge');
  hideElement('camera-fps-overlay');
  hideElement('camera-placeholder');

  const pausedOverlay = $('camera-paused-overlay');
  if (pausedOverlay) {
    const card = pausedOverlay.querySelector('.camera-paused-card');
    const titleEl = pausedOverlay.querySelector('.camera-paused-title');
    const icon = pausedOverlay.querySelector('.camera-paused-icon');
    const resumeBtnSpan = pausedOverlay.querySelector('#btn-camera-resume span');
    const resumeBtnIcon = pausedOverlay.querySelector('#btn-camera-resume i');
    const continuousBtn = $('btn-camera-continuous');
    const overrideLabel = pausedOverlay.querySelector('.camera-override-label');

    let descEl = pausedOverlay.querySelector('.camera-paused-desc') as HTMLElement | null;
    if (!descEl && titleEl) {
      descEl = document.createElement('p');
      descEl.className = 'camera-paused-desc';
      titleEl.after(descEl);
    }

    if (reason === 'busy') {
      pausedOverlay.dataset.reason = 'busy';
      if (card) card.classList.add('busy');
      if (titleEl) titleEl.textContent = 'Camera In Use or Offline';
      if (icon) icon.setAttribute('data-lucide', 'video-off');
      if (resumeBtnSpan) resumeBtnSpan.textContent = 'Retry Stream';
      if (resumeBtnIcon) resumeBtnIcon.setAttribute('data-lucide', 'refresh-cw');

      if (descEl) {
        descEl.textContent =
          customMessage ||
          cachedConcurrencyNotice ||
          'The camera feed may currently be open in another application (such as Flash Studio, FlashPrint, or another browser window). FlashForge printers only support one active video stream at a time.';
        descEl.classList.remove('hidden');
      }

      if (continuousBtn) continuousBtn.classList.add('hidden');
      if (overrideLabel) overrideLabel.classList.add('hidden');

      const statusText = $('camera-status-text');
      if (statusText) statusText.textContent = 'Camera In Use / Offline';
    } else {
      delete pausedOverlay.dataset.reason;
      if (card) card.classList.remove('busy');
      if (titleEl) titleEl.textContent = 'Stream Paused';
      if (icon) icon.setAttribute('data-lucide', 'play');
      if (resumeBtnSpan) resumeBtnSpan.textContent = 'View (30s)';
      if (resumeBtnIcon) resumeBtnIcon.setAttribute('data-lucide', 'play');

      if (descEl) {
        descEl.textContent = '';
        descEl.classList.add('hidden');
      }

      if (continuousBtn) continuousBtn.classList.remove('hidden');
      if (overrideLabel) overrideLabel.classList.remove('hidden');

      const statusText = $('camera-status-text');
      if (statusText) statusText.textContent = 'Stopped.';
    }

    initializeLucideIcons();
  }

  showElement('camera-paused-overlay');
  updateOverrideUI();

  updateFpsDisplay();
  console.log(`[Camera] Stream paused (reason: ${reason}, dueToTimeout: ${dueToTimeout})`);
}

/**
 * Teardown all camera stream elements and reset state
 */
export function teardownCameraStreamElements(): void {
  clearStreamTimers();
  showFpsOverlay = false;
  destroyVideoRtcPlayer();

  hideElement('camera-stream-badge');
  hideElement('camera-paused-overlay');

  const placeholder = $('camera-placeholder');
  if (placeholder) {
    placeholder.textContent = 'Camera offline';
  }
  showElement('camera-placeholder');

  updateFpsDisplay();
}

/**
 * Put the camera panel into a connecting/loading state during context switches
 */
export function showCameraConnectingState(): void {
  clearStreamTimers();
  showFpsOverlay = false;
  destroyVideoRtcPlayer();

  hideElement('camera-stream-badge');
  hideElement('camera-paused-overlay');

  const placeholder = $('camera-placeholder');
  if (placeholder) {
    placeholder.innerHTML = '<div class="camera-stream-loading"><span class="loading-spinner"></span><span>Connecting to camera feed...</span></div>';
  }
  showElement('camera-placeholder');

  const statusText = $('camera-status-text');
  if (statusText) {
    statusText.textContent = 'Connecting...';
  }

  updateFpsDisplay();
}

/**
 * Whether the camera stream is currently active
 */
export function isCameraStreaming(): boolean {
  return videoRtcElement !== null;
}

/**
 * Returns remaining seconds on the current stream session
 */
export function getRemainingStreamSeconds(): number {
  return remainingSeconds;
}

/**
 * Attach delegated event listeners for resume, continuous, and pause actions
 */
function attachCameraEventListeners(): void {
  if (eventListenersAttached) return;
  if (typeof document === 'undefined') return;

  eventListenersAttached = true;

  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Click continuous stream button on paused overlay
    if (target.closest('#btn-camera-continuous')) {
      event.preventDefault();
      event.stopPropagation();
      setStreamTimeoutOverridden(true);
      void loadCameraStream();
      return;
    }

    // Click header override toggle button (infinity icon)
    if (target.closest('#btn-cam-override-timer')) {
      event.preventDefault();
      event.stopPropagation();
      const newOverride = !isStreamTimeoutOverridden();
      setStreamTimeoutOverridden(newOverride);
      // If paused when clicking header infinity icon, start streaming immediately
      if (!videoRtcElement && newOverride) {
        void loadCameraStream();
      }
      return;
    }

    // Resume stream when clicking 30s resume button or anywhere on paused overlay card
    const resumeBtn = target.closest('#btn-camera-resume');
    const pausedOverlay = target.closest('#camera-paused-overlay');
    const isOverrideCheckbox = target.closest('#camera-override-checkbox') || target.closest('.camera-override-label');

    if (resumeBtn || (pausedOverlay && !isOverrideCheckbox && !target.closest('#btn-camera-continuous'))) {
      event.preventDefault();
      event.stopPropagation();
      void loadCameraStream();
      return;
    }

    // Pause stream when clicking pause button on the live badge
    const pauseTarget = target.closest('#btn-camera-pause');
    if (pauseTarget) {
      event.preventDefault();
      event.stopPropagation();
      pauseCameraStream(false);
      return;
    }
  });

  document.addEventListener('change', (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.id === 'camera-override-checkbox' || target.id === 'settings-camera-continuous') {
      const checkbox = target as HTMLInputElement;
      setStreamTimeoutOverridden(checkbox.checked);
    }
  });
}

/**
 * Create and configure a video-rtc element for camera streaming
 */
function createVideoRtcElement(wsUrl: string, mode: string): VideoRTCElement {
  const element = document.createElement('video-rtc') as VideoRTCElement;

  // Configure the element
  element.src = wsUrl;
  element.mode = mode;
  element.media = 'video'; // Video only, no audio for camera feeds

  // Style the element - contain ensures complete 4:3 / 5:3 / 16:9 view without cropping
  element.style.width = '100%';
  element.style.height = '100%';
  element.style.objectFit = 'contain';
  element.style.display = 'block';

  return element;
}

/**
 * Load and display camera stream from go2rtc (subject to 30s limit unless overridden)
 */
export async function loadCameraStream(): Promise<void> {
  attachCameraEventListeners();

  const cameraPlaceholder = $('camera-placeholder');
  const cameraContainer = $('camera-container') || $('camera-stream')?.parentElement;

  if (!cameraPlaceholder && !cameraContainer) {
    console.error('[Camera] Required DOM element (camera-placeholder/camera-container) not found');
    return;
  }

  // Check auth
  if (state.authRequired && !state.authToken) {
    console.warn('[Camera] Skipping stream load due to missing auth token');
    teardownCameraStreamElements();
    return;
  }

  try {
    clearStreamTimers();

    // Hide paused overlay and placeholder while streaming
    hideElement('camera-paused-overlay');
    hideElement('camera-placeholder');

    // Fetch camera configuration from server
    const config = await apiRequest<CameraProxyConfigResponse>('/api/camera/proxy-config');

    if (!config.success) {
      throw new Error(config.error || 'Failed to get camera configuration');
    }

    if (!config.wsUrl) {
      throw new Error('No WebSocket URL provided for camera stream');
    }

    cachedConcurrencyNotice = config.concurrencyNotice || null;

    // Cleanup any existing player
    destroyVideoRtcPlayer();

    // Set up FPS overlay (shows status for go2rtc)
    showFpsOverlay = config.showCameraFps ?? false;

    // Create video-rtc element
    const mode = config.mode || 'webrtc,mse,mjpeg';
    videoRtcElement = createVideoRtcElement(config.wsUrl, mode);

    if (config.directWsUrl) {
      const el = videoRtcElement;
      el.addEventListener('error', () => {
        if (el.src === config.wsUrl && config.directWsUrl) {
          console.warn('[Camera] Proxy connection failed, attempting directWsUrl fallback:', config.directWsUrl);
          el.src = config.directWsUrl;
        }
      });
    }

    // Find the camera container and add the video-rtc element
    if (cameraContainer) {
      cameraContainer.appendChild(videoRtcElement);
    } else if (cameraPlaceholder) {
      // Fallback: replace placeholder's parent content
      const parent = cameraPlaceholder.parentElement;
      if (parent) {
        parent.appendChild(videoRtcElement);
      }
    }

    let streamVerified = false;
    const onStreamLive = () => {
      if (streamVerified) return;
      streamVerified = true;
      if (streamHealthCheckTimer) {
        clearTimeout(streamHealthCheckTimer);
        streamHealthCheckTimer = null;
      }
      hideElement('camera-placeholder');
      hideElement('camera-paused-overlay');
      showElement('camera-stream-badge');
      startStreamTimer();
      updateOverrideUI();
      const statusText = $('camera-status-text');
      if (statusText) {
        statusText.textContent = 'Streaming';
      }
      updateFpsDisplay();
    };

    // Ensure inner video uses object-fit: contain to preserve 4:3 / 5:3 / 16:9 view without cropping
    const innerVideo = videoRtcElement.querySelector('video') || (videoRtcElement as unknown as { video?: HTMLVideoElement }).video;
    if (innerVideo) {
      innerVideo.controls = false;
      innerVideo.style.objectFit = 'contain';
      innerVideo.style.width = '100%';
      innerVideo.style.height = '100%';

      innerVideo.addEventListener('playing', onStreamLive, { once: true });
      innerVideo.addEventListener('loadeddata', onStreamLive, { once: true });
      innerVideo.addEventListener('timeupdate', () => {
        if (innerVideo.currentTime > 0) onStreamLive();
      });

      const observer = new MutationObserver(() => {
        if (innerVideo.getAttribute('poster') || innerVideo.poster) {
          onStreamLive();
          observer.disconnect();
        }
      });
      observer.observe(innerVideo, { attributes: true, attributeFilter: ['poster'] });

      // Health verification timer (5s) to detect if single-client daemon is locked by another app (e.g. Flash Studio)
      streamHealthCheckTimer = setTimeout(() => {
        streamHealthCheckTimer = null;
        if (streamVerified) return;

        const hasPoster = Boolean(innerVideo?.getAttribute('poster') || innerVideo?.poster);
        const isPlaying = Boolean(innerVideo && innerVideo.currentTime > 0);
        if (hasPoster || isPlaying) {
          onStreamLive();
          return;
        }

        console.warn('[Camera] Stream verification timed out. Camera feed may be in use by another app (e.g. Flash Studio).');
        pauseCameraStream(false, 'busy');
      }, 5000);
    } else {
      // In mock/test environments without shadow DOM video element, activate immediately
      onStreamLive();
    }

    console.log(`[Camera] go2rtc stream started: ${config.wsUrl} (mode: ${mode}, continuous: ${isStreamTimeoutOverridden()})`);
    updateFpsDisplay();
  } catch (error) {
    console.error('[Camera] Failed to load camera stream:', error);

    teardownCameraStreamElements();

    if (cameraPlaceholder) {
      const errorMessage = error instanceof Error ? error.message : 'Camera Configuration Error';
      cameraPlaceholder.textContent = errorMessage;
    }
    showElement('camera-placeholder');
  }
}

/**
 * Initialize camera module - called when printer features are available
 */
export function initializeCamera(): void {
  attachCameraEventListeners();
  updateOverrideUI();

  if (!state.printerFeatures?.hasCamera) {
    teardownCameraStreamElements();
    return;
  }

  void loadCameraStream();
}

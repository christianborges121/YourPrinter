/**
 * @jest-environment jsdom
 */

/**
 * @fileoverview Jest coverage for the WebUI camera feature helpers.
 *
 * Verifies `camera.js` builds `video-rtc` playback from camera proxy config,
 * surfaces invalid stream configuration cleanly, tears down camera UI when
 * printer capabilities indicate no camera support, enforces a 30-second
 * streaming timeout by default, and supports continuous stream overrides.
 */

const mockApiRequest = jest.fn();
const mockState = {
  authRequired: false,
  authToken: null,
  printerFeatures: {
    hasCamera: true,
  },
};

jest.mock('../../core/Transport.js', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

jest.mock('../../core/AppState.js', () => ({
  state: mockState,
}));

import {
  CAMERA_STREAM_DURATION_SECONDS,
  getRemainingStreamSeconds,
  initializeCamera,
  isCameraStreaming,
  isStreamTimeoutOverridden,
  loadCameraStream,
  pauseCameraStream,
  setStreamTimeoutOverridden,
  teardownCameraStreamElements,
} from '../camera.js';

describe('webui camera feature', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    mockApiRequest.mockReset();
    mockState.authRequired = false;
    mockState.authToken = null;
    mockState.printerFeatures = { hasCamera: true };
    document.body.innerHTML = `
      <div id="camera-panel">
        <button id="btn-cam-override-timer" class="icon-tool-btn"></button>
        <div id="camera-container">
          <div id="camera-placeholder"></div>
          <div id="camera-fps-overlay" class="hidden"></div>
          <div id="camera-stream-badge" class="hidden">
            <span class="stream-dot"></span>
            <span class="stream-label">Live</span>
            <span id="camera-stream-countdown">30s</span>
            <button id="btn-camera-pause"></button>
          </div>
          <div id="camera-paused-overlay" class="hidden">
            <div class="camera-paused-card">
              <div class="camera-paused-title">Stream Paused</div>
              <div class="camera-paused-actions">
                <button id="btn-camera-resume"></button>
                <button id="btn-camera-continuous"></button>
              </div>
              <label class="camera-override-label">
                <input type="checkbox" id="camera-override-checkbox">
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
    setStreamTimeoutOverridden(false);
    teardownCameraStreamElements();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('creates a video-rtc element from the websocket camera configuration and starts 30s timer', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      wsUrl: 'ws://localhost:1984/api/ws?src=context-1-camera',
      mode: 'webrtc,mse,mjpeg',
      showCameraFps: true,
    });

    await loadCameraStream();

    const player = document.querySelector('video-rtc') as HTMLElement | null;
    const overlay = document.getElementById('camera-fps-overlay');
    const badge = document.getElementById('camera-stream-badge');
    const countdown = document.getElementById('camera-stream-countdown');

    expect(player).not.toBeNull();
    expect((player as any).src).toBe('ws://localhost:1984/api/ws?src=context-1-camera');
    expect((player as any).mode).toBe('webrtc,mse,mjpeg');
    expect(document.getElementById('camera-placeholder')?.classList.contains('hidden')).toBe(true);
    expect(overlay?.classList.contains('hidden')).toBe(false);
    expect(overlay?.textContent).toBe('Streaming');
    expect(badge?.classList.contains('hidden')).toBe(false);
    expect(countdown?.textContent).toBe('30s');
    expect(isCameraStreaming()).toBe(true);
  });

  it('surfaces camera configuration errors when the server omits a websocket URL', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
    });

    await loadCameraStream();

    expect(document.querySelector('video-rtc')).toBeNull();
    expect(document.getElementById('camera-placeholder')?.textContent).toBe(
      'No WebSocket URL provided for camera stream'
    );
    expect(document.getElementById('camera-placeholder')?.classList.contains('hidden')).toBe(false);
  });

  it('tears down the camera immediately when printer features report no camera', () => {
    mockState.printerFeatures = { hasCamera: false };

    initializeCamera();

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(document.getElementById('camera-placeholder')?.textContent).toBe('Camera offline');
  });

  it('automatically pauses the stream after 30 seconds and presents the resume overlay', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      wsUrl: 'ws://localhost:1984/api/ws?src=context-1-camera',
      mode: 'webrtc,mse,mjpeg',
    });

    await loadCameraStream();
    expect(isCameraStreaming()).toBe(true);
    expect(document.querySelector('video-rtc')).not.toBeNull();

    // Advance 10 seconds: remaining should be 20s
    jest.advanceTimersByTime(10000);
    expect(getRemainingStreamSeconds()).toBe(20);
    expect(document.getElementById('camera-stream-countdown')?.textContent).toBe('20s');
    expect(isCameraStreaming()).toBe(true);

    // Advance remaining 20 seconds to reach 30 seconds timeout
    jest.advanceTimersByTime(20000);

    expect(isCameraStreaming()).toBe(false);
    expect(document.querySelector('video-rtc')).toBeNull();
    expect(document.getElementById('camera-stream-badge')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('camera-paused-overlay')?.classList.contains('hidden')).toBe(false);
  });

  it('allows manual pausing before 30 seconds timeout', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      wsUrl: 'ws://localhost:1984/api/ws?src=context-1-camera',
      mode: 'webrtc,mse,mjpeg',
    });

    await loadCameraStream();
    expect(isCameraStreaming()).toBe(true);

    pauseCameraStream(false);

    expect(isCameraStreaming()).toBe(false);
    expect(document.querySelector('video-rtc')).toBeNull();
    expect(document.getElementById('camera-paused-overlay')?.classList.contains('hidden')).toBe(false);
  });

  it('resumes stream when clicking resume button on paused overlay', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      wsUrl: 'ws://localhost:1984/api/ws?src=context-1-camera',
      mode: 'webrtc,mse,mjpeg',
    });

    await loadCameraStream();
    jest.advanceTimersByTime(CAMERA_STREAM_DURATION_SECONDS * 1000);
    expect(isCameraStreaming()).toBe(false);

    // Click resume button
    const resumeBtn = document.getElementById('btn-camera-resume');
    resumeBtn?.click();

    await Promise.resolve();

    expect(isCameraStreaming()).toBe(true);
    expect(document.querySelector('video-rtc')).not.toBeNull();
    expect(getRemainingStreamSeconds()).toBe(30);
  });

  it('allows overriding 30-second stream limit to stream continuously without auto-pausing', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      wsUrl: 'ws://localhost:1984/api/ws?src=context-1-camera',
      mode: 'webrtc,mse,mjpeg',
    });

    // Enable continuous override
    setStreamTimeoutOverridden(true);
    expect(isStreamTimeoutOverridden()).toBe(true);

    await loadCameraStream();
    expect(isCameraStreaming()).toBe(true);
    expect(document.getElementById('camera-stream-countdown')?.textContent).toBe('Continuous');

    // Advance 60 seconds (well past the 30s timeout)
    jest.advanceTimersByTime(60000);

    // Stream must still be actively playing!
    expect(isCameraStreaming()).toBe(true);
    expect(document.querySelector('video-rtc')).not.toBeNull();
    expect(document.getElementById('camera-paused-overlay')?.classList.contains('hidden')).toBe(true);
  });

  it('starts continuous stream when clicking Continuous button on paused overlay', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      wsUrl: 'ws://localhost:1984/api/ws?src=context-1-camera',
      mode: 'webrtc,mse,mjpeg',
    });

    // Start with default 30s limit
    await loadCameraStream();
    jest.advanceTimersByTime(30000);
    expect(isCameraStreaming()).toBe(false);

    // Click Continuous button
    const continuousBtn = document.getElementById('btn-camera-continuous');
    continuousBtn?.click();

    await Promise.resolve();

    expect(isStreamTimeoutOverridden()).toBe(true);
    expect(isCameraStreaming()).toBe(true);
    expect(document.getElementById('camera-stream-countdown')?.textContent).toBe('Continuous');

    // Advance 60s to ensure no timeout
    jest.advanceTimersByTime(60000);
    expect(isCameraStreaming()).toBe(true);
  });

  it('displays informative busy overlay when camera stream is occupied by another app', () => {
    pauseCameraStream(false, 'busy', 'FlashForge only allows 1 camera stream. Please close Flash Studio.');

    const overlay = document.getElementById('camera-paused-overlay');
    const title = overlay?.querySelector('.camera-paused-title');
    const desc = overlay?.querySelector('.camera-paused-desc');
    const resumeBtn = document.getElementById('btn-camera-resume');

    expect(overlay?.classList.contains('hidden')).toBe(false);
    expect(overlay?.dataset.reason).toBe('busy');
    expect(title?.textContent).toBe('Camera In Use or Offline');
    expect(desc?.textContent).toContain('FlashForge only allows 1 camera stream');
    expect(resumeBtn?.textContent).toContain('Retry Stream');
  });

  it('resets overlay back to standard paused UI when paused normally after busy state', () => {
    // First trigger busy state
    pauseCameraStream(false, 'busy');
    expect(document.getElementById('camera-paused-overlay')?.dataset.reason).toBe('busy');

    // Then pause normally
    pauseCameraStream(false, 'user');

    const overlay = document.getElementById('camera-paused-overlay');
    const title = overlay?.querySelector('.camera-paused-title');
    const desc = overlay?.querySelector('.camera-paused-desc');
    const resumeBtn = document.getElementById('btn-camera-resume');

    expect(overlay?.dataset.reason).toBeUndefined();
    expect(title?.textContent).toBe('Stream Paused');
    expect(desc?.classList.contains('hidden')).toBe(true);
    expect(resumeBtn?.textContent).toContain('View (30s)');
  });
});

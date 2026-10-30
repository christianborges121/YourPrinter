/**
 * @fileoverview Multi-Printer Fleet Dashboard feature for YourPrinter.
 *
 * Provides a real-time grid overview of all configured printers with live camera feeds,
 * telemetry summaries (progress, temperatures, ETA, AMS status), and drill-down navigation.
 * Features granular camera streaming controls (per-card play/pause, global play/pause,
 * and configurable timed preview: 10s, 20s, 30s, 60s, 120s with localStorage persistence).
 */

import type { CameraProxyConfigResponse, MaterialStationStatus } from '../app.js';
import { apiRequest } from '../core/Transport.js';
import { $, hideElement, showElement, showToast } from '../shared/dom.js';
import { initializeLucideIcons } from '../shared/icons.js';
import { fetchAmsStatus } from './ams-manager.js';
import { initializeCamera, showCameraConnectingState } from './camera.js';
import { fetchPrinterContexts, switchPrinterContext } from './context-switching.js';
import { loadPrinterFeatures } from './job-control.js';
import { ensureSpoolmanVisibilityIfEnabled } from './layout-theme.js';
import { loadPrintersList, openAddPrinterForm } from './printer-management.js';
import { loadSpoolmanConfig } from './spoolman.js';
import { setPrinterStatusLoading, updateConnectionStatus } from '../ui/panels.js';
import { switchToStatusView, updateDeviceSubtabPill } from '../ui/views.js';

export interface FleetOverviewStatus {
  printerState: string;
  bedTemperature: number;
  bedTargetTemperature: number;
  nozzleTemperature: number;
  nozzleTargetTemperature: number;
  progress: number;
  currentLayer: number | null;
  totalLayers: number | null;
  jobName: string | null;
  formattedEta: string | null;
  timeRemaining: number | null;
  toolTemps?: number[];
  toolTargetTemps?: number[];
}

export interface FleetOverviewPrinter {
  name: string;
  serialNumber: string;
  ipAddress: string;
  model: string;
  isConnected: boolean;
  isActive: boolean;
  contextId: string | null;
  hasCamera: boolean;
  status: FleetOverviewStatus | null;
  materialStation?: MaterialStationStatus | null;
  disabled?: boolean;
}

interface FleetOverviewResponse {
  success: boolean;
  printers?: FleetOverviewPrinter[];
  totalConfigured?: number;
  activeContextId?: string | null;
  error?: string;
}

/** LocalStorage key for timed preview duration */
export const STORAGE_KEY_PREVIEW_DURATION = 'yourprinter_dashboard_preview_duration';

/** Polling timer handle for overview data updates */
let dashboardPollTimer: ReturnType<typeof setInterval> | null = null;

/** Timed preview timer handle */
let timedPreviewTimeout: ReturnType<typeof setTimeout> | null = null;
let timedPreviewCountdownInterval: ReturnType<typeof setInterval> | null = null;
let timedPreviewRemainingSeconds = 0;

/** Interface for the video-rtc custom element */
interface VideoRTCElement extends HTMLElement {
  src: string;
  mode: string;
  media: string;
  ondisconnect?: () => void;
}

/** Map of camera stream states per card: printerName -> boolean (isStreaming) */
const cardCameraStreaming = new Map<string, boolean>();

/** Map of created video-rtc elements per printer name */
const cardVideoElements = new Map<string, VideoRTCElement>();

/** Map of camera stream verification timers per printer name */
const cardStreamTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Cached overview printer list */
let cachedOverviewPrinters: FleetOverviewPrinter[] = [];

/** Flag indicating whether the fleet dashboard is actively polling and displayed */
let isDashboardRunning = false;

// ============================================================================
// TIMED PREVIEW CONFIGURATION
// ============================================================================

export function getSavedPreviewDuration(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREVIEW_DURATION);
    const num = saved ? parseInt(saved, 10) : 30;
    return [10, 20, 30, 60, 120].includes(num) ? num : 30;
  } catch {
    return 30;
  }
}

export function setSavedPreviewDuration(seconds: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREVIEW_DURATION, seconds.toString());
  } catch {
    // Ignore storage errors in restricted contexts
  }
  updatePreviewButtonText();
}

function updatePreviewButtonText(): void {
  const btnText = $('btn-dashboard-timed-preview-text');
  if (btnText) {
    btnText.textContent = 'Preview';
  }
}

// ============================================================================
// DASHBOARD VIEW DENSITY (HUD OVERLAY VS DETAILED)
// ============================================================================

export const STORAGE_KEY_FLEET_DENSITY = 'yourprinter_fleet_density';
export type FleetDashboardDensity = 'hud' | 'detailed';

export function getSavedFleetDensity(): FleetDashboardDensity {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FLEET_DENSITY);
    if (saved === 'hud' || saved === 'detailed') {
      return saved;
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  // Default to 'hud' on mobile, 'hud' across platforms for compact camera-first view
  return 'hud';
}

export function setSavedFleetDensity(density: FleetDashboardDensity): void {
  try {
    localStorage.setItem(STORAGE_KEY_FLEET_DENSITY, density);
  } catch {
    // Ignore storage errors
  }
  applyFleetDensity(density);
}

export function applyFleetDensity(density = getSavedFleetDensity()): void {
  const grid = $('fleet-dashboard-grid');
  const toggleBtn = $('btn-dashboard-density-toggle');
  const toggleLabel = $('dashboard-density-label');

  if (grid) {
    if (density === 'hud') {
      grid.classList.add('hud-mode');
      grid.classList.remove('detailed-mode');
    } else {
      grid.classList.remove('hud-mode');
      grid.classList.add('detailed-mode');
    }
  }

  if (toggleLabel) {
    toggleLabel.textContent = density === 'hud' ? 'HUD' : 'Detailed';
  }
  if (toggleBtn) {
    toggleBtn.setAttribute(
      'title',
      density === 'hud' ? 'Switch to Detailed card view' : 'Switch to compact HUD card view'
    );
    const icon = toggleBtn.querySelector('i, svg');
    if (icon) {
      icon.setAttribute('data-lucide', density === 'hud' ? 'layout-grid' : 'layers');
      initializeLucideIcons();
    }
  }
}

// ============================================================================
// DASHBOARD LIFECYCLE (START / STOP)
// ============================================================================

/**
 * Start the Fleet Dashboard: fetches initial overview and starts 3-second polling
 */
export async function startFleetDashboard(): Promise<void> {
  if (isDashboardRunning) return;
  isDashboardRunning = true;

  // Sync duration select dropdown with saved value
  const durationSelect = $('dashboard-preview-duration-select') as HTMLSelectElement | null;
  if (durationSelect) {
    const saved = getSavedPreviewDuration();
    durationSelect.value = saved.toString();
    updatePreviewButtonText();
  }

  // Apply saved or default view density (HUD vs Detailed)
  applyFleetDensity();

  // Initial fetch
  await refreshFleetDashboard();

  // Polling every 3 seconds
  if (dashboardPollTimer) clearInterval(dashboardPollTimer);
  dashboardPollTimer = setInterval(() => {
    if (isDashboardRunning) {
      void refreshFleetDashboard(true);
    }
  }, 3000);
}

/**
 * Stop the Fleet Dashboard: clears polling and stops all live camera streams
 */
export function stopFleetDashboard(): void {
  isDashboardRunning = false;

  if (dashboardPollTimer) {
    clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
  }

  cancelTimedPreview();
  pauseAllCardCameras();
}

// ============================================================================
// CAMERA STREAM MANAGEMENT (PER-CARD & GLOBAL)
// ============================================================================

/**
 * Mount and play camera stream for a specific printer card
 */
async function playCardCamera(printer: FleetOverviewPrinter, cardEl: HTMLElement): Promise<void> {
  if (!printer.contextId || !printer.isConnected || !printer.hasCamera) return;

  const cameraStage = cardEl.querySelector('.fleet-card-camera-box') as HTMLElement | null;
  if (!cameraStage) return;

  // If already playing, return
  if (cardCameraStreaming.get(printer.name) && cardVideoElements.has(printer.name)) {
    return;
  }

  cardCameraStreaming.set(printer.name, true);

  // Update card camera controls UI
  const playBtn = cardEl.querySelector('.btn-card-cam-play') as HTMLElement | null;
  const pauseBtn = cardEl.querySelector('.btn-card-cam-pause') as HTMLElement | null;
  const pausedOverlay = cardEl.querySelector('.fleet-card-cam-paused-overlay') as HTMLElement | null;
  if (pausedOverlay) {
    delete pausedOverlay.dataset.streamError;
    const hint = pausedOverlay.querySelector('.cam-overlay-hint');
    if (hint) hint.classList.add('hidden');
  }
  const resumeBtn = pausedOverlay?.querySelector('.btn-card-resume-cam') as HTMLButtonElement | null;
  if (resumeBtn) {
    resumeBtn.disabled = true;
    resumeBtn.innerHTML = '<span class="btn-spinner"></span><span>Connecting...</span>';
  }
  if (playBtn) playBtn.classList.add('hidden');
  if (pauseBtn) pauseBtn.classList.remove('hidden');
  if (pausedOverlay) pausedOverlay.classList.add('hidden');

  try {
    const res = await apiRequest<CameraProxyConfigResponse>(
      `/api/camera/proxy-config?contextId=${encodeURIComponent(printer.contextId)}`
    );

    if (!res.success || !res.wsUrl) {
      console.warn(`[FleetDashboard] Camera proxy config failed for ${printer.name}:`, res.error);
      pauseCardCamera(printer.name, cardEl);
      return;
    }

    // Existing element cleanup
    const oldVideo = cardVideoElements.get(printer.name);
    if (oldVideo) {
      try {
        if (typeof oldVideo.ondisconnect === 'function') {
          oldVideo.ondisconnect();
        }
      } catch {
        // ignore
      }
      oldVideo.remove();
      cardVideoElements.delete(printer.name);
    }

    // Create new <video-rtc> element with properties (not setAttribute)
    const videoRtc = document.createElement('video-rtc') as VideoRTCElement;
    videoRtc.mode = res.mode || 'webrtc,mse,mjpeg';
    videoRtc.media = 'video';
    videoRtc.className = 'fleet-card-video-player';
    videoRtc.style.width = '100%';
    videoRtc.style.height = '100%';
    videoRtc.style.objectFit = 'contain';
    videoRtc.style.display = 'block';

    if (res.directWsUrl) {
      videoRtc.addEventListener('error', () => {
        if (videoRtc.src === res.wsUrl && res.directWsUrl) {
          console.warn(`[FleetDashboard] Proxy ws failed for ${printer.name}, switching to directWsUrl`);
          videoRtc.src = res.directWsUrl;
        }
      });
    }

    // Prepend to camera stage so overlay controls remain on top
    cameraStage.prepend(videoRtc);

    // Set src property to trigger video-rtc onconnect
    videoRtc.src = res.wsUrl;
    cardVideoElements.set(printer.name, videoRtc);

    // Disable native media controls and enforce contain on inner video
    const innerVideo = videoRtc.querySelector('video') || (videoRtc as unknown as { video?: HTMLVideoElement }).video;
    if (innerVideo) {
      innerVideo.controls = false;
      innerVideo.style.objectFit = 'contain';
      innerVideo.style.width = '100%';
      innerVideo.style.height = '100%';
    }

    const liveBadge = cardEl.querySelector('.fleet-cam-live-badge') as HTMLElement | null;
    if (liveBadge) liveBadge.classList.add('hidden');

    // Clear any previous stream verification timer for this printer
    const prevTimer = cardStreamTimers.get(printer.name);
    if (prevTimer) {
      clearTimeout(prevTimer);
      cardStreamTimers.delete(printer.name);
    }

    let markedLive = false;
    const markLive = () => {
      if (markedLive) return;
      markedLive = true;
      const t = cardStreamTimers.get(printer.name);
      if (t) {
        clearTimeout(t);
        cardStreamTimers.delete(printer.name);
      }
      if (liveBadge) liveBadge.classList.remove('hidden');
      if (pausedOverlay) {
        delete pausedOverlay.dataset.streamError;
        pausedOverlay.classList.add('hidden');
        const hint = pausedOverlay.querySelector('.cam-overlay-hint');
        if (hint) hint.classList.add('hidden');
        const resumeBtn = pausedOverlay.querySelector('.btn-card-resume-cam') as HTMLButtonElement | null;
        if (resumeBtn) {
          resumeBtn.disabled = false;
          resumeBtn.innerHTML = '<i data-lucide="play"></i><span>Watch Stream</span>';
        }
      }
    };

    if (innerVideo) {
      innerVideo.addEventListener('playing', markLive, { once: true });
      innerVideo.addEventListener('loadeddata', markLive, { once: true });

      // Observe poster attribute for MJPEG mode
      const observer = new MutationObserver(() => {
        if (innerVideo.getAttribute('poster') || innerVideo.poster) {
          markLive();
          observer.disconnect();
        }
      });
      observer.observe(innerVideo, { attributes: true, attributeFilter: ['poster'] });
    }

    // Monitor for stream failure / dead camera daemon (e.g. ECONNRESET on printer 8080)
    const streamCheckTimer = setTimeout(() => {
      cardStreamTimers.delete(printer.name);
      if (!cardCameraStreaming.get(printer.name)) return;

      const hasPoster = Boolean(innerVideo?.getAttribute('poster') || innerVideo?.poster);
      const isPlaying = Boolean(innerVideo && innerVideo.currentTime > 0);
      if (hasPoster || isPlaying) {
        markLive();
        return;
      }

      console.warn(`[FleetDashboard] Camera stream feed timed out / in-use for ${printer.name}`);
      if (liveBadge) liveBadge.classList.add('hidden');
      if (pausedOverlay) {
        pausedOverlay.classList.remove('hidden');
        pausedOverlay.dataset.streamError = 'busy';
        const text = pausedOverlay.querySelector('.cam-overlay-text');
        if (text) text.textContent = 'Camera In Use / Offline';
        const hint = pausedOverlay.querySelector('.cam-overlay-hint');
        if (hint) {
          const model = (printer.model || '').toLowerCase();
          const isFlashForge =
            model.includes('creator') ||
            model.includes('flashforge') ||
            model.includes('adventurer') ||
            model.includes('5m') ||
            model.includes('ad5');
          hint.textContent = isFlashForge
            ? 'May be open in Flash Studio or another app'
            : 'May be open in another viewer or app';
          hint.classList.remove('hidden');
        }
        const icon = pausedOverlay.querySelector('.cam-overlay-icon');
        if (icon) icon.setAttribute('data-lucide', 'video-off');
        const resumeBtn = pausedOverlay.querySelector('.btn-card-resume-cam') as HTMLButtonElement | null;
        if (resumeBtn) {
          resumeBtn.disabled = false;
          resumeBtn.innerHTML = '<i data-lucide="refresh-cw"></i><span>Retry Stream</span>';
        }
        initializeLucideIcons();
      }
    }, 5000);

    cardStreamTimers.set(printer.name, streamCheckTimer);
  } catch (err) {
    console.error(`[FleetDashboard] Error mounting camera for ${printer.name}:`, err);
    pauseCardCamera(printer.name, cardEl);
  }
}

/**
 * Pause camera stream for a specific printer card
 */
function pauseCardCamera(printerName: string, cardEl?: HTMLElement | null): void {
  const activeTimer = cardStreamTimers.get(printerName);
  if (activeTimer) {
    clearTimeout(activeTimer);
    cardStreamTimers.delete(printerName);
  }

  cardCameraStreaming.set(printerName, false);

  const video = cardVideoElements.get(printerName);
  if (video) {
    try {
      if (typeof video.ondisconnect === 'function') {
        video.ondisconnect();
      }
    } catch {
      // ignore
    }
    video.remove();
    cardVideoElements.delete(printerName);
  }

  const card = cardEl || document.querySelector(`.fleet-dash-card[data-name="${CSS.escape(printerName)}"]`);
  if (card) {
    const playBtn = card.querySelector('.btn-card-cam-play') as HTMLElement | null;
    const pauseBtn = card.querySelector('.btn-card-cam-pause') as HTMLElement | null;
    const pausedOverlay = card.querySelector('.fleet-card-cam-paused-overlay') as HTMLElement | null;
    const liveBadge = card.querySelector('.fleet-cam-live-badge') as HTMLElement | null;

    if (playBtn) playBtn.classList.remove('hidden');
    if (pauseBtn) pauseBtn.classList.add('hidden');
    if (pausedOverlay) {
      pausedOverlay.classList.remove('hidden');
      const resumeBtn = pausedOverlay.querySelector('.btn-card-resume-cam') as HTMLButtonElement | null;
      if (resumeBtn) {
        resumeBtn.disabled = false;
        resumeBtn.innerHTML = '<i data-lucide="play"></i><span>Watch Stream</span>';
        initializeLucideIcons();
      }
    }
    if (liveBadge) liveBadge.classList.add('hidden');
  }
}

/**
 * Play all camera streams across all cards
 */
export function playAllCardCameras(): void {
  for (const printer of cachedOverviewPrinters) {
    if (printer.isConnected && printer.hasCamera && printer.contextId) {
      const card = document.querySelector(
        `.fleet-dash-card[data-name="${CSS.escape(printer.name)}"]`
      ) as HTMLElement | null;
      if (card) {
        void playCardCamera(printer, card);
      }
    }
  }
  showToast('Playing all cameras', 'info');
}

/**
 * Pause all camera streams across all cards
 */
export function pauseAllCardCameras(): void {
  for (const printer of cachedOverviewPrinters) {
    pauseCardCamera(printer.name);
  }
}

/**
 * Cancel timed preview timer and reset preview button label
 */
function cancelTimedPreview(): void {
  if (timedPreviewTimeout) {
    clearTimeout(timedPreviewTimeout);
    timedPreviewTimeout = null;
  }
  if (timedPreviewCountdownInterval) {
    clearInterval(timedPreviewCountdownInterval);
    timedPreviewCountdownInterval = null;
  }
  timedPreviewRemainingSeconds = 0;
  updatePreviewButtonText();
}

/**
 * Start timed preview: plays all cameras for the configured duration (default: 30s),
 * ticks down the remaining seconds, and pauses all cameras when done.
 */
export function startTimedPreview(duration = getSavedPreviewDuration()): void {
  cancelTimedPreview();

  // Start all cameras
  playAllCardCameras();

  timedPreviewRemainingSeconds = duration;
  const btnText = $('btn-dashboard-timed-preview-text');
  if (btnText) {
    btnText.textContent = `Previewing (${timedPreviewRemainingSeconds}s)...`;
  }

  timedPreviewCountdownInterval = setInterval(() => {
    timedPreviewRemainingSeconds -= 1;
    if (timedPreviewRemainingSeconds > 0) {
      if (btnText) {
        btnText.textContent = `Previewing (${timedPreviewRemainingSeconds}s)...`;
      }
    } else {
      cancelTimedPreview();
      pauseAllCardCameras();
      showToast('Timed camera preview ended', 'info');
    }
  }, 1000);

  timedPreviewTimeout = setTimeout(() => {
    cancelTimedPreview();
    pauseAllCardCameras();
  }, duration * 1000);
}

// ============================================================================
// DATA REFRESH & DOM RECONCILIATION
// ============================================================================

/**
 * Render shimmering placeholder skeleton cards for initial Fleet Dashboard load
 */
function renderFleetDashboardSkeletons(count = 2): string {
  return Array.from({ length: count }, () => `
    <div class="fleet-dash-card skeleton-card" aria-hidden="true">
      <div class="fleet-dash-card-header">
        <div class="card-header-left" style="display: flex; align-items: center; gap: 6px;">
          <span class="skeleton-shimmer" style="width: 8px; height: 8px; border-radius: 50%;"></span>
          <span class="skeleton-shimmer" style="width: 110px; height: 14px; border-radius: 4px;"></span>
          <span class="skeleton-shimmer" style="width: 32px; height: 14px; border-radius: 4px;"></span>
        </div>
        <div class="card-header-right">
          <span class="skeleton-shimmer" style="width: 55px; height: 16px; border-radius: 10px;"></span>
        </div>
      </div>
      <div class="fleet-card-camera-box skeleton-cam-box">
        <div class="skeleton-cam-content">
          <span class="loading-spinner"></span>
          <span class="skeleton-cam-text">Connecting to fleet cameras...</span>
        </div>
      </div>
      <div class="fleet-dash-card-body">
        <div class="fleet-job-info-row" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="skeleton-shimmer" style="width: 45%; height: 13px; border-radius: 4px;"></span>
          <span class="skeleton-shimmer" style="width: 30px; height: 13px; border-radius: 4px;"></span>
        </div>
        <div class="skeleton-shimmer" style="width: 100%; height: 4px; margin: 6px 0 10px; border-radius: 2px;"></div>
        <div class="fleet-meta-row" style="display: flex; justify-content: space-between;">
          <span class="skeleton-shimmer" style="width: 35%; height: 12px; border-radius: 4px;"></span>
          <span class="skeleton-shimmer" style="width: 35%; height: 12px; border-radius: 4px;"></span>
        </div>
        <div class="fleet-temp-pills-row" style="margin-top: 8px; display: flex; gap: 8px;">
          <span class="skeleton-shimmer" style="width: 48%; height: 26px; border-radius: 6px;"></span>
          <span class="skeleton-shimmer" style="width: 48%; height: 26px; border-radius: 6px;"></span>
        </div>
      </div>
    </div>
  `).join('');
}

export async function refreshFleetDashboard(isIntervalPoll = false): Promise<void> {
  const grid = $('fleet-dashboard-grid');
  const empty = $('fleet-dashboard-empty');
  const countBadge = $('fleet-dashboard-count-badge');

  // If no printers are cached yet, show skeleton cards immediately
  if (!isIntervalPoll && cachedOverviewPrinters.length === 0) {
    if (grid && !grid.querySelector('.fleet-dash-card:not(.skeleton-card)')) {
      grid.innerHTML = renderFleetDashboardSkeletons(2);
      showElement('fleet-dashboard-grid');
      if (empty) hideElement('fleet-dashboard-empty');
    }
  }

  try {
    const res = await apiRequest<FleetOverviewResponse>('/api/printers/overview');
    if (!res.success || !Array.isArray(res.printers)) {
      if (!isIntervalPoll) {
        showToast(res.error || 'Failed to load fleet overview', 'error');
      }
      return;
    }

    cachedOverviewPrinters = res.printers;
    const totalConfigured = res.totalConfigured ?? cachedOverviewPrinters.length;
    const activePrinters = cachedOverviewPrinters.filter((p) => !p.disabled);

    if (countBadge) {
      const count = activePrinters.length;
      countBadge.textContent = `${count} Printer${count === 1 ? '' : 's'}`;
    }

    const addPrinterBtn = $('btn-dashboard-add-printer');
    // Only show "Add Printer" button if there are no printers configured in the fleet
    if (totalConfigured === 0) {
      if (addPrinterBtn) showElement('btn-dashboard-add-printer');
    } else {
      if (addPrinterBtn) hideElement('btn-dashboard-add-printer');
    }

    if (activePrinters.length === 0) {
      if (grid) hideElement('fleet-dashboard-grid');
      if (empty) {
        showElement('fleet-dashboard-empty');
        const emptyTitle = empty.querySelector('h3');
        const emptyDesc = empty.querySelector('p');
        const emptyAddBtn = $('btn-dashboard-empty-add');
        if (totalConfigured > 0) {
          if (emptyTitle) emptyTitle.textContent = 'All Printers Disabled';
          if (emptyDesc) emptyDesc.textContent = 'All configured fleet printers are currently disabled. Enable printers in Settings > Printers & Fleet.';
          if (emptyAddBtn) hideElement('btn-dashboard-empty-add');
        } else {
          if (emptyTitle) emptyTitle.textContent = 'No Printers Configured';
          if (emptyDesc) emptyDesc.textContent = 'Add your first 3D printer to start monitoring cameras and print jobs.';
          if (emptyAddBtn) showElement('btn-dashboard-empty-add');
        }
      }
      return;
    }

    if (empty) hideElement('fleet-dashboard-empty');
    if (grid) {
      showElement('fleet-dashboard-grid');
      reconcileGridCards(activePrinters, grid);
    }
  } catch (err) {
    if (!isIntervalPoll) {
      console.error('[FleetDashboard] Refresh error:', err);
      showToast('Error refreshing fleet dashboard', 'error');
    }
  }
}

/**
 * Reconciles printer cards in the DOM in-place to avoid tearing down active <video-rtc> streams.
 */
function reconcileGridCards(printers: FleetOverviewPrinter[], gridEl: HTMLElement): void {
  const currentPrinterNames = new Set(printers.map((p) => p.name));

  // 1. Remove skeleton cards and cards that no longer exist
  const existingCards = gridEl.querySelectorAll<HTMLElement>('.fleet-dash-card');
  existingCards.forEach((card) => {
    if (card.classList.contains('skeleton-card')) {
      card.remove();
      return;
    }
    const cardName = card.dataset.name;
    if (cardName && !currentPrinterNames.has(cardName)) {
      pauseCardCamera(cardName, card);
      card.remove();
    }
  });

  // 2. Insert or update cards in-place
  for (const printer of printers) {
    let card = gridEl.querySelector<HTMLElement>(`.fleet-dash-card[data-name="${CSS.escape(printer.name)}"]`);

    if (!card) {
      // Create new card
      card = createCardElement(printer);
      gridEl.appendChild(card);
      initializeLucideIcons();
    } else {
      // Update telemetry in-place
      updateCardInPlace(printer, card);
    }
  }
}

/**
 * Builds a complete printer card DOM element
 */
function createCardElement(printer: FleetOverviewPrinter): HTMLElement {
  const card = document.createElement('div');
  card.className = 'fleet-dash-card';
  card.dataset.name = printer.name;
  card.dataset.serial = printer.serialNumber;
  if (printer.contextId) card.dataset.contextId = printer.contextId;

  const rawState = printer.status?.printerState || (printer.isConnected ? 'Ready' : 'Offline');
  const displayState = rawState.charAt(0).toUpperCase() + rawState.slice(1).toLowerCase();

  const isPrinting = /printing|running|busy/i.test(rawState);
  const isCompleted = /completed|finish/i.test(rawState);
  const isPaused = /pause/i.test(rawState);
  const statusClass = !printer.isConnected
    ? 'status-offline'
    : isPrinting
      ? 'status-printing'
      : isCompleted
        ? 'status-completed'
        : isPaused
          ? 'status-paused'
          : 'status-ready';

  const shortModel = printer.model.includes('Creator 5')
    ? 'C5'
    : printer.model.includes('Creator 4')
      ? 'C4'
      : printer.model.includes('5M')
        ? '5M'
        : /a1\s*mini/i.test(printer.model)
          ? 'A1M'
          : printer.model;

  const rawProgress = printer.status?.progress ?? 0;
  const progress = isCompleted
    ? 100
    : (rawProgress <= 1 && rawProgress > 0 ? Math.round(rawProgress * 100) : Math.round(rawProgress));
  const jobLabel = isCompleted ? 'Completed:' : 'Job:';
  const jobName = printer.status?.jobName || (isCompleted ? 'Finished Print' : (printer.isConnected ? 'No active print job' : 'Printer offline'));
  const progressText = isCompleted ? 'Done' : `${progress}%`;
  const layerText = printer.status?.currentLayer !== null && printer.status?.currentLayer !== undefined
    ? `Layer ${isCompleted && printer.status.totalLayers ? printer.status.totalLayers : printer.status.currentLayer}${printer.status.totalLayers ? ` / ${printer.status.totalLayers}` : ''}`
    : (isCompleted && printer.status?.totalLayers ? `Layer ${printer.status.totalLayers} / ${printer.status.totalLayers}` : '--');
  const etaText = isCompleted ? 'Finished' : (printer.status?.formattedEta || '--');

  const nozzleText = `${printer.status?.nozzleTemperature ?? 0}°C / ${printer.status?.nozzleTargetTemperature ?? 0}°C`;
  const bedText = `${printer.status?.bedTemperature ?? 0}°C / ${printer.status?.bedTargetTemperature ?? 0}°C`;

  // Multi Material mini-chips
  const amsHtml = renderMaterialStationMiniStrip(printer.materialStation, printer.model, printer.status);

  const overlayText = !printer.isConnected
    ? 'Printer Offline'
    : !printer.hasCamera
      ? 'No Camera'
      : 'Camera Standby';
  const overlayIcon = !printer.isConnected
    ? 'wifi-off'
    : !printer.hasCamera
      ? 'video-off'
      : 'video';

  card.innerHTML = `
    <div class="fleet-dash-card-header">
      <div class="card-header-left">
        <span class="card-status-dot ${printer.isConnected ? 'status-connected' : 'status-offline'}"></span>
        <span class="card-printer-name" title="${escapeHtml(printer.name)}">${escapeHtml(printer.name)}</span>
        <span class="card-model-badge">${escapeHtml(shortModel)}</span>
      </div>
      <div class="card-header-right">
        <span class="card-state-pill ${statusClass}" data-field="state-pill">${displayState}</span>
        <span class="card-open-hint" title="Open device view"><i data-lucide="chevron-right"></i></span>
      </div>
    </div>

    <!-- Camera Stage -->
    <div class="fleet-card-camera-box">
      <div class="fleet-cam-live-badge hidden">
        <span class="pulse-dot"></span>
        <span>LIVE</span>
      </div>

      <!-- Controls Overlay on top of camera -->
      <div class="fleet-card-cam-controls-bar">
        <button type="button" class="btn-card-cam-pause mini-glass-btn hidden" title="Pause camera stream">
          <i data-lucide="pause"></i>
        </button>
        <button type="button" class="btn-card-cam-play mini-glass-btn" title="Play camera stream">
          <i data-lucide="play"></i>
        </button>
      </div>

      <!-- Paused / Offline Overlay -->
      <div class="fleet-card-cam-paused-overlay ${printer.isConnected && printer.hasCamera ? '' : 'offline'}">
        <i data-lucide="${overlayIcon}" class="cam-overlay-icon"></i>
        <span class="cam-overlay-text">${overlayText}</span>
        <span class="cam-overlay-hint hidden">May be open in Flash Studio or another app</span>
        ${
          printer.isConnected && printer.hasCamera
            ? '<button type="button" class="btn-card-resume-cam primary-btn mini-btn"><i data-lucide="play"></i><span>Watch Stream</span></button>'
            : ''
        }
      </div>
    </div>

    <!-- Telemetry Summary Body -->
    <div class="fleet-dash-card-body">
      <!-- Job progress row -->
      <div class="fleet-job-info-row">
        <div class="job-name-col">
          <span class="job-label ${isCompleted ? 'completed' : ''}" data-field="job-label">${jobLabel}</span>
          <span class="job-filename" data-field="job-filename" title="${escapeHtml(jobName)}">${escapeHtml(jobName)}</span>
          ${
            isCompleted && printer.isConnected
              ? `<button type="button" class="btn-card-clear-job" title="Acknowledge completed print and reset to Ready"><i data-lucide="check"></i><span>Dismiss</span></button>`
              : ''
          }
        </div>
        <span class="job-progress-pct ${isCompleted ? 'completed' : ''}" data-field="progress-pct">${progressText}</span>
      </div>

      <div class="fleet-progress-bar-track">
        <div class="fleet-progress-bar-fill ${isCompleted ? 'completed' : ''}" data-field="progress-fill" style="width: ${progress}%"></div>
      </div>

      <div class="fleet-hud-stats-group">
        <div class="fleet-meta-row">
          <span class="meta-item"><i data-lucide="layers"></i><span data-field="layer-text">${escapeHtml(layerText)}</span></span>
          <span class="meta-item"><i data-lucide="clock"></i><span data-field="eta-text">${escapeHtml(etaText)}</span></span>
        </div>

        <!-- Temperature pills -->
        <div class="fleet-temp-pills-row">
          <div class="fleet-temp-pill" title="Nozzle Temperature">
            <i data-lucide="flame" class="temp-icon nozzle"></i>
            <span class="temp-val" data-field="nozzle-temp">${escapeHtml(nozzleText)}</span>
          </div>
          <div class="fleet-temp-pill" title="Bed Temperature">
            <i data-lucide="grid" class="temp-icon bed"></i>
            <span class="temp-val" data-field="bed-temp">${escapeHtml(bedText)}</span>
          </div>
        </div>

        <!-- AMS / Material Station strip -->
        <div class="fleet-ams-wrapper" data-field="ams-wrapper">
          ${amsHtml}
        </div>
      </div>
    </div>
  `;

  // Attach card event listeners
  setupCardEvents(printer, card);

  return card;
}

/**
 * Updates text, progress, and temperature values in-place on an existing card
 */
function updateCardInPlace(printer: FleetOverviewPrinter, card: HTMLElement): void {
  // Ensure no active-card highlight exists on dashboard cards
  card.classList.remove('active-card');

  // Remove any legacy selected badge
  const existingBadge = card.querySelector('.card-active-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  // Ensure card open hint chevron is present in header right
  const headerRight = card.querySelector('.card-header-right');
  if (headerRight && !headerRight.querySelector('.card-open-hint')) {
    const hint = document.createElement('span');
    hint.className = 'card-open-hint';
    hint.title = 'Open device view';
    hint.innerHTML = '<i data-lucide="chevron-right"></i>';
    headerRight.appendChild(hint);
    initializeLucideIcons();
  }

  const rawState = printer.status?.printerState || (printer.isConnected ? 'Ready' : 'Offline');
  const displayState = rawState.charAt(0).toUpperCase() + rawState.slice(1).toLowerCase();

  const isPrinting = /printing|running|busy/i.test(rawState);
  const isCompleted = /completed|finish/i.test(rawState);
  const isPaused = /pause/i.test(rawState);
  const statusClass = !printer.isConnected
    ? 'status-offline'
    : isPrinting
      ? 'status-printing'
      : isCompleted
        ? 'status-completed'
        : isPaused
          ? 'status-paused'
          : 'status-ready';

  // State pill & dot
  const statePill = card.querySelector('[data-field="state-pill"]');
  if (statePill) {
    statePill.textContent = displayState;
    statePill.className = `card-state-pill ${statusClass}`;
  }

  const statusDot = card.querySelector('.card-status-dot');
  if (statusDot) {
    statusDot.className = `card-status-dot ${printer.isConnected ? 'status-connected' : 'status-offline'}`;
  }

  // Job progress
  const rawProgress = printer.status?.progress ?? 0;
  const progress = isCompleted
    ? 100
    : (rawProgress <= 1 && rawProgress > 0 ? Math.round(rawProgress * 100) : Math.round(rawProgress));
  const jobLabel = isCompleted ? 'Completed:' : 'Job:';
  const jobName = printer.status?.jobName || (isCompleted ? 'Finished Print' : (printer.isConnected ? 'No active print job' : 'Printer offline'));
  const progressText = isCompleted ? 'Done' : `${progress}%`;
  const layerText = printer.status?.currentLayer !== null && printer.status?.currentLayer !== undefined
    ? `Layer ${isCompleted && printer.status.totalLayers ? printer.status.totalLayers : printer.status.currentLayer}${printer.status.totalLayers ? ` / ${printer.status.totalLayers}` : ''}`
    : (isCompleted && printer.status?.totalLayers ? `Layer ${printer.status.totalLayers} / ${printer.status.totalLayers}` : '--');
  const etaText = isCompleted ? 'Finished' : (printer.status?.formattedEta || '--');

  const jobLabelEl = card.querySelector('[data-field="job-label"]');
  if (jobLabelEl) {
    jobLabelEl.textContent = jobLabel;
    jobLabelEl.classList.toggle('completed', isCompleted);
  }

  const jobNameEl = card.querySelector('[data-field="job-filename"]');
  if (jobNameEl) {
    jobNameEl.textContent = jobName;
    jobNameEl.setAttribute('title', jobName);
  }

  // Dismiss button for completed prints
  const jobCol = card.querySelector('.job-name-col');
  let clearJobBtn = card.querySelector('.btn-card-clear-job') as HTMLButtonElement | null;
  if (isCompleted && printer.isConnected) {
    if (!clearJobBtn && jobCol) {
      clearJobBtn = document.createElement('button');
      clearJobBtn.type = 'button';
      clearJobBtn.className = 'btn-card-clear-job';
      clearJobBtn.title = 'Acknowledge completed print and reset to Ready';
      clearJobBtn.innerHTML = '<i data-lucide="check"></i><span>Dismiss</span>';
      attachClearJobHandler(clearJobBtn, printer);
      jobCol.appendChild(clearJobBtn);
      initializeLucideIcons();
    }
  } else if (clearJobBtn) {
    clearJobBtn.remove();
  }

  const progressPct = card.querySelector('[data-field="progress-pct"]');
  if (progressPct) {
    progressPct.textContent = progressText;
    progressPct.classList.toggle('completed', isCompleted);
  }

  const progressFill = card.querySelector<HTMLElement>('[data-field="progress-fill"]');
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
    progressFill.classList.toggle('completed', isCompleted);
  }

  const layerEl = card.querySelector('[data-field="layer-text"]');
  if (layerEl) layerEl.textContent = layerText;

  const etaEl = card.querySelector('[data-field="eta-text"]');
  if (etaEl) etaEl.textContent = etaText;

  // Temperatures
  const nozzleText = `${printer.status?.nozzleTemperature ?? 0}°C / ${printer.status?.nozzleTargetTemperature ?? 0}°C`;
  const bedText = `${printer.status?.bedTemperature ?? 0}°C / ${printer.status?.bedTargetTemperature ?? 0}°C`;

  const nozzleEl = card.querySelector('[data-field="nozzle-temp"]');
  if (nozzleEl) nozzleEl.textContent = nozzleText;

  const bedEl = card.querySelector('[data-field="bed-temp"]');
  if (bedEl) bedEl.textContent = bedText;

  // Multi Material strip
  const amsWrapper = card.querySelector('[data-field="ams-wrapper"]');
  if (amsWrapper) {
    amsWrapper.innerHTML = renderMaterialStationMiniStrip(printer.materialStation, printer.model, printer.status);
  }

  // Camera overlay reconciliation
  const isStreaming = Boolean(cardCameraStreaming.get(printer.name) && cardVideoElements.has(printer.name));
  const pausedOverlay = card.querySelector('.fleet-card-cam-paused-overlay') as HTMLElement | null;
  const liveBadge = card.querySelector('.fleet-cam-live-badge') as HTMLElement | null;
  const playBtn = card.querySelector('.btn-card-cam-play') as HTMLElement | null;
  const pauseBtn = card.querySelector('.btn-card-cam-pause') as HTMLElement | null;

  if (!printer.isConnected || !printer.hasCamera) {
    if (isStreaming) {
      pauseCardCamera(printer.name, card);
    }
    if (pausedOverlay) {
      pausedOverlay.classList.add('offline');
      if (!isStreaming) pausedOverlay.classList.remove('hidden');
      const icon = pausedOverlay.querySelector('.cam-overlay-icon');
      if (icon) {
        icon.setAttribute('data-lucide', printer.isConnected ? 'video-off' : 'wifi-off');
      }
      const text = pausedOverlay.querySelector('.cam-overlay-text');
      if (text) {
        text.textContent = printer.isConnected ? 'No Camera Available' : 'Printer Offline';
      }
      const resumeBtn = pausedOverlay.querySelector('.btn-card-resume-cam');
      if (resumeBtn) resumeBtn.remove();
    }
    if (liveBadge) liveBadge.classList.add('hidden');
  } else {
    // Connected with camera
    if (pausedOverlay) {
      pausedOverlay.classList.remove('offline');
      const text = pausedOverlay.querySelector('.cam-overlay-text');
      const hint = pausedOverlay.querySelector('.cam-overlay-hint');
      if (text && !pausedOverlay.dataset.streamError) {
        text.textContent = 'Camera Standby';
        if (hint) hint.classList.add('hidden');
      }
      const icon = pausedOverlay.querySelector('.cam-overlay-icon');
      if (icon && !pausedOverlay.dataset.streamError) {
        icon.setAttribute('data-lucide', 'video');
      }

      let resumeBtn = pausedOverlay.querySelector('.btn-card-resume-cam') as HTMLButtonElement | null;
      if (!resumeBtn) {
        resumeBtn = document.createElement('button');
        resumeBtn.type = 'button';
        resumeBtn.className = 'btn-card-resume-cam primary-btn mini-btn';
        resumeBtn.innerHTML = '<i data-lucide="play"></i><span>Watch Stream</span>';
        resumeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void playCardCamera(printer, card);
        });
        pausedOverlay.appendChild(resumeBtn);
        initializeLucideIcons();
      }

      if (isStreaming) {
        pausedOverlay.classList.add('hidden');
        if (liveBadge) liveBadge.classList.remove('hidden');
        if (playBtn) playBtn.classList.add('hidden');
        if (pauseBtn) pauseBtn.classList.remove('hidden');
      } else {
        pausedOverlay.classList.remove('hidden');
        if (liveBadge) liveBadge.classList.add('hidden');
        if (playBtn) playBtn.classList.remove('hidden');
        if (pauseBtn) pauseBtn.classList.add('hidden');
      }
    }
  }
}

/**
 * Render Multi Material mini color dot chips with filament type and head/slot labels
 */
function renderMaterialStationMiniStrip(
  station?: MaterialStationStatus | null,
  model?: string,
  status?: FleetOverviewStatus | null
): string {
  if (!station || !station.connected || !Array.isArray(station.slots) || station.slots.length === 0) {
    return '';
  }

  const isMultiHead =
    /creator\s*(5|pro|4)/i.test(model || '') ||
    Boolean(status?.toolTemps && status.toolTemps.length > 1);

  const chips = station.slots
    .map((slot, index) => {
      const slotNum = slot.slotId >= 1 ? slot.slotId : index + 1;
      const isEmpty = Boolean(slot.isEmpty);
      const color = slot.materialColor || (isEmpty ? '#333333' : '#888888');
      const type = isEmpty ? 'Empty' : (slot.materialType || 'PLA').toUpperCase();
      const isActive =
        station.activeSlot === slot.slotId ||
        (station.activeSlot !== null && station.activeSlot + 1 === slotNum) ||
        station.activeSlot === index;

      const labelPrefix = isMultiHead ? 'Head' : 'Slot';
      const chipBadge = isMultiHead ? `H${slotNum}` : `${slotNum}`;
      const titleText = `${labelPrefix} ${slotNum}: ${escapeHtml(type)}${!isEmpty ? ` (${escapeHtml(color)})` : ''}`;

      return `
        <div class="ams-mini-chip ${isActive ? 'active-slot' : ''} ${isEmpty ? 'empty-slot' : ''}" title="${titleText}">
          <span class="ams-mini-slot-num">${chipBadge}</span>
          <span class="ams-mini-color" style="background-color: ${escapeHtml(color)};"></span>
          <span class="ams-mini-type">${escapeHtml(type)}</span>
        </div>
      `;
    })
    .join('');

  return `<div class="ams-mini-strip">${chips}</div>`;
}

/**
 * Attach click listener to clear completed job status button
 */
function attachClearJobHandler(button: HTMLButtonElement, printer: FleetOverviewPrinter): void {
  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    button.disabled = true;
    button.innerHTML = '<span class="btn-spinner"></span><span>Clearing...</span>';
    try {
      showToast(`Clearing completed job for ${printer.name}...`, 'info');
      await apiRequest('/api/printer/control/clear-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId: printer.contextId }),
      });
      showToast(`Cleared completed job for ${printer.name}`, 'success');
      await refreshFleetDashboard();
    } catch (err) {
      console.error('[FleetDashboard] Failed to clear status:', err);
      showToast(`Failed to clear status: ${err instanceof Error ? err.message : String(err)}`, 'error');
      button.disabled = false;
      button.innerHTML = '<i data-lucide="check"></i><span>Dismiss</span>';
      initializeLucideIcons();
    }
  });
}

/**
 * Attach user interaction events to a printer card
 */
function setupCardEvents(printer: FleetOverviewPrinter, card: HTMLElement): void {
  const clearJobBtn = card.querySelector('.btn-card-clear-job') as HTMLButtonElement | null;
  if (clearJobBtn) {
    attachClearJobHandler(clearJobBtn, printer);
  }

  // Entire card body or "Open Device View" button clicks navigate to full Device view
  const openFullView = async () => {
    await openPrinterFullView(printer);
  };

  card.querySelector('.btn-card-open-device')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void openFullView();
  });

  card.querySelector('.fleet-dash-card-header')?.addEventListener('click', () => {
    void openFullView();
  });

  card.querySelector('.fleet-dash-card-body')?.addEventListener('click', (e) => {
    // Avoid triggering navigation when clicking on interactive buttons inside body
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    void openFullView();
  });

  // Clicking on camera stage (outside control buttons) also opens full device view
  card.querySelector('.fleet-card-camera-box')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    void openFullView();
  });

  // Per-card camera Play / Pause
  card.querySelector('.btn-card-cam-play')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void playCardCamera(printer, card);
  });

  card.querySelector('.btn-card-cam-pause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    pauseCardCamera(printer.name, card);
  });

  card.querySelector('.btn-card-resume-cam')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void playCardCamera(printer, card);
  });
}

/**
 * Drill-down action: switches active context to this printer and navigates to Device view
 */
async function openPrinterFullView(printer: FleetOverviewPrinter): Promise<void> {
  // If already active context, simply switch view
  if (printer.isActive) {
    switchToStatusView();
    initializeCamera();
    void fetchAmsStatus();
    return;
  }

  const card = document.querySelector(`.fleet-dash-card[data-name="${CSS.escape(printer.name)}"]`) as HTMLElement | null;
  let overlay: HTMLElement | null = null;
  if (card) {
    overlay = document.createElement('div');
    overlay.className = 'card-switching-overlay';
    overlay.innerHTML = '<span class="loading-spinner"></span><span>Switching to printer...</span>';
    card.appendChild(overlay);
  }

  try {
    if (printer.contextId) {
      await switchPrinterContext(printer.contextId);
    } else {
      // Connect / select via API
      updateConnectionStatus(false, true);
      setPrinterStatusLoading(true);
      showCameraConnectingState();
      updateDeviceSubtabPill(printer.name, printer.model, false, true);

      const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
        `/api/printers/${encodeURIComponent(printer.name)}/select`,
        { method: 'POST' }
      );
      if (!res.success) {
        showToast(res.error || `Failed to switch to ${printer.name}`, 'error');
        updateConnectionStatus(false);
        setPrinterStatusLoading(false);
        return;
      }
      await fetchPrinterContexts();
    }

    // Refresh context dependencies
    await loadPrintersList();
    await loadPrinterFeatures();
    await loadSpoolmanConfig();
    ensureSpoolmanVisibilityIfEnabled();

    // Navigate to full device view
    switchToStatusView();
    initializeCamera();
    void fetchAmsStatus();
  } catch (err) {
    console.error(`[FleetDashboard] Error switching to ${printer.name}:`, err);
    showToast(`Error switching to ${printer.name}`, 'error');
    updateConnectionStatus(false);
    setPrinterStatusLoading(false);
  } finally {
    overlay?.remove();
  }
}

// ============================================================================
// TOOLBAR CONTROLS EVENT SETUP
// ============================================================================

export function setupFleetDashboardHandlers(): void {
  // Play All button
  $('btn-dashboard-play-all')?.addEventListener('click', () => {
    playAllCardCameras();
  });

  // Pause All button
  $('btn-dashboard-pause-all')?.addEventListener('click', () => {
    cancelTimedPreview();
    pauseAllCardCameras();
    showToast('Paused all camera streams', 'info');
  });

  // Timed Preview button
  $('btn-dashboard-timed-preview')?.addEventListener('click', () => {
    startTimedPreview();
  });

  // Duration dropdown
  const durationSelect = $('dashboard-preview-duration-select') as HTMLSelectElement | null;
  durationSelect?.addEventListener('change', () => {
    const val = parseInt(durationSelect.value, 10);
    setSavedPreviewDuration(val);
  });

  // Density toggle button (HUD vs Detailed)
  $('btn-dashboard-density-toggle')?.addEventListener('click', () => {
    const current = getSavedFleetDensity();
    const next = current === 'hud' ? 'detailed' : 'hud';
    setSavedFleetDensity(next);
  });

  // Add Printer buttons
  $('btn-dashboard-add-printer')?.addEventListener('click', () => {
    openAddPrinterForm();
  });

  $('btn-dashboard-empty-add')?.addEventListener('click', () => {
    openAddPrinterForm();
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * @fileoverview Frontend UI logic and event wiring for the Obico AI Watchdog.
 *
 * Manages the camera header badge, quick sensitivity status strip, live detection telemetries,
 * snapshot gallery, and the emergency auto-pause alert banner.
 */

import type { WatchdogStatusData } from '../app.js';
import { getCurrentContextId } from '../core/AppState.js';
import { apiRequest } from '../core/Transport.js';
import { $, hideElement, showElement, showToast } from '../shared/dom.js';
import { initializeLucideIcons } from '../shared/icons.js';
import { sendPrinterCommand } from './job-control.js';

interface WatchdogSnapshotItem {
  filename: string;
  timestamp: string;
  confidence: number;
  layer: string;
}

let latestStatusData: WatchdogStatusData | null = null;
let isConfigInitialized = false;

export function updateWatchdogUI(watchdog?: WatchdogStatusData): void {
  latestStatusData = watchdog || null;

  const badgeBtn = $('btn-watchdog-badge');
  const badgeText = $('watchdog-status-text');
  const pauseBanner = $('watchdog-auto-pause-banner');
  const quickThreshVal = $('cam-watchdog-thresh-val');

  if (watchdog && watchdog.threshold !== undefined && quickThreshVal) {
    quickThreshVal.textContent = `${Math.round(watchdog.threshold * 100)}%`;
  }

  if (badgeBtn && badgeText) {
    badgeBtn.classList.remove('monitoring', 'alert', 'idle', 'paused', 'offline');

    if (!watchdog || !watchdog.online) {
      badgeBtn.classList.add('offline');
      badgeText.textContent = 'AI Guard: Disconnected';
      badgeBtn.title = 'AI Watchdog is currently offline or unreachable';
      if (pauseBanner) {
        hideElement('watchdog-auto-pause-banner');
      }
    } else {
      const state = watchdog.state || 'monitoring';
      badgeBtn.classList.add(state);

      switch (state) {
        case 'alert': {
          const pct = Math.round(watchdog.confidence * 100);
          badgeText.textContent = `AI Alert: ${pct}%`;
          badgeBtn.title = `Spaghetti defect detected (${pct}% confidence, ${watchdog.consecutive_failures}/${watchdog.consecutive_required} frames)`;
          break;
        }
        case 'monitoring':
          badgeText.textContent = 'AI Guard: Clean';
          badgeBtn.title = `Chamber clean. Last GPU inference: ${watchdog.inference_time_ms}ms`;
          break;
        case 'idle':
          badgeText.textContent = 'AI Guard: Ready';
          badgeBtn.title = 'AI Watchdog online & ready — monitoring starts automatically with next print';
          break;
        case 'paused':
          badgeText.textContent = 'AI Guard: Paused';
          badgeBtn.title = 'Print paused — AI monitoring suspended';
          break;
        default:
          badgeText.textContent = 'AI Guard';
          break;
      }

      // Auto-pause banner visibility
      if (pauseBanner) {
        if (watchdog.auto_pause_triggered && (state === 'alert' || state === 'paused')) {
          showElement('watchdog-auto-pause-banner');
          const desc = $('watchdog-banner-desc');
          if (desc) {
            desc.textContent = `Defect confirmed at Layer ${watchdog.layer || 'N/A'} (${Math.round(watchdog.confidence * 100)}% confidence). Printer safely paused.`;
          }
        } else {
          hideElement('watchdog-auto-pause-banner');
        }
      }
    }
  }

  // Update modal metrics if modal is currently open
  const modal = $('watchdog-modal');
  if (modal && !modal.classList.contains('hidden') && watchdog) {
    updateModalTelemetry(watchdog);
  }

  // Sync inputs on initial receive
  if (watchdog && !isConfigInitialized) {
    syncFormInputs(watchdog);
    isConfigInitialized = true;
  }
}

function syncFormInputs(s: WatchdogStatusData): void {
  const pct = s.threshold !== undefined ? Math.round(s.threshold * 100) : 20;
  const consec = s.consecutive_required !== undefined ? s.consecutive_required.toString() : '2';
  const autoPause = Boolean(s.auto_pause_enabled);

  // Modal inputs
  const slider = $('watchdog-threshold-slider') as HTMLInputElement | null;
  const display = $('watchdog-threshold-display');
  const toggleAuto = $('watchdog-toggle-autopause') as HTMLInputElement | null;
  const consecSelect = $('watchdog-consecutive-select') as HTMLSelectElement | null;

  if (slider) slider.value = pct.toString();
  if (display) display.textContent = `${pct}%`;
  if (toggleAuto) toggleAuto.checked = autoPause;
  if (consecSelect) consecSelect.value = consec;

  const quickThresh = $('cam-watchdog-thresh-val');
  if (quickThresh) quickThresh.textContent = `${pct}%`;
}

function updateModalTelemetry(watchdog: WatchdogStatusData): void {
  const dot = $('modal-watchdog-dot');
  if (dot) {
    dot.className = `watchdog-status-dot-large ${watchdog.online ? watchdog.state : 'offline'}`;
  }

  const valStatus = $('watchdog-val-status');
  if (valStatus) {
    if (!watchdog.online) {
      valStatus.textContent = 'DISCONNECTED';
      valStatus.style.color = 'var(--warning-color, #ff9800)';
    } else if (watchdog.state === 'idle') {
      valStatus.textContent = 'READY';
      valStatus.style.color = 'var(--success-color, #00e676)';
    } else if (watchdog.state === 'monitoring') {
      valStatus.textContent = 'MONITORING';
      valStatus.style.color = 'var(--success-color, #00e676)';
    } else if (watchdog.state === 'alert') {
      valStatus.textContent = 'ALERT';
      valStatus.style.color = 'var(--error-color, #ef4444)';
    } else if (watchdog.state === 'paused') {
      valStatus.textContent = 'PAUSED';
      valStatus.style.color = 'var(--warning-color, #ff9800)';
    } else {
      valStatus.textContent = watchdog.state.toUpperCase();
      valStatus.style.color = '';
    }
  }

  const valConf = $('watchdog-val-confidence');
  if (valConf) {
    valConf.textContent = `${Math.round(watchdog.confidence * 100)}%`;
  }

  const valLatency = $('watchdog-val-latency');
  if (valLatency) {
    valLatency.textContent = `${watchdog.inference_time_ms} ms`;
  }

  const valAlerts = $('watchdog-val-alerts');
  if (valAlerts) {
    valAlerts.textContent = `${watchdog.total_failures_detected} (${watchdog.consecutive_failures}/${watchdog.consecutive_required})`;
  }
}

export function openWatchdogModal(): void {
  const modal = $('watchdog-modal');
  if (!modal) {
    return;
  }
  showElement('watchdog-modal');
  initializeLucideIcons();
  refreshWatchdogSnapshot();
  void loadWatchdogConfig();
  void loadWatchdogSnapshots();
}

export function closeWatchdogModal(): void {
  hideElement('watchdog-modal');
}

export function refreshWatchdogSnapshot(): void {
  const img = $('watchdog-latest-snapshot') as HTMLImageElement | null;
  const timeSpan = $('watchdog-frame-time');
  const contextId = getCurrentContextId();
  if (img) {
    const ctxQuery = contextId ? `&contextId=${encodeURIComponent(contextId)}` : '';
    img.src = `/api/watchdog/snapshot/latest?t=${Date.now()}${ctxQuery}`;
  }
  if (timeSpan) {
    timeSpan.textContent = `Last check: ${new Date().toLocaleTimeString()}`;
  }
}

export async function loadWatchdogConfig(): Promise<void> {
  try {
    const contextId = getCurrentContextId();
    const url = `/api/watchdog/status${contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''}`;
    const res = await apiRequest<{ success: boolean; status?: WatchdogStatusData }>(url);
    if (res.success && res.status) {
      latestStatusData = res.status;
      updateWatchdogUI(res.status);
      updateModalTelemetry(res.status);
      syncFormInputs(res.status);
    }
  } catch (err) {
    console.warn('Failed to load watchdog status:', err);
  }
}

export async function saveWatchdogConfig(): Promise<void> {
  const toggleAuto = ($('watchdog-toggle-autopause') as HTMLInputElement | null)?.checked;
  const slider = $('watchdog-threshold-slider') as HTMLInputElement | null;
  const consecSelect = $('watchdog-consecutive-select') as HTMLSelectElement | null;

  const threshold = slider ? parseFloat(slider.value) / 100 : 0.2;
  const consecutiveRequired = consecSelect ? parseInt(consecSelect.value, 10) : 2;
  const autoPauseEnabled = toggleAuto ?? true;

  try {
    const res = await apiRequest<{ success: boolean; error?: string }>('/api/watchdog/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threshold,
        consecutive_required: consecutiveRequired,
        auto_pause_enabled: autoPauseEnabled,
      }),
    });

    if (res.success) {
      showToast('Watchdog settings updated', 'success');
      if (latestStatusData) {
        latestStatusData.threshold = threshold;
        latestStatusData.consecutive_required = consecutiveRequired;
        latestStatusData.auto_pause_enabled = autoPauseEnabled;
      }
      syncFormInputs({
        online: true,
        state: latestStatusData?.state || 'monitoring',
        confidence: latestStatusData?.confidence || 0,
        consecutive_failures: latestStatusData?.consecutive_failures || 0,
        consecutive_required: consecutiveRequired,
        threshold,
        inference_time_ms: latestStatusData?.inference_time_ms || 0,
        last_check: latestStatusData?.last_check || null,
        active_job: latestStatusData?.active_job || null,
        layer: latestStatusData?.layer || null,
        auto_pause_enabled: autoPauseEnabled,
        auto_pause_triggered: latestStatusData?.auto_pause_triggered || false,
        total_inspections: latestStatusData?.total_inspections || 0,
        total_failures_detected: latestStatusData?.total_failures_detected || 0,
        printer_status: latestStatusData?.printer_status || '',
      });
    } else {
      showToast(res.error || 'Failed to update settings', 'error');
    }
  } catch (err) {
    console.error('Error saving watchdog config:', err);
    showToast('Failed to save watchdog settings', 'error');
  }
}

export async function loadWatchdogSnapshots(): Promise<void> {
  const container = $('watchdog-snapshots-gallery');
  if (!container) {
    return;
  }

  try {
    const contextId = getCurrentContextId();
    const url = `/api/watchdog/snapshots${contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''}`;
    const res = await apiRequest<{ success: boolean; snapshots?: WatchdogSnapshotItem[] }>(url);
    if (res.success && Array.isArray(res.snapshots) && res.snapshots.length > 0) {
      container.innerHTML = '';
      res.snapshots.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'watchdog-snap-thumb';
        const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : 'Recent';
        card.innerHTML = `
          <img src="/api/watchdog/snapshot/${encodeURIComponent(item.filename)}" alt="Detection snapshot" />
          <div class="thumb-label">
            <span>${Math.round(item.confidence * 100)}%</span>
            <span>${dateStr}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          const mainImg = $('watchdog-latest-snapshot') as HTMLImageElement | null;
          if (mainImg) {
            mainImg.src = `/api/watchdog/snapshot/${encodeURIComponent(item.filename)}`;
          }
          const timeSpan = $('watchdog-frame-time');
          if (timeSpan) {
            timeSpan.textContent = `Viewing snapshot: ${item.filename} (${dateStr})`;
          }
        });
        container.appendChild(card);
      });
    } else {
      container.innerHTML = '<div class="watchdog-gallery-empty">No failure detections recorded</div>';
    }
  } catch (err) {
    console.warn('Failed to load snapshots:', err);
  }
}

let isDelegatedListenerInitialized = false;

export function setupWatchdogUI(): void {
  if (isDelegatedListenerInitialized) {
    return;
  }
  isDelegatedListenerInitialized = true;

  // Delegated click handler on document
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Open watchdog inspection & tuning modal
    if (
      target.closest('#btn-watchdog-badge') ||
      target.closest('#btn-watchdog-settings') ||
      target.closest('#btn-quick-sensitivity') ||
      target.closest('#btn-banner-inspect-watchdog')
    ) {
      e.preventDefault();
      openWatchdogModal();
      return;
    }

    // Close watchdog modal
    if (target.closest('#close-watchdog-modal')) {
      e.preventDefault();
      closeWatchdogModal();
      return;
    }

    // Refresh snapshot
    if (target.closest('#btn-refresh-watchdog-snapshot')) {
      e.preventDefault();
      refreshWatchdogSnapshot();
      return;
    }

    // Save from Watchdog Modal
    if (target.closest('#btn-save-watchdog-settings')) {
      e.preventDefault();
      await saveWatchdogConfig();
      return;
    }

    // Banner Resume Print
    if (target.closest('#btn-banner-resume-print')) {
      e.preventDefault();
      await sendPrinterCommand('control/resume');
      hideElement('watchdog-auto-pause-banner');
      return;
    }

    // Banner Cancel Print
    if (target.closest('#btn-banner-cancel-print')) {
      e.preventDefault();
      await sendPrinterCommand('control/cancel');
      hideElement('watchdog-auto-pause-banner');
      return;
    }
  });

  // Slider input listener with live value badge
  document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.id === 'watchdog-threshold-slider') {
      const val = (target as HTMLInputElement).value;
      const display = $('watchdog-threshold-display');
      if (display) display.textContent = `${val}%`;

      const quickThresh = $('cam-watchdog-thresh-val');
      if (quickThresh) quickThresh.textContent = `${val}%`;
    }
  });

  // Initial config load
  void loadWatchdogConfig();
}

/**
 * @fileoverview Printer job control helpers and event wiring for the WebUI client.
 *
 * Handles printer command dispatch, feature loading, and job start workflow
 * orchestration (including AD5X material matching hand-off). Also wires up the
 * core control panel buttons plus the WebSocket keep-alive ping so `app.ts`
 * can focus purely on high-level initialization.
 */

import type {
  MaterialMapping,
  PendingJobStart,
  PrinterCommandResponse,
  PrinterFeaturesResponse,
  PrintJobStartResponse,
} from '../app.js';
import { getCurrentSettings, state } from '../core/AppState.js';
import { apiRequest, sendCommand } from '../core/Transport.js';
import { $, hideElement, showToast } from '../shared/dom.js';
import { isAD5XJobFile } from '../shared/formatting.js';
import { loadFileList, showTemperatureDialog } from '../ui/dialogs.js';
import { switchToStatusView } from '../ui/views.js';
import { applySettings, refreshSettingsUI } from './layout-theme.js';
import { openMaterialMatchingModal } from './material-matching.js';

const KEEP_ALIVE_INTERVAL_MS = 30000;
let keepAliveTimer: number | null = null;

const PREVIEW_STORAGE_KEY = 'webui_show_model_preview';

export function isModelPreviewVisible(): boolean {
  return window.localStorage.getItem(PREVIEW_STORAGE_KEY) === 'true';
}

export function setModelPreviewVisible(visible: boolean): void {
  window.localStorage.setItem(PREVIEW_STORAGE_KEY, visible ? 'true' : 'false');
  applyModelPreviewVisibility(visible);
}

export function toggleModelPreviewVisibility(): void {
  setModelPreviewVisible(!isModelPreviewVisible());
}

export function applyModelPreviewVisibility(visible: boolean): void {
  const container = document.getElementById('printing-progress-preview-container');
  const btn = document.getElementById('btn-toggle-preview');

  if (container) {
    if (visible) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  }

  if (btn) {
    btn.classList.toggle('active', visible);
    const title = visible ? 'Hide Model Preview' : 'Show Model Preview';
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
}


function hasMaterialStationSupport(): boolean {
  return Boolean(state.printerFeatures?.hasMaterialStation);
}

export async function sendPrinterCommand(endpoint: string, data?: unknown): Promise<void> {
  if (state.authRequired && !state.authToken) {
    showToast('Not authenticated', 'error');
    return;
  }

  try {
    const result = await apiRequest<PrinterCommandResponse>(`/api/printer/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (result.success) {
      showToast(result.message || 'Command sent', 'success');
    } else {
      showToast(result.error || 'Command failed', 'error');
    }
  } catch (error) {
    console.error('Command error:', error);
    showToast('Failed to send command', 'error');
  }
}

export async function loadPrinterFeatures(): Promise<void> {
  if (state.authRequired && !state.authToken) {
    return;
  }

  try {
    const result = await apiRequest<PrinterFeaturesResponse>('/api/printer/features');

    if (result.success && result.features) {
      state.printerFeatures = result.features;
      updateFeatureVisibility();

      const settings = getCurrentSettings();
      applySettings(settings);
      refreshSettingsUI(settings);
    }
  } catch (error) {
    console.error('Failed to load printer features:', error);
  }
}

export function updateFeatureVisibility(): void {
  // Feature visibility checks can be added here if needed
}

interface JobStartOptions {
  filename: string;
  leveling: boolean;
  startNow: boolean;
  materialMappings?: MaterialMapping[];
}

export async function startPrintJob(): Promise<void> {
  if (!state.selectedFile) {
    showToast('Select a file before starting a job', 'error');
    return;
  }

  if (state.authRequired && !state.authToken) {
    showToast('Not authenticated', 'error');
    return;
  }

  const subpageAutoLevel = ($('subpage-auto-level') as HTMLInputElement | null)?.checked;
  const modalAutoLevel = ($('auto-level') as HTMLInputElement | null)?.checked;
  const autoLevel = subpageAutoLevel ?? modalAutoLevel ?? false;

  const subpageStartNow = ($('subpage-start-now') as HTMLInputElement | null)?.checked;
  const modalStartNow = ($('start-now') as HTMLInputElement | null)?.checked;
  const startNow = subpageStartNow ?? modalStartNow ?? true;
  const jobInfo = state.jobMetadata.get(state.selectedFile);

  if (startNow && hasMaterialStationSupport() && isAD5XJobFile(jobInfo)) {
    const pendingJob: PendingJobStart = {
      filename: state.selectedFile,
      leveling: autoLevel,
      startNow,
      job: jobInfo,
    };

    state.pendingJobStart = pendingJob;
    await openMaterialMatchingModal(pendingJob);
    return;
  }

  const success = await sendJobStartRequest({
    filename: state.selectedFile,
    leveling: autoLevel,
    startNow,
  });

  if (success) {
    hideElement('file-modal');
    state.pendingJobStart = null;
    switchToStatusView();
  }
}

export async function sendJobStartRequest(options: JobStartOptions): Promise<boolean> {
  if (state.authRequired && !state.authToken) {
    showToast('Not authenticated', 'error');
    return false;
  }

  try {
    const result = await apiRequest<PrintJobStartResponse>('/api/jobs/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: options.filename,
        leveling: options.leveling,
        startNow: options.startNow,
        materialMappings: options.materialMappings,
      }),
    });

    if (result.success) {
      showToast(result.message || 'Print job started', 'success');
      return true;
    }

    showToast(result.error || 'Failed to start print', 'error');
    return false;
  } catch (error) {
    console.error('Failed to start print:', error);
    showToast('Failed to start print job', 'error');
    return false;
  }
}

export function setupJobControlEventHandlers(): void {
  const containers = [
    $('device-dashboard'),
    $('bambu-status-view'),
    $('status-col-left'),
    $('status-col-right'),
    $('webui-grid-desktop'),
    $('webui-grid-mobile'),
  ].filter((c): c is HTMLElement => c !== null);

  // Remove duplicates
  const uniqueContainers = Array.from(new Set(containers));

  uniqueContainers.forEach((container) => {
    container.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button') as HTMLButtonElement | null;
      if (!button || button.disabled) {
        return;
      }

      let handled = true;
      switch (button.id) {
        case 'btn-cam-fullscreen': {
          const camContainer = $('camera-container');
          if (camContainer) {
            if (document.fullscreenElement) {
              void document.exitFullscreen();
            } else {
              void camContainer.requestFullscreen();
            }
          }
          break;
        }
        case 'btn-cam-pause-resume': {
          if (state.printerStatus?.printerState === 'Paused') {
            await sendPrinterCommand('control/resume');
          } else {
            await sendPrinterCommand('control/pause');
          }
          break;
        }
        case 'btn-toggle-preview':
          toggleModelPreviewVisibility();
          break;
        case 'btn-cam-stop':
          await sendPrinterCommand('control/cancel');
          break;
        case 'btn-clear-status':
          await sendPrinterCommand('control/clear-status');
          break;
        case 'btn-bed-set':
          showTemperatureDialog('bed');
          break;
        case 'btn-bed-off':
          await sendPrinterCommand('temperature/bed/off');
          break;
        case 'btn-extruder-set':
          showTemperatureDialog('extruder');
          break;
        case 'btn-extruder-off':
          await sendPrinterCommand('temperature/extruder/off');
          break;
        case 'btn-start-recent':
          await loadFileList('recent');
          break;
        case 'btn-start-local':
          await loadFileList('local');
          break;
        case 'btn-refresh':
          sendCommand({ command: 'REQUEST_STATUS' });
          break;
        default: {
          const toolAction = button.dataset.toolAction;
          const toolIndexStr = button.dataset.toolIndex;
          if (toolAction && toolIndexStr !== undefined) {
            const toolIndex = parseInt(toolIndexStr, 10);
            if (toolAction === 'set') {
              showTemperatureDialog('extruder', toolIndex);
            } else if (toolAction === 'off') {
              await sendPrinterCommand('temperature/extruder/off', { toolIndex });
            }
          } else {
            handled = false;
          }
          break;
        }
      }

      if (handled) {
        event.preventDefault();
      }
    });
  });

  applyModelPreviewVisibility(isModelPreviewVisible());

  if (keepAliveTimer === null) {
    keepAliveTimer = window.setInterval(() => {
      if (state.isConnected && state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        sendCommand({ command: 'PING' });
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  }
}

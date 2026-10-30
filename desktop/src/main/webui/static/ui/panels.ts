/**
 * @fileoverview UI panel rendering helpers for the WebUI client.
 *
 * Contains pure rendering logic for the header connection indicator, printer
 * status cards, statistics panels, and Spoolman tracker. These functions are
 * stateless aside from reading from the shared AppState container and can be
 * safely reused by WebSocket handlers, layout refresh hooks, or manual refresh
 * actions.
 */

import type { PrinterStatus } from '../app.js';
import { contextById, getCurrentContextId, getCurrentPrinterSerial, state } from '../core/AppState.js';
import { isSpoolmanAvailableForCurrentContext } from '../features/layout-theme.js';
import { $, hideElement, setTextContent, showElement } from '../shared/dom.js';
import {
  formatElapsedSeconds,
  formatETA,
  formatETAFromString,
  formatLifetimeFilament,
  formatLifetimePrintTime,
  formatTime,
} from '../shared/formatting.js';
import { hydrateLucideIcons } from '../shared/icons.js';
import { updateWatchdogUI } from '../features/watchdog-ui.js';
import { getCachedAmsStatus } from '../features/ams-manager.js';

export function updateConnectionStatus(connected: boolean, isConnecting = false): void {
  const indicators = [$('connection-indicator'), $('mobile-connection-indicator')];
  const texts = [$('connection-text'), $('mobile-connection-text')];

  indicators.forEach((indicator) => {
    if (indicator) {
      indicator.classList.remove('connected', 'connecting');
      if (isConnecting) {
        indicator.classList.add('connecting');
      } else if (connected) {
        indicator.classList.add('connected');
      }
    }
  });

  texts.forEach((text) => {
    if (text) {
      text.textContent = isConnecting ? 'Connecting...' : (connected ? 'Connected' : 'Disconnected');
    }
  });
}

/**
 * Display subtle loading badge on the status panel during printer context switches
 * and immediately reset stale telemetry fields.
 */
export function setPrinterStatusLoading(isLoading: boolean): void {
  const statusEl = $('printer-status');
  const progressBar = $('progress-bar') as HTMLProgressElement | null;

  if (isLoading) {
    state.printerStatus = null;
    if (statusEl) {
      statusEl.innerHTML = '<span class="status-loading-badge"><span class="mini-spinner"></span> Connecting...</span>';
    }

    const currentJobEl = $('current-job');
    if (currentJobEl) {
      currentJobEl.innerHTML = '<span class="job-loading-shimmer"><span class="mini-spinner"></span> Loading print job...</span>';
    }

    const progressPercentEl = $('progress-percentage');
    if (progressPercentEl) {
      progressPercentEl.innerHTML = '<span class="mini-spinner"></span>';
    }

    if (progressBar) {
      progressBar.value = 0;
      progressBar.classList.add('progress-loading-shimmer');
    }

    setTextContent('layer-info', '-- / --');
    setTextContent('elapsed-time', '--:--');
    setTextContent('time-remaining', '--:--');
    setTextContent('job-weight', '--');
    setTextContent('job-length', '--');

    const previewContainer =
      document.getElementById('model-preview') ||
      document.querySelector<HTMLElement>('[data-component-id="model-preview"] .panel-content');
    if (previewContainer) {
      previewContainer.innerHTML = '<div class="model-preview-loading"><span class="mini-spinner"></span><span>Loading preview...</span></div>';
    }

    setTextContent('bed-temp', '--°C / --°C');
    setTextContent('extruder-temp', '--°C / --°C');
    const extraRows = document.querySelectorAll('.toolhead-temp-row');
    extraRows.forEach((r) => r.remove());
    const singleExtruderRow = document.getElementById('extruder-temp-row');
    if (singleExtruderRow) {
      singleExtruderRow.style.display = '';
    }
    setTextContent('chamber-temp', '--°C');
    hideElement('chamber-temp-row');

    updateButtonStates('Busy');
  } else {
    if (progressBar) {
      progressBar.classList.remove('progress-loading-shimmer');
    }
  }
}

export function updatePrinterStatus(status: PrinterStatus | null): void {
  const progressBar = $('progress-bar') as HTMLProgressElement | null;
  if (progressBar) {
    progressBar.classList.remove('progress-loading-shimmer');
  }

  if (!status) {
    updatePrinterStateCard(null);
    setTextContent('bed-temp', '--°C / --°C');
    setTextContent('extruder-temp', '--°C / --°C');
    const extraRows = document.querySelectorAll('.toolhead-temp-row');
    extraRows.forEach((r) => r.remove());
    const singleExtruderRow = document.getElementById('extruder-temp-row');
    if (singleExtruderRow) {
      singleExtruderRow.style.display = '';
    }
    setTextContent('chamber-temp', '--°C');
    hideElement('chamber-temp-row');
    setTextContent('current-job', 'No data');
    setTextContent('progress-percentage', '0%');
    updateModelPreview(null);
    updateWatchdogUI(undefined);
    return;
  }

  state.printerStatus = status;
  updatePrinterStateCard(status);

  const bedTemp = isNaN(status.bedTemperature) ? 0 : Math.round(status.bedTemperature);
  const bedTarget = isNaN(status.bedTargetTemperature) ? 0 : Math.round(status.bedTargetTemperature);
  const extruderTemp = isNaN(status.nozzleTemperature) ? 0 : Math.round(status.nozzleTemperature);
  const extruderTarget = isNaN(status.nozzleTargetTemperature) ? 0 : Math.round(status.nozzleTargetTemperature);

  setTextContent('bed-temp', `${bedTemp}°C / ${bedTarget}°C`);
  setTextContent('extruder-temp', `${extruderTemp}°C / ${extruderTarget}°C`);
  updateToolheadsUI(status);
  updateWatchdogUI(status.watchdog);

  if (status.chamberTemperature !== undefined && !isNaN(status.chamberTemperature) && status.chamberTemperature > 0) {
    const chamberTemp = Math.round(status.chamberTemperature);
    const chamberTarget = status.chamberTargetTemperature ? Math.round(status.chamberTargetTemperature) : 0;
    setTextContent('chamber-temp', chamberTarget > 0 ? `${chamberTemp}°C / ${chamberTarget}°C` : `${chamberTemp}°C`);
    showElement('chamber-temp-row');
  } else {
    hideElement('chamber-temp-row');
  }

  const rawState = status.printerState || (status as unknown as { state?: string }).state || '';
  const isCompleted = /completed|finish/i.test(rawState);

  if (status.jobName || isCompleted) {
    setTextContent('current-job', status.jobName || 'Completed');

    const progress = isNaN(status.progress) ? 0 : status.progress;
    const progressPercent = isCompleted ? 100 : (progress <= 1 && progress > 0 ? Math.round(progress * 100) : Math.round(progress));
    setTextContent('progress-percentage', `${progressPercent}%`);

    const progressBar = $('progress-bar') as HTMLProgressElement | null;
    if (progressBar) {
      progressBar.value = progressPercent;
    }

    if (
      status.currentLayer !== undefined &&
      status.totalLayers !== undefined &&
      !isNaN(status.currentLayer) &&
      !isNaN(status.totalLayers)
    ) {
      const currentL = isCompleted ? status.totalLayers : status.currentLayer;
      setTextContent('layer-info', `${currentL} / ${status.totalLayers}`);
    } else {
      setTextContent('layer-info', '-- / --');
    }

    // Elapsed — prefer seconds precision
    if (status.elapsedTimeSeconds !== undefined && !isNaN(status.elapsedTimeSeconds)) {
      setTextContent('elapsed-time', formatElapsedSeconds(status.elapsedTimeSeconds));
    } else if (status.timeElapsed !== undefined && !isNaN(status.timeElapsed)) {
      setTextContent('elapsed-time', formatTime(status.timeElapsed));
    } else {
      setTextContent('elapsed-time', '--:--');
    }

    // ETA — show Completed when Printer Status is Completed
    if (isCompleted) {
      setTextContent('time-remaining', 'Completed');
    } else if (status.formattedEta && status.formattedEta !== '--:--') {
      setTextContent('time-remaining', formatETAFromString(status.formattedEta));
    } else if (status.timeRemaining !== undefined && !isNaN(status.timeRemaining)) {
      setTextContent('time-remaining', formatETA(status.timeRemaining));
    } else {
      setTextContent('time-remaining', '--:--');
    }

    // Weight and length as separate fields
    if (status.estimatedWeight !== undefined && !isNaN(status.estimatedWeight)) {
      setTextContent('job-weight', `${Math.round(status.estimatedWeight)}g`);
    } else {
      setTextContent('job-weight', '--');
    }
    if (status.estimatedLength !== undefined && !isNaN(status.estimatedLength)) {
      setTextContent('job-length', `${status.estimatedLength.toFixed(1)}m`);
    } else {
      setTextContent('job-length', '--');
    }
    updateModelPreview(status.thumbnailData);
  } else {
    setTextContent('current-job', 'No active job');
    setTextContent('progress-percentage', '0%');
    const progressBar = $('progress-bar') as HTMLProgressElement | null;
    if (progressBar) {
      progressBar.value = 0;
    }
    setTextContent('layer-info', '-- / --');
    setTextContent('elapsed-time', '--:--');
    setTextContent('time-remaining', '--:--');
    setTextContent('job-weight', '--');
    setTextContent('job-length', '--');
    updateModelPreview(null);
  }

  updateButtonStates(status.printerState || 'Unknown');
  updateFiltrationStatus(status.filtrationMode);
}

export function updateFiltrationStatus(_mode?: 'external' | 'internal' | 'none'): void {
  // Filtration not supported on Creator 5 Pro
}

export function updateModelPreview(thumbnailData?: string | null): void {
  const previewContainer =
    document.getElementById('model-preview') ||
    document.querySelector<HTMLElement>('[data-component-id="model-preview"] .panel-content');
  if (!previewContainer) {
    return;
  }

  if (thumbnailData) {
    previewContainer.innerHTML = '';

    const img = document.createElement('img');
    const imageUrl = thumbnailData.startsWith('data:image/') ? thumbnailData : `data:image/png;base64,${thumbnailData}`;

    img.src = imageUrl;
    img.alt = 'Model preview';
    img.style.maxHeight = '140px';
    img.style.maxWidth = '100%';
    img.style.width = 'auto';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.style.display = 'block';

    img.onerror = () => {
      console.error('Failed to load model preview. Image URL length:', imageUrl.length);
      previewContainer.innerHTML = '<div class="no-preview">Preview load failed</div>';
    };

    previewContainer.appendChild(img);
    return;
  }

  previewContainer.innerHTML = '<div class="no-preview">No preview available</div>';
}

export function updateSpoolmanPanelState(): void {
  const disabled = $('spoolman-disabled');
  const noSpool = $('spoolman-no-spool');
  const active = $('spoolman-active');

  if (!disabled || !noSpool || !active) {
    return;
  }

  if (!isSpoolmanAvailableForCurrentContext()) {
    showElement('spoolman-disabled');
    hideElement('spoolman-no-spool');
    hideElement('spoolman-active');

    const disabledMessage = $('spoolman-disabled-message');
    if (disabledMessage) {
      const reason =
        state.spoolmanConfig?.disabledReason ||
        (state.spoolmanConfig?.enabled
          ? 'Spoolman is not available for this printer'
          : 'Spoolman integration is disabled');
      disabledMessage.textContent = reason;
    }
    return;
  }

  if (!state.activeSpool) {
    hideElement('spoolman-disabled');
    showElement('spoolman-no-spool');
    hideElement('spoolman-active');
    return;
  }

  hideElement('spoolman-disabled');
  hideElement('spoolman-no-spool');
  showElement('spoolman-active');

  const colorIndicator = $('spool-color');
  const spoolName = $('spool-name');
  const spoolMeta = $('spool-meta');
  const spoolRemaining = $('spool-remaining');

  if (colorIndicator) {
    colorIndicator.style.backgroundColor = state.activeSpool.colorHex;
  }

  if (spoolName) {
    spoolName.textContent = state.activeSpool.name;
  }

  if (spoolMeta) {
    const parts: string[] = [];
    if (state.activeSpool.vendor) {
      parts.push(state.activeSpool.vendor);
    }
    if (state.activeSpool.material) {
      parts.push(state.activeSpool.material);
    }
    spoolMeta.textContent = parts.join(' • ') || '--';
  }

  if (spoolRemaining) {
    const remaining =
      state.spoolmanConfig?.updateMode === 'weight'
        ? `${state.activeSpool.remainingWeight.toFixed(0)}g`
        : `${(state.activeSpool.remainingLength / 1000).toFixed(1)}m`;
    spoolRemaining.textContent = remaining;
  }
}

function updateButtonStates(printerState: string): void {
  const isPrintingActive =
    printerState === 'Printing' ||
    printerState === 'Paused' ||
    printerState === 'Calibrating' ||
    printerState === 'Heating' ||
    printerState === 'Pausing';


  const canControlJob =
    printerState === 'Printing' ||
    printerState === 'Paused' ||
    printerState === 'Heating' ||
    printerState === 'Calibrating';

  const isBusy = printerState === 'Busy' || printerState === 'Error';

  // Camera toolbar buttons
  const camPauseResumeBtn = $('btn-cam-pause-resume') as HTMLButtonElement | null;
  const camStopBtn = $('btn-cam-stop') as HTMLButtonElement | null;
  const iconPauseResume = $('icon-pause-resume') as HTMLElement | null;

  if (camPauseResumeBtn) {
    const isPaused = printerState === 'Paused';
    const isPrinting = printerState === 'Printing';
    camPauseResumeBtn.disabled = !isPaused && !isPrinting;
    camPauseResumeBtn.title = isPaused ? 'Resume Print' : 'Pause Print';
    camPauseResumeBtn.setAttribute('aria-label', isPaused ? 'Resume Print' : 'Pause Print');

    if (iconPauseResume) {
      const targetIcon = isPaused ? 'play' : 'pause';
      if (iconPauseResume.getAttribute('data-lucide') !== targetIcon) {
        iconPauseResume.setAttribute('data-lucide', targetIcon);
        hydrateLucideIcons([targetIcon], camPauseResumeBtn);
      }
    }
  }

  if (camStopBtn) {
    camStopBtn.disabled = !canControlJob;
  }

  // Machine Control jog buttons


  const clearStatusBtn = $('btn-clear-status') as HTMLButtonElement | null;
  if (clearStatusBtn) clearStatusBtn.disabled = isPrintingActive;

  const bedSetBtn = $('btn-bed-set') as HTMLButtonElement | null;
  const bedOffBtn = $('btn-bed-off') as HTMLButtonElement | null;
  const extruderSetBtn = $('btn-extruder-set') as HTMLButtonElement | null;
  const extruderOffBtn = $('btn-extruder-off') as HTMLButtonElement | null;

  const tempButtonsDisabled = isPrintingActive || isBusy;
  if (bedSetBtn) bedSetBtn.disabled = tempButtonsDisabled;
  if (bedOffBtn) bedOffBtn.disabled = tempButtonsDisabled;
  if (extruderSetBtn) extruderSetBtn.disabled = tempButtonsDisabled;
  if (extruderOffBtn) extruderOffBtn.disabled = tempButtonsDisabled;
}

function updatePrinterStateCard(status: PrinterStatus | null): void {
  const stateText = status?.printerState || 'Stopped.';
  setTextContent('printer-status', stateText);
  setTextContent('camera-status-text', stateText.endsWith('.') ? stateText : `${stateText}.`);
  setTextContent('info-page-printer-state', stateText);

  if (status?.cumulativePrintTime !== undefined) {
    const formattedTime = formatLifetimePrintTime(status.cumulativePrintTime);
    setTextContent('lifetime-print-time', formattedTime);
    setTextContent('info-page-lifetime-time', formattedTime);
  } else {
    setTextContent('lifetime-print-time', '--');
    setTextContent('info-page-lifetime-time', '--');
  }

  if (status?.cumulativeFilament !== undefined) {
    const formattedFilament = formatLifetimeFilament(status.cumulativeFilament);
    setTextContent('lifetime-filament', formattedFilament);
    setTextContent('info-page-lifetime-filament', formattedFilament);
  } else {
    setTextContent('lifetime-filament', '--');
    setTextContent('info-page-lifetime-filament', '--');
  }

  const activeContextId = getCurrentContextId();
  const currentContext = activeContextId ? contextById.get(activeContextId) : undefined;
  const modelText = currentContext?.model || currentContext?.name || 'Creator 5';
  const ipText = currentContext?.ipAddress || '--';
  const serialText = currentContext?.serialNumber || getCurrentPrinterSerial() || '--';

  setTextContent('system-firmware-version', modelText);
  setTextContent('system-network-ip', ipText);

  setTextContent('info-page-model', modelText);
  setTextContent('info-page-serial', serialText);
  setTextContent('info-page-ip', ipText);

}

export function updateToolheadsUI(status: PrinterStatus): void {
  const container = document.getElementById('toolheads-container');
  if (!container) {
    return;
  }

  const toolTemps = status.toolTemps;
  const toolTargetTemps = status.toolTargetTemps;
  const amsStatus = getCachedAmsStatus();

  if (Array.isArray(toolTemps) && toolTemps.length > 1) {
    const singleExtruderRow = document.getElementById('extruder-temp-row');
    if (singleExtruderRow) {
      singleExtruderRow.style.display = 'none';
    }

    let addedNewRow = false;
    for (let i = 0; i < toolTemps.length; i++) {
      const rowId = `toolhead-row-${i}`;
      let row = document.getElementById(rowId);
      const rawCurr = toolTemps[i] as unknown;
      const curr = typeof rawCurr === 'number'
        ? (isNaN(rawCurr) ? 0 : Math.round(rawCurr))
        : typeof rawCurr === 'object' && rawCurr !== null
          ? Math.round((rawCurr as { current?: number }).current || 0)
          : 0;

      const rawTarget = toolTargetTemps ? (toolTargetTemps[i] as unknown) : undefined;
      let target = typeof rawTarget === 'number'
        ? (isNaN(rawTarget) ? 0 : Math.round(rawTarget))
        : typeof rawCurr === 'object' && rawCurr !== null
          ? Math.round((rawCurr as { set?: number; target?: number }).set ?? (rawCurr as { set?: number; target?: number }).target ?? 0)
          : 0;

      // Intelligent fallback: if this tool target is 0 but global nozzleTargetTemperature > 0,
      // associate the global target with the active toolhead or tool 0 if all targets are 0
      if (target === 0 && status.nozzleTargetTemperature && status.nozzleTargetTemperature > 0) {
        const globalTarget = Math.round(status.nozzleTargetTemperature);
        const globalCurrent = Math.round(status.nozzleTemperature || 0);
        if (curr === globalCurrent || (i === 0 && (!toolTargetTemps || toolTargetTemps.every(t => !t || t === 0)))) {
          target = globalTarget;
        }
      }

      // Slot & filament mapping for toolhead i
      const slot = amsStatus?.slots?.find((s) => s.slotId === i + 1 || s.slotId === i) || amsStatus?.slots?.[i];
      const hasSlotInfo = Boolean(slot && !slot.isEmpty);
      const filamentColor = slot?.materialColor || '#888888';
      const materialType = hasSlotInfo ? (slot?.materialType || 'PLA').toUpperCase() : '';

      if (!row) {
        row = document.createElement('div');
        row.id = rowId;
        row.className = 'bambu-temp-row toolhead-temp-row';
        row.innerHTML = `
          <div class="temp-indicator-left">
            <span class="toolhead-color-badge ${hasSlotInfo ? '' : 'hidden'}" id="tool-color-badge-${i}" style="background-color: ${filamentColor};" title="Tool ${i + 1} Filament: ${materialType} (${filamentColor})"></span>
            <i data-lucide="flame" class="temp-type-icon ${hasSlotInfo ? 'hidden' : ''}" id="tool-flame-icon-${i}"></i>
            <span class="temp-label-name">Tool ${i + 1}</span>
            <span class="toolhead-material-tag ${hasSlotInfo ? '' : 'hidden'}" id="tool-mat-tag-${i}">${materialType}</span>
            <span class="temp-val-display" id="tool-temp-val-${i}">${curr}°C / ${target}°C</span>
          </div>
          <div class="temp-btn-pair">
            <button class="temp-btn-pill" data-tool-action="set" data-tool-index="${i}">Set</button>
            <button class="temp-btn-pill off" data-tool-action="off" data-tool-index="${i}">Off</button>
          </div>
        `;
        container.appendChild(row);
        addedNewRow = true;
      } else {
        const valDisplay = document.getElementById(`tool-temp-val-${i}`);
        if (valDisplay) {
          valDisplay.textContent = `${curr}°C / ${target}°C`;
        }
        const colorBadge = document.getElementById(`tool-color-badge-${i}`);
        const flameIcon = document.getElementById(`tool-flame-icon-${i}`);
        if (colorBadge) {
          if (hasSlotInfo) {
            colorBadge.classList.remove('hidden');
            colorBadge.style.backgroundColor = filamentColor;
            colorBadge.title = `Tool ${i + 1} Filament: ${materialType} (${filamentColor})`;
            if (flameIcon) flameIcon.classList.add('hidden');
          } else {
            colorBadge.classList.add('hidden');
            if (flameIcon) flameIcon.classList.remove('hidden');
          }
        }
        const matTag = document.getElementById(`tool-mat-tag-${i}`);
        if (matTag) {
          if (hasSlotInfo) {
            matTag.classList.remove('hidden');
            matTag.textContent = materialType;
          } else {
            matTag.classList.add('hidden');
          }
        }
      }
    }

    if (addedNewRow && typeof (window as unknown as { lucide?: { createIcons: () => void } }).lucide?.createIcons === 'function') {
      (window as unknown as { lucide: { createIcons: () => void } }).lucide.createIcons();
    }
  } else {
    const singleExtruderRow = document.getElementById('extruder-temp-row');
    if (singleExtruderRow) {
      singleExtruderRow.style.display = '';
      const activeSlot = amsStatus?.slots?.find((s) => s.slotId === amsStatus.activeSlot || (amsStatus.activeSlot !== null && s.slotId === amsStatus.activeSlot + 1)) || amsStatus?.slots?.[0];
      const extruderColorBadge = document.getElementById('extruder-color-badge');
      const extruderMatTag = document.getElementById('extruder-material-tag');
      if (activeSlot && !activeSlot.isEmpty && extruderColorBadge && extruderMatTag) {
        extruderColorBadge.classList.remove('hidden');
        extruderColorBadge.style.backgroundColor = activeSlot.materialColor || '#888888';
        extruderMatTag.classList.remove('hidden');
        extruderMatTag.textContent = (activeSlot.materialType || 'PLA').toUpperCase();
      }
    }
    const extraRows = container.querySelectorAll('.toolhead-temp-row');
    extraRows.forEach((r) => r.remove());
  }
}

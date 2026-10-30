/**
 * @fileoverview Multi Material manager for the WebUI client.
 *
 * Handles fetching, rendering, and controlling multi-material systems:
 * - Multi-slot AMS / Material Stations (e.g. Bambu Lab A1 mini + AMS Lite, FlashForge AD5X IFS)
 * - Multi-head physical extruders (e.g. FlashForge Creator 5 Pro with 4 independent print heads)
 */

import type { MaterialStationStatus, MaterialStationStatusResponse } from '../app.js';
import { contextById, getCurrentContextId, state } from '../core/AppState.js';
import { apiRequest } from '../core/Transport.js';
import { $, hideElement, showElement, showToast } from '../shared/dom.js';
import { initializeLucideIcons } from '../shared/icons.js';
import { updateToolheadsUI } from '../ui/panels.js';

let cachedAmsStatus: MaterialStationStatus | null = null;
let amsPollingTimer: ReturnType<typeof setInterval> | null = null;

export function getCachedAmsStatus(): MaterialStationStatus | null {
  return cachedAmsStatus;
}

/**
 * Detect if the currently active printer uses multi-head extruders (e.g. Creator 5 Pro with 4 toolheads)
 * rather than a single extruder with an AMS filament switcher (e.g. Bambu A1 Mini + AMS Lite).
 */
export function isMultiHeadPrinter(): boolean {
  if (state.printerStatus?.toolTemps && state.printerStatus.toolTemps.length > 1) {
    return true;
  }
  const currentCtxId = getCurrentContextId();
  if (currentCtxId && contextById.has(currentCtxId)) {
    const ctx = contextById.get(currentCtxId);
    const model = ctx?.model || ctx?.name || '';
    if (/creator\s*(5|pro|4)/i.test(model)) {
      return true;
    }
  }
  return false;
}

/**
 * Fetch latest Multi Material status from the backend
 */
export async function fetchAmsStatus(contextId = getCurrentContextId()): Promise<MaterialStationStatus | null> {
  try {
    const url = `/api/printer/material-station${contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''}`;
    const res = await apiRequest<MaterialStationStatusResponse>(url);

    if (res.success && res.status !== undefined && res.status !== null) {
      cachedAmsStatus = res.status;
      updateAmsUI(res.status);
      if (state.printerStatus) {
        updateToolheadsUI(state.printerStatus);
      }
      return res.status;
    }

    cachedAmsStatus = null;
    updateAmsUI(null);
    return null;
  } catch (error) {
    console.warn('[MultiMaterial] Error fetching material station status:', error);
    cachedAmsStatus = null;
    updateAmsUI(null);
    return null;
  }
}

/**
 * Update the Multi Material panel UI with slots & status
 */
export function updateAmsUI(station: MaterialStationStatus | null | undefined): void {
  const panel = $('ams-panel');
  if (!panel) return;

  const slotsGrid = $('ams-slots-grid');
  const emptyState = $('ams-empty-state');
  const statusPill = $('ams-status-pill');

  if (!station || !station.connected || !Array.isArray(station.slots) || station.slots.length === 0) {
    if (slotsGrid) hideElement('ams-slots-grid');
    if (emptyState) showElement('ams-empty-state');
    if (statusPill) {
      statusPill.textContent = 'Not Connected';
      statusPill.className = 'ams-status-pill status-disconnected';
    }
    return;
  }

  if (emptyState) hideElement('ams-empty-state');
  if (slotsGrid) {
    showElement('ams-slots-grid');
    renderAmsSlots(station, slotsGrid);
  }

  if (statusPill) {
    const isMultiHead = isMultiHeadPrinter();
    const status = station.overallStatus || 'ready';
    if (status === 'error') {
      statusPill.textContent = 'Error';
      statusPill.className = 'ams-status-pill status-error';
    } else if (status === 'warming') {
      statusPill.textContent = 'Warming';
      statusPill.className = 'ams-status-pill status-warning';
    } else if (isMultiHead) {
      if (station.activeSlot !== null && station.activeSlot !== undefined && station.activeSlot >= 0) {
        const activeHead = station.activeSlot >= 1 ? station.activeSlot : station.activeSlot + 1;
        statusPill.textContent = `Head ${activeHead} Active`;
      } else {
        statusPill.textContent = `${station.slots.length} Heads Ready`;
      }
      statusPill.className = 'ams-status-pill status-ready';
    } else {
      if (station.activeSlot !== null && station.activeSlot !== undefined && station.activeSlot >= 0) {
        const activeSlotNum = station.activeSlot >= 1 ? station.activeSlot : station.activeSlot + 1;
        statusPill.textContent = `Slot ${activeSlotNum} Feeding`;
      } else {
        statusPill.textContent = 'Ready';
      }
      statusPill.className = 'ams-status-pill status-ready';
    }
  }

  initializeLucideIcons();
}

/**
 * Render slot cards inside the Multi Material slots grid
 */
function renderAmsSlots(station: MaterialStationStatus, gridEl: HTMLElement): void {
  const slots = station.slots;
  const isMultiHead = isMultiHeadPrinter();
  const toolTemps = state.printerStatus?.toolTemps;

  gridEl.innerHTML = slots
    .map((slot, index) => {
      const slotNum = slot.slotId >= 1 ? slot.slotId : index + 1;
      const isActive =
        station.activeSlot === slot.slotId ||
        (station.activeSlot !== null && station.activeSlot + 1 === slotNum) ||
        station.activeSlot === index;
      const isEmpty = Boolean(slot.isEmpty);
      const color = slot.materialColor || (isEmpty ? '#333333' : '#888888');
      const materialLabel = isEmpty ? 'Empty' : slot.materialType || 'Generic';
      const isLightColor = isColorLight(color);

      // Multi-Head Mode (e.g. Creator 5 Pro with 4 physical print heads)
      if (isMultiHead) {
        const headTemp = toolTemps?.[index];
        const tempText = headTemp !== undefined ? `${headTemp}°C` : '';

        return `
          <div class="ams-slot-card multihead-slot-card ${isActive ? 'active-feeding' : ''} ${isEmpty ? 'empty-slot' : ''}" data-slot-id="${slot.slotId}">
            <div class="slot-badge-row">
              <span class="slot-number-badge">Head ${slotNum}</span>
              ${tempText ? `<span class="slot-head-temp-badge"><i data-lucide="thermometer"></i>${tempText}</span>` : ''}
              ${isActive ? '<span class="slot-feeding-badge"><span class="pulse-dot-green"></span>Active</span>' : ''}
            </div>
            <div class="slot-spool-visual">
              <div class="slot-spool-disc ${isLightColor ? 'light-color' : ''}" style="background-color: ${escapeHtml(color)};">
                <div class="slot-spool-hub"></div>
              </div>
              <div class="slot-material-meta">
                <span class="slot-material-type-badge">${escapeHtml(materialLabel)}</span>
                ${!isEmpty && slot.materialColor ? `<span class="slot-material-color-hex">${escapeHtml(color)}</span>` : ''}
              </div>
            </div>
            <div class="slot-actions-row multihead-actions-row">
              <span class="multihead-tool-pill ${isActive ? 'active-tool' : 'idle-tool'}">
                <i data-lucide="${isActive ? 'flame' : 'printer'}"></i>
                <span>${isActive ? 'Active Extruder' : 'Direct Feed'}</span>
              </span>
            </div>
          </div>
        `;
      }

      // AMS Lite Switcher Mode (e.g. Bambu A1 Mini + AMS Lite)
      return `
        <div class="ams-slot-card ${isActive ? 'active-feeding' : ''} ${isEmpty ? 'empty-slot' : ''}" data-slot-id="${slot.slotId}">
          <div class="slot-badge-row">
            <span class="slot-number-badge">Slot ${slotNum}</span>
            ${isActive ? '<span class="slot-feeding-badge"><span class="pulse-dot-green"></span>Active</span>' : ''}
          </div>
          <div class="slot-spool-visual">
            <div class="slot-spool-disc ${isLightColor ? 'light-color' : ''}" style="background-color: ${escapeHtml(color)};">
              <div class="slot-spool-hub"></div>
            </div>
            <div class="slot-material-meta">
              <span class="slot-material-type-badge">${escapeHtml(materialLabel)}</span>
              ${!isEmpty && slot.materialColor ? `<span class="slot-material-color-hex">${escapeHtml(color)}</span>` : ''}
            </div>
          </div>
          <div class="slot-actions-row">
            <button
              type="button"
              class="btn-slot-load mini-slot-btn"
              data-slot="${slot.slotId}"
              title="${isActive ? 'Currently feeding' : isEmpty ? 'Slot is empty' : `Load filament from Slot ${slotNum}`}"
              ${isActive || isEmpty ? 'disabled' : ''}
            >
              <i data-lucide="arrow-down-to-line"></i>
              <span>Load</span>
            </button>
            <button
              type="button"
              class="btn-slot-unload mini-slot-btn"
              data-slot="${slot.slotId}"
              title="${!isActive ? 'Not currently active' : 'Unload filament back to Multi Material'}"
              ${!isActive ? 'disabled' : ''}
            >
              <i data-lucide="arrow-up-from-line"></i>
              <span>Unload</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Setup event listeners for Multi Material refresh and slot load/unload
 */
export function setupAmsEventHandlers(): void {
  // Refresh button
  $('btn-ams-refresh')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void fetchAmsStatus();
    showToast('Refreshing Multi Material status...', 'info');
  });

  // Action delegation on slots grid
  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Load button
    const loadBtn = target.closest<HTMLButtonElement>('.btn-slot-load');
    if (loadBtn && !loadBtn.disabled) {
      event.stopPropagation();
      const slotStr = loadBtn.dataset.slot;
      if (slotStr !== undefined) {
        const slotId = parseInt(slotStr, 10);
        await handleLoadAmsSlot(slotId);
      }
      return;
    }

    // Unload button
    const unloadBtn = target.closest<HTMLButtonElement>('.btn-slot-unload');
    if (unloadBtn && !unloadBtn.disabled) {
      event.stopPropagation();
      await handleUnloadAms();
      return;
    }
  });
}

/**
 * Start periodic polling for Multi Material status when on Status view
 */
export function startAmsPolling(): void {
  stopAmsPolling();
  void fetchAmsStatus();
  amsPollingTimer = setInterval(() => {
    void fetchAmsStatus();
  }, 4000);
}

/**
 * Stop periodic polling for Multi Material status
 */
export function stopAmsPolling(): void {
  if (amsPollingTimer) {
    clearInterval(amsPollingTimer);
    amsPollingTimer = null;
  }
}

async function handleLoadAmsSlot(slotId: number): Promise<void> {
  const slotNum = slotId >= 1 ? slotId : slotId + 1;
  try {
    showToast(`Loading filament from Slot ${slotNum}...`, 'info');
    const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
      '/api/printer/control/material/load',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      }
    );

    if (res.success) {
      showToast(res.message || `Slot ${slotNum} loaded`, 'success');
      setTimeout(() => void fetchAmsStatus(), 1200);
    } else {
      showToast(res.error || `Failed to load Slot ${slotNum}`, 'error');
    }
  } catch (err) {
    console.error('[MultiMaterial] Load slot error:', err);
    showToast(`Error loading Slot ${slotNum}`, 'error');
  }
}

async function handleUnloadAms(): Promise<void> {
  try {
    showToast('Unloading filament from extruder...', 'info');
    const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
      '/api/printer/control/material/unload',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    if (res.success) {
      showToast(res.message || 'Filament unloaded', 'success');
      setTimeout(() => void fetchAmsStatus(), 1200);
    } else {
      showToast(res.error || 'Failed to unload filament', 'error');
    }
  } catch (err) {
    console.error('[MultiMaterial] Unload error:', err);
    showToast('Error unloading filament', 'error');
  }
}

function isColorLight(hex: string): boolean {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 190;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

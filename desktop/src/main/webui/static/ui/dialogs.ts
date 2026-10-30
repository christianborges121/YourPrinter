/**
 * @fileoverview Dialog and Media subpage orchestration utilities for the WebUI client.
 *
 * Handles file loading and rendering into the inline Bambu Media subpage,
 * file selection, metadata preview, temperature prompts, and shared modal event
 * registration.
 */

import type { FileListResponse, WebUIJobFile } from '../app.js';
import { state } from '../core/AppState.js';
import { apiRequest } from '../core/Transport.js';
import { $, hideElement, showElement, showToast } from '../shared/dom.js';
import {
  buildMaterialBadgeTooltip,
  formatJobPrintingTime,
  isAD5XJobFile,
  isMultiColorJobFile,
} from '../shared/formatting.js';
import { hydrateLucideIcons } from '../shared/icons.js';
import { switchToStatusView } from './views.js';

interface TemperatureDialogElement extends HTMLElement {
  temperatureType?: 'bed' | 'extruder';
  toolIndex?: number;
}

export interface DialogHandlers {
  onStartPrintJob?: () => Promise<void> | void;
  onMaterialMatchingClosed?: () => void;
  onMaterialMatchingConfirm?: () => Promise<void> | void;
  onTemperatureSubmit?: (type: 'bed' | 'extruder', temperature: number, toolIndex?: number) => Promise<void> | void;
}

let dialogHandlers: DialogHandlers = {};
let currentMediaSource: 'recent' | 'local' = 'recent';

export function getCurrentMediaSource(): 'recent' | 'local' {
  return currentMediaSource;
}

export function setCurrentMediaSource(source: 'recent' | 'local'): void {
  currentMediaSource = source;
}

export async function loadFileList(source: 'recent' | 'local'): Promise<void> {
  currentMediaSource = source;

  // Update media source tab active states
  const tabRecent = $('subpage-tab-recent');
  const tabLocal = $('subpage-tab-local');
  if (source === 'recent') {
    tabRecent?.classList.add('active');
    tabLocal?.classList.remove('active');
  } else {
    tabRecent?.classList.remove('active');
    tabLocal?.classList.add('active');
  }

  const refreshBtn = $('subpage-refresh-btn');
  const refreshIcon = refreshBtn?.querySelector('[data-lucide="refresh-cw"], svg');
  if (refreshIcon) refreshIcon.classList.add('spin');

  const fileListEl = $('subpage-file-list');
  if (fileListEl) {
    fileListEl.innerHTML = `
      <div class="subpage-loading-files">
        <span class="loading-spinner"></span>
        <span>Loading ${source === 'recent' ? 'recent' : 'local'} files from printer...</span>
      </div>
    `;
  }

  try {
    const result = await apiRequest<FileListResponse>(`/api/jobs/${source}`);

    if (result.success && Array.isArray(result.files)) {
      state.jobMetadata.clear();
      result.files.forEach((file) => {
        if (file && file.fileName) {
          state.jobMetadata.set(file.fileName, file);
        }
      });
      renderMediaSubpage(result.files, source);
    } else {
      if (fileListEl) {
        fileListEl.innerHTML = `<div class="subpage-empty-files">Failed to load ${source} files from printer.</div>`;
      }
      showToast('Failed to load files', 'error');
    }
  } catch (error) {
    console.error('Failed to load files:', error);
    if (fileListEl) {
      fileListEl.innerHTML = `<div class="subpage-empty-files">Network error while loading ${source} files.</div>`;
    }
    showToast('Failed to load files', 'error');
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('spin');
  }
}

export function renderMediaSubpage(files: WebUIJobFile[], source: 'recent' | 'local'): void {
  const fileList = $('subpage-file-list');
  const countLabel = $('subpage-file-count');
  const selectedName = $('subpage-selected-filename');
  const selectedBadge = $('subpage-selected-badge');
  const metaTime = $('subpage-meta-time');
  const metaFilament = $('subpage-meta-filament');
  const metaMaterialsWrapper = $('subpage-meta-materials');
  const materialsList = $('subpage-materials-list');
  const printBtn = $('subpage-print-btn') as HTMLButtonElement | null;

  const safeFiles = Array.isArray(files) ? files : [];

  if (countLabel) {
    countLabel.textContent = `${safeFiles.length} file${safeFiles.length === 1 ? '' : 's'}`;
  }

  // Reset selected file details
  state.selectedFile = null;
  if (printBtn) {
    printBtn.disabled = true;
  }
  if (selectedName) {
    selectedName.textContent = 'No file selected';
  }
  if (selectedBadge) {
    selectedBadge.classList.add('hidden');
    selectedBadge.textContent = '';
  }
  if (metaTime) {
    metaTime.textContent = '--';
  }
  if (metaFilament) {
    metaFilament.textContent = '--';
  }
  if (metaMaterialsWrapper) {
    metaMaterialsWrapper.classList.add('hidden');
  }
  if (materialsList) {
    materialsList.innerHTML = '';
  }

  if (!fileList) {
    return;
  }

  fileList.innerHTML = '';

  if (safeFiles.length === 0) {
    fileList.innerHTML = `
      <div class="subpage-empty-files">
        <i data-lucide="folder" class="empty-icon"></i>
        <p>No ${source === 'recent' ? 'recent' : 'local'} files found on printer.</p>
      </div>
    `;
    hydrateLucideIcons(['folder'], fileList);
    return;
  }

  safeFiles.forEach((file) => {
    if (!file) return;
    const card = document.createElement('div');
    card.className = 'subpage-file-card';
    card.dataset.filename = file.fileName || '';

    const iconBox = document.createElement('div');
    iconBox.className = 'subpage-card-icon';
    iconBox.innerHTML = '<i data-lucide="file-code"></i>';

    const infoBox = document.createElement('div');
    infoBox.className = 'subpage-card-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'subpage-card-title-row';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'subpage-card-filename';
    titleSpan.textContent = file.displayName || file.fileName || 'Unnamed File';
    titleRow.appendChild(titleSpan);

    if (isMultiColorJobFile(file)) {
      const badge = document.createElement('span');
      badge.className = 'file-badge multi-color';
      badge.textContent = 'Multi-color';
      badge.title = buildMaterialBadgeTooltip(file);
      titleRow.appendChild(badge);
    }
    infoBox.appendChild(titleRow);

    const metaRow = document.createElement('div');
    metaRow.className = 'subpage-card-meta-row';

    const printTimeStr = formatJobPrintingTime(file.printingTime);
    if (printTimeStr) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'meta-pill';
      timeSpan.textContent = printTimeStr;
      metaRow.appendChild(timeSpan);
    }

    if (typeof file.totalFilamentWeight === 'number' && !Number.isNaN(file.totalFilamentWeight)) {
      const weightSpan = document.createElement('span');
      weightSpan.className = 'meta-pill';
      weightSpan.textContent = `${file.totalFilamentWeight.toFixed(1)} g`;
      metaRow.appendChild(weightSpan);
    }

    if (isAD5XJobFile(file) && Array.isArray(file.toolDatas) && file.toolDatas.length > 0) {
      const toolSwatches = document.createElement('div');
      toolSwatches.className = 'mini-tool-swatches';
      file.toolDatas.forEach((tool) => {
        if (!tool) return;
        const swatch = document.createElement('span');
        swatch.className = 'mini-swatch-dot';
        swatch.style.backgroundColor = tool.materialColor || '#888';
        swatch.title = `${tool.materialName || 'Tool'} (${tool.materialColor || 'default'})`;
        toolSwatches.appendChild(swatch);
      });
      metaRow.appendChild(toolSwatches);
    }

    if (metaRow.childElementCount > 0) {
      infoBox.appendChild(metaRow);
    }

    card.appendChild(iconBox);
    card.appendChild(infoBox);

    card.addEventListener('click', () => {
      fileList.querySelectorAll('.subpage-file-card').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedFile = file.fileName;

      if (printBtn) {
        printBtn.disabled = false;
      }
      if (selectedName) {
        selectedName.textContent = file.displayName || file.fileName || 'Unnamed File';
      }
      if (selectedBadge) {
        if (isMultiColorJobFile(file)) {
          selectedBadge.classList.remove('hidden');
          selectedBadge.textContent = 'Multi-color';
          selectedBadge.title = buildMaterialBadgeTooltip(file);
        } else {
          selectedBadge.classList.add('hidden');
        }
      }
      if (metaTime) {
        metaTime.textContent = formatJobPrintingTime(file.printingTime) || '--';
      }
      if (metaFilament) {
        metaFilament.textContent =
          typeof file.totalFilamentWeight === 'number' && !Number.isNaN(file.totalFilamentWeight)
            ? `${file.totalFilamentWeight.toFixed(1)} g`
            : '--';
      }
      if (metaMaterialsWrapper && materialsList) {
        if (isAD5XJobFile(file) && Array.isArray(file.toolDatas) && file.toolDatas.length > 0) {
          metaMaterialsWrapper.classList.remove('hidden');
          materialsList.innerHTML = '';
          file.toolDatas.forEach((tool) => {
            if (!tool) return;
            const chip = document.createElement('div');
            chip.className = 'material-chip';

            const swatch = document.createElement('span');
            swatch.className = 'material-color';
            swatch.style.backgroundColor = tool.materialColor || '#888';

            const label = document.createElement('span');
            label.className = 'material-label';
            label.textContent = tool.materialName || 'Tool';

            chip.appendChild(swatch);
            chip.appendChild(label);
            materialsList.appendChild(chip);
          });
        } else {
          metaMaterialsWrapper.classList.add('hidden');
          materialsList.innerHTML = '';
        }
      }
    });

    fileList.appendChild(card);
  });

  hydrateLucideIcons(['file-code', 'clock', 'folder'], fileList);
}

export function showFileModal(files: WebUIJobFile[], source: 'recent' | 'local'): void {
  renderMediaSubpage(files, source);
}

export function showTemperatureDialog(type: 'bed' | 'extruder', toolIndex?: number): void {
  const dialog = $('temp-dialog');
  const title = $('temp-dialog-title');
  const message = $('temp-dialog-message');
  const input = $('temp-input') as HTMLInputElement | null;

  if (!dialog || !title || !message || !input) {
    return;
  }

  const toolLabel = toolIndex !== undefined ? `Tool ${toolIndex + 1}` : 'Extruder';
  title.textContent = type === 'bed' ? 'Set Bed Temperature' : `Set ${toolLabel} Temperature`;
  message.textContent = `Enter ${type === 'bed' ? 'bed' : toolLabel} temperature (°C):`;

  if (state.printerStatus) {
    let currentTarget = 0;
    if (type === 'bed') {
      currentTarget = state.printerStatus.bedTargetTemperature;
    } else if (
      toolIndex !== undefined &&
      state.printerStatus.toolTargetTemps &&
      state.printerStatus.toolTargetTemps[toolIndex] !== undefined
    ) {
      currentTarget = state.printerStatus.toolTargetTemps[toolIndex];
      if (currentTarget === 0 && state.printerStatus.nozzleTargetTemperature > 0 && toolIndex === 0) {
        currentTarget = state.printerStatus.nozzleTargetTemperature;
      }
    } else {
      currentTarget = state.printerStatus.nozzleTargetTemperature;
    }
    input.value = Math.round(currentTarget).toString();
  } else {
    input.value = '0';
  }

  (dialog as TemperatureDialogElement).temperatureType = type;
  (dialog as TemperatureDialogElement).toolIndex = toolIndex;
  showElement('temp-dialog');
  input.focus();
  input.select();
}

export async function setTemperature(): Promise<void> {
  const dialog = $('temp-dialog') as TemperatureDialogElement | null;
  const input = $('temp-input') as HTMLInputElement | null;

  if (!dialog || !input) {
    return;
  }

  const type = dialog.temperatureType;
  const toolIndex = dialog.toolIndex;
  const temperature = parseInt(input.value, 10);

  if (!type) {
    showToast('Unknown temperature target', 'error');
    return;
  }

  if (isNaN(temperature) || temperature < 0 || temperature > 300) {
    showToast('Invalid temperature value', 'error');
    return;
  }

  if (!dialogHandlers.onTemperatureSubmit) {
    showToast('Temperature control unavailable', 'error');
    return;
  }

  try {
    await dialogHandlers.onTemperatureSubmit(type, temperature, toolIndex);
    hideElement('temp-dialog');
  } catch (error) {
    console.error('Failed to submit temperature command:', error);
    showToast('Failed to set temperature', 'error');
  }
}

export function setupDialogEventHandlers(handlers: DialogHandlers = {}): void {
  dialogHandlers = handlers;

  // Subpage event handlers
  $('subpage-print-btn')?.addEventListener('click', () => {
    if (dialogHandlers.onStartPrintJob) {
      void dialogHandlers.onStartPrintJob();
    }
  });

  $('btn-media-back-status')?.addEventListener('click', () => {
    switchToStatusView();
  });

  $('subpage-tab-recent')?.addEventListener('click', () => {
    void loadFileList('recent');
  });

  $('subpage-tab-local')?.addEventListener('click', () => {
    void loadFileList('local');
  });

  $('subpage-refresh-btn')?.addEventListener('click', () => {
    void loadFileList(currentMediaSource);
  });

  // Legacy modal close / print buttons
  const closeModalBtn = $('close-modal');
  const printFileBtn = $('print-file-btn');

  closeModalBtn?.addEventListener('click', () => {
    closeFileModal();
  });

  printFileBtn?.addEventListener('click', () => {
    if (dialogHandlers.onStartPrintJob) {
      void dialogHandlers.onStartPrintJob();
    }
  });

  const materialModalClose = $('material-matching-close');
  materialModalClose?.addEventListener('click', () => {
    dialogHandlers.onMaterialMatchingClosed?.();
  });

  const materialModalCancel = $('material-matching-cancel');
  materialModalCancel?.addEventListener('click', () => {
    dialogHandlers.onMaterialMatchingClosed?.();
  });

  const materialModalConfirm = $('material-matching-confirm');
  materialModalConfirm?.addEventListener('click', () => {
    if (dialogHandlers.onMaterialMatchingConfirm) {
      void dialogHandlers.onMaterialMatchingConfirm();
    }
  });

  const closeTempBtn = $('close-temp-dialog');
  const tempCancelBtn = $('temp-cancel');
  const tempConfirmBtn = $('temp-confirm');
  const tempInput = $('temp-input') as HTMLInputElement | null;

  closeTempBtn?.addEventListener('click', () => hideElement('temp-dialog'));
  tempCancelBtn?.addEventListener('click', () => hideElement('temp-dialog'));
  tempConfirmBtn?.addEventListener('click', () => {
    void setTemperature();
  });

  tempInput?.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      void setTemperature();
    }
  });
}

function closeFileModal(): void {
  hideElement('file-modal');
  state.selectedFile = null;

  if (isMaterialMatchingVisible()) {
    dialogHandlers.onMaterialMatchingClosed?.();
  } else {
    state.pendingJobStart = null;
  }
}

function isMaterialMatchingVisible(): boolean {
  const modal = document.getElementById('material-matching-modal');
  return Boolean(modal && !modal.classList.contains('hidden'));
}

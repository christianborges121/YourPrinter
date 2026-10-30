/**
 * @fileoverview Frontend UI logic and event handlers for Multi-Printer Fleet Management.
 *
 * Provides a left-side navigation for multi-printer selection and quick addition,
 * plus comprehensive modal management for configuring, adding, removing, and connecting
 * to FlashForge Creator 5 (and related) printers.
 */

import { apiRequest } from '../core/Transport.js';
import { $, hideElement, setTextContent, showElement, showToast } from '../shared/dom.js';
import { initializeLucideIcons } from '../shared/icons.js';
import { setPrinterStatusLoading, updateConnectionStatus } from '../ui/panels.js';
import { getActiveView, switchToSettingsView, updateDeviceSubtabPill } from '../ui/views.js';
import { showCameraConnectingState } from './camera.js';
import { fetchPrinterContexts, switchPrinterContext } from './context-switching.js';
import { onSettingsTabChanged, switchSettingsTab } from './layout-theme.js';
import { fetchAmsStatus } from './ams-manager.js';

export interface FleetPrinter {
  serialNumber: string;
  name: string;
  ipAddress: string;
  checkCode: string;
  model: string;
  clientType: string;
  isConnected: boolean;
  isActive: boolean;
  contextId: string | null;
  printerState?: string | null;
  printProgress?: number | null;
  jobName?: string | null;
  lastConnected: string | null;
  customCameraEnabled?: boolean;
  customCameraUrl?: string;
  disabled?: boolean;
}

interface FleetListResponse {
  success: boolean;
  printers?: FleetPrinter[];
  activeContextId?: string | null;
  activeSerial?: string | null;
  error?: string;
}

let cachedPrinters: FleetPrinter[] = [];

export function getCachedPrinters(): FleetPrinter[] {
  return cachedPrinters;
}

export function getActivePrinterIndex(): number | null {
  if (cachedPrinters.length === 0) return null;
  const idx = cachedPrinters.findIndex((p) => p.isActive);
  return idx !== -1 ? idx : 0;
}

export async function selectPrinterByIndex(index: number): Promise<void> {
  if (index < 0 || index >= cachedPrinters.length) return;
  const target = cachedPrinters[index];
  if (!target || target.disabled) return;
  if (!target.isActive) {
    await handleSelectPrinter(target.name, target.contextId || undefined);
  }
}
let isEditing = false;
let currentEditingName: string | null = null;
let isSubmitting = false;

// ============================================================================
// SETTINGS FLEET TAB NAVIGATION & CONTROLS
// ============================================================================

export function openPrinterManagement(openForm = false, printerToEdit: string | null = null): void {
  switchToSettingsView();
  switchSettingsTab('fleet');
  void loadPrintersList();
  if (printerToEdit) {
    openEditPrinterForm(printerToEdit);
  } else if (openForm) {
    openAddPrinterForm();
  } else {
    closePrinterForm();
  }
  initializeLucideIcons();
}

/**
 * Backward compatibility aliases for previous modal functions
 */
export function openPrinterMgmtModal(): void {
  openPrinterManagement();
}

export function closePrinterMgmtModal(): void {
  closePrinterForm();
}

// ============================================================================
// FLEET DATA FETCH & RENDER
// ============================================================================

/**
 * Render shimmering skeleton items in the left sidebar while loading printers
 */
function renderSidebarSkeletons(count = 2): string {
  return Array.from({ length: count }, () => `
    <div class="printer-sidebar-item skeleton-sidebar-item" aria-hidden="true">
      <span class="skeleton-shimmer" style="width: 8px; height: 8px; border-radius: 50%;"></span>
      <div class="item-info">
        <div class="item-name-row" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="skeleton-shimmer" style="width: 75px; height: 12px; border-radius: 3px;"></span>
          <span class="skeleton-shimmer" style="width: 24px; height: 11px; border-radius: 3px;"></span>
        </div>
        <div class="item-meta-row" style="margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span class="skeleton-shimmer" style="width: 65px; height: 10px; border-radius: 3px;"></span>
          <span class="skeleton-shimmer" style="width: 35px; height: 10px; border-radius: 3px;"></span>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Render shimmering skeleton cards in Settings > Printers & Fleet while loading
 */
function renderPrinterCardSkeletons(count = 2): string {
  return Array.from({ length: count }, () => `
    <div class="printer-card skeleton-card" aria-hidden="true">
      <div class="printer-card-header">
        <div class="printer-card-title-row" style="display: flex; align-items: center; gap: 8px;">
          <span class="skeleton-shimmer" style="width: 10px; height: 10px; border-radius: 50%;"></span>
          <span class="skeleton-shimmer" style="width: 120px; height: 15px; border-radius: 4px;"></span>
          <span class="skeleton-shimmer" style="width: 45px; height: 14px; border-radius: 4px;"></span>
        </div>
        <div class="printer-card-actions" style="display: flex; gap: 6px;">
          <span class="skeleton-shimmer" style="width: 65px; height: 24px; border-radius: 4px;"></span>
          <span class="skeleton-shimmer" style="width: 65px; height: 24px; border-radius: 4px;"></span>
        </div>
      </div>
      <div class="printer-card-details">
        <div class="printer-card-detail-item">
          <span class="detail-label">IP Address</span>
          <span class="skeleton-shimmer" style="width: 90px; height: 12px; border-radius: 3px; margin-top: 4px;"></span>
        </div>
        <div class="printer-card-detail-item">
          <span class="detail-label">Serial Number</span>
          <span class="skeleton-shimmer" style="width: 110px; height: 12px; border-radius: 3px; margin-top: 4px;"></span>
        </div>
        <div class="printer-card-detail-item">
          <span class="detail-label">Status</span>
          <span class="skeleton-shimmer" style="width: 50px; height: 12px; border-radius: 3px; margin-top: 4px;"></span>
        </div>
      </div>
    </div>
  `).join('');
}

export async function loadPrintersList(): Promise<void> {
  const listEl = $('printer-mgmt-list');
  const emptyEl = $('printer-mgmt-empty');
  const badgeEl = $('printer-mgmt-count-badge');
  const sidebarList = $('printer-sidebar-list');
  const refreshBtn = $('btn-refresh-printers');

  // If no cached printers exist yet, show skeleton loading states
  if (cachedPrinters.length === 0) {
    if (sidebarList && !sidebarList.querySelector('.printer-sidebar-item:not(.skeleton-sidebar-item)')) {
      sidebarList.innerHTML = renderSidebarSkeletons(2);
    }
    if (listEl && !listEl.querySelector('.printer-card:not(.skeleton-card)')) {
      listEl.innerHTML = renderPrinterCardSkeletons(2);
      showElement('printer-mgmt-list');
      if (emptyEl) hideElement('printer-mgmt-empty');
    }
  }

  // Animate refresh button icon
  const refreshIcon = refreshBtn?.querySelector('[data-lucide="refresh-cw"], svg');
  if (refreshIcon) refreshIcon.classList.add('spin');

  try {
    const res = await apiRequest<FleetListResponse>('/api/printers');
    if (!res.success || !Array.isArray(res.printers)) {
      showToast(res.error || 'Failed to load printers list', 'error');
      return;
    }

    cachedPrinters = res.printers;
    const count = cachedPrinters.length;
    if (badgeEl) {
      badgeEl.textContent = `${count} Printer${count === 1 ? '' : 's'}`;
    }

    // Update left sidebar and single vs multi-printer layout visibility
    updateFleetVisibility(cachedPrinters);

    // Update modal cards list if modal is present
    if (count === 0) {
      if (listEl) hideElement('printer-mgmt-list');
      if (emptyEl) showElement('printer-mgmt-empty');
      return;
    }

    if (emptyEl) hideElement('printer-mgmt-empty');
    if (listEl) {
      showElement('printer-mgmt-list');
      renderPrintersList(cachedPrinters);
    }
  } catch (error) {
    console.error('[Fleet] Error loading printers:', error);
    showToast('Failed to load fleet printers', 'error');
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('spin');
  }
}

/**
 * Updates UI visibility based on whether the fleet has 1 printer or multiple printers.
 * - If 1 printer: hide left sidebar and header fleet button; add printer accessible via Settings only.
 * - If > 1 printer: show left-side printer navigation with '+' sign in top right of sidebar.
 */
export function updateFleetVisibility(printers: FleetPrinter[]): void {
  const sidebar = $('printer-nav-sidebar');
  const headerBtn = $('btn-open-printer-mgmt');
  const headerSelector = $('printer-selector');
  const settingsStatusText = $('settings-printer-status-text');

  if (headerBtn) hideElement('btn-open-printer-mgmt');
  if (headerSelector) hideElement('printer-selector');

  renderSidebarPrinterNav(printers);

  // Update active device pill in the device subtabs bar
  const activePrinter = printers.find((p) => p.isActive) || printers[0];
  if (activePrinter) {
    updateDeviceSubtabPill(activePrinter.name, activePrinter.model, activePrinter.isConnected);
  }

  // Show sidebar when in Devices view
  const currentView = getActiveView();
  if (currentView === 'devices') {
    if (sidebar) showElement('printer-nav-sidebar');
  } else {
    if (sidebar) hideElement('printer-nav-sidebar');
  }

  if (settingsStatusText) {
    if (printers.length === 1) {
      const p = printers[0];
      settingsStatusText.textContent = `1 printer configured: ${p.name} (${p.ipAddress}) · ${p.isConnected ? 'Connected' : 'Offline'}`;
    } else {
      settingsStatusText.textContent = `${printers.length} printers configured in fleet`;
    }
  }
}

/**
 * Renders the compact left sidebar printer items.
 */
export function renderSidebarPrinterNav(printers: FleetPrinter[]): void {
  const sidebarList = $('printer-sidebar-list');
  const countBadge = $('sidebar-printer-count');

  if (countBadge) {
    countBadge.textContent = printers.length.toString();
  }

  if (!sidebarList) return;

  sidebarList.innerHTML = printers
    .map((printer) => {
      const isCardDisabled = Boolean(printer.disabled);
      const statusClass = isCardDisabled
        ? 'status-disabled'
        : printer.isActive
          ? 'status-active'
          : printer.isConnected
            ? 'status-connected'
            : 'status-offline';

      const isOnline = !isCardDisabled && printer.isConnected;
      const statusText = isCardDisabled
        ? 'Disabled'
        : printer.isActive
          ? 'Selected'
          : printer.isConnected
            ? 'Online'
            : '';

      // Print job name (truncates with ellipsis at rest, news-crawls on hover if overflowing)
      const rawJobName = (printer.jobName || '').replace(/\.(gcode\.3mf|3mf|gcode|gx)$/i, '');
      const displayPrintName = !isOnline
        ? ''
        : rawJobName || 'No active print';

      // Short machine status pill (replaces item-model-badge; shows OFFLINE/OFF when not connected)
      let shortStatus = isCardDisabled ? 'Off' : 'Offline';
      if (isOnline) {
        const rawState = (printer.printerState || '').toLowerCase();
        if (rawState.includes('print') || rawState.includes('busy')) {
          shortStatus = typeof printer.printProgress === 'number' && printer.printProgress >= 0
            ? `${Math.round(printer.printProgress)}%`
            : 'Printing';
        } else if (rawState.includes('pause')) {
          shortStatus = 'Paused';
        } else if (rawState.includes('complete')) {
          shortStatus = 'Done';
        } else if (rawState.includes('heat') || rawState.includes('warm') || rawState.includes('calibrat') || rawState.includes('homing')) {
          shortStatus = 'Prep';
        } else {
          shortStatus = 'Ready';
        }
      }

      const metaRowHtml = isOnline
        ? `
            <div class="item-meta-row">
              <span class="item-ip" title="${escapeHtml(displayPrintName)}"><span class="item-ip-inner">${escapeHtml(displayPrintName)}</span></span>
              <span class="item-state-text ${statusClass}">${statusText}</span>
            </div>`
        : '';

      return `
        <div class="printer-sidebar-item ${isCardDisabled ? 'disabled' : ''} ${printer.isActive ? 'active' : ''}"
             data-name="${escapeHtml(printer.name)}"
             data-serial="${escapeHtml(printer.serialNumber)}"
             data-disabled="${isCardDisabled ? 'true' : 'false'}"
             data-context="${escapeHtml(printer.contextId || '')}"
             title="${escapeHtml(printer.name)} (${escapeHtml(printer.ipAddress)}) - ${isOnline ? statusText : shortStatus}${rawJobName ? ' · ' + escapeHtml(rawJobName) : ''}">
          <span class="item-status-indicator ${statusClass}"></span>
          <div class="item-info">
            <div class="item-name-row">
              <span class="item-name">${escapeHtml(printer.name)}</span>
              <span class="item-model-badge">${escapeHtml(shortStatus)}</span>
            </div>${metaRowHtml}
          </div>
          <button type="button" class="btn-sidebar-item-config" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}" title="Configure Settings">
            <i data-lucide="settings"></i>
          </button>
        </div>
      `;
    })
    .join('');

  initializeLucideIcons();

  // Measure print name overflow for hover news-crawl marquee
  requestAnimationFrame(() => {
    sidebarList.querySelectorAll<HTMLElement>('.item-ip').forEach((container) => {
      const inner = container.querySelector<HTMLElement>('.item-ip-inner');
      if (!inner) return;
      const overflowPx = inner.scrollWidth - container.clientWidth;
      if (overflowPx > 2) {
        container.classList.add('is-overflowing');
        const durationSec = Math.max(2.5, Math.min(8, overflowPx / 28));
        container.style.setProperty('--crawl-distance', `-${overflowPx + 6}px`);
        container.style.setProperty('--crawl-duration', `${durationSec.toFixed(2)}s`);
      } else {
        container.classList.remove('is-overflowing');
      }
    });
  });
}

/**
 * Renders the detailed cards inside the Fleet Management Modal.
 */
function renderPrintersList(printers: FleetPrinter[]): void {
  const container = $('printer-mgmt-list');
  if (!container) return;

  container.innerHTML = printers
    .map((printer) => {
      const isCardDisabled = Boolean(printer.disabled);

      const statusClass = isCardDisabled
        ? 'status-disabled'
        : printer.isActive
          ? 'status-active'
          : printer.isConnected
            ? 'status-connected'
            : 'status-offline';

      const statusText = isCardDisabled
        ? 'Disabled'
        : printer.isActive
          ? 'Selected & Connected'
          : printer.isConnected
            ? 'Connected'
            : 'Offline';

      const cameraInfo = printer.customCameraEnabled
        ? `<span class="printer-card-badge camera-badge" title="${escapeHtml(printer.customCameraUrl || 'Custom stream')}"><i data-lucide="video"></i> Custom Cam</span>`
        : '';

      const disabledBadge = isCardDisabled
        ? `<span class="printer-card-badge disabled-badge"><i data-lucide="power-off"></i> Disabled</span>`
        : '';

      const activeBadge = !isCardDisabled && printer.isActive
        ? `<span class="printer-card-badge active-badge"><i data-lucide="check"></i> Selected</span>`
        : '';

      const switchBtn = !isCardDisabled && !printer.isActive && printer.isConnected
        ? `<button type="button" class="btn-action-select secondary-btn mini-btn" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}" data-context="${escapeHtml(printer.contextId || '')}">
             <i data-lucide="chevron-right"></i>
             <span>Switch To</span>
           </button>`
        : '';

      const connectBtn = !isCardDisabled && !printer.isConnected
        ? `<button type="button" class="btn-action-connect secondary-btn mini-btn" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}" data-ip="${escapeHtml(printer.ipAddress)}">
             <i data-lucide="wifi"></i>
             <span>Connect</span>
           </button>`
        : '';

      const toggleEnableBtn = `
        <button type="button" class="btn-action-toggle-enable mini-btn ${isCardDisabled ? 'enable-btn' : 'disable-btn'}" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}" title="${isCardDisabled ? 'Enable this printer' : 'Disable this printer'}">
          <i data-lucide="${isCardDisabled ? 'power' : 'power-off'}"></i>
          <span>${isCardDisabled ? 'Enable' : 'Disable'}</span>
        </button>
      `;

      return `
        <div class="printer-card ${isCardDisabled ? 'disabled-card' : ''} ${printer.isActive ? 'active-card' : ''}" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}">
          <div class="printer-card-header">
            <div class="printer-card-title-row">
              <span class="printer-card-dot ${statusClass}" title="${statusText}"></span>
              <span class="printer-card-name" title="${escapeHtml(printer.name)}">${escapeHtml(printer.name)}</span>
              <span class="printer-card-model">${escapeHtml(printer.model || 'Creator 5 Pro')}</span>
              ${disabledBadge}
              ${activeBadge}
              ${cameraInfo}
            </div>
            <div class="printer-card-actions">
              ${toggleEnableBtn}
              ${switchBtn}
              ${connectBtn}
              <button type="button" class="btn-action-edit mini-icon-btn" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}" title="Configure Printer">
                <i data-lucide="edit-3"></i>
              </button>
              <button type="button" class="btn-action-delete mini-icon-btn danger" data-name="${escapeHtml(printer.name)}" data-serial="${escapeHtml(printer.serialNumber)}" title="Remove Printer">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>

          <div class="printer-card-details">
            <div class="printer-card-detail-item">
              <span class="detail-label">IP Address</span>
              <span class="detail-value mono">${escapeHtml(printer.ipAddress)}</span>
            </div>
            <div class="printer-card-detail-item">
              <span class="detail-label">Serial Number</span>
              <span class="detail-value mono">${escapeHtml(printer.serialNumber || 'Auto-discover')}</span>
            </div>
            <div class="printer-card-detail-item">
              <span class="detail-label">Status</span>
              <span class="detail-value ${statusClass}">${statusText}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  initializeLucideIcons();
}

// ============================================================================
// EXTENSIBLE MODEL CATALOG & FORM CONTROLS
// ============================================================================

export interface PrinterModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly vendor: string;
  readonly requiresCheckCode: boolean;
  readonly checkCodeLabel?: string;
  readonly checkCodePlaceholder?: string;
  readonly checkCodeHint?: string;
  readonly requiresSerialNumber?: boolean;
  readonly serialNumberHint?: string;
}

let modelCatalog: PrinterModelDescriptor[] = [
  {
    id: 'ad5x',
    displayName: 'FlashForge Creator 5 / AD5X',
    vendor: 'FlashForge',
    requiresCheckCode: true,
    checkCodeLabel: 'Check Code',
    checkCodePlaceholder: 'e.g. 123456',
    checkCodeHint: 'Found on printer touchscreen under Settings > About',
    requiresSerialNumber: false,
  },
  {
    id: 'bambu-a1-mini',
    displayName: 'Bambu Lab A1 mini',
    vendor: 'Bambu Lab',
    requiresCheckCode: true,
    checkCodeLabel: 'LAN Access Code',
    checkCodePlaceholder: 'e.g. 12345678',
    checkCodeHint: 'Found on printer screen under Settings > LAN Mode',
    requiresSerialNumber: true,
    serialNumberHint: 'Found on printer screen under Settings > Device (15 chars)',
  },
  {
    id: 'adventurer-5m-pro',
    displayName: 'FlashForge Adventurer 5M Pro',
    vendor: 'FlashForge',
    requiresCheckCode: true,
    checkCodeLabel: 'Check Code',
    checkCodePlaceholder: 'e.g. 123456',
    checkCodeHint: 'Found on printer touchscreen under Settings > About',
    requiresSerialNumber: false,
  },
  {
    id: 'adventurer-5m',
    displayName: 'FlashForge Adventurer 5M',
    vendor: 'FlashForge',
    requiresCheckCode: true,
    checkCodeLabel: 'Check Code',
    checkCodePlaceholder: 'e.g. 123456',
    checkCodeHint: 'Found on printer touchscreen under Settings > About',
    requiresSerialNumber: false,
  },
];

export async function loadPrinterModelCatalog(): Promise<PrinterModelDescriptor[]> {
  try {
    const res = await apiRequest<{ success: boolean; models?: PrinterModelDescriptor[] }>('/api/printers/models');
    if (res?.success && Array.isArray(res.models) && res.models.length > 0) {
      modelCatalog = res.models;
      populateModelDropdown(modelCatalog);
      return modelCatalog;
    }
  } catch (err) {
    console.warn('[printer-mgmt] Could not fetch printer models from backend registry:', err);
  }
  return modelCatalog;
}

function populateModelDropdown(models: PrinterModelDescriptor[]): void {
  const modelSelect = $('printer-form-model') as HTMLSelectElement | null;
  if (!modelSelect || models.length === 0) return;

  const currentVal = modelSelect.value;
  modelSelect.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.displayName;
    opt.textContent = m.displayName;
    modelSelect.appendChild(opt);
  }

  if (currentVal && models.some((m) => m.displayName === currentVal || m.id === currentVal)) {
    modelSelect.value = currentVal;
  }
}

function updateModelFormFields(modelName: string): void {
  const descriptor = modelCatalog.find(
    (m) =>
      m.displayName.toLowerCase() === modelName.toLowerCase() ||
      m.id.toLowerCase() === modelName.toLowerCase() ||
      modelName.toLowerCase().includes(m.displayName.toLowerCase()) ||
      modelName.toLowerCase().includes(m.id.toLowerCase())
  );

  const checkCodeInput = $('printer-form-checkcode') as HTMLInputElement | null;
  const serialInput = $('printer-form-serial') as HTMLInputElement | null;
  const checkCodeLabel = document.querySelector('label[for="printer-form-checkcode"]');
  const serialLabel = document.querySelector('label[for="printer-form-serial"]');

  if (descriptor) {
    const labelText = descriptor.checkCodeLabel || 'Check Code';
    const reqText = descriptor.requiresCheckCode
      ? ` (Required — ${descriptor.checkCodeHint || 'Settings'})`
      : ' (Optional)';
    if (checkCodeLabel) {
      checkCodeLabel.innerHTML = `${labelText} <span class="help-hint">${reqText}</span>`;
    }
    if (checkCodeInput) {
      checkCodeInput.placeholder = descriptor.checkCodePlaceholder || (descriptor.requiresCheckCode ? 'Required check code' : 'Optional check code');
    }

    const serialReqText = descriptor.requiresSerialNumber
      ? ` (Required — ${descriptor.serialNumberHint || 'Settings > Device'})`
      : ' (Optional — auto-discovered on connect)';
    if (serialLabel) {
      serialLabel.innerHTML = `Serial Number <span class="help-hint">${serialReqText}</span>`;
    }
    if (serialInput) {
      serialInput.placeholder = descriptor.requiresSerialNumber ? 'Required serial number' : 'Optional serial number';
    }
  } else {
    if (checkCodeLabel) checkCodeLabel.innerHTML = 'Check Code / PIN <span class="help-hint">(Optional)</span>';
    if (checkCodeInput) checkCodeInput.placeholder = 'Optional security check code';
    if (serialLabel) serialLabel.innerHTML = 'Serial Number <span class="help-hint">(Optional — auto-discovered on connect)</span>';
    if (serialInput) serialInput.placeholder = 'Optional serial number';
  }
}

export function openAddPrinterForm(): void {
  isEditing = false;
  currentEditingName = null;

  switchToSettingsView();
  switchSettingsTab('fleet');
  showElement('printer-mgmt-form-card');
  hideElement('btn-toggle-add-printer'); // Form open: hide toolbar button, no "Close Form" button

  setTextContent('printer-form-title', 'Add New Printer');
  setTextContent('printer-form-submit-text', 'Add Printer');

  const serialInput = $('printer-form-serial') as HTMLInputElement | null;
  const nameInput = $('printer-form-name') as HTMLInputElement | null;
  const ipInput = $('printer-form-ip') as HTMLInputElement | null;
  const modelSelect = $('printer-form-model') as HTMLSelectElement | null;
  const checkCodeInput = $('printer-form-checkcode') as HTMLInputElement | null;
  const customCamCheck = $('printer-form-custom-camera') as HTMLInputElement | null;
  const customCamUrl = $('printer-form-camera-url') as HTMLInputElement | null;
  const connectNowCheck = $('printer-form-connect-now') as HTMLInputElement | null;
  const editSerialHidden = $('printer-form-edit-serial') as HTMLInputElement | null;
  const connectNowGroup = $('printer-form-connect-now-group');

  if (editSerialHidden) editSerialHidden.value = '';
  if (nameInput) nameInput.value = '';
  if (ipInput) ipInput.value = '';
  if (modelSelect) {
    modelSelect.value = 'Creator 5 Pro';
    updateModelFormFields('Creator 5 Pro');
  }
  if (checkCodeInput) checkCodeInput.value = '';
  if (serialInput) {
    serialInput.value = '';
    serialInput.disabled = false;
  }
  if (customCamCheck) customCamCheck.checked = false;
  if (customCamUrl) customCamUrl.value = '';
  hideElement('printer-form-camera-url-row');

  if (connectNowCheck) connectNowCheck.checked = true;
  if (connectNowGroup) showElement('printer-form-connect-now-group');

  const enabledCheck = $('printer-form-enabled') as HTMLInputElement | null;
  if (enabledCheck) enabledCheck.checked = true;

  clearFormStatus();
  initializeLucideIcons();

  nameInput?.focus();
}

export function openEditPrinterForm(identifier: string): void {
  const printer = cachedPrinters.find(
    (p) => p.name.trim().toLowerCase() === identifier.trim().toLowerCase() || p.serialNumber === identifier
  );
  if (!printer) {
    showToast(`Printer "${identifier}" not found`, 'error');
    return;
  }

  isEditing = true;
  currentEditingName = printer.name;

  switchToSettingsView();
  switchSettingsTab('fleet');
  showElement('printer-mgmt-form-card');
  hideElement('btn-toggle-add-printer'); // Form open: hide toolbar button, no "Close Form" button

  setTextContent('printer-form-title', `Configure Printer: ${printer.name}`);
  setTextContent('printer-form-submit-text', 'Save Changes');

  const serialInput = $('printer-form-serial') as HTMLInputElement | null;
  const nameInput = $('printer-form-name') as HTMLInputElement | null;
  const ipInput = $('printer-form-ip') as HTMLInputElement | null;
  const modelSelect = $('printer-form-model') as HTMLSelectElement | null;
  const checkCodeInput = $('printer-form-checkcode') as HTMLInputElement | null;
  const customCamCheck = $('printer-form-custom-camera') as HTMLInputElement | null;
  const customCamUrl = $('printer-form-camera-url') as HTMLInputElement | null;
  const editSerialHidden = $('printer-form-edit-serial') as HTMLInputElement | null;
  const connectNowGroup = $('printer-form-connect-now-group');

  if (editSerialHidden) editSerialHidden.value = printer.name;
  if (nameInput) nameInput.value = printer.name;
  if (ipInput) ipInput.value = printer.ipAddress;
  if (modelSelect) {
    const m = printer.model || 'Creator 5 Pro';
    modelSelect.value = m;
    updateModelFormFields(m);
  }
  if (checkCodeInput) checkCodeInput.value = printer.checkCode || '';
  if (serialInput) {
    serialInput.value = printer.serialNumber;
    serialInput.disabled = true; // Serial number cannot be changed once created
  }

  const hasCustomCam = Boolean(printer.customCameraEnabled);
  if (customCamCheck) customCamCheck.checked = hasCustomCam;
  if (customCamUrl) customCamUrl.value = printer.customCameraUrl || '';
  if (hasCustomCam) {
    showElement('printer-form-camera-url-row');
  } else {
    hideElement('printer-form-camera-url-row');
  }

  // Hide "Connect immediately" on edit
  if (connectNowGroup) hideElement('printer-form-connect-now-group');

  const enabledCheck = $('printer-form-enabled') as HTMLInputElement | null;
  if (enabledCheck) enabledCheck.checked = !printer.disabled;

  clearFormStatus();
  initializeLucideIcons();

  nameInput?.focus();
}

export function closePrinterForm(): void {
  hideElement('printer-mgmt-form-card');
  showElement('btn-toggle-add-printer');
  setTextContent('btn-toggle-add-printer-text', 'Add Printer');
  clearFormStatus();
  isEditing = false;
  currentEditingName = null;
}

function clearFormStatus(): void {
  const statusEl = $('printer-form-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'printer-form-status';
  }
}

function setFormStatus(message: string, type: 'info' | 'error' | 'success'): void {
  const statusEl = $('printer-form-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `printer-form-status ${type}`;
  }
}

// ============================================================================
// FORM SUBMIT HANDLER
// ============================================================================

async function handleFormSubmit(event: Event): Promise<void> {
  event.preventDefault();
  if (isSubmitting) return;

  const name = ($('printer-form-name') as HTMLInputElement | null)?.value.trim() || '';
  const ip = ($('printer-form-ip') as HTMLInputElement | null)?.value.trim() || '';
  const model = ($('printer-form-model') as HTMLSelectElement | null)?.value || 'Creator 5 Pro';
  const checkCode = ($('printer-form-checkcode') as HTMLInputElement | null)?.value.trim() || '';
  const serial = ($('printer-form-serial') as HTMLInputElement | null)?.value.trim() || '';
  const customCameraEnabled = Boolean(($('printer-form-custom-camera') as HTMLInputElement | null)?.checked);
  const customCameraUrl = ($('printer-form-camera-url') as HTMLInputElement | null)?.value.trim() || '';
  const connectNow = Boolean(($('printer-form-connect-now') as HTMLInputElement | null)?.checked);
  const isEnabled = Boolean(($('printer-form-enabled') as HTMLInputElement | null)?.checked ?? true);

  if (!name) {
    setFormStatus('Please provide a distinct printer name.', 'error');
    return;
  }

  if (!ip) {
    setFormStatus('Please provide a valid IP address.', 'error');
    return;
  }

  const descriptor = modelCatalog.find(
    (m) =>
      m.displayName.toLowerCase() === model.toLowerCase() ||
      m.id.toLowerCase() === model.toLowerCase() ||
      model.toLowerCase().includes(m.displayName.toLowerCase()) ||
      model.toLowerCase().includes(m.id.toLowerCase())
  );

  if (descriptor?.requiresSerialNumber && !serial) {
    setFormStatus(`Serial number is required for ${descriptor.displayName}${descriptor.serialNumberHint ? ` (${descriptor.serialNumberHint})` : ''}.`, 'error');
    return;
  }
  if (descriptor?.requiresCheckCode && !checkCode) {
    setFormStatus(`${descriptor.checkCodeLabel || 'Check Code'} is required for ${descriptor.displayName}${descriptor.checkCodeHint ? ` (${descriptor.checkCodeHint})` : ''}.`, 'error');
    return;
  }

  // Client-side distinct name validation
  const nameLower = name.toLowerCase();
  const editingName = currentEditingName;
  const isDuplicateName = isEditing && editingName
    ? cachedPrinters.some(p => p.name.trim().toLowerCase() === nameLower && p.name.trim().toLowerCase() !== editingName.trim().toLowerCase())
    : cachedPrinters.some(p => p.name.trim().toLowerCase() === nameLower);

  if (isDuplicateName) {
    setFormStatus(`A printer named "${name}" already exists. Please choose a distinct name.`, 'error');
    return;
  }

  isSubmitting = true;
  const submitBtn = $('printer-form-submit') as HTMLButtonElement | null;
  const submitText = $('printer-form-submit-text');
  const originalSubmitText = submitText?.textContent || (isEditing ? 'Save Changes' : 'Add Printer');
  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.innerHTML = `<span class="btn-spinner"></span> <span>${isEditing ? 'Saving...' : 'Adding...'}</span>`;

  try {
    if (isEditing && currentEditingName) {
      setFormStatus('Saving changes...', 'info');
      const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
        `/api/printers/${encodeURIComponent(currentEditingName)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Name: name,
            IPAddress: ip,
            CheckCode: checkCode,
            printerModel: model,
            customCameraEnabled,
            customCameraUrl,
            disabled: !isEnabled,
          }),
        }
      );

      if (res.success) {
        showToast(res.message || 'Printer settings updated', 'success');
        closePrinterForm();
        await loadPrintersList();
        await fetchPrinterContexts();
      } else {
        setFormStatus(res.error || 'Failed to update printer settings', 'error');
      }
    } else {
      setFormStatus(connectNow ? 'Connecting to printer...' : 'Saving printer...', 'info');
      const res = await apiRequest<{
        success: boolean;
        message?: string;
        connected?: boolean;
        connectionError?: string | null;
        error?: string;
      }>('/api/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ipAddress: ip,
          model,
          checkCode,
          serialNumber: serial || undefined,
          connectNow,
          disabled: !isEnabled,
        }),
      });

      if (res.success) {
        showToast(res.message || 'Printer added successfully!', 'success');
        closePrinterForm();
        await loadPrintersList();
        await fetchPrinterContexts();
      } else {
        setFormStatus(res.error || 'Failed to add printer', 'error');
      }
    }
  } catch (error) {
    console.error('[Fleet] Form submission error:', error);
    setFormStatus('An error occurred during submission.', 'error');
  } finally {
    isSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = originalSubmitText;
  }
}

// ============================================================================
// PRINTER ACTIONS (SELECT, CONNECT, DELETE)
// ============================================================================

async function handleSelectPrinter(name: string, contextId?: string): Promise<void> {
  const syncPrinterUrl = () => {
    const idx = cachedPrinters.findIndex((p) => p.name === name || p.serialNumber === name);
    if (idx !== -1 && getActiveView() === 'devices') {
      const targetPath = `/printers/${idx}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ path: targetPath }, '', targetPath);
      }
    }
  };

  if (contextId) {
    // If context already exists, use fast local switch
    await switchPrinterContext(contextId);
    await loadPrintersList();
    syncPrinterUrl();
    void fetchAmsStatus(contextId);
    return;
  }

  // Trigger loading animations immediately before connecting
  updateConnectionStatus(false, true);
  setPrinterStatusLoading(true);
  showCameraConnectingState();
  updateDeviceSubtabPill(name, '', false, true);

  // Otherwise invoke server select endpoint which connects if needed
  try {
    showToast(`Connecting to ${name}...`, 'info');
    const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
      `/api/printers/${encodeURIComponent(name)}/select`,
      { method: 'POST' }
    );

    if (res.success) {
      await fetchPrinterContexts();
      await loadPrintersList();
      syncPrinterUrl();
      void fetchAmsStatus();
    } else {
      showToast(res.error || 'Failed to switch printer', 'error');
      updateConnectionStatus(false);
      setPrinterStatusLoading(false);
    }
  } catch (error) {
    console.error('[Fleet] Select printer error:', error);
    showToast('Failed to select printer', 'error');
    updateConnectionStatus(false);
    setPrinterStatusLoading(false);
  }
}

async function handleConnectPrinter(name: string): Promise<void> {
  try {
    showToast(`Attempting to connect to ${name}...`, 'info');
    const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
      `/api/printers/${encodeURIComponent(name)}/connect`,
      { method: 'POST' }
    );

    if (res.success) {
      showToast(res.message || 'Connected successfully!', 'success');
      await fetchPrinterContexts();
      await loadPrintersList();
    } else {
      showToast(res.error || 'Connection failed', 'error');
    }
  } catch (error) {
    console.error('[Fleet] Connect printer error:', error);
    showToast('Failed to connect to printer', 'error');
  }
}

async function handleDeletePrinter(name: string): Promise<void> {
  const confirmed = window.confirm(
    `Are you sure you want to remove "${name}" from your configured printers?\n\nIf active, the WebUI will switch to another available printer.`
  );
  if (!confirmed) return;

  try {
    const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
      `/api/printers/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );

    if (res.success) {
      showToast(res.message || 'Printer removed', 'success');
      await fetchPrinterContexts();
      await loadPrintersList();
    } else {
      showToast(res.error || 'Failed to remove printer', 'error');
    }
  } catch (error) {
    console.error('[Fleet] Delete printer error:', error);
    showToast('Failed to remove printer', 'error');
  }
}

async function handleTogglePrinterEnabled(name: string): Promise<void> {
  const printer = cachedPrinters.find((p) => p.name === name || p.serialNumber === name);
  if (!printer) return;

  const willEnable = Boolean(printer.disabled);
  const action = willEnable ? 'enable' : 'disable';

  try {
    showToast(`${willEnable ? 'Enabling' : 'Disabling'} printer "${printer.name}"...`, 'info');
    const res = await apiRequest<{ success: boolean; message?: string; error?: string }>(
      `/api/printers/${encodeURIComponent(printer.name)}/${action}`,
      { method: 'POST' }
    );

    if (res.success) {
      showToast(res.message || `Printer ${printer.name} ${willEnable ? 'enabled' : 'disabled'}`, 'success');
      await fetchPrinterContexts();
      await loadPrintersList();
    } else {
      showToast(res.error || `Failed to ${action} printer`, 'error');
    }
  } catch (error) {
    console.error(`[Fleet] ${action} printer error:`, error);
    showToast(`Failed to ${action} printer`, 'error');
  }
}

// ============================================================================
// EVENT WIRING INITIALIZER
// ============================================================================

export function setupPrinterManagementHandlers(): void {
  // Listen for navigation to Printers & Fleet tab in Settings
  onSettingsTabChanged((tabId) => {
    if (tabId === 'settings-panel-fleet') {
      void loadPrintersList();
    }
  });

  // Desktop header button (hidden when only 1 printer)
  const headerBtn = $('btn-open-printer-mgmt');
  headerBtn?.addEventListener('click', () => {
    openPrinterManagement();
  });

  // Mobile nav button
  const mobileBtn = $('mobile-printer-mgmt-button');
  mobileBtn?.addEventListener('click', () => {
    // Close mobile drawer first
    const drawer = $('mobile-nav-drawer');
    if (drawer) {
      drawer.classList.add('hidden');
      drawer.classList.remove('open');
    }
    openPrinterManagement();
  });

  // Close modal button (if present)
  const closeBtn = $('close-printer-mgmt');
  closeBtn?.addEventListener('click', () => {
    closePrinterForm();
  });

  // Refresh button in fleet toolbar
  const refreshBtn = $('btn-refresh-printers');
  refreshBtn?.addEventListener('click', () => {
    void loadPrintersList();
  });

  // Toggle add form button in fleet toolbar
  const toggleAddBtn = $('btn-toggle-add-printer');
  toggleAddBtn?.addEventListener('click', () => {
    const formCard = $('printer-mgmt-form-card');
    if (formCard && !formCard.classList.contains('hidden')) {
      closePrinterForm();
    } else {
      openAddPrinterForm();
    }
  });

  // Empty state add button
  const emptyAddBtn = $('btn-empty-add-printer');
  emptyAddBtn?.addEventListener('click', () => {
    openAddPrinterForm();
  });

  // Left sidebar '+' add printer button (top right of sidebar)
  const sidebarAddBtn = $('btn-sidebar-add-printer');
  sidebarAddBtn?.addEventListener('click', () => {
    openAddPrinterForm();
  });

  // Left sidebar footer 'Manage Fleet' button
  const sidebarManageBtn = $('btn-sidebar-manage-fleet');
  sidebarManageBtn?.addEventListener('click', () => {
    openPrinterManagement();
  });

  // Delegation on left sidebar printer list
  const sidebarList = $('printer-sidebar-list');
  sidebarList?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    // Config / edit button on item
    const configBtn = target.closest<HTMLElement>('.btn-sidebar-item-config');
    if (configBtn) {
      event.stopPropagation();
      const name = configBtn.dataset.name || configBtn.dataset.serial;
      if (name) {
        openEditPrinterForm(name);
      }
      return;
    }

    // Click on item row -> select/switch printer
    const item = target.closest<HTMLElement>('.printer-sidebar-item');
    if (item && !item.classList.contains('skeleton-sidebar-item')) {
      if (item.dataset.disabled === 'true') {
        const name = item.dataset.name || 'Printer';
        showToast(`Printer "${name}" is disabled. Enable it in Settings > Printers & Fleet.`, 'info');
        return;
      }
      const name = item.dataset.name || item.dataset.serial;
      const contextId = item.dataset.context;
      if (name) {
        item.classList.add('is-switching');
        const stateText = item.querySelector('.item-state-text');
        const origText = stateText?.textContent || '';
        if (stateText) stateText.textContent = 'Connecting...';
        try {
          await handleSelectPrinter(name, contextId);
        } finally {
          item.classList.remove('is-switching');
          if (stateText && origText) stateText.textContent = origText;
        }
      }
      return;
    }
  });

  // Settings page: "Add Another Printer" button
  $('btn-settings-add-printer')?.addEventListener('click', () => {
    openAddPrinterForm();
  });

  // Settings page: "Manage Printers" button
  $('btn-settings-manage-fleet')?.addEventListener('click', () => {
    openPrinterMgmtModal();
  });

  // Form close X button & cancel button
  $('printer-form-close-x')?.addEventListener('click', () => closePrinterForm());
  $('printer-form-cancel')?.addEventListener('click', () => closePrinterForm());

  // Model change listener to update hints
  const modelSelectEl = $('printer-form-model') as HTMLSelectElement | null;
  modelSelectEl?.addEventListener('change', () => {
    updateModelFormFields(modelSelectEl.value);
  });

  // Custom camera checkbox toggle
  const customCamCheck = $('printer-form-custom-camera') as HTMLInputElement | null;
  customCamCheck?.addEventListener('change', () => {
    if (customCamCheck.checked) {
      showElement('printer-form-camera-url-row');
    } else {
      hideElement('printer-form-camera-url-row');
    }
  });

  // Form submit
  const form = $('printer-mgmt-form');
  form?.addEventListener('submit', (e) => void handleFormSubmit(e));

  // Delegation on modal printer list for card actions
  const listContainer = $('printer-mgmt-list');
  listContainer?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    // Toggle Enable / Disable button
    const toggleBtn = target.closest<HTMLButtonElement>('.btn-action-toggle-enable');
    if (toggleBtn && !toggleBtn.disabled) {
      const name = toggleBtn.dataset.name || toggleBtn.dataset.serial;
      if (name) {
        toggleBtn.disabled = true;
        toggleBtn.innerHTML = '<span class="btn-spinner"></span><span>Updating...</span>';
        try {
          await handleTogglePrinterEnabled(name);
        } finally {
          toggleBtn.disabled = false;
        }
      }
      return;
    }

    // Switch To button
    const selectBtn = target.closest<HTMLButtonElement>('.btn-action-select');
    if (selectBtn && !selectBtn.disabled) {
      const name = selectBtn.dataset.name || selectBtn.dataset.serial;
      const contextId = selectBtn.dataset.context;
      const card = selectBtn.closest<HTMLElement>('.printer-card');
      const cardDot = card?.querySelector('.printer-card-dot');
      if (name) {
        selectBtn.disabled = true;
        selectBtn.innerHTML = '<span class="btn-spinner"></span><span>Switching...</span>';
        cardDot?.classList.add('status-connecting');
        try {
          await handleSelectPrinter(name, contextId);
        } finally {
          selectBtn.disabled = false;
          cardDot?.classList.remove('status-connecting');
        }
      }
      return;
    }

    // Connect button
    const connectBtn = target.closest<HTMLButtonElement>('.btn-action-connect');
    if (connectBtn && !connectBtn.disabled) {
      const name = connectBtn.dataset.name || connectBtn.dataset.serial;
      const card = connectBtn.closest<HTMLElement>('.printer-card');
      const cardDot = card?.querySelector('.printer-card-dot');
      if (name) {
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<span class="btn-spinner"></span><span>Connecting...</span>';
        cardDot?.classList.add('status-connecting');
        try {
          await handleConnectPrinter(name);
        } finally {
          connectBtn.disabled = false;
          cardDot?.classList.remove('status-connecting');
        }
      }
      return;
    }

    // Edit button
    const editBtn = target.closest<HTMLElement>('.btn-action-edit');
    if (editBtn) {
      const name = editBtn.dataset.name || editBtn.dataset.serial;
      if (name) {
        openEditPrinterForm(name);
      }
      return;
    }

    // Delete button
    const deleteBtn = target.closest<HTMLElement>('.btn-action-delete');
    if (deleteBtn) {
      const name = deleteBtn.dataset.name || deleteBtn.dataset.serial;
      if (name) {
        void handleDeletePrinter(name);
      }
      return;
    }
  });

  // Escape key closes the add/edit form if open
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const formCard = $('printer-mgmt-form-card');
      if (formCard && !formCard.classList.contains('hidden')) {
        closePrinterForm();
      }
    }
  });

  // Fetch initial fleet list and dynamic adapter model catalog on setup
  void loadPrintersList();
  void loadPrinterModelCatalog();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

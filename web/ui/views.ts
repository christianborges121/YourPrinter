/**
 * @fileoverview Main view navigation manager for YourPrinter WebUI.
 *
 * Manages switching between top-level views (Fleet Dashboard, Devices, Settings),
 * URL history synchronization (/dashboard, /printers, /printers/:index, /settings),
 * and per-device subtabs (Status, Media, Device Info). Keeps DOM state, top navigation tabs,
 * left sidebar device selection, camera streams, and AMS monitoring in sync.
 */

import { initializeCamera, pauseCameraStream } from '../features/camera.js';
import { startFleetDashboard, stopFleetDashboard } from '../features/fleet-dashboard.js';
import { startAmsPolling, stopAmsPolling } from '../features/ams-manager.js';
import { getActivePrinterIndex, selectPrinterByIndex } from '../features/printer-management.js';
import { getCurrentMediaSource, loadFileList } from './dialogs.js';
import { $ } from '../shared/dom.js';

export type ActiveView = 'dashboard' | 'devices' | 'settings';
export type ActiveDeviceSubtab = 'status' | 'media' | 'device-info';

let currentDeviceSubtab: ActiveDeviceSubtab = 'status';
let settingsViewActivationHook: (() => void) | null = null;
let suppressHistoryPush = false;

export function onSettingsViewActivated(hook: () => void): void {
  settingsViewActivationHook = hook;
}

export function getActiveView(): ActiveView {
  const dashView = document.getElementById('fleet-dashboard-view');
  if (dashView && !dashView.classList.contains('hidden')) {
    return 'dashboard';
  }
  const settingsView = document.getElementById('bambu-settings-view');
  if (settingsView && !settingsView.classList.contains('hidden')) {
    return 'settings';
  }
  return 'devices';
}

export function getActiveDeviceSubtab(): ActiveDeviceSubtab {
  return currentDeviceSubtab;
}

function updateBrowserUrl(targetPath: string, replace = false): void {
  if (suppressHistoryPush || typeof window === 'undefined') return;
  if (window.location.pathname === targetPath) return;
  if (replace) {
    window.history.replaceState({ path: targetPath }, '', targetPath);
  } else {
    window.history.pushState({ path: targetPath }, '', targetPath);
  }
}

/**
 * Switch to Fleet Dashboard (live cameras & overview cards across all printers)
 */
export function switchToDashboardView(options?: { updateUrl?: boolean; replaceUrl?: boolean }): void {
  const dashView = document.getElementById('fleet-dashboard-view');
  const sidebar = document.getElementById('printer-nav-sidebar');
  const subtabsBar = document.getElementById('device-subtabs-bar');
  const statusView = document.getElementById('bambu-status-view');
  const mediaView = document.getElementById('bambu-media-view');
  const infoView = document.getElementById('bambu-system-info-view');
  const settingsView = document.getElementById('bambu-settings-view');

  dashView?.classList.remove('hidden');
  sidebar?.classList.add('hidden');
  subtabsBar?.classList.add('hidden');
  statusView?.classList.add('hidden');
  mediaView?.classList.add('hidden');
  infoView?.classList.add('hidden');
  settingsView?.classList.add('hidden');

  // Top header tabs: Dashboard, Devices, Settings
  document.getElementById('tab-nav-dashboard')?.classList.add('active');
  document.getElementById('tab-nav-device')?.classList.remove('active');
  document.getElementById('tab-nav-settings')?.classList.remove('active');

  // Mobile drawer navigation items
  document.getElementById('mobile-nav-dashboard-btn')?.classList.add('active');
  document.getElementById('mobile-nav-status-btn')?.classList.remove('active');
  document.getElementById('mobile-settings-button')?.classList.remove('active');

  if (options?.updateUrl !== false) {
    updateBrowserUrl('/dashboard', Boolean(options?.replaceUrl));
  }

  // Pause single-device camera and AMS polling, start dashboard polling + streams
  pauseCameraStream(false);
  stopAmsPolling();
  void startFleetDashboard();

  if (typeof (window as any).lucide?.createIcons === 'function') {
    (window as any).lucide.createIcons();
  }
}

/**
 * Switch to Devices view (left sidebar with device list + subtabs for active device)
 */
export function switchToDevicesView(
  subtab: ActiveDeviceSubtab = currentDeviceSubtab,
  mediaSource?: 'recent' | 'local',
  options?: { updateUrl?: boolean; replaceUrl?: boolean; printerIndex?: number }
): void {
  const dashView = document.getElementById('fleet-dashboard-view');
  const sidebar = document.getElementById('printer-nav-sidebar');
  const subtabsBar = document.getElementById('device-subtabs-bar');
  const settingsView = document.getElementById('bambu-settings-view');

  dashView?.classList.add('hidden');
  settingsView?.classList.add('hidden');

  // Show left device list sidebar and device subtabs bar
  sidebar?.classList.remove('hidden');
  subtabsBar?.classList.remove('hidden');

  // Top header tabs
  document.getElementById('tab-nav-dashboard')?.classList.remove('active');
  document.getElementById('tab-nav-device')?.classList.add('active');
  document.getElementById('tab-nav-settings')?.classList.remove('active');

  // Mobile drawer navigation items
  document.getElementById('mobile-nav-dashboard-btn')?.classList.remove('active');
  document.getElementById('mobile-nav-status-btn')?.classList.add('active');
  document.getElementById('mobile-settings-button')?.classList.remove('active');

  if (options?.updateUrl !== false) {
    const idx = options?.printerIndex ?? getActivePrinterIndex();
    const targetPath = idx !== null && idx !== undefined ? `/printers/${idx}` : '/printers';
    updateBrowserUrl(targetPath, Boolean(options?.replaceUrl));
  }

  // Stop fleet dashboard cameras & polling when entering devices view
  stopFleetDashboard();

  // Activate selected subtab
  switchDeviceSubtab(subtab, mediaSource);

  if (typeof (window as any).lucide?.createIcons === 'function') {
    (window as any).lucide.createIcons();
  }
}

/**
 * Switch subtab within the active device (Status / Media / Device Info)
 */
export function switchDeviceSubtab(subtab: ActiveDeviceSubtab, mediaSource?: 'recent' | 'local'): void {
  currentDeviceSubtab = subtab;

  const statusView = document.getElementById('bambu-status-view');
  const mediaView = document.getElementById('bambu-media-view');
  const infoView = document.getElementById('bambu-system-info-view');

  const btnStatus = document.getElementById('subtab-btn-status');
  const btnMedia = document.getElementById('subtab-btn-media');
  const btnInfo = document.getElementById('subtab-btn-info');

  // Subtab buttons active states
  if (subtab === 'status') {
    btnStatus?.classList.add('active');
    btnMedia?.classList.remove('active');
    btnInfo?.classList.remove('active');

    statusView?.classList.remove('hidden');
    mediaView?.classList.add('hidden');
    infoView?.classList.add('hidden');

    initializeCamera();
    startAmsPolling();
  } else if (subtab === 'media') {
    btnStatus?.classList.remove('active');
    btnMedia?.classList.add('active');
    btnInfo?.classList.remove('active');

    statusView?.classList.add('hidden');
    mediaView?.classList.remove('hidden');
    infoView?.classList.add('hidden');

    pauseCameraStream(false);
    stopAmsPolling();
    void loadFileList(mediaSource || getCurrentMediaSource());
  } else if (subtab === 'device-info') {
    btnStatus?.classList.remove('active');
    btnMedia?.classList.remove('active');
    btnInfo?.classList.add('active');

    statusView?.classList.add('hidden');
    mediaView?.classList.add('hidden');
    infoView?.classList.remove('hidden');

    pauseCameraStream(false);
    stopAmsPolling();
  }

  if (typeof (window as any).lucide?.createIcons === 'function') {
    (window as any).lucide.createIcons();
  }
}

/**
 * Switch to Settings view
 */
export function switchToSettingsView(options?: { updateUrl?: boolean; replaceUrl?: boolean }): void {
  const dashView = document.getElementById('fleet-dashboard-view');
  const sidebar = document.getElementById('printer-nav-sidebar');
  const subtabsBar = document.getElementById('device-subtabs-bar');
  const statusView = document.getElementById('bambu-status-view');
  const mediaView = document.getElementById('bambu-media-view');
  const infoView = document.getElementById('bambu-system-info-view');
  const settingsView = document.getElementById('bambu-settings-view');

  dashView?.classList.add('hidden');
  sidebar?.classList.add('hidden');
  subtabsBar?.classList.add('hidden');
  statusView?.classList.add('hidden');
  mediaView?.classList.add('hidden');
  infoView?.classList.add('hidden');
  settingsView?.classList.remove('hidden');

  // Top header tabs
  document.getElementById('tab-nav-dashboard')?.classList.remove('active');
  document.getElementById('tab-nav-device')?.classList.remove('active');
  document.getElementById('tab-nav-settings')?.classList.add('active');

  // Mobile drawer navigation items
  document.getElementById('mobile-nav-dashboard-btn')?.classList.remove('active');
  document.getElementById('mobile-nav-status-btn')?.classList.remove('active');
  document.getElementById('mobile-settings-button')?.classList.add('active');

  if (options?.updateUrl !== false) {
    updateBrowserUrl('/settings', Boolean(options?.replaceUrl));
  }

  // Stop dashboard cameras & polling, pause device camera & AMS
  stopFleetDashboard();
  pauseCameraStream(false);
  stopAmsPolling();

  // Invoke registered activation hook
  if (settingsViewActivationHook) {
    try {
      settingsViewActivationHook();
    } catch (err) {
      console.warn('[views] Error during settings view activation:', err);
    }
  }

  if (typeof (window as any).lucide?.createIcons === 'function') {
    (window as any).lucide.createIcons();
  }
}

/**
 * Route the UI based on the current browser URL path (/dashboard, /printers, /printers/:index, /settings).
 * Nothing defaults to /dashboard: root (/) routes to /printers (or /printers/:activeIndex).
 */
export async function applyRouteFromLocation(isInitialLoad = false): Promise<void> {
  if (typeof window === 'undefined') return;
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';

  suppressHistoryPush = true;
  try {
    if (rawPath === '/dashboard') {
      switchToDashboardView({ updateUrl: false });
      return;
    }

    if (rawPath === '/settings') {
      switchToSettingsView({ updateUrl: false });
      return;
    }

    const printerMatch = rawPath.match(/^\/printers(?:\/(\d+))?$/);
    if (printerMatch) {
      const requestedIndex = printerMatch[1] !== undefined ? parseInt(printerMatch[1], 10) : null;
      if (requestedIndex !== null && requestedIndex >= 0) {
        await selectPrinterByIndex(requestedIndex);
        switchToDevicesView('status', undefined, { updateUrl: false, printerIndex: requestedIndex });
      } else {
        const activeIdx = getActivePrinterIndex();
        switchToDevicesView('status', undefined, { updateUrl: false, printerIndex: activeIdx ?? undefined });
        if (isInitialLoad && activeIdx !== null) {
          window.history.replaceState({ path: `/printers/${activeIdx}` }, '', `/printers/${activeIdx}`);
        }
      }
      return;
    }

    // Default route (e.g. '/'): route to /printers/0 (never default to /dashboard)
    const activeIdx = getActivePrinterIndex();
    const defaultPath = activeIdx !== null ? `/printers/${activeIdx}` : '/printers';
    switchToDevicesView('status', undefined, { updateUrl: false, printerIndex: activeIdx ?? undefined });
    window.history.replaceState({ path: defaultPath }, '', defaultPath);
  } finally {
    suppressHistoryPush = false;
  }
}

let routerInitialized = false;
export function setupUrlRouter(): void {
  if (routerInitialized || typeof window === 'undefined') return;
  routerInitialized = true;
  window.addEventListener('popstate', () => {
    void applyRouteFromLocation(false);
  });
}

/**
 * Updates the active device pill in the device subtabs bar
 */
export function updateDeviceSubtabPill(name: string, model: string, isConnected: boolean, isConnecting = false): void {
  const pillName = $('device-pill-name');
  const pillModel = $('device-pill-model');
  const pillDot = $('device-pill-dot');

  if (pillName) pillName.textContent = name;
  if (pillModel) {
    const shortModel = model.includes('Creator 5')
      ? 'C5'
      : model.includes('Creator 4')
        ? 'C4'
        : model.includes('5M')
          ? '5M'
          : /a1\s*mini/i.test(model)
            ? 'A1M'
            : model;
    pillModel.textContent = shortModel;
  }
  if (pillDot) {
    pillDot.className = `device-pill-dot ${isConnecting ? 'connecting' : (isConnected ? 'online' : 'offline')}`;
  }
}

// Backward compatibility convenience wrappers
export function switchToStatusView(): void {
  switchToDevicesView('status');
}

export function switchToMediaView(source: 'recent' | 'local' = 'recent'): void {
  switchToDevicesView('media', source);
}

export function switchToSystemInfoView(): void {
  switchToDevicesView('device-info');
}

export function setActiveNavSubitem(item: 'dashboard' | 'status' | 'info' | 'settings'): void {
  if (item === 'dashboard') {
    switchToDashboardView();
  } else if (item === 'info') {
    switchToDevicesView('device-info');
  } else if (item === 'settings') {
    switchToSettingsView();
  } else {
    switchToDevicesView('status');
  }
}

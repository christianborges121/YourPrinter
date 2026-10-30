/**
 * @fileoverview Header UI helpers for the WebUI client.
 *
 * Encapsulates header-specific DOM interactions including the edit mode toggle
 * button so layout logic can inject its own persistence and grid handling
 * without tightly coupling to DOM querying code.
 */

import type { WebUISettings } from '../app.js';
import { MOBILE_BREAKPOINT } from '../core/AppState.js';
import { $ } from '../shared/dom.js';
import {
  switchDeviceSubtab,
  switchToDashboardView,
  switchToDevicesView,
  switchToSettingsView,
} from './views.js';

export interface HeaderEventDependencies {
  getCurrentSettings: () => WebUISettings;
  updateCurrentSettings: (settings: WebUISettings) => void;
  applySettings: (settings: WebUISettings) => void;
  persistSettings: () => void;
  refreshSettingsUI: (settings: WebUISettings) => void;
}

export function openMobileNavDrawer(): void {
  const drawer = $('mobile-nav-drawer');
  if (drawer) {
    drawer.classList.remove('hidden');
    drawer.classList.add('open');
  }
}

export function closeMobileNavDrawer(): void {
  const drawer = $('mobile-nav-drawer');
  if (drawer) {
    drawer.classList.add('hidden');
    drawer.classList.remove('open');
  }
}

export function setupMobileNavHandlers(): void {
  const toggleBtn = $('mobile-menu-toggle');
  const closeBtn = $('mobile-nav-close');
  const backdrop = $('mobile-nav-backdrop');
  const settingsBtn = $('mobile-settings-button');

  toggleBtn?.addEventListener('click', () => {
    const drawer = $('mobile-nav-drawer');
    if (!drawer || drawer.classList.contains('hidden')) {
      openMobileNavDrawer();
    } else {
      closeMobileNavDrawer();
    }
  });

  closeBtn?.addEventListener('click', () => {
    closeMobileNavDrawer();
  });

  backdrop?.addEventListener('click', () => {
    closeMobileNavDrawer();
  });

  settingsBtn?.addEventListener('click', () => {
    closeMobileNavDrawer();
    switchToSettingsView();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileNavDrawer();
    }
  });

  window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
      closeMobileNavDrawer();
    }
  });
}

export function setupHeaderEventHandlers(dependencies: HeaderEventDependencies): void {
  setupMobileNavHandlers();

  // Wire Bambu Top Navigation Tabs and Sidebar Items
  const setupNavTriggers = () => {
    const brandLink = $('header-brand-link');
    const tabDashboard = $('tab-nav-dashboard');
    const tabDevice = $('tab-nav-device');
    const tabSettings = $('tab-nav-settings');

    const subtabStatus = $('subtab-btn-status');
    const subtabMedia = $('subtab-btn-media');
    const subtabInfo = $('subtab-btn-info');

    const btnInfoBack = $('btn-info-back-status');
    const btnMediaBack = $('btn-media-back-status');

    brandLink?.addEventListener('click', () => {
      switchToDevicesView();
    });

    tabDashboard?.addEventListener('click', () => {
      switchToDashboardView();
    });

    tabDevice?.addEventListener('click', () => {
      switchToDevicesView();
    });

    tabSettings?.addEventListener('click', () => {
      switchToSettingsView();
    });

    // Subtabs within selected device
    subtabStatus?.addEventListener('click', () => {
      switchDeviceSubtab('status');
    });

    subtabMedia?.addEventListener('click', () => {
      switchDeviceSubtab('media');
    });

    subtabInfo?.addEventListener('click', () => {
      switchDeviceSubtab('device-info');
    });

    btnInfoBack?.addEventListener('click', () => {
      switchDeviceSubtab('status');
    });

    btnMediaBack?.addEventListener('click', () => {
      switchDeviceSubtab('status');
    });

    // Mobile nav actions
    $('mobile-nav-dashboard-btn')?.addEventListener('click', () => {
      closeMobileNavDrawer();
      switchToDashboardView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('mobile-nav-status-btn')?.addEventListener('click', () => {
      closeMobileNavDrawer();
      switchToDevicesView('status');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('mobile-settings-button')?.addEventListener('click', () => {
      closeMobileNavDrawer();
      switchToSettingsView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  setupNavTriggers();

  const headerEditToggle = $('edit-mode-toggle') as HTMLButtonElement | null;
  if (!headerEditToggle) {
    return;
  }

  headerEditToggle.addEventListener('click', () => {
    const settings = dependencies.getCurrentSettings();
    const updatedSettings: WebUISettings = {
      ...settings,
      editMode: !settings.editMode,
    };
    dependencies.updateCurrentSettings(updatedSettings);
    dependencies.applySettings(updatedSettings);
    dependencies.persistSettings();
    dependencies.refreshSettingsUI(updatedSettings);
  });
}

export function updateEditModeToggle(editMode: boolean): void {
  const toggleButton = $('edit-mode-toggle') as HTMLButtonElement | null;
  if (!toggleButton) {
    return;
  }

  if (isMobileViewport()) {
    toggleButton.style.display = 'none';
    return;
  }

  toggleButton.style.display = '';
  toggleButton.setAttribute('aria-pressed', editMode ? 'true' : 'false');
  const lockIcon = toggleButton.querySelector<HTMLElement>('.lock-icon');
  const text = toggleButton.querySelector<HTMLElement>('.edit-text');
  if (lockIcon) {
    const iconName = editMode ? 'unlock' : 'lock';
    lockIcon.setAttribute('data-lucide', iconName);
  }
  if (text) {
    text.textContent = editMode ? 'Exit Edit Mode' : 'Enter Edit Mode';
  }
}

function isMobileViewport(): boolean {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

/**
 * @fileoverview Multi-printer context management utilities.
 *
 * Handles context discovery, selector population, and switching logic with
 * optional hooks so the orchestrator can run follow-up tasks (feature reloads,
 * camera refreshes, etc.) without embedding those concerns into this module.
 */

import type { ApiResponse, ContextsResponse, PrinterContext } from '../app.js';
import {
  contextById,
  DEMO_SERIAL,
  getCurrentContextId as getStoredContextId,
  setCurrentContextId,
  setCurrentPrinterSerial,
  state,
} from '../core/AppState.js';
import { apiRequest, sendCommand } from '../core/Transport.js';
import { $, hideElement, setTextContent, showToast } from '../shared/dom.js';
import { setPrinterStatusLoading, updateConnectionStatus } from '../ui/panels.js';
import { updateDeviceSubtabPill } from '../ui/views.js';
import { showCameraConnectingState } from './camera.js';
import { loadLayoutForCurrentPrinter, saveCurrentLayoutSnapshot } from './layout-theme.js';

export interface ContextSwitchHandlers {
  onContextSwitched?: (contextId: string) => Promise<void> | void;
}

let contextHandlers: ContextSwitchHandlers = {};

export function initializeContextSwitching(handlers: ContextSwitchHandlers = {}): void {
  contextHandlers = handlers;
}

export function getCurrentContextId(): string | null {
  const storedContext = getStoredContextId();
  if (storedContext) {
    return storedContext;
  }

  const select = $('printer-select') as HTMLSelectElement | null;
  if (!select || !select.value) {
    return null;
  }

  setCurrentContextId(select.value);
  return select.value;
}

export function setupContextEventHandlers(handlers?: ContextSwitchHandlers): void {
  if (handlers) {
    contextHandlers = handlers;
  }

  const select = $('printer-select') as HTMLSelectElement | null;
  if (!select) {
    return;
  }

  select.addEventListener('change', async (event) => {
    const target = event.target as HTMLSelectElement;
    const newContextId = target.value;
    if (!newContextId) {
      return;
    }

    await switchPrinterContext(newContextId);
  });
}

export async function fetchPrinterContexts(): Promise<void> {
  try {
    const result = await apiRequest<ContextsResponse>('/api/contexts');
    if (!result.success || !Array.isArray(result.contexts)) {
      console.warn('[Contexts] Failed to fetch contexts or contexts not an array');
      return;
    }

    contextById.clear();
    result.contexts.forEach((context) => {
      contextById.set(context.id, context);
    });

    const fallbackContext = result.contexts.find((context) => context.isActive) ?? result.contexts[0] ?? null;

    const storedContextId = getStoredContextId();
    const selectedContextId =
      storedContextId && contextById.has(storedContextId)
        ? storedContextId
        : result.activeContextId || fallbackContext?.id || '';

    updatePrinterSelector(result.contexts, selectedContextId);

    const activeContext = selectedContextId ? contextById.get(selectedContextId) : fallbackContext;
    setCurrentContextId(activeContext?.id ?? null);
    const serial = resolveSerialForContext(activeContext) ?? DEMO_SERIAL;
    setCurrentPrinterSerial(serial);

    const modelName = activeContext?.model || activeContext?.name || 'Creator 5';
    setTextContent('info-page-model', modelName);
    setTextContent('info-page-serial', serial);
    if (activeContext?.ipAddress) {
      setTextContent('info-page-ip', activeContext.ipAddress);
    }

    loadLayoutForCurrentPrinter();
  } catch (error) {
    console.error('[Contexts] Error fetching contexts:', error);
  }
}

export function updatePrinterSelector(contexts: PrinterContext[], activeContextId: string): void {
  const selector = $('printer-selector');
  const select = $('printer-select') as HTMLSelectElement | null;

  if (!selector || !select) {
    console.error('[Contexts] Printer selector elements not found');
    return;
  }

  if (contexts.length > 1) {
    hideElement('printer-selector');
  } else {
    hideElement('printer-selector');
    return;
  }

  select.innerHTML = '';

  contexts.forEach((context) => {
    const option = document.createElement('option');
    option.value = context.id;
    option.textContent = `${context.name} (${context.ipAddress})`;
    if (context.isActive || context.id === activeContextId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

export async function switchPrinterContext(contextId: string): Promise<void> {
  if (state.authRequired && !state.authToken) {
    showToast('Not authenticated', 'error');
    return;
  }

  // Trigger loading animations immediately
  updateConnectionStatus(false, true);
  setPrinterStatusLoading(true);
  showCameraConnectingState();

  const targetContext = contextById.get(contextId);
  if (targetContext) {
    updateDeviceSubtabPill(targetContext.name, targetContext.model, false, true);
  }

  const sidebarItem = document.querySelector(`.printer-sidebar-item[data-context="${CSS.escape(contextId)}"]`) as HTMLElement | null;
  if (sidebarItem) {
    sidebarItem.classList.add('is-switching');
    const stateText = sidebarItem.querySelector('.item-state-text');
    if (stateText) stateText.textContent = 'Connecting...';
  }

  setCurrentContextId(contextId);
  saveCurrentLayoutSnapshot();

  try {
    const result = await apiRequest<ApiResponse>('/api/contexts/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextId }),
    });

    if (result.success) {
      await fetchPrinterContexts();
      if (contextHandlers.onContextSwitched) {
        await contextHandlers.onContextSwitched(contextId);
      }
      sendCommand({ command: 'REQUEST_STATUS' });
    } else {
      showToast(result.error || 'Failed to switch printer', 'error');
      updateConnectionStatus(false);
      setPrinterStatusLoading(false);
    }
  } catch (error) {
    console.error('[Contexts] Error switching context:', error);
    showToast('Failed to switch printer', 'error');
    updateConnectionStatus(false);
    setPrinterStatusLoading(false);
  } finally {
    if (sidebarItem) {
      sidebarItem.classList.remove('is-switching');
    }
  }
}

export function resolveSerialForContext(context: PrinterContext | undefined): string | null {
  if (!context) {
    return null;
  }

  if (context.serialNumber && context.serialNumber.trim().length > 0) {
    return context.serialNumber;
  }

  if (context.id && context.id.trim().length > 0) {
    return context.id;
  }

  return null;
}

/**
 * @fileoverview Browser-based WebUI client application for remote printer control and monitoring.
 *
 * Provides comprehensive browser interface for remote FlashForge printer control including
 * authentication with token persistence, real-time WebSocket communication for status updates,
 * printer control operations (temperature, job management, LED, filtration), multi-printer
 * context switching, camera stream viewing via go2rtc (WebRTC/MSE/MJPEG), file selection dialogs,
 * and responsive UI updates. Implements automatic reconnection logic, keep-alive ping mechanisms,
 * and graceful degradation when features are unavailable. All communication uses type-safe
 * interfaces with proper error handling and user feedback via toast notifications.
 *
 * Key features:
 * - Authentication: Login with remember-me, token persistence in localStorage/sessionStorage
 * - WebSocket: Real-time status updates, command execution, automatic reconnection
 * - Printer control: Temperature set/off, job pause/resume/cancel, LED control
 * - Multi-printer: Context switching with dynamic UI updates and feature detection
 * - Camera: Unified streaming via go2rtc with WebRTC/MSE/MJPEG fallback using video-rtc element
 * - File management: Recent/local file browsing, file selection dialogs, job start with options
 * - Material matching: AD5X multi-color job mapping to material station slots prior to start
 * - UI updates: Real-time temperature, progress, layer info, ETA, lifetime statistics, thumbnails
 */

import { getCurrentSettings, state, updateCurrentSettings } from './core/AppState.js';
import { connectWebSocket, onConnectionChange, onSpoolmanUpdate, onStatusUpdate } from './core/Transport.js';
import { fetchAmsStatus, setupAmsEventHandlers } from './features/ams-manager.js';
import { loadAuthStatus, setupAuthEventHandlers } from './features/authentication.js';
import { initializeCamera } from './features/camera.js';
import {
  fetchPrinterContexts,
  getCurrentContextId,
  initializeContextSwitching,
  setupContextEventHandlers,
} from './features/context-switching.js';
import {
  loadPrinterFeatures,
  sendPrinterCommand,
  setupJobControlEventHandlers,
  startPrintJob,
  updateFeatureVisibility,
} from './features/job-control.js';
import {
  applyDefaultTheme,
  applySettings,
  ensureSpoolmanVisibilityIfEnabled,
  initializeLayout,
  loadLayoutForCurrentPrinter,
  loadWebUITheme,
  persistSettings,
  refreshSettingsUI,
  setupLayoutEventHandlers,
  setupViewportListener,
} from './features/layout-theme.js';
import {
  closeMaterialMatchingModal,
  confirmMaterialMatching,
  setupMaterialMatchingHandlers,
} from './features/material-matching.js';
import { loadSpoolmanConfig, setupSpoolmanHandlers } from './features/spoolman.js';
import { loadPrintersList, setupPrinterManagementHandlers } from './features/printer-management.js';
import { setupFleetDashboardHandlers } from './features/fleet-dashboard.js';
import { setupWatchdogUI } from './features/watchdog-ui.js';
import { hideElement, showElement } from './shared/dom.js';
import { initializeLucideIcons } from './shared/icons.js';
import { DialogHandlers, setupDialogEventHandlers } from './ui/dialogs.js';
import { setupHeaderEventHandlers } from './ui/header.js';
import { updateConnectionStatus, updatePrinterStatus, updateSpoolmanPanelState } from './ui/panels.js';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface AuthResponse {
  success: boolean;
  token?: string;
  message?: string;
}

export interface AuthStatusResponse {
  authRequired: boolean;
  hasPassword: boolean;
  defaultPassword: boolean;
}

export interface WebSocketMessage {
  type: 'AUTH_SUCCESS' | 'STATUS_UPDATE' | 'ERROR' | 'COMMAND_RESULT' | 'PONG' | 'SPOOLMAN_UPDATE';
  timestamp: string;
  status?: PrinterStatus;
  error?: string;
  clientId?: string;
  command?: string;
  success?: boolean;
  contextId?: string;
  spool?: ActiveSpoolData | null;
}

export interface WebSocketCommand {
  command: 'REQUEST_STATUS' | 'EXECUTE_GCODE' | 'PING';
  gcode?: string;
  data?: unknown;
}

export interface WatchdogStatusData {
  online: boolean;
  state: 'idle' | 'monitoring' | 'alert' | 'paused' | 'offline';
  confidence: number;
  max_confidence?: number;
  consecutive_failures: number;
  consecutive_required: number;
  threshold: number;
  inference_time_ms: number;
  last_check: string | null;
  active_job: string | null;
  layer: string | null;
  auto_pause_enabled: boolean;
  auto_pause_triggered: boolean;
  total_inspections: number;
  total_failures_detected: number;
  printer_status: string;
  check_interval_sec?: number;
}

export interface PrinterStatus {
  printerState: string;
  bedTemperature: number;
  bedTargetTemperature: number;
  nozzleTemperature: number;
  nozzleTargetTemperature: number;
  chamberTemperature?: number;
  chamberTargetTemperature?: number;
  toolTemps?: number[];
  toolTargetTemps?: number[];
  progress: number;
  currentLayer?: number;
  totalLayers?: number;
  jobName?: string;
  timeElapsed?: number;
  timeRemaining?: number;
  filtrationMode?: 'external' | 'internal' | 'none';
  estimatedWeight?: number;
  estimatedLength?: number;
  thumbnailData?: string | null; // Base64 encoded thumbnail
  cumulativeFilament?: number; // Total lifetime filament usage in meters
  cumulativePrintTime?: number; // Total lifetime print time in minutes
  formattedEta?: string; // Firmware ETA string (e.g. "04:48" = 4h48m remaining)
  elapsedTimeSeconds?: number; // Precise elapsed seconds for HH:MM:SS display
  watchdog?: WatchdogStatusData;
}

export interface PrinterFeatures {
  hasCamera: boolean;
  hasLED: boolean;
  hasFiltration: boolean;
  hasMaterialStation: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  ledUsesLegacyAPI?: boolean; // Whether custom LED control is enabled
}

export interface AD5XToolData {
  toolId: number;
  materialName: string;
  materialColor: string;
  filamentWeight: number;
  slotId?: number | null;
}

export type JobMetadataType = 'basic' | 'ad5x';

export interface WebUIJobFile {
  fileName: string;
  displayName: string;
  printingTime?: number;
  metadataType?: JobMetadataType;
  toolCount?: number;
  toolDatas?: AD5XToolData[];
  totalFilamentWeight?: number;
  useMatlStation?: boolean;
}

// API Response interfaces
export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export type PrinterCommandResponse = ApiResponse;

export interface PrinterFeaturesResponse extends ApiResponse {
  features?: PrinterFeatures;
}

export interface CameraProxyConfigResponse extends ApiResponse {
  /** go2rtc WebSocket URL for stream negotiation */
  wsUrl?: string;
  /** Direct WebSocket URL to go2rtc port 1984 */
  directWsUrl?: string;
  /** Original stream type (before go2rtc conversion) */
  streamType?: 'mjpeg' | 'rtsp';
  /** Original source type */
  sourceType?: 'oem' | 'custom' | 'intelligent-fallback';
  /** Stream name in go2rtc */
  streamName?: string;
  /** go2rtc API port */
  apiPort?: number;
  /** Preferred playback modes (e.g., 'webrtc,mse,mjpeg') */
  mode?: string;
  /** Whether to show FPS overlay */
  showCameraFps?: boolean;
  /** Concurrency notice or limitation tip for this printer camera model */
  concurrencyNotice?: string;
}

export interface FileListResponse extends ApiResponse {
  files?: WebUIJobFile[];
  totalCount?: number;
}

export type PrintJobStartResponse = ApiResponse;

export interface PrinterContext {
  id: string;
  name: string;
  model: string;
  ipAddress: string;
  serialNumber: string;
  isActive: boolean;
}

export interface ContextsResponse extends ApiResponse {
  contexts?: PrinterContext[];
  activeContextId?: string;
}

export interface WebUISettings {
  visibleComponents: string[];
  editMode: boolean;
}

export interface MaterialSlotInfo {
  slotId: number;
  isEmpty: boolean;
  materialType: string | null;
  materialColor: string | null;
}

export interface MaterialStationStatus {
  connected: boolean;
  slots: MaterialSlotInfo[];
  activeSlot: number | null;
  overallStatus: 'ready' | 'warming' | 'error' | 'disconnected';
  errorMessage: string | null;
}

export interface MaterialStationStatusResponse extends ApiResponse {
  status?: MaterialStationStatus | null;
}

export interface MaterialMapping {
  toolId: number;
  slotId: number;
  materialName: string;
  toolMaterialColor: string;
  slotMaterialColor: string;
}

export interface PendingJobStart {
  filename: string;
  leveling: boolean;
  startNow: boolean;
  job: WebUIJobFile | undefined;
}

export type MaterialMessageType = 'error' | 'warning';

// Spoolman types
export interface ActiveSpoolData {
  id: number;
  name: string;
  vendor: string | null;
  material: string | null;
  colorHex: string;
  remainingWeight: number;
  remainingLength: number;
  lastUpdated: string;
}

export interface SpoolSummary {
  readonly id: number;
  readonly name: string;
  readonly vendor: string | null;
  readonly material: string | null;
  readonly colorHex: string;
  readonly remainingWeight: number;
  readonly remainingLength: number;
  readonly archived: boolean;
}

export interface SpoolmanConfigResponse extends ApiResponse {
  enabled: boolean;
  disabledReason?: string | null;
  serverUrl: string;
  updateMode: 'length' | 'weight';
  contextId: string | null;
}

export interface ActiveSpoolResponse extends ApiResponse {
  spool: ActiveSpoolData | null;
}

export interface SpoolSearchResponse extends ApiResponse {
  spools: SpoolSummary[];
}

export interface SpoolSelectResponse extends ApiResponse {
  spool: ActiveSpoolData;
}

// ============================================================================
// GRID AND SETTINGS MANAGEMENT
// ============================================================================

// ============================================================================
// UI UPDATES
// ============================================================================

onConnectionChange((connected) => {
  updateConnectionStatus(connected);
});

onStatusUpdate((status) => {
  updatePrinterStatus(status);
});

onSpoolmanUpdate((contextId, spool) => {
  if (contextId === getCurrentContextId()) {
    state.activeSpool = spool;
    updateSpoolmanPanelState();
  }
});

// ============================================================================
// PRINTER CONTROLS
// ============================================================================

// ============================================================================
// SPOOLMAN INTEGRATION
// ============================================================================

// ============================================================================
// VIEWPORT AND LAYOUT SWITCHING
// ============================================================================

/**
 * Handle viewport resize across breakpoint
 */
// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function initialize(): Promise<void> {
  console.log('Initializing Web UI...');
  initializeLucideIcons();

  setupLayoutEventHandlers();
  setupHeaderEventHandlers({
    getCurrentSettings,
    updateCurrentSettings,
    applySettings,
    persistSettings,
    refreshSettingsUI,
  });

  const dialogHandlers: DialogHandlers = {
    onStartPrintJob: () => startPrintJob(),
    onMaterialMatchingClosed: () => {
      closeMaterialMatchingModal();
    },
    onMaterialMatchingConfirm: () => confirmMaterialMatching(),
    onTemperatureSubmit: (type, temperature, toolIndex) =>
      sendPrinterCommand(`temperature/${type}`, { temperature, toolIndex }),
  };
  setupDialogEventHandlers(dialogHandlers);
  setupJobControlEventHandlers();
  setupMaterialMatchingHandlers();
  setupSpoolmanHandlers();
  setupWatchdogUI();
  setupPrinterManagementHandlers();
  setupFleetDashboardHandlers();
  setupAmsEventHandlers();

  const contextHandlers = {
    onContextSwitched: async () => {
      void loadPrintersList();
      await loadPrinterFeatures();
      await loadSpoolmanConfig();
      ensureSpoolmanVisibilityIfEnabled();
      initializeCamera();
      void fetchAmsStatus();
    },
  };

  setupAuthEventHandlers({
    onLoginSuccess: async () => {
      await loadWebUITheme();
      await handlePostLoginTasks();
    },
  });

  initializeContextSwitching(contextHandlers);
  setupContextEventHandlers(contextHandlers);

  initializeLayout({
    onConnectionStatusUpdate: updateConnectionStatus,
    onPrinterStatusUpdate: (status) => updatePrinterStatus(status),
    onSpoolmanPanelUpdate: () => updateSpoolmanPanelState(),
    onAfterLayoutRefresh: () => {
      initializeLucideIcons();
      updateFeatureVisibility();
      initializeCamera();
    },
  });

  setupViewportListener();

  applyDefaultTheme();
  await loadAuthStatus();
  await loadWebUITheme();

  hideElement('login-screen');
  showElement('main-ui');
  loadLayoutForCurrentPrinter();
  await handlePostLoginTasks();
}

async function handlePostLoginTasks(): Promise<void> {
  connectWebSocket();

  try {
    await loadPrinterFeatures();
    void fetchAmsStatus();
    await fetchPrinterContexts();
    await loadPrintersList();
    await loadSpoolmanConfig();
    ensureSpoolmanVisibilityIfEnabled();

    const { applyRouteFromLocation, setupUrlRouter } = await import('./ui/views.js');
    setupUrlRouter();
    await applyRouteFromLocation(true);
  } catch (error) {
    console.error('Failed to load features:', error);
  }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  void initialize();
}

/**
 * @fileoverview Metadata and template registry for WebUI GridStack components.
 *
 * Exposes component definitions, default layout configuration, and HTML
 * templates for each panel rendered inside the browser WebUI. The registry
 * keeps component information centralized so layout logic and persistence can
 * look up defaults, while the Grid manager can instantiate panel content
 * without duplicating markup definitions throughout the application.
 */

import type {
  WebUIComponentDefinition,
  WebUIComponentLayout,
  WebUIComponentLayoutMap,
  WebUIComponentTemplate,
  WebUIGridLayout,
} from './types.js';

const DEFAULT_LAYOUT_VERSION = 5;

const COMPONENT_DEFINITIONS: Record<string, WebUIComponentDefinition> = {
  camera: {
    id: 'camera',
    displayName: 'Camera View',
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 0, y: 0 },
  },
  controls: {
    id: 'controls',
    displayName: 'Controls',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 6, y: 0 },
  },
  'model-preview': {
    id: 'model-preview',
    displayName: 'Model Preview',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 6, y: 4 },
  },
  'printer-state': {
    id: 'printer-state',
    displayName: 'Printer State',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 0, y: 6 },
  },
  'temp-control': {
    id: 'temp-control',
    displayName: 'Temperature Control',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 3, y: 6 },
  },
  'filtration-tvoc': {
    id: 'filtration-tvoc',
    displayName: 'Filtration & TVOC',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 0, y: 9 },
  },
  'job-progress': {
    id: 'job-progress',
    displayName: 'Job Progress',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 6, y: 7 },
  },
  'job-details': {
    id: 'job-details',
    displayName: 'Job Details',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 6, y: 10 },
  },
  'spoolman-tracker': {
    id: 'spoolman-tracker',
    displayName: 'Spoolman Tracker',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 3, y: 9 },
  },
  ams: {
    id: 'ams',
    displayName: 'Multi Material',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 2, h: 2 },
    defaultPosition: { x: 6, y: 7 },
  },
};

const COMPONENT_TEMPLATES: Record<string, WebUIComponentTemplate> = {
  camera: {
    id: 'camera',
    html: `
      <div class="panel panel-camera bambu-card" id="camera-panel">
        <div class="panel-header bambu-card-header">
          <span class="card-title">Camera</span>
          <div class="card-header-actions">
            <button id="btn-cam-override-timer" class="icon-tool-btn" title="Continuous stream (override 30s limit)" aria-label="Toggle continuous streaming">
              <i data-lucide="infinity"></i>
            </button>
            <button id="btn-watchdog-badge" class="watchdog-pill-btn idle" title="AI Watchdog Guard (Darknet YOLO)" aria-label="AI Watchdog Guard">
              <span class="watchdog-dot"></span>
              <span id="watchdog-status-text">AI Guard: Ready</span>
            </button>
            <button id="btn-watchdog-settings" class="icon-tool-btn" title="AI Sensitivity & Detection Settings" aria-label="Watchdog Sensitivity Settings">
              <i data-lucide="sliders"></i>
            </button>
            <button id="btn-cam-fullscreen" class="icon-tool-btn" title="Fullscreen" aria-label="Fullscreen">
              <i data-lucide="maximize-2"></i>
            </button>
          </div>
        </div>
        <div class="panel-content camera-panel-content" id="camera-container">
          <div id="camera-placeholder" class="no-camera">Camera Unavailable</div>
          <div id="camera-fps-overlay" class="camera-fps-overlay hidden">-- FPS</div>
          <div id="camera-stream-badge" class="camera-stream-badge hidden" title="Camera stream active (30s limit)">
            <span class="stream-dot"></span>
            <span class="stream-label">Live</span>
            <span class="stream-divider">&middot;</span>
            <span id="camera-stream-countdown" class="stream-countdown">30s</span>
            <button id="btn-camera-pause" class="stream-pause-btn" type="button" title="Pause camera stream" aria-label="Pause camera stream">
              <i data-lucide="pause"></i>
            </button>
          </div>
          <div id="camera-paused-overlay" class="camera-paused-overlay hidden">
            <div class="camera-paused-card">
              <div class="camera-paused-icon-wrap">
                <i data-lucide="play" class="camera-paused-icon"></i>
              </div>
              <div class="camera-paused-title">Stream Paused</div>
              <p class="camera-paused-desc hidden">The camera feed may currently be open in another application (such as Flash Studio, FlashPrint, or another browser window). FlashForge printers only support one active video stream.</p>
              <div class="camera-paused-actions">
                <button id="btn-camera-resume" class="camera-resume-btn" type="button">
                  <i data-lucide="play" class="resume-btn-icon"></i>
                  <span>View (30s)</span>
                </button>
                <button id="btn-camera-continuous" class="camera-continuous-btn" type="button" title="Stream indefinitely without 30s timeout">
                  <i data-lucide="infinity" class="resume-btn-icon"></i>
                  <span>Continuous</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="camera-status-strip" id="camera-status-strip">
          <div class="cam-status-left">
            <span class="cam-status-icon-circle"><i data-lucide="play" class="cam-status-play"></i></span>
            <span class="cam-status-text" id="camera-status-text">Stopped.</span>
          </div>
          <div class="cam-status-right">
            <button id="btn-quick-sensitivity" class="watchdog-strip-btn" title="AI Defect Sensitivity Threshold (Click to adjust)">
              <i data-lucide="sliders" class="strip-icon"></i>
              <span>Sensitivity: <strong id="cam-watchdog-thresh-val">20%</strong></span>
            </button>
          </div>
        </div>
      </div>
    `,
  },
  controls: {
    id: 'controls',
    html: `
      <div class="panel panel-control bambu-card" id="control-grid">
        <div class="panel-header bambu-card-header">
          <span class="card-title">Control</span>
          <div class="card-header-actions">
            <button id="btn-clear-status" class="header-action-btn">Clear Status</button>
            <button id="btn-refresh" class="hidden" aria-hidden="true">Refresh Status</button>
          </div>
        </div>
        <div class="panel-content bambu-control-content">
          <div class="bambu-temp-group wide" id="bambu-temp-group">
            <!-- Dynamic Toolheads Container for multi-tool printers (Creator 5 Pro has 4 toolheads) -->
            <div id="toolheads-container" class="toolheads-container">
              <!-- Default single Extruder Temp (fallback or single-tool) -->
              <div class="bambu-temp-row" id="extruder-temp-row">
                <div class="temp-indicator-left">
                  <span class="toolhead-color-badge hidden" id="extruder-color-badge"></span>
                  <i data-lucide="flame" class="temp-type-icon" id="extruder-flame-icon"></i>
                  <span class="temp-label-name">Extruder</span>
                  <span class="toolhead-material-tag hidden" id="extruder-material-tag"></span>
                  <span class="temp-val-display" id="extruder-temp">--°C / --°C</span>
                </div>
                <div class="temp-btn-pair">
                  <button id="btn-extruder-set" class="temp-btn-pill">Set</button>
                  <button id="btn-extruder-off" class="temp-btn-pill off">Off</button>
                </div>
              </div>
            </div>
            <!-- Bed Temp -->
            <div class="bambu-temp-row">
              <div class="temp-indicator-left">
                <i data-lucide="layers" class="temp-type-icon"></i>
                <span class="temp-label-name">Bed</span>
                <span class="temp-val-display" id="bed-temp">--°C / --°C</span>
              </div>
              <div class="temp-btn-pair">
                <button id="btn-bed-set" class="temp-btn-pill">Set</button>
                <button id="btn-bed-off" class="temp-btn-pill off">Off</button>
              </div>
            </div>
            <!-- Chamber Temp (read-only sensor) -->
            <div class="bambu-temp-row hidden" id="chamber-temp-row">
              <div class="temp-indicator-left">
                <i data-lucide="thermometer" class="temp-type-icon"></i>
                <span class="temp-label-name">Chamber</span>
                <span class="temp-val-display"><span id="chamber-temp">--°C</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },
  'job-progress': {
    id: 'job-progress',
    html: `
      <div class="panel panel-job-progress bambu-card" id="job-progress-panel">
        <div class="panel-header bambu-card-header">
          <span class="card-title">Printing progress</span>
          <div class="card-header-actions">
            <button id="btn-toggle-preview" class="icon-tool-btn" title="Toggle Model Preview" aria-label="Toggle Model Preview">
              <i data-lucide="image"></i>
            </button>
          </div>
        </div>
        <div class="panel-content printing-progress-content">
          <div class="printing-progress-left hidden" id="printing-progress-preview-container">
            <div class="model-thumbnail-box" id="model-preview">
              <div class="no-preview">No preview available</div>
            </div>
          </div>
          <div class="printing-progress-right">
            <div class="job-meta-top">
              <span class="job-title-text" id="current-job">No active job</span>
            </div>
            <div class="job-meta-status-row">
              <span class="printer-status-text" id="printer-status">Idle</span>
              <div class="job-meta-pills">
                <span class="meta-pill">Layer: <span id="layer-info">-- / --</span></span>
                <span class="meta-pill">ETA: <span id="time-remaining">--:--</span></span>
                <span class="meta-pill">Elapsed: <span id="elapsed-time">--:--</span></span>
                <span class="meta-pill hidden">Weight: <span id="job-weight">--</span></span>
                <span class="meta-pill hidden">Length: <span id="job-length">--</span></span>
              </div>
            </div>
            <div class="job-progress-bar-row">
              <div class="progress-track-wrapper">
                <progress id="progress-bar" value="0" max="100"></progress>
                <span class="progress-label-percent" id="progress-percentage">0%</span>
              </div>
              <div class="progress-actions">
                <button id="btn-cam-pause-resume" class="cam-ctrl-btn sm" title="Pause / Resume Print" aria-label="Pause / Resume Print">
                  <i data-lucide="pause" id="icon-pause-resume"></i>
                </button>
                <button id="btn-cam-stop" class="cam-ctrl-btn sm danger" title="Stop Print" aria-label="Stop Print">
                  <i data-lucide="square"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },
  'spoolman-tracker': {
    id: 'spoolman-tracker',
    html: `
      <div class="panel panel-spoolman bambu-card" id="spoolman-panel">
        <div class="panel-header bambu-card-header">
          <span class="card-title">Filament (Spoolman)</span>
          <div class="card-header-actions">
            <button id="btn-change-spool" class="header-action-btn">Change</button>
          </div>
        </div>
        <div class="panel-content spoolman-content">
          <div id="spoolman-disabled" class="spoolman-state hidden">
            <div class="spoolman-message" id="spoolman-disabled-message">Spoolman integration is disabled</div>
          </div>
          <div id="spoolman-no-spool" class="spoolman-state hidden">
            <div class="spoolman-message">No spool selected</div>
            <button id="btn-select-spool" class="header-action-btn primary">Select Spool</button>
          </div>
          <div id="spoolman-active" class="spoolman-state hidden">
            <div class="spool-info">
              <div class="spool-color-indicator" id="spool-color"></div>
              <div class="spool-details">
                <div class="spool-name" id="spool-name">--</div>
                <div class="spool-meta" id="spool-meta">--</div>
              </div>
              <div class="spool-stats">
                <span class="stat-badge">Remaining: <strong id="spool-remaining">--</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },
  ams: {
    id: 'ams',
    html: `
      <div class="panel panel-ams bambu-card" id="ams-panel">
        <div class="panel-header bambu-card-header">
          <div class="ams-header-title">
            <i data-lucide="layers" class="ams-title-icon"></i>
            <span class="card-title">Multi Material</span>
          </div>
          <div class="card-header-actions">
            <span class="ams-status-pill status-ready" id="ams-status-pill">Ready</span>
            <button type="button" class="header-action-btn mini-btn" id="btn-ams-refresh" title="Refresh Multi Material Status">
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
        </div>
        <div class="panel-content ams-panel-content">
          <div class="ams-slots-grid" id="ams-slots-grid">
            <div class="ams-slot-card empty-slot" data-slot-id="0">
              <div class="slot-badge-row">
                <span class="slot-number-badge">Slot 1</span>
              </div>
              <div class="slot-spool-visual">
                <span class="slot-color-wheel" style="background-color: #555;"></span>
                <span class="slot-material-name">Empty</span>
              </div>
              <div class="slot-actions-row">
                <button type="button" class="btn-slot-load mini-slot-btn" data-slot="0" disabled title="Load slot">
                  <i data-lucide="arrow-down-to-line"></i>
                  <span>Load</span>
                </button>
              </div>
            </div>
            <div class="ams-slot-card empty-slot" data-slot-id="1">
              <div class="slot-badge-row">
                <span class="slot-number-badge">Slot 2</span>
              </div>
              <div class="slot-spool-visual">
                <span class="slot-color-wheel" style="background-color: #555;"></span>
                <span class="slot-material-name">Empty</span>
              </div>
              <div class="slot-actions-row">
                <button type="button" class="btn-slot-load mini-slot-btn" data-slot="1" disabled title="Load slot">
                  <i data-lucide="arrow-down-to-line"></i>
                  <span>Load</span>
                </button>
              </div>
            </div>
            <div class="ams-slot-card empty-slot" data-slot-id="2">
              <div class="slot-badge-row">
                <span class="slot-number-badge">Slot 3</span>
              </div>
              <div class="slot-spool-visual">
                <span class="slot-color-wheel" style="background-color: #555;"></span>
                <span class="slot-material-name">Empty</span>
              </div>
              <div class="slot-actions-row">
                <button type="button" class="btn-slot-load mini-slot-btn" data-slot="2" disabled title="Load slot">
                  <i data-lucide="arrow-down-to-line"></i>
                  <span>Load</span>
                </button>
              </div>
            </div>
            <div class="ams-slot-card empty-slot" data-slot-id="3">
              <div class="slot-badge-row">
                <span class="slot-number-badge">Slot 4</span>
              </div>
              <div class="slot-spool-visual">
                <span class="slot-color-wheel" style="background-color: #555;"></span>
                <span class="slot-material-name">Empty</span>
              </div>
              <div class="slot-actions-row">
                <button type="button" class="btn-slot-load mini-slot-btn" data-slot="3" disabled title="Load slot">
                  <i data-lucide="arrow-down-to-line"></i>
                  <span>Load</span>
                </button>
              </div>
            </div>
          </div>
          <div class="ams-empty-state hidden" id="ams-empty-state">
            <i data-lucide="package-open" class="ams-empty-icon"></i>
            <span class="ams-empty-text">No Multi Material system connected</span>
            <span class="ams-empty-hint">Direct single spool feed or printer extruder active</span>
          </div>
        </div>
      </div>
    `,
  },
  'model-preview': {
    id: 'model-preview',
    html: `
      <div class="panel hidden" id="model-preview-panel">
        <div class="panel-header">Model Preview</div>
        <div class="panel-content" id="model-preview-fallback">
          <div class="no-preview">No preview available</div>
        </div>
      </div>
    `,
  },
  'printer-state': {
    id: 'printer-state',
    html: `
      <div class="panel bambu-card system-info-card" id="printer-state-panel">
        <div class="panel-header bambu-card-header">
          <span class="card-title"><i data-lucide="info" class="card-title-icon"></i> System Info</span>
        </div>
        <div class="panel-content system-info-content">
          <div class="system-info-grid">
            <div class="system-info-item">
              <div class="system-info-icon-wrapper">
                <i data-lucide="clock" class="system-info-icon"></i>
              </div>
              <div class="system-info-meta">
                <span class="system-info-label">Lifetime Print Time</span>
                <span class="system-info-value" id="lifetime-print-time">--</span>
              </div>
            </div>
            <div class="system-info-item">
              <div class="system-info-icon-wrapper">
                <i data-lucide="scale" class="system-info-icon"></i>
              </div>
              <div class="system-info-meta">
                <span class="system-info-label">Lifetime Filament</span>
                <span class="system-info-value" id="lifetime-filament">--</span>
              </div>
            </div>
            <div class="system-info-item">
              <div class="system-info-icon-wrapper">
                <i data-lucide="cpu" class="system-info-icon"></i>
              </div>
              <div class="system-info-meta">
                <span class="system-info-label">Device &amp; Firmware</span>
                <span class="system-info-value" id="system-firmware-version">Creator 5 Pro</span>
              </div>
            </div>
            <div class="system-info-item">
              <div class="system-info-icon-wrapper">
                <i data-lucide="wifi" class="system-info-icon"></i>
              </div>
              <div class="system-info-meta">
                <span class="system-info-label">Network IP</span>
                <span class="system-info-value" id="system-network-ip">--</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  },
  'temp-control': {
    id: 'temp-control',
    html: `
      <div class="panel hidden" id="temp-control-panel">
        <div class="panel-header">Temperature Control</div>
        <div class="panel-content"></div>
      </div>
    `,
  },
  'filtration-tvoc': {
    id: 'filtration-tvoc',
    html: `
      <div class="panel hidden" id="filtration-panel">
        <div class="panel-header">Filtration &amp; TVOC</div>
        <div class="panel-content"></div>
      </div>
    `,
  },
  'job-details': {
    id: 'job-details',
    html: `
      <div class="panel hidden" id="job-details-panel">
        <div class="panel-header">Job Details</div>
        <div class="panel-content"></div>
      </div>
    `,
  },
};

const DEFAULT_LAYOUT_COMPONENTS: WebUIComponentLayoutMap = {
  camera: { x: 0, y: 0, w: 6, h: 6 },
  controls: { x: 6, y: 0, w: 6, h: 4 },
  'job-progress': { x: 6, y: 4, w: 6, h: 3 },
  'model-preview': { x: 0, y: 0, w: 1, h: 1 },
  'printer-state': { x: 0, y: 0, w: 1, h: 1 },
  'temp-control': { x: 0, y: 0, w: 1, h: 1 },
  'filtration-tvoc': { x: 0, y: 0, w: 1, h: 1 },
  'spoolman-tracker': { x: 0, y: 0, w: 1, h: 1 },
  ams: { x: 6, y: 7, w: 6, h: 4 },
  'job-details': { x: 0, y: 0, w: 1, h: 1 },
};

const COMPONENT_IDS = Object.keys(COMPONENT_DEFINITIONS);

export const DEFAULT_LAYOUT: WebUIGridLayout = {
  version: DEFAULT_LAYOUT_VERSION,
  components: DEFAULT_LAYOUT_COMPONENTS,
};

function cloneLayout(layout: WebUIComponentLayout | undefined): WebUIComponentLayout | undefined {
  if (!layout) {
    return undefined;
  }
  return { ...layout };
}

function cloneGridLayout(layout: WebUIGridLayout): WebUIGridLayout {
  const clonedEntries = Object.entries(layout.components ?? {}).reduce<WebUIComponentLayoutMap>(
    (acc, [componentId, config]) => {
      acc[componentId] = cloneLayout(config);
      return acc;
    },
    {}
  );

  return {
    version: layout.version,
    components: clonedEntries,
    hiddenComponents: layout.hiddenComponents ? [...layout.hiddenComponents] : undefined,
  };
}

export function getComponentDefinition(componentId: string): WebUIComponentDefinition | undefined {
  return COMPONENT_DEFINITIONS[componentId];
}

export function getDefaultLayoutConfig(componentId: string): WebUIComponentLayout | undefined {
  return cloneLayout(DEFAULT_LAYOUT_COMPONENTS[componentId]);
}

export function getAllComponentIds(): string[] {
  return [...COMPONENT_IDS];
}

export function getComponentTemplate(componentId: string): WebUIComponentTemplate | undefined {
  return COMPONENT_TEMPLATES[componentId];
}

const componentInstanceCache = new Map<string, HTMLElement>();

export function createComponentElement(componentId: string): HTMLElement {
  const cached = componentInstanceCache.get(componentId);
  if (cached) {
    return cached;
  }

  const template = COMPONENT_TEMPLATES[componentId];
  if (!template) {
    throw new Error(`Unknown component: ${componentId}`);
  }

  const wrapper = document.createElement('template');
  wrapper.innerHTML = template.html.trim();
  const element = wrapper.content.firstElementChild as HTMLElement | null;
  if (!element) {
    throw new Error(`Template missing root element for ${componentId}`);
  }

  element.dataset.componentId = componentId;
  componentInstanceCache.set(componentId, element);
  return element;
}

export const componentRegistry = {
  getDefinition: getComponentDefinition,
  getDefault: getDefaultLayoutConfig,
  getAllIds: getAllComponentIds,
  getTemplate: getComponentTemplate,
  createElement: createComponentElement,
  getDefaultLayout(): WebUIGridLayout {
    return cloneGridLayout(DEFAULT_LAYOUT);
  },
};

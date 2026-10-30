/**
 * Unified TypeScript definitions for YourPrinter Web.
 * Aligns with shared/types/web-api.types.ts and mobile Dart models.
 */

export interface WebUIAuthStatus {
  hasPassword: boolean;
  defaultPassword: boolean;
  authRequired: boolean;
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
  check_interval_sec?: number;
  annotated_snapshot_url?: string | null;
  recent_snapshots?: string[];
}

export interface PrinterStatusData {
  printerState: string;
  bedTemperature: number;
  bedTargetTemperature: number;
  nozzleTemperature: number;
  nozzleTargetTemperature: number;
  chamberTemperature?: number;
  chamberTargetTemperature?: number;
  ledState?: boolean;
  coolingFanSpeed?: number;
  chamberFanSpeed?: number;
  fanSpeed?: number;
  toolTemps?: number[];
  toolTargetTemps?: number[];
  progress: number;
  currentLayer?: number;
  totalLayers?: number;
  jobName: string | null;
  timeElapsed?: number;
  timeRemaining?: number;
  filtrationMode: 'external' | 'internal' | 'none';
  estimatedWeight?: number;
  estimatedLength?: number;
  thumbnailData?: string | null;
  cumulativeFilament?: number;
  cumulativePrintTime?: number;
  formattedEta?: string;
  elapsedTimeSeconds?: number;
  watchdog?: WatchdogStatusData;
}

export interface PrinterNetworkCapabilities {
  canJog: boolean;
  canHome: boolean;
  canBedLevel: boolean;
  supportedAxes: ('X' | 'Y' | 'Z')[];
  hasBedHeater: boolean;
  hasExtruderHeater: boolean;
  hasChamberHeater: boolean;
  nozzleCount: number;
  maxBedTemp: number;
  maxExtruderTemp: number;
  maxChamberTemp?: number;
  hasPartCoolingFan: boolean;
  hasChamberFan: boolean;
  hasAuxFan: boolean;
  hasFiltration: boolean;
  hasLedControl: boolean;
  canAdjustSpeed: boolean;
  canAdjustZOffset: boolean;
  hasCamera: boolean;
  hasMaterialStation: boolean;
  maxMaterialSlots?: number;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
}

export interface PrinterFeatures {
  hasCamera: boolean;
  hasLED: boolean;
  hasFiltration: boolean;
  hasMaterialStation: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  ledUsesLegacyAPI?: boolean;
  capabilities?: PrinterNetworkCapabilities;
}

export interface MaterialSlot {
  slotId: number;
  materialType?: string;
  materialColor?: string;
  isEmpty: boolean;
  remainingPercent?: number;
  isActive: boolean;
  materialName?: string;
  targetTemp?: number;
}

export interface MaterialStationStatus {
  connected: boolean;
  slots: MaterialSlot[];
  activeSlot?: number;
  overallStatus: 'ready' | 'warming' | 'feeding' | 'error' | string;
}

export interface ActiveSpoolData {
  id: number;
  name: string;
  vendor: string | null;
  material: string | null;
  colorHex: string;
  remainingWeight: number;
  remainingLength: number;
  lastUpdated?: string;
}

export interface DiscordConfigData {
  enabled: boolean;
  webhookUrl: string;
  includeCameraSnapshots: boolean;
  updateIntervalMinutes: number;
}

export interface SpoolmanConfigData {
  enabled: boolean;
  disabledReason?: string | null;
  serverUrl: string;
  updateMode: 'weight' | 'length' | 'both';
  contextId: string | null;
}

export interface SpoolmanSpoolSummary {
  id: number;
  name: string;
  vendor: string | null;
  material: string | null;
  colorHex: string;
  remainingWeight: number;
  remainingLength: number;
  archived: boolean;
}

export interface PrinterDetails {
  ipAddress: string;
  IPAddress?: string;
  serialNumber?: string;
  checkCode?: string;
  model?: string;
  printerModel?: string;
  make?: string;
  showCameraFps?: boolean;
  customCameraEnabled?: boolean;
  customCameraUrl?: string;
}

export interface PrinterContext {
  contextId: string;
  name: string;
  model: string;
  isConnected: boolean;
  isSelected: boolean;
  printerDetails?: PrinterDetails;
}

export interface FleetOverviewStatus {
  printerState: string;
  bedTemperature: number;
  bedTargetTemperature: number;
  nozzleTemperature: number;
  nozzleTargetTemperature: number;
  toolTemps?: number[];
  toolTargetTemps?: number[];
  progress: number;
  currentLayer?: number | null;
  totalLayers?: number | null;
  jobName?: string | null;
  formattedEta?: string | null;
  timeRemaining?: number | null;
  thumbnailData?: string | null;
}

export interface FleetOverviewPrinter {
  name: string;
  serialNumber?: string;
  ipAddress?: string;
  model: string;
  contextId?: string | null;
  isConnected: boolean;
  isActive?: boolean;
  hasCamera: boolean;
  cameraSnapshotUrl?: string | null;
  status?: FleetOverviewStatus | null;
  materialStation?: MaterialStationStatus | null;
  disabled?: boolean;

  // Fallback / legacy flat telemetry fields
  jobName?: string | null;
  progress?: number;
  currentLayer?: number | null;
  totalLayers?: number | null;
  timeRemaining?: number | null;
  bedTemp?: number;
  bedTarget?: number;
  nozzleTemp?: number;
  nozzleTarget?: number;
  statusText?: string;
  thumbnailData?: string | null;
}

export interface WebUIJobFile {
  filename: string;
  displayName?: string;
  size?: number;
  printTime?: number;
  filamentLength?: number;
  filamentWeight?: number;
  thumbnail?: string;
  modifiedTime?: string;
  layerHeight?: string;
  source?: 'recent' | 'local';
}

export interface CameraProxyConfig {
  success: boolean;
  wsUrl?: string;
  directWsUrl?: string;
  streamType?: string;
  sourceType?: string;
  streamName?: string;
  apiPort?: number;
  mode?: string;
  showCameraFps?: boolean;
  concurrencyNotice?: string;
  error?: string;
}

export interface WebSocketMessage {
  type: 'AUTH_SUCCESS' | 'STATUS_UPDATE' | 'ERROR' | 'COMMAND_RESULT' | 'PONG' | 'SPOOLMAN_UPDATE';
  timestamp: string;
  status?: PrinterStatusData | null;
  error?: string;
  clientId?: string;
  command?: string;
  success?: boolean;
  contextId?: string;
  spool?: ActiveSpoolData | null;
}

export type NavTab = 'fleet' | 'device' | 'files' | 'settings';

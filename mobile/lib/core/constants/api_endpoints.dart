class ApiEndpoints {
  ApiEndpoints._();

  // WebSocket
  static const String webSocket = '/ws';

  // Auth
  static const String authStatus = '/api/auth/status';
  static const String authLogin = '/api/auth/login';

  // Contexts & Printers
  static const String contexts = '/api/contexts';
  static const String contextSwitch = '/api/contexts/switch';
  static const String printers = '/api/printers';
  static const String printersOverview = '/api/printers/overview';
  static String printerSelect(String name) => '/api/printers/$name/select';
  static String printerConnect(String name) => '/api/printers/$name/connect';

  // Printer Telemetry & Capabilities
  static const String printerStatus = '/api/printer/status';
  static const String printerFeatures = '/api/printer/features';
  static const String printerMaterialStation = '/api/printer/material-station';

  // Camera
  static const String cameraProxyConfig = '/api/camera/proxy-config';
  static const String cameraSnapshot = '/api/camera/snapshot';

  // Job Controls
  static const String jobPause = '/api/printer/control/pause';
  static const String jobResume = '/api/printer/control/resume';
  static const String jobCancel = '/api/printer/control/cancel';
  static const String homeAxes = '/api/printer/control/home';
  static const String clearStatus = '/api/printer/control/clear-status';
  static const String ledOn = '/api/printer/control/led-on';
  static const String ledOff = '/api/printer/control/led-off';
  static const String materialLoad = '/api/printer/control/material/load';
  static const String materialUnload = '/api/printer/control/material/unload';

  // Temperatures
  static const String tempBed = '/api/printer/temperature/bed';
  static const String tempBedOff = '/api/printer/temperature/bed/off';
  static const String tempExtruder = '/api/printer/temperature/extruder';
  static const String tempExtruderOff = '/api/printer/temperature/extruder/off';

  // Filtration
  static const String filtrationExternal = '/api/printer/filtration/external';
  static const String filtrationInternal = '/api/printer/filtration/internal';
  static const String filtrationOff = '/api/printer/filtration/off';

  // Jobs / Media
  static const String jobsRecent = '/api/jobs/recent';
  static const String jobsLocal = '/api/jobs/local';
  static const String jobsStart = '/api/jobs/start';

  // Watchdog AI
  static const String watchdogStatus = '/api/watchdog/status';
  static const String watchdogSnapshots = '/api/watchdog/snapshots';
  static const String watchdogConfig = '/api/watchdog/config';
  static const String watchdogSnapshotLatest = '/api/watchdog/snapshot/latest';
  static String watchdogSnapshot(String filename) => '/api/watchdog/snapshot/$filename';

  // Spoolman
  static const String spoolmanConfig = '/api/spoolman/config';
  static const String spoolmanSpools = '/api/spoolman/spools';
  static String spoolmanActive(String contextId) => '/api/spoolman/active/$contextId';
  static const String spoolmanSelect = '/api/spoolman/select';
}

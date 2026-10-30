import '../core/constants/api_endpoints.dart';
import '../core/network/api_client.dart';
import '../models/auth_models.dart';
import '../models/job_file.dart';
import '../models/material_station.dart';
import '../models/printer_context.dart';
import '../models/printer_features.dart';
import '../models/printer_status.dart';

class PrinterService {
  final ApiClient apiClient;

  PrinterService({required this.apiClient});

  // Health / Connection Check
  Future<bool> checkConnection() async {
    try {
      final res = await apiClient.get(ApiEndpoints.authStatus);
      return res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 400;
    } catch (_) {
      try {
        final res = await apiClient.get(ApiEndpoints.contexts);
        return res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 400;
      } catch (_) {
        return false;
      }
    }
  }

  // Auth
  Future<WebUIAuthStatus> getAuthStatus() async {
    final res = await apiClient.get(ApiEndpoints.authStatus);
    return WebUIAuthStatus.fromJson(res.data as Map<String, dynamic>);
  }

  Future<WebUILoginResponse> login(String password) async {
    final res = await apiClient.post(
      ApiEndpoints.authLogin,
      data: {'password': password, 'rememberMe': true},
    );
    return WebUILoginResponse.fromJson(res.data as Map<String, dynamic>);
  }

  // Contexts & Fleet
  Future<List<PrinterContext>> getContexts() async {
    final res = await apiClient.get(ApiEndpoints.contexts);
    final data = res.data as Map<String, dynamic>;
    final list = data['contexts'] as List<dynamic>? ?? [];
    return list.map((e) => PrinterContext.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<bool> switchContext(String contextId) async {
    final res = await apiClient.post(
      ApiEndpoints.contextSwitch,
      data: {'contextId': contextId},
    );
    final data = res.data as Map<String, dynamic>;
    return data['success'] == true;
  }

  Future<List<FleetOverviewPrinter>> getFleetOverview() async {
    final res = await apiClient.get(ApiEndpoints.printersOverview);
    final data = res.data as Map<String, dynamic>;
    final list = data['printers'] as List<dynamic>? ?? [];
    return list.map((e) => FleetOverviewPrinter.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<bool> selectPrinter(String name, {String? contextId}) async {
    final res = await apiClient.post(
      ApiEndpoints.printerSelect(name),
      data: contextId != null ? {'contextId': contextId} : null,
    );
    final data = res.data as Map<String, dynamic>;
    return data['success'] == true;
  }

  // Telemetry & Details
  Future<PrinterStatusData> getPrinterStatus({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.get(ApiEndpoints.printerStatus, queryParameters: query);
    final data = res.data as Map<String, dynamic>;
    final statusJson = data['status'] as Map<String, dynamic>? ?? data;
    return PrinterStatusData.fromJson(statusJson);
  }

  Future<PrinterFeatures> getPrinterFeatures({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.get(ApiEndpoints.printerFeatures, queryParameters: query);
    final data = res.data as Map<String, dynamic>;
    final featuresJson = data['features'] as Map<String, dynamic>? ?? data;
    return PrinterFeatures.fromJson(featuresJson);
  }

  Future<MaterialStationStatus?> getMaterialStation({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.get(ApiEndpoints.printerMaterialStation, queryParameters: query);
    final data = res.data as Map<String, dynamic>;
    if (data['status'] != null) {
      return MaterialStationStatus.fromJson(data['status'] as Map<String, dynamic>);
    }
    return null;
  }

  Future<bool> loadMaterialSlot(int slotId, {String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(
      ApiEndpoints.materialLoad,
      data: {'slotId': slotId},
      queryParameters: query,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> unloadMaterial({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(
      ApiEndpoints.materialUnload,
      data: <String, dynamic>{},
      queryParameters: query,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  // Job Controls
  Future<bool> pauseJob({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(ApiEndpoints.jobPause, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> resumeJob({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(ApiEndpoints.jobResume, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> resumePrint({String? contextId}) => resumeJob(contextId: contextId);

  Future<bool> cancelJob({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(ApiEndpoints.jobCancel, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> cancelPrint({String? contextId}) => cancelJob(contextId: contextId);

  Future<bool> homeAxes({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(ApiEndpoints.homeAxes, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> clearStatus({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(ApiEndpoints.clearStatus, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> setLED(bool on, {String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final endpoint = on ? ApiEndpoints.ledOn : ApiEndpoints.ledOff;
    final res = await apiClient.post(endpoint, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  // Temperatures
  Future<bool> setBedTemp(double temp, {String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(
      ApiEndpoints.tempBed,
      data: {'temperature': temp},
      queryParameters: query,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> setBedOff({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(ApiEndpoints.tempBedOff, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> setExtruderTemp(double temp, {int toolIndex = 0, String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(
      ApiEndpoints.tempExtruder,
      data: {'temperature': temp, 'toolIndex': toolIndex},
      queryParameters: query,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  Future<bool> setExtruderOff({int toolIndex = 0, String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(
      ApiEndpoints.tempExtruderOff,
      data: {'toolIndex': toolIndex},
      queryParameters: query,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  // Filtration
  Future<bool> setFiltration(String mode, {String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    String endpoint;
    if (mode == 'external') {
      endpoint = ApiEndpoints.filtrationExternal;
    } else if (mode == 'internal') {
      endpoint = ApiEndpoints.filtrationInternal;
    } else {
      endpoint = ApiEndpoints.filtrationOff;
    }
    final res = await apiClient.post(endpoint, queryParameters: query);
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  // Files & Jobs
  Future<List<WebUIJobFile>> getRecentJobs({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.get(ApiEndpoints.jobsRecent, queryParameters: query);
    final data = res.data as Map<String, dynamic>;
    final list = data['files'] as List<dynamic>? ?? [];
    return list.map((e) => WebUIJobFile.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<WebUIJobFile>> getLocalJobs({String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.get(ApiEndpoints.jobsLocal, queryParameters: query);
    final data = res.data as Map<String, dynamic>;
    final list = data['files'] as List<dynamic>? ?? [];
    return list.map((e) => WebUIJobFile.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<bool> startJob(String filename, {bool leveling = true, String? contextId}) async {
    final query = contextId != null ? {'contextId': contextId} : null;
    final res = await apiClient.post(
      ApiEndpoints.jobsStart,
      data: {
        'filename': filename,
        'leveling': leveling,
        'startNow': true,
      },
      queryParameters: query,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }

  // Watchdog AI
  Future<WatchdogStatusData> getWatchdogStatus() async {
    final res = await apiClient.get(ApiEndpoints.watchdogStatus);
    return WatchdogStatusData.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<WatchdogSnapshotItem>> getWatchdogSnapshots({String? contextId}) async {
    try {
      final query = contextId != null ? {'contextId': contextId} : null;
      final res = await apiClient.get(
        ApiEndpoints.watchdogSnapshots,
        queryParameters: query,
      );
      final data = res.data;
      if (data is Map<String, dynamic> && data['snapshots'] is List) {
        return (data['snapshots'] as List)
            .map((item) => WatchdogSnapshotItem.fromJson(item as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Future<bool> updateWatchdogConfig({
    required double threshold,
    required bool autoPause,
    int? checkIntervalSec,
    int? consecutiveRequired,
  }) async {
    final payload = <String, dynamic>{
      'threshold': threshold,
      'auto_pause_enabled': autoPause,
    };
    if (checkIntervalSec != null) {
      payload['check_interval_sec'] = checkIntervalSec;
    }
    if (consecutiveRequired != null) {
      payload['consecutive_required'] = consecutiveRequired;
    }
    final res = await apiClient.post(
      ApiEndpoints.watchdogConfig,
      data: payload,
    );
    return (res.data as Map<String, dynamic>)['success'] == true;
  }
}

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/job_file.dart';
import '../models/print_history.dart';

class PreferencesService {
  static const String _keyServerUrl = 'yp_server_url';
  static const String _keyAuthToken = 'yp_auth_token';
  static const String _keyOverride30s = 'yp_camera_override_30s';
  static const String _keyLastContextId = 'yp_last_context_id';
  static const String _keyPrintHistory = 'yourprinter_print_history';
  static const String _keyNotificationsEnabled = 'yp_notifications_enabled';
  static const String _keyWatchdogAlertsEnabled = 'yp_watchdog_alerts_enabled';
  static const String _keyPrintCompleteAlertsEnabled = 'yp_print_complete_alerts_enabled';
  static const String _keyPrinterCooledAlertsEnabled = 'yp_printer_cooled_alerts_enabled';
  static const String _keyBackgroundMonitoringEnabled = 'yp_background_monitoring_enabled';

  static const String _legacyKeyServerUrl = 'ff_server_url';
  static const String _legacyKeyAuthToken = 'ff_auth_token';
  static const String _legacyKeyOverride30s = 'ff_camera_override_30s';
  static const String _legacyKeyLastContextId = 'ff_last_context_id';

  final SharedPreferences _prefs;

  PreferencesService(this._prefs);

  static Future<PreferencesService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return PreferencesService(prefs);
  }

  bool hasCustomServerUrl() {
    return _prefs.containsKey(_keyServerUrl) || _prefs.containsKey(_legacyKeyServerUrl);
  }

  String getServerUrl({String defaultValue = 'http://localhost:3080'}) {
    return _prefs.getString(_keyServerUrl) ?? _prefs.getString(_legacyKeyServerUrl) ?? defaultValue;
  }

  Future<bool> setServerUrl(String url) {
    return _prefs.setString(_keyServerUrl, url);
  }

  String? getAuthToken() {
    return _prefs.getString(_keyAuthToken) ?? _prefs.getString(_legacyKeyAuthToken);
  }

  Future<bool> setAuthToken(String? token) {
    if (token == null) {
      _prefs.remove(_legacyKeyAuthToken);
      return _prefs.remove(_keyAuthToken);
    }
    return _prefs.setString(_keyAuthToken, token);
  }

  bool isStreamTimeoutOverridden() {
    return _prefs.getBool(_keyOverride30s) ?? _prefs.getBool(_legacyKeyOverride30s) ?? false;
  }

  Future<bool> setStreamTimeoutOverridden(bool override) {
    return _prefs.setBool(_keyOverride30s, override);
  }

  String? getLastContextId() {
    return _prefs.getString(_keyLastContextId) ?? _prefs.getString(_legacyKeyLastContextId);
  }

  Future<bool> setLastContextId(String contextId) {
    return _prefs.setString(_keyLastContextId, contextId);
  }

  bool isNotificationsEnabled() {
    return _prefs.getBool(_keyNotificationsEnabled) ?? true;
  }

  Future<bool> setNotificationsEnabled(bool enabled) {
    return _prefs.setBool(_keyNotificationsEnabled, enabled);
  }

  bool isWatchdogAlertsEnabled() {
    return _prefs.getBool(_keyWatchdogAlertsEnabled) ?? true;
  }

  Future<bool> setWatchdogAlertsEnabled(bool enabled) {
    return _prefs.setBool(_keyWatchdogAlertsEnabled, enabled);
  }

  bool isPrintCompleteAlertsEnabled() {
    return _prefs.getBool(_keyPrintCompleteAlertsEnabled) ?? true;
  }

  Future<bool> setPrintCompleteAlertsEnabled(bool enabled) {
    return _prefs.setBool(_keyPrintCompleteAlertsEnabled, enabled);
  }

  bool isPrinterCooledAlertsEnabled() {
    return _prefs.getBool(_keyPrinterCooledAlertsEnabled) ?? true;
  }

  Future<bool> setPrinterCooledAlertsEnabled(bool enabled) {
    return _prefs.setBool(_keyPrinterCooledAlertsEnabled, enabled);
  }

  bool isBackgroundMonitoringEnabled() {
    return _prefs.getBool(_keyBackgroundMonitoringEnabled) ?? true;
  }

  Future<bool> setBackgroundMonitoringEnabled(bool enabled) {
    return _prefs.setBool(_keyBackgroundMonitoringEnabled, enabled);
  }

  List<PrintHistoryItem> getPrintHistory() {
    try {
      final raw = _prefs.getString(_keyPrintHistory);
      if (raw == null || raw.isEmpty) return [];
      final parsed = jsonDecode(raw);
      if (parsed is! List) return [];
      return parsed
          .whereType<Map<String, dynamic>>()
          .map((item) => PrintHistoryItem.fromJson(item))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<bool> savePrintHistory(List<PrintHistoryItem> items) {
    try {
      final capped = items.take(200).map((i) => i.toJson()).toList();
      return _prefs.setString(_keyPrintHistory, jsonEncode(capped));
    } catch (_) {
      return Future.value(false);
    }
  }

  Future<PrintHistoryItem> addPrintHistoryItem(PrintHistoryItem item) async {
    final current = getPrintHistory();
    final isDuplicate = current.any((existing) =>
        existing.filename == item.filename &&
        (existing.endTime.difference(item.endTime).inSeconds.abs() < 60));

    if (!isDuplicate) {
      final updated = [item, ...current];
      await savePrintHistory(updated);
    }
    return item;
  }

  Future<void> removePrintHistoryItem(String id) async {
    final current = getPrintHistory();
    final filtered = current.where((i) => i.id != id).toList();
    await savePrintHistory(filtered);
  }

  Future<void> clearPrintHistory() async {
    await _prefs.remove(_keyPrintHistory);
  }

  Future<void> seedHistoryFromRecentJobs(
    List<WebUIJobFile> recentJobs,
    String printerName,
    String? contextId,
  ) async {
    final current = getPrintHistory();
    if (current.isNotEmpty || recentJobs.isEmpty) return;

    final now = DateTime.now();
    final seeded = recentJobs.take(10).toList().asMap().entries.map((entry) {
      final idx = entry.key;
      final job = entry.value;
      final end = now.subtract(Duration(days: idx, hours: 1));
      final duration = job.printTime ?? 3600;
      final start = end.subtract(Duration(seconds: duration));

      return PrintHistoryItem(
        id: 'seed-$idx-${now.millisecondsSinceEpoch}',
        filename: job.filename,
        displayName: job.displayName ?? job.filename.replaceAll(RegExp(r'\.(gcode|3mf|gx|g)$', caseSensitive: false), ''),
        printerName: printerName.isNotEmpty ? printerName : 'Flashforge Printer',
        contextId: contextId,
        startTime: start,
        endTime: end,
        durationSeconds: duration,
        filamentMeters: job.filamentLength != null ? job.filamentLength! / 1000 : null,
        filamentGrams: job.filamentWeight,
        status: 'completed',
      );
    }).toList();

    await savePrintHistory(seeded);
  }
}

import 'package:shared_preferences/shared_preferences.dart';

class PreferencesService {
  static const String _keyServerUrl = 'yp_server_url';
  static const String _keyAuthToken = 'yp_auth_token';
  static const String _keyOverride30s = 'yp_camera_override_30s';
  static const String _keyLastContextId = 'yp_last_context_id';

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
}

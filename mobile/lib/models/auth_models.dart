class WebUIAuthStatus {
  final bool hasPassword;
  final bool defaultPassword;
  final bool authRequired;

  const WebUIAuthStatus({
    required this.hasPassword,
    required this.defaultPassword,
    required this.authRequired,
  });

  factory WebUIAuthStatus.fromJson(Map<String, dynamic> json) {
    return WebUIAuthStatus(
      hasPassword: json['hasPassword'] as bool? ?? false,
      defaultPassword: json['defaultPassword'] as bool? ?? false,
      authRequired: json['authRequired'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'hasPassword': hasPassword,
    'defaultPassword': defaultPassword,
    'authRequired': authRequired,
  };
}

class WebUILoginResponse {
  final bool success;
  final String? token;
  final String? message;
  final String? error;

  const WebUILoginResponse({
    required this.success,
    this.token,
    this.message,
    this.error,
  });

  factory WebUILoginResponse.fromJson(Map<String, dynamic> json) {
    return WebUILoginResponse(
      success: json['success'] as bool? ?? false,
      token: json['token'] as String?,
      message: json['message'] as String?,
      error: json['error'] as String?,
    );
  }
}

import 'dart:async';
import 'package:dio/dio.dart';

class ApiClient {
  String _baseUrl;
  String? _authToken;
  late final Dio _dio;

  ApiClient({String baseUrl = 'http://192.168.1.50:8080', String? authToken})
      : _baseUrl = baseUrl,
        _authToken = authToken {
    _dio = Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (_authToken != null && _authToken!.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $_authToken';
        }
        return handler.next(options);
      },
      onError: (DioException e, handler) {
        // Normalize connection refused or timeouts
        return handler.next(e);
      },
    ));
  }

  String get baseUrl => _baseUrl;
  String? get authToken => _authToken;

  void updateConfig({required String baseUrl, String? authToken}) {
    _baseUrl = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    _authToken = authToken;
    _dio.options.baseUrl = _baseUrl;
  }

  String buildWebSocketUrl(String relativePath) {
    final baseUri = Uri.parse(_baseUrl);
    final isHttps = baseUri.scheme == 'https';
    final wsScheme = isHttps ? 'wss' : 'ws';

    final relUri = Uri.parse(relativePath.startsWith('/') ? relativePath : '/$relativePath');
    final mergedQueryParams = Map<String, dynamic>.from(relUri.queryParameters);
    if (_authToken != null && _authToken!.isNotEmpty) {
      mergedQueryParams['token'] = _authToken!;
    }

    final wsUri = Uri(
      scheme: wsScheme,
      host: baseUri.host,
      port: baseUri.hasPort ? baseUri.port : null,
      path: relUri.path,
      queryParameters: mergedQueryParams.isNotEmpty ? mergedQueryParams : null,
    );

    return wsUri.toString();
  }

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.get<T>(path, queryParameters: queryParameters, options: options);
  }

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.post<T>(path, data: data, queryParameters: queryParameters, options: options);
  }

  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.put<T>(path, data: data, queryParameters: queryParameters, options: options);
  }

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.delete<T>(path, data: data, queryParameters: queryParameters, options: options);
  }
}

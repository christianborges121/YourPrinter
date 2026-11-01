import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yourprinter/core/constants/api_endpoints.dart';
import 'package:yourprinter/core/network/api_client.dart';
import 'package:yourprinter/services/printer_service.dart';

class RecordedRequest {
  final String method;
  final String path;
  final dynamic data;
  final Map<String, dynamic>? queryParameters;

  RecordedRequest({
    required this.method,
    required this.path,
    this.data,
    this.queryParameters,
  });
}

class MockApiClient extends ApiClient {
  final List<RecordedRequest> recordedRequests = [];
  final Map<String, dynamic Function(RecordedRequest req)> handlers = {};

  MockApiClient() : super(baseUrl: 'http://127.0.0.1:3000');

  void reset() {
    recordedRequests.clear();
    handlers.clear();
  }

  void on(String method, String path, dynamic Function(RecordedRequest req) handler) {
    handlers['$method $path'] = handler;
  }

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    final req = RecordedRequest(method: 'GET', path: path, queryParameters: queryParameters);
    recordedRequests.add(req);
    final key = 'GET $path';
    if (handlers.containsKey(key)) {
      final res = handlers[key]!(req);
      if (res is Response<T>) return res;
      if (res is Exception || res is Error) throw res;
      return Response<T>(
        requestOptions: RequestOptions(path: path),
        data: res as T?,
        statusCode: 200,
      );
    }
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      data: null,
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    final req = RecordedRequest(
      method: 'POST',
      path: path,
      data: data,
      queryParameters: queryParameters,
    );
    recordedRequests.add(req);
    final key = 'POST $path';
    if (handlers.containsKey(key)) {
      final res = handlers[key]!(req);
      if (res is Response<T>) return res;
      if (res is Exception || res is Error) throw res;
      return Response<T>(
        requestOptions: RequestOptions(path: path),
        data: res as T?,
        statusCode: 200,
      );
    }
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      data: <String, dynamic>{'success': true} as T,
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    final req = RecordedRequest(
      method: 'DELETE',
      path: path,
      data: data,
      queryParameters: queryParameters,
    );
    recordedRequests.add(req);
    final key = 'DELETE $path';
    if (handlers.containsKey(key)) {
      final res = handlers[key]!(req);
      if (res is Response<T>) return res;
      if (res is Exception || res is Error) throw res;
      return Response<T>(
        requestOptions: RequestOptions(path: path),
        data: res as T?,
        statusCode: 200,
      );
    }
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      data: <String, dynamic>{'success': true} as T,
      statusCode: 200,
    );
  }
}

DioException createHttpException({
  required String path,
  int statusCode = 404,
  String message = 'Error',
  dynamic data,
}) {
  final ro = RequestOptions(path: path);
  return DioException(
    requestOptions: ro,
    response: Response(
      requestOptions: ro,
      statusCode: statusCode,
      statusMessage: message,
      data: data,
    ),
    type: DioExceptionType.badResponse,
    message: message,
  );
}

void main() {
  group('ApiEndpoints Constant Contract Specifications', () {
    test('Control, Homing, and Speed/Fan endpoint constants match contract', () {
      expect(ApiEndpoints.speedRate, equals('/api/printer/control/speed'));
      expect(ApiEndpoints.fanSpeed, equals('/api/printer/control/fan'));
      expect(ApiEndpoints.homeAxes, equals('/api/printer/control/home'));
      expect(ApiEndpoints.homeSpecific, equals('/api/printer/control/home-specific'));
      expect(ApiEndpoints.spoolmanSelect, equals('/api/spoolman/select'));
      expect(ApiEndpoints.spoolmanClear, equals('/api/spoolman/clear'));
      expect(ApiEndpoints.spoolmanSpools, equals('/api/spoolman/spools'));
      expect(ApiEndpoints.printerCapabilities, equals('/api/printer/capabilities'));
      expect(ApiEndpoints.spoolmanActive('test-ctx'), equals('/api/spoolman/active/test-ctx'));
    });
  });

  group('PrinterService: setPrintSpeed Clamping & Boundary Stress Tests', () {
    late MockApiClient mockApi;
    late PrinterService service;

    setUp(() {
      mockApi = MockApiClient();
      service = PrinterService(apiClient: mockApi);
    });

    final clampingCases = <int, int>{
      // Negative and zero values must clamp to 10
      -999999: 10,
      -100: 10,
      -50: 10,
      -1: 10,
      0: 10,
      // Lower boundary
      1: 10,
      9: 10,
      10: 10,
      // Within valid 10-300 range
      11: 11,
      50: 50,
      100: 100,
      140: 140,
      200: 200,
      299: 299,
      300: 300,
      // Upper boundary and overflow
      301: 300,
      350: 300,
      500: 300,
      999999: 300,
    };

    for (final entry in clampingCases.entries) {
      test('setPrintSpeed(${entry.key}) clamps payload speed to ${entry.value}', () async {
        mockApi.reset();
        final success = await service.setPrintSpeed(entry.key);

        expect(success, isTrue);
        expect(mockApi.recordedRequests.length, equals(1));
        final req = mockApi.recordedRequests.first;
        expect(req.method, equals('POST'));
        expect(req.path, equals(ApiEndpoints.speedRate));
        expect(req.data, isA<Map<String, dynamic>>());
        expect((req.data as Map<String, dynamic>)['speed'], equals(entry.value));
      });
    }

    test('setPrintSpeed preserves and propagates contextId when provided', () async {
      mockApi.reset();
      final success = await service.setPrintSpeed(120, contextId: 'ctx_printer_1');

      expect(success, isTrue);
      expect(mockApi.recordedRequests.length, equals(1));
      final req = mockApi.recordedRequests.first;
      expect((req.data as Map<String, dynamic>)['contextId'], equals('ctx_printer_1'));
      expect(req.queryParameters?['contextId'], equals('ctx_printer_1'));
    });

    test('setPrintSpeed omits contextId when null', () async {
      mockApi.reset();
      await service.setPrintSpeed(100);

      final req = mockApi.recordedRequests.first;
      expect((req.data as Map<String, dynamic>).containsKey('contextId'), isFalse);
      expect(req.queryParameters, isNull);
    });

    test('setPrintSpeed returns false gracefully on 400 Bad Request', () async {
      mockApi.on('POST', ApiEndpoints.speedRate, (req) {
        throw createHttpException(path: ApiEndpoints.speedRate, statusCode: 400, message: 'Invalid speed');
      });

      final result = await service.setPrintSpeed(100);
      expect(result, isFalse);
    });

    test('setPrintSpeed returns false gracefully on 500 Internal Server Error', () async {
      mockApi.on('POST', ApiEndpoints.speedRate, (req) {
        throw createHttpException(path: ApiEndpoints.speedRate, statusCode: 500, message: 'Internal Server Error');
      });

      final result = await service.setPrintSpeed(140);
      expect(result, isFalse);
    });

    test('setPrintSpeed returns false when server responds 200 with success: false', () async {
      mockApi.on('POST', ApiEndpoints.speedRate, (req) => {'success': false, 'error': 'busy'});

      final result = await service.setPrintSpeed(100);
      expect(result, isFalse);
    });
  });

  group('PrinterService: setFanSpeed & setCoolingFanSpeed Clamping Stress Tests', () {
    late MockApiClient mockApi;
    late PrinterService service;

    setUp(() {
      mockApi = MockApiClient();
      service = PrinterService(apiClient: mockApi);
    });

    final fanClampingCases = <int, int>{
      // Negative values clamp to 0
      -999999: 0,
      -100: 0,
      -1: 0,
      // Lower boundary
      0: 0,
      1: 1,
      // Standard steps & presets
      25: 25,
      50: 50,
      75: 75,
      99: 99,
      100: 100,
      // Upper boundary & overflow
      101: 100,
      150: 100,
      999999: 100,
    };

    for (final entry in fanClampingCases.entries) {
      test('setFanSpeed(${entry.key}) clamps payload coolingFan to ${entry.value}', () async {
        mockApi.reset();
        final success = await service.setFanSpeed(entry.key);

        expect(success, isTrue);
        expect(mockApi.recordedRequests.length, equals(1));
        final req = mockApi.recordedRequests.first;
        expect(req.method, equals('POST'));
        expect(req.path, equals(ApiEndpoints.fanSpeed));
        expect((req.data as Map<String, dynamic>)['coolingFan'], equals(entry.value));
      });
    }

    test('setCoolingFanSpeed alias behaves identically to setFanSpeed', () async {
      mockApi.reset();
      final success = await service.setCoolingFanSpeed(150, contextId: 'ctx_ad5m');

      expect(success, isTrue);
      expect(mockApi.recordedRequests.length, equals(1));
      final req = mockApi.recordedRequests.first;
      expect((req.data as Map<String, dynamic>)['coolingFan'], equals(100));
      expect((req.data as Map<String, dynamic>)['contextId'], equals('ctx_ad5m'));
      expect(req.queryParameters?['contextId'], equals('ctx_ad5m'));
    });

    test('setFanSpeed returns false gracefully on 500 or network exception', () async {
      mockApi.on('POST', ApiEndpoints.fanSpeed, (req) {
        throw DioException(
          requestOptions: RequestOptions(path: ApiEndpoints.fanSpeed),
          type: DioExceptionType.connectionTimeout,
          message: 'Connection timed out',
        );
      });

      final result = await service.setFanSpeed(50);
      expect(result, isFalse);
    });

    test('setFanSpeed returns false when response has success: false', () async {
      mockApi.on('POST', ApiEndpoints.fanSpeed, (req) => {'success': false});

      final result = await service.setFanSpeed(50);
      expect(result, isFalse);
    });
  });

  group('PrinterService: Homing Fallback Stress Tests', () {
    late MockApiClient mockApi;
    late PrinterService service;

    setUp(() {
      mockApi = MockApiClient();
      service = PrinterService(apiClient: mockApi);
    });

    test('homeSpecific succeeds directly when endpoint is supported (no fallback triggered)', () async {
      mockApi.on('POST', ApiEndpoints.homeSpecific, (req) => {'success': true});

      final result = await service.homeSpecific('x', contextId: 'ctx_c5p');

      expect(result, isTrue);
      expect(mockApi.recordedRequests.length, equals(1));
      final req = mockApi.recordedRequests.first;
      expect(req.path, equals(ApiEndpoints.homeSpecific));
      expect((req.data as Map<String, dynamic>)['axis'], equals('x'));
      expect((req.data as Map<String, dynamic>)['axes'], equals('x'));
      expect((req.data as Map<String, dynamic>)['contextId'], equals('ctx_c5p'));
      expect(req.queryParameters?['contextId'], equals('ctx_c5p'));
    });

    test('homeSpecific falls back to homeAxes on HTTP 404 Not Found', () async {
      mockApi.on('POST', ApiEndpoints.homeSpecific, (req) {
        throw createHttpException(path: ApiEndpoints.homeSpecific, statusCode: 404, message: 'Not Found');
      });
      mockApi.on('POST', ApiEndpoints.homeAxes, (req) => {'success': true});

      final result = await service.homeSpecific('z', contextId: 'ctx_ad5m');

      expect(result, isTrue);
      expect(mockApi.recordedRequests.length, equals(2));
      // First request: homeSpecific
      expect(mockApi.recordedRequests[0].path, equals(ApiEndpoints.homeSpecific));
      // Second request: fallback homeAxes with contextId preserved
      expect(mockApi.recordedRequests[1].path, equals(ApiEndpoints.homeAxes));
      expect(mockApi.recordedRequests[1].queryParameters?['contextId'], equals('ctx_ad5m'));
    });

    test('homeSpecific falls back to homeAxes on 500 Internal Error or 501 Not Implemented', () async {
      mockApi.on('POST', ApiEndpoints.homeSpecific, (req) {
        throw createHttpException(path: ApiEndpoints.homeSpecific, statusCode: 501, message: 'Not Implemented');
      });
      mockApi.on('POST', ApiEndpoints.homeAxes, (req) => {'success': true});

      final result = await service.homeSpecific('y');

      expect(result, isTrue);
      expect(mockApi.recordedRequests.length, equals(2));
      expect(mockApi.recordedRequests[0].path, equals(ApiEndpoints.homeSpecific));
      expect(mockApi.recordedRequests[1].path, equals(ApiEndpoints.homeAxes));
    });

    test('homeSpecific returns false if fallback homeAxes responds success: false', () async {
      mockApi.on('POST', ApiEndpoints.homeSpecific, (req) {
        throw createHttpException(path: ApiEndpoints.homeSpecific, statusCode: 404);
      });
      mockApi.on('POST', ApiEndpoints.homeAxes, (req) => {'success': false});

      final result = await service.homeSpecific('z');
      expect(result, isFalse);
    });
  });

  group('PrinterService: Spoolman Active Clear Fallback Stress Tests', () {
    late MockApiClient mockApi;
    late PrinterService service;

    setUp(() {
      mockApi = MockApiClient();
      service = PrinterService(apiClient: mockApi);
    });

    test('clearActiveSpool succeeds on primary route DELETE /api/spoolman/select', () async {
      mockApi.on('DELETE', ApiEndpoints.spoolmanSelect, (req) => {'success': true});

      final result = await service.clearActiveSpool(contextId: 'ctx_spool');

      expect(result, isTrue);
      expect(mockApi.recordedRequests.length, equals(1));
      final req = mockApi.recordedRequests.first;
      expect(req.method, equals('DELETE'));
      expect(req.path, equals(ApiEndpoints.spoolmanSelect));
      expect((req.data as Map<String, dynamic>)['contextId'], equals('ctx_spool'));
    });

    test('clearActiveSpool falls back to POST /api/spoolman/clear on HTTP 404', () async {
      mockApi.on('DELETE', ApiEndpoints.spoolmanSelect, (req) {
        throw createHttpException(path: ApiEndpoints.spoolmanSelect, statusCode: 404, message: 'Not Found');
      });
      mockApi.on('POST', ApiEndpoints.spoolmanClear, (req) => {'success': true});

      final result = await service.clearActiveSpool(contextId: 'ctx_creator5');

      expect(result, isTrue);
      expect(mockApi.recordedRequests.length, equals(2));
      expect(mockApi.recordedRequests[0].method, equals('DELETE'));
      expect(mockApi.recordedRequests[0].path, equals(ApiEndpoints.spoolmanSelect));
      expect(mockApi.recordedRequests[1].method, equals('POST'));
      expect(mockApi.recordedRequests[1].path, equals(ApiEndpoints.spoolmanClear));
      expect((mockApi.recordedRequests[1].data as Map<String, dynamic>)['contextId'], equals('ctx_creator5'));
    });

    test('clearActiveSpool falls back on 405 Method Not Allowed', () async {
      mockApi.on('DELETE', ApiEndpoints.spoolmanSelect, (req) {
        throw createHttpException(path: ApiEndpoints.spoolmanSelect, statusCode: 405, message: 'Method Not Allowed');
      });
      mockApi.on('POST', ApiEndpoints.spoolmanClear, (req) => {'success': true});

      final result = await service.clearActiveSpool();

      expect(result, isTrue);
      expect(mockApi.recordedRequests.length, equals(2));
      expect(mockApi.recordedRequests[1].path, equals(ApiEndpoints.spoolmanClear));
    });

    test('clearActiveSpool handles dual failure gracefully without crashing', () async {
      mockApi.on('DELETE', ApiEndpoints.spoolmanSelect, (req) {
        throw createHttpException(path: ApiEndpoints.spoolmanSelect, statusCode: 404);
      });
      mockApi.on('POST', ApiEndpoints.spoolmanClear, (req) {
        throw createHttpException(path: ApiEndpoints.spoolmanClear, statusCode: 500);
      });

      final result = await service.clearActiveSpool(contextId: 'ctx_fail');
      expect(result, isFalse);
      expect(mockApi.recordedRequests.length, equals(2));
    });

    test('clearActiveSpool handles connection timeout on both attempts gracefully', () async {
      mockApi.on('DELETE', ApiEndpoints.spoolmanSelect, (req) {
        throw DioException(
          requestOptions: RequestOptions(path: ApiEndpoints.spoolmanSelect),
          type: DioExceptionType.connectionTimeout,
        );
      });
      mockApi.on('POST', ApiEndpoints.spoolmanClear, (req) {
        throw DioException(
          requestOptions: RequestOptions(path: ApiEndpoints.spoolmanClear),
          type: DioExceptionType.connectionError,
        );
      });

      final result = await service.clearActiveSpool();
      expect(result, isFalse);
    });
  });

  group('PrinterService: Spool Select & Catalog Search Stress Tests', () {
    late MockApiClient mockApi;
    late PrinterService service;

    setUp(() {
      mockApi = MockApiClient();
      service = PrinterService(apiClient: mockApi);
    });

    test('selectSpool formats payload correctly with spoolId and contextId', () async {
      mockApi.on('POST', ApiEndpoints.spoolmanSelect, (req) => {'success': true});

      final result = await service.selectSpool(42, contextId: 'ctx_ad5m');
      expect(result, isTrue);
      final req = mockApi.recordedRequests.first;
      expect((req.data as Map<String, dynamic>)['spoolId'], equals(42));
      expect((req.data as Map<String, dynamic>)['contextId'], equals('ctx_ad5m'));
    });

    test('selectSpool returns false gracefully on error', () async {
      mockApi.on('POST', ApiEndpoints.spoolmanSelect, (req) {
        throw createHttpException(path: ApiEndpoints.spoolmanSelect, statusCode: 404);
      });

      final result = await service.selectSpool(99);
      expect(result, isFalse);
    });

    test('searchSpoolmanSpools trims query whitespace and parses items', () async {
      mockApi.on('GET', ApiEndpoints.spoolmanSpools, (req) {
        return {
          'spools': [
            {
              'id': 1,
              'name': 'PLA Red',
              'material': 'PLA',
              'vendor': 'Polymaker',
              'colorHex': '#FF0000',
              'remainingWeight': 750.0,
              'remainingLength': 250.0,
            }
          ]
        };
      });

      final spools = await service.searchSpoolmanSpools(search: '  polymaker  ');
      expect(spools.length, equals(1));
      expect(spools.first.id, equals(1));
      expect(spools.first.material, equals('PLA'));
      expect(mockApi.recordedRequests.first.queryParameters?['search'], equals('polymaker'));
    });

    test('searchSpoolmanSpools handles null search query without params', () async {
      mockApi.on('GET', ApiEndpoints.spoolmanSpools, (req) => {'spools': []});

      final spools = await service.searchSpoolmanSpools(search: null);
      expect(spools, isEmpty);
      expect(mockApi.recordedRequests.first.queryParameters, isNull);
    });

    test('searchSpoolmanSpools handles 404/500/network error gracefully returning empty list', () async {
      mockApi.on('GET', ApiEndpoints.spoolmanSpools, (req) {
        throw createHttpException(path: ApiEndpoints.spoolmanSpools, statusCode: 503);
      });

      final spools = await service.searchSpoolmanSpools(search: 'error');
      expect(spools, isEmpty);
    });
  });

  group('PrinterService: Capabilities Retrieval Stress Tests', () {
    late MockApiClient mockApi;
    late PrinterService service;

    setUp(() {
      mockApi = MockApiClient();
      service = PrinterService(apiClient: mockApi);
    });

    test('getPrinterCapabilities returns null gracefully on 404 or connection drop', () async {
      mockApi.on('GET', ApiEndpoints.printerCapabilities, (req) {
        throw createHttpException(path: ApiEndpoints.printerCapabilities, statusCode: 404);
      });

      final caps = await service.getPrinterCapabilities(contextId: 'ctx_legacy');
      expect(caps, isNull);
    });

    test('getPrinterCapabilities parses valid capabilities payload', () async {
      mockApi.on('GET', ApiEndpoints.printerCapabilities, (req) {
        return {
          'capabilities': {
            'hasChamberHeater': true,
            'hasCoolingFan': true,
            'hasSpeedControl': true,
          }
        };
      });

      final caps = await service.getPrinterCapabilities();
      expect(caps, isNotNull);
      expect(caps!.hasChamberHeater, isTrue);
      expect(caps.canAdjustSpeed, isTrue);
      expect(caps.nozzleCount, equals(1));
    });
  });
}

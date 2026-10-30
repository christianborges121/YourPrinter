import 'package:flutter_test/flutter_test.dart';
import 'package:yourprinter/models/auth_models.dart';
import 'package:yourprinter/models/camera_config.dart';
import 'package:yourprinter/models/job_file.dart';
import 'package:yourprinter/models/material_station.dart';
import 'package:yourprinter/models/printer_context.dart';
import 'package:yourprinter/models/printer_features.dart';
import 'package:yourprinter/models/printer_status.dart';

void main() {
  group('Models Serialization Tests', () {
    test('PrinterStatusData parses full payload with dual extruders', () {
      final json = {
        'printerState': 'PRINTING',
        'bedTemperature': 60.5,
        'bedTargetTemperature': 60.0,
        'nozzleTemperature': 210.2,
        'nozzleTargetTemperature': 210.0,
        'chamberTemperature': 35.0,
        'toolTemps': [210.2, 215.0],
        'toolTargetTemps': [210.0, 215.0],
        'progress': 45.6,
        'currentLayer': 142,
        'totalLayers': 410,
        'jobName': 'bracket_v3.gcode',
        'timeRemaining': 3600,
        'timeElapsed': 1800,
        'filtrationMode': 'internal',
        'watchdog': {
          'online': true,
          'state': 'monitoring',
          'confidence': 0.12,
          'threshold': 0.20,
          'auto_pause_enabled': true,
          'auto_pause_triggered': false,
        },
      };

      final status = PrinterStatusData.fromJson(json);

      expect(status.printerState, 'PRINTING');
      expect(status.isPrinting, true);
      expect(status.isCompleted, false);
      expect(status.bedTemperature, 60.5);
      expect(status.toolTemps.length, 2);
      expect(status.toolTemps[1], 215.0);
      expect(status.progress, 45.6);
      expect(status.currentLayer, 142);
      expect(status.watchdog?.online, true);
      expect(status.watchdog?.confidence, 0.12);
    });

    test('PrinterStatusData parses null/empty payload gracefully with default fallbacks', () {
      final status = PrinterStatusData.fromJson({});

      expect(status.printerState, 'Idle');
      expect(status.isPrinting, false);
      expect(status.isCompleted, false);
      expect(status.bedTemperature, 0.0);
      expect(status.progress, 0.0);
      expect(status.toolTemps, isEmpty);
      expect(status.watchdog, isNull);
    });

    test('PrinterFeatures parses capability flags', () {
      final json = {
        'hasCamera': true,
        'hasLED': true,
        'hasFiltration': true,
        'hasMaterialStation': true,
        'canPause': true,
        'canResume': true,
        'canCancel': true,
      };

      final features = PrinterFeatures.fromJson(json);

      expect(features.hasCamera, true);
      expect(features.hasFiltration, true);
      expect(features.hasMaterialStation, true);
    });

    test('CameraProxyConfigResponse parses go2rtc config and concurrencyNotice', () {
      final json = {
        'success': true,
        'wsUrl': '/api/go2rtc/api/ws?src=printer_context_1',
        'concurrencyNotice': 'YourPrinter devices only support one active camera stream at a time.',
      };

      final config = CameraProxyConfigResponse.fromJson(json);

      expect(config.success, true);
      expect(config.wsUrl, '/api/go2rtc/api/ws?src=printer_context_1');
      expect(config.concurrencyNotice, contains('only support one active camera stream'));
    });

    test('MaterialStationStatus parses slot colors and active state from WebUI schema', () {
      final json = {
        'connected': true,
        'activeSlot': 2,
        'overallStatus': 'ready',
        'slots': [
          {'slotId': 1, 'materialType': 'PLA', 'materialColor': '#FF0000', 'isEmpty': false},
          {'slotId': 2, 'materialType': 'PETG', 'materialColor': '#00FF00', 'isEmpty': false},
          {'slotId': 3, 'materialType': null, 'materialColor': null, 'isEmpty': true},
        ],
      };

      final station = MaterialStationStatus.fromJson(json);

      expect(station.connected, true);
      expect(station.activeSlot, 2);
      expect(station.slots.length, 3);
      expect(station.slots[0].slotId, 1);
      expect(station.slots[0].isActive, false);
      expect(station.slots[0].materialColor, '#FF0000');
      expect(station.slots[0].materialType, 'PLA');
      expect(station.slots[1].slotId, 2);
      expect(station.slots[1].isActive, true);
      expect(station.slots[1].materialColor, '#00FF00');
      expect(station.slots[2].isEmpty, true);
    });

    test('WebUIJobFile parses metadata and print time', () {
      final json = {
        'filename': 'benchy.gcode',
        'printTime': 2400,
        'filamentWeight': 14.5,
      };

      final file = WebUIJobFile.fromJson(json);

      expect(file.filename, 'benchy.gcode');
      expect(file.printTime, 2400);
      expect(file.filamentWeight, 14.5);
    });

    test('Auth models parse server authentication response', () {
      final authStatusJson = {'authRequired': true, 'hasPassword': true, 'defaultPassword': false};
      final authStatus = WebUIAuthStatus.fromJson(authStatusJson);
      expect(authStatus.authRequired, true);
      expect(authStatus.hasPassword, true);

      final loginJson = {'success': true, 'token': 'jwt-token-xyz-123'};
      final login = WebUILoginResponse.fromJson(loginJson);
      expect(login.success, true);
      expect(login.token, 'jwt-token-xyz-123');
    });

    test('PrinterContext parses multi-context payload', () {
      final contextJson = {
        'contextId': 'ctx-creator-5',
        'name': 'Creator 5 Pro',
        'model': 'YourPrinter Creator 5',
        'isConnected': true,
        'isSelected': true,
        'printerDetails': {
          'IPAddress': '192.168.1.150',
          'model': 'Creator 5',
        },
      };

      final ctx = PrinterContext.fromJson(contextJson);
      expect(ctx.contextId, 'ctx-creator-5');
      expect(ctx.name, 'Creator 5 Pro');
      expect(ctx.isConnected, true);
      expect(ctx.isSelected, true);
      expect(ctx.printerDetails.ipAddress, '192.168.1.150');
    });
  });
}

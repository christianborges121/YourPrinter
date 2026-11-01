import 'package:flutter_test/flutter_test.dart';
import 'package:yourprinter/models/auth_models.dart';
import 'package:yourprinter/models/camera_config.dart';
import 'package:yourprinter/models/job_file.dart';
import 'package:yourprinter/models/material_station.dart';
import 'package:yourprinter/models/printer_capabilities.dart';
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
      expect(status.printSpeed, 100.0);
      expect(status.coolingFanSpeed, 0.0);
      expect(status.chamberFanSpeed, 0.0);
      expect(status.ledState, false);
      expect(status.elapsedTimeSeconds, 0);
      expect(status.cumulativeFilament, 0.0);
      expect(status.cumulativePrintTime, 0);
    });

    test('PrinterStatusData parses expanded telemetry fields with aliases and roundtrips', () {
      final json = {
        'printerState': 'PRINTING',
        'bedTemperature': 60.0,
        'bedTargetTemperature': 60.0,
        'nozzleTemperature': 220.0,
        'nozzleTargetTemperature': 220.0,
        'progress': 50.0,
        'currentLayer': 100,
        'totalLayers': 200,
        'printSpeed': 140.0,
        'coolingFanSpeed': 75.0,
        'chamberFanSpeed': 40.0,
        'ledState': true,
        'elapsedTimeSeconds': 3600,
        'cumulativeFilament': 1250.5,
        'cumulativePrintTime': 72000,
      };

      final status = PrinterStatusData.fromJson(json);

      expect(status.printSpeed, 140.0);
      expect(status.coolingFanSpeed, 75.0);
      expect(status.chamberFanSpeed, 40.0);
      expect(status.ledState, true);
      expect(status.elapsedTimeSeconds, 3600);
      expect(status.cumulativeFilament, 1250.5);
      expect(status.cumulativePrintTime, 72000);

      // copyWith test
      final updated = status.copyWith(printSpeed: 100.0, coolingFanSpeed: 50.0);
      expect(updated.printSpeed, 100.0);
      expect(updated.coolingFanSpeed, 50.0);
      expect(updated.ledState, true); // preserved

      // toJson test
      final serialized = updated.toJson();
      expect(serialized['printSpeed'], 100.0);
      expect(serialized['coolingFanSpeed'], 50.0);
      expect(serialized['ledState'], true);
      expect(serialized['cumulativeFilament'], 1250.5);
    });

    test('PrinterStatusData maps fallback aliases for fan speed and elapsed time', () {
      final json = {
        'printerState': 'PRINTING',
        'bedTemperature': 55.0,
        'bedTargetTemperature': 55.0,
        'nozzleTemperature': 200.0,
        'nozzleTargetTemperature': 200.0,
        'progress': 25.0,
        'currentLayer': 50,
        'totalLayers': 200,
        'fanSpeed': 85.0, // fallback alias for coolingFanSpeed
        'timeElapsed': 1200, // fallback alias for elapsedTimeSeconds
      };

      final status = PrinterStatusData.fromJson(json);

      expect(status.printSpeed, 100.0); // default fallback
      expect(status.coolingFanSpeed, 85.0);
      expect(status.elapsedTimeSeconds, 1200);
    });

    test('PrinterNetworkCapabilities parses full payload and round-trips via toJson', () {
      final json = {
        'canJog': true,
        'canHome': true,
        'canBedLevel': true,
        'supportedAxes': ['X', 'Y', 'Z'],
        'hasBedHeater': true,
        'hasExtruderHeater': true,
        'hasChamberHeater': true,
        'nozzleCount': 2,
        'maxBedTemp': 120.0,
        'maxExtruderTemp': 320.0,
        'maxChamberTemp': 80.0,
        'hasPartCoolingFan': true,
        'hasChamberFan': true,
        'hasAuxFan': false,
        'hasFiltration': true,
        'hasLedControl': true,
        'canAdjustSpeed': true,
        'canAdjustZOffset': true,
        'hasCamera': true,
        'hasMaterialStation': true,
        'maxMaterialSlots': 4,
        'canPause': true,
        'canResume': true,
        'canCancel': true,
      };

      final caps = PrinterNetworkCapabilities.fromJson(json);

      expect(caps.canJog, true);
      expect(caps.canHome, true);
      expect(caps.canBedLevel, true);
      expect(caps.supportedAxes, ['X', 'Y', 'Z']);
      expect(caps.hasBedHeater, true);
      expect(caps.hasExtruderHeater, true);
      expect(caps.hasChamberHeater, true);
      expect(caps.nozzleCount, 2);
      expect(caps.maxBedTemp, 120.0);
      expect(caps.maxExtruderTemp, 320.0);
      expect(caps.maxChamberTemp, 80.0);
      expect(caps.hasPartCoolingFan, true);
      expect(caps.hasChamberFan, true);
      expect(caps.hasAuxFan, false);
      expect(caps.hasFiltration, true);
      expect(caps.hasLedControl, true);
      expect(caps.canAdjustSpeed, true);
      expect(caps.canAdjustZOffset, true);
      expect(caps.hasCamera, true);
      expect(caps.hasMaterialStation, true);
      expect(caps.maxMaterialSlots, 4);
      expect(caps.canPause, true);
      expect(caps.canResume, true);
      expect(caps.canCancel, true);

      // Verify toJson roundtrip
      final serialized = caps.toJson();
      expect(serialized['canJog'], true);
      expect(serialized['nozzleCount'], 2);
      expect(serialized['maxChamberTemp'], 80.0);

      // Verify copyWith
      final modified = caps.copyWith(canJog: false, maxBedTemp: 130.0);
      expect(modified.canJog, false);
      expect(modified.maxBedTemp, 130.0);
      expect(modified.nozzleCount, 2);
    });

    test('PrinterNetworkCapabilities gracefully handles empty json with defaults', () {
      final caps = PrinterNetworkCapabilities.fromJson({});
      expect(caps.canJog, false);
      expect(caps.canHome, false);
      expect(caps.canBedLevel, false);
      expect(caps.hasBedHeater, true);
      expect(caps.hasExtruderHeater, true);
      expect(caps.hasChamberHeater, false);
      expect(caps.nozzleCount, 1);
      expect(caps.maxBedTemp, 100.0);
      expect(caps.maxExtruderTemp, 260.0);
      expect(caps.maxChamberTemp, isNull);
      expect(caps.supportedAxes, ['X', 'Y', 'Z']);
      expect(caps.canPause, true);
    });

    test('PrinterFeatures parses capability flags and nested capabilities', () {
      final json = {
        'hasCamera': true,
        'hasLED': true,
        'hasFiltration': true,
        'hasMaterialStation': true,
        'canPause': true,
        'canResume': true,
        'canCancel': true,
        'ledUsesLegacyAPI': false,
        'capabilities': {
          'canJog': false,
          'canHome': false,
          'hasChamberHeater': true,
          'maxChamberTemp': 80.0,
          'nozzleCount': 4,
        },
      };

      final features = PrinterFeatures.fromJson(json);

      expect(features.hasCamera, true);
      expect(features.hasFiltration, true);
      expect(features.hasMaterialStation, true);
      expect(features.capabilities, isNotNull);
      expect(features.capabilities!.canJog, false);
      expect(features.capabilities!.hasChamberHeater, true);
      expect(features.capabilities!.maxChamberTemp, 80.0);
      expect(features.capabilities!.nozzleCount, 4);

      // roundtrip
      final serialized = features.toJson();
      expect(serialized['hasCamera'], true);
      expect(serialized['capabilities'], isNotNull);
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

    test('ActiveSpoolData parses Spoolman catalog item and handles defaults', () {
      final json = {
        'id': 42,
        'name': 'PolyLite PLA Pro',
        'vendor': 'Polymaker',
        'material': 'PLA',
        'colorHex': '#3B82F6',
        'remainingWeight': 740.0,
        'remainingLength': 245.5,
      };

      final spool = ActiveSpoolData.fromJson(json);

      expect(spool.id, 42);
      expect(spool.name, 'PolyLite PLA Pro');
      expect(spool.vendor, 'Polymaker');
      expect(spool.material, 'PLA');
      expect(spool.colorHex, '#3B82F6');
      expect(spool.remainingWeight, 740.0);
      expect(spool.remainingLength, 245.5);
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

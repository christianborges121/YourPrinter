import 'package:flutter_test/flutter_test.dart';
import 'package:yourprinter/models/printer_capabilities.dart';
import 'package:yourprinter/models/printer_features.dart';
import 'package:yourprinter/models/printer_status.dart';

void main() {
  group('Milestone 1 Adversarial Stress Tests: PrinterNetworkCapabilities', () {
    test('1.1 Empty JSON yields canonical defaults across all 24 capability fields', () {
      final caps = PrinterNetworkCapabilities.fromJson(const {});

      // Movement & Positioning
      expect(caps.canJog, false);
      expect(caps.canHome, false);
      expect(caps.canBedLevel, false);
      expect(caps.supportedAxes, const ['X', 'Y', 'Z']);

      // Thermal Hardware
      expect(caps.hasBedHeater, true);
      expect(caps.hasExtruderHeater, true);
      expect(caps.hasChamberHeater, false);
      expect(caps.nozzleCount, 1);
      expect(caps.maxBedTemp, 100.0);
      expect(caps.maxExtruderTemp, 260.0);
      expect(caps.maxChamberTemp, isNull);

      // Ventilation & Accessories
      expect(caps.hasPartCoolingFan, true);
      expect(caps.hasChamberFan, false);
      expect(caps.hasAuxFan, false);
      expect(caps.hasFiltration, false);
      expect(caps.hasLedControl, false);

      // Overrides & Tuning
      expect(caps.canAdjustSpeed, true);
      expect(caps.canAdjustZOffset, true);

      // Ecosystem & Job
      expect(caps.hasCamera, false);
      expect(caps.hasMaterialStation, false);
      expect(caps.maxMaterialSlots, isNull);

      // Job Execution
      expect(caps.canPause, true);
      expect(caps.canResume, true);
      expect(caps.canCancel, true);
    });

    test('1.2 Explicit null values in JSON fall back gracefully without TypeError', () {
      final json = <String, dynamic>{
        'canJog': null,
        'canHome': null,
        'canBedLevel': null,
        'supportedAxes': null,
        'hasBedHeater': null,
        'hasExtruderHeater': null,
        'hasChamberHeater': null,
        'nozzleCount': null,
        'maxBedTemp': null,
        'maxExtruderTemp': null,
        'maxChamberTemp': null,
        'hasPartCoolingFan': null,
        'hasChamberFan': null,
        'hasAuxFan': null,
        'hasFiltration': null,
        'hasLedControl': null,
        'canAdjustSpeed': null,
        'canAdjustZOffset': null,
        'hasCamera': null,
        'hasMaterialStation': null,
        'maxMaterialSlots': null,
        'canPause': null,
        'canResume': null,
        'canCancel': null,
      };

      final caps = PrinterNetworkCapabilities.fromJson(json);

      expect(caps.canJog, false);
      expect(caps.canHome, false);
      expect(caps.canBedLevel, false);
      expect(caps.supportedAxes, const ['X', 'Y', 'Z']);
      expect(caps.hasBedHeater, true);
      expect(caps.hasExtruderHeater, true);
      expect(caps.hasChamberHeater, false);
      expect(caps.nozzleCount, 1);
      expect(caps.maxBedTemp, 100.0);
      expect(caps.maxExtruderTemp, 260.0);
      expect(caps.maxChamberTemp, isNull);
      expect(caps.hasPartCoolingFan, true);
      expect(caps.hasChamberFan, false);
      expect(caps.hasAuxFan, false);
      expect(caps.hasFiltration, false);
      expect(caps.hasLedControl, false);
      expect(caps.canAdjustSpeed, true);
      expect(caps.canAdjustZOffset, true);
      expect(caps.hasCamera, false);
      expect(caps.hasMaterialStation, false);
      expect(caps.maxMaterialSlots, isNull);
      expect(caps.canPause, true);
      expect(caps.canResume, true);
      expect(caps.canCancel, true);
    });

    test('1.3 Numeric type coercion (int <-> double interchangeability)', () {
      final json = <String, dynamic>{
        'nozzleCount': 2.0, // double passed to int field
        'maxBedTemp': 110, // int passed to double field
        'maxExtruderTemp': 300, // int passed to double field
        'maxChamberTemp': 70, // int passed to nullable double field
        'maxMaterialSlots': 4.0, // double passed to nullable int field
      };

      final caps = PrinterNetworkCapabilities.fromJson(json);

      expect(caps.nozzleCount, 2);
      expect(caps.maxBedTemp, 110.0);
      expect(caps.maxExtruderTemp, 300.0);
      expect(caps.maxChamberTemp, 70.0);
      expect(caps.maxMaterialSlots, 4);
    });

    test('1.4 supportedAxes handles custom lists, mixed types, and empty list', () {
      final customAxes = PrinterNetworkCapabilities.fromJson({
        'supportedAxes': ['X', 'Y', 'Z', 'E1', 'E2'],
      });
      expect(customAxes.supportedAxes, ['X', 'Y', 'Z', 'E1', 'E2']);

      final emptyAxes = PrinterNetworkCapabilities.fromJson({
        'supportedAxes': <dynamic>[],
      });
      expect(emptyAxes.supportedAxes, isEmpty);

      final mixedAxes = PrinterNetworkCapabilities.fromJson({
        'supportedAxes': [1, 2, 'Z'],
      });
      expect(mixedAxes.supportedAxes, ['1', '2', 'Z']);
    });

    test('1.5 copyWith updates targeted fields while preserving all other 23 fields', () {
      const original = PrinterNetworkCapabilities(
        canJog: true,
        canHome: true,
        canBedLevel: true,
        supportedAxes: ['X', 'Y', 'Z', 'E'],
        hasBedHeater: true,
        hasExtruderHeater: true,
        hasChamberHeater: true,
        nozzleCount: 2,
        maxBedTemp: 120.0,
        maxExtruderTemp: 350.0,
        maxChamberTemp: 80.0,
        hasPartCoolingFan: true,
        hasChamberFan: true,
        hasAuxFan: true,
        hasFiltration: true,
        hasLedControl: true,
        canAdjustSpeed: true,
        canAdjustZOffset: true,
        hasCamera: true,
        hasMaterialStation: true,
        maxMaterialSlots: 8,
        canPause: true,
        canResume: true,
        canCancel: true,
      );

      // Modify single boolean
      final modified1 = original.copyWith(canJog: false);
      expect(modified1.canJog, false);
      expect(modified1.canHome, true);
      expect(modified1.hasChamberHeater, true);
      expect(modified1.maxBedTemp, 120.0);

      // Modify multiple thermal and tuning properties
      final modified2 = original.copyWith(
        hasChamberHeater: false,
        maxChamberTemp: 60.0,
        nozzleCount: 1,
        canAdjustSpeed: false,
      );
      expect(modified2.hasChamberHeater, false);
      expect(modified2.maxChamberTemp, 60.0);
      expect(modified2.nozzleCount, 1);
      expect(modified2.canAdjustSpeed, false);
      expect(modified2.canJog, true); // preserved
      expect(modified2.hasAuxFan, true); // preserved
      expect(modified2.maxMaterialSlots, 8); // preserved
    });

    test('1.6 Value equality and hashCode consistency across instances', () {
      final capsA = PrinterNetworkCapabilities.fromJson({
        'canJog': true,
        'maxBedTemp': 115.0,
        'supportedAxes': ['X', 'Y'],
      });

      final capsB = PrinterNetworkCapabilities.fromJson({
        'canJog': true,
        'maxBedTemp': 115.0,
        'supportedAxes': ['X', 'Y'],
      });

      final capsDifferent = PrinterNetworkCapabilities.fromJson({
        'canJog': false,
        'maxBedTemp': 115.0,
        'supportedAxes': ['X', 'Y'],
      });

      expect(capsA, equals(capsB));
      expect(capsA.hashCode, equals(capsB.hashCode));
      expect(capsA == capsDifferent, false);
      expect(identical(capsA, capsB), false);
    });

    test('1.7 Full serialization toJson roundtrips cleanly back into fromJson', () {
      const original = PrinterNetworkCapabilities(
        canJog: true,
        canHome: true,
        canBedLevel: true,
        supportedAxes: ['X', 'Y', 'Z'],
        hasBedHeater: true,
        hasExtruderHeater: true,
        hasChamberHeater: true,
        nozzleCount: 2,
        maxBedTemp: 130.0,
        maxExtruderTemp: 320.0,
        maxChamberTemp: 75.0,
        hasPartCoolingFan: true,
        hasChamberFan: true,
        hasAuxFan: false,
        hasFiltration: true,
        hasLedControl: true,
        canAdjustSpeed: true,
        canAdjustZOffset: true,
        hasCamera: true,
        hasMaterialStation: true,
        maxMaterialSlots: 4,
        canPause: true,
        canResume: true,
        canCancel: true,
      );

      final json = original.toJson();
      final reconstructed = PrinterNetworkCapabilities.fromJson(json);

      expect(reconstructed, equals(original));
      expect(reconstructed.toJson(), equals(json));
    });
  });

  group('Milestone 1 Adversarial Stress Tests: PrinterStatusData', () {
    test('2.1 Empty JSON payload parses with resilient defaults', () {
      final status = PrinterStatusData.fromJson(const {});

      expect(status.printerState, 'Idle');
      expect(status.bedTemperature, 0.0);
      expect(status.bedTargetTemperature, 0.0);
      expect(status.nozzleTemperature, 0.0);
      expect(status.nozzleTargetTemperature, 0.0);
      expect(status.chamberTemperature, isNull);
      expect(status.chamberTargetTemperature, isNull);
      expect(status.toolTemps, isEmpty);
      expect(status.toolTargetTemps, isEmpty);
      expect(status.progress, 0.0);
      expect(status.currentLayer, 0);
      expect(status.totalLayers, 0);
      expect(status.jobName, isNull);
      expect(status.timeElapsed, isNull);
      expect(status.timeRemaining, isNull);
      expect(status.filtrationMode, 'none');
      expect(status.estimatedWeight, isNull);
      expect(status.estimatedLength, isNull);
      expect(status.thumbnailData, isNull);
      expect(status.formattedEta, isNull);
      expect(status.watchdog, isNull);

      // WebUI parity fields
      expect(status.printSpeed, 100.0);
      expect(status.coolingFanSpeed, 0.0);
      expect(status.chamberFanSpeed, 0.0);
      expect(status.ledState, false);
      expect(status.elapsedTimeSeconds, 0);
      expect(status.cumulativeFilament, 0.0);
      expect(status.cumulativePrintTime, 0);

      // Computed getters
      expect(status.isPrinting, false);
      expect(status.isPaused, false);
      expect(status.hasActiveJob, false);
      expect(status.isCompleted, false);
    });

    test('2.2 Explicit null values in JSON map cleanly without type exceptions', () {
      final json = <String, dynamic>{
        'printerState': null,
        'bedTemperature': null,
        'bedTargetTemperature': null,
        'nozzleTemperature': null,
        'nozzleTargetTemperature': null,
        'chamberTemperature': null,
        'chamberTargetTemperature': null,
        'toolTemps': null,
        'toolTargetTemps': null,
        'progress': null,
        'currentLayer': null,
        'totalLayers': null,
        'jobName': null,
        'timeElapsed': null,
        'timeRemaining': null,
        'filtrationMode': null,
        'estimatedWeight': null,
        'estimatedLength': null,
        'thumbnailData': null,
        'formattedEta': null,
        'watchdog': null,
        'printSpeed': null,
        'currentPrintSpeed': null,
        'speed': null,
        'coolingFanSpeed': null,
        'fanSpeed': null,
        'chamberFanSpeed': null,
        'chamberFan': null,
        'ledState': null,
        'led': null,
        'elapsedTimeSeconds': null,
        'cumulativeFilament': null,
        'totalFilamentUsed': null,
        'cumulativePrintTime': null,
        'totalPrintTime': null,
      };

      final status = PrinterStatusData.fromJson(json);

      expect(status.printerState, 'Idle');
      expect(status.bedTemperature, 0.0);
      expect(status.printSpeed, 100.0);
      expect(status.coolingFanSpeed, 0.0);
      expect(status.chamberFanSpeed, 0.0);
      expect(status.ledState, false);
      expect(status.elapsedTimeSeconds, 0);
      expect(status.cumulativeFilament, 0.0);
      expect(status.cumulativePrintTime, 0);
    });

    test('2.3 Fallback Key Hierarchy & Priority for printSpeed', () {
      // 1. speed fallback
      final speedOnly = PrinterStatusData.fromJson({'speed': 140.0});
      expect(speedOnly.printSpeed, 140.0);

      // 2. currentPrintSpeed overrides speed
      final currentPrintSpeedOnly = PrinterStatusData.fromJson({
        'currentPrintSpeed': 120.0,
        'speed': 140.0,
      });
      expect(currentPrintSpeedOnly.printSpeed, 120.0);

      // 3. printSpeed overrides currentPrintSpeed and speed
      final printSpeedPrimary = PrinterStatusData.fromJson({
        'printSpeed': 50.0,
        'currentPrintSpeed': 120.0,
        'speed': 140.0,
      });
      expect(printSpeedPrimary.printSpeed, 50.0);
    });

    test('2.4 Fallback Key Hierarchy for coolingFanSpeed and chamberFanSpeed', () {
      // coolingFanSpeed via fanSpeed fallback
      final fanSpeedOnly = PrinterStatusData.fromJson({'fanSpeed': 65.0});
      expect(fanSpeedOnly.coolingFanSpeed, 65.0);

      // coolingFanSpeed primary overrides fanSpeed fallback
      final coolingFanPrimary = PrinterStatusData.fromJson({
        'coolingFanSpeed': 80.0,
        'fanSpeed': 65.0,
      });
      expect(coolingFanPrimary.coolingFanSpeed, 80.0);

      // chamberFanSpeed via chamberFan fallback
      final chamberFanOnly = PrinterStatusData.fromJson({'chamberFan': 40.0});
      expect(chamberFanOnly.chamberFanSpeed, 40.0);

      // chamberFanSpeed primary overrides chamberFan fallback
      final chamberFanPrimary = PrinterStatusData.fromJson({
        'chamberFanSpeed': 90.0,
        'chamberFan': 40.0,
      });
      expect(chamberFanPrimary.chamberFanSpeed, 90.0);
    });

    test('2.5 Fallback Key Hierarchy for ledState boolean resolution', () {
      // led fallback when ledState is null
      final ledFallback = PrinterStatusData.fromJson({'led': true});
      expect(ledFallback.ledState, true);

      // ledState false should NOT be overridden by led true
      final ledFalsePrimary = PrinterStatusData.fromJson({
        'ledState': false,
        'led': true,
      });
      expect(ledFalsePrimary.ledState, false);

      // ledState true overrides led false
      final ledTruePrimary = PrinterStatusData.fromJson({
        'ledState': true,
        'led': false,
      });
      expect(ledTruePrimary.ledState, true);
    });

    test('2.6 Bidirectional fallback synchronization for elapsed time', () {
      // timeElapsed provides elapsedTimeSeconds
      final timeElapsedOnly = PrinterStatusData.fromJson({'timeElapsed': 1800});
      expect(timeElapsedOnly.elapsedTimeSeconds, 1800);
      expect(timeElapsedOnly.timeElapsed, 1800);

      // elapsedTimeSeconds provides timeElapsed
      final elapsedSecondsOnly = PrinterStatusData.fromJson({'elapsedTimeSeconds': 2400});
      expect(elapsedSecondsOnly.elapsedTimeSeconds, 2400);
      expect(elapsedSecondsOnly.timeElapsed, 2400);

      // Distinct values respect their primary fields
      final distinctTimes = PrinterStatusData.fromJson({
        'timeElapsed': 1200,
        'elapsedTimeSeconds': 1205,
      });
      expect(distinctTimes.timeElapsed, 1200);
      expect(distinctTimes.elapsedTimeSeconds, 1205);
    });

    test('2.7 Fallbacks for cumulativeFilament and cumulativePrintTime', () {
      final filFallback = PrinterStatusData.fromJson({'totalFilamentUsed': 950.2});
      expect(filFallback.cumulativeFilament, 950.2);

      final filPrimary = PrinterStatusData.fromJson({
        'cumulativeFilament': 1200.0,
        'totalFilamentUsed': 950.2,
      });
      expect(filPrimary.cumulativeFilament, 1200.0);

      final timeFallback = PrinterStatusData.fromJson({'totalPrintTime': 86400});
      expect(timeFallback.cumulativePrintTime, 86400);

      final timePrimary = PrinterStatusData.fromJson({
        'cumulativePrintTime': 100000,
        'totalPrintTime': 86400,
      });
      expect(timePrimary.cumulativePrintTime, 100000);
    });

    test('2.8 Numeric type coercion (int <-> double interchangeability)', () {
      final json = {
        'bedTemperature': 60, // int to double
        'bedTargetTemperature': 60,
        'nozzleTemperature': 215,
        'nozzleTargetTemperature': 215,
        'progress': 50,
        'currentLayer': 25.0, // double to int
        'totalLayers': 100.0, // double to int
        'printSpeed': 100, // int to double
        'coolingFanSpeed': 50,
        'chamberFanSpeed': 25,
        'elapsedTimeSeconds': 3600.0, // double to int
        'cumulativeFilament': 1000, // int to double
        'cumulativePrintTime': 7200.0, // double to int
        'toolTemps': [200, 210.5], // mixed int/double
        'toolTargetTemps': [200.0, 215],
      };

      final status = PrinterStatusData.fromJson(json);

      expect(status.bedTemperature, 60.0);
      expect(status.progress, 50.0);
      expect(status.currentLayer, 25);
      expect(status.totalLayers, 100);
      expect(status.printSpeed, 100.0);
      expect(status.coolingFanSpeed, 50.0);
      expect(status.chamberFanSpeed, 25.0);
      expect(status.elapsedTimeSeconds, 3600);
      expect(status.cumulativeFilament, 1000.0);
      expect(status.cumulativePrintTime, 7200);
      expect(status.toolTemps, [200.0, 210.5]);
      expect(status.toolTargetTemps, [200.0, 215.0]);
    });

    test('2.9 Computed getters under boundary printer states', () {
      // Paused states
      expect(PrinterStatusData.fromJson({'printerState': 'PAUSED'}).isPaused, true);
      expect(PrinterStatusData.fromJson({'printerState': 'paused'}).isPaused, true);
      expect(PrinterStatusData.fromJson({'printerState': 'Print Paused'}).isPaused, true);
      expect(PrinterStatusData.fromJson({'printerState': 'PRINTING'}).isPaused, false);

      // Printing states
      expect(PrinterStatusData.fromJson({'printerState': 'PRINTING'}).isPrinting, true);
      expect(PrinterStatusData.fromJson({'printerState': 'busy'}).isPrinting, true);
      expect(PrinterStatusData.fromJson({'printerState': 'heating'}).isPrinting, true);
      expect(PrinterStatusData.fromJson({'printerState': 'running'}).isPrinting, true);
      expect(PrinterStatusData.fromJson({'printerState': 'idle'}).isPrinting, false);

      // hasActiveJob
      expect(PrinterStatusData.fromJson({'printerState': 'PRINTING'}).hasActiveJob, true);
      expect(PrinterStatusData.fromJson({'printerState': 'PAUSED'}).hasActiveJob, true);
      expect(PrinterStatusData.fromJson({'printerState': 'idle'}).hasActiveJob, false);

      // isCompleted: via state string
      expect(PrinterStatusData.fromJson({'printerState': 'COMPLETED'}).isCompleted, true);
      expect(PrinterStatusData.fromJson({'printerState': 'completed'}).isCompleted, true);

      // isCompleted: via 100% progress + idle + jobName
      final finishedJob = PrinterStatusData.fromJson({
        'printerState': 'idle',
        'progress': 100.0,
        'jobName': 'benchy.gcode',
      });
      expect(finishedJob.isCompleted, true);

      // Not completed if still actively printing even if progress is 100
      final printing100 = PrinterStatusData.fromJson({
        'printerState': 'PRINTING',
        'progress': 100.0,
        'jobName': 'benchy.gcode',
      });
      expect(printing100.isCompleted, false);

      // Not completed if jobName is null
      final noJobName100 = PrinterStatusData.fromJson({
        'printerState': 'idle',
        'progress': 100.0,
        'jobName': null,
      });
      expect(noJobName100.isCompleted, false);
    });

    test('2.10 Preserves 0.0 values distinctly from null (Creator 5 Pro chamber fix)', () {
      final json = {
        'chamberTemperature': 0.0,
        'chamberTargetTemperature': 0.0,
        'coolingFanSpeed': 0.0,
        'chamberFanSpeed': 0.0,
      };

      final status = PrinterStatusData.fromJson(json);

      expect(status.chamberTemperature, 0.0);
      expect(status.chamberTargetTemperature, 0.0);
      expect(status.coolingFanSpeed, 0.0);
      expect(status.chamberFanSpeed, 0.0);

      final serialized = status.toJson();
      expect(serialized['chamberTemperature'], 0.0);
      expect(serialized['chamberTargetTemperature'], 0.0);
    });

    test('2.11 copyWith updates every newly added field without altering untouched fields', () {
      final base = PrinterStatusData.fromJson({
        'printerState': 'PRINTING',
        'bedTemperature': 60.0,
        'printSpeed': 100.0,
        'coolingFanSpeed': 0.0,
        'chamberFanSpeed': 0.0,
        'ledState': false,
        'elapsedTimeSeconds': 100,
        'cumulativeFilament': 50.0,
        'cumulativePrintTime': 1000,
      });

      final updated = base.copyWith(
        printSpeed: 140.0,
        coolingFanSpeed: 75.0,
        chamberFanSpeed: 50.0,
        ledState: true,
        elapsedTimeSeconds: 200,
        cumulativeFilament: 150.0,
        cumulativePrintTime: 2000,
      );

      expect(updated.printSpeed, 140.0);
      expect(updated.coolingFanSpeed, 75.0);
      expect(updated.chamberFanSpeed, 50.0);
      expect(updated.ledState, true);
      expect(updated.elapsedTimeSeconds, 200);
      expect(updated.cumulativeFilament, 150.0);
      expect(updated.cumulativePrintTime, 2000);

      // Preserved original fields
      expect(updated.printerState, 'PRINTING');
      expect(updated.bedTemperature, 60.0);
    });

    test('2.12 toJson produces schema-compliant output for all telemetry fields', () {
      const status = PrinterStatusData(
        printerState: 'PRINTING',
        bedTemperature: 65.0,
        bedTargetTemperature: 65.0,
        nozzleTemperature: 220.0,
        nozzleTargetTemperature: 220.0,
        chamberTemperature: 35.0,
        chamberTargetTemperature: 40.0,
        progress: 75.0,
        currentLayer: 150,
        totalLayers: 200,
        printSpeed: 140.0,
        coolingFanSpeed: 50.0,
        chamberFanSpeed: 25.0,
        ledState: true,
        elapsedTimeSeconds: 3600,
        cumulativeFilament: 1250.0,
        cumulativePrintTime: 86400,
        jobName: 'complex_part.gcode',
        timeElapsed: 3600,
        timeRemaining: 1200,
      );

      final json = status.toJson();

      expect(json['printerState'], 'PRINTING');
      expect(json['printSpeed'], 140.0);
      expect(json['coolingFanSpeed'], 50.0);
      expect(json['chamberFanSpeed'], 25.0);
      expect(json['ledState'], true);
      expect(json['elapsedTimeSeconds'], 3600);
      expect(json['cumulativeFilament'], 1250.0);
      expect(json['cumulativePrintTime'], 86400);
      expect(json['chamberTemperature'], 35.0);
      expect(json['chamberTargetTemperature'], 40.0);

      // Roundtrip test
      final roundtrip = PrinterStatusData.fromJson(json);
      expect(roundtrip.printSpeed, 140.0);
      expect(roundtrip.coolingFanSpeed, 50.0);
      expect(roundtrip.chamberFanSpeed, 25.0);
      expect(roundtrip.ledState, true);
      expect(roundtrip.elapsedTimeSeconds, 3600);
      expect(roundtrip.cumulativeFilament, 1250.0);
      expect(roundtrip.cumulativePrintTime, 86400);
    });
  });

  group('Milestone 1 Adversarial Stress Tests: PrinterFeatures', () {
    test('3.1 Empty JSON parses with default feature values and null capabilities', () {
      final features = PrinterFeatures.fromJson(const {});

      expect(features.hasCamera, false);
      expect(features.hasLED, false);
      expect(features.hasFiltration, false);
      expect(features.hasMaterialStation, false);
      expect(features.canPause, true);
      expect(features.canResume, true);
      expect(features.canCancel, true);
      expect(features.ledUsesLegacyAPI, false);
      expect(features.capabilities, isNull);
    });

    test('3.2 Explicit null values in JSON map without exceptions', () {
      final features = PrinterFeatures.fromJson({
        'hasCamera': null,
        'hasLED': null,
        'hasFiltration': null,
        'hasMaterialStation': null,
        'canPause': null,
        'canResume': null,
        'canCancel': null,
        'ledUsesLegacyAPI': null,
        'capabilities': null,
      });

      expect(features.hasCamera, false);
      expect(features.hasLED, false);
      expect(features.hasFiltration, false);
      expect(features.hasMaterialStation, false);
      expect(features.canPause, true);
      expect(features.canResume, true);
      expect(features.canCancel, true);
      expect(features.ledUsesLegacyAPI, false);
      expect(features.capabilities, isNull);
    });

    test('3.3 Nested empty capabilities parses cleanly with network capability defaults', () {
      final features = PrinterFeatures.fromJson({
        'hasCamera': true,
        'capabilities': <String, dynamic>{}, // empty map
      });

      expect(features.hasCamera, true);
      expect(features.capabilities, isNotNull);
      expect(features.capabilities!.canJog, false);
      expect(features.capabilities!.hasBedHeater, true);
      expect(features.capabilities!.maxBedTemp, 100.0);
    });

    test('3.4 copyWith updates capability object and individual feature flags', () {
      const initial = PrinterFeatures(
        hasCamera: false,
        hasLED: false,
        hasFiltration: false,
        hasMaterialStation: false,
        canPause: true,
        canResume: true,
        canCancel: true,
        ledUsesLegacyAPI: false,
      );

      const newCaps = PrinterNetworkCapabilities(
        canJog: true,
        canHome: true,
        hasChamberHeater: true,
      );

      final updated = initial.copyWith(
        hasCamera: true,
        hasLED: true,
        capabilities: newCaps,
      );

      expect(updated.hasCamera, true);
      expect(updated.hasLED, true);
      expect(updated.hasFiltration, false); // preserved
      expect(updated.capabilities, equals(newCaps));
    });

    test('3.5 Value equality operator == and hashCode consistency', () {
      const caps = PrinterNetworkCapabilities(canJog: true);

      const f1 = PrinterFeatures(
        hasCamera: true,
        hasLED: true,
        hasFiltration: false,
        hasMaterialStation: false,
        canPause: true,
        canResume: true,
        canCancel: true,
        ledUsesLegacyAPI: false,
        capabilities: caps,
      );

      const f2 = PrinterFeatures(
        hasCamera: true,
        hasLED: true,
        hasFiltration: false,
        hasMaterialStation: false,
        canPause: true,
        canResume: true,
        canCancel: true,
        ledUsesLegacyAPI: false,
        capabilities: caps,
      );

      final fDifferent = f1.copyWith(hasFiltration: true);

      expect(f1, equals(f2));
      expect(f1.hashCode, equals(f2.hashCode));
      expect(f1 == fDifferent, false);
    });

    test('3.6 toJson includes nested capabilities serialization', () {
      const features = PrinterFeatures(
        hasCamera: true,
        hasLED: true,
        hasFiltration: true,
        hasMaterialStation: true,
        canPause: true,
        canResume: true,
        canCancel: true,
        ledUsesLegacyAPI: false,
        capabilities: PrinterNetworkCapabilities(canJog: true, maxBedTemp: 120.0),
      );

      final json = features.toJson();

      expect(json['hasCamera'], true);
      expect(json['hasFiltration'], true);
      expect(json['capabilities'], isNotNull);
      expect(json['capabilities']['canJog'], true);
      expect(json['capabilities']['maxBedTemp'], 120.0);

      // Roundtrip
      final reconstructed = PrinterFeatures.fromJson(json);
      expect(reconstructed, equals(features));
    });
  });

  group('Milestone 1 Adversarial Stress Tests: Extra & Pathological Payloads', () {
    test('4.1 Unknown keys and metadata in JSON do not cause parse errors', () {
      final json = {
        'printerState': 'PRINTING',
        'extraUnknownKey': 'unrecognized_data',
        'nestedJunk': {'foo': 1, 'bar': [1, 2, 3]},
        'capabilities': {
          'canJog': true,
          'futureProtocolV3Capability': 'supported',
        },
      };

      final status = PrinterStatusData.fromJson(json);
      expect(status.printerState, 'PRINTING');

      final features = PrinterFeatures.fromJson(json);
      expect(features.capabilities?.canJog, true);
    });

    test('4.2 Extreme boundary values (negative, zero, very large numbers)', () {
      final status = PrinterStatusData.fromJson({
        'bedTemperature': -1.0, // faulty thermocouple
        'nozzleTemperature': -999.0,
        'printSpeed': 500.0,
        'currentLayer': -1,
        'cumulativeFilament': 100000000.5,
        'cumulativePrintTime': 2147483647,
      });

      expect(status.bedTemperature, -1.0);
      expect(status.nozzleTemperature, -999.0);
      expect(status.printSpeed, 500.0);
      expect(status.currentLayer, -1);
      expect(status.cumulativeFilament, 100000000.5);
      expect(status.cumulativePrintTime, 2147483647);
    });
  });
}

import React, { useState } from 'react';
import { Thermometer, Layers, Flame, Box } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { TempSetpointModal } from '../modals/TempSetpointModal';

export const TemperatureCard: React.FC = () => {
  const { status, capabilities, setBedTemp, setExtruderTemp, setChamberTemp } = usePrinter();

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    currentVal: number;
    maxTemp: number;
    isExtruder: boolean;
    isChamber?: boolean;
    toolIndex?: number;
  }>({
    isOpen: false,
    title: '',
    currentVal: 0,
    maxTemp: 120,
    isExtruder: false,
    isChamber: false,
  });

  if (!status) {
    return (
      <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-[#262626] rounded w-1/4 mb-4" />
        <div className="h-10 bg-[#262626] rounded w-full mb-3" />
        <div className="h-10 bg-[#262626] rounded w-full" />
      </div>
    );
  }

  const toolTemps = status.toolTemps && status.toolTemps.length > 0 ? status.toolTemps : [status.nozzleTemperature];
  const toolTargets =
    status.toolTargetTemps && status.toolTargetTemps.length > 0
      ? status.toolTargetTemps
      : [status.nozzleTargetTemperature];
  const hasMultipleTools = toolTemps.length > 1;

  const openBedModal = () => {
    setModalConfig({
      isOpen: true,
      title: 'Set Heated Bed Temperature',
      currentVal: status.bedTargetTemperature,
      maxTemp: capabilities?.maxBedTemp || 120,
      isExtruder: false,
      isChamber: false,
    });
  };

  const openExtruderModal = (index: number) => {
    const curTarget = index < toolTargets.length ? toolTargets[index] : status.nozzleTargetTemperature;
    setModalConfig({
      isOpen: true,
      title: hasMultipleTools ? `Set Extruder (T${index}) Temperature` : 'Set Nozzle Temperature',
      currentVal: curTarget,
      maxTemp: capabilities?.maxExtruderTemp || 320,
      isExtruder: true,
      isChamber: false,
      toolIndex: index,
    });
  };

  const openChamberModal = () => {
    setModalConfig({
      isOpen: true,
      title: 'Set Chamber Temperature',
      currentVal: status.chamberTargetTemperature || 0,
      maxTemp: capabilities?.maxChamberTemp || 80,
      isExtruder: false,
      isChamber: true,
    });
  };

  const handleSetTemp = async (target: number) => {
    if (modalConfig.isExtruder) {
      await setExtruderTemp(target, modalConfig.toolIndex ?? 0);
    } else if (modalConfig.isChamber) {
      await setChamberTemp(target);
    } else {
      await setBedTemp(target);
    }
  };

  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 shadow-sm flex flex-col gap-3">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-[#F97316]" />
          <span className="text-sm font-semibold text-[#F3F4F6]">Temperatures</span>
        </div>
        <span className="text-[11px] text-[#94A3B8]">Click any row to adjust</span>
      </div>

      {/* Heated Bed Row */}
      {(capabilities?.hasBedHeater ?? true) && (
        <button
          onClick={openBedModal}
          className="w-full flex items-center justify-between p-2.5 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] transition-all text-left group"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                status.bedTargetTemperature > 0
                  ? 'bg-[#F97316]/20 text-[#F97316]'
                  : 'bg-[#1E1E1E] text-[#94A3B8]'
              }`}
            >
              <Layers size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#F3F4F6] group-hover:text-[#F97316] transition-colors">
                Heated Bed
              </div>
              <div className="text-[11px] text-[#94A3B8]">Target: {status.bedTargetTemperature}°C</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-base sm:text-lg font-bold text-[#F3F4F6] flex items-center justify-end gap-1.5">
              {status.bedTargetTemperature > 0 && status.bedTemperature < status.bedTargetTemperature - 2 && (
                <span className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
              )}
              <span>{Math.round(status.bedTemperature)}°C</span>
            </div>
            <span className="text-[10px] text-[#94A3B8]">
              {status.bedTargetTemperature > 0 ? 'Heating / Ready' : 'Off'}
            </span>
          </div>
        </button>
      )}

      {/* Extruder Rows */}
      {toolTemps.map((temp, idx) => {
        const target = idx < toolTargets.length ? toolTargets[idx] : 0;
        const isT0 = idx === 0;
        const accentColor = isT0 ? '#3B82F6' : '#10B981';
        const label = hasMultipleTools
          ? idx === 0
            ? 'Extruder (T0 Left)'
            : 'Extruder (T1 Right)'
          : 'Extruder / Nozzle';

        return (
          <button
            key={idx}
            onClick={() => openExtruderModal(idx)}
            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: target > 0 ? `${accentColor}25` : '#1E1E1E',
                  color: target > 0 ? accentColor : '#94A3B8',
                }}
              >
                <Flame size={18} />
              </div>
              <div>
                <div
                  className="text-xs font-semibold text-[#F3F4F6] transition-colors"
                  style={{ color: target > 0 ? '#F3F4F6' : undefined }}
                >
                  {label}
                </div>
                <div className="text-[11px] text-[#94A3B8]">Target: {target}°C</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base sm:text-lg font-bold text-[#F3F4F6] flex items-center justify-end gap-1.5">
                {target > 0 && temp < target - 2 && (
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
                )}
                <span>{Math.round(temp)}°C</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">{target > 0 ? 'Heating / Hot' : 'Off'}</span>
            </div>
          </button>
        );
      })}

      {/* Chamber Temperature (if supported) */}
      {(capabilities?.hasChamberHeater ?? (status.chamberTemperature !== undefined && status.chamberTemperature > 0)) && (
        <button
          onClick={openChamberModal}
          className="w-full flex items-center justify-between p-2.5 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] transition-all text-left group"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                (status.chamberTargetTemperature || 0) > 0
                  ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]'
                  : 'bg-[#1E1E1E] text-[#94A3B8]'
              }`}
            >
              <Box size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#F3F4F6] group-hover:text-[#8B5CF6] transition-colors">
                Chamber Heater
              </div>
              <div className="text-[11px] text-[#94A3B8]">
                Target: {status.chamberTargetTemperature || 0}°C
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-base sm:text-lg font-bold text-[#F3F4F6] flex items-center justify-end gap-1.5">
              {(status.chamberTargetTemperature || 0) > 0 &&
                (status.chamberTemperature || 0) < (status.chamberTargetTemperature || 0) - 2 && (
                  <span className="w-2 h-2 rounded-full bg-[#8B5CF6] animate-pulse" />
                )}
              <span>{Math.round(status.chamberTemperature || 0)}°C</span>
            </div>
            <span className="text-[10px] text-[#94A3B8]">
              {(status.chamberTargetTemperature || 0) > 0 ? 'Heating / Ready' : 'Off'}
            </span>
          </div>
        </button>
      )}

      {/* Temp Setpoint Dialog */}
      <TempSetpointModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onSetTemp={handleSetTemp}
        title={modalConfig.title}
        currentVal={modalConfig.currentVal}
        maxTemp={modalConfig.maxTemp}
        isExtruder={modalConfig.isExtruder}
        isChamber={modalConfig.isChamber}
      />
    </div>
  );
};

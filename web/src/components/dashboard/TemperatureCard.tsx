import React, { useState } from 'react';
import { Thermometer, Layers, Flame, Box } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { TempSetpointModal } from '../modals/TempSetpointModal';

export const TemperatureCard: React.FC = () => {
  const { status, capabilities, activeContext, setBedTemp, setExtruderTemp, setChamberTemp } = usePrinter();

  const modelStr = (activeContext?.model || '').toLowerCase();
  const nameStr = (activeContext?.name || '').toLowerCase();
  const isCreator5 =
    modelStr.includes('creator') ||
    nameStr.includes('creator') ||
    (modelStr.includes('ad5x') && nameStr.includes('c5'));

  const hasChamberHeater =
    isCreator5 ||
    (capabilities?.hasChamberHeater ?? (status?.chamberTemperature !== undefined && status.chamberTemperature > 0));

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

  const isMultiHead = hasMultipleTools || isCreator5;

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

  const TOOL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899'];

  const getToolLabel = (idx: number, total: number) => {
    if (isMultiHead || total > 1) return `Head ${idx + 1}`;
    return 'Nozzle';
  };

  const openExtruderModal = (index: number) => {
    const curTarget = index < toolTargets.length ? toolTargets[index] : status.nozzleTargetTemperature;
    const label = getToolLabel(index, toolTemps.length);
    setModalConfig({
      isOpen: true,
      title: `Set ${label} Temperature`,
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
      maxTemp: capabilities?.maxChamberTemp || (isCreator5 ? 80 : 60),
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
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">
      {/* Compact Card Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#2E2E2E]">
        <div className="flex items-center gap-1.5">
          <Thermometer size={15} className="text-[#F97316]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Temperatures</span>
        </div>
        <span className="text-[10px] text-[#64748B]">Tap to set</span>
      </div>

      {/* Compact 2-Column Tile Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Heated Bed Tile */}
        {(capabilities?.hasBedHeater ?? true) && (
          <button
            onClick={openBedModal}
            className="flex items-center justify-between p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] hover:border-[#F97316]/40 transition-all text-left group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  status.bedTargetTemperature > 0
                    ? 'bg-[#F97316]/20 text-[#F97316]'
                    : 'bg-[#1E1E1E] text-[#94A3B8]'
                }`}
              >
                <Layers size={14} />
              </div>
              <span className="text-xs font-semibold text-[#F3F4F6] group-hover:text-[#F97316] transition-colors truncate">
                Bed
              </span>
            </div>

            <div className="flex items-baseline gap-0.5 shrink-0 ml-1">
              {status.bedTargetTemperature > 0 && status.bedTemperature < status.bedTargetTemperature - 2 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] animate-pulse mr-1 self-center" />
              )}
              <span className="text-sm font-bold text-[#F3F4F6]">{Math.round(status.bedTemperature)}°</span>
              <span className="text-[11px] text-[#94A3B8]">/{status.bedTargetTemperature}°</span>
            </div>
          </button>
        )}

        {/* Chamber Heater Tile (if supported) */}
        {hasChamberHeater && (
          <button
            onClick={openChamberModal}
            className="flex items-center justify-between p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] hover:border-[#8B5CF6]/40 transition-all text-left group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  (status.chamberTargetTemperature || 0) > 0
                    ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]'
                    : 'bg-[#1E1E1E] text-[#94A3B8]'
                }`}
              >
                <Box size={14} />
              </div>
              <span className="text-xs font-semibold text-[#F3F4F6] group-hover:text-[#8B5CF6] transition-colors truncate">
                Chamber
              </span>
            </div>

            <div className="flex items-baseline gap-0.5 shrink-0 ml-1">
              {(status.chamberTargetTemperature || 0) > 0 &&
                (status.chamberTemperature || 0) < (status.chamberTargetTemperature || 0) - 2 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse mr-1 self-center" />
                )}
              <span className="text-sm font-bold text-[#F3F4F6]">{Math.round(status.chamberTemperature || 0)}°</span>
              <span className="text-[11px] text-[#94A3B8]">/{status.chamberTargetTemperature || 0}°</span>
            </div>
          </button>
        )}

        {/* Extruder Tiles (T0..Tn) */}
        {toolTemps.map((temp, idx) => {
          const target = idx < toolTargets.length ? toolTargets[idx] : 0;
          const accentColor = TOOL_COLORS[idx % TOOL_COLORS.length];
          const label = getToolLabel(idx, toolTemps.length);

          return (
            <button
              key={idx}
              onClick={() => openExtruderModal(idx)}
              className="flex items-center justify-between p-2 rounded-lg bg-[#262626]/60 hover:bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] transition-all text-left group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: target > 0 ? `${accentColor}25` : '#1E1E1E',
                    color: target > 0 ? accentColor : '#94A3B8',
                  }}
                >
                  <Flame size={14} />
                </div>
                <span className="text-xs font-semibold text-[#F3F4F6] truncate">{label}</span>
              </div>

              <div className="flex items-baseline gap-0.5 shrink-0 ml-1">
                {target > 0 && temp < target - 2 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse mr-1 self-center"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
                <span className="text-sm font-bold text-[#F3F4F6]">{Math.round(temp)}°</span>
                <span className="text-[11px] text-[#94A3B8]">/{target}°</span>
              </div>
            </button>
          );
        })}
      </div>

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

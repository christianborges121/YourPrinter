import React, { useState, useEffect } from 'react';
import { Sliders, Move, Home, Wind, Fan, Gauge } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { LedToggleButton } from '../common/LedToggleButton';
import { JogModal } from '../modals/JogModal';

export const ControlPanelCard: React.FC = () => {
  const { status, features, capabilities, activeContext, homeAxes, setFiltration, setCoolingFanSpeed, setPrintSpeed } = usePrinter();
  const [jogModalOpen, setJogModalOpen] = useState(false);
  const [isHoming, setIsHoming] = useState(false);
  const [fanSpeed, setFanSpeed] = useState<number>(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(100);
  const [selectedFiltration, setSelectedFiltration] = useState<'off' | 'internal' | 'external' | null>(null);

  const stateStr = status?.printerState || '';
  const isPrinting = /print|busy|running/i.test(stateStr);

  const modelStr = (activeContext?.model || '').toLowerCase();
  const nameStr = (activeContext?.name || '').toLowerCase();
  const isCreator5 =
    modelStr.includes('creator') ||
    nameStr.includes('creator') ||
    (modelStr.includes('ad5x') && nameStr.includes('c5'));

  // Pin hardware capabilities for Creator 5 Pro to avoid options jumping/flickering
  const canJog = isCreator5 ? false : capabilities ? capabilities.canJog : false;
  const canHome = isCreator5 ? false : capabilities ? capabilities.canHome : false;
  const hasPartCoolingFan = isCreator5 ? true : (capabilities?.hasPartCoolingFan ?? true);
  const hasFiltration = isCreator5 ? true : (capabilities ? capabilities.hasFiltration : (features?.hasFiltration ?? false));

  const activeFiltration =
    selectedFiltration ?? (status?.filtrationMode === 'none' || !status?.filtrationMode ? 'off' : status.filtrationMode);

  // Sync filtration mode if provided in telemetry
  useEffect(() => {
    if (status?.filtrationMode) {
      setSelectedFiltration(status.filtrationMode === 'none' ? 'off' : status.filtrationMode);
    }
  }, [status?.filtrationMode]);

  // Sync fan speed if provided in telemetry
  useEffect(() => {
    if (typeof status?.coolingFanSpeed === 'number') {
      setFanSpeed(Math.round(status.coolingFanSpeed));
    } else if (typeof status?.fanSpeed === 'number') {
      setFanSpeed(Math.round(status.fanSpeed));
    }
  }, [status?.coolingFanSpeed, status?.fanSpeed]);

  // Sync print speed if provided in telemetry
  useEffect(() => {
    if (typeof status?.printSpeed === 'number' && status.printSpeed > 0) {
      setCurrentSpeed(Math.round(status.printSpeed));
    }
  }, [status?.printSpeed]);

  const handleSpeedChange = async (target: number) => {
    setCurrentSpeed(target);
    await setPrintSpeed(target);
  };

  const handleHome = async () => {
    if (isPrinting || isHoming) return;
    setIsHoming(true);
    try {
      await homeAxes();
    } finally {
      setTimeout(() => setIsHoming(false), 2000);
    }
  };

  const handleFanSpeedChange = (speed: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(speed)));
    setFanSpeed(clamped);
    setCoolingFanSpeed(clamped);
  };

  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-3.5 shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#2E2E2E]">
        <div className="flex items-center gap-1.5">
          <Sliders size={15} className="text-[#3B82F6]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Hardware Controls</span>
        </div>

        {/* Single Chamber Lightbulb Icon Toggle */}
        <LedToggleButton />
      </div>

      {/* Button Grid: Axes / Jog & Home All (only when supported) */}
      {(canJog || canHome) && (
        <div className="grid grid-cols-2 gap-2">
          {/* Jog / Movement */}
          <button
            onClick={() => setJogModalOpen(true)}
            disabled={isPrinting || !canJog}
            title={!canJog ? 'Jogging not supported over network on this model' : undefined}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#F3F4F6] transition-all disabled:opacity-40"
          >
            <Move size={14} className={canJog ? 'text-[#00AE42]' : 'text-[#64748B]'} />
            <span>{!canJog ? 'Jog (No LAN)' : isPrinting ? 'Jog (Busy)' : 'Axes / Jog'}</span>
          </button>

          {/* Home All Axes */}
          <button
            onClick={handleHome}
            disabled={isPrinting || isHoming || !canHome}
            title={!canHome ? 'Homing not supported over network on this model' : undefined}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#F3F4F6] transition-all disabled:opacity-40"
          >
            <Home size={14} className={isHoming ? 'animate-spin text-[#00AE42]' : (canHome ? 'text-[#00AE42]' : 'text-[#64748B]')} />
            <span>{!canHome ? 'Home (No LAN)' : isHoming ? 'Homing...' : 'Home All'}</span>
          </button>
        </div>
      )}

      {/* Part Cooling Fan Speed */}
      {hasPartCoolingFan && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Fan size={14} className={fanSpeed > 0 ? 'text-[#00AE42] animate-spin' : 'text-[#94A3B8]'} style={{ animationDuration: fanSpeed > 50 ? '1s' : '2.5s' }} />
              Part Cooling Fan
            </span>
            <span className={`text-[11px] font-mono font-bold ${fanSpeed > 0 ? 'text-[#00AE42]' : 'text-[#94A3B8]'}`}>
              {fanSpeed}%
            </span>
          </div>

          {/* Slider */}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={fanSpeed}
              onChange={(e) => handleFanSpeedChange(Number(e.target.value))}
              className="w-full h-1.5 bg-[#1E1E1E] rounded-lg appearance-none cursor-pointer accent-[#00AE42]"
            />
          </div>

          {/* Preset Chips */}
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 25, 50, 75, 100].map((preset) => {
              const isSelected = fanSpeed === preset;
              return (
                <button
                  key={preset}
                  onClick={() => handleFanSpeedChange(preset)}
                  className={`py-1 rounded text-[11px] font-semibold border transition-all ${
                    isSelected
                      ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42]'
                      : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6] hover:border-[#383838]'
                  }`}
                >
                  {preset === 0 ? 'Off' : `${preset}%`}
                </button>
              );
            })}
          </div>

          {/* Idle notice for printers with firmware active-print fan interlocks */}
          {fanSpeed > 0 && (status?.printerState === 'ready' || status?.printerState === 'idle') && (
            <p className="text-[10px] text-[#94A3B8] italic mt-0.5">
              Note: Toolhead fans engage when a print job starts.
            </p>
          )}
        </div>
      )}

      {/* Print Speed Rate Control */}
      {(capabilities?.canAdjustSpeed ?? true) && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Gauge size={14} className="text-[#F59E0B]" />
              Print Speed Rate
            </span>
            <span className="text-[11px] font-mono font-bold text-[#F59E0B]">
              {currentSpeed}%
              <span className="text-[10px] text-[#94A3B8] font-normal ml-1">
                ({currentSpeed <= 70 ? 'Quiet' : currentSpeed <= 120 ? 'Standard' : 'Sport'})
              </span>
            </span>
          </div>

          {/* Speed Preset Chips: 50% Quiet, 100% Standard, 140% Sport (Single-line) */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { percent: 50, label: 'Quiet', desc: '50%' },
              { percent: 100, label: 'Standard', desc: '100%' },
              { percent: 140, label: 'Sport', desc: '140%' },
            ].map(({ percent, label, desc }) => {
              const isSelected = Math.abs(currentSpeed - percent) < 10;
              return (
                <button
                  key={percent}
                  onClick={() => handleSpeedChange(percent)}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B] shadow-sm'
                      : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#D1D5DB] hover:text-[#F3F4F6] hover:border-[#383838]'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[10px] opacity-75">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Air Filtration Fan */}
      {hasFiltration && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Wind size={14} className="text-[#3B82F6]" />
              Air Filtration Fan
            </span>
            <span className="text-[11px] text-[#94A3B8] capitalize font-medium">
              Mode: {activeFiltration}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-0.5">
            {([
              { mode: 'off', label: 'Off' },
              { mode: 'internal', label: 'Internal' },
              { mode: 'external', label: 'External' },
            ] as const).map(({ mode, label }) => {
              const isSelected = activeFiltration === mode;
              return (
                <button
                  key={mode}
                  onClick={() => {
                    setSelectedFiltration(mode);
                    void setFiltration(mode);
                  }}
                  className={`flex items-center justify-center py-1.5 px-2 rounded-md border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42] shadow-sm'
                      : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#D1D5DB] hover:border-[#383838]'
                  }`}
                >
                  <span className="capitalize">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Jog Modal */}
      <JogModal isOpen={jogModalOpen} onClose={() => setJogModalOpen(false)} />
    </div>
  );
};

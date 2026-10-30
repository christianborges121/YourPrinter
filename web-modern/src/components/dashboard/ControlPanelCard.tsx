import React, { useState, useEffect } from 'react';
import { Sliders, Move, Home, Lightbulb, Wind, Fan, Thermometer } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { JogModal } from '../modals/JogModal';

export const ControlPanelCard: React.FC = () => {
  const { status, features, capabilities, homeAxes, setLed, setFiltration, setCoolingFanSpeed } = usePrinter();
  const [jogModalOpen, setJogModalOpen] = useState(false);
  const [ledState, setLedState] = useState(true);
  const [isHoming, setIsHoming] = useState(false);
  const [fanSpeed, setFanSpeed] = useState<number>(0);
  const [selectedFiltration, setSelectedFiltration] = useState<'off' | 'internal' | 'external' | null>(null);

  const stateStr = status?.printerState || '';
  const isPrinting = /print|busy|running/i.test(stateStr);
  const canJog = capabilities ? capabilities.canJog : true;
  const canHome = capabilities ? capabilities.canHome : true;

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

  // Sync LED state if provided in telemetry
  useEffect(() => {
    if (typeof status?.ledState === 'boolean') {
      setLedState(status.ledState);
    }
  }, [status?.ledState]);

  const handleToggleLed = async () => {
    const next = !ledState;
    setLedState(next);
    await setLed(next);
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
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-[#3B82F6]" />
          <span className="text-sm font-semibold text-[#F3F4F6]">Hardware Controls</span>
        </div>

        {/* Chamber Temperature display if available */}
        {status?.chamberTemperature !== undefined && status.chamberTemperature > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 text-[11px] font-semibold text-[#A78BFA]">
            <Thermometer size={12} className="text-[#8B5CF6]" />
            <span>Chamber: {Math.round(status.chamberTemperature)}°C</span>
            {status.chamberTargetTemperature && status.chamberTargetTemperature > 0 && (
              <span className="text-[#C4B5FD]">/ {status.chamberTargetTemperature}°C</span>
            )}
          </div>
        )}
      </div>

      {/* Button Grid: Axes / Jog & Home All */}
      <div className="grid grid-cols-2 gap-3">
        {/* Jog / Movement */}
        <button
          onClick={() => setJogModalOpen(true)}
          disabled={isPrinting || !canJog}
          title={!canJog ? 'Jogging not supported over network on this model' : undefined}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#F3F4F6] transition-all disabled:opacity-40"
        >
          <Move size={15} className={canJog ? 'text-[#00AE42]' : 'text-[#64748B]'} />
          <span>{!canJog ? 'Jog (No LAN)' : isPrinting ? 'Jog (Busy)' : 'Axes / Jog'}</span>
        </button>

        {/* Home All Axes */}
        <button
          onClick={handleHome}
          disabled={isPrinting || isHoming || !canHome}
          title={!canHome ? 'Homing not supported over network on this model' : undefined}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#F3F4F6] transition-all disabled:opacity-40"
        >
          <Home size={15} className={isHoming ? 'animate-spin text-[#00AE42]' : (canHome ? 'text-[#00AE42]' : 'text-[#64748B]')} />
          <span>{!canHome ? 'Home (No LAN)' : isHoming ? 'Homing...' : 'Home All'}</span>
        </button>
      </div>

      {/* Part Cooling Fan Speed */}
      {(capabilities?.hasPartCoolingFan ?? true) && (
        <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Fan size={15} className={fanSpeed > 0 ? 'text-[#00AE42] animate-spin' : 'text-[#94A3B8]'} style={{ animationDuration: fanSpeed > 50 ? '1s' : '2.5s' }} />
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

      {/* Air Filtration Fan */}
      {(capabilities ? capabilities.hasFiltration : (features?.hasFiltration ?? false)) && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Wind size={15} className="text-[#3B82F6]" />
              Air Filtration Fan
            </span>
            <span className="text-[11px] text-[#94A3B8] capitalize font-medium">
              Mode: {activeFiltration}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-1">
            {([
              { mode: 'off', label: 'Off', desc: 'Inactive' },
              { mode: 'internal', label: 'Internal', desc: 'VOC Scrub' },
              { mode: 'external', label: 'External', desc: 'Exhaust' },
            ] as const).map(({ mode, label, desc }) => {
              const isSelected = activeFiltration === mode;
              return (
                <button
                  key={mode}
                  onClick={() => {
                    setSelectedFiltration(mode);
                    void setFiltration(mode);
                  }}
                  className={`flex flex-col items-center py-1.5 px-1.5 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42] shadow-sm'
                      : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#D1D5DB] hover:border-[#383838]'
                  }`}
                >
                  <span className="text-xs font-semibold capitalize">{label}</span>
                  <span className="text-[9px] text-[#94A3B8] mt-0.5">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* LED Light Switch */}
      {(capabilities?.hasLedControl ?? (features?.hasLED ?? true)) && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center gap-2.5">
            <Lightbulb
              size={18}
              className={ledState ? 'text-[#F59E0B]' : 'text-[#94A3B8]'}
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[#F3F4F6]">Chamber Lighting</span>
              <span className="text-[11px] text-[#94A3B8]">
                {ledState ? 'LEDs Active' : 'LEDs Disabled'}
              </span>
            </div>
          </div>

          <button
            onClick={handleToggleLed}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 ${
              ledState ? 'bg-[#00AE42]' : 'bg-[#383838]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                ledState ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Jog Modal */}
      <JogModal isOpen={jogModalOpen} onClose={() => setJogModalOpen(false)} />
    </div>
  );
};

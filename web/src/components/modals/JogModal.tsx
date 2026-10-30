import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Move,
  ArrowUp,
  ArrowDown,
  Disc,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { usePrinter } from '../../context/PrinterContext';

interface JogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JogModal: React.FC<JogModalProps> = ({ isOpen, onClose }) => {
  const { activeContext, jogAxis, homeAxes, homeSpecific, extrudeFilament, retractFilament, status } = usePrinter();
  const [stepSize, setStepSize] = useState<number>(10.0);
  const [homing, setHoming] = useState<string | null>(null);

  const stateStr = status?.printerState || '';
  const isPrinting = /print|busy|running/i.test(stateStr);

  const nozzleTemp = status?.nozzleTemperature ?? 0;
  const isHotEnough = nozzleTemp >= 170;

  const handleJog = (axis: string, dist: number) => {
    if (isPrinting) return;
    jogAxis(axis, dist);
  };

  const handleHome = async (type: 'all' | 'xy' | 'z') => {
    if (isPrinting || homing) return;
    setHoming(type);
    try {
      if (type === 'all') {
        await homeAxes();
      } else {
        homeSpecific(type);
      }
    } finally {
      setTimeout(() => setHoming(null), 2000);
    }
  };

  const steps = [0.1, 1.0, 10.0, 50.0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Move size={18} className="text-[#00AE42]" />
          <span>Manual Jog & Extruder ({activeContext?.name || 'Printer'})</span>
        </span>
      }
      maxWidth="max-w-md"
      isBottomSheet={true}
    >
      <div className="flex flex-col gap-5">
        {/* Step Size Selector Chips */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2E2E2E]">
          <span className="text-xs text-[#94A3B8] font-medium">Step Distance:</span>
          <div className="flex items-center gap-1.5">
            {steps.map((s) => (
              <button
                key={s}
                onClick={() => setStepSize(s)}
                className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all ${
                  stepSize === s
                    ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42]'
                    : 'bg-[#262626] border-[#2E2E2E] text-[#D1D5DB] hover:border-[#383838]'
                }`}
              >
                {s >= 1 ? `${s}mm` : `${s}mm`}
              </button>
            ))}
          </div>
        </div>

        {/* Jog Pad Grid: Left XY D-pad, Right Z-axis Column */}
        <div className="grid grid-cols-2 gap-4 items-center">
          {/* XY D-Pad */}
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-semibold text-[#94A3B8] uppercase mb-2">XY Axes</span>

            {/* Y+ (Back) */}
            <button
              onClick={() => handleJog('Y', stepSize)}
              disabled={isPrinting}
              className="w-12 h-12 rounded-xl bg-[#262626] border border-[#2E2E2E] hover:border-[#00AE42] hover:bg-[#383838] flex items-center justify-center text-[#F3F4F6] shadow-sm transition-all active:scale-95 disabled:opacity-40"
              title={`Y+ (+${stepSize}mm)`}
            >
              <ChevronUp size={22} />
            </button>

            {/* X- Center X+ */}
            <div className="flex items-center gap-2 my-1">
              <button
                onClick={() => handleJog('X', -stepSize)}
                disabled={isPrinting}
                className="w-12 h-12 rounded-xl bg-[#262626] border border-[#2E2E2E] hover:border-[#00AE42] hover:bg-[#383838] flex items-center justify-center text-[#F3F4F6] shadow-sm transition-all active:scale-95 disabled:opacity-40"
                title={`X- (-${stepSize}mm)`}
              >
                <ChevronLeft size={22} />
              </button>

              <div className="w-10 h-10 rounded-lg bg-[#1E1E1E] flex items-center justify-center text-xs font-bold text-[#94A3B8]">
                XY
              </div>

              <button
                onClick={() => handleJog('X', stepSize)}
                disabled={isPrinting}
                className="w-12 h-12 rounded-xl bg-[#262626] border border-[#2E2E2E] hover:border-[#00AE42] hover:bg-[#383838] flex items-center justify-center text-[#F3F4F6] shadow-sm transition-all active:scale-95 disabled:opacity-40"
                title={`X+ (+${stepSize}mm)`}
              >
                <ChevronRight size={22} />
              </button>
            </div>

            {/* Y- (Front) */}
            <button
              onClick={() => handleJog('Y', -stepSize)}
              disabled={isPrinting}
              className="w-12 h-12 rounded-xl bg-[#262626] border border-[#2E2E2E] hover:border-[#00AE42] hover:bg-[#383838] flex items-center justify-center text-[#F3F4F6] shadow-sm transition-all active:scale-95 disabled:opacity-40"
              title={`Y- (-${stepSize}mm)`}
            >
              <ChevronDown size={22} />
            </button>
          </div>

          {/* Z-Axis Column */}
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-semibold text-[#94A3B8] uppercase mb-2">Z Axis (Bed)</span>

            {/* Z- (Bed Up / Nozzle Closer) */}
            <button
              onClick={() => handleJog('Z', -stepSize)}
              disabled={isPrinting}
              className="w-28 h-11 rounded-xl bg-[#262626] border border-[#2E2E2E] hover:border-[#00AE42] hover:bg-[#383838] flex items-center justify-center gap-1.5 text-xs font-semibold text-[#F3F4F6] shadow-sm transition-all active:scale-95 disabled:opacity-40"
              title={`Z- (-${stepSize}mm)`}
            >
              <ArrowUp size={16} className="text-[#00AE42]" />
              <span>Z - ({stepSize}mm)</span>
            </button>

            <div className="h-6 flex items-center text-[10px] text-[#94A3B8] font-mono">Bed Elevation</div>

            {/* Z+ (Bed Down / Nozzle Away) */}
            <button
              onClick={() => handleJog('Z', stepSize)}
              disabled={isPrinting}
              className="w-28 h-11 rounded-xl bg-[#262626] border border-[#2E2E2E] hover:border-[#00AE42] hover:bg-[#383838] flex items-center justify-center gap-1.5 text-xs font-semibold text-[#F3F4F6] shadow-sm transition-all active:scale-95 disabled:opacity-40"
              title={`Z+ (+${stepSize}mm)`}
            >
              <ArrowDown size={16} className="text-[#3B82F6]" />
              <span>Z + ({stepSize}mm)</span>
            </button>
          </div>
        </div>

        {/* Extruder Feed Section */}
        <div className="pt-3 border-t border-[#2E2E2E] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Disc size={14} className="text-[#F59E0B]" />
              <span>Extruder Motor</span>
            </span>
            <span
              className={`text-[11px] font-mono font-medium ${
                isHotEnough ? 'text-[#00AE42]' : 'text-[#EF4444]'
              }`}
            >
              Nozzle: {nozzleTemp.toFixed(0)}°C {isHotEnough ? '✓' : '(Cold)'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => extrudeFilament(10)}
              disabled={isPrinting || !isHotEnough}
              className="py-2 px-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#00AE42] text-xs font-semibold text-[#D1D5DB] transition-all disabled:opacity-40"
              title="Extrude 10mm"
            >
              +10mm
            </button>
            <button
              onClick={() => extrudeFilament(50)}
              disabled={isPrinting || !isHotEnough}
              className="py-2 px-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#00AE42] text-xs font-semibold text-[#D1D5DB] transition-all disabled:opacity-40"
              title="Extrude 50mm"
            >
              +50mm
            </button>
            <button
              onClick={() => retractFilament(10)}
              disabled={isPrinting || !isHotEnough}
              className="py-2 px-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#F59E0B] text-xs font-semibold text-[#D1D5DB] transition-all disabled:opacity-40"
              title="Retract 10mm"
            >
              -10mm
            </button>
            <button
              onClick={() => retractFilament(50)}
              disabled={isPrinting || !isHotEnough}
              className="py-2 px-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] hover:border-[#F59E0B] text-xs font-semibold text-[#D1D5DB] transition-all disabled:opacity-40"
              title="Retract 50mm"
            >
              -50mm
            </button>
          </div>

          {!isHotEnough && (
            <p className="text-[10px] text-[#94A3B8] flex items-center gap-1">
              <AlertTriangle size={12} className="text-[#F59E0B]" />
              <span>Extrusion is safety-locked below 170°C to prevent cold jams.</span>
            </p>
          )}
        </div>

        {/* Homing Actions Row */}
        <div className="pt-3 border-t border-[#2E2E2E] flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-[#94A3B8] uppercase">Axis Homing</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleHome('xy')}
              disabled={isPrinting || homing !== null}
              className="py-2 rounded-xl bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-xs font-semibold text-[#F3F4F6] transition-all disabled:opacity-40"
            >
              {homing === 'xy' ? 'Homing...' : 'Home XY'}
            </button>
            <button
              onClick={() => handleHome('z')}
              disabled={isPrinting || homing !== null}
              className="py-2 rounded-xl bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-xs font-semibold text-[#F3F4F6] transition-all disabled:opacity-40"
            >
              {homing === 'z' ? 'Homing...' : 'Home Z'}
            </button>
            <button
              onClick={() => handleHome('all')}
              disabled={isPrinting || homing !== null}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#00AE42]/15 hover:bg-[#00AE42]/25 border border-[#00AE42]/40 text-xs font-semibold text-[#00AE42] transition-all disabled:opacity-40"
            >
              <Home size={14} className={homing === 'all' ? 'animate-spin' : ''} />
              <span>{homing === 'all' ? 'Homing...' : 'Home All'}</span>
            </button>
          </div>
        </div>

        {isPrinting && (
          <p className="text-[11px] text-[#EF4444] text-center font-medium">
            Axis motion controls are disabled during active print execution.
          </p>
        )}
      </div>
    </Modal>
  );
};

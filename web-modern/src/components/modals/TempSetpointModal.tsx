import React, { useState, useEffect } from 'react';
import { Thermometer } from 'lucide-react';
import { Modal } from '../common/Modal';

interface TempSetpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetTemp: (temp: number) => Promise<void>;
  title: string;
  currentVal: number;
  maxTemp?: number;
  isExtruder?: boolean;
  isChamber?: boolean;
}

export const TempSetpointModal: React.FC<TempSetpointModalProps> = ({
  isOpen,
  onClose,
  onSetTemp,
  title,
  currentVal,
  maxTemp = 300,
  isExtruder = false,
  isChamber = false,
}) => {
  const [val, setVal] = useState<string>(currentVal > 0 ? String(Math.round(currentVal)) : '0');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setVal(currentVal > 0 ? String(Math.round(currentVal)) : '0');
    }
  }, [isOpen, currentVal]);

  const presets = isExtruder
    ? [
        { label: 'Off (0°C)', temp: 0 },
        { label: 'PLA (210°C)', temp: 210 },
        { label: 'PETG (240°C)', temp: 240 },
        { label: 'ABS (260°C)', temp: 260 },
      ]
    : isChamber
    ? [
        { label: 'Off (0°C)', temp: 0 },
        { label: '40°C', temp: 40 },
        { label: '50°C', temp: 50 },
        { label: '60°C', temp: 60 },
      ]
    : [
        { label: 'Off (0°C)', temp: 0 },
        { label: 'PLA (60°C)', temp: 60 },
        { label: 'PETG (70°C)', temp: 70 },
        { label: 'ABS (100°C)', temp: 100 },
      ];

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= maxTemp) {
      setIsSubmitting(true);
      try {
        await onSetTemp(num);
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Thermometer size={18} className="text-[#F97316]" />
          {title}
        </span>
      }
      maxWidth="max-w-sm"
      isBottomSheet={true}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Number Input with quick +/- buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVal((prev) => String(Math.max(0, (parseInt(prev) || 0) - 5)))}
            className="w-10 h-10 rounded-lg bg-[#262626] border border-[#2E2E2E] text-[#F3F4F6] font-bold text-lg hover:bg-[#383838] transition-colors"
          >
            -
          </button>

          <div className="relative flex-1">
            <input
              type="number"
              min={0}
              max={maxTemp}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3 py-2 text-center text-xl font-bold text-[#F3F4F6] outline-none"
              placeholder="0"
              autoFocus
            />
            <span className="absolute right-3 top-2.5 text-xs text-[#94A3B8] font-bold">°C</span>
          </div>

          <button
            type="button"
            onClick={() => setVal((prev) => String(Math.min(maxTemp, (parseInt(prev) || 0) + 5)))}
            className="w-10 h-10 rounded-lg bg-[#262626] border border-[#2E2E2E] text-[#F3F4F6] font-bold text-lg hover:bg-[#383838] transition-colors"
          >
            +
          </button>
        </div>

        {/* Preset Chips */}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setVal(String(p.temp))}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                val === String(p.temp)
                  ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42]'
                  : 'bg-[#262626] border-[#2E2E2E] text-[#D1D5DB] hover:border-[#383838]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#2E2E2E]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[#D1D5DB] bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-[#00AE42] hover:bg-[#009638] shadow-md transition-colors"
          >
            Set Target
          </button>
        </div>
      </form>
    </Modal>
  );
};

import React from 'react';
import { Cpu, Activity, Wifi, Info, Clock, Scale } from 'lucide-react';
import { Modal } from '../common/Modal';
import { usePrinter } from '../../context/PrinterContext';

interface DeviceInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceInfoModal: React.FC<DeviceInfoModalProps> = ({ isOpen, onClose }) => {
  const { activeContext, status, serverConnected } = usePrinter();

  const formatLifetimeTime = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '0h 0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const formatFilament = (meters?: number): string => {
    if (!meters || meters <= 0) return '0.0 m';
    return `${meters.toFixed(1)} m`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Info size={18} className="text-[#00AE42]" />
          <span>Device Information ({activeContext?.name || 'Printer'})</span>
        </span>
      }
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-4">
        {/* Card 1: Hardware & Device Status */}
        <div className="p-4 rounded-xl bg-[#262626]/70 border border-[#2E2E2E] flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#2E2E2E]">
            <Cpu size={16} className="text-[#00AE42]" />
            <h4 className="text-xs font-bold text-[#F3F4F6] uppercase tracking-wider">
              Hardware & Device
            </h4>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8]">Printer Model</span>
              <span className="font-semibold text-[#F3F4F6]">{activeContext?.model || 'FlashForge / Bambu'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8]">Assigned Name</span>
              <span className="font-semibold text-[#F3F4F6]">{activeContext?.name || '--'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8]">Operational State</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00AE42]/15 text-[#00AE42] border border-[#00AE42]/30">
                {status?.printerState || 'Ready'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Lifetime Telemetry */}
        <div className="p-4 rounded-xl bg-[#262626]/70 border border-[#2E2E2E] flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#2E2E2E]">
            <Activity size={16} className="text-[#F59E0B]" />
            <h4 className="text-xs font-bold text-[#F3F4F6] uppercase tracking-wider">
              Lifetime Statistics
            </h4>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#1E1E1E] rounded-lg border border-[#2E2E2E] flex flex-col gap-1">
              <span className="text-[11px] text-[#94A3B8] flex items-center gap-1">
                <Clock size={12} className="text-[#00AE42]" /> Total Print Time
              </span>
              <span className="text-base font-bold font-mono text-[#F3F4F6]">
                {formatLifetimeTime(status?.cumulativePrintTime)}
              </span>
            </div>

            <div className="p-3 bg-[#1E1E1E] rounded-lg border border-[#2E2E2E] flex flex-col gap-1">
              <span className="text-[11px] text-[#94A3B8] flex items-center gap-1">
                <Scale size={12} className="text-[#3B82F6]" /> Filament Extruded
              </span>
              <span className="text-base font-bold font-mono text-[#F3F4F6]">
                {formatFilament(status?.cumulativeFilament)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Network & Connectivity */}
        <div className="p-4 rounded-xl bg-[#262626]/70 border border-[#2E2E2E] flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#2E2E2E]">
            <Wifi size={16} className="text-[#3B82F6]" />
            <h4 className="text-xs font-bold text-[#F3F4F6] uppercase tracking-wider">
              Network & Connection
            </h4>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8]">IP Address</span>
              <span className="font-mono text-[#F3F4F6]">
                {activeContext?.printerDetails?.ipAddress || '--'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8]">WebSocket Stream</span>
              <span className={`font-semibold ${serverConnected ? 'text-[#00AE42]' : 'text-[#EF4444]'}`}>
                {serverConnected ? 'Connected (Live)' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Close Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#262626] hover:bg-[#333333] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#D1D5DB] hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

import React from 'react';
import { AlertOctagon, Eye, Play, XCircle } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';

interface WatchdogAlertBannerProps {
  onInspect: () => void;
}

export const WatchdogAlertBanner: React.FC<WatchdogAlertBannerProps> = ({ onInspect }) => {
  const { status, resumePrint, cancelPrint } = usePrinter();
  const watchdog = status?.watchdog;

  if (!watchdog || !watchdog.auto_pause_triggered) {
    return null;
  }

  const confidencePct = Math.round((watchdog.confidence || 0) * 100);

  return (
    <div className="w-full bg-[#EF4444]/15 border-2 border-[#EF4444] rounded-xl p-4 shadow-[0_0_20px_rgba(239,68,68,0.25)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse-subtle">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-[#EF4444] text-white shrink-0 mt-0.5 sm:mt-0">
          <AlertOctagon size={24} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm sm:text-base text-white">
              AI WATCHDOG: DEFECT DETECTED & PRINT AUTO-PAUSED!
            </span>
            <span className="bg-[#EF4444] text-white font-mono text-xs px-2 py-0.5 rounded font-bold">
              {confidencePct}% Risk
            </span>
          </div>
          <p className="text-xs text-[#D1D5DB] mt-1 leading-relaxed">
            Spaghetti / layer detachment defect was confirmed by Darknet YOLO ({watchdog.consecutive_failures} consecutive failure frames). The print head was parked safely.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        <button
          onClick={onInspect}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#EF4444]/50 text-xs font-semibold text-white transition-colors"
        >
          <Eye size={14} className="text-[#3B82F6]" />
          <span>Inspect Snapshot</span>
        </button>

        <button
          onClick={() => resumePrint()}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-md transition-colors"
        >
          <Play size={14} />
          <span>Resume Print</span>
        </button>

        <button
          onClick={() => cancelPrint()}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-xs font-semibold text-white shadow-md transition-colors"
        >
          <XCircle size={14} />
          <span>Abort Job</span>
        </button>
      </div>
    </div>
  );
};

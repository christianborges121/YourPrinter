import React, { useState } from 'react';
import { AlertOctagon, Eye, Play, XCircle, CheckCircle, X } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';

interface WatchdogAlertBannerProps {
  onInspect: () => void;
}

export const WatchdogAlertBanner: React.FC<WatchdogAlertBannerProps> = ({ onInspect }) => {
  const { status, resumePrint, cancelPrint, dismissWatchdogAlert } = usePrinter();
  const watchdog = status?.watchdog;
  const [isLocallyDismissed, setIsLocallyDismissed] = useState(false);

  if (!watchdog || !watchdog.auto_pause_triggered || isLocallyDismissed) {
    return null;
  }

  const confidencePct = Math.round((watchdog.confidence || 0) * 100);
  const stateStr = status?.printerState || '';
  const isPrinting = /print|busy|running/i.test(stateStr);

  const handleDismiss = async () => {
    setIsLocallyDismissed(true);
    await dismissWatchdogAlert();
  };

  const handleResume = async () => {
    setIsLocallyDismissed(true);
    await resumePrint();
  };

  return (
    <div className="relative w-full bg-[#EF4444]/15 border-2 border-[#EF4444] rounded-xl p-4 shadow-[0_0_20px_rgba(239,68,68,0.25)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse-subtle">
      {/* Top right quick-dismiss X */}
      <button
        onClick={handleDismiss}
        className="absolute top-2.5 right-2.5 p-1 rounded-md text-[#94A3B8] hover:text-white hover:bg-white/10 transition-colors"
        title="Dismiss Alert Banner"
        aria-label="Dismiss Alert"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-6 sm:pr-0">
        <div className="p-2 rounded-lg bg-[#EF4444] text-white shrink-0 mt-0.5 sm:mt-0">
          <AlertOctagon size={24} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm sm:text-base text-white">
              {isPrinting
                ? 'AI WATCHDOG: DEFECT ALERT (PRINT ACTIVE)'
                : 'AI WATCHDOG: DEFECT DETECTED & PRINT AUTO-PAUSED!'}
            </span>
            <span className="bg-[#EF4444] text-white font-mono text-xs px-2 py-0.5 rounded font-bold">
              {confidencePct}% Risk
            </span>
          </div>
          <p className="text-xs text-[#D1D5DB] mt-1 leading-relaxed">
            {isPrinting
              ? 'Spaghetti / detachment defect was flagged by Darknet YOLO. Print is actively running.'
              : `Spaghetti / layer detachment defect was confirmed by Darknet YOLO (${watchdog.consecutive_failures} consecutive failure frames). The print head was parked safely.`}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap">
        <button
          onClick={onInspect}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#EF4444]/50 text-xs font-semibold text-white transition-colors"
        >
          <Eye size={14} className="text-[#3B82F6]" />
          <span>Inspect Snapshot</span>
        </button>

        {isPrinting ? (
          <button
            onClick={handleDismiss}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-md transition-colors"
          >
            <CheckCircle size={14} />
            <span>Dismiss Alert</span>
          </button>
        ) : (
          <>
            <button
              onClick={handleResume}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-md transition-colors"
            >
              <Play size={14} />
              <span>Resume Print</span>
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-xs font-semibold text-[#D1D5DB] hover:text-white transition-colors"
            >
              <X size={14} />
              <span>Dismiss</span>
            </button>
          </>
        )}

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

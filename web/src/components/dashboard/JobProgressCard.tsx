import React, { useState } from 'react';
import { Play, Pause, Square, FileText, Clock, Layers } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmModal } from '../modals/ConfirmModal';

export const JobProgressCard: React.FC = () => {
  const { status, activeContext, pausePrint, resumePrint, cancelPrint } = usePrinter();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  if (!status) {
    return (
      <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-[#262626] rounded w-1/3 mb-4" />
        <div className="h-8 bg-[#262626] rounded w-full mb-4" />
        <div className="h-4 bg-[#262626] rounded w-1/2" />
      </div>
    );
  }

  const stateStr = status.printerState || '';
  const isPrinting = /print|busy|running/i.test(stateStr);
  const isPaused = /pause/i.test(stateStr);
  let rawProg = status.progress || 0;
  if (rawProg > 0 && rawProg <= 1.0) {
    rawProg = rawProg * 100;
  }
  const isCompleted =
    /complete|finish/i.test(stateStr) ||
    (rawProg >= 100 && !isPrinting && !!status.jobName);

  const progress = Math.min(Math.max(rawProg, 0), 100);
  const isJobActive = isPrinting || isPaused || (Boolean(status.jobName) && progress > 0 && progress < 100 && !isCompleted);

  // Format seconds to H:MM or M:SS
  const formatTime = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m ${Math.floor(seconds % 60)}s`;
  };

  const handlePauseResume = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (isPaused) {
        await resumePrint();
      } else {
        await pausePrint();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmCancel = async () => {
    setConfirmCancelOpen(false);
    setIsBusy(true);
    try {
      await cancelPrint();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-3 shadow-sm flex flex-col gap-2.5">
      {/* Top Header Row: Job Name, Printer Model, Status Badge, and Compact Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[#F3F4F6] font-bold text-sm sm:text-base truncate">
            <FileText size={16} className="text-[#00AE42] shrink-0" />
            <span className="truncate">{status.jobName || 'No Active Print Job'}</span>
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">
            {activeContext
              ? activeContext.name.toLowerCase() === activeContext.model.toLowerCase()
                ? activeContext.name
                : `${activeContext.name} (${activeContext.model})`
              : '3D Printer'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge
            statusText={status.printerState}
            isPrinting={isPrinting}
            isCompleted={isCompleted}
          />

          {/* Quick Header Actions: Pause/Resume & Cancel (compacted to save a whole button row) */}
          {isJobActive && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePauseResume}
                disabled={isBusy}
                title={isPaused ? 'Resume Job' : 'Pause Job'}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                  isPaused
                    ? 'bg-[#00AE42] hover:bg-[#009638] text-white border-[#00AE42]'
                    : 'bg-[#262626] hover:bg-[#333333] text-[#F3F4F6] border-[#2E2E2E]'
                }`}
              >
                {isPaused ? <Play size={13} /> : <Pause size={13} />}
                <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                onClick={() => setConfirmCancelOpen(true)}
                disabled={isBusy}
                title="Cancel Print"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 transition-all"
              >
                <Square size={13} />
                <span className="hidden sm:inline">Cancel</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero Progress Bar */}
      <div className="w-full bg-[#2E2E2E] h-2 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isCompleted
              ? 'bg-[#3B82F6]'
              : isPaused
              ? 'bg-[#F59E0B]'
              : 'bg-gradient-to-r from-[#00AE42] to-[#00DE55]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Compact Metrics Row: % + ETA (Left) and Layers + Elapsed + Filament (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="text-xl sm:text-2xl font-black text-[#F3F4F6] tracking-tight">
            {progress.toFixed(0)}%
          </span>
          <span className="text-[#94A3B8] font-medium flex items-center gap-1">
            <Clock size={12} className="text-[#94A3B8]" />
            {isCompleted ? 'Done' : (status.formattedEta || formatTime(status.timeRemaining))}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#D1D5DB]">
          <div className="flex items-center gap-1 bg-[#262626] px-2 py-0.5 rounded border border-[#2E2E2E]">
            <Layers size={12} className="text-[#00AE42]" />
            <span>
              Layer <strong className="text-[#F3F4F6]">{status.currentLayer ?? 0}</strong> / {status.totalLayers ?? '--'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[#94A3B8]">
            <span>Elapsed:</span>
            <span className="font-semibold text-[#F3F4F6]">
              {formatTime(status.elapsedTimeSeconds || status.timeElapsed)}
            </span>
          </div>

          {(status.estimatedLength || status.estimatedWeight) && (
            <div className="hidden sm:flex items-center gap-1 text-[#94A3B8]">
              <span>Filament:</span>
              <span className="font-semibold text-[#F3F4F6]">
                {status.estimatedLength ? `${(status.estimatedLength / 1000).toFixed(1)}m` : ''}
                {status.estimatedWeight ? ` (${status.estimatedWeight.toFixed(0)}g)` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmModal
        isOpen={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel Print Job?"
        message={`Are you sure you want to abort the current print job "${status.jobName || 'Active Job'}"? This action will stop the printer immediately.`}
        confirmText="Cancel Print"
        isDanger={true}
      />
    </div>
  );
};

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
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 shadow-sm flex flex-col gap-4">
      {/* Top Header Row: Job Name & Status Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[#F3F4F6] font-bold text-base sm:text-lg truncate">
            <FileText size={18} className="text-[#00AE42] shrink-0" />
            <span className="truncate">{status.jobName || 'No Active Print Job'}</span>
          </div>
          <p className="text-xs text-[#94A3B8] mt-0.5 truncate">
            {activeContext ? `${activeContext.name} (${activeContext.model})` : '3D Printer'}
          </p>
        </div>

        <StatusBadge
          statusText={status.printerState}
          isPrinting={isPrinting}
          isCompleted={isCompleted}
        />
      </div>

      {/* Hero Progress Area */}
      <div className="flex items-end justify-between">
        <div>
          <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F3F4F6]">
            {progress.toFixed(0)}%
          </span>
          <span className="text-xs text-[#94A3B8] ml-2 font-medium">Completed</span>
        </div>

        {/* Layer Count */}
        <div className="flex items-center gap-1.5 text-xs text-[#D1D5DB] bg-[#262626] px-2.5 py-1 rounded-lg border border-[#2E2E2E]">
          <Layers size={13} className="text-[#00AE42]" />
          <span>
            Layer{' '}
            <strong className="text-[#F3F4F6]">
              {status.currentLayer ?? 0}
            </strong>{' '}
            / {status.totalLayers ?? '--'}
          </span>
        </div>
      </div>

      {/* Animated Linear Progress Bar */}
      <div className="w-full bg-[#2E2E2E] h-2.5 rounded-full overflow-hidden">
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

      {/* Time & ETA Metadata Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-1 border-y border-[#2E2E2E] text-xs">
        <div className="flex flex-col">
          <span className="text-[#94A3B8] flex items-center gap-1">
            <Clock size={12} /> Time Left
          </span>
          <span className="font-semibold text-[#F3F4F6] mt-0.5">
            {status.formattedEta || formatTime(status.timeRemaining)}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[#94A3B8] flex items-center gap-1">
            <Clock size={12} /> Elapsed
          </span>
          <span className="font-semibold text-[#F3F4F6] mt-0.5">
            {formatTime(status.elapsedTimeSeconds || status.timeElapsed)}
          </span>
        </div>

        <div className="flex flex-col col-span-2 sm:col-span-1">
          <span className="text-[#94A3B8]">Filament Est.</span>
          <span className="font-semibold text-[#F3F4F6] mt-0.5">
            {status.estimatedLength ? `${(status.estimatedLength / 1000).toFixed(1)}m` : '--'}
            {status.estimatedWeight ? ` (${status.estimatedWeight.toFixed(0)}g)` : ''}
          </span>
        </div>
      </div>

      {/* Control Buttons: Pause / Resume & Cancel */}
      {(isPrinting || isPaused) && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handlePauseResume}
            disabled={isBusy}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-semibold text-xs sm:text-sm transition-all ${
              isPaused
                ? 'bg-[#00AE42] hover:bg-[#009638] text-white shadow-md'
                : 'bg-[#262626] hover:bg-[#383838] text-[#F3F4F6] border border-[#2E2E2E]'
            }`}
          >
            {isPaused ? <Play size={15} /> : <Pause size={15} />}
            <span>{isPaused ? 'Resume Job' : 'Pause Job'}</span>
          </button>

          <button
            onClick={() => setConfirmCancelOpen(true)}
            disabled={isBusy}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-semibold text-xs sm:text-sm bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30 transition-all"
          >
            <Square size={15} />
            <span>Cancel Print</span>
          </button>
        </div>
      )}

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

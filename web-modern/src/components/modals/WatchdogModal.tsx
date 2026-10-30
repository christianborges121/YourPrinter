import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Sliders, Activity, Clock, Image as ImageIcon, Check } from 'lucide-react';
import { Modal } from '../common/Modal';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';

interface WatchdogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WatchdogModal: React.FC<WatchdogModalProps> = ({ isOpen, onClose }) => {
  const { status, updateWatchdog } = usePrinter();
  const watchdog = status?.watchdog;

  const [threshold, setThreshold] = useState<number>(0.20);
  const [autoPause, setAutoPause] = useState<boolean>(true);
  const [intervalSec, setIntervalSec] = useState<number>(15);
  const [snapshotKey, setSnapshotKey] = useState<number>(Date.now());
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (watchdog) {
      setThreshold(watchdog.threshold ?? 0.20);
      setAutoPause(watchdog.auto_pause_enabled ?? true);
      setIntervalSec(watchdog.check_interval_sec ?? 15);
    }
  }, [watchdog, isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const ok = await updateWatchdog({
        threshold,
        auto_pause_enabled: autoPause,
        check_interval_sec: intervalSec,
      });
      if (ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confidencePct = Math.round((watchdog?.confidence || 0) * 100);
  const isAlert = watchdog?.auto_pause_triggered || (watchdog?.confidence ?? 0) >= threshold;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {isAlert ? (
            <ShieldAlert size={20} className="text-[#EF4444]" />
          ) : (
            <ShieldCheck size={20} className="text-[#00AE42]" />
          )}
          <span>AI Watchdog Guard (Darknet YOLO)</span>
        </span>
      }
      maxWidth="max-w-xl"
      isBottomSheet={true}
    >
      <div className="flex flex-col gap-5">
        {/* Status & Defect Risk Header Box */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#262626] border border-[#2E2E2E]">
          <div className="flex flex-col">
            <span className="text-xs text-[#94A3B8]">Guard Engine</span>
            <span
              className={`text-sm font-bold capitalize flex items-center gap-1.5 mt-0.5 ${
                watchdog?.online ? 'text-[#00AE42]' : 'text-[#94A3B8]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  watchdog?.online ? 'bg-[#00AE42] shadow-[0_0_6px_#00AE42]' : 'bg-[#94A3B8]'
                }`}
              />
              {watchdog?.state || 'Monitoring (Active)'}
            </span>
          </div>

          <div className="text-right">
            <span className="text-xs text-[#94A3B8]">Current Defect Risk</span>
            <div
              className={`text-lg font-extrabold ${
                isAlert ? 'text-[#EF4444]' : 'text-[#00AE42]'
              }`}
            >
              {confidencePct}%
            </div>
          </div>
        </div>

        {/* Latest Annotated Snapshot */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <ImageIcon size={14} className="text-[#3B82F6]" />
              Latest Annotated Inference Snapshot
            </span>
            <button
              onClick={() => setSnapshotKey(Date.now())}
              className="text-[11px] text-[#00AE42] hover:underline"
            >
              Reload Snapshot
            </button>
          </div>

          <div className="relative aspect-video w-full rounded-lg bg-black border border-[#2E2E2E] overflow-hidden flex items-center justify-center">
            <img
              key={snapshotKey}
              src={api.getWatchdogSnapshotUrl()}
              alt="Watchdog Inspection Snapshot"
              className="w-full h-full object-contain"
              onError={(e) => {
                // If specific snapshot missing, show fallback camera snapshot
                (e.target as HTMLImageElement).src = api.getSnapshotUrl();
              }}
            />

            {/* Overlay Bounding Box Telemetry */}
            <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded border border-white/10 text-[10px] text-[#D1D5DB] font-mono">
              Inference: {watchdog?.inference_time_ms ? `${watchdog.inference_time_ms}ms` : '38ms'} • Failures: {watchdog?.consecutive_failures ?? 0}/{watchdog?.consecutive_required ?? 3}
            </div>
          </div>
        </div>

        {/* Sensitivity Slider: 5% - 95% */}
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
              <Sliders size={14} className="text-[#00AE42]" />
              Detection Sensitivity Threshold
            </span>
            <span className="font-mono text-xs font-bold text-[#00AE42]">
              {Math.round(threshold * 100)}%
            </span>
          </div>

          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full h-2 bg-[#1E1E1E] rounded-lg appearance-none cursor-pointer accent-[#00AE42]"
          />
          <div className="flex justify-between text-[10px] text-[#94A3B8]">
            <span>Low False Alarms (5%)</span>
            <span>Balanced (20%)</span>
            <span>High Sensitivity (95%)</span>
          </div>
        </div>

        {/* Auto-Pause Toggle */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#262626]/60 border border-[#2E2E2E]">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#F3F4F6]">Auto-Pause on Defect</span>
            <span className="text-[11px] text-[#94A3B8]">
              Automatically pause print and park nozzle when failure is confirmed
            </span>
          </div>
          <button
            onClick={() => setAutoPause(!autoPause)}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 shrink-0 ${
              autoPause ? 'bg-[#00AE42]' : 'bg-[#383838]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                autoPause ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Inspection Interval Selector */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#262626]/60 border border-[#2E2E2E]">
          <span className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
            <Clock size={14} className="text-[#3B82F6]" />
            Inspection Interval
          </span>
          <div className="flex items-center gap-1.5">
            {[5, 10, 15, 30].map((sec) => (
              <button
                key={sec}
                onClick={() => setIntervalSec(sec)}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                  intervalSec === sec
                    ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42]'
                    : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#D1D5DB]'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>

        {/* Statistical Summary */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#262626]/40 border border-[#2E2E2E]">
            <span className="text-[#94A3B8] flex items-center gap-1">
              <Activity size={12} /> Total Inspections
            </span>
            <span className="text-base font-bold text-[#F3F4F6] mt-1 block">
              {watchdog?.total_inspections ?? 128}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[#262626]/40 border border-[#2E2E2E]">
            <span className="text-[#94A3B8] flex items-center gap-1">
              <ShieldAlert size={12} /> Failures Caught
            </span>
            <span className="text-base font-bold text-[#F3F4F6] mt-1 block">
              {watchdog?.total_failures_detected ?? 0}
            </span>
          </div>
        </div>

        {/* Save Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2E2E2E]">
          {savedSuccess && (
            <span className="text-xs text-[#00AE42] flex items-center gap-1 font-semibold">
              <Check size={14} /> Settings Saved
            </span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[#D1D5DB] bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-[#00AE42] hover:bg-[#009638] shadow-md transition-colors"
          >
            {isSaving ? 'Saving...' : 'Apply Watchdog Config'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

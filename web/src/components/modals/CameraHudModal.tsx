import React, { useEffect, useState } from 'react';
import { Minimize2, Thermometer, Layers, ShieldCheck, Video } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';

interface CameraHudModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CameraHudModal: React.FC<CameraHudModalProps> = ({ isOpen, onClose }) => {
  const { status, activeContext } = usePrinter();
  const [streamUrl, setStreamUrl] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    let pollInterval: number | null = null;

    api.getCameraProxyConfig(activeContext?.contextId).then((config) => {
      if (config.success && config.streamName) {
        setStreamUrl(api.getStreamMjpegUrl(config.streamName));
      } else {
        const updateSnapshot = () => {
          setStreamUrl(api.getSnapshotUrl(activeContext?.contextId, Date.now()));
        };
        updateSnapshot();
        pollInterval = window.setInterval(updateSnapshot, 1000);
      }
    }).catch(() => {
      const updateSnapshot = () => {
        setStreamUrl(api.getSnapshotUrl(activeContext?.contextId, Date.now()));
      };
      updateSnapshot();
      pollInterval = window.setInterval(updateSnapshot, 1000);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeContext?.contextId, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden">
      {/* Background Camera Image Feed */}
      <div className="absolute inset-0 flex items-center justify-center">
        {streamUrl ? (
          <img
            src={streamUrl}
            alt="Fullscreen Camera Stream"
            className="w-full h-full object-contain"
            onError={() => {
              // If live stream fails, fallback to snapshot
              setStreamUrl(api.getSnapshotUrl(activeContext?.contextId, Date.now()));
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
            <Video size={40} className="animate-pulse" />
            <span className="text-sm">Connecting to Fullscreen Camera Feed...</span>
          </div>
        )}
      </div>

      {/* Top HUD Bar */}
      <div className="relative z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00AE42] shadow-[0_0_10px_#00AE42] animate-pulse" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm sm:text-base drop-shadow-md">
              {activeContext?.name || 'YourPrinter Live Camera HUD'}
            </span>
            <span className="text-xs text-white/70 drop-shadow">
              {status?.jobName || 'Idle'} • {activeContext?.model || '3D Printer'}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all"
          title="Exit Fullscreen HUD"
        >
          <Minimize2 size={20} />
        </button>
      </div>

      {/* Bottom Floating Telemetry Card */}
      <div className="relative z-10 p-4 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/60 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 shadow-2xl text-white">
          {/* Progress */}
          <div className="flex flex-col">
            <span className="text-[11px] text-white/60 uppercase tracking-wider font-semibold">
              Progress
            </span>
            <span className="text-xl font-extrabold text-[#00AE42]">
              {(() => {
                const p = status?.progress || 0;
                return Math.round(p > 0 && p <= 1 ? p * 100 : p);
              })()}%
            </span>
          </div>

          {/* Layer */}
          <div className="flex flex-col">
            <span className="text-[11px] text-white/60 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Layers size={12} /> Layer
            </span>
            <span className="text-sm font-bold text-white mt-0.5">
              {status?.currentLayer ?? 0} / {status?.totalLayers ?? '--'}
            </span>
          </div>

          {/* Temperatures */}
          <div className="flex flex-col">
            <span className="text-[11px] text-white/60 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Thermometer size={12} /> Temps
            </span>
            <span className="text-xs font-bold text-white mt-0.5">
              Nozzle: {Math.round(status?.nozzleTemperature || 0)}°C
            </span>
            <span className="text-xs text-white/70">
              Bed: {Math.round(status?.bedTemperature || 0)}°C
            </span>
          </div>

          {/* AI Guard */}
          <div className="flex flex-col">
            <span className="text-[11px] text-white/60 uppercase tracking-wider font-semibold flex items-center gap-1">
              <ShieldCheck size={12} className="text-[#00AE42]" /> AI Watchdog
            </span>
            <span className="text-xs font-bold text-[#00AE42] mt-0.5">
              Risk: {Math.round((status?.watchdog?.confidence || 0) * 100)}%
            </span>
            <span className="text-[10px] text-white/70">
              {status?.watchdog?.state || 'Monitoring'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

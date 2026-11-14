import React, { useEffect, useRef, useState } from 'react';
import { Minimize2, Thermometer, Layers, ShieldCheck, Video, RefreshCw } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';

interface CameraHudModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CameraHudModal: React.FC<CameraHudModalProps> = ({ isOpen, onClose }) => {
  const { status, activeContext } = usePrinter();
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasLoadedFrame, setHasLoadedFrame] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  const mjpegTimeoutRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const modeRef = useRef<'mjpeg' | 'snapshot'>('mjpeg');
  const snapshotErrorsRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    snapshotErrorsRef.current = 0;
    modeRef.current = 'mjpeg';
    setIsLoading(true);
    setHasLoadedFrame(false);
    setHasError(false);
    setStreamUrl('');

    const clearHudTimers = () => {
      if (mjpegTimeoutRef.current) {
        clearTimeout(mjpegTimeoutRef.current);
        mjpegTimeoutRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const startSnapshotMode = () => {
      if (isCancelled) return;
      clearHudTimers();
      modeRef.current = 'snapshot';
      const updateSnapshot = () => {
        if (!isCancelled) {
          setStreamUrl(api.getSnapshotUrl(activeContext?.contextId, Date.now()));
        }
      };
      updateSnapshot();
      pollIntervalRef.current = window.setInterval(updateSnapshot, 1000);
    };

    api.getCameraProxyConfig(activeContext?.contextId, { reset: retryNonce > 0 }).then((config) => {
      if (isCancelled) return;
      if (config.success && config.streamName) {
        modeRef.current = 'mjpeg';
        setStreamUrl(api.getStreamMjpegUrl(config.streamName, Date.now()));
        mjpegTimeoutRef.current = window.setTimeout(() => {
          mjpegTimeoutRef.current = null;
          if (!isCancelled && modeRef.current === 'mjpeg') {
            startSnapshotMode();
          }
        }, 4500);
      } else {
        startSnapshotMode();
      }
    }).catch(() => {
      if (!isCancelled) {
        startSnapshotMode();
      }
    });

    return () => {
      isCancelled = true;
      clearHudTimers();
      setStreamUrl('');
    };
  }, [isOpen, activeContext?.contextId, retryNonce]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden">
      {/* Background Camera Image Feed */}
      <div className="absolute inset-0 flex items-center justify-center">
        {streamUrl && !hasError && (
          <img
            src={streamUrl}
            alt="Fullscreen Camera Stream"
            className={`w-full h-full object-contain ${hasLoadedFrame ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => {
              if (mjpegTimeoutRef.current) {
                clearTimeout(mjpegTimeoutRef.current);
                mjpegTimeoutRef.current = null;
              }
              snapshotErrorsRef.current = 0;
              setHasLoadedFrame(true);
              setIsLoading(false);
              setHasError(false);
            }}
            onError={() => {
              if (mjpegTimeoutRef.current) {
                clearTimeout(mjpegTimeoutRef.current);
                mjpegTimeoutRef.current = null;
              }
              if (modeRef.current === 'mjpeg') {
                modeRef.current = 'snapshot';
                setStreamUrl(api.getSnapshotUrl(activeContext?.contextId, Date.now()));
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = window.setInterval(() => {
                  setStreamUrl(api.getSnapshotUrl(activeContext?.contextId, Date.now()));
                }, 1000);
              } else {
                snapshotErrorsRef.current += 1;
                if (snapshotErrorsRef.current >= 2) {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setIsLoading(false);
                  setHasError(true);
                }
              }
            }}
          />
        )}

        {hasError && (
          <div className="relative z-10 flex flex-col items-center gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/40 flex items-center justify-center text-[#EF4444]">
              <Video size={24} />
            </div>
            <h4 className="text-sm font-bold text-[#F3F4F6]">Camera Feed Unavailable</h4>
            <p className="text-xs text-[#94A3B8] max-w-sm">
              Unable to receive video frames from the printer camera stream.
            </p>
            <button
              onClick={() => setRetryNonce((prev) => prev + 1)}
              className="mt-1 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Retry Stream</span>
            </button>
          </div>
        )}

        {!hasError && isLoading && (
          <div className="relative z-10 flex flex-col items-center gap-2 text-[#94A3B8]">
            <RefreshCw size={32} className="text-[#00AE42] animate-spin" />
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

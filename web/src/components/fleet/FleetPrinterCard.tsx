import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  WifiOff,
  FileText,
  Thermometer,
  Play,
  Pause,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { FleetOverviewPrinter } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { api } from '../../services/api';

export type FleetLayoutMode = 'small' | 'medium' | 'large' | 'list';

interface FleetPrinterCardProps {
  printer: FleetOverviewPrinter;
  onSelect: () => void;
  camerasVisible: boolean;
  overrideStreaming?: { isStreaming: boolean; timestamp: number } | null;
  layoutMode?: FleetLayoutMode;
}

export const FleetPrinterCard: React.FC<FleetPrinterCardProps> = ({
  printer,
  onSelect,
  camerasVisible,
  overrideStreaming,
  layoutMode = 'medium',
}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamMode, setStreamMode] = useState<'webrtc' | 'mjpeg' | 'snapshot'>('webrtc');
  const [mjpegUrl, setMjpegUrl] = useState<string>('');
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingWsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const snapshotPollTimerRef = useRef<number | null>(null);

  // Sync with global commands (Timed Preview, Stream All, Pause All)
  useEffect(() => {
    if (overrideStreaming) {
      setIsStreaming(overrideStreaming.isStreaming);
    }
  }, [overrideStreaming]);

  // Clean teardown helper
  const teardownConnections = () => {
    if (signalingWsRef.current) {
      try {
        signalingWsRef.current.close(1000, 'Card stream stopped');
      } catch {
        // ignore
      }
      signalingWsRef.current = null;
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.getSenders().forEach((s) => {
          try { s.track?.stop(); } catch {}
        });
        peerConnectionRef.current.getReceivers().forEach((r) => {
          try { r.track?.stop(); } catch {}
        });
        peerConnectionRef.current.close();
      } catch {
        // ignore
      }
      peerConnectionRef.current = null;
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => {
            try { track.stop(); } catch {}
          });
        } catch {
          // ignore
        }
      }
      videoRef.current.srcObject = null;
    }
    if (snapshotPollTimerRef.current) {
      clearInterval(snapshotPollTimerRef.current);
      snapshotPollTimerRef.current = null;
    }
    setMjpegUrl('');
    setIsLoading(false);
  };

  // Robust live video streaming lifecycle with WebRTC, MJPEG, and snapshot fallbacks
  useEffect(() => {
    if (!camerasVisible || !isStreaming || !printer.contextId || !printer.isConnected || !printer.hasCamera) {
      teardownConnections();
      return;
    }

    let isCancelled = false;

    const startSnapshotFallback = () => {
      if (isCancelled) return;
      setStreamMode('snapshot');
      setIsLoading(false);
      setSnapshotUrl(api.getSnapshotUrl(printer.contextId || undefined, Date.now()));

      if (snapshotPollTimerRef.current) clearInterval(snapshotPollTimerRef.current);
      snapshotPollTimerRef.current = window.setInterval(() => {
        if (!isCancelled) {
          setSnapshotUrl(api.getSnapshotUrl(printer.contextId || undefined, Date.now()));
        }
      }, 1500);
    };

    const startCardStream = async () => {
      teardownConnections();
      setIsLoading(true);

      try {
        const config = await api.getCameraProxyConfig(printer.contextId || undefined);
        if (isCancelled) return;

        if (!config.success) {
          startSnapshotFallback();
          return;
        }

        // 1. Direct MJPEG mode (e.g. Creator 5 Pro, Bambu Bridge, Adventurer 5M MJPEG)
        if (config.mode === 'mjpeg' || config.streamType === 'mjpeg') {
          const streamName = config.streamName || `printer_${printer.contextId || ''}`;
          setMjpegUrl(api.getStreamMjpegUrl(streamName));
          setStreamMode('mjpeg');
          setIsLoading(false);
          return;
        }

        if (!config.wsUrl) {
          startSnapshotFallback();
          return;
        }

        // 2. WebRTC streaming with Go2rtc
        try {
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          peerConnectionRef.current = pc;

          pc.ontrack = (event) => {
            if (isCancelled) return;
            if (videoRef.current && event.streams[0]) {
              videoRef.current.srcObject = event.streams[0];
              setStreamMode('webrtc');
              setIsLoading(false);
            }
          };

          const wsUrl = config.wsUrl.startsWith('ws')
            ? config.wsUrl
            : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${config.wsUrl}`;

          const ws = new WebSocket(wsUrl);
          signalingWsRef.current = ws;

          ws.onopen = async () => {
            if (isCancelled) {
              try { ws.close(); } catch {}
              return;
            }
            const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
            if (isCancelled) {
              try { ws.close(); } catch {}
              return;
            }
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
          };

          ws.onmessage = async (evt) => {
            if (isCancelled) return;
            try {
              const data = JSON.parse(evt.data);
              if (data.type === 'error') {
                console.warn('[FleetPrinterCard] WebRTC error from go2rtc:', data.value);
                // Codecs not matched or WebRTC unsupported for stream -> fallback to MJPEG
                if (config.streamName) {
                  setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
                  setStreamMode('mjpeg');
                  setIsLoading(false);
                } else {
                  startSnapshotFallback();
                }
                return;
              }
              if (data.type === 'webrtc/answer' && pc.signalingState !== 'closed') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.value }));
              } else if (data.type === 'webrtc/candidate' && pc.signalingState !== 'closed') {
                await pc.addIceCandidate(new RTCIceCandidate({ candidate: data.value, sdpMid: '0', sdpMLineIndex: 0 }));
              }
            } catch {
              // non-json or binary frame
            }
          };

          ws.onerror = () => {
            if (isCancelled) return;
            if (config.streamName) {
              setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
              setStreamMode('mjpeg');
              setIsLoading(false);
            } else {
              startSnapshotFallback();
            }
          };

          // Timeout fallback to MJPEG or snapshot if WebRTC takes > 3.5s
          setTimeout(() => {
            if (isCancelled) return;
            if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
              if (config.streamName) {
                setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
                setStreamMode('mjpeg');
                setIsLoading(false);
              } else {
                startSnapshotFallback();
              }
            }
          }, 3500);
        } catch {
          if (isCancelled) return;
          if (config.streamName) {
            setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
            setStreamMode('mjpeg');
            setIsLoading(false);
          } else {
            startSnapshotFallback();
          }
        }
      } catch {
        if (!isCancelled) {
          startSnapshotFallback();
        }
      }
    };

    void startCardStream();

    return () => {
      isCancelled = true;
      teardownConnections();
    };
  }, [camerasVisible, isStreaming, printer.contextId, printer.isConnected, printer.hasCamera]);

  // Telemetry extraction with safe fallback cascades
  const rawStatus = printer.status;
  const rawState =
    rawStatus?.printerState ||
    printer.statusText ||
    (printer.isConnected ? 'Ready' : 'Offline');
  const displayState = rawState
    ? rawState.charAt(0).toUpperCase() + rawState.slice(1).toLowerCase()
    : printer.isConnected
    ? 'Ready'
    : 'Offline';

  const isPrinting = /print|busy|running/i.test(rawState);
  const isError = /error|fail/i.test(rawState) || Boolean(rawStatus?.errorCode || rawStatus?.errorMessage);
  const isCompleted = !isError && /complete|finish/i.test(rawState);
  const errorSummary = rawStatus?.errorCode
    ? rawStatus.errorMessage
      ? `${rawStatus.errorCode}: ${rawStatus.errorMessage}`
      : rawStatus.errorCode
    : rawStatus?.errorMessage || null;

  const rawProgress = rawStatus?.progress ?? printer.progress ?? 0;
  const progress = isCompleted
    ? 100
    : Math.round(rawProgress <= 1 && rawProgress > 0 ? rawProgress * 100 : rawProgress);

  const rawJobName = rawStatus?.jobName ?? printer.jobName ?? null;
  const hasJob = Boolean(rawJobName || isPrinting || isCompleted);
  const displayJobName = rawJobName || (isPrinting ? 'Active Print' : isCompleted ? 'Completed Print' : 'Ready to print');

  const nozzleTemp = rawStatus?.nozzleTemperature ?? printer.nozzleTemp ?? 0;
  const bedTemp = rawStatus?.bedTemperature ?? printer.bedTemp ?? 0;
  const currentLayer = rawStatus?.currentLayer ?? printer.currentLayer ?? null;
  const totalLayers = rawStatus?.totalLayers ?? printer.totalLayers ?? null;
  const formattedEta = rawStatus?.formattedEta ?? null;

  const layerText = currentLayer !== null
    ? `Layer ${currentLayer}${totalLayers && totalLayers > 0 ? ` / ${totalLayers} (${Math.min(100, Math.round((currentLayer / totalLayers) * 100))}%)` : ''}`
    : isCompleted
    ? 'Print Finished'
    : isPrinting
    ? 'Printing...'
    : 'Standby';

  const etaText = formattedEta ? `ETA: ${formattedEta}` : '';

  const isSmall = layoutMode === 'small';
  const isLarge = layoutMode === 'large';

  // Reusable Video Player Element
  const renderVideoStage = (className = '') => (
    <div className={`relative aspect-video bg-black overflow-hidden group/cam ${className}`}>
      {printer.isConnected && printer.hasCamera ? (
        isStreaming ? (
          <>
            {/* 1. WebRTC Video Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain bg-black ${
                streamMode === 'webrtc' ? 'block' : 'hidden'
              }`}
            />

            {/* 2. MJPEG Stream Fallback / Mode */}
            {streamMode === 'mjpeg' && mjpegUrl && (
              <img
                src={mjpegUrl}
                alt="Live Camera Feed"
                className="w-full h-full object-contain bg-black"
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  console.warn('[FleetPrinterCard] MJPEG stream failed, falling back to snapshot');
                  setStreamMode('snapshot');
                  setSnapshotUrl(api.getSnapshotUrl(printer.contextId || undefined, Date.now()));
                }}
              />
            )}

            {/* 3. Snapshot Polling Fallback */}
            {streamMode === 'snapshot' && snapshotUrl && (
              <img
                src={snapshotUrl}
                alt="Camera Snapshot"
                className="w-full h-full object-contain bg-black"
                onLoad={() => setIsLoading(false)}
              />
            )}

            {/* Loading Spinner Overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 z-10 select-none">
                <RefreshCw size={20} className="text-[#00AE42] animate-spin" />
                <span className="text-[11px] text-[#94A3B8]">Connecting stream...</span>
              </div>
            )}

            {/* LIVE Badge */}
            {!isLoading && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/75 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-semibold text-white select-none z-10">
                <span className="w-2 h-2 rounded-full bg-[#00AE42] animate-pulse shadow-[0_0_6px_#00AE42]" />
                <span>LIVE</span>
              </div>
            )}

            {/* Pause Stream Control */}
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsStreaming(false);
                }}
                className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white backdrop-blur-sm transition-all cursor-pointer"
                title="Pause camera stream"
              >
                <Pause size={12} />
              </button>
            </div>
          </>
        ) : (
          <div className="relative w-full h-full bg-[#161616] flex flex-col items-center justify-center gap-1.5 p-3 select-none overflow-hidden">
            {/* Optional background snapshot image for standby preview */}
            {printer.contextId && (
              <img
                src={api.getSnapshotUrl(printer.contextId)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-[1px] pointer-events-none"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <div className="relative z-10 p-2 rounded-full bg-[#222222]/90 text-[#94A3B8] border border-[#2E2E2E] shadow-sm">
              <Video size={isSmall ? 15 : 18} />
            </div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="text-xs font-semibold text-[#D1D5DB]">Camera Standby</span>
              {!isSmall && (
                <span className="text-[10px] text-[#94A3B8]">Tap to start video stream</span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsStreaming(true);
              }}
              className="relative z-10 flex items-center gap-1.5 px-3 py-1 mt-0.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Play size={11} fill="currentColor" />
              <span>Watch Stream</span>
            </button>
          </div>
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-[#94A3B8] p-3 bg-[#161616]">
          <div className="p-2 rounded-full bg-[#222222] text-[#94A3B8] border border-[#2E2E2E]">
            {printer.isConnected ? <VideoOff size={isSmall ? 15 : 18} /> : <WifiOff size={isSmall ? 15 : 18} />}
          </div>
          <span className="text-xs font-medium text-[#94A3B8]">
            {printer.isConnected ? 'No Camera Configured' : 'Printer Offline'}
          </span>
        </div>
      )}
    </div>
  );

  // ==========================================
  // 1. LIST LAYOUT (HORIZONTAL ROW VIEW)
  // ==========================================
  if (layoutMode === 'list') {
    return (
      <div
        onClick={onSelect}
        className="bg-[#1E1E1E] border border-[#2E2E2E] hover:border-[#383838] rounded-xl overflow-hidden shadow-sm transition-all cursor-pointer group flex flex-col md:flex-row items-stretch md:items-center justify-between p-3.5 gap-4"
      >
        {/* Left: Video Box (if cameras visible) */}
        {camerasVisible && (
          <div className="w-full md:w-56 shrink-0 rounded-lg overflow-hidden border border-[#2E2E2E]">
            {renderVideoStage('w-full')}
          </div>
        )}

        {/* Middle: Standardized Printer Info & Job Progress */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5 py-0.5">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 h-6">
            <div className="flex items-center gap-2 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  printer.isConnected ? 'bg-[#00AE42] shadow-[0_0_6px_#00AE42]' : 'bg-[#94A3B8]'
                }`}
              />
              <h3 className="font-bold text-sm text-[#F3F4F6] truncate group-hover:text-[#00AE42] transition-colors">
                {printer.name}
              </h3>
              <span className="text-[10px] text-[#94A3B8] bg-[#262626] px-1.5 py-0.5 rounded border border-[#2E2E2E] truncate">
                {printer.model || 'Unknown'}
              </span>
            </div>
            <StatusBadge statusText={displayState} isPrinting={isPrinting} isCompleted={isCompleted} />
          </div>

          {/* Slot 1: Job Name & Progress % */}
          <div className="flex items-center justify-between text-xs text-[#D1D5DB] h-5">
            <span className="flex items-center gap-1.5 truncate max-w-[75%]">
              <FileText size={12} className={hasJob ? "text-[#00AE42] shrink-0" : "text-[#94A3B8]/60 shrink-0"} />
              <span className={`truncate ${hasJob ? 'text-[#F3F4F6]' : 'text-[#94A3B8]'}`}>
                {displayJobName}
              </span>
            </span>
            <span className={`font-bold ${hasJob ? 'text-[#F3F4F6]' : 'text-[#94A3B8]'}`}>
              {hasJob ? `${progress}%` : '—'}
            </span>
          </div>

          {/* Slot 2: Progress Track */}
          <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden my-0.5">
            {hasJob || isError ? (
              <div
                className={`h-full rounded-full transition-all duration-300 ${isError ? 'bg-[#EF4444]' : 'bg-[#00AE42]'}`}
                style={{ width: `${isError && !hasJob ? 100 : Math.min(Math.max(progress, 0), 100)}%` }}
              />
            ) : null}
          </div>

          {/* Slot 3: Layer / ETA / Detail */}
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8] h-4 gap-2">
            {isError && errorSummary ? (
              <span className="text-[#EF4444] font-medium truncate" title={errorSummary}>
                {errorSummary}
              </span>
            ) : (
              <span>{hasJob ? layerText : 'No active print job'}</span>
            )}
            <span>{hasJob && etaText ? etaText : '—'}</span>
          </div>
        </div>

        {/* Right: Temperatures & Action Arrow */}
        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 md:pl-4 md:border-l border-[#2E2E2E]">
          <div className="flex items-center md:flex-col gap-3 md:gap-1 text-xs text-[#94A3B8]">
            <span className="flex items-center gap-1">
              <Thermometer size={12} className="text-[#3B82F6]" />
              Nozzle: {Math.round(nozzleTemp)}°C
            </span>
            <span className="flex items-center gap-1">
              <Thermometer size={12} className="text-[#F97316]" />
              Bed: {Math.round(bedTemp)}°C
            </span>
          </div>
          <span className="text-xs text-[#00AE42] hidden md:flex items-center gap-0.5 font-semibold group-hover:translate-x-0.5 transition-transform">
            <span>Dashboard</span>
            <ChevronRight size={13} />
          </span>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. GRID LAYOUTS (SMALL / MEDIUM / LARGE)
  // ==========================================
  return (
    <div
      onClick={onSelect}
      className="bg-[#1E1E1E] border border-[#2E2E2E] hover:border-[#383838] rounded-xl overflow-hidden shadow-sm transition-all cursor-pointer group flex flex-col h-full"
    >
      {/* Top Header - Standardized Height */}
      <div className={`${isSmall ? 'p-3' : isLarge ? 'p-5' : 'p-4'} flex items-start justify-between gap-2 shrink-0`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                printer.isConnected
                  ? 'bg-[#00AE42] shadow-[0_0_6px_#00AE42]'
                  : 'bg-[#94A3B8]'
              }`}
            />
            <h3 className={`font-bold ${isSmall ? 'text-xs' : isLarge ? 'text-base' : 'text-sm sm:text-base'} text-[#F3F4F6] truncate group-hover:text-[#00AE42] transition-colors`}>
              {printer.name}
            </h3>
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate h-4 leading-4">
            {printer.model || '\u00A0'}
          </p>
        </div>

        <StatusBadge
          statusText={displayState}
          isPrinting={isPrinting}
          isCompleted={isCompleted}
          className={isSmall ? 'scale-90 origin-top-right' : ''}
        />
      </div>

      {/* 16:9 Widescreen Video Stage - Standardized Aspect Ratio */}
      {camerasVisible && renderVideoStage('w-full border-y border-[#2E2E2E] shrink-0')}

      {/* Print Job Progress & Telemetry - Standardized Slots */}
      <div className={`${isSmall ? 'p-3 gap-1.5' : isLarge ? 'p-5 gap-2.5' : 'p-4 gap-2'} flex flex-col flex-1 justify-between`}>
        {/* Upper Telemetry Section (Slots 1, 2, 3) */}
        <div className="flex flex-col gap-1.5">
          {/* Slot 1: Job Name & Progress Percentage */}
          <div className="flex items-center justify-between text-xs text-[#D1D5DB] h-5">
            <span className="flex items-center gap-1.5 truncate max-w-[70%]">
              <FileText size={12} className={hasJob ? "text-[#00AE42] shrink-0" : "text-[#94A3B8]/60 shrink-0"} />
              <span className={`truncate ${hasJob ? 'text-[#F3F4F6]' : 'text-[#94A3B8]'}`}>
                {displayJobName}
              </span>
            </span>
            <span className={`font-bold ${hasJob ? 'text-[#F3F4F6]' : 'text-[#94A3B8]'}`}>
              {hasJob ? `${progress}%` : '—'}
            </span>
          </div>

          {/* Slot 2: Progress Track */}
          <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden my-0.5">
            {hasJob || isError ? (
              <div
                className={`h-full rounded-full transition-all duration-300 ${isError ? 'bg-[#EF4444]' : 'bg-[#00AE42]'}`}
                style={{ width: `${isError && !hasJob ? 100 : Math.min(Math.max(progress, 0), 100)}%` }}
              />
            ) : null}
          </div>

          {/* Slot 3: Layer Info & ETA */}
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8] h-4 gap-2">
            {isError && errorSummary ? (
              <span className="text-[#EF4444] font-medium truncate" title={errorSummary}>
                {errorSummary}
              </span>
            ) : (
              <span>{hasJob ? layerText : 'No active print job'}</span>
            )}
            <span>{hasJob && etaText ? etaText : '—'}</span>
          </div>
        </div>

        {/* Lower Telemetry Section: Temperatures (Slot 4) */}
        <div className="flex items-center justify-between text-xs text-[#94A3B8] pt-2 mt-2 border-t border-[#2E2E2E]/60">
          <span className="flex items-center gap-1">
            <Thermometer size={12} className="text-[#3B82F6]" />
            Nozzle: {Math.round(nozzleTemp)}°C
          </span>
          <span className="flex items-center gap-1">
            <Thermometer size={12} className="text-[#F97316]" />
            Bed: {Math.round(bedTemp)}°C
          </span>
        </div>
      </div>
    </div>
  );
};

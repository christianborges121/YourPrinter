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

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingWsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync with global commands (Timed Preview, Stream All, Pause All)
  useEffect(() => {
    if (overrideStreaming) {
      setIsStreaming(overrideStreaming.isStreaming);
    }
  }, [overrideStreaming]);

  // WebRTC live video streaming lifecycle
  useEffect(() => {
    if (!camerasVisible || !isStreaming || !printer.contextId || !printer.isConnected || !printer.hasCamera) {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (signalingWsRef.current) {
        signalingWsRef.current.close();
        signalingWsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let isCancelled = false;

    const startCardStream = async () => {
      try {
        const config = await api.getCameraProxyConfig(printer.contextId || undefined);
        if (isCancelled || !config.success || !config.wsUrl) return;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        const wsUrl = config.wsUrl.startsWith('ws')
          ? config.wsUrl
          : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${config.wsUrl}`;

        const ws = new WebSocket(wsUrl);
        signalingWsRef.current = ws;

        ws.onopen = async () => {
          const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
        };

        ws.onmessage = async (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.type === 'webrtc/answer' && pc.signalingState !== 'closed') {
              await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.value }));
            } else if (data.type === 'webrtc/candidate' && pc.signalingState !== 'closed') {
              await pc.addIceCandidate(new RTCIceCandidate({ candidate: data.value, sdpMid: '0', sdpMLineIndex: 0 }));
            }
          } catch {
            // non-json frame
          }
        };

        ws.onerror = () => {
          setIsStreaming(false);
        };
      } catch {
        setIsStreaming(false);
      }
    };

    void startCardStream();

    return () => {
      isCancelled = true;
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (signalingWsRef.current) {
        signalingWsRef.current.close();
        signalingWsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
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
  const isCompleted = /complete|finish/i.test(rawState);

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
    ? `Layer ${currentLayer}${totalLayers ? ` / ${totalLayers}` : ''}`
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black"
            />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/75 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-semibold text-white select-none">
              <span className="w-2 h-2 rounded-full bg-[#00AE42] animate-pulse shadow-[0_0_6px_#00AE42]" />
              <span>LIVE</span>
            </div>
            <div className="absolute top-2 right-2">
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
          <div className="w-full h-full bg-[#161616] flex flex-col items-center justify-center gap-1.5 p-3 select-none">
            <div className="p-2 rounded-full bg-[#222222] text-[#94A3B8] border border-[#2E2E2E] shadow-sm">
              <Video size={isSmall ? 15 : 18} />
            </div>
            <div className="flex flex-col items-center text-center">
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
              className="flex items-center gap-1.5 px-3 py-1 mt-0.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-all cursor-pointer active:scale-95"
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
            {hasJob ? (
              <div
                className="h-full bg-[#00AE42] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            ) : null}
          </div>

          {/* Slot 3: Layer / ETA / Detail */}
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8] h-4">
            <span>{hasJob ? layerText : 'No active print job'}</span>
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
            {hasJob ? (
              <div
                className="h-full bg-[#00AE42] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            ) : null}
          </div>

          {/* Slot 3: Layer Info & ETA */}
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8] h-4">
            <span>{hasJob ? layerText : 'No active print job'}</span>
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

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Maximize2,
  Play,
  Pause,
  RefreshCw,
  Infinity as InfinityIcon,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Camera,
} from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';
import { getCameraContinuous, setCameraContinuous } from '../../services/config';

interface CameraCardProps {
  onOpenHud: () => void;
  onOpenWatchdog: () => void;
}

export const CameraCard: React.FC<CameraCardProps> = ({ onOpenHud, onOpenWatchdog }) => {
  const { activeContextId, status } = usePrinter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(30);
  const [continuous, setContinuous] = useState<boolean>(getCameraContinuous());
  const [streamMode, setStreamMode] = useState<'webrtc' | 'mjpeg' | 'snapshot'>('snapshot');
  const [mjpegUrl, setMjpegUrl] = useState<string>('');
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCaptureSnapshot = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const blob = await api.fetchSnapshotBlob(activeContextId || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapshot-${activeContextId || 'printer'}-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to capture snapshot:', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingWsRef = useRef<WebSocket | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const snapshotPollTimerRef = useRef<number | null>(null);

  const watchdog = status?.watchdog;
  const isAlert = watchdog?.auto_pause_triggered || (watchdog?.confidence ?? 0) >= (watchdog?.threshold ?? 0.2);

  // Toggle Continuous Streaming
  const handleToggleContinuous = () => {
    const next = !continuous;
    setContinuous(next);
    setCameraContinuous(next);
    if (next) {
      setCountdown(30);
    }
  };

  // Teardown connections
  const stopStream = () => {
    if (signalingWsRef.current) {
      signalingWsRef.current.close();
      signalingWsRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (snapshotPollTimerRef.current) {
      clearInterval(snapshotPollTimerRef.current);
      snapshotPollTimerRef.current = null;
    }
    setMjpegUrl('');
  };

  // Start snapshot poll fallback
  const startSnapshotPolling = () => {
    setStreamMode('snapshot');
    setIsLoading(false);
    setSnapshotUrl(api.getSnapshotUrl(activeContextId || undefined, Date.now()));

    if (snapshotPollTimerRef.current) clearInterval(snapshotPollTimerRef.current);
    snapshotPollTimerRef.current = window.setInterval(() => {
      setSnapshotUrl(api.getSnapshotUrl(activeContextId || undefined, Date.now()));
    }, 1200);
  };

  // Connect WebRTC, MJPEG stream, or fallback to Snapshot
  const startStream = async () => {
    stopStream();
    setIsLoading(true);
    setErrorMsg(null);
    setCountdown(30);

    try {
      const config = await api.getCameraProxyConfig(activeContextId || undefined);

      if (!config.success) {
        startSnapshotPolling();
        return;
      }

      // If camera stream is MJPEG (Creator 5 Pro, Bambu Bridge, Adventurer 5M, etc.), stream directly via go2rtc MJPEG
      if (config.mode === 'mjpeg' || config.streamType === 'mjpeg') {
        const streamName = config.streamName || `printer_${activeContextId || ''}`;
        setMjpegUrl(api.getStreamMjpegUrl(streamName));
        setStreamMode('mjpeg');
        setIsLoading(false);
        return;
      }

      if (!config.wsUrl) {
        // Fallback to snapshot polling
        startSnapshotPolling();
        return;
      }

      // Try Go2rtc WebRTC signaling for RTSP / H.264 streams
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            setStreamMode('webrtc');
            setIsLoading(false);
          }
        };

        // Go2rtc signaling WebSocket
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
            if (data.type === 'error') {
              console.warn('[CameraCard] WebRTC error from go2rtc:', data.value);
              // Codecs not matched or WebRTC unsupported for stream -> fallback to MJPEG
              if (config.streamName) {
                setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
                setStreamMode('mjpeg');
                setIsLoading(false);
              } else {
                startSnapshotPolling();
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
          if (config.streamName) {
            setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
            setStreamMode('mjpeg');
            setIsLoading(false);
          } else {
            startSnapshotPolling();
          }
        };

        // Timeout fallback to MJPEG or snapshot if WebRTC takes > 3s
        setTimeout(() => {
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            if (config.streamName) {
              setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
              setStreamMode('mjpeg');
              setIsLoading(false);
            } else {
              startSnapshotPolling();
            }
          }
        }, 3000);
      } catch {
        if (config.streamName) {
          setMjpegUrl(api.getStreamMjpegUrl(config.streamName));
          setStreamMode('mjpeg');
          setIsLoading(false);
        } else {
          startSnapshotPolling();
        }
      }
    } catch {
      startSnapshotPolling();
    }
  };

  useEffect(() => {
    if (isPlaying) {
      startStream();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isPlaying, activeContextId]);

  // 30s Countdown Timer
  useEffect(() => {
    if (!isPlaying || continuous) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }

    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsPlaying(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isPlaying, continuous]);

  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl overflow-hidden shadow-sm flex flex-col">
      {/* Header Bar */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          <Video size={16} className="text-[#00AE42]" />
          <span className="text-sm font-semibold text-[#F3F4F6]">Camera Feed</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Watchdog Status Chip in Header */}
          <button
            onClick={onOpenWatchdog}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all ${
              isAlert
                ? 'bg-[#EF4444]/20 border-[#EF4444] text-[#EF4444] animate-pulse'
                : watchdog?.online
                ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42]'
                : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8]'
            }`}
          >
            {isAlert ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
            <span>{watchdog?.online ? `AI Guard: ${Math.round((watchdog.confidence || 0) * 100)}%` : 'AI Guard: Idle'}</span>
          </button>

          {/* Capture Snapshot Button */}
          <button
            onClick={handleCaptureSnapshot}
            disabled={isCapturing}
            className="p-1 rounded-lg text-[#94A3B8] hover:text-[#F3F4F6] hover:bg-[#262626] transition-colors"
            title="Download Snapshot Image"
          >
            <Camera size={16} className={isCapturing ? 'animate-pulse text-[#00AE42]' : ''} />
          </button>

          {/* Fullscreen HUD Button */}
          <button
            onClick={onOpenHud}
            className="p-1 rounded-lg text-[#94A3B8] hover:text-[#F3F4F6] hover:bg-[#262626] transition-colors"
            title="Fullscreen Camera HUD"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Video View Stage (16:9 / 16:10 aspect ratio) */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden group">
        {/* WebRTC Video Stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain ${
            streamMode === 'webrtc' && isPlaying ? 'block' : 'hidden'
          }`}
        />

        {/* Live MJPEG Stream (Creator 5 Pro, Bambu Bridge, Adventurer 5M, etc.) */}
        {streamMode === 'mjpeg' && isPlaying && mjpegUrl && (
          <img
            src={mjpegUrl}
            alt="Live Camera Stream"
            className="w-full h-full object-contain"
            onLoad={() => {
              setIsLoading(false);
              if (errorMsg) setErrorMsg(null);
            }}
            onError={() => {
              console.warn('[CameraCard] MJPEG stream failed, falling back to snapshot polling');
              startSnapshotPolling();
            }}
          />
        )}

        {/* Snapshot Fallback */}
        {streamMode === 'snapshot' && isPlaying && snapshotUrl && (
          <img
            src={snapshotUrl}
            alt="Live Camera Snapshot"
            className="w-full h-full object-contain"
            onLoad={() => {
              setIsLoading(false);
              if (errorMsg) setErrorMsg(null);
            }}
            onError={() => {
              setErrorMsg('Camera stream or snapshot unavailable');
            }}
          />
        )}

        {/* Error / Standby Helper Overlay */}
        {errorMsg && isPlaying && !isLoading && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/40 flex items-center justify-center text-[#EF4444]">
              <Video size={20} />
            </div>
            <h4 className="text-xs font-bold text-[#F3F4F6]">Camera Feed Unavailable</h4>
            <p className="text-[11px] text-[#94A3B8] max-w-sm leading-relaxed">
              Flashforge printers only support 1 active camera stream. Please close FlashPrint or Flash Studio if open, or specify a Custom Camera URL in Settings if using Klipper/CFW.
            </p>
            <button
              onClick={() => {
                setErrorMsg(null);
                startStream();
              }}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Retry Stream</span>
            </button>
          </div>
        )}

        {/* Paused / Idle State Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <button
              onClick={() => {
                setIsPlaying(true);
                setCountdown(30);
              }}
              className="w-14 h-14 rounded-full bg-[#00AE42] hover:bg-[#009638] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
            >
              <Play size={24} className="ml-1" />
            </button>
            <p className="text-xs text-[#D1D5DB] font-medium">Stream Paused</p>
            <p className="text-[11px] text-[#94A3B8]">Click to resume 30-second live preview</p>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && isPlaying && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="text-[#00AE42] animate-spin" />
            <span className="text-xs text-[#94A3B8]">Connecting to camera stream...</span>
          </div>
        )}

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute top-3 left-3 bg-[#EF4444]/80 text-white text-xs px-2.5 py-1 rounded flex items-center gap-1.5">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Top-Right Badge: Live indicator + 30s Countdown / Continuous */}
        {isPlaying && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-xs">
            <span className="w-2 h-2 rounded-full bg-[#00AE42] shadow-[0_0_8px_#00AE42] animate-pulse" />
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider">LIVE</span>
            <span className="text-white/40">|</span>
            {continuous ? (
              <span className="flex items-center gap-1 text-[#00AE42] font-semibold text-[11px]">
                <InfinityIcon size={12} /> Auto
              </span>
            ) : (
              <span className="text-[#D1D5DB] font-mono text-[11px] font-semibold">{countdown}s</span>
            )}
          </div>
        )}

        {/* Top-Left Badge: Mode indicator */}
        {isPlaying && (
          <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-medium text-[#94A3B8] border border-white/5 uppercase">
            {streamMode === 'webrtc' ? 'Live HD' : 'Live Stream'}
          </div>
        )}
      </div>

      {/* Camera Controls Footer */}
      <div className="px-4 py-2.5 bg-[#262626]/50 flex items-center justify-between border-t border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          {/* Pause / Resume Button */}
          <button
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
              } else {
                setIsPlaying(true);
                setCountdown(30);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] text-xs font-medium text-[#F3F4F6] transition-colors"
          >
            {isPlaying ? (
              <>
                <Pause size={13} />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={13} />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Reconnect / Refresh Button */}
          <button
            onClick={() => {
              setIsPlaying(true);
              startStream();
            }}
            className="p-1.5 rounded-lg bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] text-[#94A3B8] hover:text-[#F3F4F6] transition-colors"
            title="Reconnect Stream"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Continuous Stream Toggle */}
        <button
          onClick={handleToggleContinuous}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            continuous
              ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42]'
              : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
          }`}
          title="Toggle continuous streaming without 30s timeout"
        >
          <InfinityIcon size={13} />
          <span>Continuous</span>
        </button>
      </div>
    </div>
  );
};

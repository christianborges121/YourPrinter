import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Maximize2,
  Play,
  Pause,
  RefreshCw,
  Infinity as InfinityIcon,
  ShieldAlert,
  Camera,
} from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';
import { getCameraContinuous, setCameraContinuous } from '../../services/config';
import { LedToggleButton } from '../common/LedToggleButton';

interface CameraCardProps {
  onOpenHud: () => void;
  onOpenWatchdog: () => void;
}

const MAX_MJPEG_RETRIES = 2;
const MJPEG_RETRY_DELAY_MS = 1000;
const MJPEG_LOAD_TIMEOUT_MS = 4500;
const SNAPSHOT_POLL_INTERVAL_MS = 1000;
const SNAPSHOT_ERROR_RETRY_MS = 2000;
const SNAPSHOT_FAILURE_THRESHOLD_WITH_FRAME = 3;
const SNAPSHOT_FAILURE_THRESHOLD_INITIAL = 2;

export const CameraCard: React.FC<CameraCardProps> = ({ onOpenHud, onOpenWatchdog }) => {
  const { activeContextId, status } = usePrinter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(30);
  const [continuous, setContinuous] = useState<boolean>(getCameraContinuous());
  const [streamMode, setStreamMode] = useState<'webrtc' | 'mjpeg' | 'snapshot'>('snapshot');
  const [mjpegUrl, setMjpegUrl] = useState<string>('');
  const [mjpegStreamName, setMjpegStreamName] = useState<string>('');
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');
  const [hasLoadedFrame, setHasLoadedFrame] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [restartNonce, setRestartNonce] = useState<number>(0);

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
  const webrtcFallbackTimerRef = useRef<number | null>(null);
  const mjpegRetryTimerRef = useRef<number | null>(null);
  const mjpegLoadTimeoutRef = useRef<number | null>(null);
  const mjpegRetryCountRef = useRef<number>(0);
  const snapshotPollTimerRef = useRef<number | null>(null);
  const snapshotAbortRef = useRef<AbortController | null>(null);
  const snapshotObjectUrlRef = useRef<string | null>(null);
  const consecutiveSnapshotErrorsRef = useRef<number>(0);
  const hasLoadedFrameRef = useRef<boolean>(false);
  const streamSessionRef = useRef<number>(0);
  const forceResetRef = useRef<boolean>(false);

  const clearMjpegTimers = () => {
    if (mjpegRetryTimerRef.current) {
      clearTimeout(mjpegRetryTimerRef.current);
      mjpegRetryTimerRef.current = null;
    }
    if (mjpegLoadTimeoutRef.current) {
      clearTimeout(mjpegLoadTimeoutRef.current);
      mjpegLoadTimeoutRef.current = null;
    }
  };

  const watchdog = status?.watchdog;
  const isAlert =
    Boolean(watchdog?.auto_pause_triggered) ||
    (Boolean(watchdog?.online) &&
      (watchdog?.confidence ?? 0) >= (watchdog?.threshold ?? 0.2) &&
      (watchdog?.consecutive_failures ?? 0) >= (watchdog?.consecutive_required ?? 2));

  // Toggle Continuous Streaming
  const handleToggleContinuous = () => {
    const next = !continuous;
    setContinuous(next);
    setCameraContinuous(next);
    if (next) {
      setCountdown(30);
    }
  };

  const closeWebRtcAndSignaling = () => {
    if (webrtcFallbackTimerRef.current) {
      clearTimeout(webrtcFallbackTimerRef.current);
      webrtcFallbackTimerRef.current = null;
    }
    if (signalingWsRef.current) {
      try {
        signalingWsRef.current.close(1000, 'Stream stopped');
      } catch {
        // ignore
      }
      signalingWsRef.current = null;
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {
            // ignore
          }
        });
        peerConnectionRef.current.getReceivers().forEach((r) => {
          try {
            r.track?.stop();
          } catch {
            // ignore
          }
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
            try {
              track.stop();
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }
      }
      videoRef.current.srcObject = null;
    }
  };

  // Teardown connections
  const stopStream = () => {
    streamSessionRef.current += 1;
    closeWebRtcAndSignaling();

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    clearMjpegTimers();
    if (snapshotPollTimerRef.current) {
      clearTimeout(snapshotPollTimerRef.current);
      snapshotPollTimerRef.current = null;
    }
    if (snapshotAbortRef.current) {
      try {
        snapshotAbortRef.current.abort();
      } catch {
        // ignore
      }
      snapshotAbortRef.current = null;
    }
    if (snapshotObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(snapshotObjectUrlRef.current);
      } catch {
        // ignore
      }
      snapshotObjectUrlRef.current = null;
    }
    mjpegRetryCountRef.current = 0;
    consecutiveSnapshotErrorsRef.current = 0;
    hasLoadedFrameRef.current = false;
    setHasLoadedFrame(false);
    setMjpegUrl('');
    setMjpegStreamName('');
    setSnapshotUrl('');
  };

  // Sequential snapshot polling with auth support, frame retention, and error hysteresis
  const startSnapshotPolling = (targetContextId: string | undefined, sessionId: number) => {
    if (streamSessionRef.current !== sessionId) return;

    closeWebRtcAndSignaling();
    clearMjpegTimers();
    if (snapshotPollTimerRef.current) {
      clearTimeout(snapshotPollTimerRef.current);
      snapshotPollTimerRef.current = null;
    }
    if (snapshotAbortRef.current) {
      try {
        snapshotAbortRef.current.abort();
      } catch {
        // ignore
      }
      snapshotAbortRef.current = null;
    }

    setMjpegUrl('');
    setStreamMode('snapshot');
    if (!hasLoadedFrameRef.current) {
      setIsLoading(true);
    }

    const pollOnce = async () => {
      if (streamSessionRef.current !== sessionId) return;

      const controller = new AbortController();
      snapshotAbortRef.current = controller;

      try {
        const blob = await api.fetchSnapshotBlob(targetContextId, {
          signal: controller.signal,
          cacheBuster: Date.now(),
        });

        if (streamSessionRef.current !== sessionId) return;
        if (!blob || blob.size === 0) {
          throw new Error('Empty snapshot payload');
        }

        const nextUrl = URL.createObjectURL(blob);
        const prevUrl = snapshotObjectUrlRef.current;
        snapshotObjectUrlRef.current = nextUrl;

        if (prevUrl) {
          window.setTimeout(() => {
            try {
              URL.revokeObjectURL(prevUrl);
            } catch {
              // ignore
            }
          }, 500);
        }

        consecutiveSnapshotErrorsRef.current = 0;
        hasLoadedFrameRef.current = true;
        setHasLoadedFrame(true);
        setSnapshotUrl(nextUrl);
        setIsLoading(false);
        setErrorMsg(null);

        snapshotPollTimerRef.current = window.setTimeout(() => {
          void pollOnce();
        }, SNAPSHOT_POLL_INTERVAL_MS);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError' || streamSessionRef.current !== sessionId) {
          return;
        }

        consecutiveSnapshotErrorsRef.current += 1;
        const failureThreshold = hasLoadedFrameRef.current
          ? SNAPSHOT_FAILURE_THRESHOLD_WITH_FRAME
          : SNAPSHOT_FAILURE_THRESHOLD_INITIAL;

        if (consecutiveSnapshotErrorsRef.current >= failureThreshold) {
          setIsLoading(false);
          setErrorMsg('Camera stream or snapshot unavailable');
        }

        snapshotPollTimerRef.current = window.setTimeout(() => {
          void pollOnce();
        }, SNAPSHOT_ERROR_RETRY_MS);
      }
    };

    void pollOnce();
  };

  const armMjpegLoadTimeout = (
    streamName: string,
    sessionId: number,
    targetContextId: string | undefined
  ) => {
    if (mjpegLoadTimeoutRef.current) {
      clearTimeout(mjpegLoadTimeoutRef.current);
    }
    mjpegLoadTimeoutRef.current = window.setTimeout(() => {
      mjpegLoadTimeoutRef.current = null;
      if (streamSessionRef.current !== sessionId || hasLoadedFrameRef.current) {
        return;
      }
      setMjpegUrl('');
      handleMjpegFailure(streamName, sessionId, targetContextId);
    }, MJPEG_LOAD_TIMEOUT_MS);
  };

  const handleMjpegFailure = (
    streamName: string,
    sessionId: number,
    targetContextId: string | undefined
  ) => {
    if (streamSessionRef.current !== sessionId) return;
    clearMjpegTimers();
    if (mjpegRetryCountRef.current < MAX_MJPEG_RETRIES && streamName) {
      mjpegRetryCountRef.current += 1;
      const attempt = mjpegRetryCountRef.current;
      console.warn(
        `[CameraCard] MJPEG stream interrupted, retrying (${attempt}/${MAX_MJPEG_RETRIES})...`
      );
      if (!hasLoadedFrameRef.current) {
        setIsLoading(true);
      }
      mjpegRetryTimerRef.current = window.setTimeout(async () => {
        if (streamSessionRef.current !== sessionId) return;
        if (attempt === 1) {
          await api.getCameraProxyConfig(targetContextId, { reset: true }).catch(() => {});
          if (streamSessionRef.current !== sessionId) return;
        }
        setMjpegUrl(api.getStreamMjpegUrl(streamName, Date.now()));
        if (!hasLoadedFrameRef.current) {
          armMjpegLoadTimeout(streamName, sessionId, targetContextId);
        }
      }, MJPEG_RETRY_DELAY_MS);
      return;
    }

    console.warn('[CameraCard] MJPEG stream failed, falling back to snapshot polling');
    startSnapshotPolling(targetContextId, sessionId);
  };

  const beginMjpegStream = (
    streamName: string,
    sessionId: number,
    targetContextId: string | undefined
  ) => {
    if (streamSessionRef.current !== sessionId) return;
    clearMjpegTimers();
    mjpegRetryCountRef.current = 0;
    setMjpegStreamName(streamName);
    setMjpegUrl(api.getStreamMjpegUrl(streamName, Date.now()));
    setStreamMode('mjpeg');
    if (!hasLoadedFrameRef.current) {
      setIsLoading(true);
      armMjpegLoadTimeout(streamName, sessionId, targetContextId);
    }
  };

  // Switch cleanly from WebRTC to MJPEG (or snapshot fallback) without leaving stale signaling open
  const fallbackFromWebRtc = (
    streamName: string | undefined,
    targetContextId: string | undefined,
    sessionId: number
  ) => {
    if (streamSessionRef.current !== sessionId) return;
    closeWebRtcAndSignaling();

    if (streamName) {
      beginMjpegStream(streamName, sessionId, targetContextId);
    } else {
      startSnapshotPolling(targetContextId, sessionId);
    }
  };

  // Connect WebRTC, MJPEG stream, or fallback to Snapshot
  const startStream = async (isCancelledCheck?: () => boolean) => {
    stopStream();
    const sessionId = streamSessionRef.current;
    const targetContextId = activeContextId || undefined;
    const isStale = () => Boolean(isCancelledCheck?.()) || streamSessionRef.current !== sessionId;

    setIsLoading(true);
    setErrorMsg(null);
    setCountdown(30);

    const shouldReset = forceResetRef.current;
    forceResetRef.current = false;

    try {
      const config = await api.getCameraProxyConfig(targetContextId, { reset: shouldReset });
      if (isStale()) return;

      if (!config.success) {
        startSnapshotPolling(targetContextId, sessionId);
        return;
      }

      // If camera stream is MJPEG (Creator 5 Pro, Bambu Bridge, Adventurer 5M, etc.), stream directly via go2rtc MJPEG
      if (config.mode === 'mjpeg' || config.streamType === 'mjpeg') {
        const streamName = config.streamName || `printer_${activeContextId || ''}`;
        beginMjpegStream(streamName, sessionId, targetContextId);
        return;
      }

      if (!config.wsUrl) {
        startSnapshotPolling(targetContextId, sessionId);
        return;
      }

      // Try Go2rtc WebRTC signaling for RTSP / H.264 streams
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          if (isStale()) return;
          if (webrtcFallbackTimerRef.current) {
            clearTimeout(webrtcFallbackTimerRef.current);
            webrtcFallbackTimerRef.current = null;
          }
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            hasLoadedFrameRef.current = true;
            setHasLoadedFrame(true);
            setStreamMode('webrtc');
            setIsLoading(false);
            setErrorMsg(null);
          }
        };

        // Go2rtc signaling WebSocket
        const wsUrl = config.wsUrl.startsWith('ws')
          ? config.wsUrl
          : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${config.wsUrl}`;

        const ws = new WebSocket(wsUrl);
        signalingWsRef.current = ws;

        ws.onopen = async () => {
          if (isStale()) {
            try {
              ws.close();
            } catch {
              // ignore
            }
            return;
          }
          try {
            const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
            if (isStale() || pc.signalingState === 'closed') {
              try {
                ws.close();
              } catch {
                // ignore
              }
              return;
            }
            await pc.setLocalDescription(offer);
            if (!isStale() && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
            }
          } catch {
            if (!isStale()) {
              fallbackFromWebRtc(config.streamName, targetContextId, sessionId);
            }
          }
        };

        ws.onmessage = async (evt) => {
          if (isStale()) return;
          try {
            const data = JSON.parse(evt.data);
            if (data.type === 'error') {
              console.warn('[CameraCard] WebRTC error from go2rtc:', data.value);
              fallbackFromWebRtc(config.streamName, targetContextId, sessionId);
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
          if (isStale()) return;
          fallbackFromWebRtc(config.streamName, targetContextId, sessionId);
        };

        // Timeout fallback to MJPEG or snapshot if WebRTC takes > 3s
        webrtcFallbackTimerRef.current = window.setTimeout(() => {
          if (isStale()) return;
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            fallbackFromWebRtc(config.streamName, targetContextId, sessionId);
          }
        }, 3000);
      } catch {
        if (isStale()) return;
        fallbackFromWebRtc(config.streamName, targetContextId, sessionId);
      }
    } catch {
      if (!isStale()) {
        startSnapshotPolling(targetContextId, sessionId);
      }
    }
  };

  useEffect(() => {
    let isCancelled = false;
    if (isPlaying) {
      void startStream(() => isCancelled);
    } else {
      stopStream();
    }
    return () => {
      isCancelled = true;
      stopStream();
    };
  }, [isPlaying, activeContextId, restartNonce]);

  // 30s Countdown Timer
  useEffect(() => {
    if (!isPlaying || continuous || !hasLoadedFrame || isLoading || errorMsg) {
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
  }, [isPlaying, continuous, hasLoadedFrame, isLoading, errorMsg]);

  const handleMjpegError = () => {
    handleMjpegFailure(mjpegStreamName, streamSessionRef.current, activeContextId || undefined);
  };

  const handleRestartStream = () => {
    forceResetRef.current = true;
    setErrorMsg(null);
    setCountdown(30);
    setIsPlaying(true);
    setRestartNonce((prev) => prev + 1);
  };

  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl overflow-hidden shadow-sm flex flex-col">
      {/* Header Bar */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          <Video size={16} className="text-[#00AE42]" />
          <span className="text-sm font-semibold text-[#F3F4F6]">Camera Feed</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Watchdog Alert Pill (only displayed when defect alert active to avoid duplicating sticky header) */}
          {isAlert && (
            <button
              onClick={onOpenWatchdog}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#EF4444]/20 border border-[#EF4444] text-[#EF4444] animate-pulse"
            >
              <ShieldAlert size={12} />
              <span>AI Alert: {Math.round((watchdog?.confidence || 0) * 100)}%</span>
            </button>
          )}

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
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F3F4F6] hover:bg-[#262626] transition-colors"
            title={isPlaying ? 'Pause Stream' : 'Play Stream (30s)'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>

          {/* Reconnect / Refresh Button */}
          <button
            onClick={handleRestartStream}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F3F4F6] hover:bg-[#262626] transition-colors"
            title="Reconnect Stream"
          >
            <RefreshCw size={14} />
          </button>

          {/* Continuous Stream Toggle */}
          <button
            onClick={handleToggleContinuous}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
              continuous
                ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42]'
                : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
            }`}
            title="Toggle continuous streaming without 30s timeout"
          >
            <InfinityIcon size={13} />
            <span className="hidden sm:inline text-[11px]">Auto</span>
          </button>

          {/* Chamber Lighting Quick Toggle */}
          <LedToggleButton />

          {/* Capture Snapshot Button */}
          <button
            onClick={handleCaptureSnapshot}
            disabled={isCapturing}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F3F4F6] hover:bg-[#262626] transition-colors"
            title="Download Snapshot Image"
          >
            <Camera size={15} className={isCapturing ? 'animate-pulse text-[#00AE42]' : ''} />
          </button>

          {/* Fullscreen HUD Button */}
          <button
            onClick={onOpenHud}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F3F4F6] hover:bg-[#262626] transition-colors"
            title="Fullscreen Camera HUD"
          >
            <Maximize2 size={15} />
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
            className={`w-full h-full object-contain ${hasLoadedFrame ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => {
              clearMjpegTimers();
              mjpegRetryCountRef.current = 0;
              hasLoadedFrameRef.current = true;
              setHasLoadedFrame(true);
              setIsLoading(false);
              if (errorMsg) setErrorMsg(null);
            }}
            onError={handleMjpegError}
          />
        )}

        {/* Snapshot Fallback (Object URLs updated sequentially) */}
        {streamMode === 'snapshot' && isPlaying && snapshotUrl && (
          <img
            src={snapshotUrl}
            alt="Live Camera Snapshot"
            className={`w-full h-full object-contain ${hasLoadedFrame ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => {
              hasLoadedFrameRef.current = true;
              setHasLoadedFrame(true);
              setIsLoading(false);
              if (errorMsg) setErrorMsg(null);
            }}
            onError={() => {
              consecutiveSnapshotErrorsRef.current += 1;
              const threshold = hasLoadedFrameRef.current
                ? SNAPSHOT_FAILURE_THRESHOLD_WITH_FRAME
                : SNAPSHOT_FAILURE_THRESHOLD_INITIAL;
              if (consecutiveSnapshotErrorsRef.current >= threshold) {
                setIsLoading(false);
                setErrorMsg('Camera stream or snapshot unavailable');
              }
            }}
          />
        )}

        {/* Error / Standby Helper Overlay */}
        {errorMsg && isPlaying && !isLoading && (
          <div className="absolute inset-0 z-10 bg-black/85 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/40 flex items-center justify-center text-[#EF4444]">
              <Video size={20} />
            </div>
            <h4 className="text-xs font-bold text-[#F3F4F6]">Camera Feed Unavailable</h4>
            <p className="text-[11px] text-[#94A3B8] max-w-sm leading-relaxed">
              Flashforge printers only support 1 active camera stream. Please close FlashPrint or Flash Studio if open, or specify a Custom Camera URL in Settings if using Klipper/CFW.
            </p>
            <button
              onClick={handleRestartStream}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Retry Stream</span>
            </button>
          </div>
        )}

        {/* Paused / Idle State Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 z-10 bg-black/75 flex flex-col items-center justify-center gap-3 p-4 text-center">
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
          <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="text-[#00AE42] animate-spin" />
            <span className="text-xs text-[#94A3B8]">Connecting to camera stream...</span>
          </div>
        )}

        {/* Top-Right Badge: Live indicator + 30s Countdown / Continuous */}
        {isPlaying && !isLoading && !errorMsg && hasLoadedFrame && (
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
        {isPlaying && !isLoading && !errorMsg && hasLoadedFrame && (
          <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-medium text-[#94A3B8] border border-white/5 uppercase">
            {streamMode === 'webrtc' ? 'Live HD' : 'Live Stream'}
          </div>
        )}
      </div>
    </div>
  );
};

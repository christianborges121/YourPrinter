import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../core/constants/api_endpoints.dart';
import '../core/network/api_client.dart';

enum CameraPlayState { idle, connecting, streaming, paused, busy, offline }

class CameraStreamService extends ChangeNotifier {
  final ApiClient apiClient;
  final RTCVideoRenderer renderer = RTCVideoRenderer();

  RTCPeerConnection? _peerConnection;
  WebSocketChannel? _signalingChannel;
  StreamSubscription? _signalingSubscription;
  Timer? _snapshotPollTimer;

  CameraPlayState state = CameraPlayState.idle;
  String? concurrencyNotice;
  int remainingSeconds = 30;
  bool continuousOverride = false;

  Uint8List? lastJpegBytes;
  bool isMjpeg = false;

  Timer? _healthCheckTimer;
  Timer? _countdownTimer;
  bool _framesVerified = false;
  String? _activeContextId;

  CameraStreamService({required this.apiClient});

  Future<void> initRenderer() async {
    await renderer.initialize();
  }

  void showConnectingState() {
    _teardownActiveConnection();
    state = CameraPlayState.connecting;
    notifyListeners();
  }

  Future<void> startStream({String? contextId}) async {
    _teardownActiveConnection();
    state = CameraPlayState.connecting;
    _framesVerified = false;
    _activeContextId = contextId;
    notifyListeners();

    try {
      final query = contextId != null ? {'contextId': contextId} : <String, dynamic>{};
      final response = await apiClient.get(ApiEndpoints.cameraProxyConfig, queryParameters: query);
      final data = response.data as Map<String, dynamic>;

      if (data['success'] != true || data['wsUrl'] == null) {
        state = CameraPlayState.offline;
        notifyListeners();
        return;
      }

      concurrencyNotice = data['concurrencyNotice'] as String?;
      final String relativeWsUrl = data['wsUrl'] as String;
      final String fullWsUrl = apiClient.buildWebSocketUrl(relativeWsUrl);
      final String? directWsUrl = data['directWsUrl'] as String?;
      final String? streamType = data['streamType'] as String?;

      // 1. Connect go2rtc WebSocket signaling channel
      bool attemptedDirectFallback = false;
      void connectSignaling(String targetWsUrl) {
        debugPrint('[CameraSignaling] Connecting to: $targetWsUrl');
        _signalingChannel = WebSocketChannel.connect(Uri.parse(targetWsUrl));

        _signalingSubscription = _signalingChannel!.stream.listen(
          (dynamic message) async {
            // Binary message => MJPEG frame stream from go2rtc!
            if (message is List<int>) {
              lastJpegBytes = message is Uint8List ? message : Uint8List.fromList(message);
              _markStreamLive();
              notifyListeners();
              return;
            }

            if (message is! String) return;
            try {
              final Map<String, dynamic> msg = jsonDecode(message);
              final String? type = msg['type'] as String?;

              if (type == 'webrtc/answer') {
                final String sdp = msg['value'] as String;
                await _peerConnection?.setRemoteDescription(RTCSessionDescription(sdp, 'answer'));
              } else if (type == 'webrtc/candidate') {
                final String candidateStr = msg['value'] as String;
                if (candidateStr.isNotEmpty) {
                  await _peerConnection?.addCandidate(RTCIceCandidate(candidateStr, '0', 0));
                }
              } else if (type == 'error') {
                final errVal = (msg['value'] as String? ?? '').toLowerCase();
                debugPrint('[CameraSignaling] go2rtc returned error: $errVal');
                // When go2rtc cannot match WebRTC codecs (e.g. video:JPEG), switch to binary MJPEG over WebSocket!
                if (errVal.contains('codecs not matched') || errVal.contains('webrtc/offer')) {
                  debugPrint('[CameraSignaling] Codecs not matched for WebRTC. Switching to MJPEG streaming...');
                  _startMjpegMode();
                  return;
                }
                _triggerBusyState();
              }
            } catch (e) {
              debugPrint('[CameraSignaling] Error parsing message: $e');
            }
          },
          onError: (err) {
            debugPrint('[CameraSignaling] WebSocket stream error: $err');
            if (!attemptedDirectFallback && directWsUrl != null && directWsUrl.isNotEmpty) {
              attemptedDirectFallback = true;
              debugPrint('[CameraSignaling] Attempting direct fallback to $directWsUrl');
              connectSignaling(directWsUrl);
            } else {
              _startSnapshotFallback(contextId);
            }
          },
          onDone: () {
            debugPrint('[CameraSignaling] WebSocket channel closed (onDone)');
            if (!_framesVerified) {
              _startSnapshotFallback(contextId);
            }
          },
        );
      }

      connectSignaling(fullWsUrl);

      // If already known as MJPEG, request mjpeg stream immediately
      if (streamType == 'mjpeg') {
        _startMjpegMode();
      } else {
        // Otherwise attempt WebRTC first
        _peerConnection = await createPeerConnection({
          'iceServers': [
            {'urls': ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']}
          ],
          'sdpSemantics': 'unified-plan',
        });

        await _peerConnection!.addTransceiver(
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          init: RTCRtpTransceiverInit(direction: TransceiverDirection.RecvOnly),
        );

        _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
          if (candidate.candidate != null && candidate.candidate!.isNotEmpty) {
            _signalingChannel?.sink.add(jsonEncode({
              'type': 'webrtc/candidate',
              'value': candidate.candidate,
            }));
          }
        };

        _peerConnection!.onTrack = (RTCTrackEvent event) {
          if (event.track.kind == 'video') {
            if (event.streams.isNotEmpty) {
              renderer.srcObject = event.streams.first;
            }
            _markStreamLive();
          }
        };

        _peerConnection!.onConnectionState = (RTCPeerConnectionState pcState) {
          if (pcState == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
              pcState == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
            if (!_framesVerified) {
              _startMjpegMode();
            }
          }
        };

        final RTCSessionDescription offer = await _peerConnection!.createOffer({});
        await _peerConnection!.setLocalDescription(offer);
        _signalingChannel!.sink.add(jsonEncode({
          'type': 'webrtc/offer',
          'value': offer.sdp,
        }));
      }

      // Start health check timer
      _healthCheckTimer = Timer(const Duration(seconds: 12), () {
        if (!_framesVerified) {
          _startSnapshotFallback(contextId);
        }
      });
    } catch (e) {
      debugPrint('[CameraStream] Stream creation failed: $e');
      _startSnapshotFallback(contextId);
    }
  }

  void _startMjpegMode() {
    isMjpeg = true;
    _peerConnection?.close();
    _peerConnection = null;
    try {
      _signalingChannel?.sink.add(jsonEncode({'type': 'mjpeg'}));
    } catch (e) {
      debugPrint('[CameraStream] Error sending mjpeg request: $e');
      _startSnapshotFallback(_activeContextId);
    }
  }

  void _startSnapshotFallback(String? contextId) {
    if (_framesVerified && state == CameraPlayState.streaming) return;

    debugPrint('[CameraStream] Starting snapshot polling fallback...');
    _snapshotPollTimer?.cancel();
    _snapshotPollTimer = Timer.periodic(const Duration(milliseconds: 600), (_) async {
      try {
        final query = contextId != null ? {'contextId': contextId} : null;
        final res = await apiClient.get<List<int>>(
          ApiEndpoints.cameraSnapshot,
          queryParameters: query,
          options: Options(responseType: ResponseType.bytes),
        );
        if (res.data != null && res.data!.isNotEmpty) {
          lastJpegBytes = Uint8List.fromList(res.data!);
          isMjpeg = true;
          _markStreamLive();
          notifyListeners();
        }
      } catch (e) {
        // If snapshot also fails, trigger busy state
        if (!_framesVerified) {
          _triggerBusyState();
        }
      }
    });
  }

  void _markStreamLive() {
    if (_framesVerified) return;
    _framesVerified = true;
    _healthCheckTimer?.cancel();
    state = CameraPlayState.streaming;
    _startStreamCountdown();
    notifyListeners();
  }

  void _triggerBusyState() {
    _teardownActiveConnection();
    state = CameraPlayState.busy;
    notifyListeners();
  }

  void pauseStream({bool dueToTimeout = false}) {
    _teardownActiveConnection();
    state = CameraPlayState.paused;
    notifyListeners();
  }

  void setContinuousOverride(bool override) {
    continuousOverride = override;
    if (state == CameraPlayState.streaming) {
      if (continuousOverride) {
        _countdownTimer?.cancel();
      } else {
        _startStreamCountdown();
      }
    }
    notifyListeners();
  }

  void _startStreamCountdown() {
    _countdownTimer?.cancel();
    if (continuousOverride) return;

    remainingSeconds = 30;
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        pauseStream(dueToTimeout: true);
      } else {
        notifyListeners();
      }
    });
  }

  void _teardownActiveConnection() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = null;
    _countdownTimer?.cancel();
    _countdownTimer = null;
    _snapshotPollTimer?.cancel();
    _snapshotPollTimer = null;
    _signalingSubscription?.cancel();
    _signalingSubscription = null;
    _signalingChannel?.sink.close();
    _signalingChannel = null;
    renderer.srcObject = null;
    _peerConnection?.close();
    _peerConnection = null;
    lastJpegBytes = null;
    isMjpeg = false;
  }

  @override
  void dispose() {
    _teardownActiveConnection();
    renderer.dispose();
    super.dispose();
  }
}

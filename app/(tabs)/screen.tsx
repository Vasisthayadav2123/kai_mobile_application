import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Path } from 'react-native-svg';
import { getServerUrl, getWebRtcUrl, getServerIp, fetchWithAuth, SERVER_PORT, WEBRTC_PORT } from '@/constants/server';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Inline SVG Icons ─────────────────────────────────────────────
const PreviousIcon = ({ color = '#fff', size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
  </Svg>
);

const PlayPauseIcon = ({ color = '#fff', size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7L8 5z" />
  </Svg>
);

const NextIcon = ({ color = '#fff', size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
  </Svg>
);

const VolumeUpIcon = ({ color = '#fff', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.49 4.49 0 0 0 2.5-3.5zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </Svg>
);

const VolumeDownIcon = ({ color = '#fff', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M18.5 12A4.5 4.5 0 0 0 16 8.5v7a4.49 4.49 0 0 0 2.5-3.5zM5 9v6h4l5 5V4L9 9H5z" />
  </Svg>
);

const MuteIcon = ({ color = '#fff', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M16.5 12A4.5 4.5 0 0 0 14 8.5v2.09l2.41 2.41c.06-.31.09-.63.09-.97zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4l-2.1 2.1L12 8.2V4z" />
  </Svg>
);

// ─── WebRTC viewer HTML ───────────────────────────────────────────
const getWebRTCHtml = (serverUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      font-family: system-ui;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    #status {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #00e5ff;
      font-size: 13px;
      text-align: center;
      z-index: 10;
    }
    #status.hidden { display: none; }
    .spinner {
      width: 28px; height: 28px;
      border: 2px solid rgba(0,229,255,0.15);
      border-top-color: #00e5ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 10px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="status">
    <div class="spinner"></div>
    Connecting to stream…
  </div>
  <video id="remoteVideo" autoplay playsinline></video>

  <script>
    const statusEl = document.getElementById('status');
    const videoEl  = document.getElementById('remoteVideo');
    const SERVER   = '${serverUrl}';

    let pc = null;
    let reconnectTimer = null;
    let retryCount = 0;
    const MAX_RETRIES = 50;
    let isMuted = true;

    // Start muted, unmute on first user gesture via RN message
    videoEl.muted = true;

    function log(msg) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', data: msg }));
    }

    function setStatus(msg, show) {
      statusEl.textContent = msg;
      statusEl.className = show ? '' : 'hidden';
    }

    async function connect() {
      try {
        if (pc) { pc.close(); pc = null; }

        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          log('Track received: ' + event.track.kind);
          if (event.streams && event.streams[0]) {
            videoEl.srcObject = event.streams[0];
          } else {
            const stream = videoEl.srcObject || new MediaStream();
            stream.addTrack(event.track);
            videoEl.srcObject = stream;
          }
          setStatus('', false);
          retryCount = 0;
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'connected' }));
        };

        pc.oniceconnectionstatechange = () => {
          log('ICE state: ' + pc.iceConnectionState);
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'iceState', data: pc.iceConnectionState })
          );
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            scheduleReconnect();
          }
        };

        pc.onicecandidate = async (event) => {
          if (event.candidate === null) {
            const offer = pc.localDescription;
            log('Sending offer to server');
            const response = await fetch(SERVER + '/offer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
            });
            const answer = await response.json();
            log('Got answer from server');
            await pc.setRemoteDescription(answer);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        log('Offer created, gathering ICE candidates…');
        setStatus('Connecting…', true);
      } catch (err) {
        log('Connection error: ' + err.message);
        setStatus('Connection failed', true);
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (reconnectTimer) return;
      if (retryCount >= MAX_RETRIES) {
        setStatus('Could not connect to server', true);
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', data: 'Max retries reached' }));
        return;
      }
      retryCount++;
      const delay = Math.min(2000 * retryCount, 10000);
      log('Reconnecting in ' + delay + 'ms (attempt ' + retryCount + ')');
      setStatus('Reconnecting… (' + retryCount + ')', true);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    // Listen for messages from React Native (reconnect, mute/unmute)
    window.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.action === 'reconnect') {
          retryCount = 0;
          connect();
        } else if (msg.action === 'toggleMute') {
          videoEl.muted = !videoEl.muted;
          isMuted = videoEl.muted;
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'muteState', data: videoEl.muted })
          );
        } else if (msg.action === 'unmute') {
          videoEl.muted = false;
          isMuted = false;
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'muteState', data: false })
          );
        }
      } catch (_) {}
    });

    connect();
  </script>
</body>
</html>
`;

// ─── Media action types ───────────────────────────────────────────
type MediaAction = 'playpause' | 'next' | 'previous' | 'volumeup' | 'volumedown';

// ─── Main Screen Component ────────────────────────────────────────
export default function ScreenShare() {
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('connecting');
  const [showOverlay, setShowOverlay] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const webviewRef = useRef<WebView>(null);
  const overlayAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide overlay after 4 seconds
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowOverlay(false));
    }, 4000);
  }, [overlayAnim]);

  // Status dot pulse
  useEffect(() => {
    if (connectionState === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
      scheduleHide();
    } else {
      pulseAnim.setValue(0);
    }
  }, [connectionState]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'connected':
          setConnectionState('connected');
          break;
        case 'iceState':
          if (msg.data === 'connected' || msg.data === 'completed') {
            setConnectionState('connected');
          } else if (msg.data === 'disconnected' || msg.data === 'failed') {
            setConnectionState('disconnected');
          }
          break;
        case 'error':
          setConnectionState('error');
          break;
        case 'muteState':
          setIsMuted(msg.data);
          break;
        case 'log':
          console.log('[WebRTC]', msg.data);
          break;
      }
    } catch {}
  }, []);

  const handleReconnect = useCallback(() => {
    setConnectionState('connecting');
    webviewRef.current?.injectJavaScript(`
      retryCount = 0;
      connect();
      true;
    `);
  }, []);

  const toggleOverlay = useCallback(() => {
    if (showOverlay) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowOverlay(false));
    } else {
      setShowOverlay(true);
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      scheduleHide();
    }
  }, [showOverlay, overlayAnim, scheduleHide]);

  const toggleMute = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
      window.postMessage(JSON.stringify({ action: 'toggleMute' }), '*');
      true;
    `);
    // Reset auto-hide timer on interaction
    scheduleHide();
  }, [scheduleHide]);

  const sendControl = useCallback(async (action: MediaAction) => {
    try {
      const res = await fetchWithAuth(`${getServerUrl()}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.warn('Control error:', err.message);
      }
    } catch (e) {
      console.warn('Control request failed:', e);
    }
    // Reset auto-hide timer on interaction
    scheduleHide();
  }, [scheduleHide]);

  const statusColor =
    connectionState === 'connected'
      ? '#3dfc58'
      : connectionState === 'connecting'
      ? '#ffb300'
      : '#ff1744';

  const statusLabel =
    connectionState === 'connected'
      ? 'LIVE'
      : connectionState === 'connecting'
      ? 'CONNECTING'
      : connectionState === 'error'
      ? 'ERROR'
      : 'OFFLINE';

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ─── Fullscreen WebRTC Video ──────────────────────────── */}
      <WebView
        ref={webviewRef}
        source={{ html: getWebRTCHtml(getWebRtcUrl()) }}
        style={styles.fullscreenWebView}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        onMessage={handleWebViewMessage}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />

      {/* ─── Tap Target (over the video) ─────────────────────── */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={toggleOverlay}
      />

      {/* ─── Connection Overlay (spinner) ─────────────────────── */}
      {connectionState === 'connecting' && (
        <View style={styles.connectingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#00e5ff" />
          <Text style={styles.connectingText}>Connecting to stream…</Text>
        </View>
      )}

      {/* ─── Top Status Bar (floating) ────────────────────────── */}
      {showOverlay && (
        <Animated.View style={[styles.topBar, { opacity: overlayAnim }]} pointerEvents="box-none">
          <View style={styles.statusPill}>
            <Animated.View
              style={[
                styles.statusDot,
                {
                  backgroundColor: statusColor,
                  opacity: connectionState === 'connected'
                    ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] })
                    : 1,
                },
              ]}
            />
            <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          <View style={styles.topRight}>
            {/* Mute/Unmute button */}
            <TouchableOpacity style={styles.iconBtn} onPress={toggleMute}>
              {isMuted ? (
                <MuteIcon color="#ff5252" size={20} />
              ) : (
                <VolumeUpIcon color="#fff" size={20} />
              )}
            </TouchableOpacity>

            {/* Reconnect button */}
            {(connectionState === 'disconnected' || connectionState === 'error') && (
              <TouchableOpacity style={styles.reconnectBtn} onPress={handleReconnect}>
                <Text style={styles.reconnectText}>RECONNECT</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}

      {/* ─── Bottom Media Controls Bar (floating) ─────────────── */}
      {showOverlay && (
        <Animated.View style={[styles.bottomBar, { opacity: overlayAnim }]}>
          {/* Server info */}
          <View style={styles.serverRow}>
            <Text style={styles.serverTag}>STREAM</Text>
            <Text style={styles.serverAddr}>{getServerIp()}:{WEBRTC_PORT}</Text>
            <Text style={[styles.serverTag, { marginLeft: 10 }]}>CTRL</Text>
            <Text style={styles.serverAddr}>{getServerIp()}:{SERVER_PORT}</Text>
          </View>

          {/* Media Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => sendControl('volumedown')}
              disabled={connectionState !== 'connected'}
            >
              <VolumeDownIcon color="#a0aec0" size={18} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => sendControl('previous')}
              disabled={connectionState !== 'connected'}
            >
              <PreviousIcon color="#e2e8f0" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, styles.playBtn]}
              onPress={() => sendControl('playpause')}
              disabled={connectionState !== 'connected'}
            >
              <PlayPauseIcon color="#000" size={26} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => sendControl('next')}
              disabled={connectionState !== 'connected'}
            >
              <NextIcon color="#e2e8f0" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => sendControl('volumeup')}
              disabled={connectionState !== 'connected'}
            >
              <VolumeUpIcon color="#a0aec0" size={18} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenWebView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // ─── Connecting Overlay ───
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    zIndex: 5,
  },
  connectingText: {
    color: '#00e5ff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ─── Top Bar ───
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 36 : 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 8,
    borderRadius: 20,
  },
  reconnectBtn: {
    borderWidth: 1,
    borderColor: '#00e5ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reconnectText: {
    color: '#00e5ff',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // ─── Bottom Bar ───
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingBottom: Platform.OS === 'android' ? 16 : 30,
    paddingTop: 12,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 14,
  },
  serverTag: {
    color: '#555',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  serverAddr: {
    color: '#666',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  controlBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  playBtn: {
    backgroundColor: '#00e5ff',
    borderColor: '#00e5ff',
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
});
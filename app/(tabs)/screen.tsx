import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import MediaControls from '@/components/media-controls';
import { SERVER_URL, SERVER_IP, SERVER_PORT, WEBRTC_URL, WEBRTC_PORT } from '@/constants/server';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WEBRTC_VIEWER_ASPECT = 16 / 9;
const VIEWER_WIDTH = SCREEN_WIDTH - 32;
const VIEWER_HEIGHT = VIEWER_WIDTH / WEBRTC_VIEWER_ASPECT;

// ─── WebRTC viewer HTML injected into WebView ─────────────────────
const getWebRTCHtml = (serverUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
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
      font-size: 14px;
      text-align: center;
      z-index: 10;
    }
    #status.hidden { display: none; }
    .spinner {
      width: 24px; height: 24px;
      border: 2px solid rgba(0,229,255,0.2);
      border-top-color: #00e5ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="status">
    <div class="spinner"></div>
    Connecting to stream…
  </div>
  <video id="remoteVideo" autoplay playsinline muted></video>

  <script>
    const statusEl = document.getElementById('status');
    const videoEl  = document.getElementById('remoteVideo');
    const SERVER   = '${serverUrl}';

    let pc = null;
    let reconnectTimer = null;
    let retryCount = 0;
    const MAX_RETRIES = 50;

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
            const stream = new MediaStream();
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
            // All ICE candidates gathered; send the offer
            const offer = pc.localDescription;
            log('Sending offer to server');
            const response = await fetch(SERVER + '/offer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
              }),
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

    // Listen for messages from React Native
    window.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.action === 'reconnect') {
          retryCount = 0;
          connect();
        }
      } catch (_) {}
    });

    // Start
    connect();
  </script>
</body>
</html>
`;

// ─── Main Screen Component ────────────────────────────────────────
export default function ScreenShare() {
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('connecting');
  const [showControls, setShowControls] = useState(true);
  const webviewRef = useRef<WebView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Status dot pulse animation
  useEffect(() => {
    if (connectionState === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
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

  const toggleControls = useCallback(() => {
    const toValue = showControls ? 0 : 1;
    Animated.timing(fadeAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setShowControls(!showControls);
  }, [showControls, fadeAnim]);

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
      : 'DISCONNECTED';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>SCREEN SHARE</Text>
          <View style={styles.statusRow}>
            <Animated.View
              style={[
                styles.statusDot,
                {
                  backgroundColor: statusColor,
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.3],
                  }),
                },
              ]}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        {(connectionState === 'disconnected' || connectionState === 'error') && (
          <TouchableOpacity style={styles.reconnectBtn} onPress={handleReconnect}>
            <Text style={styles.reconnectText}>RECONNECT</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* WebRTC Video Viewer */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={toggleControls}
        style={styles.videoContainer}
      >
        <View style={styles.videoFrame}>
          <WebView
            ref={webviewRef}
            source={{ html: getWebRTCHtml(WEBRTC_URL) }}
            style={styles.webview}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            onMessage={handleWebViewMessage}
            originWhitelist={['*']}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
          />

          {/* Connection overlay */}
          {connectionState === 'connecting' && (
            <View style={styles.overlay}>
              <ActivityIndicator size="small" color="#00e5ff" />
              <Text style={styles.overlayText}>Connecting to stream…</Text>
            </View>
          )}
        </View>

        {/* Tap hint */}
        <Text style={styles.tapHint}>
          {showControls ? 'Tap video to hide controls' : 'Tap video to show controls'}
        </Text>
      </TouchableOpacity>

      {/* Media Controls */}
      <Animated.View style={[styles.controlsWrapper, { opacity: fadeAnim }]}>
        {showControls && <MediaControls disabled={connectionState !== 'connected'} />}
      </Animated.View>

      {/* Server Info */}
      <View style={styles.serverInfo}>
        <Text style={styles.serverLabel}>STREAM</Text>
        <Text style={styles.serverUrl}>{SERVER_IP}:{WEBRTC_PORT}</Text>
        <Text style={[styles.serverLabel, { marginLeft: 12 }]}>CTRL</Text>
        <Text style={styles.serverUrl}>{SERVER_IP}:{SERVER_PORT}</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    gap: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  reconnectBtn: {
    borderWidth: 1,
    borderColor: '#00e5ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reconnectText: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  videoContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  videoFrame: {
    width: VIEWER_WIDTH,
    height: VIEWER_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    // Glow effect
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 4,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  overlayText: {
    color: '#00e5ff',
    fontSize: 12,
    fontWeight: '600',
  },
  tapHint: {
    color: '#333',
    fontSize: 10,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  controlsWrapper: {
    marginTop: 4,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 12,
    marginTop: 'auto',
  },
  serverLabel: {
    color: '#333',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  serverUrl: {
    color: '#444',
    fontSize: 9,
    fontFamily: 'monospace',
  },
});
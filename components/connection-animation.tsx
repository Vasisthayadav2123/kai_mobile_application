import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { performHandshake, addHandshakeListener, HandshakeStep } from '@/constants/server';

const { width: W, height: H } = Dimensions.get('window');
const CX = W / 2;
const TOP_Y = H * 0.22;   // server icon position
const BOT_Y = H * 0.58;   // phone icon position

type VisualStep =
  | 'idle'
  | 'locating'        // finding server
  | 'server_found'    // server online
  | 'challenge_sent'  // server sends key number down to phone
  | 'key_lookup'      // phone looks up key
  | 'bullet_fired'    // phone shoots key back up
  | 'verifying'       // server checking
  | 'connected'       // done
  | 'failed';

const STEP_LABELS: Record<VisualStep, string> = {
  idle: 'INITIALIZING INTERFACE...',
  locating: 'LOCATING SERVER...',
  server_found: 'SERVER ONLINE',
  challenge_sent: 'SERVER REQUESTING KEY...',
  key_lookup: 'MATCHING KEY FOUND',
  bullet_fired: 'TRANSMITTING KEY ●●●',
  verifying: 'SERVER VERIFYING...',
  connected: 'CONNECTION ESTABLISHED',
  failed: 'CONNECTION FAILED',
};

interface Props {
  onComplete: () => void;
}

export default function ConnectionAnimation({ onComplete }: Props) {
  const [step, setStep] = useState<VisualStep>('idle');
  const [keyNumber, setKeyNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Animated values
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const serverGlow = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;
  const challengeBullet = useRef(new Animated.Value(0)).current;  // 0=server, 1=phone
  const responseBullet = useRef(new Animated.Value(0)).current;   // 0=phone, 1=server
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const stepTextOpacity = useRef(new Animated.Value(1)).current;
  const connectedScale = useRef(new Animated.Value(0)).current;
  const pulseRing = useRef(new Animated.Value(0)).current;
  const scanAnimLoop = useRef<Animated.CompositeAnimation | null>(null);

  const particleAnims = useRef(
    Array.from({ length: 8 }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  // Text transition helper
  const transitionText = (nextStep: VisualStep) => {
    Animated.sequence([
      Animated.timing(stepTextOpacity, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.delay(50),
    ]).start(() => {
      setStep(nextStep);
      Animated.timing(stepTextOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  const handleHandshakeStep = useCallback(async (handshakeStep: HandshakeStep, data?: any) => {
    switch (handshakeStep) {
      case 'locating':
        transitionText('locating');
        
        // Start the scanline looping animation
        if (scanAnimLoop.current) {
          scanAnimLoop.current.stop();
        }
        scanAnimLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(scanLine, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(scanLine, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ])
        );
        scanAnimLoop.current.start();
        break;

      case 'server_found':
        // Stop scanning
        if (scanAnimLoop.current) {
          scanAnimLoop.current.stop();
        }
        scanLine.setValue(0);
        
        transitionText('server_found');
        Animated.timing(serverGlow, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        break;

      case 'challenge_received':
        setKeyNumber(`#${data?.key_number}`);
        transitionText('challenge_sent');
        
        // Fire challenge bullet from server to phone
        challengeBullet.setValue(0);
        Animated.timing(challengeBullet, {
          toValue: 1,
          duration: 700,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }).start();
        break;

      case 'key_lookup':
        transitionText('key_lookup');
        break;

      case 'bullet_fired':
        transitionText('bullet_fired');
        
        // Fire response bullet from phone back to server
        responseBullet.setValue(0);
        Animated.timing(responseBullet, {
          toValue: 1,
          duration: 600,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }).start();
        break;

      case 'verifying':
        transitionText('verifying');
        break;

      case 'connected':
        transitionText('connected');

        // Explosion particles
        particleAnims.forEach((p, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const dist = 60 + Math.random() * 40;
          Animated.parallel([
            Animated.timing(p.opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.sequence([
              Animated.delay(300),
              Animated.timing(p.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]),
          ]).start();
        });

        // Connected badge scale in
        Animated.spring(connectedScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();

        // Pulse ring
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseRing, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulseRing, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        ).start();

        await new Promise(r => setTimeout(r, 2000));

        // Fade out complete screen
        Animated.timing(bgOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
          onComplete();
        });
        break;

      case 'failed':
        if (scanAnimLoop.current) {
          scanAnimLoop.current.stop();
        }
        setErrorMsg(data?.error || 'Unknown network error');
        transitionText('failed');
        break;
    }
  }, [onComplete]);

  // Handle retry
  const handleRetry = () => {
    setErrorMsg('');
    setStep('idle');
    performHandshake().catch(err => {
      console.warn('[Handshake Retry Failed]', err);
    });
  };

  useEffect(() => {
    // 1. Subscribe to the global handshake events
    const unsubscribe = addHandshakeListener(({ step: nextStep, data }) => {
      handleHandshakeStep(nextStep, data);
    });

    // 2. Trigger handshake
    performHandshake().catch(err => {
      console.warn('[Initial Handshake Trigger Failed]', err);
    });

    return () => {
      unsubscribe();
      if (scanAnimLoop.current) {
        scanAnimLoop.current.stop();
      }
    };
  }, [handleHandshakeStep]);

  // Interpolated positions for bullets
  const challengeY = challengeBullet.interpolate({
    inputRange: [0, 1],
    outputRange: [TOP_Y, BOT_Y],
  });

  const responseY = responseBullet.interpolate({
    inputRange: [0, 1],
    outputRange: [BOT_Y, TOP_Y],
  });

  const bulletTrailOpacity = responseBullet.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 1, 0.3],
  });

  const scanLineY = scanLine.interpolate({
    inputRange: [0, 1],
    outputRange: [TOP_Y - 30, TOP_Y + 30],
  });

  return (
    <Animated.View style={[styles.container, { opacity: bgOpacity }]}>
      {/* Background grid lines */}
      <View style={styles.gridOverlay}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLine, { top: i * (H / 20) }]} />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: i * (W / 10) }]} />
        ))}
      </View>

      {/* Title */}
      <Animated.View style={[styles.titleRow, { opacity: statusOpacity }]}>
        <Text style={styles.titleText}>KAI SECURE LINK</Text>
        <Text style={styles.subtitleText}>CHALLENGE-RESPONSE PROTOCOL</Text>
      </Animated.View>

      {/* Server Icon */}
      <Animated.View style={[styles.iconWrap, { top: TOP_Y - 30, opacity: statusOpacity }]}>
        <Animated.View style={[styles.glowRing, {
          opacity: serverGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }),
          transform: [{ scale: serverGlow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.3] }) }],
        }]} />
        <View style={styles.serverBox}>
          <Svg width={36} height={36} viewBox="0 0 24 24" fill="#00e5ff">
            <Rect x="2" y="2" width="20" height="6" rx="1" fill="#00e5ff" opacity={0.9} />
            <Circle cx="6" cy="5" r="1" fill="#050505" />
            <Circle cx="9" cy="5" r="1" fill="#050505" />
            <Rect x="2" y="10" width="20" height="6" rx="1" fill="#00e5ff" opacity={0.6} />
            <Circle cx="6" cy="13" r="1" fill="#050505" />
            <Rect x="2" y="18" width="20" height="4" rx="1" fill="#00e5ff" opacity={0.3} />
          </Svg>
        </View>
        <Text style={styles.nodeLabel}>SERVER</Text>
      </Animated.View>

      {/* Connection line between server and phone */}
      <View style={styles.connLine}>
        <View style={styles.dashedLine} />
      </View>

      {/* Scan line (locating phase) */}
      {step === 'locating' && (
        <Animated.View style={[styles.scanBar, { transform: [{ translateY: scanLineY }] }]} />
      )}

      {/* Challenge bullet (server → phone) */}
      {(step === 'challenge_sent') && (
        <Animated.View style={[styles.bullet, styles.bulletChallenge, {
          transform: [{ translateY: challengeY }, { translateX: -6 }],
          left: CX,
        }]} />
      )}

      {/* Response bullet (phone → server) — the "shot" */}
      {(step === 'bullet_fired') && (
        <>
          <Animated.View style={[styles.bullet, styles.bulletResponse, {
            transform: [{ translateY: responseY }, { translateX: -6 }],
            left: CX,
          }]} />
          {/* Trail */}
          <Animated.View style={[styles.bulletTrail, {
            opacity: bulletTrailOpacity,
            top: BOT_Y - 20,
            height: BOT_Y - TOP_Y - 20,
          }]} />
        </>
      )}

      {/* Phone Icon */}
      <Animated.View style={[styles.iconWrap, { top: BOT_Y - 30, opacity: statusOpacity }]}>
        <View style={styles.phoneBox}>
          <Svg width={30} height={40} viewBox="0 0 24 36" fill="none">
            <Rect x="3" y="1" width="18" height="34" rx="3" stroke="#3dfc58" strokeWidth="1.5" fill="rgba(61,252,88,0.08)" />
            <Rect x="5" y="5" width="14" height="22" fill="rgba(61,252,88,0.15)" />
            <Circle cx="12" cy="31" r="2" fill="#3dfc58" opacity={0.5} />
          </Svg>
        </View>
        <Text style={[styles.nodeLabel, { color: '#3dfc58' }]}>YOUR DEVICE</Text>
        {keyNumber ? (
          <Animated.Text style={[styles.keyBadge, { opacity: stepTextOpacity }]}>
            KEY {keyNumber}
          </Animated.Text>
        ) : null}
      </Animated.View>

      {/* Connected explosion particles */}
      {step === 'connected' && particleAnims.map((p, i) => (
        <Animated.View
          key={i}
          style={[styles.particle, {
            left: CX,
            top: (TOP_Y + BOT_Y) / 2,
            opacity: p.opacity,
            transform: [{ translateX: p.x }, { translateY: p.y }],
          }]}
        />
      ))}

      {/* Connected pulse ring */}
      {step === 'connected' && (
        <Animated.View style={[styles.pulseRingView, {
          top: (TOP_Y + BOT_Y) / 2 - 40,
          left: CX - 40,
          opacity: pulseRing.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: pulseRing.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
        }]} />
      )}

      {/* Connected checkmark */}
      {step === 'connected' && (
        <Animated.View style={[styles.checkWrap, {
          top: (TOP_Y + BOT_Y) / 2 - 20,
          transform: [{ scale: connectedScale }],
        }]}>
          <Svg width={40} height={40} viewBox="0 0 24 24">
            <Circle cx="12" cy="12" r="11" fill="#3dfc58" opacity={0.15} />
            <Path d="M7 13l3 3 7-7" stroke="#3dfc58" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Animated.View>
      )}

      {/* Step Label */}
      <Animated.View style={[styles.stepLabelWrap, { opacity: stepTextOpacity }]}>
        <Text style={[
          styles.stepLabel,
          step === 'connected' && styles.stepLabelSuccess,
          step === 'failed' && styles.stepLabelFail,
        ]}>
          {STEP_LABELS[step]}
        </Text>
        {errorMsg ? (
          <Text style={styles.errorSubText}>{errorMsg}</Text>
        ) : null}
        
        {step === 'failed' && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryText}>RETRY CONNECTION</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Bottom decorative bar */}
      <View style={styles.bottomBar}>
        <Text style={styles.bottomText}>KAI PROTOCOL v3.1</Text>
        <View style={[styles.bottomDot, {
          backgroundColor: step === 'connected' ? '#3dfc58' : step === 'failed' ? '#ff1744' : '#00e5ff'
        }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030308',
    zIndex: 100,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,229,255,0.03)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,229,255,0.03)',
  },
  titleRow: {
    position: 'absolute',
    top: H * 0.08,
    alignSelf: 'center',
    alignItems: 'center',
  },
  titleText: {
    color: '#00e5ff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },
  subtitleText: {
    color: 'rgba(0,229,255,0.35)',
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 4,
  },
  iconWrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    width: W,
  },
  glowRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,229,255,0.12)',
    top: -22,
  },
  serverBox: {
    backgroundColor: 'rgba(0,229,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    borderRadius: 10,
    padding: 10,
  },
  phoneBox: {
    backgroundColor: 'rgba(61,252,88,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(61,252,88,0.2)',
    borderRadius: 10,
    padding: 8,
  },
  nodeLabel: {
    color: '#00e5ff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 8,
  },
  keyBadge: {
    color: '#3dfc58',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
    backgroundColor: 'rgba(61,252,88,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  connLine: {
    position: 'absolute',
    left: CX,
    top: TOP_Y + 35,
    width: 1,
    height: BOT_Y - TOP_Y - 70,
    alignItems: 'center',
  },
  dashedLine: {
    width: 1,
    height: '100%',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,229,255,0.12)',
    borderStyle: 'dashed',
  },
  scanBar: {
    position: 'absolute',
    left: CX - 40,
    width: 80,
    height: 2,
    backgroundColor: '#00e5ff',
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  bullet: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  bulletChallenge: {
    backgroundColor: '#00e5ff',
    shadowColor: '#00e5ff',
  },
  bulletResponse: {
    backgroundColor: '#3dfc58',
    shadowColor: '#3dfc58',
  },
  bulletTrail: {
    position: 'absolute',
    left: CX - 1,
    width: 2,
    backgroundColor: 'rgba(61,252,88,0.3)',
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3dfc58',
  },
  pulseRingView: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#3dfc58',
  },
  checkWrap: {
    position: 'absolute',
    alignSelf: 'center',
    left: CX - 20,
  },
  stepLabelWrap: {
    position: 'absolute',
    bottom: H * 0.14,
    alignSelf: 'center',
    width: W,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  stepLabel: {
    color: '#00e5ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  stepLabelSuccess: {
    color: '#3dfc58',
  },
  stepLabelFail: {
    color: '#ff1744',
  },
  errorSubText: {
    color: 'rgba(255, 23, 68, 0.6)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
    maxWidth: W * 0.8,
  },
  retryBtn: {
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#00e5ff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 229, 255, 0.04)',
  },
  retryText: {
    color: '#00e5ff',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bottomText: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 8,
    letterSpacing: 2,
  },
  bottomDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});

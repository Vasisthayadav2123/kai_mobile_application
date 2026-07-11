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
  | 'challenge_sent'  // server summons missiles
  | 'key_lookup'      // server fires, device dodges
  | 'bullet_fired'    // device draws pistol and shoots
  | 'verifying'       // server hit and teleports
  | 'connected'       // handshake and done
  | 'failed';

const STEP_LABELS: Record<VisualStep, string> = {
  idle: 'INITIALIZING INTERFACE...',
  locating: 'LOCATING SERVER...',
  server_found: 'SERVER ONLINE',
  challenge_sent: 'SUMMONING DEFENSES...',
  key_lookup: 'EVADING ATTACK!',
  bullet_fired: 'COUNTER-ATTACK INITIATED',
  verifying: 'RE-ESTABLISHING SECURE GATEWAY...',
  connected: 'AUTHENTICATION COMPLETED',
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
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const stepTextOpacity = useRef(new Animated.Value(1)).current;
  const connectedScale = useRef(new Animated.Value(0)).current;
  const pulseRing = useRef(new Animated.Value(0)).current;
  const scanAnimLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Dodge translation
  const deviceX = useRef(new Animated.Value(0)).current;

  // Server Y translation and shake/teleport values
  const serverTranslateY = useRef(new Animated.Value(0)).current;
  const serverOpacity = useRef(new Animated.Value(1)).current;
  const serverShake = useRef(new Animated.Value(0)).current;

  // 4 Missiles (starting positions at server)
  const missiles = useRef([
    new Animated.ValueXY({ x: CX, y: TOP_Y }),
    new Animated.ValueXY({ x: CX, y: TOP_Y }),
    new Animated.ValueXY({ x: CX, y: TOP_Y }),
    new Animated.ValueXY({ x: CX, y: TOP_Y }),
  ]).current;
  const missilesOpacity = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // Pistol & Pistol Bullet
  const pistolOpacity = useRef(new Animated.Value(0)).current;
  const pistolScale = useRef(new Animated.Value(0)).current;
  const pistolBulletY = useRef(new Animated.Value(BOT_Y)).current;
  const pistolBulletOpacity = useRef(new Animated.Value(0)).current;

  // Handshake
  const handshakeScale = useRef(new Animated.Value(0)).current;
  const handshakeOpacity = useRef(new Animated.Value(0)).current;

  const particleAnims = useRef(
    Array.from({ length: 8 }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  // Keep track of the latest step and data received from the backend handshake
  const backendState = useRef<{ step: HandshakeStep; data?: any }>({ step: 'locating' });

  // A helper to await a specific backend step (or beyond)
  const awaitBackendStep = async (targetStep: HandshakeStep) => {
    const stepOrder: HandshakeStep[] = [
      'locating',
      'server_found',
      'challenge_received',
      'key_lookup',
      'bullet_fired',
      'verifying',
      'connected',
    ];
    const targetIdx = stepOrder.indexOf(targetStep);

    while (true) {
      if (backendState.current.step === 'failed') {
        throw new Error(backendState.current.data?.error || 'Connection failed');
      }
      const currentIdx = stepOrder.indexOf(backendState.current.step);
      if (currentIdx >= targetIdx) {
        break;
      }
      // Check again in 50ms
      await new Promise(r => setTimeout(r, 50));
    }
  };

  // Reset animation values to starting states
  const resetAnimationValues = useCallback(() => {
    serverGlow.setValue(0);
    scanLine.setValue(0);
    statusOpacity.setValue(1);
    stepTextOpacity.setValue(1);
    connectedScale.setValue(0);
    pulseRing.setValue(0);
    bgOpacity.setValue(1);
    setKeyNumber('');
    deviceX.setValue(0);
    serverTranslateY.setValue(0);
    serverOpacity.setValue(1);
    serverShake.setValue(0);
    pistolOpacity.setValue(0);
    pistolScale.setValue(0);
    pistolBulletY.setValue(BOT_Y);
    pistolBulletOpacity.setValue(0);
    handshakeScale.setValue(0);
    handshakeOpacity.setValue(0);
    missiles.forEach(m => {
      m.x.setValue(CX);
      m.y.setValue(TOP_Y);
    });
    missilesOpacity.forEach(mo => mo.setValue(0));
  }, [
    serverGlow,
    scanLine,
    statusOpacity,
    stepTextOpacity,
    connectedScale,
    pulseRing,
    bgOpacity,
    deviceX,
    serverTranslateY,
    serverOpacity,
    serverShake,
    pistolOpacity,
    pistolScale,
    pistolBulletY,
    pistolBulletOpacity,
    handshakeScale,
    handshakeOpacity,
    missiles,
    missilesOpacity,
  ]);

  // Text transition helper
  const transitionText = useCallback((nextStep: VisualStep) => {
    return new Promise<void>(resolve => {
      Animated.sequence([
        Animated.timing(stepTextOpacity, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.delay(50),
      ]).start(() => {
        setStep(nextStep);
        Animated.timing(stepTextOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => resolve());
      });
    });
  }, [stepTextOpacity]);

  // Start the visual flow sequentially, awaiting animation steps and backend status
  const startVisualFlow = useCallback(async () => {
    try {
      // 1. Locating
      await transitionText('locating');
      if (scanAnimLoop.current) {
        scanAnimLoop.current.stop();
      }
      scanLine.setValue(0);
      scanAnimLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLine, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scanLine, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      scanAnimLoop.current.start();

      // Scan for at least 1.5 seconds and wait for backend to find server
      await Promise.all([
        awaitBackendStep('server_found'),
        new Promise(r => setTimeout(r, 1500)),
      ]);

      // 2. Server Found
      if (scanAnimLoop.current) {
        scanAnimLoop.current.stop();
      }
      scanLine.setValue(0);
      await transitionText('server_found');

      const serverGlowAnim = new Promise<void>(resolve => {
        Animated.timing(serverGlow, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => resolve());
      });

      // Wait for server glow and challenge to be received, minimum 1.0s
      await Promise.all([
        awaitBackendStep('challenge_received'),
        serverGlowAnim,
        new Promise(r => setTimeout(r, 1000)),
      ]);

      // Get the key number from the backend response
      const keyNum = backendState.current.data?.key_number || '';
      setKeyNumber(`#${keyNum}`);

      // 3. Server summons 4 missiles
      await transitionText('challenge_sent');
      missiles.forEach(m => {
        m.x.setValue(CX);
        m.y.setValue(TOP_Y);
      });
      missilesOpacity.forEach(mo => mo.setValue(1));

      const summonAnims = missiles.map((m, idx) => {
        // Spawn offsets surrounding the server
        const offsetX = [-45, -20, 20, 45][idx];
        const offsetY = [-25, -45, -45, -25][idx];
        return Animated.parallel([
          Animated.spring(m.x, { toValue: CX + offsetX, friction: 5, useNativeDriver: true }),
          Animated.spring(m.y, { toValue: TOP_Y + offsetY, friction: 5, useNativeDriver: true }),
        ]);
      });

      const summonAnimPromise = new Promise<void>(resolve => {
        Animated.parallel(summonAnims).start(() => resolve());
      });

      await Promise.all([
        awaitBackendStep('key_lookup'),
        summonAnimPromise,
        new Promise(r => setTimeout(r, 1200)),
      ]);

      // 4. Server shoots missiles, Device dodges
      await transitionText('key_lookup');

      const fireAnims = missiles.map((m, idx) => {
        // Fly down past the device position
        const targetX = CX + [-75, -25, 25, 75][idx];
        return Animated.parallel([
          Animated.timing(m.y, {
            toValue: BOT_Y + 120,
            duration: 800,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
          Animated.timing(m.x, {
            toValue: targetX,
            duration: 800,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(600),
            Animated.timing(missilesOpacity[idx], { toValue: 0, duration: 200, useNativeDriver: true }),
          ]),
        ]);
      });

      // Evade animation (left, then right, then center)
      const evadeAnim = Animated.sequence([
        Animated.timing(deviceX, { toValue: -65, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(deviceX, { toValue: 65, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(deviceX, { toValue: 0, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]);

      const fireAndEvadePromise = new Promise<void>(resolve => {
        Animated.parallel([...fireAnims, evadeAnim]).start(() => resolve());
      });

      await Promise.all([
        awaitBackendStep('bullet_fired'),
        fireAndEvadePromise,
        new Promise(r => setTimeout(r, 1000)),
      ]);

      // 5. Device pulls out a pistol and shoots the server
      await transitionText('bullet_fired');
      pistolOpacity.setValue(1);
      
      const drawPistolPromise = new Promise<void>(resolve => {
        Animated.spring(pistolScale, { toValue: 1, friction: 4, useNativeDriver: true }).start(() => resolve());
      });
      await drawPistolPromise;
      await new Promise(r => setTimeout(r, 400));

      // Fire bullet from phone back to server
      pistolBulletY.setValue(BOT_Y - 20);
      pistolBulletOpacity.setValue(1);

      await Promise.all([
        awaitBackendStep('verifying'),
        new Promise<void>(resolve => {
          Animated.timing(pistolBulletY, {
            toValue: TOP_Y - 10,
            duration: 400,
            easing: Easing.linear,
            useNativeDriver: true,
          }).start(() => resolve());
        }),
      ]);

      // Bullet hits server: flash/shake server, show sparks, hide bullet
      pistolBulletOpacity.setValue(0);
      Animated.timing(pistolOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();

      const serverShakeAnimPromise = new Promise<void>(resolve => {
        Animated.sequence([
          Animated.timing(serverShake, { toValue: 12, duration: 50, useNativeDriver: true }),
          Animated.timing(serverShake, { toValue: -12, duration: 50, useNativeDriver: true }),
          Animated.timing(serverShake, { toValue: 8, duration: 50, useNativeDriver: true }),
          Animated.timing(serverShake, { toValue: -8, duration: 50, useNativeDriver: true }),
          Animated.timing(serverShake, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start(() => resolve());
      });

      // Hit particles
      particleAnims.forEach((p, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 35 + Math.random() * 15;
        p.x.setValue(0);
        p.y.setValue(0);
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(200),
            Animated.timing(p.opacity, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]),
        ]).start();
      });

      await Promise.all([
        serverShakeAnimPromise,
        new Promise(r => setTimeout(r, 800)),
      ]);

      // 6. Server teleports in front of the device
      await transitionText('verifying');
      
      // Teleport out
      await new Promise<void>(resolve => {
        Animated.timing(serverOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => resolve());
      });

      // Change Y translation
      serverTranslateY.setValue(BOT_Y - TOP_Y - 75);

      // Teleport in
      await new Promise<void>(resolve => {
        Animated.timing(serverOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => resolve());
      });

      await new Promise(r => setTimeout(r, 500));

      // 7. Shaking hands (Handshake completes auth)
      await transitionText('connected');

      const handshakeAnimPromise = new Promise<void>(resolve => {
        Animated.parallel([
          Animated.spring(handshakeScale, { toValue: 1, friction: 5, useNativeDriver: true }),
          Animated.timing(handshakeOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start(() => resolve());
      });

      // Handshake sparkles/particles
      particleAnims.forEach((p, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 55 + Math.random() * 25;
        p.x.setValue(0);
        p.y.setValue(0);
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(250),
            Animated.timing(p.opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          ]),
        ]).start();
      });

      // Looping pulse ring
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseRing, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseRing, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();

      await Promise.all([
        awaitBackendStep('connected'),
        handshakeAnimPromise,
        new Promise(r => setTimeout(r, 2200)),
      ]);

      // Fade out complete overlay
      Animated.timing(bgOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        onComplete();
      });

    } catch (err: any) {
      if (scanAnimLoop.current) {
        scanAnimLoop.current.stop();
      }
      setErrorMsg(err.message || 'Connection failed');
      await transitionText('failed');
    }
  }, [
    onComplete,
    particleAnims,
    pulseRing,
    bgOpacity,
    scanLine,
    serverGlow,
    transitionText,
    missiles,
    missilesOpacity,
    deviceX,
    pistolOpacity,
    pistolScale,
    pistolBulletY,
    pistolBulletOpacity,
    serverTranslateY,
    serverOpacity,
    serverShake,
    handshakeOpacity,
    handshakeScale,
  ]);

  const handleBackendStep = useCallback((step: HandshakeStep, data?: any) => {
    backendState.current = {
      step,
      data: data ? { ...backendState.current.data, ...data } : backendState.current.data,
    };
  }, []);

  // Handle retry
  const handleRetry = () => {
    setErrorMsg('');
    backendState.current = { step: 'locating' };
    resetAnimationValues();
    startVisualFlow();
    performHandshake().catch(err => {
      console.warn('[Handshake Retry Failed]', err);
    });
  };

  useEffect(() => {
    // 1. Subscribe to the global handshake events
    const unsubscribe = addHandshakeListener(({ step: nextStep, data }) => {
      handleBackendStep(nextStep, data);
    });

    // 2. Initial trigger
    backendState.current = { step: 'locating' };
    resetAnimationValues();
    startVisualFlow();

    performHandshake().catch(err => {
      console.warn('[Initial Handshake Trigger Failed]', err);
    });

    return () => {
      unsubscribe();
      if (scanAnimLoop.current) {
        scanAnimLoop.current.stop();
      }
    };
  }, [handleBackendStep, startVisualFlow, resetAnimationValues]);

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
      <Animated.View style={[
        styles.iconWrap,
        {
          top: TOP_Y - 30,
          opacity: Animated.multiply(statusOpacity, serverOpacity),
          transform: [
            { translateY: serverTranslateY },
            { translateX: serverShake },
          ],
        },
      ]}>
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
      {step !== 'verifying' && step !== 'connected' && (
        <View style={styles.connLine}>
          <View style={styles.dashedLine} />
        </View>
      )}

      {/* Scan line (locating phase) */}
      {step === 'locating' && (
        <Animated.View style={[styles.scanBar, { transform: [{ translateY: scanLineY }] }]} />
      )}

      {/* 4 Summoned Missiles (Long and Pointy) */}
      {missiles.map((m, idx) => (
        <Animated.View
          key={`missile-${idx}`}
          style={[
            styles.missile,
            {
              left: m.x,
              top: m.y,
              opacity: missilesOpacity[idx],
            },
          ]}
        >
          <Svg width={14} height={36} viewBox="0 0 14 36" fill="none">
            {/* Pointy tip/nosecone */}
            <Path d="M7 0L12 12H2L7 0Z" fill="#ff1744" />
            {/* Long body */}
            <Rect x="2" y="12" width="10" height="18" fill="#ff1744" />
            {/* Fins */}
            <Path d="M2 24L0 30H2V24Z" fill="#d50000" />
            <Path d="M12 24L14 30H12V24Z" fill="#d50000" />
            {/* Flame/Thruster trail */}
            <Path d="M4 30L7 36L10 30H4Z" fill="#ffea00" />
          </Svg>
        </Animated.View>
      ))}

      {/* Device Pistol */}
      <Animated.View style={[
        styles.pistolContainer,
        {
          top: BOT_Y - 20,
          left: CX + 25,
          opacity: pistolOpacity,
          transform: [{ scale: pistolScale }],
        },
      ]}>
        <Svg width={28} height={18} viewBox="0 0 28 18" fill="none">
          {/* Gun handle */}
          <Path d="M6 8L2 18H8L10 10" stroke="#3dfc58" strokeWidth={2.5} strokeLinejoin="round" />
          {/* Gun barrel & body */}
          <Rect x="8" y="2" width="18" height="7" rx="1.5" fill="#3dfc58" />
          {/* Laser scope/sight */}
          <Rect x="12" y="0" width="8" height="2" fill="#00e5ff" />
          {/* Trigger guard */}
          <Circle cx="8" cy="10" r="3" stroke="#3dfc58" strokeWidth={1.5} />
        </Svg>
      </Animated.View>

      {/* Pistol Bullet */}
      <Animated.View style={[
        styles.pistolBullet,
        {
          top: pistolBulletY,
          left: CX,
          opacity: pistolBulletOpacity,
        },
      ]} />

      {/* Phone Icon */}
      <Animated.View style={[
        styles.iconWrap,
        {
          top: BOT_Y - 30,
          opacity: statusOpacity,
          transform: [{ translateX: deviceX }],
        },
      ]}>
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

      {/* Teleport handshake sparkles */}
      {particleAnims.map((p, i) => (
        <Animated.View
          key={`sparkle-${i}`}
          style={[styles.particle, {
            left: CX,
            top: BOT_Y - 50,
            opacity: p.opacity,
            transform: [{ translateX: p.x }, { translateY: p.y }],
          }]}
        />
      ))}

      {/* Teleport handshake pulse ring */}
      <Animated.View style={[styles.pulseRingView, {
        top: BOT_Y - 90,
        left: CX - 40,
        opacity: pulseRing.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
        transform: [{ scale: pulseRing.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
      }]} />

      {/* Handshake Icon */}
      <Animated.View style={[
        styles.handshakeWrap,
        {
          top: BOT_Y - 55,
          left: CX - 30,
          opacity: handshakeOpacity,
          transform: [{ scale: handshakeScale }],
        },
      ]}>
        <Svg width={60} height={60} viewBox="0 0 60 60" fill="none">
          <Circle cx="30" cy="30" r="28" fill="rgba(61,252,88,0.1)" stroke="#3dfc58" strokeWidth={1} opacity={0.8} />
          <Path d="M22 34C24 32 26 27 30 27C34 27 35 31 38 31C41 31 43 28 45 26" stroke="#3dfc58" strokeWidth={3} strokeLinecap="round" />
          <Path d="M16 32C19 32 20 34 22 34C24 34 25 36 28 36C31 36 32 33 34 32" stroke="#3dfc58" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
        </Svg>
      </Animated.View>

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
          backgroundColor: step === 'connected' ? '#3dfc58' : step === 'failed' ? '#ff1744' : '#00e5ff',
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
  missile: {
    position: 'absolute',
    width: 14,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -7,
    marginTop: -18,
  },
  pistolContainer: {
    position: 'absolute',
    width: 28,
    height: 18,
    zIndex: 110,
    marginLeft: -14,
    marginTop: -9,
  },
  pistolBullet: {
    position: 'absolute',
    width: 4,
    height: 15,
    backgroundColor: '#3dfc58',
    shadowColor: '#3dfc58',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    borderRadius: 2,
    marginLeft: -2,
  },
  handshakeWrap: {
    position: 'absolute',
    width: 60,
    height: 60,
    zIndex: 120,
  },
});

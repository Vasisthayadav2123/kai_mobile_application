import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getServerUrl, fetchWithAuth } from '@/constants/server';
import { useIsFocused } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const COLORS = {
  bg:         '#030308',
  cardBg:     '#0f1923',
  cardBorder: '#1a2d3d',
  textPrimary:'#e8ecf1',
  textSec:    '#7a8fa3',
  textDim:    '#4a5f73',
  accent:     '#f0845e',   // coral
  cyan:       '#00e5ff',   // listening
  green:      '#3dfc58',   // speaking
  coral:      '#f0845e',   // thinking/processing
  white:      '#ffffff',
};

type AssistantState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export default function AssistantScreen() {
  const [state, setState] = useState<AssistantState>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [queryText, setQueryText] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const isFocused = useIsFocused();

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const visualizerBars = useRef(
    Array.from({ length: 9 }, () => new Animated.Value(4))
  ).current;

  // Sound playback state listener to detect completion
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish && !status.isLooping) {
      stopSpeaking();
    }
  };

  // Keep track of speaking state to stop loops
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    if (state === 'speaking') {
      isSpeakingRef.current = true;
      animateVisualizer();
    } else {
      isSpeakingRef.current = false;
      // Reset visualizer bars
      visualizerBars.forEach(bar => {
        Animated.spring(bar, {
          toValue: 4,
          friction: 6,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [state]);

  // Request permissions on mount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const audioPerm = await Audio.requestPermissionsAsync();
        if (!audioPerm.granted) {
          console.warn('[KAI Voice] Microphone permission denied');
        }
      } catch (err) {
        console.error('[KAI Voice] Error requesting microphone permissions:', err);
      }
    };
    requestPermissions();

    // Configure Audio settings for recording and speaker playback
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldRouteThroughEarpieceIOS: false,
    }).catch(err => {
      console.warn('[KAI Voice] Failed to configure audio mode:', err);
    });

    return () => {
      // Cleanup audio objects on unmount
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // Handle exiting focus / navigating away
  useEffect(() => {
    if (!isFocused) {
      // Stop everything when screen loses focus
      if (state === 'listening') {
        stopRecording(false);
      } else if (state === 'speaking') {
        stopSpeaking();
      }
    }
  }, [isFocused]);

  // Glowing orb idle/breathing animation
  useEffect(() => {
    let animationLoop: Animated.CompositeAnimation | null = null;
    
    if (state === 'idle') {
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animationLoop.start();
    } else if (state === 'listening') {
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animationLoop.start();
    } else if (state === 'processing') {
      pulseAnim.setValue(1.1);
      // Run loader rotation
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else if (state === 'speaking') {
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animationLoop.start();
    }

    return () => {
      if (animationLoop) {
        animationLoop.stop();
      }
      rotateAnim.setValue(0);
    };
  }, [state]);

  // Speaking Visualizer Bar animation loop
  const animateVisualizer = () => {
    if (!isSpeakingRef.current) return;

    const animations = visualizerBars.map((bar) => {
      const minVal = 6;
      const maxVal = 55;
      const targetHeight = minVal + Math.random() * (maxVal - minVal);
      const duration = 75 + Math.random() * 80;

      return Animated.sequence([
        Animated.timing(bar, {
          toValue: targetHeight,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(bar, {
          toValue: minVal,
          duration,
          useNativeDriver: false,
        })
      ]);
    });

    Animated.parallel(animations).start(() => {
      if (isSpeakingRef.current) {
        animateVisualizer();
      }
    });
  };

  // Helper to color components based on state
  const getStateColor = () => {
    switch (state) {
      case 'listening': return COLORS.cyan;
      case 'processing': return COLORS.coral;
      case 'speaking': return COLORS.green;
      case 'error': return COLORS.accent;
      default: return COLORS.textDim;
    }
  };

  // Trigger audio recording
  const startRecording = async () => {
    try {
      setErrorMsg('');
      setQueryText('');
      setReplyText('');

      // Stop current playback if speaking
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Request permission again just in case
      const permission = await Audio.getPermissionsAsync();
      if (!permission.granted) {
        const ask = await Audio.requestPermissionsAsync();
        if (!ask.granted) {
          setState('error');
          setErrorMsg('Microphone permission required.');
          return;
        }
      }

      // Configure audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldRouteThroughEarpieceIOS: false,
      });

      const newRecording = new Audio.Recording();
      
      // Select High Quality Recording Preset
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      
      setRecording(newRecording);
      setState('listening');
    } catch (err: any) {
      console.error('[KAI Voice] Failed to start recording:', err);
      setState('error');
      setErrorMsg(`Failed to start microphone: ${err.message || String(err)}`);
    }
  };

  // Stop recording and process
  const stopRecording = async (shouldUpload = true) => {
    if (!recording) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setState('processing');

      await recording.stopAndUnloadAsync();
      const fileUri = recording.getURI();
      setRecording(null);

      // Re-configure audio mode back to playback-ready so output speaker is loud
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldRouteThroughEarpieceIOS: false,
      });

      if (!shouldUpload || !fileUri) {
        setState('idle');
        return;
      }

      await uploadAudioFile(fileUri);
    } catch (err: any) {
      console.error('[KAI Voice] Failed to stop recording:', err);
      setState('error');
      setErrorMsg('Failed to process recording.');
    }
  };

  // Upload file and call LLM voice service
  const uploadAudioFile = async (uri: string) => {
    try {
      const formData = new FormData();
      // Extract file details for React Native FormData
      const filename = uri.split('/').pop() || 'speech.m4a';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `audio/${match[1]}` : `audio/m4a`;

      formData.append('audio_data', {
        uri,
        name: filename,
        type,
      } as any);

      console.log('[KAI Voice] Uploading voice package to server...', uri);

      const serverUrl = `${getServerUrl()}/api/command/voice`;
      const response = await fetchWithAuth(serverUrl, {
        method: 'POST',
        body: formData,
        headers: {
          // fetchWithAuth will attach the session Bearer token.
          // Do NOT set Content-Type header so the browser/fetch client sets it with boundaries correctly
        },
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      console.log('[KAI Voice] Server response metadata:', data);

      if (data.status === 'error') {
        throw new Error(data.message || 'Server processing failed');
      }

      const transcription = data.query || '';
      const reply = data.reply || '';
      const audioPath = data.mp3;

      setQueryText(transcription);
      setReplyText(reply);

      if (audioPath) {
        setState('speaking');
        playSpeechResponse(`${getServerUrl()}${audioPath}`);
      } else {
        setState('idle');
      }
    } catch (err: any) {
      console.error('[KAI Voice] Voice backend query failed:', err);
      setState('error');
      setErrorMsg(err.message || 'Network connection failed.');
    }
  };

  // Play audio response via expo-av
  const playSpeechResponse = async (audioUrl: string) => {
    try {
      console.log('[KAI Voice] Playing speech synthesis response from:', audioUrl);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      setSound(newSound);
    } catch (err: any) {
      console.error('[KAI Voice] Playback failure:', err);
      setState('idle');
      alert(`Audio playback failed. KAI response: "${replyText}"`);
    }
  };

  // End speech playback
  const stopSpeaking = async () => {
    try {
      isSpeakingRef.current = false;
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }
    } catch (e) {
      console.warn('[KAI Voice] Failed to unload sound object:', e);
    } finally {
      setState('idle');
    }
  };

  // Orb Press Action based on current state
  const handleOrbPress = () => {
    if (state === 'idle' || state === 'error') {
      startRecording();
    } else if (state === 'listening') {
      stopRecording(true);
    } else if (state === 'speaking') {
      stopSpeaking();
    }
  };

  // Spinner rotation style for Processing state
  const spinnerRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative cyber grid lines */}
      <View style={styles.gridOverlay}>
        {Array.from({ length: 25 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLine, { top: i * (height / 25) }]} />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: i * (width / 12) }]} />
        ))}
      </View>

      {/* Header Info */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>K.A.I ASSISTANT</Text>
        <Text style={styles.headerSubtitle}>IMMERSE VOICE LINK</Text>
      </View>

      {/* Interactive Main Interaction Area */}
      <View style={styles.orbContainer}>
        {/* Pulsing Backglow Rings */}
        {(state === 'idle' || state === 'listening' || state === 'speaking') && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                borderColor: getStateColor(),
                shadowColor: getStateColor(),
                transform: [{ scale: pulseAnim }],
                opacity: state === 'idle' ? 0.08 : 0.2,
              },
            ]}
          />
        )}

        {/* Processing Spinner Outer Ring */}
        {state === 'processing' && (
          <Animated.View
            style={[
              styles.processingRing,
              {
                transform: [{ rotate: spinnerRotation }],
              },
            ]}
          />
        )}

        {/* Central Glowing Interactive Orb */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleOrbPress}
          style={[
            styles.orb,
            state === 'listening' && { borderColor: COLORS.cyan, shadowColor: COLORS.cyan },
            state === 'processing' && { borderColor: COLORS.coral, shadowColor: COLORS.coral },
            state === 'speaking' && { borderColor: COLORS.green, shadowColor: COLORS.green },
            state === 'error' && { borderColor: COLORS.accent, shadowColor: COLORS.accent },
          ]}
        >
          <Text style={[
            styles.orbText,
            state === 'listening' && { textShadowColor: COLORS.cyan, color: COLORS.cyan },
            state === 'processing' && { textShadowColor: COLORS.coral, color: COLORS.coral },
            state === 'speaking' && { textShadowColor: COLORS.green, color: COLORS.green },
          ]}>
            K.A.I
          </Text>
          <Text style={styles.orbStateText}>
            {state === 'listening' ? 'LISTENING' : state === 'processing' ? 'THINKING' : state === 'speaking' ? 'SPEAKING' : 'ONLINE'}
          </Text>
        </TouchableOpacity>

        {/* Bottom Audio Visualizer Bar Spectrum (Active only in speaking state) */}
        <View style={styles.visualizerContainer}>
          {visualizerBars.map((barHeight, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.visualizerBar,
                {
                  height: barHeight,
                  backgroundColor: state === 'speaking' ? COLORS.green : state === 'listening' ? COLORS.cyan : COLORS.textDim,
                  opacity: state === 'speaking' ? 0.9 : 0.25,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Subtitles & Transcription Logs */}
      <View style={styles.feedbackContainer}>
        {state === 'idle' && (
          <Text style={styles.instructionText}>TAP THE ORB TO SPEAK</Text>
        )}
        {state === 'listening' && (
          <Text style={[styles.instructionText, { color: COLORS.cyan }]}>
            RECORDING SPEECH... TAP AGAIN TO TRANSMIT
          </Text>
        )}
        {state === 'processing' && (
          <View style={styles.processingTextWrap}>
            <ActivityIndicator size="small" color={COLORS.coral} />
            <Text style={[styles.instructionText, { color: COLORS.coral, marginLeft: 8 }]}>
              TRANSCRIBING & COMPUTING SYSTEM RESPONSE...
            </Text>
          </View>
        )}
        {state === 'speaking' && (
          <Text style={[styles.instructionText, { color: COLORS.green }]}>
            K.A.I AUDIO TRANSMISSION IN PROGRESS
          </Text>
        )}
        {state === 'error' && (
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.errorTitle]}>TRANSMISSION ERROR</Text>
            <Text style={styles.errorSubText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={startRecording}>
              <Text style={styles.retryButtonText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transcription Logs Card */}
        {(queryText || replyText) ? (
          <View style={styles.terminalCard}>
            <View style={styles.terminalHeader}>
              <View style={styles.terminalDot} />
              <View style={[styles.terminalDot, { backgroundColor: COLORS.coral }]} />
              <View style={[styles.terminalDot, { backgroundColor: COLORS.green }]} />
              <Text style={styles.terminalTitle}>assistant_comms.log</Text>
            </View>
            <View style={styles.terminalContent}>
              {queryText ? (
                <View style={styles.terminalLine}>
                  <Text style={styles.terminalPrompt}>YOU: </Text>
                  <Text style={styles.terminalText}>{queryText.toUpperCase()}</Text>
                </View>
              ) : null}
              {replyText ? (
                <View style={[styles.terminalLine, { marginTop: 10 }]}>
                  <Text style={[styles.terminalPrompt, { color: COLORS.green }]}>K.A.I: </Text>
                  <Text style={[styles.terminalText, { color: COLORS.textPrimary }]}>{replyText}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 229, 255, 0.02)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0, 229, 255, 0.02)',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: 'center',
    marginBottom: height * 0.04,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4,
  },
  headerSubtitle: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 4,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: height * 0.40,
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderStyle: 'dashed',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  processingRing: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: COLORS.coral,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  orb: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: COLORS.textDim,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 10,
  },
  orbText: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  orbStateText: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 6,
  },
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'absolute',
    bottom: -10,
    height: 60,
    width: width,
  },
  visualizerBar: {
    width: 3,
    borderRadius: 1.5,
  },
  feedbackContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 20,
  },
  instructionText: {
    color: COLORS.textSec,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  processingTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  errorSubText: {
    color: COLORS.textSec,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: width * 0.8,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 132, 94, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  retryButtonText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  terminalCard: {
    backgroundColor: COLORS.cardBg,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    width: '100%',
    marginTop: 24,
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 45, 61, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  terminalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginRight: 5,
  },
  terminalTitle: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 1,
  },
  terminalContent: {
    padding: 14,
  },
  terminalLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  terminalPrompt: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'System',
  },
  terminalText: {
    color: COLORS.textSec,
    fontSize: 11,
    lineHeight: 14,
    flex: 1,
    fontFamily: 'System',
  },
});

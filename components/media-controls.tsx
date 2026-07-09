import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getServerUrl, fetchWithAuth } from '@/constants/server';

// ─── Icon Components ──────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────
type MediaAction = 'playpause' | 'next' | 'previous' | 'volumeup' | 'volumedown';

interface MediaControlsProps {
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────
export default function MediaControls({ disabled = false }: MediaControlsProps) {
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
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Volume Row */}
      <View style={styles.volumeRow}>
        <ControlButton
          icon={<VolumeDownIcon color="#a0aec0" />}
          onPress={() => sendControl('volumedown')}
          size="small"
          disabled={disabled}
        />
        <ControlButton
          icon={<VolumeUpIcon color="#a0aec0" />}
          onPress={() => sendControl('volumeup')}
          size="small"
          disabled={disabled}
        />
      </View>

      {/* Playback Row */}
      <View style={styles.playbackRow}>
        <ControlButton
          icon={<PreviousIcon color="#e2e8f0" />}
          onPress={() => sendControl('previous')}
          size="medium"
          disabled={disabled}
        />
        <ControlButton
          icon={<PlayPauseIcon color="#fff" />}
          onPress={() => sendControl('playpause')}
          size="large"
          isPrimary
          disabled={disabled}
        />
        <ControlButton
          icon={<NextIcon color="#e2e8f0" />}
          onPress={() => sendControl('next')}
          size="medium"
          disabled={disabled}
        />
      </View>
    </View>
  );
}

// ─── Button Sub-component ─────────────────────────────────────────
interface ControlButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  size: 'small' | 'medium' | 'large';
  isPrimary?: boolean;
  disabled?: boolean;
}

function ControlButton({ icon, onPress, size, isPrimary, disabled }: ControlButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.85,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const buttonSize = size === 'large' ? 64 : size === 'medium' ? 48 : 40;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.controlBtn,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
          },
          isPrimary && styles.primaryBtn,
          disabled && styles.disabledBtn,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
        disabled={disabled}
      >
        {icon}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  volumeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 4,
  },
  playbackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  controlBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtn: {
    backgroundColor: '#00e5ff',
    borderColor: '#00e5ff',
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  disabledBtn: {
    opacity: 0.3,
  },
});

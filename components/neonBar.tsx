import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface NeonBarProps {
  value: number; // 0-100
}

export default function NeonBar({ value }: NeonBarProps) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Animate width
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: value,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [value]);

  // Pulse animation if value > 70
  useEffect(() => {
    if (value > 70) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
        ])
      ).start();
    }
  }, [value]);

  const getBarColor = () => {
    if (value > 85) return '#ff1744'; // red
    if (value > 70) return '#ff9800'; // orange
    return '#00e5ff'; // neon cyan
  };

  const animatedShadow = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.2], // shadow intensity
  });

  return (
    <View style={styles.barBackground}>
      <Animated.View
        style={[
          styles.barFill,
          {
            width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            backgroundColor: getBarColor(),
            shadowOpacity: animatedShadow,
            shadowColor: getBarColor(),
          },
        ]}
      />
      <Text style={styles.barText}>{value}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  barBackground: {
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111',
    marginVertical: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },
  barText: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#0ff',
    fontWeight: 'bold',
    textShadowColor: '#0ff',
    textShadowRadius: 8,
  },
});
import React, { useState, useEffect , useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import NeonBar from '@/components/neonBar';

type ServerStats = {
  cpu_usage_percent: number;
  memory_usage_percent: number;
  disk_usage_percent: number;
  gpu_usage_percent: number;
  gpu_memory_usage_percent: number;
  gpu_temperature_c: number;
};

const SERVER_URL = 'http://192.168.1.38:5000/health';

export default function ServerStatsPanel() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'awake' | 'sleeping'>('awake');

  const fetchStats = async () => {
    try {
      const response = await fetch(SERVER_URL);
      if (!response.ok) throw new Error('Server not OK');
      const data: ServerStats = await response.json();
      setStats(data);
      setStatus('awake');
    } catch (error) {
      setStatus('sleeping');
    } finally {
      setLoading(false);
    }
  };

  // Fetch once on mount and auto-refresh every 5 seconds
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      let timeout: NodeJS.Timeout | undefined;

      const poll = async () => {
        if(!isActive) return;

        await fetchStats();
        timeout = setTimeout(poll, 5000);
      };
      poll(); // Start polling only when in focus

      return () => {
        isActive = false; // Stop polling when out of focus
        clearTimeout(timeout);
      };
    },[]) 
  )

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🖥️ KAI Server Stats</Text>

      <Text style={styles.label}>CPU</Text>
      <NeonBar value={stats?.cpu_usage_percent ?? 0} />

      <Text style={styles.label}>Memory</Text>
      <NeonBar value={stats?.memory_usage_percent ?? 0} />

      <Text style={styles.label}>Disk</Text>
      <NeonBar value={stats?.disk_usage_percent ?? 0} />

      <Text style={styles.label}>GPU</Text>
      <NeonBar value={stats?.gpu_usage_percent ?? 0} />

      <Text
        style={[
          styles.tempText,
          (stats?.gpu_temperature_c ?? 0) > 80 && styles.overheat,
        ]}
      >
        GPU Temp: {stats?.gpu_temperature_c ?? 0}°C
      </Text>

      {(stats?.gpu_usage_percent ?? 0) > 70 && (
        <Text style={styles.loadBadge}>⚡ KAI Under Load</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#0a0a0a',
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    width: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00e5ff',
    marginBottom: 16,
    textShadowColor: '#0ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  label: {
    color: '#0ff',
    marginBottom: 6,
    marginTop: 12,
    fontWeight: '600',
  },
  tempText: {
    marginTop: 12,
    fontSize: 16,
    color: '#0ff',
    fontWeight: '600',
  },
  overheat: {
    color: '#ff1744',
    textShadowColor: '#ff1744',
    textShadowRadius: 12,
  },
  loadBadge: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ff9800',
    borderRadius: 20,
    alignSelf: 'flex-start',
    color: '#000',
    fontWeight: 'bold',
    textShadowColor: '#ff9800',
    textShadowRadius: 8,
  },
  sleepText: {
    marginTop: 20,
    fontSize: 18,
    color: '#666',
  },
});
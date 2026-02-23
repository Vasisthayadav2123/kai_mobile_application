import React, { JSX, useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

type ServerStats = {
  gpu: any;
  cpu_usage_percent: number;
  memory_usage_percent: number;
  disk_usage_percent: number;
  gpu_usage_percent: number;
  gpu_memory_usage_percent: number;
  gpu_temperature_c: number;
};

type Status = 'idle' | 'loading' | 'awake' | 'sleeping';

const SERVER_URL = 'http://192.168.1.38:5000/health';

export default function App(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');
  const [stats, setStats] = useState<ServerStats | null>(null);

  const pingServer = async (): Promise<void> => {
    setStatus('loading');
    setStats(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(SERVER_URL, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Server not OK');
      }

      const data: ServerStats = await response.json();

      setStats(data);
      setStatus('awake');
    } catch (error) {
      setStatus('sleeping');
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Ping Server" onPress={pingServer} />

      {status === 'loading' && (
        <ActivityIndicator size="large" style={{ marginTop: 20 }} />
      )}

      {status === 'awake' && stats && (
        <View style={styles.card}>
          <Text style={styles.title}>🟢 Server Running</Text>

          <Text>CPU Usage: {stats.cpu_usage_percent}%</Text>
          <Text>Memory Usage: {stats.memory_usage_percent}%</Text>
          <Text>Disk Usage: {stats.disk_usage_percent}%</Text>
          <Text>GPU Usage: {stats.gpu.gpu_usage_percent}%</Text>
          <Text>GPU Memory Usage: {stats.gpu.gpu_memory_usage_percent}%</Text>
          <Text>GPU Temperature: {stats.gpu.gpu_temperature_c}°C</Text>
        </View>
      )}

      {status === 'sleeping' && (
        <>
          <Text style={styles.sleepText}>Kai is sleeping… 💤</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#eefaf0',
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sleepText: {
    marginTop: 20,
    fontSize: 18,
    color: '#666',
  },
  image: {
    marginTop: 12,
    width: 200,
    height: 200,
    resizeMode: 'contain',
  },
});

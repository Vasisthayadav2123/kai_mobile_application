import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, SafeAreaView, 
  ActivityIndicator, TouchableOpacity, Dimensions, AppState, AppStateStatus 
} from 'react-native';
import { SERVER_URL } from '@/constants/server';

const { width } = Dimensions.get('window');

export default function CorenetDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const formatTime = () => {
    const options: any = { weekday: 'short', month: 'short', day: 'numeric' };
    const dateStr = currentTime.toLocaleDateString('en-US', options).toUpperCase();
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    return `${dateStr} | ${timeStr}`;
  };
  const fetchStats = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.log("Server Unreachable");
    } finally {
      setLoading(false);
    }
  };

  const startSync = () => {
    if (!intervalRef.current) {
      fetchStats();
      intervalRef.current = setInterval(fetchStats, 3000);
    }
  };

  const stopSync = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    startSync();
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        startSync();
      } else if (nextState.match(/inactive|background/)) {
        stopSync();
      }
      appState.current = nextState;
    });

    return () => {
      stopSync();
      subscription.remove();
    };
  }, []);

  if (loading && !data) return <ActivityIndicator size="large" color="#00e5ff" style={styles.loader} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>KAI DASHBOARD <Text style={styles.version}>{data?.version}</Text></Text>
            <Text style={styles.headerTime}>{formatTime()}</Text>
          </View>
          <Text style={styles.syncStatus}>{intervalRef.current ? "● SYNCING" : "○ PAUSED"}</Text>
        </View>
        <View style={styles.glassCard}>
          <Text style={styles.cardHeader}>SERVER CLUSTER ALPHA - <Text style={styles.health}>HEALTH: 98%</Text></Text>
          <View style={styles.clusterGrid}>
            <MiniStat label="CPU USAGE" value={`${data?.cpu_usage_percent}%`} />
            <MiniStat label="MEM UTIL" value={`${data?.memory_usage_percent}%`} />
            <MiniStat label="GPU TEMP" value={`${data?.gpu?.temperature_c}°C`} color={data?.gpu?.temperature_c > 75 ? '#ff1744' : '#00e5ff'} />
          </View>
        </View>

        {/* Main Grid */}
        <View style={styles.mainGrid}>
          <View style={styles.gridCol}>
            <MetricBox title="CPU LOAD" value={`${data?.cpu_usage_percent}%`} />
            <MetricBox title="NETWORK" value={`${data?.network_in_mbps} mbps`} sub={`Out: ${data?.network_out_mbps} Mbps`} />
          </View>
          <View style={styles.gridCol}>
            <MetricBox title="VRAM USAGE" value={`${data?.gpu?.memory_percent}%`} progress={data?.gpu?.memory_percent} />
            <MetricBox title="STORAGE" value={`${data?.disk_usage_percent}%`} color="#3dfc58" progress={data?.disk_usage_percent} />
          </View>
        </View>

        <Text style={styles.subHeading}>GPU ACCELERATOR</Text>
        <View style={styles.gpuRow}>
          <GpuBox label="LOAD" value={`${data?.gpu?.load_percent}%`} />
          <GpuBox label="VRAM" value={`${data?.gpu?.memory_used_mb}MB`} sub={`/ ${data?.gpu?.memory_total_mb}MB`} />
          <GpuBox label="TEMP" value={`${data?.gpu?.temperature_c}°C`} hot={data?.gpu?.temperature_c > 75} />
        </View>

        {/* Node Status */}
        <View style={styles.nodeList}>
          {data?.nodes.map((node: any, i: number) => (
            <View key={i} style={styles.nodeRow}>
              <Text style={styles.nodeName}>🟢 {node.id}</Text>
              <View style={[styles.badge, { borderColor: node.status === 'ONLINE' ? '#3dfc58' : '#ff9800' }]}>
                <Text style={[styles.badgeText, { color: node.status === 'ONLINE' ? '#3dfc58' : '#ff9800' }]}>{node.status}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}


const MiniStat = ({ label, value, color = '#00e5ff' }: any) => (
  <View><Text style={styles.miniLabel}>{label}</Text><Text style={[styles.miniValue, { color }]}>{value}</Text></View>
);

const MetricBox = ({ title, value, sub, progress, color = '#00e5ff' }: any) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    {sub && <Text style={styles.metricSub}>{sub}</Text>}
    {progress !== undefined && <View style={styles.barBg}><View style={[styles.barFill, { width: `${progress}%`, backgroundColor: color }]} /></View>}
  </View>
);

const GpuBox = ({ label, value, sub, hot }: any) => (
  <View style={[styles.gpuCard, hot && styles.gpuHot]}>
    <Text style={styles.gpuLabel}>{label}</Text>
    <Text style={[styles.gpuValue, hot && { color: '#ff1744' }]}>{value}</Text>
    {sub && <Text style={styles.gpuSub}>{sub}</Text>}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  loader: { flex: 1, backgroundColor: '#050505', justifyContent: 'center' },
  scrollContent: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  version: { color: '#444', fontSize: 10 },
  headerTime: { color: '#666', fontSize: 11 },
  syncStatus: { color: '#3dfc58', fontSize: 9, fontWeight: 'bold' },
  glassCard: { backgroundColor: '#111', borderRadius: 16, padding: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#00e5ff' },
  cardHeader: { color: '#666', fontSize: 10, marginBottom: 10 },
  health: { color: '#3dfc58' },
  clusterGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  miniLabel: { color: '#444', fontSize: 9 },
  miniValue: { fontSize: 14, fontWeight: 'bold' },
  mainGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  gridCol: { width: '48%' },
  metricCard: { backgroundColor: '#111', borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#1a1a1a' },
  metricTitle: { color: '#555', fontSize: 9, fontWeight: 'bold' },
  metricValue: { color: '#00e5ff', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  metricSub: { color: '#444', fontSize: 8, marginTop: 4 },
  barBg: { height: 3, backgroundColor: '#222', borderRadius: 2, marginTop: 10 },
  barFill: { height: 3, borderRadius: 2 },
  subHeading: { color: '#444', fontSize: 10, fontWeight: 'bold', marginVertical: 10 },
  gpuRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  gpuCard: { width: '31%', backgroundColor: '#111', borderRadius: 12, padding: 12, alignItems: 'center' },
  gpuHot: { borderColor: '#ff1744', borderWidth: 1 },
  gpuLabel: { color: '#555', fontSize: 8 },
  gpuValue: { color: '#00e5ff', fontSize: 16, fontWeight: 'bold' },
  gpuSub: { color: '#333', fontSize: 7 },
  nodeList: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 10 },
  nodeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  nodeName: { color: '#ccc', fontSize: 12 },
  badge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: 'bold' }
});
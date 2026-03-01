import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, 
  ScrollView, TouchableOpacity, SafeAreaView 
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';

// --- Types ---
type Node = { id: string; status: 'ONLINE' | 'DISTRIBUTING' };
type Stats = {
  cpu_usage_percent: number;
  memory_usage_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  gpu_temperature_c: number;
  gpu_usage_percent: number;
  network_in_gbps: number;
  network_out_mbps: number;
  nodes: Node[];
};

const SERVER_URL = 'http://192.168.1.38:5000/health';

export default function CorenetDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(SERVER_URL);
        const data = await res.json();
        setStats(data);
      } catch (e) { console.log("Server unreachable"); }
      finally { setLoading(false); }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <ActivityIndicator size="large" color="#00e5ff" style={styles.loader} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <View style={styles.avatarPlaceholder} />
            <View>
              <Text style={styles.headerTitle}>CORENET DASHBOARD <Text style={styles.version}>v3.1</Text></Text>
              <Text style={styles.headerSubtitle}>TUE OCT 26 | 14:02</Text>
            </View>
          </View>
        </View>

        {/* Top Nav Cards */}
        <View style={styles.navRow}>
          <NavCard title="SERVER STATS" active icon="📊" />
          <NavCard title="SCREEN SHARE" icon="🖥️" sub="Inactive/Dim" />
          <NavCard title="AI ANALYTICS" icon="🧠" sub="ADMIN" />
        </View>

        {/* Cluster Alpha Health */}
        <View style={styles.glassCard}>
          <Text style={styles.cardLabel}>SERVER CLUSTER ALPHA - <Text style={styles.healthText}>HEALTH: 98%</Text></Text>
          <View style={styles.statsGrid}>
            <StatMini label="CPU USAGE" value={`${stats?.cpu_usage_percent}%`} />
            <StatMini label="MEMORY UTIL" value={`${stats?.memory_usage_percent}%`} />
            <StatMini label="TEMP" value={`${stats?.gpu_temperature_c}°C`} color={stats?.gpu_temperature_c! > 75 ? '#ff1744' : '#00e5ff'} />
          </View>
        </View>

        {/* Main Metrics Row */}
        <View style={styles.mainGrid}>
          <View style={styles.gridCol}>
            <MetricCard title="CPU LOAD" value={`${stats?.cpu_usage_percent}%`} hasGraph />
            <MetricCard title="NETWORK TRAFFIC" value={`${stats?.network_in_gbps} Gbps`} sub={`Out: ${stats?.network_out_mbps} Mbps`} />
          </View>
          <View style={styles.gridCol}>
            <MetricCard title="MEMORY USAGE" value={`${stats?.memory_used_gb}GB`} total={`/${stats?.memory_total_gb}GB`} progress={stats?.memory_usage_percent} />
            <MetricCard title="STORAGE" value="88%" sub="Primary: 88% full" progress={88} color="#3dfc58" />
          </View>
        </View>

        {/* Nodes List */}
        {stats?.nodes.map((node, i) => (
          <View key={i} style={styles.nodeItem}>
            <Text style={styles.nodeText}>🟩 {node.id}</Text>
            <View style={[styles.statusBadge, { borderColor: node.status === 'ONLINE' ? '#3dfc58' : '#ff9800' }]}>
              <Text style={[styles.statusText, { color: node.status === 'ONLINE' ? '#3dfc58' : '#ff9800' }]}>{node.status}</Text>
            </View>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

// --- Sub-Components ---

const NavCard = ({ title, active, icon, sub }: any) => (
  <TouchableOpacity style={[styles.navCard, active && styles.navCardActive]}>
    <Text style={styles.navIcon}>{icon}</Text>
    <Text style={[styles.navCardText, active && styles.navCardTextActive]}>{title}</Text>
    {sub && <Text style={styles.navCardSub}>{sub}</Text>}
  </TouchableOpacity>
);

const StatMini = ({ label, value, color = '#00e5ff' }: any) => (
  <View>
    <Text style={styles.miniLabel}>{label}</Text>
    <Text style={[styles.miniValue, { color }]}>{value}</Text>
  </View>
);

const MetricCard = ({ title, value, total, sub, progress, color = '#00e5ff' }: any) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricValue}>{value}<Text style={styles.metricTotal}>{total}</Text></Text>
    {sub && <Text style={styles.metricSub}>{sub}</Text>}
    {progress !== undefined && (
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: color }]} />
      </View>
    )}
  </View>
);

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  loader: { flex: 1, backgroundColor: '#050505' },
  scrollContent: { padding: 16 },
  header: { marginBottom: 20 },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', marginRight: 12 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  version: { color: '#666', fontSize: 12 },
  headerSubtitle: { color: '#666', fontSize: 12 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  navCard: { width: '31%', backgroundColor: '#111', padding: 12, borderRadius: 12, alignItems: 'center', borderWeight: 1, borderColor: '#222' },
  navCardActive: { borderColor: '#00e5ff', backgroundColor: '#002a2f' },
  navCardText: { color: '#666', fontSize: 10, marginTop: 4, textAlign: 'center' },
  navCardTextActive: { color: '#00e5ff', fontWeight: 'bold' },
  navCardSub: { color: '#444', fontSize: 8 },
  navIcon: { fontSize: 18 },
  glassCard: { backgroundColor: '#111', padding: 16, borderRadius: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#00e5ff' },
  cardLabel: { color: '#666', fontSize: 12, marginBottom: 10 },
  healthText: { color: '#3dfc58', fontWeight: 'bold' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  miniLabel: { color: '#444', fontSize: 10 },
  miniValue: { fontSize: 16, fontWeight: 'bold' },
  mainGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  gridCol: { width: '48%' },
  metricCard: { backgroundColor: '#111', padding: 12, borderRadius: 12, marginBottom: 12 },
  metricTitle: { color: '#666', fontSize: 10, marginBottom: 4 },
  metricValue: { color: '#00e5ff', fontSize: 20, fontWeight: 'bold' },
  metricTotal: { color: '#333', fontSize: 14 },
  metricSub: { color: '#444', fontSize: 9, marginTop: 4 },
  progressBg: { height: 4, backgroundColor: '#222', borderRadius: 2, marginTop: 8 },
  progressFill: { height: 4, borderRadius: 2 },
  nodeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', padding: 15, borderRadius: 12, marginBottom: 8 },
  nodeText: { color: '#fff', fontWeight: 'bold' },
  statusBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: 'bold' }
});
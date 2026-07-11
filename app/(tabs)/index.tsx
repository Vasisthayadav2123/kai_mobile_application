import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  ActivityIndicator, Dimensions, AppState, AppStateStatus, Animated, Easing
} from 'react-native';
import Svg, { Circle, Path, G, Rect, Line, Text as SvgText } from 'react-native-svg';
import { getServerUrl, fetchWithAuth } from '@/constants/server';
import { useIsFocused } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const CARD_PADDING = 16;

// ── Design Tokens (matching reference image) ─────────────────────
const COLORS = {
  bg:         '#0f1923',
  cardBg:     '#1a2d3d',
  cardBgAlt:  '#1e3344',
  accent:     '#f0845e',   // coral/salmon
  accentDark: '#e8734a',
  accentSoft: '#f4a574',   // peach
  textPrimary:'#e8ecf1',
  textSec:    '#7a8fa3',
  textDim:    '#4a5f73',
  barBg:      '#263d50',
  success:    '#4cd964',
  danger:     '#ff5a5a',
  warning:    '#ffb347',
  cardBorder: '#243a4d',
};

// ── Circular Progress Gauge ──────────────────────────────────────
const CircularGauge = ({ percent = 0, size = 90, strokeWidth = 6, color = COLORS.accent, label = '', valueText = '' }: {
  percent: number; size?: number; strokeWidth?: number; color?: string; label?: string; valueText?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(percent, 100)) / 100;
  const center = size / 2;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle cx={center} cy={center} r={radius} stroke={COLORS.barBg} strokeWidth={strokeWidth} fill="none" />
        {/* Progress */}
        <Circle
          cx={center} cy={center} r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: size * 0.22, fontWeight: '800' }}>{valueText || `${Math.round(percent)}%`}</Text>
        {label ? <Text style={{ color: COLORS.textSec, fontSize: size * 0.11, marginTop: 2 }}>{label}</Text> : null}
      </View>
    </View>
  );
};

// ── Mini Bar Chart (for node/GPU visualization) ──────────────────
const MiniBarChart = ({ values, height = 50, barColor = COLORS.accent }: {
  values: number[]; height?: number; barColor?: string;
}) => {
  const barWidth = Math.min(8, (width - 80) / values.length - 2);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 3 }}>
      {values.map((v, i) => (
        <View key={i} style={{
          width: barWidth,
          height: Math.max(3, (v / 100) * height),
          backgroundColor: barColor,
          borderRadius: 2,
          opacity: 0.6 + (v / 100) * 0.4,
        }} />
      ))}
    </View>
  );
};

// ── Horizontal Progress Bar ──────────────────────────────────────
const ProgressBar = ({ percent = 0, color = COLORS.accent, height = 5 }: {
  percent: number; color?: string; height?: number;
}) => (
  <View style={{ height, backgroundColor: COLORS.barBg, borderRadius: height / 2, overflow: 'hidden' }}>
    <View style={{
      height, borderRadius: height / 2,
      width: `${Math.min(percent, 100)}%`,
      backgroundColor: color,
    }} />
  </View>
);

// ── Speed Gauge (semi-circle) ────────────────────────────────────
const SpeedGauge = ({ value = 0, max = 100, size = 100, label = '', unit = '' }: {
  value: number; max?: number; size?: number; label?: string; unit?: string;
}) => {
  const radius = (size - 10) / 2;
  const center = size / 2;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const progress = Math.min(value / max, 1);
  const angle = startAngle + progress * Math.PI;

  // Arc path
  const describeArc = (cx: number, cy: number, r: number, startA: number, endA: number) => {
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy + r * Math.sin(endA);
    const largeArc = endA - startA > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Needle
  const needleLen = radius - 10;
  const nx = center + needleLen * Math.cos(angle);
  const ny = center + needleLen * Math.sin(angle);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size * 0.6}>
        {/* Track */}
        <Path d={describeArc(center, center, radius, startAngle, endAngle)} stroke={COLORS.barBg} strokeWidth={6} fill="none" strokeLinecap="round" />
        {/* Progress */}
        <Path d={describeArc(center, center, radius, startAngle, angle)} stroke={COLORS.accent} strokeWidth={6} fill="none" strokeLinecap="round" />
        {/* Needle */}
        <Line x1={center} y1={center} x2={nx} y2={ny} stroke={COLORS.accentSoft} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={center} cy={center} r={4} fill={COLORS.accent} />
      </Svg>
      <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', marginTop: -4 }}>{value}{unit}</Text>
      {label ? <Text style={{ color: COLORS.textSec, fontSize: 10, marginTop: 2 }}>{label}</Text> : null}
    </View>
  );
};

// ── Stat Card ────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, unit, color = COLORS.accent }: {
  icon: string; label: string; value: string; unit?: string; color?: string;
}) => (
  <View style={styles.statPill}>
    <Text style={{ fontSize: 18 }}>{icon}</Text>
    <View style={{ marginLeft: 8, flex: 1 }}>
      <Text style={[styles.statLabel]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  </View>
);

// ── Node Row ─────────────────────────────────────────────────────
const NodeRow = ({ node, isLast }: { node: any; isLast: boolean }) => {
  const statusColor = node.status === 'ONLINE' ? COLORS.success : COLORS.warning;
  return (
    <View style={[styles.nodeRow, !isLast && { borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.nodeDot, { backgroundColor: statusColor }]} />
        <Text style={styles.nodeId}>{node.id}</Text>
      </View>
      <View style={[styles.statusBadge, { borderColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{node.status}</Text>
      </View>
    </View>
  );
};


// ══════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════
export default function CorenetDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Pulse animation for sync indicator
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const formatTime = () => {
    const options: any = { weekday: 'short', month: 'short', day: 'numeric' };
    const dateStr = currentTime.toLocaleDateString('en-US', options).toUpperCase();
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { dateStr, timeStr };
  };

  const fetchStats = async () => {
    try {
      const response = await fetchWithAuth(`${getServerUrl()}/health`);
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

  const isFocused = useIsFocused();

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (isFocused && nextState === 'active') {
        startSync();
      } else {
        stopSync();
      }
      appState.current = nextState;
    };

    if (isFocused && AppState.currentState === 'active') {
      startSync();
    } else {
      stopSync();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopSync();
      subscription.remove();
    };
  }, [isFocused]);

  // Generate pseudo-historical chart data from current values
  const chartBars = useMemo(() => {
    if (!data) return [];
    const base = data.cpu_usage_percent || 30;
    return Array.from({ length: 12 }, (_, i) =>
      Math.max(5, Math.min(100, base + (Math.sin(i * 0.8) * 20) + (Math.random() * 15 - 7)))
    );
  }, [data?.cpu_usage_percent]);

  const { dateStr, timeStr } = formatTime();

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <CircularGauge percent={0} size={80} color={COLORS.accent} label="connecting" />
          <Text style={styles.loadingText}>Locating KAI Server…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cpuPercent = data?.cpu_usage_percent ?? 0;
  const memPercent = data?.memory_usage_percent ?? 0;
  const diskPercent = data?.disk_usage_percent ?? 0;
  const gpuLoad = data?.gpu?.load_percent ?? 0;
  const gpuTemp = data?.gpu?.temperature_c ?? 0;
  const gpuMemPercent = data?.gpu?.memory_percent ?? 0;
  const gpuMemUsed = data?.gpu?.memory_used_mb ?? 0;
  const gpuMemTotal = data?.gpu?.memory_total_mb ?? 0;
  const netIn = data?.network_in_mbps ?? 0;
  const netOut = data?.network_out_mbps ?? 0;
  const memUsedGb = data?.memory_used_gb ?? 0;
  const memTotalGb = data?.memory_total_gb ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>KAI Server</Text>
            <Text style={styles.headerVersion}>{data?.version}</Text>
          </View>
          <View style={styles.headerRight}>
            <Animated.View style={[styles.syncDot, { opacity: pulseAnim }]} />
            <View>
              <Text style={styles.headerTime}>{timeStr}</Text>
              <Text style={styles.headerDate}>{dateStr}</Text>
            </View>
          </View>
        </View>

        {/* ── Section: System Overview ────────────────────────── */}
        <Text style={styles.sectionTitle}>System Overview</Text>

        {/* CPU + Memory gauges row */}
        <View style={styles.card}>
          <View style={styles.gaugeRow}>
            <View style={styles.gaugeItem}>
              <CircularGauge percent={cpuPercent} size={100} color={cpuPercent > 80 ? COLORS.danger : COLORS.accent} label="CPU" />
            </View>
            <View style={styles.gaugeDivider} />
            <View style={styles.gaugeItem}>
              <CircularGauge percent={memPercent} size={100} color={memPercent > 85 ? COLORS.danger : COLORS.accentSoft} label="MEMORY" />
            </View>
          </View>

          {/* Memory detail bar */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>RAM</Text>
            <Text style={styles.detailValue}>{memUsedGb} / {memTotalGb} GB</Text>
          </View>
          <ProgressBar percent={memPercent} color={COLORS.accentSoft} />
        </View>

        {/* Disk + Network Cards */}
        <View style={styles.dualCardRow}>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.cardLabel}>STORAGE</Text>
            <CircularGauge percent={diskPercent} size={72} strokeWidth={5} color={diskPercent > 90 ? COLORS.danger : '#4cd9ac'} />
            <Text style={styles.cardStat}>{diskPercent}%</Text>
            <Text style={styles.cardStatSub}>disk used</Text>
          </View>

          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.cardLabel}>NETWORK</Text>
            <View style={{ marginVertical: 8, gap: 8 }}>
              <View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>↓ IN</Text>
                  <Text style={styles.detailValue}>{netIn} MB/s</Text>
                </View>
                <ProgressBar percent={Math.min(netIn * 10, 100)} color={COLORS.accent} height={4} />
              </View>
              <View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>↑ OUT</Text>
                  <Text style={styles.detailValue}>{netOut} MB/s</Text>
                </View>
                <ProgressBar percent={Math.min(netOut * 10, 100)} color={COLORS.accentSoft} height={4} />
              </View>
            </View>
          </View>
        </View>

        {/* ── Section: GPU Accelerator ───────────────────────── */}
        <Text style={styles.sectionTitle}>GPU Accelerator</Text>
        <View style={styles.card}>
          {/* Speed gauge for GPU temp */}
          <SpeedGauge value={gpuTemp} max={100} size={120} label="TEMPERATURE" unit="°C" />

          {/* GPU stat pills */}
          <View style={styles.statRow}>
            <StatCard icon="⚡" label="GPU Load" value={`${gpuLoad}`} unit="%" color={gpuLoad > 80 ? COLORS.danger : COLORS.accent} />
            <StatCard icon="🧠" label="VRAM" value={`${gpuMemUsed}`} unit="MB" color={COLORS.accentSoft} />
          </View>

          {/* VRAM bar */}
          <View style={{ marginTop: 12 }}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>VRAM Usage</Text>
              <Text style={styles.detailValue}>{gpuMemUsed} / {gpuMemTotal} MB ({gpuMemPercent}%)</Text>
            </View>
            <ProgressBar percent={gpuMemPercent} color={gpuMemPercent > 80 ? COLORS.danger : COLORS.accent} />
          </View>
        </View>

        {/* ── Section: Activity Monitor (bar chart) ──────────── */}
        <Text style={styles.sectionTitle}>Activity Monitor</Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>CPU Usage Trend</Text>
            <Text style={[styles.detailValue, { color: COLORS.accent }]}>{cpuPercent}%</Text>
          </View>
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <MiniBarChart values={chartBars} height={60} barColor={COLORS.accent} />
          </View>
          {/* X-axis labels */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 }}>
            {['0s', '', '', '9s', '', '', '18s', '', '', '27s', '', '33s'].map((l, i) => (
              <Text key={i} style={{ color: COLORS.textDim, fontSize: 7 }}>{l}</Text>
            ))}
          </View>
        </View>

        {/* ── Section: Quick Stats ────────────────────────────── */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStat}>
            <Text style={styles.quickIcon}>💻</Text>
            <Text style={styles.quickValue}>{cpuPercent}%</Text>
            <Text style={styles.quickLabel}>CPU</Text>
          </View>
          <View style={styles.quickStat}>
            <Text style={styles.quickIcon}>🌡️</Text>
            <Text style={[styles.quickValue, gpuTemp > 75 && { color: COLORS.danger }]}>{gpuTemp}°C</Text>
            <Text style={styles.quickLabel}>GPU Temp</Text>
          </View>
          <View style={styles.quickStat}>
            <Text style={styles.quickIcon}>📡</Text>
            <Text style={styles.quickValue}>{netIn}</Text>
            <Text style={styles.quickLabel}>Net In</Text>
          </View>
        </View>

        {/* ── Section: Node Status ────────────────────────────── */}
        <Text style={styles.sectionTitle}>Node Cluster</Text>
        <View style={styles.card}>
          {data?.nodes?.map((node: any, i: number) => (
            <NodeRow key={i} node={node} isLast={i === (data.nodes.length - 1)} />
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: CARD_PADDING,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: COLORS.textSec,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 4,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerVersion: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  headerTime: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  headerDate: {
    color: COLORS.textDim,
    fontSize: 9,
    textAlign: 'right',
    marginTop: 1,
  },

  // ── Section Title ──
  sectionTitle: {
    color: COLORS.textSec,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },

  // ── Cards ──
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  halfCard: {
    width: (width - CARD_PADDING * 2 - 10) / 2,
  },
  dualCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabel: {
    color: COLORS.textSec,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  cardStat: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
  },
  cardStatSub: {
    color: COLORS.textDim,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },

  // ── Gauges ──
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginBottom: 16,
  },
  gaugeItem: {
    alignItems: 'center',
  },
  gaugeDivider: {
    width: 1,
    height: 60,
    backgroundColor: COLORS.cardBorder,
  },

  // ── Detail rows ──
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '600',
  },
  detailValue: {
    color: COLORS.textSec,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // ── Stat pills ──
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  statLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statUnit: {
    color: COLORS.textDim,
    fontSize: 10,
    marginLeft: 2,
    fontWeight: '600',
  },

  // ── Quick stats row ──
  quickStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  quickStat: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  quickIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  quickValue: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  quickLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 4,
  },

  // ── Node rows ──
  nodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  nodeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nodeId: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
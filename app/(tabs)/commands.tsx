import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  ActivityIndicator, Dimensions, TouchableOpacity, TextInput,
  Image, FlatList, AppState, AppStateStatus, Animated, Easing
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getServerUrl, fetchWithAuth } from '@/constants/server';
import { useIsFocused } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const CARD_PADDING = 16;

const COLORS = {
  bg: '#0f1923',
  cardBg: '#1a2d3d',
  cardBgAlt: '#1e3344',
  accent: '#f0845e',   // coral/salmon
  accentDark: '#e8734a',
  accentSoft: '#f4a574',   // peach
  textPrimary: '#e8ecf1',
  textSec: '#7a8fa3',
  textDim: '#4a5f73',
  barBg: '#263d50',
  success: '#4cd964',
  danger: '#ff5a5a',
  warning: '#ffb347',
  cardBorder: '#243a4d',
};

// Map backend icon strings to MaterialIcons names
const ICON_MAPPING: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  "music.note": "music-note",
  "playpause.fill": "play-arrow",
  "backward.fill": "skip-previous",
  "forward.fill": "skip-next",
  "speaker.wave.3.fill": "volume-up",
  "speaker.wave.1.fill": "volume-down",
  "speaker.slash.fill": "volume-off",
  "app.grid.3x3.fill": "apps",
  "globe": "public",
  "chevron.left.forwardslash.chevron.right": "code",
  "folder.fill": "folder",
  "doc.text.fill": "description",
  "folder.badge.gearshape": "folder-shared",
  "list.bullet.indent": "list",
  "arrow.up.right.square": "launch",
  "wand.and.stars": "auto-awesome",
  "paperplane.fill": "send",
  "play.fill": "play-circle-outline",
  "speaker.wave.2.fill": "volume-mute",
  "plus": "add",
  "minus": "remove",
  "macpro.gen1": "screenshot",
  "camera.fill": "photo-camera",
  "discord": "headset",
  "spotify": "audiotrack",
  "gamecontroller": "sports-esports",
};

interface Command {
  type: string;
  name: string;
  icon: string;
  payload?: any;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  commands: Command[];
  safe_roots?: { name: string; path: string }[];
}

interface CommandHistoryItem {
  type: string;
  status: string;
  result: any;
  timestamp: number;
}

interface FileItem {
  name: string;
  is_dir: boolean;
  path: string;
  size: number;
}

export default function CommandCentreScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // KAI AI State
  const [kaiPrompt, setKaiPrompt] = useState('');
  const [kaiResponse, setKaiResponse] = useState<string | null>(null);
  const [kaiLoading, setKaiLoading] = useState(false);

  // File Browser State
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [fsLoading, setFsLoading] = useState(false);

  // Display State (Screenshot)
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [screenshotTime, setScreenshotTime] = useState<string>('');

  // AI Core Status
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [aiUnloading, setAiUnloading] = useState(false);
  const [aiWarming, setAiWarming] = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Pulse animation for header
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      const [catsRes, histRes] = await Promise.all([
        fetchWithAuth(`${getServerUrl()}/api/command/categories`),
        fetchWithAuth(`${getServerUrl()}/api/command/history?limit=10`)
      ]);

      if (catsRes.ok) {
        const catsJson = await catsRes.json();
        setCategories(catsJson.categories || []);
      }
      if (histRes.ok) {
        const histJson = await histRes.json();
        setHistory(histJson.history || []);
      }
    } catch (err) {
      setError("Unable to connect to KAI Command Server");
    } finally {
      setLoading(false);
    }
  };

  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [isFocused]);

  // Poll AI status when KAI category is active
  const fetchAiStatus = async () => {
    try {
      const res = await fetchWithAuth(`${getServerUrl()}/api/ai/status`);
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data);
      }
    } catch (e) {
      console.warn('[KAI] Failed to fetch AI status:', e);
    }
  };

  useEffect(() => {
    if (!isFocused || activeCategory?.id !== 'kai') return;
    fetchAiStatus();
    const interval = setInterval(fetchAiStatus, 15000);
    return () => clearInterval(interval);
  }, [isFocused, activeCategory?.id]);

  const handlePowerDownAI = async () => {
    setAiUnloading(true);
    try {
      const res = await fetchWithAuth(`${getServerUrl()}/api/ai/unload`, {
        method: 'POST',
      });
      if (res.ok) {
        // Refresh status after unload
        setTimeout(fetchAiStatus, 1000);
      }
    } catch (e) {
      console.warn('[KAI] Failed to unload AI:', e);
    } finally {
      setAiUnloading(false);
    }
  };

  const handleWarmUpAI = async () => {
    setAiWarming(true);
    try {
      await fetchWithAuth(`${getServerUrl()}/api/ai/warmup`, {
        method: 'POST',
      });
      // Poll status until model shows as running (max 60s)
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await fetchAiStatus();
        if (attempts >= 12) clearInterval(poll); // stop after ~60s
      }, 5000);
      setTimeout(() => setAiWarming(false), 5000);
    } catch (e) {
      console.warn('[KAI] Failed to warm up AI:', e);
      setAiWarming(false);
    }
  };

  const executeCommand = async (type: string, payload: any = {}) => {
    setExecuting(type);
    try {
      const response = await fetchWithAuth(`${getServerUrl()}/api/command/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload }),
        timeout: 40000, // 60 seconds timeout for tool execution
      });

      const data = await response.json();
      // Update history list immediately
      fetchData();

      if (!response.ok) {
        throw new Error(data.message || "Execution failed");
      }
      return data;
    } catch (err: any) {
      console.warn(`Command failed: ${type}`, err);
      alert(`Command failed: ${err.message || String(err)}`);
    } finally {
      setExecuting(null);
    }
  };

  // Browse file system
  const browsePath = async (path: string) => {
    setFsLoading(true);
    try {
      const data = await executeCommand("fs.list", { path });
      if (data && data.status === "success") {
        setCurrentPath(data.result.current_path);
        setFiles(data.result.items || []);
      }
    } catch (err) {
      console.warn("Failed to browse path", err);
    } finally {
      setFsLoading(false);
    }
  };

  // Open file/folder on server
  const openPath = async (path: string) => {
    await executeCommand("fs.open_file", { path });
  };

  // Send Prompt to KAI
  const sendKaiPrompt = async () => {
    if (!kaiPrompt.trim()) return;
    setKaiLoading(true);
    setKaiResponse(null);
    try {
      const data = await executeCommand("kai.text_command", { command: kaiPrompt });
      if (data && data.response) {
        setKaiResponse(data.response.say || "Command processed.");
        setKaiPrompt('');
      } else {
        setKaiResponse("Command sent to server.");
      }
    } catch (err) {
      setKaiResponse("Failed to communicate with AI.");
    } finally {
      setKaiLoading(false);
    }
  };

  // Capture desktop screenshot
  const captureScreenshot = async () => {
    const data = await executeCommand("display.screenshot");
    if (data && data.status === "success" && data.result.image) {
      setScreenshotData(data.result.image);
      setScreenshotTime(new Date().toLocaleTimeString());
    }
  };

  // Format file size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper to render Category Detail Panels
  const renderCategoryDetail = () => {
    if (!activeCategory) return null;

    switch (activeCategory.id) {
      case 'media': {
        const row1Types = ['media.previous', 'media.playpause', 'media.next'];
        const row2Types = ['media.volumedown', 'media.mute', 'media.volumeup'];
        const row1 = row1Types.map(t => activeCategory.commands.find(c => c.type === t)).filter(Boolean) as Command[];
        const row2 = row2Types.map(t => activeCategory.commands.find(c => c.type === t)).filter(Boolean) as Command[];

        return (
          <View style={styles.detailPanel}>
            <Text style={styles.detailPanelTitle}>Media Controls</Text>

            <View style={styles.mediaRow}>
              {row1.map((cmd) => (
                <TouchableOpacity
                  key={cmd.type}
                  style={styles.mediaButton}
                  onPress={() => executeCommand(cmd.type, cmd.payload)}
                  disabled={executing === cmd.type}
                >
                  {executing === cmd.type ? (
                    <ActivityIndicator color={COLORS.accent} size="small" />
                  ) : (
                    <MaterialIcons
                      name={ICON_MAPPING[cmd.icon] || 'play-arrow'}
                      size={32}
                      color={COLORS.accent}
                    />
                  )}
                  <Text style={styles.mediaButtonText}>{cmd.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.mediaRow, { marginTop: 10 }]}>
              {row2.map((cmd) => (
                <TouchableOpacity
                  key={cmd.type}
                  style={styles.mediaButton}
                  onPress={() => executeCommand(cmd.type, cmd.payload)}
                  disabled={executing === cmd.type}
                >
                  {executing === cmd.type ? (
                    <ActivityIndicator color={COLORS.accent} size="small" />
                  ) : (
                    <MaterialIcons
                      name={ICON_MAPPING[cmd.icon] || 'play-arrow'}
                      size={32}
                      color={COLORS.accent}
                    />
                  )}
                  <Text style={styles.mediaButtonText}>{cmd.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      }

      case 'apps':
        return (
          <View style={styles.detailPanel}>
            <Text style={styles.detailPanelTitle}>Launch Applications</Text>
            {activeCategory.commands.map((cmd) => (
              <TouchableOpacity
                key={cmd.type + JSON.stringify(cmd.payload)}
                style={styles.appRow}
                onPress={() => executeCommand(cmd.type, cmd.payload)}
                disabled={executing === cmd.type}
              >
                <View style={styles.appRowLeft}>
                  <MaterialIcons
                    name={ICON_MAPPING[cmd.icon] || 'apps'}
                    size={24}
                    color={COLORS.textSec}
                  />
                  <Text style={styles.appRowText}>{cmd.name}</Text>
                </View>
                {executing === cmd.type ? (
                  <ActivityIndicator color={COLORS.accent} size="small" />
                ) : (
                  <View style={styles.launchBadge}>
                    <Text style={styles.launchBadgeText}>LAUNCH</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'fs':
        return (
          <View style={styles.detailPanel}>
            <Text style={styles.detailPanelTitle}>File Explorer</Text>

            {/* Safe roots selection / Parent Directory navigation */}
            <View style={styles.fsHeader}>
              {currentPath ? (
                <TouchableOpacity
                  style={styles.fsBackButton}
                  onPress={() => {
                    const parent = currentPath.substring(0, currentPath.lastIndexOf(currentPath.includes('\\') ? '\\' : '/'));
                    if (parent) browsePath(parent);
                    else setCurrentPath('');
                  }}
                >
                  <MaterialIcons name="arrow-back" size={20} color={COLORS.accent} />
                  <Text style={styles.fsPathText} numberOfLines={1}>
                    .. / {currentPath.split(/[\\/]/).pop() || currentPath}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.fsHeaderTitle}>Select Safe Root Path:</Text>
              )}
            </View>

            {/* Path listing */}
            {currentPath ? (
              <View style={styles.pathIndicator}>
                <Text style={styles.pathIndicatorText} numberOfLines={2}>
                  {currentPath}
                </Text>
              </View>
            ) : null}

            {fsLoading ? (
              <ActivityIndicator color={COLORS.accent} size="large" style={{ marginVertical: 20 }} />
            ) : !currentPath ? (
              // Root selections
              <View style={{ gap: 8 }}>
                {activeCategory.safe_roots?.map((root) => (
                  <TouchableOpacity
                    key={root.path}
                    style={styles.rootFolderCard}
                    onPress={() => browsePath(root.path)}
                  >
                    <MaterialIcons name="folder-special" size={28} color={COLORS.accent} />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.rootFolderName}>{root.name}</Text>
                      <Text style={styles.rootFolderPath} numberOfLines={1}>{root.path}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              // Directory Contents
              <ScrollView style={styles.fsScrollView} nestedScrollEnabled>
                {files.length === 0 ? (
                  <Text style={styles.emptyText}>Empty directory or no items found</Text>
                ) : (
                  files.map((file) => (
                    <TouchableOpacity
                      key={file.path}
                      style={styles.fileRow}
                      onPress={() => {
                        if (file.is_dir) {
                          browsePath(file.path);
                        } else {
                          openPath(file.path);
                        }
                      }}
                    >
                      <MaterialIcons
                        name={file.is_dir ? 'folder' : 'insert-drive-file'}
                        size={22}
                        color={file.is_dir ? COLORS.accentSoft : COLORS.textDim}
                      />
                      <View style={styles.fileRowDetails}>
                        <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                        {!file.is_dir && (
                          <Text style={styles.fileSize}>{formatSize(file.size)}</Text>
                        )}
                      </View>
                      <MaterialIcons
                        name={file.is_dir ? 'chevron-right' : 'launch'}
                        size={16}
                        color={COLORS.textDim}
                      />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        );

      case 'kai': {
        const isModelRunning = aiStatus?.ollama?.model_running === true;
        const isOllamaUp = aiStatus?.ollama?.reachable === true;
        const isOpenClawUp = aiStatus?.openclaw?.reachable === true;
        const overallStatus = aiStatus?.overall || 'UNKNOWN';

        let statusColor = COLORS.textDim;
        let statusLabel = 'CHECKING...';
        let statusIcon: keyof typeof MaterialIcons.glyphMap = 'sync';

        if (!aiStatus) {
          statusColor = COLORS.textDim;
          statusLabel = 'CHECKING...';
          statusIcon = 'sync';
        } else if (isModelRunning) {
          statusColor = COLORS.success;
          statusLabel = 'ONLINE';
          statusIcon = 'check-circle';
        } else if (isOllamaUp) {
          statusColor = COLORS.warning;
          statusLabel = 'STANDBY';
          statusIcon = 'pause-circle-outline';
        } else {
          statusColor = COLORS.danger;
          statusLabel = 'OFFLINE';
          statusIcon = 'error-outline';
        }

        return (
          <View style={styles.detailPanel}>
            <Text style={styles.detailPanelTitle}>AI Command Centre</Text>

            {/* AI Core Status Bar */}
            <View style={styles.aiStatusBar}>
              <View style={styles.aiStatusLeft}>
                <MaterialIcons name={statusIcon} size={16} color={statusColor} />
                <Text style={[styles.aiStatusLabel, { color: statusColor }]}>
                  AI CORE: {statusLabel}
                </Text>
              </View>
              <View style={styles.aiStatusRight}>
                {isOpenClawUp && (
                  <View style={styles.aiStatusChip}>
                    <View style={[styles.aiChipDot, { backgroundColor: COLORS.success }]} />
                    <Text style={styles.aiChipText}>OPENCLAW</Text>
                  </View>
                )}
                {isOllamaUp && (
                  <View style={styles.aiStatusChip}>
                    <View style={[styles.aiChipDot, { backgroundColor: COLORS.success }]} />
                    <Text style={styles.aiChipText}>OLLAMA</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.terminalContainer}>
              <View style={styles.terminalHeader}>
                <View style={styles.terminalDot} />
                <View style={[styles.terminalDot, { backgroundColor: COLORS.warning }]} />
                <View style={[styles.terminalDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.terminalTitle}>KAI-CORE.terminal</Text>
              </View>

              <View style={styles.terminalContent}>
                {kaiLoading ? (
                  <View style={styles.terminalLine}>
                    <Text style={styles.terminalPrompt}>$ </Text>
                    <Text style={styles.terminalText}>querying openclaw gateway...</Text>
                    <ActivityIndicator size="small" color={COLORS.accent} style={{ marginLeft: 8 }} />
                  </View>
                ) : kaiResponse ? (
                  <View>
                    <View style={styles.terminalLine}>
                      <Text style={styles.terminalPrompt}>$ </Text>
                      <Text style={styles.terminalText}>KAI Output response received.</Text>
                    </View>
                    <View style={styles.terminalOutputCard}>
                      <Text style={styles.terminalOutputText}>{kaiResponse}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.terminalPlaceholder}>
                    Ready to receive voice command scripts or text controls. Type in the input below.
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.promptInputContainer}>
              <TextInput
                style={styles.promptInput}
                placeholder="Ask KAI to perform a skill..."
                placeholderTextColor={COLORS.textDim}
                value={kaiPrompt}
                onChangeText={setKaiPrompt}
                onSubmitEditing={sendKaiPrompt}
              />
              <TouchableOpacity style={styles.promptSendButton} onPress={sendKaiPrompt}>
                <MaterialIcons name="send" size={20} color={COLORS.bg} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.appRow}
              onPress={() => executeCommand("kai.run_script")}
            >
              <MaterialIcons name="play-circle-outline" size={24} color={COLORS.success} />
              <Text style={[styles.appRowText, { color: COLORS.success }]}>Trigger Full Local KAI Listener</Text>
            </TouchableOpacity>

            {/* Power Down / Warm Up AI Button */}
            {isModelRunning ? (
              <TouchableOpacity
                style={styles.aiPowerDownButton}
                onPress={handlePowerDownAI}
                disabled={aiUnloading}
              >
                {aiUnloading ? (
                  <ActivityIndicator color={COLORS.bg} size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="power-settings-new" size={18} color={COLORS.bg} />
                    <Text style={styles.aiPowerDownText}>POWER DOWN AI CORE</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : isOllamaUp ? (
              <TouchableOpacity
                style={styles.aiWarmUpButton}
                onPress={handleWarmUpAI}
                disabled={aiWarming}
              >
                {aiWarming ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={COLORS.bg} size="small" />
                    <Text style={styles.aiWarmUpText}>LOADING INTO VRAM...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="bolt" size={18} color={COLORS.bg} />
                    <Text style={styles.aiWarmUpText}>BOOT AI CORE</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        );
      }

      case 'audio':
        return (
          <View style={styles.detailPanel}>
            <Text style={styles.detailPanelTitle}>System Audio Level</Text>
            <View style={styles.audioRow}>
              <TouchableOpacity
                style={styles.audioButton}
                onPress={() => executeCommand("audio.change_volume", { direction: "down", steps: 5 })}
              >
                <MaterialIcons name="remove" size={28} color={COLORS.textPrimary} />
                <Text style={styles.audioButtonLabel}>-10%</Text>
              </TouchableOpacity>

              <View style={styles.audioIconContainer}>
                <MaterialIcons name="volume-up" size={48} color={COLORS.accent} />
              </View>

              <TouchableOpacity
                style={styles.audioButton}
                onPress={() => executeCommand("audio.change_volume", { direction: "up", steps: 5 })}
              >
                <MaterialIcons name="add" size={28} color={COLORS.textPrimary} />
                <Text style={styles.audioButtonLabel}>+10%</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'display':
        return (
          <View style={styles.detailPanel}>
            <Text style={styles.detailPanelTitle}>Display Controls</Text>
            <TouchableOpacity
              style={styles.screenshotButton}
              onPress={captureScreenshot}
              disabled={executing === 'display.screenshot'}
            >
              {executing === 'display.screenshot' ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="photo-camera" size={20} color={COLORS.bg} />
                  <Text style={styles.screenshotButtonText}>CAPTURE DESKTOP SCREENSHOT</Text>
                </View>
              )}
            </TouchableOpacity>

            {screenshotData ? (
              <View style={styles.screenshotContainer}>
                <Image
                  source={{ uri: screenshotData }}
                  style={styles.screenshotImage}
                  resizeMode="contain"
                />
                <Text style={styles.screenshotTimeText}>Captured at: {screenshotTime}</Text>
              </View>
            ) : (
              <View style={styles.noScreenshotCard}>
                <MaterialIcons name="image" size={48} color={COLORS.textDim} />
                <Text style={styles.noScreenshotText}>No screenshot captured yet</Text>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  if (loading && categories.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.loadingText}>Connecting to KAI Corenet…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header (Matching style of Server Status Screen) */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Command Centre</Text>
            <Text style={styles.headerVersion}>SECURE CONNECTION</Text>
          </View>
          <View style={styles.headerRight}>
            <Animated.View style={[styles.syncDot, { opacity: pulseAnim }]} />
            <View>
              <Text style={styles.headerTime}>OPERATIONAL</Text>
              <Text style={styles.headerDate}>CONTROL UNIT</Text>
            </View>
          </View>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={24} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Categories Grid */}
        <Text style={styles.sectionTitle}>Command Categories</Text>
        <View style={styles.grid}>
          {categories.map((cat) => {
            const isActive = activeCategory?.id === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.gridCard,
                  isActive && { borderColor: COLORS.accent, backgroundColor: COLORS.cardBgAlt }
                ]}
                onPress={() => {
                  setActiveCategory(isActive ? null : cat);
                  // Reset category sub-states
                  setKaiResponse(null);
                  setCurrentPath('');
                  setFiles([]);
                }}
              >
                <MaterialIcons
                  name={ICON_MAPPING[cat.icon] || 'settings'}
                  size={28}
                  color={isActive ? COLORS.accent : COLORS.accentSoft}
                />
                <Text style={styles.cardTitle}>{cat.name}</Text>
                <Text style={styles.cardSubtitle}>{cat.commands?.length || 0} skills available</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Active Category Controls */}
        {activeCategory ? renderCategoryDetail() : (
          <View style={styles.noSelectionCard}>
            <Text style={styles.noSelectionText}>Select a command category above to begin execution</Text>
          </View>
        )}

        {/* Audit Log / History */}
        <Text style={styles.sectionTitle}>Recent Logs</Text>
        <View style={styles.card}>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No recent execution history logs found.</Text>
          ) : (
            history.map((item, index) => {
              const statusColor = item.status === 'success' ? COLORS.success : COLORS.danger;
              const dateObj = new Date(item.timestamp * 1000);
              const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

              return (
                <View
                  key={index}
                  style={[
                    styles.historyRow,
                    index !== history.length - 1 && { borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder }
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyCmdType}>{item.type}</Text>
                      <Text style={styles.historyResult} numberOfLines={1}>
                        {typeof item.result === 'object' ? JSON.stringify(item.result) : item.result}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.historyTime}>{formattedTime}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

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

  // Header styles
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
    fontWeight: '600',
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
  },
  headerDate: {
    color: COLORS.textDim,
    fontSize: 9,
    textAlign: 'right',
    marginTop: 1,
  },

  sectionTitle: {
    color: COLORS.textSec,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 12,
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3a1f26',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },

  // Grid list
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  gridCard: {
    width: (width - CARD_PADDING * 2 - 10) / 2,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: COLORS.textDim,
    fontSize: 10,
  },

  // Detail panel base
  detailPanel: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
  },
  detailPanelTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: 0.5,
  },

  // Media styles
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  mediaButton: {
    flex: 1,
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mediaButtonText: {
    color: COLORS.textSec,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },

  // App launcher styles
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  appRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appRowText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  launchBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  launchBadgeText: {
    color: COLORS.bg,
    fontSize: 9,
    fontWeight: '900',
  },

  // File explorer styles
  fsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  fsBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  fsPathText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  fsHeaderTitle: {
    color: COLORS.textSec,
    fontSize: 12,
    fontWeight: '600',
  },
  pathIndicator: {
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  pathIndicatorText: {
    color: COLORS.textDim,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  rootFolderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: 14,
  },
  rootFolderName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  rootFolderPath: {
    color: COLORS.textDim,
    fontSize: 10,
    marginTop: 2,
    width: width * 0.6,
  },
  fsScrollView: {
    maxHeight: 250,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardBg,
  },
  fileRowDetails: {
    marginLeft: 10,
    flex: 1,
  },
  fileName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  fileSize: {
    color: COLORS.textDim,
    fontSize: 9,
    marginTop: 1,
  },

  // Terminal (KAI Prompt) styles
  terminalContainer: {
    backgroundColor: '#050a0f',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBgAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  terminalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
  },
  terminalTitle: {
    color: COLORS.textSec,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginLeft: 6,
  },
  terminalContent: {
    padding: 14,
    minHeight: 100,
  },
  terminalLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  terminalPrompt: {
    color: COLORS.accent,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  terminalText: {
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  terminalOutputCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: 10,
    marginTop: 8,
  },
  terminalOutputText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    lineHeight: 18,
  },
  terminalPlaceholder: {
    color: COLORS.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  promptInputContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  promptInput: {
    flex: 1,
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  promptSendButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // AI Status Bar styles
  aiStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#050a0f',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  aiStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiStatusLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  aiStatusRight: {
    flexDirection: 'row',
    gap: 8,
  },
  aiStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  aiChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  aiChipText: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiPowerDownButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  aiPowerDownText: {
    color: COLORS.bg,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },
  aiWarmUpButton: {
    backgroundColor: COLORS.success,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  aiWarmUpText: {
    color: COLORS.bg,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },

  // Audio styles
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
  },
  audioButton: {
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  audioButtonLabel: {
    color: COLORS.textSec,
    fontSize: 10,
    fontWeight: '700',
  },
  audioIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Display/Screenshot styles
  screenshotButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  screenshotButtonText: {
    color: COLORS.bg,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  screenshotContainer: {
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 10,
    alignItems: 'center',
  },
  screenshotImage: {
    width: width - CARD_PADDING * 2 - 50,
    height: 180,
    borderRadius: 8,
  },
  screenshotTimeText: {
    color: COLORS.textDim,
    fontSize: 10,
    marginTop: 8,
    fontFamily: 'monospace',
  },
  noScreenshotCard: {
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  noScreenshotText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '600',
  },

  // Card general
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  noSelectionCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noSelectionText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.textDim,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // History list logs
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  historyCmdType: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  historyResult: {
    color: COLORS.textDim,
    fontSize: 10,
    marginTop: 2,
  },
  historyTime: {
    color: COLORS.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});

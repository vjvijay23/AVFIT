import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Activity, CheckCircle2, HeartPulse, RefreshCw } from 'lucide-react-native';
import { Colors } from '../../theme/colors';
import { useThemeStyles } from '../../theme/ThemeContext';
import { DailyHealthSummary, HealthIntegrationService } from '../../services/healthIntegrationService';

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export default function HealthConnectionsCard({ settingsMode = false, hideWhenConnected = false }: { settingsMode?: boolean; hideWhenConnected?: boolean }) {
  const styles = useThemeStyles(createStyles);
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState<DailyHealthSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = async (showEmptyNotice = false) => {
    setBusy(true);
    try {
      const result = await HealthIntegrationService.getDailySummary();
      setSummary(result);
      setConnected(true);
      if (showEmptyNotice && !result.steps && !result.distanceMeters && !result.activeCalories) {
        Alert.alert('Connected', 'Health access is ready. No activity data was available for today yet.');
      }
    } catch (error: any) {
      if (showEmptyNotice) Alert.alert('Health data unavailable', error?.message || 'Connect a health source and allow access to activity data.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    HealthIntegrationService.isConnected()
      .then(async (isConnected) => {
        if (!mounted) return;
        setConnected(isConnected);
        setChecked(true);
        if (isConnected) {
          const result = await HealthIntegrationService.getDailySummary().catch(() => null);
          if (mounted && result) setSummary(result);
        }
      })
      .catch(() => { if (mounted) { setConnected(false); setChecked(true); } });
    return () => { mounted = false; };
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      await HealthIntegrationService.connect();
      setConnected(true);
      await refresh(true);
    } catch (error: any) {
      Alert.alert('Could not connect health data', error?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    Alert.alert('Disconnect health data?', 'AVFIT will stop reading health activity data from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await HealthIntegrationService.disconnect();
          setConnected(false);
          setSummary(null);
          Alert.alert('Disconnected', Platform.OS === 'ios'
            ? 'AVFIT has stopped reading health data. To revoke system access too, open Health > Apps > AVFIT.'
            : 'AVFIT health permissions have been revoked.');
        } catch (error: any) {
          Alert.alert('Could not disconnect', error?.message || 'Please try again from Settings.');
        } finally { setBusy(false); }
      } },
    ]);
  };

  const provider = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const supported = HealthIntegrationService.isSupported();

  if (hideWhenConnected && (!checked || connected)) return null;

  return (
    <View style={styles.card}>
      <View style={styles.icon}><HeartPulse size={20} color={Colors.primary} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{connected ? 'Health data connected' : 'Connect health data'}</Text>
        <Text style={styles.description}>
          {supported
            ? `Share AVFIT workouts with ${provider} and read activity recorded by compatible apps and wearables.`
            : 'Health connections are available in the Android and iOS mobile apps.'}
        </Text>
        {connected && summary ? (
          <View style={styles.statsRow}>
            <Text style={styles.stat}>{Math.round(summary.steps).toLocaleString()} steps</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.stat}>{formatDistance(summary.distanceMeters)}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.stat}>{summary.activeCalories} kcal</Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          {connected ? <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void refresh(true)} disabled={busy || !supported} accessibilityRole="button">
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <><RefreshCw size={15} color="#fff" /><Text style={styles.primaryButtonText}>Refresh data</Text></>}
            </TouchableOpacity>
            {settingsMode && <TouchableOpacity style={styles.secondaryButton} onPress={disconnect} disabled={busy} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Disconnect</Text></TouchableOpacity>}
            {!settingsMode && <View style={styles.connected}><CheckCircle2 size={14} color={Colors.primary} /><Text style={styles.connectedText}>Connected</Text></View>}
          </> : <TouchableOpacity style={styles.primaryButton} onPress={connect} disabled={busy || !supported} accessibilityRole="button">
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <><Activity size={15} color="#fff" /><Text style={styles.primaryButtonText}>{Platform.OS === 'ios' ? 'Connect Apple Health' : 'Enable Health Connect'}</Text></>}
          </TouchableOpacity>}
        </View>
      </View>
    </View>
  );
}

const createStyles = () => ({
  card: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, padding: 15, marginBottom: 14, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 12 },
  copy: { flex: 1 },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' as const },
  description: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  statsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, marginTop: 9 },
  stat: { color: Colors.primary, fontSize: 11, fontWeight: '800' as const },
  dot: { color: Colors.textMuted, marginHorizontal: 5 },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 10, marginTop: 11 },
  primaryButton: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 7, minHeight: 38, paddingHorizontal: 13, borderRadius: 12, backgroundColor: Colors.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },
  secondaryButton: { minHeight: 38, justifyContent: 'center' as const, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  secondaryButtonText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800' as const },
  connected: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  connectedText: { color: Colors.primary, fontSize: 11, fontWeight: '800' as const },
});

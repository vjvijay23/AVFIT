import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native';
import { Colors } from '../../theme/colors';

type NoticeTone = 'info' | 'success' | 'warning' | 'error';
type Props = { message: string; tone?: NoticeTone; title?: string; compact?: boolean };

const palette = {
  info: { background: Colors.primarySoft, border: '#D2E6D9', icon: Colors.primary, title: Colors.primaryDark },
  success: { background: '#E8F3EC', border: '#C9E0D1', icon: Colors.success, title: Colors.primaryDark },
  warning: { background: '#FFF4E5', border: '#F2D7A7', icon: Colors.warning, title: '#704B00' },
  error: { background: '#FCE9E7', border: '#F4CCC7', icon: Colors.danger, title: '#8E2C29' },
};

export default function AppNoticeCard({ message, tone = 'info', title, compact = false }: Props) {
  const colors = palette[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? TriangleAlert : tone === 'error' ? AlertCircle : Info;
  return (
    <View accessibilityRole="alert" style={[styles.card, compact && styles.compact, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Icon size={compact ? 18 : 20} color={colors.icon} style={styles.icon} />
      <View style={styles.content}>
        {!!title && <Text style={[styles.title, compact && styles.compactTitle, { color: colors.title }]}>{title}</Text>}
        <Text style={[styles.message, compact && styles.compactMessage]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 15, borderWidth: 1, borderRadius: 17, marginBottom: 14 },
  compact: { padding: 12, borderRadius: 14, marginBottom: 12 },
  icon: { marginTop: 1 },
  content: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '900', marginBottom: 2 },
  compactTitle: { fontSize: 14, lineHeight: 18 },
  message: { color: Colors.textPrimary, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  compactMessage: { fontSize: 14, lineHeight: 19 },
});

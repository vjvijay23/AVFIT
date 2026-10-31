import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { BackendApi } from '../../services/backendApi';
import { Colors } from '../../theme/colors';
import AvfitLogo from '../../components/common/AvfitLogo';

export default function SetPinScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const nextRoute = route?.params?.nextRoute === 'FitnessOnboarding' ? 'FitnessOnboarding' : 'Main';

  const save = async () => {
    setError('');
    if (!/^\d{4}$/.test(pin)) { setError('Choose a PIN with exactly four digits.'); return; }
    if (pin !== confirmation) { setError('The PIN entries do not match.'); return; }
    setSaving(true);
    try {
      await BackendApi.setPin(pin, confirmation);
      navigation.replace(nextRoute);
    } catch (e: any) {
      setError(e?.message || 'Could not save your PIN. Check your connection and try again.');
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 18), paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><AvfitLogo size={38} showWordmark /></View>
        <View style={styles.card}>
          <View style={styles.icon}><LockKeyhole color={Colors.primary} size={29} /></View>
          <Text style={styles.title}>Create your sign-in PIN</Text>
          <Text style={styles.subtitle}>Use a four-digit PIN for everyday sign-in. You can verify by SMS later if you forget it.</Text>
          {!!error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
          <Text style={styles.label}>New PIN</Text>
          <TextInput value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} style={styles.input} placeholder="••••" placeholderTextColor={Colors.textMuted} accessibilityLabel="New four digit PIN" />
          <Text style={styles.label}>Confirm PIN</Text>
          <TextInput value={confirmation} onChangeText={(v) => setConfirmation(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} style={styles.input} placeholder="••••" placeholderTextColor={Colors.textMuted} accessibilityLabel="Confirm four digit PIN" onSubmitEditing={save} />
          <TouchableOpacity style={[styles.button, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>Save PIN & continue</Text><ArrowRight color="#fff" size={19} /></>}
          </TouchableOpacity>
        </View>
        <View style={styles.note}><ShieldCheck size={18} color={Colors.primary} /><Text style={styles.noteText}>AVFIT stores a salted PIN hash. Your PIN is never stored as readable text.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 18, gap: 18 },
  brand: { alignItems: 'center' },
  card: { padding: 24, borderRadius: 26, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.borderSubtle, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  icon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { textAlign: 'center', color: Colors.textPrimary, fontSize: 25, fontWeight: '900' },
  subtitle: { textAlign: 'center', color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  error: { backgroundColor: '#FCE7E5', padding: 12, borderRadius: 12, marginBottom: 14 },
  errorText: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  label: { color: Colors.textPrimary, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  input: { minHeight: 60, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: '#FAFAF8', color: Colors.primary, fontSize: 27, fontWeight: '800', letterSpacing: 14, textAlign: 'center' },
  button: { flexDirection: 'row', gap: 10, minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 16, marginTop: 22 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  note: { flexDirection: 'row', gap: 9, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceWarm },
  noteText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
});

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Fingerprint, Lock, ShieldCheck } from 'lucide-react-native';
import { Colors } from '../../theme/colors';
import { AuthService } from '../../services/auth';
import AvfitLogo from '../../components/common/AvfitLogo';
import AppNoticeCard from '../../components/common/AppNoticeCard';

const COUNTRY_CODES = [
  { code: '+1', name: 'US / CA', flag: '🇺🇸' }, { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+44', name: 'UK', flag: '🇬🇧' }, { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' }, { code: '+971', name: 'UAE', flag: '🇦🇪' },
];

export default function LoginScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const initialCountry = COUNTRY_CODES.find((item) => item.code === route?.params?.countryCode) || COUNTRY_CODES[1];
  const [selectedCountry, setSelectedCountry] = useState(initialCountry);
  const [phone, setPhone] = useState(() => typeof route?.params?.phone === 'string' ? route.params.phone.replace(initialCountry.code, '').replace(/\D/g, '') : '');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<'pin' | 'otp' | 'biometric' | null>(null);
  const [error, setError] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => { AuthService.isBiometricLoginEnabled().then(setBiometricEnabled); }, []);

  const getFullPhone = () => `${selectedCountry.code}${phone.replace(/\D/g, '')}`;
  const validatePhone = () => {
    if (phone.replace(/\D/g, '').length < 8) {
      setError('Enter the registered phone number, including the correct country code.');
      return false;
    }
    return true;
  };

  const loginWithPin = async () => {
    setError('');
    if (!validatePhone()) return;
    if (!/^\d{4}$/.test(pin)) { setError('Enter your four-digit PIN.'); return; }
    setLoading(true); setAction('pin');
    try {
      await AuthService.signInWithPin(getFullPhone(), pin);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      setError(e?.message || 'Could not sign in. Check your phone and PIN, then try again.');
    } finally { setLoading(false); setAction(null); }
  };

  const recoverWithOtp = async () => {
    setError('');
    if (!validatePhone()) return;
    setLoading(true); setAction('otp');
    const fullPhone = getFullPhone();
    try {
      await AuthService.sendPhoneOtp({ phone: fullPhone, countryCode: selectedCountry.code }, 'login');
      navigation.navigate('OtpVerification', {
        phone: fullPhone,
        countryCode: selectedCountry.code,
        authMode: 'login',
        forcePinReset: true,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not send a recovery code. Please try again.');
    } finally { setLoading(false); setAction(null); }
  };

  const loginWithBiometrics = async () => {
    setError(''); setLoading(true); setAction('biometric');
    try {
      const unlocked = await AuthService.signInWithBiometrics();
      if (!unlocked) throw new Error('Biometric sign-in was not completed. Sign in with your PIN or use SMS recovery.');
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      setError(e?.message || 'Biometric sign-in is unavailable.');
    } finally { setLoading(false); setAction(null); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 18), paddingBottom: 36 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}><TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}><Text style={styles.backText}>‹</Text></TouchableOpacity><AvfitLogo size={36} showWordmark /><View style={{ width: 42 }} /></View>
        <View style={styles.card}>
          <View style={styles.iconCircle}><Lock size={28} color={Colors.primary} /></View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in securely with your four-digit PIN. SMS verification is only needed for account recovery.</Text>

          {!!error && <AppNoticeCard message={error} tone="error" compact />}

          <Text style={styles.label}>Mobile number</Text>
          <View style={styles.phoneRow}>
            <TouchableOpacity style={styles.countryButton} onPress={() => setShowCountries((value) => !value)}>
              <Text style={styles.countryText}>{selectedCountry.flag}  {selectedCountry.code}⌄</Text>
            </TouchableOpacity>
            <TextInput style={styles.phoneInput} value={phone} onChangeText={(value) => { setPhone(value); setError(''); }} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={Colors.textMuted} autoComplete="tel" />
          </View>
          {showCountries && <View style={styles.countryList}>{COUNTRY_CODES.map((item) => <TouchableOpacity key={item.code} style={styles.countryItem} onPress={() => { setSelectedCountry(item); setShowCountries(false); }}><Text style={styles.countryItemText}>{item.flag}  {item.name}  {item.code}</Text></TouchableOpacity>)}</View>}

          <Text style={[styles.label, { marginTop: 18 }]}>4-digit PIN</Text>
          <TextInput style={styles.pinInput} value={pin} onChangeText={(value) => { setPin(value.replace(/\D/g, '').slice(0, 4)); setError(''); }} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={Colors.textMuted} textContentType="oneTimeCode" accessibilityLabel="Four digit sign-in PIN" />

          <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={loginWithPin} disabled={loading} activeOpacity={0.85}>
            {loading && action === 'pin' ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryButtonText}>Sign in with PIN</Text><ArrowRight size={19} color="#fff" /></>}
          </TouchableOpacity>

          {biometricEnabled && Platform.OS !== 'web' && <TouchableOpacity style={styles.biometricButton} onPress={loginWithBiometrics} disabled={loading}>
            {loading && action === 'biometric' ? <ActivityIndicator color={Colors.primary} /> : <><Fingerprint size={20} color={Colors.primary} /><Text style={styles.biometricText}>Use fingerprint or face unlock</Text></>}
          </TouchableOpacity>}

          <TouchableOpacity style={styles.recoveryButton} onPress={recoverWithOtp} disabled={loading}>
            {loading && action === 'otp' ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.recoveryText}>Forgot or don’t have a PIN? Verify by SMS</Text>}
          </TouchableOpacity>

          <View style={styles.signupRow}><Text style={styles.signupText}>New to AVFIT?</Text><TouchableOpacity onPress={() => navigation.navigate('Signup')}><Text style={styles.signupLink}> Create an account</Text></TouchableOpacity></View>
        </View>
        <View style={styles.securityNote}><ShieldCheck size={17} color={Colors.primary} /><Text style={styles.noteText}>Your PIN is stored as a secure hash. OTP is used only for account verification and recovery.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 18, gap: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, lineHeight: 34, color: Colors.textPrimary },
  card: { backgroundColor: '#fff', borderRadius: 26, padding: 24, borderWidth: 1, borderColor: Colors.borderSubtle, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  iconCircle: { alignSelf: 'center', width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 27, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, color: Colors.textSecondary, marginTop: 8, marginBottom: 22, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.45, color: Colors.textPrimary, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', minHeight: 58, borderRadius: 15, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: '#FAFAF8', overflow: 'hidden' },
  countryButton: { paddingHorizontal: 14, backgroundColor: Colors.surfaceWarm, borderRightWidth: 1, borderRightColor: Colors.border, justifyContent: 'center' },
  countryText: { fontSize: 15, color: Colors.textPrimary, fontWeight: '700' },
  phoneInput: { flex: 1, paddingHorizontal: 15, fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  countryList: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  countryItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  countryItemText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  pinInput: { minHeight: 62, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 15, backgroundColor: '#FAFAF8', fontSize: 28, letterSpacing: 14, textAlign: 'center', color: Colors.primary, fontWeight: '800', marginBottom: 18 },
  primaryButton: { minHeight: 58, backgroundColor: Colors.primary, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: Colors.primary, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  disabled: { opacity: 0.65 },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  biometricButton: { minHeight: 54, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 15, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 12, backgroundColor: Colors.primarySoft },
  biometricText: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  recoveryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  recoveryText: { color: Colors.primary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  signupText: { fontSize: 14, color: Colors.textSecondary },
  signupLink: { fontSize: 14, color: Colors.primary, fontWeight: '900' },
  securityNote: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, backgroundColor: Colors.surfaceWarm },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
});

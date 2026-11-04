import { useTheme, useThemeStyles } from '../../theme/ThemeContext';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import AvfitLogo from '../../components/common/AvfitLogo';
import {
  Activity,
  ArrowRight,
} from 'lucide-react-native';

interface AuthWelcomeScreenProps {
  navigation: any;
}

export default function AuthWelcomeScreen({ navigation }: AuthWelcomeScreenProps) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={styles.header}>
          <AvfitLogo size={52} showWordmark={true} />
        </View>

        {/* Hero Visual Block */}
        <View style={styles.heroCard}>
          <View style={styles.heroCenterGraphic}>
            <View style={styles.athleteBadge}>
              <Activity size={36} color={Colors.primary} strokeWidth={2.5} />
            </View>
          </View>
          <Text style={styles.heroTitle}>Fitness, made simple.</Text>
          <Text style={styles.heroSubtitle}>
            Track workouts, meals, and progress in one place.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          {/* Sign Up CTA */}
          <TouchableOpacity
            style={styles.signupButton}
            onPress={() => navigation.navigate('Signup')}
            activeOpacity={0.85}
          >
            <Text style={styles.signupButtonText}>Create Account / Sign Up</Text>
            <ArrowRight size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Log In CTA */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.loginButtonText}>I Already Have an Account • Log In</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </View>
  );
}

const createStyles = () => ({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 24 : 16,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceWarm,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.8,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  heroCenterGraphic: {
    marginBottom: 12,
  },
  athleteBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  featuresList: {
    gap: 10,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1824',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 12,
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTextBox: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  featureSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  actionSection: {
    gap: 10,
    marginBottom: 16,
  },
  signupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  signupButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 15,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  securityText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

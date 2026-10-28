import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import {
  FitnessProfile,
  FitnessGoal,
  ActivityLevel,
  WorkoutPreference,
  DietaryPreference,
  Gender,
  UnitSystem,
} from '../../types';
import {
  FitnessProfileService,
  MEDICAL_DISCLAIMER_TEXT,
} from '../../services/fitnessProfile';
import { AuthService } from '../../services/auth';
import {
  User,
  Shield,
  Save,
  ChevronLeft,
  Flame,
  Scale,
  Sparkles,
  AlertCircle,
  Check,
  LogOut,
} from 'lucide-react-native';

interface ProfileEditScreenProps {
  navigation?: any;
  onLoggedOut?: () => void;
}

export default function ProfileEditScreen({ navigation, onLoggedOut }: ProfileEditScreenProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [heightCm, setHeightCm] = useState('178');
  const [weightKg, setWeightKg] = useState('74');
  const [targetWeightKg, setTargetWeightKg] = useState('71');
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>('weight_loss');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderately_active');
  const [workoutPreference, setWorkoutPreference] = useState<WorkoutPreference>('combination');
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>('non_vegetarian');
  const [dietaryPreferenceOther, setDietaryPreferenceOther] = useState('');
  const [allergies, setAllergies] = useState<string[]>(['none']);
  const [customAllergiesAndRestrictions, setCustomAllergiesAndRestrictions] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [availableEquipment, setAvailableEquipment] = useState<string[]>(['bodyweight']);
  const [preferredDurationMin, setPreferredDurationMin] = useState(30);
  const [weeklyFrequencyDays, setWeeklyFrequencyDays] = useState(4);
  const [isPrivate, setIsPrivate] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const user = await AuthService.getUserProfile();
        const fitness = await FitnessProfileService.getFitnessProfile();

        setFullName(user.fullName || 'Alex Vance');
        setPhone(user.phone || '');
        setDateOfBirth(user.dateOfBirth?.slice(0, 10) || '');
        setGender(user.gender || 'prefer_not_to_say');

        setHeightCm(fitness.heightCm.toString());
        setWeightKg(fitness.weightKg.toString());
        setTargetWeightKg(fitness.targetWeightKg?.toString() || '');
        setFitnessGoal(fitness.fitnessGoal);
        setActivityLevel(fitness.activityLevel);
        setWorkoutPreference(fitness.workoutPreference);
        setDietaryPreference(fitness.dietaryPreference);
        setDietaryPreferenceOther(fitness.dietaryPreferenceOther || '');
        setAllergies(fitness.allergiesAndRestrictions.length ? fitness.allergiesAndRestrictions : ['none']);
        setCustomAllergiesAndRestrictions(fitness.customAllergiesAndRestrictions || '');
        setFitnessLevel(fitness.fitnessLevel);
        setAvailableEquipment(fitness.availableEquipment);
        setPreferredDurationMin(fitness.preferredWorkoutDurationMin);
        setWeeklyFrequencyDays(fitness.weeklyWorkoutFrequencyDays);
        setIsPrivate(fitness.isPrivate);
      } catch (e) {
        // Fallback
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  // Live Mifflin-St Jeor Calculation
  const parsedWeight = parseFloat(weightKg) || 70;
  const parsedHeight = parseFloat(heightCm) || 175;
  const parsedAge = ageFromDateOfBirth(dateOfBirth) || 30;

  const liveBmr = FitnessProfileService.calculateBMR(parsedWeight, parsedHeight, parsedAge, gender);
  const liveTdee = FitnessProfileService.calculateTDEE(liveBmr, activityLevel);
  const liveNutrition = FitnessProfileService.calculateNutritionTargets(
    liveTdee,
    fitnessGoal,
    parsedWeight,
    gender
  );

  const toggleAllergy = (item: string) => {
    if (item === 'none') {
      setAllergies(['none']);
      return;
    }
    const selected = allergies.filter((value) => value !== 'none');
    if (selected.includes(item)) {
      const next = selected.filter((value) => value !== item);
      setAllergies(next.length ? next : ['none']);
    } else {
      setAllergies([...selected, item]);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (dateOfBirth && (!ageFromDateOfBirth(dateOfBirth) || parsedAge < 13 || parsedAge > 100)) {
      Alert.alert('Invalid birth date', 'Enter a valid date of birth for someone between 13 and 100 years old.');
      return;
    }
    if (dietaryPreference === 'other' && !dietaryPreferenceOther.trim()) {
      Alert.alert('Dietary preference required', 'Describe your dietary preference.');
      return;
    }
    if (allergies.includes('other') && !customAllergiesAndRestrictions.trim()) {
      Alert.alert('Restriction required', 'Describe your other food allergy or restriction.');
      return;
    }
    setIsSaving(true);
    try {
      await AuthService.saveUserProfile({
        fullName,
        dateOfBirth: dateOfBirth || undefined,
        age: parsedAge,
        gender,
      });

      await FitnessProfileService.saveFitnessProfile(
        {
          userId: AuthService.getActiveUserId(),
          heightCm: parsedHeight,
          weightKg: parsedWeight,
          targetWeightKg: parseFloat(targetWeightKg) || undefined,
          fitnessGoal,
          fitnessLevel,
          activityLevel,
          workoutPreference,
          availableEquipment,
          preferredWorkoutDurationMin: preferredDurationMin,
          weeklyWorkoutFrequencyDays: weeklyFrequencyDays,
          dietaryPreference,
          dietaryPreferenceOther: dietaryPreference === 'other' ? dietaryPreferenceOther.trim() : '',
          allergiesAndRestrictions: allergies,
          customAllergiesAndRestrictions: allergies.includes('other') ? customAllergiesAndRestrictions.trim() : '',
          isPrivate,
        },
        parsedAge,
        gender
      );

      Alert.alert('Profile Updated', 'Your biological targets and nutrition plan have been updated successfully.');
      if (navigation?.goBack) {
        navigation.goBack();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unable to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of AVFIT?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AuthService.signOut();
            if (onLoggedOut) {
              onLoggedOut();
            } else if (navigation?.reset) {
              navigation.reset({
                index: 0,
                routes: [{ name: 'AuthWelcome' }],
              });
            } else if (navigation?.replace) {
              navigation.replace('AuthWelcome');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        {navigation?.goBack && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fitness Profile & Settings</Text>
          <Text style={styles.subTitle}>Edit metrics and adjust nutritional algorithms</Text>
        </View>
        <TouchableOpacity
          style={styles.saveIconButton}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Save size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Recalculated Caloric Target Pill */}
        <View style={styles.recalcBanner}>
          <Flame size={20} color={Colors.accentOrange} />
          <View style={{ flex: 1 }}>
            <Text style={styles.recalcTitle}>
              Dynamic Calorie Target: {liveNutrition.calorieTarget} kcal
            </Text>
            <Text style={styles.recalcSub}>
              Protein: {liveNutrition.proteinG}g • Carbs: {liveNutrition.carbsG}g • Fat: {liveNutrition.fatG}g
            </Text>
          </View>
        </View>

        {/* Section: Basic Identity */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Basic Identity</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full Name"
          />

          <Text style={styles.label}>Phone Number (Verified)</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={phone}
            editable={false}
          />
        </View>

        {/* Section: Anthropometrics */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Body Metrics</Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="1990-05-24"
              autoCapitalize="none"
            />
          </View>
          <View>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
                <TouchableOpacity
                  style={[styles.chip, gender === 'male' && styles.chipActive]}
                  onPress={() => setGender('male')}
                >
                  <Text style={[styles.chipText, gender === 'male' && styles.chipTextActive]}>
                    M
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, gender === 'female' && styles.chipActive]}
                  onPress={() => setGender('female')}
                >
                  <Text style={[styles.chipText, gender === 'female' && styles.chipTextActive]}>
                    F
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, gender === 'non_binary' && styles.chipActive]}
                  onPress={() => setGender('non_binary')}
                >
                  <Text style={[styles.chipText, gender === 'non_binary' && styles.chipTextActive]}>
                    Other
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, gender === 'prefer_not_to_say' && styles.chipActive]}
                  onPress={() => setGender('prefer_not_to_say')}
                >
                  <Text style={[styles.chipText, gender === 'prefer_not_to_say' && styles.chipTextActive]}>
                    Prefer not to say
                  </Text>
                </TouchableOpacity>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Target Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={targetWeightKg}
            onChangeText={setTargetWeightKg}
            keyboardType="numeric"
            placeholder="e.g. 71"
          />
        </View>

        {/* Section: Goals & Activity */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Fitness Goal</Text>
          <View style={styles.choiceGroup}>
            {[
              { id: 'weight_loss', label: 'Weight Loss' },
              { id: 'muscle_gain', label: 'Muscle Gain' },
              { id: 'general_fitness', label: 'General Fitness' },
              { id: 'endurance', label: 'Endurance' },
            ].map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.choicePill, fitnessGoal === g.id && styles.choicePillActive]}
                onPress={() => setFitnessGoal(g.id as FitnessGoal)}
              >
                <Text
                  style={[
                    styles.choicePillText,
                    fitnessGoal === g.id && styles.choicePillTextActive,
                  ]}
                >
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionHeading, { marginTop: 16 }]}>Activity Level</Text>
          <View style={styles.choiceGroup}>
            {[
              { id: 'sedentary', label: 'Sedentary' },
              { id: 'lightly_active', label: 'Lightly Active' },
              { id: 'moderately_active', label: 'Moderately Active' },
              { id: 'very_active', label: 'Very Active' },
            ].map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.choicePill, activityLevel === a.id && styles.choicePillActive]}
                onPress={() => setActivityLevel(a.id as ActivityLevel)}
              >
                <Text
                  style={[
                    styles.choicePillText,
                    activityLevel === a.id && styles.choicePillTextActive,
                  ]}
                >
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Food Preferences */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Food Preferences</Text>
          <Text style={styles.label}>Dietary Preference</Text>
          <View style={styles.choiceGroup}>
            {[
              { id: 'non_vegetarian', label: 'Omnivore / Non-Veg' },
              { id: 'vegetarian', label: 'Vegetarian' },
              { id: 'vegan', label: 'Plant-Based / Vegan' },
              { id: 'pescatarian', label: 'Pescatarian' },
              { id: 'keto', label: 'Keto / Low-Carb' },
              { id: 'halal', label: 'Halal' },
              { id: 'other', label: 'Other' },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.choicePill, dietaryPreference === item.id && styles.choicePillActive]}
                onPress={() => setDietaryPreference(item.id as DietaryPreference)}
              >
                <Text style={[styles.choicePillText, dietaryPreference === item.id && styles.choicePillTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {dietaryPreference === 'other' && (
            <TextInput
              style={styles.input}
              value={dietaryPreferenceOther}
              onChangeText={setDietaryPreferenceOther}
              placeholder="Describe your dietary preference"
              maxLength={500}
            />
          )}
          <Text style={[styles.label, { marginTop: 14 }]}>Food Allergies & Restrictions</Text>
          <View style={styles.choiceGroup}>
            {[
              { id: 'none', label: 'None' },
              { id: 'peanuts', label: 'Peanuts' },
              { id: 'tree_nuts', label: 'Tree Nuts' },
              { id: 'gluten', label: 'Gluten / Wheat' },
              { id: 'dairy', label: 'Dairy / Lactose' },
              { id: 'shellfish', label: 'Shellfish' },
              { id: 'soy', label: 'Soy' },
              { id: 'other', label: 'Other' },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.choicePill, allergies.includes(item.id) && styles.choicePillActive]}
                onPress={() => toggleAllergy(item.id)}
              >
                <Text style={[styles.choicePillText, allergies.includes(item.id) && styles.choicePillTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {allergies.includes('other') && (
            <TextInput
              style={styles.input}
              value={customAllergiesAndRestrictions}
              onChangeText={setCustomAllergiesAndRestrictions}
              placeholder="Add other food allergies or restrictions"
              maxLength={500}
            />
          )}
        </View>

        {/* Privacy Toggle */}
        <TouchableOpacity
          style={styles.privacyCard}
          onPress={() => setIsPrivate(!isPrivate)}
          activeOpacity={0.8}
        >
          <Shield size={20} color={Colors.primary} />
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={styles.privacyTitle}>Private Health Profile</Text>
            <Text style={styles.privacyDesc}>Keep body weight and metrics hidden from community</Text>
          </View>
          <View style={[styles.togglePill, isPrivate && styles.togglePillActive]}>
            <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbActive]} />
          </View>
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut} activeOpacity={0.7}>
          <LogOut size={16} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out of AVFIT</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ageFromDateOfBirth(value?: string): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return undefined;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCFullYear() !== year || birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCDate() !== day) return undefined;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age >= 0 ? age : undefined;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  saveIconButton: {
    backgroundColor: Colors.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  recalcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primarySoft,
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(36, 74, 50, 0.15)',
  },
  recalcTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  recalcSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputDisabled: {
    backgroundColor: '#F3EDE2',
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceWarm,
    borderRadius: 10,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  choiceGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choicePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surfaceWarm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  choicePillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  choicePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  choicePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceWarm,
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  privacyDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  togglePill: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
    padding: 2,
    justifyContent: 'center',
  },
  togglePillActive: {
    backgroundColor: Colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
  },
});

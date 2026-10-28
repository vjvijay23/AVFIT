import React, { useState, useEffect, useRef } from 'react';
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
import { BackendApi } from '../../services/backendApi';
import DateOfBirthPicker from '../../components/common/DateOfBirthPicker';
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

interface ProfileFormSnapshot {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  fitnessGoal: FitnessGoal;
  activityLevel: ActivityLevel;
  workoutPreference: WorkoutPreference;
  dietaryPreference: DietaryPreference;
  dietaryPreferenceOther: string;
  allergies: string[];
  customAllergiesAndRestrictions: string;
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
  availableEquipment: string[];
  preferredDurationMin: number;
  weeklyFrequencyDays: number;
  isPrivate: boolean;
}

export default function ProfileEditScreen({ navigation, onLoggedOut }: ProfileEditScreenProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Changes save automatically');

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
  const [formRevision, setFormRevision] = useState(0);
  const formRevisionRef = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const markEdited = () => {
    formRevisionRef.current += 1;
    setFormRevision(formRevisionRef.current);
    setSaveStatus('Unsaved changes');
  };

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

  const captureForm = (): ProfileFormSnapshot => ({
    fullName, dateOfBirth, gender, heightCm, weightKg, targetWeightKg,
    fitnessGoal, activityLevel, workoutPreference, dietaryPreference,
    dietaryPreferenceOther, allergies, customAllergiesAndRestrictions,
    fitnessLevel, availableEquipment, preferredDurationMin, weeklyFrequencyDays, isPrivate,
  });

  const validateForm = (form: ProfileFormSnapshot): string | null => {
    if (!form.fullName.trim()) return 'Enter your name before saving.';
    const age = ageFromDateOfBirth(form.dateOfBirth);
    if (!age || age < 13 || age > 100) return 'Choose a valid birth date for someone between 13 and 100 years old.';
    const height = Number(form.heightCm);
    const weight = Number(form.weightKg);
    const target = form.targetWeightKg.trim() ? Number(form.targetWeightKg) : undefined;
    if (!Number.isFinite(height) || height < 80 || height > 250) return 'Enter a height between 80 and 250 cm.';
    if (!Number.isFinite(weight) || weight < 25 || weight > 350) return 'Enter a weight between 25 and 350 kg.';
    if (target !== undefined && (!Number.isFinite(target) || target < 25 || target > 350)) return 'Enter a target weight between 25 and 350 kg.';
    if (form.dietaryPreference === 'other' && !form.dietaryPreferenceOther.trim()) return 'Describe your other dietary preference.';
    if (form.allergies.includes('other') && !form.customAllergiesAndRestrictions.trim()) return 'Describe your other allergy or restriction.';
    return null;
  };

  const persistForm = async (form: ProfileFormSnapshot) => {
    if (!BackendApi.hasAuthToken()) throw new Error('Your sign-in session expired. Sign in again to save profile changes.');
    const age = ageFromDateOfBirth(form.dateOfBirth) || 30;
    await AuthService.saveUserProfile({
      fullName: form.fullName.trim(),
      dateOfBirth: form.dateOfBirth || undefined,
      age,
      gender: form.gender,
    });
    await FitnessProfileService.saveFitnessProfile(
      {
        userId: AuthService.getActiveUserId(),
        heightCm: Number(form.heightCm),
        weightKg: Number(form.weightKg),
        targetWeightKg: form.targetWeightKg.trim() ? Number(form.targetWeightKg) : undefined,
        fitnessGoal: form.fitnessGoal,
        fitnessLevel: form.fitnessLevel,
        activityLevel: form.activityLevel,
        workoutPreference: form.workoutPreference,
        availableEquipment: form.availableEquipment,
        preferredWorkoutDurationMin: form.preferredDurationMin,
        weeklyWorkoutFrequencyDays: form.weeklyFrequencyDays,
        dietaryPreference: form.dietaryPreference,
        dietaryPreferenceOther: form.dietaryPreference === 'other' ? form.dietaryPreferenceOther.trim() : '',
        allergiesAndRestrictions: form.allergies,
        customAllergiesAndRestrictions: form.allergies.includes('other') ? form.customAllergiesAndRestrictions.trim() : '',
        isPrivate: form.isPrivate,
      },
      age,
      form.gender
    );
  };

  const queueAutosave = (form: ProfileFormSnapshot, revision: number) => {
    const save = saveQueue.current.then(async () => {
      setIsSaving(true);
      setSaveStatus('Saving to your account…');
      try {
        await persistForm(form);
        if (formRevisionRef.current === revision) setSaveStatus('Saved to your account');
      } catch (error) {
        if (formRevisionRef.current === revision) setSaveStatus(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved. Check your connection and retry.');
        throw error;
      } finally {
        setIsSaving(false);
      }
    });
    saveQueue.current = save.catch(() => undefined);
    return save;
  };

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading || formRevision === 0) return undefined;
    const revision = formRevision;
    const form = captureForm();
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const invalidReason = validateForm(form);
      if (invalidReason) {
        if (formRevisionRef.current === revision) setSaveStatus(`Not saved: ${invalidReason}`);
        return;
      }
      void queueAutosave(form, revision).catch(() => undefined);
    }, 650);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [formRevision, isLoading]);

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
      markEdited();
      return;
    }
    const selected = allergies.filter((value) => value !== 'none');
    if (selected.includes(item)) {
      const next = selected.filter((value) => value !== item);
      setAllergies(next.length ? next : ['none']);
    } else {
      setAllergies([...selected, item]);
    }
    markEdited();
  };

  const handleSave = async () => {
    const form = captureForm();
    const invalidReason = validateForm(form);
    if (invalidReason) {
      Alert.alert('Check your profile details', invalidReason);
      return;
    }
    setIsSaving(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    try {
      await queueAutosave(form, formRevisionRef.current);
      Alert.alert('Profile Updated', 'Your biological targets and nutrition plan have been updated successfully.');
      setSaveStatus('Saved to your account');
      if (navigation?.goBack) {
        navigation.goBack();
      }
    } catch (e: any) {
      setSaveStatus(e.message || 'Not saved. Check your connection and retry.');
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
          <Text style={styles.subTitle}>Your profile changes save automatically</Text>
          <Text style={[styles.saveStatus, saveStatus.startsWith('Not saved') && styles.saveStatusError]}>{saveStatus}</Text>
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
            onChangeText={(value) => { setFullName(value); markEdited(); }}
            placeholder="Full Name"
          />

          <Text style={styles.label}>Phone Number (Verified)</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={phone}
            editable={false}
          />

          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {[
              { value: 'male' as Gender, label: 'Male' },
              { value: 'female' as Gender, label: 'Female' },
              { value: 'non_binary' as Gender, label: 'Other' },
              { value: 'prefer_not_to_say' as Gender, label: 'Prefer not to say' },
            ].map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[styles.chip, gender === item.value && styles.chipActive]}
                onPress={() => { setGender(item.value); markEdited(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === item.value }}
              >
                <Text style={[styles.chipText, gender === item.value && styles.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Anthropometrics */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Body Metrics</Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>Date of Birth</Text>
            <DateOfBirthPicker value={dateOfBirth} onChange={(value) => { setDateOfBirth(value); markEdited(); }} />
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={(value) => { setHeightCm(value); markEdited(); }}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={(value) => { setWeightKg(value); markEdited(); }}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Target Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={targetWeightKg}
            onChangeText={(value) => { setTargetWeightKg(value); markEdited(); }}
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
                onPress={() => { setFitnessGoal(g.id as FitnessGoal); markEdited(); }}
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
                onPress={() => { setActivityLevel(a.id as ActivityLevel); markEdited(); }}
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
                onPress={() => { setDietaryPreference(item.id as DietaryPreference); markEdited(); }}
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
              onChangeText={(value) => { setDietaryPreferenceOther(value); markEdited(); }}
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
              onChangeText={(value) => { setCustomAllergiesAndRestrictions(value); markEdited(); }}
              placeholder="Add other food allergies or restrictions"
              maxLength={500}
            />
          )}
        </View>

        {/* Privacy Toggle */}
        <TouchableOpacity
          style={styles.privacyCard}
          onPress={() => { setIsPrivate(!isPrivate); markEdited(); }}
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
  saveStatus: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '700',
    marginTop: 3,
  },
  saveStatusError: {
    color: Colors.danger,
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
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    width: '48%',
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

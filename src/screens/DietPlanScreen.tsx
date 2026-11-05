import { useTheme, useThemeStyles } from '../theme/ThemeContext';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, ChevronRight, Flame, Plus, Save, Sparkles, Utensils, X } from 'lucide-react-native';
import { BackendApi } from '../services/backendApi';
import { Colors } from '../theme/colors';
import AppNoticeCard from '../components/common/AppNoticeCard';

type Meal = { meal_type?: 'breakfast' | 'lunch' | 'snack' | 'dinner'; name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
type DietDay = { day: string; meals: Meal[]; daily_totals: Record<string, number> };
type DietPlan = { title: string; goal_summary: string; daily_targets: Record<string, number>; days: DietDay[]; notes: string[] };

export default function DietPlanScreen({ navigation, route }: any) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState('');
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [todayMeals, setTodayMeals] = useState<Array<Record<string, any>>>([]);
  const [calorieTarget, setCalorieTarget] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [mealFilter, setMealFilter] = useState('all');
  const [showMealFilter, setShowMealFilter] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [manualCategory, setManualCategory] = useState('lunch');
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [savingMeal, setSavingMeal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
  const signedIn = BackendApi.hasAuthToken();
  const selectedDay = useMemo(() => plan?.days[Math.min(dayIndex, Math.max(0, (plan?.days.length || 1) - 1))], [plan, dayIndex]);
  const caloriesEaten = useMemo(() => todayMeals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0), [todayMeals]);
  const filteredMeals = useMemo(() => mealFilter === 'all' ? todayMeals : todayMeals.filter((meal) => String(meal.meal_type || '').toLowerCase() === mealFilter), [todayMeals, mealFilter]);

  const openManualEntry = () => {
    if (!signedIn) {
      setNotice('Sign in to save meals to your account.');
      navigation.navigate('Login');
      return;
    }
    setManualEntryOpen(true);
  };

  const loadNutrition = async () => {
    if (!BackendApi.hasAuthToken()) { setLoading(false); return; }
    const [planResult, mealsResult, profileResult] = await Promise.allSettled([
      BackendApi.getLatestDietPlan(), BackendApi.getMeals(), BackendApi.getFitnessProfile(),
    ]);
    if (planResult.status === 'fulfilled') {
      const savedPlan = planResult.value.plan?.plan || null;
      setPlan(savedPlan); setDayIndex(0);
      if (savedPlan?.daily_targets?.calories) setCalorieTarget(Number(savedPlan.daily_targets.calories));
    } else setNotice('Your 7-day plan is unavailable right now. You can still log today’s food.');
    if (mealsResult.status === 'fulfilled') {
      const today = localDateKey(new Date());
      setTodayMeals(mealsResult.value.meals.filter((meal) => meal.logged_at && localDateKey(new Date(meal.logged_at)) === today));
    } else setNotice('Today’s food entries could not be refreshed. Try again shortly.');
    if (profileResult.status === 'fulfilled') {
      const target = Number(profileResult.value.profile?.daily_calorie_target || profileResult.value.profile?.dailyCalorieTarget || 0);
      if (target > 0) setCalorieTarget(target);
    }
  };

  useEffect(() => {
    void loadNutrition().finally(() => setLoading(false));
    // Refresh the diary when returning from the scanner so saved meals appear immediately.
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadNutrition(); });
    return unsubscribe;
  }, [navigation]);

  const generate = async () => {
    if (!BackendApi.hasAuthToken()) { setNotice('Sign in first so your personalized chart can use your body details and save to your account.'); return; }
    setNotice(''); setGenerating(true);
    try {
      const response = await BackendApi.generateDietPlan(focus.trim() || undefined);
      setPlan(response.plan.plan); setDayIndex(0);
      setCalorieTarget(Number(response.plan.plan?.daily_targets?.calories || calorieTarget));
      setPlanExpanded(true);
    } catch (error: any) {
      setNotice(error?.message || 'We could not prepare your chart right now. Please try again.');
    } finally { setGenerating(false); }
  };

  const saveManualMeal = async () => {
    const calories = Number(manualCalories);
    const dishName = manualName.trim();
    if (!dishName || !Number.isFinite(calories) || calories <= 0 || calories > 10000) {
      setNotice('Add a food name and a calorie value from 1 to 10,000.');
      return;
    }
    setSavingMeal(true); setNotice('');
    try {
      await BackendApi.createMeal({
        dishName, portionGrams: 100, calories,
        proteinG: Number(manualProtein) || 0,
        carbsG: Number(manualCarbs) || 0,
        fatG: Number(manualFat) || 0,
        fiberG: 0,
        confidence: 'manual',
        mealType: manualCategory,
      });
      setManualEntryOpen(false); setCategoryDropdownOpen(false);
      setManualName(''); setManualCalories(''); setManualProtein(''); setManualCarbs(''); setManualFat('');
      await loadNutrition();
      setNotice(`${dishName} added to today’s food log.`);
    } catch (error: any) {
      setNotice(error?.message || 'Could not save this entry. Please try again.');
    } finally { setSavingMeal(false); }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => route?.name === 'Diet' ? navigation.navigate('Dashboard') : navigation.goBack()} style={styles.backButton} accessibilityLabel="Go back"><ArrowLeft color={Colors.textPrimary} size={21} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Nutrition</Text><Text style={styles.subtitle}>Today&apos;s meals and targets</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.generatorCard}>
          <View style={styles.generatorHeader}>
            <View style={styles.generatorIcon}><Sparkles size={21} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.generatorTitle}>AI meal plan</Text><Text style={styles.generatorSubtitle}>A personal 7-day guide</Text></View>
            <View style={styles.weekBadge}><Text style={styles.weekBadgeText}>7 DAYS</Text></View>
          </View>
          {signedIn ? <>
            <Text style={styles.label}>Optional preference</Text>
            <TextInput value={focus} onChangeText={setFocus} placeholder="e.g. quick vegetarian dinners" placeholderTextColor={Colors.textMuted} style={styles.input} maxLength={300} returnKeyType="done" />
            <TouchableOpacity style={[styles.primaryButton, generating && styles.buttonDisabled]} onPress={generate} disabled={generating} activeOpacity={0.85}>
              {generating ? <ActivityIndicator color="#fff" /> : <><Sparkles color="#fff" size={18} /><Text style={styles.primaryButtonText}>{plan ? 'Refresh plan' : 'Create my plan'}</Text></>}
            </TouchableOpacity>
          </> : <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}><Text style={styles.primaryButtonText}>Sign in to personalize your chart</Text></TouchableOpacity>}
        </View>

        {!!notice && <AppNoticeCard message={notice} tone="warning" compact />}
        {loading && <View style={styles.loadingCard}><ActivityIndicator color={Colors.primary} /><Text style={styles.helpText}>Loading your saved chart…</Text></View>}
        {!loading && <View style={styles.todayCaloriesCard}>
          <View style={styles.todayCaloriesHeader}>
            <View style={{ flex: 1 }}><Text style={styles.todayCaloriesTitle}>Today&apos;s intake</Text><Text style={styles.todayCaloriesSubtitle}>{calorieTarget > 0 ? `Goal ${calorieTarget.toLocaleString()} kcal` : 'Set a calorie goal in your profile'}</Text></View>
            <TouchableOpacity style={styles.roundAddButton} onPress={openManualEntry} accessibilityRole="button" accessibilityLabel="Add meal manually"><Plus size={20} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <View style={styles.todayCaloriesValueRow}>
            <Text style={styles.todayCaloriesValue}>{caloriesEaten.toLocaleString()} <Text style={styles.todayCaloriesUnit}>/ {calorieTarget > 0 ? calorieTarget.toLocaleString() : '—'} kcal</Text></Text>
            {calorieTarget > 0 && <Text style={styles.remainingCalories}>{calorieTarget > caloriesEaten ? `${(calorieTarget - caloriesEaten).toLocaleString()} left` : `${(caloriesEaten - calorieTarget).toLocaleString()} over`}</Text>}
          </View>
          <View style={styles.todayCaloriesTrack}><View style={[styles.todayCaloriesFill, { width: `${calorieTarget > 0 ? Math.min(100, caloriesEaten / calorieTarget * 100) : 0}%` }]} /></View>
          <View style={styles.mealActions}>
            <TouchableOpacity style={styles.mealActionButton} onPress={openManualEntry}><Plus size={16} color={Colors.primary} /><Text style={styles.mealActionText}>Add food</Text></TouchableOpacity>
            <TouchableOpacity style={styles.mealActionButton} onPress={() => navigation.navigate('FoodScanner')}><Camera size={16} color={Colors.primary} /><Text style={styles.mealActionText}>Scan photo</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowMealFilter((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: showMealFilter }}>
            <Text style={styles.filterLabel}>{mealFilter === 'all' ? 'All meals' : mealFilter[0].toUpperCase() + mealFilter.slice(1)}</Text><ChevronDown size={17} color={Colors.textSecondary} style={showMealFilter ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {showMealFilter && <View style={styles.filterOptions}>{[{ id: 'all', label: 'All meals' }, { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'snack', label: 'Snack' }, { id: 'dinner', label: 'Dinner' }].map((item) => <TouchableOpacity key={item.id} style={styles.filterOption} onPress={() => { setMealFilter(item.id); setShowMealFilter(false); }}><Text style={[styles.filterOptionText, mealFilter === item.id && styles.filterOptionActive]}>{item.label}</Text></TouchableOpacity>)}</View>}
          {filteredMeals.length ? filteredMeals.map((meal, index) => <View key={String(meal.id || `${meal.dish_name}-${index}`)} style={styles.loggedMealRow}>
            <View style={styles.loggedMealIcon}><Utensils size={16} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.loggedMealName}>{meal.dish_name || meal.name || 'Meal'}</Text><Text style={styles.loggedMealType}>{String(meal.meal_type || 'meal').replace(/^./, (letter: string) => letter.toUpperCase())}</Text></View>
            <Text style={styles.mealSlotCalories}>{Number(meal.calories || 0).toLocaleString()} kcal</Text>
          </View>) : <Text style={styles.noMealsText}>{todayMeals.length ? 'No entries for this meal type.' : 'No meals logged today yet.'}</Text>}
        </View>}

        {plan && <>
          <TouchableOpacity style={styles.planToggle} onPress={() => setPlanExpanded((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: planExpanded }}>
            <View style={styles.planToggleIcon}><Sparkles size={18} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.planToggleTitle}>Your 7-day meal plan</Text><Text style={styles.planToggleSubtitle}>{plan.title || 'Personalized for you'}</Text></View>
            <ChevronDown size={20} color={Colors.primary} style={planExpanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {planExpanded && <>
            <View style={styles.planHero}>
              <View style={styles.planHeroTop}><View style={styles.planSparkle}><Sparkles size={18} color={Colors.primary} /></View><Text style={styles.planEyebrow}>PERSONALIZED FOR YOU</Text><View style={styles.savedPill}><CheckCircle2 size={13} color={Colors.primary} /><Text style={styles.savedText}>Saved</Text></View></View>
              <Text style={styles.planTitle}>{plan.title}</Text>
              <Text numberOfLines={2} style={styles.planSummary}>{plan.goal_summary}</Text>
              <View style={styles.targetsGrid}>
                <Target label="Calories" value={plan.daily_targets.calories} unit="kcal" color={Colors.accentOrange} />
                <Target label="Protein" value={plan.daily_targets.protein_g} unit="g" color={Colors.primary} />
                <Target label="Carbs" value={plan.daily_targets.carbs_g} unit="g" color={Colors.blue} />
                <Target label="Fat" value={plan.daily_targets.fat_g} unit="g" color={Colors.lilac} />
              </View>
            </View>
          <Text style={styles.sectionTitle}>Your week</Text>
          <TouchableOpacity style={styles.dayDropdownButton} onPress={() => setDayDropdownOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: dayDropdownOpen }}>
            <View style={{ flex: 1 }}><Text style={styles.dayDropdownLabel}>{selectedDay?.day || 'Choose a day'}</Text><Text style={styles.dayDropdownCalories}>{Number(selectedDay?.daily_totals?.calories || 0).toLocaleString()} kcal</Text></View>
            <ChevronDown size={18} color={Colors.textSecondary} style={dayDropdownOpen ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {dayDropdownOpen && <View style={styles.dayDropdownOptions}>{plan.days.map((day, index) => <TouchableOpacity key={`${day.day}-${index}`} style={[styles.dayDropdownOption, index === dayIndex && styles.dayDropdownOptionActive]} onPress={() => { setDayIndex(index); setDayDropdownOpen(false); }}>
            <Text style={[styles.dayDropdownLabel, index === dayIndex && styles.dayDropdownSelectedLabel]}>{day.day}</Text><Text style={styles.dayDropdownCalories}>{Number(day.daily_totals.calories || 0).toLocaleString()} kcal</Text>
          </TouchableOpacity>)}</View>}

          {selectedDay && <View style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <View><Text style={styles.dayEyebrow}>MEAL SCHEDULE</Text><Text style={styles.dayTitle}>{selectedDay.day}</Text></View>
              <View style={styles.dayKcalBadge}><Flame size={16} color={Colors.accentOrange} /><Text style={styles.dayKcalText}>{selectedDay.daily_totals.calories || 0} kcal</Text></View>
            </View>
            <View style={styles.dailyMacroRow}>
              <Macro label="Protein" value={selectedDay.daily_totals.protein_g} color={Colors.primary} />
              <Macro label="Carbs" value={selectedDay.daily_totals.carbs_g} color={Colors.blue} />
              <Macro label="Fat" value={selectedDay.daily_totals.fat_g} color={Colors.lilac} />
              <Macro label="Fiber" value={selectedDay.daily_totals.fiber_g} color={Colors.accentOrange} />
            </View>
            {selectedDay.meals.map((meal, index) => <View key={`${selectedDay.day}-${index}`} style={styles.mealRow}>
              <View style={styles.mealIndex}><Text style={styles.mealIndexText}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.mealType}>{meal.meal_type === 'snack' ? 'Afternoon snack' : meal.meal_type || ['Breakfast', 'Lunch', 'Dinner'][index] || 'Meal'}</Text><Text style={styles.mealName}>{meal.name}</Text><Text style={styles.mealPortion}>{meal.portion}</Text><Text style={styles.mealMacros}>P {meal.protein_g}g · C {meal.carbs_g}g · F {meal.fat_g}g · Fiber {meal.fiber_g}g</Text></View>
              <Text style={styles.mealCalories}>{meal.calories} kcal</Text>
            </View>)}
          </View>}

          {!!plan.notes?.length && <View style={styles.notesCard}><Text style={styles.sectionTitle}>Helpful notes</Text>{plan.notes.slice(0, 3).map((note, index) => <View key={index} style={styles.noteRow}><CheckCircle2 size={16} color={Colors.primary} /><Text style={styles.noteText}>{note}</Text></View>)}</View>}
          <Text style={styles.disclaimer}>Nutrition estimates are approximate. Check ingredients and labels for allergens. This chart is general wellness guidance, not medical advice.</Text>
          </>}
        </>}
      </ScrollView>

      <Modal visible={manualEntryOpen} transparent animationType="slide" onRequestClose={() => setManualEntryOpen(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
            <View style={[styles.manualCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.manualHeader}><View><Text style={styles.manualTitle}>Add food</Text><Text style={styles.manualSubtitle}>Log your meal manually</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setManualEntryOpen(false)} accessibilityLabel="Close manual meal form"><X color={Colors.textSecondary} size={20} /></TouchableOpacity></View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Food name</Text>
                <TextInput value={manualName} onChangeText={setManualName} placeholder="e.g. Idli and sambar" placeholderTextColor={Colors.textMuted} style={styles.input} maxLength={120} returnKeyType="next" />
                <Text style={styles.label}>Meal</Text>
                <TouchableOpacity style={styles.categoryButton} onPress={() => setCategoryDropdownOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: categoryDropdownOpen }}><Text style={styles.categoryButtonText}>{manualCategory === 'snack' ? 'Snack' : manualCategory[0].toUpperCase() + manualCategory.slice(1)}</Text><ChevronDown size={17} color={Colors.textSecondary} style={categoryDropdownOpen ? { transform: [{ rotate: '180deg' }] } : undefined} /></TouchableOpacity>
                {categoryDropdownOpen && <View style={styles.categoryOptions}>{[{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'snack', label: 'Snack' }, { id: 'dinner', label: 'Dinner' }].map((item) => <TouchableOpacity key={item.id} style={styles.filterOption} onPress={() => { setManualCategory(item.id); setCategoryDropdownOpen(false); }}><Text style={[styles.filterOptionText, manualCategory === item.id && styles.filterOptionActive]}>{item.label}</Text></TouchableOpacity>)}</View>}
                <Text style={[styles.label, { marginTop: 14 }]}>Calories</Text>
                <TextInput value={manualCalories} onChangeText={(value) => setManualCalories(value.replace(/[^0-9]/g, ''))} placeholder="kcal" placeholderTextColor={Colors.textMuted} style={styles.input} keyboardType="number-pad" maxLength={5} />
                <Text style={[styles.label, { marginTop: 14 }]}>Macros (optional, grams)</Text>
                <View style={styles.macroInputs}>
                  <TextInput value={manualProtein} onChangeText={(value) => setManualProtein(value.replace(/[^0-9.]/g, ''))} placeholder="Protein" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.macroInput]} keyboardType="decimal-pad" />
                  <TextInput value={manualCarbs} onChangeText={(value) => setManualCarbs(value.replace(/[^0-9.]/g, ''))} placeholder="Carbs" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.macroInput]} keyboardType="decimal-pad" />
                  <TextInput value={manualFat} onChangeText={(value) => setManualFat(value.replace(/[^0-9.]/g, ''))} placeholder="Fat" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.macroInput]} keyboardType="decimal-pad" />
                </View>
                <TouchableOpacity style={[styles.primaryButton, savingMeal && styles.buttonDisabled]} onPress={saveManualMeal} disabled={savingMeal}>
                  {savingMeal ? <ActivityIndicator color="#fff" /> : <><Save size={18} color="#fff" /><Text style={styles.primaryButtonText}>Save meal</Text></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function Target({ label, value, unit, color }: { label: string; value?: number; unit: string; color: string }) {
  const styles = useThemeStyles(createStyles);
  return <View style={styles.target}><Text style={[styles.targetValue, { color }]}>{value ?? '—'}<Text style={styles.targetUnit}> {unit}</Text></Text><Text style={styles.targetLabel}>{label} / day</Text></View>;
}
function Macro({ label, value, color }: { label: string; value?: number; color: string }) {
  const styles = useThemeStyles(createStyles);
  return <View style={styles.macroItem}><View style={[styles.macroDot, { backgroundColor: color }]} /><Text style={styles.macroValue}>{value ?? 0}g</Text><Text style={styles.macroLabel}>{label}</Text></View>;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const createStyles = () => ({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 158 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10, gap: 13 },
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '900' },
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginTop: 3 },
  generatorCard: { backgroundColor: Colors.surface, borderRadius: 23, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  generatorHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 18 },
  generatorIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  generatorTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' },
  generatorSubtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 3 },
  weekBadge: { backgroundColor: Colors.surfaceWarm, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, marginTop: 2 },
  weekBadgeText: { color: Colors.primary, fontSize: 11, fontWeight: '900' },
  label: { color: Colors.textPrimary, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  input: { minHeight: 54, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, color: Colors.textPrimary, fontSize: 15, backgroundColor: Colors.backgroundLight },
  primaryButton: { minHeight: 56, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, backgroundColor: Colors.primary, borderRadius: 16, marginTop: 13, paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  buttonDisabled: { opacity: 0.7 },
  loadingCard: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 20, padding: 24 },
  helpText: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  emptyCard: { alignItems: 'center', backgroundColor: Colors.surface, padding: 24, borderRadius: 22, borderWidth: 1, borderColor: Colors.borderSubtle, marginTop: 2 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 7 },
  planHero: { backgroundColor: Colors.primarySoft, borderRadius: 24, padding: 18, marginTop: 2, marginBottom: 24, borderWidth: 1, borderColor: Colors.borderSubtle },
  planHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planSparkle: { width: 31, height: 31, borderRadius: 11, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  planEyebrow: { flex: 1, color: Colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  savedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: Colors.surface, borderRadius: 10 },
  savedText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  planTitle: { color: Colors.textPrimary, fontSize: 23, fontWeight: '900', marginTop: 14 },
  planSummary: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 5 },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  target: { width: '48%', minHeight: 78, justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  targetValue: { fontSize: 22, fontWeight: '900' },
  targetUnit: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  targetLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 2 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 19, fontWeight: '900', marginBottom: 11 },
  dayDropdownButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 15, paddingHorizontal: 15, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  dayDropdownLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: '900' },
  dayDropdownCalories: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  dayDropdownOptions: { backgroundColor: Colors.surface, borderRadius: 15, marginTop: -6, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: 'hidden' },
  dayDropdownOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderSubtle },
  dayDropdownOptionActive: { backgroundColor: Colors.primarySoft },
  dayDropdownSelectedLabel: { color: Colors.primary },
  dayCard: { backgroundColor: Colors.surface, borderRadius: 23, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 14 },
  todayCaloriesCard: { backgroundColor: Colors.surface, borderRadius: 21, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 20 },
  todayCaloriesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  todayCaloriesTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900' },
  todayCaloriesSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  logMealButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 11, backgroundColor: Colors.primarySoft },
  logMealText: { color: Colors.primary, fontSize: 11, fontWeight: '900' },
  todayCaloriesValueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 9 },
  todayCaloriesValue: { color: Colors.textPrimary, fontSize: 22, fontWeight: '900' },
  todayCaloriesUnit: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  remainingCalories: { color: Colors.primary, fontSize: 12, fontWeight: '900' },
  todayCaloriesTrack: { height: 10, borderRadius: 8, backgroundColor: Colors.backgroundLight, overflow: 'hidden' },
  todayCaloriesFill: { height: '100%', borderRadius: 8, backgroundColor: Colors.accentOrange },
  roundAddButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.primary },
  mealActions: { flexDirection: 'row', gap: 9, marginTop: 14, marginBottom: 5 },
  mealActionButton: { flex: 1, minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primarySoft, borderRadius: 13 },
  mealActionText: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, backgroundColor: Colors.backgroundLight, borderRadius: 12, marginTop: 8 },
  filterLabel: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  filterOptions: { backgroundColor: Colors.surface, borderRadius: 12, marginTop: 5, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: 'hidden' },
  filterOption: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderSubtle },
  filterOptionText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  filterOptionActive: { color: Colors.primary, fontWeight: '900' },
  loggedMealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderSubtle },
  loggedMealIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  loggedMealName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  loggedMealType: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  noMealsText: { color: Colors.textSecondary, fontSize: 13, paddingVertical: 14 },
  planToggle: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: Colors.surface, borderRadius: 19, padding: 14, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 16 },
  planToggleIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  planToggleTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' },
  planToggleSubtitle: { color: Colors.textSecondary, fontSize: 11, marginTop: 3 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,18,20,0.48)' },
  modalKeyboard: { width: '100%', justifyContent: 'flex-end' },
  manualCard: { maxHeight: '88%', backgroundColor: Colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 21 },
  manualHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  manualTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '900' },
  manualSubtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  modalClose: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  categoryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: Colors.backgroundLight, borderWidth: 1, borderColor: Colors.border, borderRadius: 14 },
  categoryButtonText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  categoryOptions: { backgroundColor: Colors.surface, borderRadius: 12, marginTop: 5, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: 'hidden' },
  macroInputs: { flexDirection: 'row', gap: 8 },
  macroInput: { flex: 1, minWidth: 0, paddingHorizontal: 9, fontSize: 13, textAlign: 'center' },
  mealSlotCalories: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  dayEyebrow: { fontSize: 11, letterSpacing: 0.8, color: Colors.textMuted, fontWeight: '900' },
  dayTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  dayKcalBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.accentSoft, borderRadius: 13 },
  dayKcalText: { color: Colors.primary, fontSize: 14, fontWeight: '900' },
  dailyMacroRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.surfaceWarm, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 8, marginBottom: 4 },
  macroItem: { alignItems: 'center', flex: 1 },
  macroDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 5 },
  macroValue: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' },
  macroLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderSubtle },
  mealIndex: { width: 31, height: 31, borderRadius: 11, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  mealIndexText: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  mealName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  mealType: { color: Colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 },
  mealPortion: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  mealMacros: { color: Colors.textMuted, fontSize: 12, marginTop: 5 },
  mealCalories: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  notesCard: { backgroundColor: Colors.surface, borderRadius: 21, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, gap: 10 },
  noteRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  noteText: { flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  disclaimer: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 14, marginHorizontal: 3 },
});

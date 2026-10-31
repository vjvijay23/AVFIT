import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, Flame, Sparkles, Utensils } from 'lucide-react-native';
import { BackendApi } from '../services/backendApi';
import { Colors } from '../theme/colors';
import AppNoticeCard from '../components/common/AppNoticeCard';

type Meal = { name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
type DietDay = { day: string; meals: Meal[]; daily_totals: Record<string, number> };
type DietPlan = { title: string; goal_summary: string; daily_targets: Record<string, number>; days: DietDay[]; notes: string[] };

export default function DietPlanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState('');
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
  const signedIn = BackendApi.hasAuthToken();
  const selectedDay = useMemo(() => plan?.days[Math.min(dayIndex, Math.max(0, (plan?.days.length || 1) - 1))], [plan, dayIndex]);

  useEffect(() => {
    if (!BackendApi.hasAuthToken()) { setLoading(false); return; }
    BackendApi.getLatestDietPlan()
      .then((response) => { setPlan(response.plan?.plan || null); setDayIndex(0); })
      .catch(() => setNotice('Your saved chart could not be loaded. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  const generate = async () => {
    if (!BackendApi.hasAuthToken()) { setNotice('Sign in first so your personalized chart can use your body details and save to your account.'); return; }
    setNotice(''); setGenerating(true);
    try {
      const response = await BackendApi.generateDietPlan(focus.trim() || undefined);
      setPlan(response.plan.plan); setDayIndex(0);
    } catch (error: any) {
      setNotice(error?.message || 'We could not prepare your chart right now. Please try again.');
    } finally { setGenerating(false); }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Go back"><ArrowLeft color={Colors.textPrimary} size={21} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Your Diet Chart</Text><Text style={styles.subtitle}>A practical, personalized 7-day meal guide</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 42 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.generatorCard}>
          <View style={styles.generatorHeader}>
            <View style={styles.generatorIcon}><Sparkles size={21} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.generatorTitle}>Build your weekly plan</Text><Text style={styles.generatorSubtitle}>Uses your saved goals, body metrics and food preferences</Text></View>
            <View style={styles.weekBadge}><Text style={styles.weekBadgeText}>7 DAYS</Text></View>
          </View>
          {signedIn ? <>
            <Text style={styles.label}>Optional preference</Text>
            <TextInput value={focus} onChangeText={setFocus} placeholder="e.g. quick vegetarian dinners" placeholderTextColor={Colors.textMuted} style={styles.input} maxLength={300} returnKeyType="done" />
            <TouchableOpacity style={[styles.primaryButton, generating && styles.buttonDisabled]} onPress={generate} disabled={generating} activeOpacity={0.85}>
              {generating ? <ActivityIndicator color="#fff" /> : <><Sparkles color="#fff" size={18} /><Text style={styles.primaryButtonText}>{plan ? 'Refresh my diet chart' : 'Prepare my diet chart'}</Text></>}
            </TouchableOpacity>
          </> : <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}><Text style={styles.primaryButtonText}>Sign in to personalize your chart</Text></TouchableOpacity>}
        </View>

        {!!notice && <AppNoticeCard message={notice} tone="warning" compact />}
        {loading && <View style={styles.loadingCard}><ActivityIndicator color={Colors.primary} /><Text style={styles.helpText}>Loading your saved chart…</Text></View>}
        {!loading && !plan && <View style={styles.emptyCard}><View style={styles.emptyIcon}><Utensils size={23} color={Colors.primary} /></View><Text style={styles.emptyTitle}>A clear plan for the whole week</Text><Text style={styles.helpText}>Get meal ideas with portions, calories and macros for each day. Your chart is saved to your AVFIT account.</Text></View>}

        {plan && <>
          <View style={styles.planHero}>
            <View style={styles.planHeroTop}><View style={styles.planSparkle}><Sparkles size={18} color={Colors.primary} /></View><Text style={styles.planEyebrow}>PERSONALIZED FOR YOU</Text><View style={styles.savedPill}><CheckCircle2 size={13} color={Colors.primary} /><Text style={styles.savedText}>Saved</Text></View></View>
            <Text style={styles.planTitle}>{plan.title}</Text>
            <Text style={styles.planSummary}>{plan.goal_summary}</Text>
            <View style={styles.targetsGrid}>
              <Target label="Calories" value={plan.daily_targets.calories} unit="kcal" color={Colors.accentOrange} />
              <Target label="Protein" value={plan.daily_targets.protein_g} unit="g" color={Colors.primary} />
              <Target label="Carbs" value={plan.daily_targets.carbs_g} unit="g" color={Colors.blue} />
              <Target label="Fat" value={plan.daily_targets.fat_g} unit="g" color={Colors.lilac} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Your week</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelector}>
            {plan.days.map((day, index) => <TouchableOpacity key={`${day.day}-${index}`} style={[styles.dayChip, dayIndex === index && styles.dayChipActive]} onPress={() => setDayIndex(index)}>
              <Text style={[styles.dayChipLabel, dayIndex === index && styles.dayChipLabelActive]}>{day.day}</Text>
              <Text style={[styles.dayChipKcal, dayIndex === index && styles.dayChipKcalActive]}>{day.daily_totals.calories || 0} kcal</Text>
            </TouchableOpacity>)}
          </ScrollView>

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
              <View style={{ flex: 1 }}><Text style={styles.mealName}>{meal.name}</Text><Text style={styles.mealPortion}>{meal.portion}</Text><Text style={styles.mealMacros}>P {meal.protein_g}g · C {meal.carbs_g}g · F {meal.fat_g}g · Fiber {meal.fiber_g}g</Text></View>
              <Text style={styles.mealCalories}>{meal.calories} kcal</Text>
            </View>)}
          </View>}

          {!!plan.notes?.length && <View style={styles.notesCard}><Text style={styles.sectionTitle}>Helpful notes</Text>{plan.notes.map((note, index) => <View key={index} style={styles.noteRow}><CheckCircle2 size={16} color={Colors.primary} /><Text style={styles.noteText}>{note}</Text></View>)}</View>}
          <Text style={styles.disclaimer}>Nutrition estimates are approximate. Check ingredients and labels for allergens. This chart is general wellness guidance, not medical advice.</Text>
        </>}
      </ScrollView>
    </View>
  );
}

function Target({ label, value, unit, color }: { label: string; value?: number; unit: string; color: string }) {
  return <View style={styles.target}><Text style={[styles.targetValue, { color }]}>{value ?? '—'}<Text style={styles.targetUnit}> {unit}</Text></Text><Text style={styles.targetLabel}>{label} / day</Text></View>;
}
function Macro({ label, value, color }: { label: string; value?: number; color: string }) {
  return <View style={styles.macroItem}><View style={[styles.macroDot, { backgroundColor: color }]} /><Text style={styles.macroValue}>{value ?? 0}g</Text><Text style={styles.macroLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10, gap: 13 },
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '900' },
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginTop: 3 },
  generatorCard: { backgroundColor: '#fff', borderRadius: 23, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  generatorHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 18 },
  generatorIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  generatorTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' },
  generatorSubtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 3 },
  weekBadge: { backgroundColor: Colors.surfaceWarm, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  weekBadgeText: { color: Colors.primary, fontSize: 11, fontWeight: '900' },
  label: { color: Colors.textPrimary, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  input: { minHeight: 54, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, color: Colors.textPrimary, fontSize: 15, backgroundColor: '#FAFAF8' },
  primaryButton: { minHeight: 56, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, backgroundColor: Colors.primary, borderRadius: 16, marginTop: 13, paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  buttonDisabled: { opacity: 0.7 },
  loadingCard: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  helpText: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  emptyCard: { alignItems: 'center', backgroundColor: '#fff', padding: 24, borderRadius: 22, borderWidth: 1, borderColor: Colors.borderSubtle, marginTop: 2 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 7 },
  planHero: { backgroundColor: '#EAF3ED', borderRadius: 24, padding: 19, marginTop: 2, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(36,74,50,0.15)' },
  planHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planSparkle: { width: 31, height: 31, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  planEyebrow: { flex: 1, color: Colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  savedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#fff', borderRadius: 10 },
  savedText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  planTitle: { color: Colors.textPrimary, fontSize: 23, fontWeight: '900', marginTop: 14 },
  planSummary: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 5 },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 },
  target: { width: '48%', minHeight: 76, justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11 },
  targetValue: { fontSize: 22, fontWeight: '900' },
  targetUnit: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  targetLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 2 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 19, fontWeight: '900', marginBottom: 11 },
  daySelector: { gap: 9, paddingBottom: 14 },
  dayChip: { minWidth: 103, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  dayChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: '900' },
  dayChipLabelActive: { color: '#fff' },
  dayChipKcal: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 3 },
  dayChipKcalActive: { color: '#EAF3ED' },
  dayCard: { backgroundColor: '#fff', borderRadius: 23, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 14 },
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
  mealPortion: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  mealMacros: { color: Colors.textMuted, fontSize: 12, marginTop: 5 },
  mealCalories: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  notesCard: { backgroundColor: '#fff', borderRadius: 21, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, gap: 10 },
  noteRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  noteText: { flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  disclaimer: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 14, marginHorizontal: 3 },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { BackendApi } from '../services/backendApi';
import { Colors } from '../theme/colors';

type Meal = { name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
type DietPlan = { title: string; goal_summary: string; daily_targets: Record<string, number>; days: Array<{ day: string; meals: Meal[]; daily_totals: Record<string, number> }>; notes: string[] };

export default function DietPlanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState('');
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const signedIn = BackendApi.hasAuthToken();

  useEffect(() => {
    if (!BackendApi.hasAuthToken()) {
      setLoading(false);
      return;
    }
    BackendApi.getLatestDietPlan().then((response) => setPlan(response.plan?.plan || null)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const generate = async () => {
    if (!BackendApi.hasAuthToken()) {
      Alert.alert('Sign in required', 'Your diet plan is personalized and saved to your account. Sign in or create an account first.');
      return;
    }
    setGenerating(true);
    try {
      const response = await BackendApi.generateDietPlan(focus.trim() || undefined);
      setPlan(response.plan.plan);
    } catch (error: any) {
      Alert.alert('Could not make your plan', error?.message || 'Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><ArrowLeft color={Colors.textPrimary} size={21} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Personalized Diet Plan</Text><Text style={styles.subtitle}>Generated from your saved fitness profile</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.promptCard}>
          {!signedIn ? <>
            <Text style={styles.sectionTitle}>Sign in to create your plan</Text>
            <Text style={styles.helpText}>Your plan uses your saved fitness profile and is stored with your account.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.primaryButtonText}>Sign in or create an account</Text>
            </TouchableOpacity>
          </> : <>
          <Text style={styles.sectionTitle}>Add a preference (optional)</Text>
          <Text style={styles.helpText}>Your goal, calorie needs, body details, dietary preference, and restrictions are loaded from your profile.</Text>
          <TextInput value={focus} onChangeText={setFocus} placeholder="For example: quick vegetarian lunches" placeholderTextColor="#828A83" style={styles.input} maxLength={300} />
          <TouchableOpacity style={styles.primaryButton} onPress={generate} disabled={generating}>
            {generating ? <ActivityIndicator color="#fff" /> : <Sparkles color="#fff" size={18} />}
            <Text style={styles.primaryButtonText}>{generating ? 'Building your plan…' : plan ? 'Generate a new 7-day plan' : 'Generate my 7-day plan'}</Text>
          </TouchableOpacity>
          </>}
        </View>

        {loading && <ActivityIndicator style={{ marginTop: 28 }} color={Colors.primary} />}
        {!loading && !plan && <View style={styles.emptyCard}><Text style={styles.sectionTitle}>A plan tailored to you</Text><Text style={styles.helpText}>Generate a plan to see daily meal ideas and nutrition estimates. Your saved plan will be available after you log in again.</Text></View>}
        {plan && <>
          <View style={styles.summaryCard}>
            <Text style={styles.planTitle}>{plan.title}</Text>
            <Text style={styles.helpText}>{plan.goal_summary}</Text>
            <View style={styles.targetsRow}>
              <Target label="Calories" value={`${plan.daily_targets.calories} kcal`} />
              <Target label="Protein" value={`${plan.daily_targets.protein_g} g`} />
              <Target label="Carbs" value={`${plan.daily_targets.carbs_g} g`} />
              <Target label="Fat" value={`${plan.daily_targets.fat_g} g`} />
            </View>
          </View>
          {plan.days.map((day) => <View key={day.day} style={styles.dayCard}>
            <View style={styles.dayHeader}><Text style={styles.dayTitle}>{day.day}</Text><Text style={styles.dayCalories}>{day.daily_totals.calories} kcal</Text></View>
            {day.meals.map((meal, index) => <View key={`${day.day}-${index}`} style={styles.mealRow}>
              <View style={{ flex: 1 }}><Text style={styles.mealName}>{meal.name}</Text><Text style={styles.helpText}>{meal.portion}</Text><Text style={styles.macroText}>P {meal.protein_g}g · C {meal.carbs_g}g · F {meal.fat_g}g · Fiber {meal.fiber_g}g</Text></View>
              <Text style={styles.kcal}>{meal.calories} kcal</Text>
            </View>)}
          </View>)}
          {!!plan.notes?.length && <View style={styles.notesCard}><Text style={styles.sectionTitle}>Notes</Text>{plan.notes.map((note, index) => <Text key={index} style={styles.helpText}>• {note}</Text>)}</View>}
          <Text style={styles.disclaimer}>Nutrition values are approximate. Check ingredients and labels, especially for allergies. This plan is general information, not medical advice.</Text>
        </>}
      </ScrollView>
    </View>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return <View style={styles.target}><Text style={styles.targetValue}>{value}</Text><Text style={styles.targetLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8, gap: 12 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14 },
  title: { color: Colors.textPrimary, fontSize: 21, fontWeight: '800' },
  subtitle: { color: '#707A72', fontSize: 12, marginTop: 3 },
  promptCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 14 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  helpText: { color: '#68736B', fontSize: 13, lineHeight: 19 },
  input: { minHeight: 48, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 12, paddingHorizontal: 12, marginTop: 14, color: Colors.textPrimary },
  primaryButton: { minHeight: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, marginTop: 12 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  emptyCard: { backgroundColor: '#fff', padding: 18, borderRadius: 18 },
  summaryCard: { backgroundColor: '#EAF3ED', borderRadius: 20, padding: 18, marginBottom: 14 },
  planTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, marginBottom: 6 },
  targetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  target: { minWidth: '46%', backgroundColor: '#fff', borderRadius: 12, padding: 10 },
  targetValue: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  targetLabel: { fontSize: 11, color: '#68736B', marginTop: 2 },
  dayCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  dayTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayCalories: { color: Colors.primary, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  mealRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderSubtle, gap: 8 },
  mealName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  macroText: { color: '#707A72', fontSize: 11, marginTop: 5 },
  kcal: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  notesCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 7 },
  disclaimer: { color: '#707A72', fontSize: 11, lineHeight: 16, marginTop: 12, marginHorizontal: 4 },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Activity, ArrowLeft, ArrowRight, Bike, CalendarDays, Check, ChevronRight, Clock3, Dumbbell, Flame, Footprints, PersonStanding, RefreshCw, Sparkles, Target } from 'lucide-react-native';
import { useThemeStyles } from '../../theme/ThemeContext';
import { Colors } from '../../theme/colors';
import type { FitnessProfile } from '../../types';

type Recommendation = Record<string, any> & {
  headline?: string;
  activity_type?: string;
  duration_minutes?: number;
  intensity?: string;
  reason?: string;
  workout?: string[];
  tomorrow?: string;
  nutrition_note?: string;
  roadmap?: { months?: number; summary?: string; milestones?: string[] };
};

type Props = {
  recommendation: Recommendation | null;
  profile: FitnessProfile | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onStart: () => void;
  onProfile: () => void;
  onNutrition: () => void;
  calorieTarget: number;
  proteinTarget: number;
};

const STEPS = ['Today', 'Your plan', 'Fuel'];

export default function AITrainingCoachCard({ recommendation, profile, loading, error, onRefresh, onStart, onProfile, onNutrition, calorieTarget, proteinTarget }: Props) {
  const styles = useThemeStyles(createStyles);
  const [step, setStep] = useState(0);

  useEffect(() => setStep(0), [recommendation?.generatedAt, recommendation?.headline]);

  const goal = String(profile?.fitnessGoal || 'general_fitness').replace(/_/g, ' ');
  const level = String(profile?.fitnessLevel || 'beginner');
  const equipment = profile?.availableEquipment?.slice(0, 2).map((item) => item.replace(/_/g, ' ')).join(' · ') || 'Bodyweight';
  const workoutItems = recommendation?.workout?.filter((item) => !/warm.?up|cool.?down|stretch/i.test(item)) || [];
  const isRest = recommendation?.activity_type === 'rest';
  const ActivityIcon = recommendation?.activity_type === 'run'
    ? PersonStanding
    : recommendation?.activity_type === 'walk'
      ? Footprints
      : recommendation?.activity_type === 'cycling'
        ? Bike
        : Dumbbell;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Sparkles size={19} color={Colors.primary} strokeWidth={2.3} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>YOUR DAILY COACH</Text>
          <Text style={styles.title}>Training plan</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh training plan">
          {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <RefreshCw size={17} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      <View style={styles.stepHeader}>
        <View style={styles.stepDots}>
          {STEPS.map((label, index) => <TouchableOpacity key={label} onPress={() => setStep(index)} accessibilityRole="button" accessibilityLabel={`Show ${label} step`} style={[styles.stepDot, index === step && styles.stepDotActive]} />)}
        </View>
        <Text style={styles.stepLabel}>STEP {step + 1} OF {STEPS.length} · {STEPS[step].toUpperCase()}</Text>
      </View>

      {loading && !recommendation ? <View style={styles.loadingBox}><ActivityIndicator color={Colors.primary} /><Text style={styles.body}>Preparing a plan from your profile and activity…</Text></View> : null}
      {!loading && !recommendation ? <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{error || 'Complete your fitness profile to get a plan tailored to you.'}</Text>
        <TouchableOpacity style={styles.outlineButton} onPress={onProfile}><Text style={styles.outlineText}>Review fitness profile</Text><ChevronRight size={16} color={Colors.primary} /></TouchableOpacity>
      </View> : null}

      {recommendation && <>
        {step === 0 && <View>
          <View style={styles.todayEyebrowRow}>
            <View style={styles.activityBadge}><ActivityIcon size={14} color={Colors.primary} /><Text style={styles.activityBadgeText}>{String(recommendation.activity_type || 'training').replace(/_/g, ' ')}</Text></View>
            <View style={styles.meta}><Clock3 size={14} color={Colors.textSecondary} /><Text style={styles.metaText}>{recommendation.duration_minutes ? `${recommendation.duration_minutes} min` : 'Recovery'}</Text></View>
            {!!recommendation.intensity && <Text style={styles.intensity}>{recommendation.intensity}</Text>}
          </View>
          <Text style={styles.headline}>{recommendation.headline || 'Your session for today'}</Text>
          <Text numberOfLines={3} style={styles.body}>{recommendation.reason}</Text>
          {!!workoutItems.length && <View style={styles.exercisePreview}>
            {workoutItems.slice(0, 3).map((item, index) => <View key={`${index}-${item}`} style={styles.exerciseRow}><View style={styles.exerciseIndex}><Text style={styles.exerciseIndexText}>{index + 1}</Text></View><Text numberOfLines={2} style={styles.exerciseText}>{item.replace(/^\s*[•*-]\s*/, '')}</Text></View>)}
            {workoutItems.length > 3 && <Text style={styles.moreText}>+{workoutItems.length - 3} more in your workout</Text>}
          </View>}
          {!isRest && <TouchableOpacity style={styles.primaryButton} onPress={onStart} activeOpacity={0.84}><Text style={styles.primaryButtonText}>{recommendation.activity_type === 'run' ? 'Start your run' : recommendation.activity_type === 'walk' ? 'Start your walk' : 'Start this workout'}</Text><ArrowRight size={17} color="#FFFFFF" /></TouchableOpacity>}
          {isRest && <View style={styles.recoveryBanner}><Check size={16} color={Colors.primary} /><Text style={styles.recoveryText}>Recovery is part of your plan. Take it easy today.</Text></View>}
        </View>}

        {step === 1 && <View>
          <Text style={styles.headline}>Built around you</Text>
          <Text style={styles.body}>Your plan adapts to your saved profile and recent AVFIT sessions.</Text>
          <View style={styles.profileGrid}>
            <ProfileChip icon={Target} label="GOAL" value={goal} styles={styles} />
            <ProfileChip icon={Activity} label="EXPERIENCE" value={level} styles={styles} />
            <ProfileChip icon={Dumbbell} label="EQUIPMENT" value={equipment} styles={styles} />
            <ProfileChip icon={CalendarDays} label="WEEKLY TARGET" value={`${profile?.weeklyWorkoutFrequencyDays || 3} sessions`} styles={styles} />
          </View>
          {!!recommendation.tomorrow && <View style={styles.tomorrowBox}><Text style={styles.tomorrowLabel}>UP NEXT</Text><Text style={styles.tomorrowText}>{recommendation.tomorrow}</Text></View>}
          <TouchableOpacity style={styles.textLink} onPress={onProfile}><Text style={styles.linkText}>Edit your fitness profile</Text><ChevronRight size={15} color={Colors.primary} /></TouchableOpacity>
        </View>}

        {step === 2 && <View>
          <View style={styles.fuelIcon}><Flame size={18} color={Colors.accentOrange} /></View>
          <Text style={styles.headline}>Fuel your progress</Text>
          <View style={styles.targetsRow}>
            <View style={styles.targetPill}><Text style={styles.targetValue}>{calorieTarget.toLocaleString()} kcal</Text><Text style={styles.targetLabel}>daily energy</Text></View>
            <View style={styles.targetPill}><Text style={styles.targetValue}>{proteinTarget} g</Text><Text style={styles.targetLabel}>protein target</Text></View>
          </View>
          <Text style={styles.body}>{recommendation.nutrition_note || 'Log a meal to get nutrition suggestions matched to your daily targets.'}</Text>
          {!!recommendation.roadmap?.summary && <View style={styles.roadmapBox}><Text style={styles.tomorrowLabel}>{recommendation.roadmap.months ? `${recommendation.roadmap.months}-MONTH GOAL` : 'YOUR GOAL'}</Text><Text numberOfLines={3} style={styles.tomorrowText}>{recommendation.roadmap.summary}</Text></View>}
          <TouchableOpacity style={styles.primaryButton} onPress={onNutrition} activeOpacity={0.84}><Text style={styles.primaryButtonText}>Open nutrition plan</Text><ArrowRight size={17} color="#FFFFFF" /></TouchableOpacity>
        </View>}

        <View style={styles.stepNav}>
          <TouchableOpacity onPress={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} style={[styles.navButton, step === 0 && styles.navDisabled]} accessibilityRole="button" accessibilityLabel="Previous plan step">
            <ArrowLeft size={16} color={step === 0 ? Colors.textMuted : Colors.textPrimary} /><Text style={[styles.navText, step === 0 && styles.navTextDisabled]}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.navCount}>{step + 1} / {STEPS.length}</Text>
          <TouchableOpacity onPress={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} disabled={step === STEPS.length - 1} style={[styles.navButton, step === STEPS.length - 1 && styles.navDisabled]} accessibilityRole="button" accessibilityLabel="Next plan step">
            <Text style={[styles.navText, step === STEPS.length - 1 && styles.navTextDisabled]}>Next</Text><ArrowRight size={16} color={step === STEPS.length - 1 ? Colors.textMuted : Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </>}
    </View>
  );
}

function ProfileChip({ icon: Icon, label, value, styles }: { icon: any; label: string; value: string; styles: Record<string, any> }) {
  return <View style={styles.profileChip}><Icon size={15} color={Colors.primary} /><Text style={styles.profileLabel}>{label}</Text><Text numberOfLines={1} style={styles.profileValue}>{value}</Text></View>;
}

const createStyles = () => ({
  card: { backgroundColor: Colors.surface, borderRadius: 25, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  headerIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: Colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: Colors.textPrimary, fontSize: 19, fontWeight: '900', marginTop: 1 },
  refreshButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  stepDots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  stepDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: Colors.border },
  stepDotActive: { width: 23, backgroundColor: Colors.primary },
  stepLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  loadingBox: { minHeight: 90, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyBox: { gap: 13 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21 },
  outlineButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.backgroundLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  outlineText: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  todayEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  activityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, backgroundColor: Colors.primarySoft, paddingHorizontal: 9, paddingVertical: 6 },
  activityBadgeText: { color: Colors.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800' },
  intensity: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800', textTransform: 'capitalize', marginLeft: 'auto' },
  headline: { color: Colors.textPrimary, fontSize: 20, lineHeight: 25, fontWeight: '900', letterSpacing: -0.3, marginBottom: 6 },
  body: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  exercisePreview: { paddingVertical: 10, marginTop: 5 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  exerciseIndex: { width: 23, height: 23, borderRadius: 8, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  exerciseIndexText: { color: Colors.primary, fontSize: 10, fontWeight: '900' },
  exerciseText: { flex: 1, color: Colors.textPrimary, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  moreText: { color: Colors.textMuted, fontSize: 11, marginLeft: 32, marginTop: 3 },
  primaryButton: { minHeight: 48, borderRadius: 16, marginTop: 8, backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  recoveryBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primarySoft, borderRadius: 13, padding: 12, marginTop: 8 },
  recoveryText: { flex: 1, color: Colors.textPrimary, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 8 },
  profileChip: { width: '48%', minHeight: 82, borderRadius: 15, backgroundColor: Colors.backgroundLight, padding: 11, justifyContent: 'space-between' },
  profileLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 7 },
  profileValue: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900', textTransform: 'capitalize', marginTop: 3 },
  tomorrowBox: { borderRadius: 15, backgroundColor: Colors.surfaceWarm, padding: 13, marginTop: 12 },
  tomorrowLabel: { color: Colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  tomorrowText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  textLink: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 2, paddingVertical: 12 },
  linkText: { color: Colors.primary, fontSize: 12, fontWeight: '900' },
  fuelIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: Colors.accentSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 11 },
  roadmapBox: { borderRadius: 15, backgroundColor: Colors.backgroundLight, padding: 13, marginTop: 11 },
  targetsRow: { flexDirection: 'row', gap: 9, marginVertical: 11 },
  targetPill: { flex: 1, backgroundColor: Colors.primarySoft, borderRadius: 14, padding: 12 },
  targetValue: { color: Colors.primary, fontSize: 16, fontWeight: '900' },
  targetLabel: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepNav: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle, marginTop: 12, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 72, minHeight: 35 },
  navDisabled: { opacity: 0.55 },
  navText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900' },
  navTextDisabled: { color: Colors.textMuted },
  navCount: { color: Colors.textMuted, fontSize: 10, fontWeight: '800' },
});

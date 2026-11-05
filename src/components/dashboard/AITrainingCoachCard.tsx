import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Activity, ArrowLeft, ArrowRight, Bike, CalendarDays, Check, Clock3, Dumbbell, Flame, Footprints, PersonStanding, RefreshCw, Sparkles, Target, X } from 'lucide-react-native';
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

const STEPS = ['Today', 'Profile', 'Fuel'];

export default function AITrainingCoachCard({ recommendation, profile, loading, error, onRefresh, onStart, onProfile, onNutrition, calorieTarget, proteinTarget }: Props) {
  const styles = useThemeStyles(createStyles);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => { setStep(0); }, [recommendation?.generatedAt, recommendation?.headline]);

  const goal = String(profile?.fitnessGoal || 'general_fitness').replace(/_/g, ' ');
  const level = String(profile?.fitnessLevel || 'beginner');
  const equipment = profile?.availableEquipment?.slice(0, 2).map((item) => item.replace(/_/g, ' ')).join(' · ') || 'Bodyweight';
  const workoutItems = recommendation?.workout?.filter((item) => !/warm.?up|cool.?down|stretch/i.test(item)) || [];
  const isRest = recommendation?.activity_type === 'rest';
  const activityType = String(recommendation?.activity_type || 'training').replace(/_/g, ' ');
  const ActivityIcon = recommendation?.activity_type === 'run' ? PersonStanding : recommendation?.activity_type === 'walk' ? Footprints : recommendation?.activity_type === 'cycling' ? Bike : Dumbbell;

  const start = () => { setVisible(false); onStart(); };
  const editProfile = () => { setVisible(false); onProfile(); };
  const viewNutrition = () => { setVisible(false); onNutrition(); };

  return <>
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Sparkles size={19} color={Colors.primary} strokeWidth={2.3} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>MADE FOR YOU</Text>
          <Text style={styles.title}>Work plan for you</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh training plan">
          {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <RefreshCw size={17} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      {loading && !recommendation ? <View style={styles.loadingRow}><ActivityIndicator color={Colors.primary} /><Text style={styles.body}>Preparing your plan…</Text></View> : null}
      {!loading && !recommendation ? <View style={styles.emptyBox}>
        <Text style={styles.body}>{error || 'Complete your fitness profile to get a plan tailored to you.'}</Text>
        <TouchableOpacity style={styles.outlineButton} onPress={onProfile}><Text style={styles.outlineText}>Review fitness profile</Text><ArrowRight size={16} color={Colors.primary} /></TouchableOpacity>
      </View> : null}

      {recommendation && <TouchableOpacity style={styles.summary} onPress={() => setVisible(true)} activeOpacity={0.84} accessibilityRole="button" accessibilityLabel="Open your AI training plan">
        <View style={styles.summaryMeta}>
          <View style={styles.activityBadge}><ActivityIcon size={14} color={Colors.primary} /><Text style={styles.activityBadgeText}>{activityType}</Text></View>
          <View style={styles.meta}><Clock3 size={14} color={Colors.textSecondary} /><Text style={styles.metaText}>{recommendation.duration_minutes ? `${recommendation.duration_minutes} min` : 'Recovery'}</Text></View>
          {!!recommendation.intensity && <Text style={styles.intensity}>{recommendation.intensity}</Text>}
        </View>
        <Text numberOfLines={1} style={styles.headline}>{recommendation.headline || 'Your session for today'}</Text>
        {!!recommendation.reason && <Text numberOfLines={2} style={styles.summaryReason}>{recommendation.reason}</Text>}
        <View style={styles.openPlanRow}><Text style={styles.openPlanText}>Explore today&apos;s plan</Text><ArrowRight size={17} color={Colors.primary} /></View>
      </TouchableOpacity>}
    </View>

    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)} statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.headerIcon}><Sparkles size={19} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.kicker}>AI COACH</Text><Text style={styles.title}>Your training plan</Text></View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)} accessibilityLabel="Close training plan"><X size={21} color={Colors.textPrimary} /></TouchableOpacity>
          </View>
          <View style={styles.stepHeader}>
            <View style={styles.stepDots}>{STEPS.map((label, index) => <View key={label} style={[styles.stepDot, index === step && styles.stepDotActive]} />)}</View>
            <Text style={styles.stepLabel}>{STEPS[step].toUpperCase()} · {step + 1}/{STEPS.length}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            {recommendation && step === 0 && <View>
              <View style={styles.summaryMeta}>
                <View style={styles.activityBadge}><ActivityIcon size={14} color={Colors.primary} /><Text style={styles.activityBadgeText}>{activityType}</Text></View>
                <View style={styles.meta}><Clock3 size={14} color={Colors.textSecondary} /><Text style={styles.metaText}>{recommendation.duration_minutes ? `${recommendation.duration_minutes} min` : 'Recovery'}</Text></View>
                {!!recommendation.intensity && <Text style={styles.intensity}>{recommendation.intensity}</Text>}
              </View>
              <Text style={styles.modalTitle}>{recommendation.headline || 'Your session for today'}</Text>
              {!!recommendation.reason && <Text style={styles.body}>{recommendation.reason}</Text>}
              {!!workoutItems.length && <View style={styles.exercisePreview}>
                {workoutItems.map((item, index) => <View key={`${index}-${item}`} style={styles.exerciseRow}><View style={styles.exerciseIndex}><Text style={styles.exerciseIndexText}>{index + 1}</Text></View><Text style={styles.exerciseText}>{item.replace(/^\s*[•*-]\s*/, '')}</Text></View>)}
              </View>}
              {!isRest && <TouchableOpacity style={styles.primaryButton} onPress={start} activeOpacity={0.84}><Text style={styles.primaryButtonText}>{recommendation.activity_type === 'run' ? 'Start your run' : recommendation.activity_type === 'walk' ? 'Start your walk' : 'Start this workout'}</Text><ArrowRight size={17} color="#FFFFFF" /></TouchableOpacity>}
              {isRest && <View style={styles.recoveryBanner}><Check size={16} color={Colors.primary} /><Text style={styles.recoveryText}>Rest and recover today.</Text></View>}
            </View>}

            {recommendation && step === 1 && <View>
              <Text style={styles.modalTitle}>Built around you</Text>
              <Text style={styles.body}>Your goal, experience and available equipment.</Text>
              <View style={styles.profileGrid}>
                <ProfileChip icon={Target} label="GOAL" value={goal} styles={styles} />
                <ProfileChip icon={Activity} label="EXPERIENCE" value={level} styles={styles} />
                <ProfileChip icon={Dumbbell} label="EQUIPMENT" value={equipment} styles={styles} />
                <ProfileChip icon={CalendarDays} label="WEEKLY TARGET" value={`${profile?.weeklyWorkoutFrequencyDays || 3} sessions`} styles={styles} />
              </View>
              {!!recommendation.tomorrow && <View style={styles.tomorrowBox}><Text style={styles.tomorrowLabel}>UP NEXT</Text><Text style={styles.tomorrowText}>{recommendation.tomorrow}</Text></View>}
              <TouchableOpacity style={styles.textLink} onPress={editProfile}><Text style={styles.linkText}>Edit fitness profile</Text><ArrowRight size={15} color={Colors.primary} /></TouchableOpacity>
            </View>}

            {recommendation && step === 2 && <View>
              <View style={styles.fuelIcon}><Flame size={18} color={Colors.accentOrange} /></View>
              <Text style={styles.modalTitle}>Fuel your progress</Text>
              <View style={styles.targetsRow}>
                <View style={styles.targetPill}><Text style={styles.targetValue}>{calorieTarget.toLocaleString()} kcal</Text><Text style={styles.targetLabel}>daily energy</Text></View>
                <View style={styles.targetPill}><Text style={styles.targetValue}>{proteinTarget} g</Text><Text style={styles.targetLabel}>protein target</Text></View>
              </View>
              <Text style={styles.body}>{recommendation.nutrition_note || 'Your daily calorie and protein targets.'}</Text>
              {!!recommendation.roadmap?.summary && <View style={styles.tomorrowBox}><Text style={styles.tomorrowLabel}>{recommendation.roadmap.months ? `${recommendation.roadmap.months}-MONTH GOAL` : 'YOUR GOAL'}</Text><Text style={styles.tomorrowText}>{recommendation.roadmap.summary}</Text></View>}
              <TouchableOpacity style={styles.primaryButton} onPress={viewNutrition} activeOpacity={0.84}><Text style={styles.primaryButtonText}>View nutrition</Text><ArrowRight size={17} color="#FFFFFF" /></TouchableOpacity>
            </View>}
          </ScrollView>

          {recommendation && <View style={styles.stepNav}>
            <TouchableOpacity onPress={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} style={[styles.navButton, step === 0 && styles.navDisabled]} accessibilityRole="button" accessibilityLabel="Previous plan step">
              <ArrowLeft size={16} color={step === 0 ? Colors.textMuted : Colors.textPrimary} /><Text style={[styles.navText, step === 0 && styles.navTextDisabled]}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.navCount}>{step + 1} / {STEPS.length}</Text>
            <TouchableOpacity onPress={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} disabled={step === STEPS.length - 1} style={[styles.navButton, step === STEPS.length - 1 && styles.navDisabled]} accessibilityRole="button" accessibilityLabel="Next plan step">
              <Text style={[styles.navText, step === STEPS.length - 1 && styles.navTextDisabled]}>Next</Text><ArrowRight size={16} color={step === STEPS.length - 1 ? Colors.textMuted : Colors.textPrimary} />
            </TouchableOpacity>
          </View>}
        </View>
      </View>
    </Modal>
  </>;
}

function ProfileChip({ icon: Icon, label, value, styles }: { icon: any; label: string; value: string; styles: Record<string, any> }) {
  return <View style={styles.profileChip}><Icon size={15} color={Colors.primary} /><Text style={styles.profileLabel}>{label}</Text><Text numberOfLines={1} style={styles.profileValue}>{value}</Text></View>;
}

const createStyles = () => ({
  card: { backgroundColor: Colors.surface, borderRadius: 25, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 13, elevation: 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: Colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900', marginTop: 1 },
  refreshButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  loadingRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyBox: { gap: 12 },
  body: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21 },
  outlineButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.backgroundLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  outlineText: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  summary: { padding: 14, borderRadius: 19, backgroundColor: Colors.surfaceWarm, borderWidth: 1, borderColor: Colors.borderSubtle },
  summaryMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  activityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, backgroundColor: Colors.primarySoft, paddingHorizontal: 9, paddingVertical: 6 },
  activityBadgeText: { color: Colors.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800' },
  intensity: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800', textTransform: 'capitalize', marginLeft: 'auto' },
  headline: { color: Colors.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: '900', letterSpacing: -0.2 },
  summaryReason: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  openPlanRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 10, marginTop: 10 },
  openPlanText: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.52)' },
  modalSheet: { maxHeight: '88%', backgroundColor: Colors.surface, borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 20, paddingTop: 19, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  closeButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  stepDots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  stepDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: Colors.border },
  stepDotActive: { width: 23, backgroundColor: Colors.primary },
  stepLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  modalContent: { paddingBottom: 4 },
  modalTitle: { color: Colors.textPrimary, fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: -0.3, marginBottom: 7 },
  exercisePreview: { paddingVertical: 9, marginTop: 4 },
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  exerciseIndex: { width: 25, height: 25, borderRadius: 9, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  exerciseIndexText: { color: Colors.primary, fontSize: 11, fontWeight: '900' },
  exerciseText: { flex: 1, color: Colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  primaryButton: { minHeight: 51, borderRadius: 16, marginTop: 11, backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  recoveryBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primarySoft, borderRadius: 13, padding: 12, marginTop: 8 },
  recoveryText: { flex: 1, color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  profileChip: { width: '48%', minHeight: 80, borderRadius: 15, backgroundColor: Colors.backgroundLight, padding: 11, justifyContent: 'space-between' },
  profileLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 7 },
  profileValue: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900', textTransform: 'capitalize', marginTop: 3 },
  tomorrowBox: { borderRadius: 15, backgroundColor: Colors.surfaceWarm, padding: 13, marginTop: 12 },
  tomorrowLabel: { color: Colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  tomorrowText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  textLink: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 12 },
  linkText: { color: Colors.primary, fontSize: 13, fontWeight: '900' },
  fuelIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: Colors.accentSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 11 },
  targetsRow: { flexDirection: 'row', gap: 9, marginVertical: 11 },
  targetPill: { flex: 1, backgroundColor: Colors.primarySoft, borderRadius: 14, padding: 12 },
  targetValue: { color: Colors.primary, fontSize: 16, fontWeight: '900' },
  targetLabel: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepNav: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle, marginTop: 11, paddingTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 72, minHeight: 40 },
  navDisabled: { opacity: 0.55 },
  navText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' },
  navTextDisabled: { color: Colors.textMuted },
  navCount: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' },
});

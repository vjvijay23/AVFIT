import { useTheme, useThemeStyles } from '../theme/ThemeContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import {
  Flame,
  Camera,
  ChevronRight,
  PersonStanding,
  Bike,
  Mountain,
  Footprints,
  Dumbbell,
  Users,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import AvfitLogo from '../components/common/AvfitLogo';
import ProfileAvatar from '../components/common/ProfileAvatar';
import HealthConnectionsCard from '../components/profile/HealthConnectionsCard';
import AITrainingCoachCard from '../components/dashboard/AITrainingCoachCard';
import { AuthService } from '../services/auth';
import { FitnessProfileService } from '../services/fitnessProfile';
import { ActivityService } from '../services/activityService';
import { BackendApi } from '../services/backendApi';
import { DailyHealthSummary, HealthIntegrationService } from '../services/healthIntegrationService';
import { FitnessProfile, UserProfile, UserFitnessStats, RecordedActivity } from '../types';

export default function DashboardScreen({ navigation }: any) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [fitnessProfile, setFitnessProfile] = useState<FitnessProfile | null>(null);
  const [userStats, setUserStats] = useState<UserFitnessStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecordedActivity[]>([]);
  const [healthSummary, setHealthSummary] = useState<DailyHealthSummary | null>(null);
  const [healthConnected, setHealthConnected] = useState(false);
  const [trainingRecommendation, setTrainingRecommendation] = useState<Record<string, any> | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState('');
  const fetchData = async () => {
    const [userResult, fitnessResult, statsResult, activitiesResult, connectedResult, trainingResult] = await Promise.allSettled([
      AuthService.getUserProfile(),
      FitnessProfileService.getFitnessProfile(),
      ActivityService.getUserStats(),
      ActivityService.getUserActivities(),
      HealthIntegrationService.isConnected(),
      BackendApi.getTrainingRecommendation(),
    ]);

    if (userResult.status === 'fulfilled') setUserProfile(userResult.value);
    if (fitnessResult.status === 'fulfilled') setFitnessProfile(fitnessResult.value);
    if (statsResult.status === 'fulfilled') setUserStats(statsResult.value);
    if (activitiesResult.status === 'fulfilled') setRecentActivities(activitiesResult.value);
    if (trainingResult.status === 'fulfilled') {
      setTrainingRecommendation(trainingResult.value.recommendation);
      setTrainingError('');
    } else {
      setTrainingRecommendation(null);
      const message = String(trainingResult.reason?.message || '');
      setTrainingError(/not found|404/i.test(message)
        ? 'Update the AVFIT backend to enable your AI training plan.'
        : message || 'Training suggestions are temporarily unavailable.');
    }
    const connected = connectedResult.status === 'fulfilled' && connectedResult.value;
    setHealthConnected(connected);
    if (connected) {
      const summary = await HealthIntegrationService.getDailySummary().catch((error) => {
        console.warn('[Dashboard] Could not load daily health summary', error);
        return null;
      });
      setHealthSummary(summary);
    } else {
      setHealthSummary(null);
    }

    if (userResult.status === 'rejected' && !BackendApi.hasAuthToken()) {
      navigation?.getParent?.()?.reset?.({ index: 0, routes: [{ name: 'AuthWelcome' }] });
    }
    if ([userResult, fitnessResult, statsResult, activitiesResult].some((result) => result.status === 'rejected')) {
      console.warn('[Dashboard] Some account progress data could not be refreshed');
    }
  };

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  const streakDays = userProfile?.streakCount || 0;
  const userName = userProfile?.fullName ? userProfile.fullName.split(' ')[0] : 'Athlete';
  const isNewUser = (userStats?.totalActivities || 0) === 0;

  const calorieTarget = fitnessProfile?.dailyCalorieTarget || 2000;
  const proteinTarget = fitnessProfile?.dailyProteinG || 140;
  const stepTarget = fitnessProfile?.dailyStepGoal || userStats?.todayStepGoal || 8000;

  const stepsToday = healthConnected ? (healthSummary?.steps || 0) : (userStats?.todaySteps || 0);
  const activityCaloriesToday = healthConnected
    ? (healthSummary?.activeCalories || 0)
    : (userStats?.todayCalories || 0);
  const movementMinutesToday = recentActivities
    .filter((activity) => new Date(activity.createdAt).toDateString() === new Date().toDateString())
    .reduce((total, activity) => total + Math.max(0, Math.round(activity.activeDurationSeconds / 60)), 0);
  const goalLabel = fitnessProfile?.fitnessGoal?.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Set your goal';

  const refreshTraining = async () => {
    setTrainingLoading(true);
    setTrainingError('');
    try {
      const result = await BackendApi.getTrainingRecommendation(true);
      setTrainingRecommendation(result.recommendation);
    } catch (error: any) {
      setTrainingError(error?.message || 'Could not refresh your training suggestion.');
    } finally { setTrainingLoading(false); }
  };

  const startRecommendedPlan = () => {
    if (trainingRecommendation?.activity_type === 'strength') {
      navigation?.navigate?.('GymWorkout', { initialWorkout: {
        name: trainingRecommendation.headline || 'AI Strength Workout',
        exercises: trainingRecommendation.workout || [],
      } });
    }
    else navigation?.navigate?.('Activity', { initialSport: trainingRecommendation?.activity_type === 'run' ? 'running' : 'walking' });
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      {/* Top Header Row with AVFIT Logo */}
      <View style={styles.topHeader}>
        {/* User Avatar - Tapping opens Profile Edit */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => navigation?.navigate?.('ProfileEdit')}
          activeOpacity={0.8}
        >
          <ProfileAvatar userId={userProfile?.id} hasPhoto={userProfile?.hasProfilePhoto} photoUpdatedAt={userProfile?.photoUpdatedAt} emoji={userProfile?.avatarUrl || ''} size={44} />
        </TouchableOpacity>

        {/* Official AVFIT Brand Logo Badge */}
        <View style={styles.brandBadgePill}>
          <AvfitLogo size={42} showWordmark={true} />
        </View>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 130 + insets.bottom },
        ]}
      >
        {/* A short greeting uses saved profile goals instead of generic text. */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingTitle}>Hey, {userName}</Text>
            <Text style={styles.greetingSubtitle}>
              {fitnessProfile ? `${goalLabel} · ${fitnessProfile.fitnessLevel}` : 'Your fitness, at your pace'}
            </Text>
          </View>
          <View style={styles.streakPill}>
            <Flame size={16} color={Colors.accentOrange} fill={Colors.accentOrange} />
            <Text style={styles.streakNumber}>{streakDays} Days</Text>
          </View>
        </View>

        {/* One simple, profile-based daily activity summary. */}
        <View style={styles.dailyProgressCard}>
          <View style={styles.dailyProgressHeader}>
            <Text style={styles.dailyProgressTitle}>Today&apos;s progress</Text>
          </View>
          <View style={styles.activitySummaryRow}>
            <View style={styles.activityMetricStack}>
              <ActivityMetric icon={Footprints} label="Steps" value={stepsToday.toLocaleString()} color={Colors.primaryLight} progress={stepsToday / Math.max(1, stepTarget)} styles={styles} />
              <ActivityMetric icon={PersonStanding} label="Active minutes" value={`${movementMinutesToday}`} suffix="mins" color={Colors.blue} progress={movementMinutesToday / 60} styles={styles} />
              <ActivityMetric icon={Flame} label="Calories" value={activityCaloriesToday.toLocaleString()} suffix="kcal" color={Colors.lilac} progress={activityCaloriesToday / 500} styles={styles} />
            </View>
            <ActivityHeartRings
              stepProgress={stepsToday / Math.max(1, stepTarget)}
              minuteProgress={movementMinutesToday / 60}
              calorieProgress={activityCaloriesToday / 500}
            />
          </View>
        </View>

        {!healthConnected && <HealthConnectionsCard hideWhenConnected />}

        <AITrainingCoachCard
          recommendation={trainingRecommendation}
          profile={fitnessProfile}
          loading={trainingLoading}
          error={trainingError}
          onRefresh={refreshTraining}
          onStart={startRecommendedPlan}
          onProfile={() => navigation?.navigate?.('ProfileEdit')}
          onNutrition={() => navigation?.navigate?.('DietPlan')}
          calorieTarget={calorieTarget}
          proteinTarget={proteinTarget}
        />

        {/* Reference-inspired training discovery: concise, tappable session cards and focus areas. */}
        <View style={styles.discoverSection}>
          <View style={styles.discoverHeader}>
            <View>
              <Text style={styles.discoverEyebrow}>MOVE WITH PURPOSE</Text>
              <Text style={styles.discoverTitle}>Choose your focus</Text>
            </View>
            <TouchableOpacity style={styles.discoverAll} onPress={() => navigation?.navigate?.('Gym')} accessibilityRole="button" accessibilityLabel="Open training">
              <ArrowUpRight size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.focusCarousel}>
            <TouchableOpacity style={[styles.focusCard, styles.focusStrength]} onPress={() => navigation?.navigate?.('Gym')} activeOpacity={0.84}>
              <View style={styles.focusCardTop}><View style={styles.focusIcon}><Dumbbell size={19} color={Colors.primary} /></View><Text style={styles.focusArrow}>↗</Text></View>
              <Text style={styles.focusTitle}>Strength</Text>
              <Text style={styles.focusCaption}>Build power</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.focusCard, styles.focusRun]} onPress={() => navigation?.navigate?.('Activity', { initialSport: 'running' })} activeOpacity={0.84}>
              <View style={styles.focusCardTop}><View style={styles.focusIcon}><PersonStanding size={20} color={Colors.primary} /></View><Text style={styles.focusArrow}>↗</Text></View>
              <Text style={styles.focusTitle}>Run</Text>
              <Text style={styles.focusCaption}>Find your pace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.focusCard, styles.focusWalk]} onPress={() => navigation?.navigate?.('Activity', { initialSport: 'walking' })} activeOpacity={0.84}>
              <View style={styles.focusCardTop}><View style={styles.focusIcon}><Footprints size={19} color={Colors.primary} /></View><Text style={styles.focusArrow}>↗</Text></View>
              <Text style={styles.focusTitle}>Walk</Text>
              <Text style={styles.focusCaption}>Easy movement</Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={styles.focusAreasLabel}>BODY FOCUS</Text>
          <View style={styles.bodyFocusRow}>
            {['Chest', 'Back', 'Legs', 'Core'].map((area) => (
              <TouchableOpacity key={area} style={styles.bodyFocusPill} onPress={() => navigation?.navigate?.('Gym')} activeOpacity={0.8}>
                <Text style={styles.bodyFocusText}>{area}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Simple shortcuts keep the main tools easy to reach without a long goals list. */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => navigation?.navigate?.('FoodScanner')} activeOpacity={0.82}>
            <View style={styles.quickActionIcon}><Camera size={19} color={Colors.primary} /></View>
            <Text style={styles.quickActionLabel}>Scan a meal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => navigation?.navigate?.('DietPlan')} activeOpacity={0.82}>
            <View style={styles.quickActionIcon}><Flame size={19} color={Colors.accentOrange} /></View>
            <Text style={styles.quickActionLabel}>Diet plan</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.communityRow} onPress={() => navigation?.navigate?.('Community')} activeOpacity={0.82}>
          <View style={styles.communityIcon}><Users size={20} color={Colors.accentOrange} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.communityTitle}>Fitness community</Text>
            <Text style={styles.communitySubtitle}>Share progress and cheer on other athletes</Text>
          </View>
          <ChevronRight size={19} color={Colors.textSecondary} />
        </TouchableOpacity>

        {/* Recent activities are shown only when the user has saved sessions. */}
        {!isNewUser && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Your Recent Activities</Text>
              <TouchableOpacity onPress={() => navigation?.navigate?.('Record')}>
                <Text style={styles.seeAllText}>+ Record New</Text>
              </TouchableOpacity>
            </View>

            {recentActivities.slice(0, 1).map((act) => (
              <TouchableOpacity
                key={act.id}
                style={styles.activityItemCard}
                onPress={() => navigation?.navigate?.('ActivitySummary', { activity: act })}
                activeOpacity={0.8}
              >
                <View style={styles.activityItemIcon}>
                  {(() => {
                    const ActivityIcon: LucideIcon = act.sportType === 'cycling' ? Bike : act.sportType === 'weight_training' ? Dumbbell : act.sportType === 'hiking' ? Mountain : act.sportType === 'walking' ? Footprints : PersonStanding;
                    return <ActivityIcon size={20} color={Colors.primary} />;
                  })()}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.activityItemTitle}>{act.title}</Text>
                  <Text style={styles.activityItemMeta}>
                    {act.distanceKm > 0 ? `${act.distanceKm.toFixed(2)} km • ` : ''}
                    {Math.round(act.activeDurationSeconds / 60)} min • {act.caloriesBurned} kcal
                  </Text>
                </View>
                <Text style={styles.activityItemDate}>
                  {new Date(act.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ActivityMetric({ icon: Icon, label, value, suffix, color, progress, styles }: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix?: string;
  color: string;
  progress: number;
  styles: Record<string, any>;
}) {
  return (
    <View style={styles.activityMetric}>
      <View style={[styles.activityMetricIcon, { backgroundColor: color }]}><Icon size={17} color="#FFFFFF" strokeWidth={2.4} /></View>
      <View style={styles.activityMetricCopy}>
        <Text style={styles.activityMetricLabel}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.activityMetricValue}>{value}<Text style={styles.activityMetricSuffix}>{suffix ? ` ${suffix}` : ''}</Text></Text>
        <View style={styles.activityTrack}><View style={[styles.activityTrackFill, { width: `${Math.max(0, Math.min(progress, 1)) * 100}%`, backgroundColor: color }]} /></View>
      </View>
    </View>
  );
}

function ActivityHeartRings({ stepProgress, minuteProgress, calorieProgress }: { stepProgress: number; minuteProgress: number; calorieProgress: number }) {
  const rings = [
    { radius: 44, progress: stepProgress, color: Colors.primaryLight },
    { radius: 33, progress: minuteProgress, color: Colors.blue },
    { radius: 22, progress: calorieProgress, color: Colors.lilac },
  ];
  return <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={104} height={104} viewBox="0 0 100 100">
      {rings.map((ring) => {
        const circumference = 2 * Math.PI * ring.radius;
        const progress = Math.max(0, Math.min(1, ring.progress));
        return <React.Fragment key={ring.color}>
          <Circle cx="50" cy="50" r={ring.radius} fill="none" stroke={ring.color} strokeOpacity={0.17} strokeWidth="7" />
          <Circle cx="50" cy="50" r={ring.radius} fill="none" stroke={ring.color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${circumference * progress} ${circumference}`} rotation={-90} originX="50" originY="50" />
        </React.Fragment>;
      })}
    </Svg>
  </View>;
}

const createStyles = () => ({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  avatarContainer: {
    width: 44,
    height: 44,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  brandBadgePill: {
    backgroundColor: Colors.surface,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    elevation: 1,
  },
  circleActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  greetingTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  greetingSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 4,
  },
  streakNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.accentOrange,
  },
  dailyProgressCard: { backgroundColor: Colors.surface, borderRadius: 25, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3 },
  dailyProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  dailyProgressTitle: { color: Colors.textPrimary, fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  activitySummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  activityMetricStack: { flex: 1, gap: 10, borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle, paddingLeft: 14 },
  activityMetric: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9 },
  activityMetricIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  activityMetricCopy: { flex: 1, minWidth: 0 },
  activityMetricLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },
  activityMetricValue: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900', lineHeight: 19 },
  activityMetricSuffix: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },
  activityTrack: { height: 3, marginTop: 3, borderRadius: 2, backgroundColor: Colors.backgroundLight, overflow: 'hidden' },
  activityTrackFill: { height: '100%', borderRadius: 2 },
  trainingPlanCard: { backgroundColor: Colors.surface, borderRadius: 22, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 16 },
  trainingPlanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  trainingPlanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  trainingPlanIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  trainingPlanTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' },
  trainingPlanSubtitle: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  trainingRefresh: { padding: 8 },
  trainingPlanHeadline: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900', marginBottom: 9 },
  trainingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  trainingMetaPill: { overflow: 'hidden', color: Colors.primary, backgroundColor: Colors.primarySoft, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  trainingMetaText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  trainingPlanBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  trainingWorkoutList: { marginVertical: 2, marginBottom: 8 },
  trainingWorkoutLine: { color: Colors.textPrimary, fontSize: 12, lineHeight: 19 },
  trainingStrong: { fontWeight: '900', color: Colors.textPrimary },
  trainingNutritionNote: { color: Colors.primary, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  trainingRoadmap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderSubtle, marginTop: 12, paddingTop: 12 },
  trainingRoadmapTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900', marginBottom: 6 },
  trainingRoadmapMilestone: { color: Colors.textSecondary, fontSize: 11, lineHeight: 17 },
  trainingStartButton: { minHeight: 43, borderRadius: 14, marginTop: 13, backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  trainingStartText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  discoverSection: { marginBottom: 18 },
  discoverHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  discoverEyebrow: { color: Colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  discoverTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: -0.35, marginTop: 3 },
  discoverAll: { width: 38, height: 38, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  focusCarousel: { gap: 10, paddingRight: 2 },
  focusCard: { width: 145, minHeight: 132, borderRadius: 21, padding: 14, borderWidth: 1, borderColor: Colors.borderSubtle, justifyContent: 'space-between' },
  focusStrength: { backgroundColor: Colors.surface },
  focusRun: { backgroundColor: Colors.surfaceWarm },
  focusWalk: { backgroundColor: Colors.primarySoft },
  focusCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  focusIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  focusArrow: { color: Colors.primary, fontSize: 18, fontWeight: '900' },
  focusTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900', marginTop: 12 },
  focusCaption: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', marginTop: 2 },
  focusAreasLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  bodyFocusRow: { flexDirection: 'row', gap: 8 },
  bodyFocusPill: { flex: 1, minHeight: 36, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  bodyFocusText: { color: Colors.textPrimary, fontSize: 11, fontWeight: '800' },
  nutritionEngineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 21,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 14,
  },
  nutritionEngineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  engineTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  engineVal: {
    fontSize: 23,
    fontWeight: '900',
    color: Colors.primary,
  },
  engineSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  nutritionPillBadge: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  nutritionPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickActionButton: {
    flex: 1,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  quickActionIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: Colors.primarySoft,
  },
  quickActionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  communityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingHorizontal: 14, marginBottom: 18, borderRadius: 21, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderSubtle },
  communityIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  communityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  communitySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  newWorkoutCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    gap: 12,
  },
  calloutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calloutSub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    lineHeight: 19,
  },
  recentSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  seeAllText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.primary,
  },
  activityItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  activityItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  activityItemMeta: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activityItemDate: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  goalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  goalMeta: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusProgressPill: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusProgressText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.primary,
  },
  statusCompletedPill: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusCompletedText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.accentOrange,
  },
});

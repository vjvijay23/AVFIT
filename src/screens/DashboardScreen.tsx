import { useTheme, useThemeStyles } from '../theme/ThemeContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import {
  Flame,
  Camera,
  ChevronRight,
  Settings,
  PersonStanding,
  Bike,
  Mountain,
  Footprints,
  Dumbbell,
  Users,
  Sparkles,
  RefreshCw,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react-native';
import AvfitLogo from '../components/common/AvfitLogo';
import ProfileAvatar from '../components/common/ProfileAvatar';
import HealthConnectionsCard from '../components/profile/HealthConnectionsCard';
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
  const [todayMeals, setTodayMeals] = useState<Array<Record<string, any>>>([]);
  const [healthSummary, setHealthSummary] = useState<DailyHealthSummary | null>(null);
  const [healthConnected, setHealthConnected] = useState(false);
  const [trainingRecommendation, setTrainingRecommendation] = useState<Record<string, any> | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState('');
  const [stravaStatus, setStravaStatus] = useState<{ configured: boolean; connected: boolean; connection: Record<string, any> | null } | null>(null);
  const [stravaActivities, setStravaActivities] = useState<Array<Record<string, any>>>([]);
  const [stravaSyncing, setStravaSyncing] = useState(false);

  const fetchData = async () => {
    const [userResult, fitnessResult, statsResult, activitiesResult, mealsResult, connectedResult, trainingResult, stravaResult] = await Promise.allSettled([
      AuthService.getUserProfile(),
      FitnessProfileService.getFitnessProfile(),
      ActivityService.getUserStats(),
      ActivityService.getUserActivities(),
      BackendApi.getMeals(),
      HealthIntegrationService.isConnected(),
      BackendApi.getTrainingRecommendation(),
      BackendApi.getStravaStatus(),
    ]);

    if (userResult.status === 'fulfilled') setUserProfile(userResult.value);
    if (fitnessResult.status === 'fulfilled') setFitnessProfile(fitnessResult.value);
    if (statsResult.status === 'fulfilled') setUserStats(statsResult.value);
    if (activitiesResult.status === 'fulfilled') setRecentActivities(activitiesResult.value);
    if (mealsResult.status === 'fulfilled') {
      const today = localDateKey(new Date());
      setTodayMeals(mealsResult.value.meals.filter((meal) => meal.logged_at && localDateKey(new Date(meal.logged_at)) === today));
    }
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
    if (stravaResult.status === 'fulfilled') {
      setStravaStatus(stravaResult.value);
      if (stravaResult.value.connected) {
        const importedResult = await BackendApi.getStravaActivities().catch(() => null);
        if (importedResult) setStravaActivities(importedResult.activities);
      } else setStravaActivities([]);
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
    if ([userResult, fitnessResult, statsResult, activitiesResult, mealsResult].some((result) => result.status === 'rejected')) {
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
  const carbsTarget = fitnessProfile?.dailyCarbsG || 220;
  const fatTarget = fitnessProfile?.dailyFatG || 65;
  const stepTarget = fitnessProfile?.dailyStepGoal || userStats?.todayStepGoal || 8000;

  const foodTotals = todayMeals.reduce((totals, meal) => ({
    calories: totals.calories + Number(meal.calories || 0),
    protein: totals.protein + Number(meal.protein_g || 0),
    carbs: totals.carbs + Number(meal.carbs_g || 0),
    fat: totals.fat + Number(meal.fat_g || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const stepsToday = healthConnected ? (healthSummary?.steps || 0) : (userStats?.todaySteps || 0);

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

  const connectStrava = async () => {
    try {
      const url = await BackendApi.startStravaConnection();
      await Linking.openURL(url);
    } catch (error: any) {
      const message = String(error?.message || '');
      Alert.alert('Could not connect Strava', /not found|404/i.test(message)
        ? 'Update the AVFIT backend and configure the Strava app to enable account linking.'
        : message || 'Could not start Strava connection.');
    }
  };

  const syncStrava = async () => {
    setStravaSyncing(true);
    try {
      const result = await BackendApi.syncStravaActivities();
      setStravaActivities(result.activities || []);
      Alert.alert('Strava synced', `${result.synced} recent activities are available in AVFIT.`);
    } catch (error: any) {
      Alert.alert('Could not sync Strava', error?.message || 'Try again shortly.');
    } finally { setStravaSyncing(false); }
  };

  const startRecommendedPlan = () => {
    if (trainingRecommendation?.activity_type === 'strength') navigation?.navigate?.('Gym');
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
        {/* Greeting & Streak Row */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingTitle}>Hey, {userName}</Text>
            <Text style={styles.greetingSubtitle}>
              {isNewUser
                ? 'Your fitness, all in one place.'
                : `Day ${streakDays} • Goal: ${fitnessProfile?.fitnessGoal === 'weight_loss' ? 'Weight Loss' : 'Muscle Tone'}`}
            </Text>
          </View>
          <View style={styles.streakPill}>
            <Flame size={16} color={Colors.accentOrange} fill={Colors.accentOrange} />
            <Text style={styles.streakNumber}>{streakDays} Days</Text>
          </View>
        </View>

        {/* Daily activity and meal progress, based on connected health data and saved food diary entries. */}
        <View style={styles.dailyProgressCard}>
          <View style={styles.dailyProgressHeader}>
            <View>
              <Text style={styles.dailyProgressTitle}>Today&apos;s progress</Text>
              <Text style={styles.dailyProgressSubtitle}>Activity and nutrition against your targets</Text>
            </View>
            <View style={styles.progressDayPill}><Text style={styles.progressDayText}>TODAY</Text></View>
          </View>
          <View style={styles.stepProgressRow}>
            <View style={styles.progressIcon}><Footprints size={18} color={Colors.primary} /></View>
            <View style={styles.progressMain}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Steps</Text>
                <Text style={styles.progressValue}>{stepsToday.toLocaleString()} <Text style={styles.progressTarget}>/ {stepTarget.toLocaleString()}</Text></Text>
              </View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressPercent(stepsToday, stepTarget)}%`, backgroundColor: Colors.accentOrange }]} /></View>
            </View>
          </View>
          <View style={styles.progressDivider} />
          <Text style={styles.nutritionProgressHeading}>Food diary</Text>
          <ProgressMetric label="Calories" current={foodTotals.calories} target={calorieTarget} unit="kcal" color={Colors.accentOrange} styles={styles} />
          <ProgressMetric label="Protein" current={foodTotals.protein} target={proteinTarget} unit="g" color={Colors.primary} styles={styles} />
          <ProgressMetric label="Carbs" current={foodTotals.carbs} target={carbsTarget} unit="g" color={Colors.blue} styles={styles} />
          <ProgressMetric label="Fat" current={foodTotals.fat} target={fatTarget} unit="g" color={Colors.lilac} styles={styles} />
          <TouchableOpacity style={styles.viewDiaryLink} onPress={() => navigation?.navigate?.('FoodScanner')} accessibilityRole="button">
            <Text style={styles.viewDiaryText}>{todayMeals.length ? `${todayMeals.length} meal${todayMeals.length === 1 ? '' : 's'} logged` : 'Log your first meal'}</Text>
            <ChevronRight size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <HealthConnectionsCard />

        <View style={styles.trainingPlanCard}>
          <View style={styles.trainingPlanHeader}>
            <View style={styles.trainingPlanTitleRow}>
              <View style={styles.trainingPlanIcon}><Sparkles size={17} color={Colors.accentOrange} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.trainingPlanTitle}>Your AI training plan</Text>
                <Text style={styles.trainingPlanSubtitle}>Based on your goals, workouts and today&apos;s nutrition</Text>
              </View>
            </View>
            <TouchableOpacity onPress={refreshTraining} disabled={trainingLoading} accessibilityLabel="Refresh training plan" style={styles.trainingRefresh}>
              <RefreshCw size={17} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          {trainingLoading ? <Text style={styles.trainingPlanBody}>Updating your plan…</Text> : trainingRecommendation ? <>
            <Text style={styles.trainingPlanHeadline}>{trainingRecommendation.headline}</Text>
            <View style={styles.trainingMetaRow}>
              <Text style={styles.trainingMetaPill}>{String(trainingRecommendation.activity_type || 'workout').toUpperCase()}</Text>
              <Text style={styles.trainingMetaText}>{trainingRecommendation.duration_minutes ? `${trainingRecommendation.duration_minutes} min` : 'Rest day'}</Text>
              <Text style={styles.trainingMetaText}>{trainingRecommendation.intensity}</Text>
            </View>
            <Text style={styles.trainingPlanBody}>{trainingRecommendation.reason}</Text>
            {!!trainingRecommendation.workout?.length && <View style={styles.trainingWorkoutList}>{trainingRecommendation.workout.slice(0, 5).map((item: string, index: number) => <Text key={`${index}-${item}`} style={styles.trainingWorkoutLine}>• {item}</Text>)}</View>}
            <Text style={styles.trainingPlanBody}><Text style={styles.trainingStrong}>Tomorrow: </Text>{trainingRecommendation.tomorrow}</Text>
            <Text style={styles.trainingNutritionNote}>{trainingRecommendation.nutrition_note}</Text>
            {!!trainingRecommendation.roadmap && <View style={styles.trainingRoadmap}>
              <Text style={styles.trainingRoadmapTitle}>Your {trainingRecommendation.roadmap.months}-month goal roadmap</Text>
              <Text style={styles.trainingPlanBody}>{trainingRecommendation.roadmap.summary}</Text>
              {trainingRecommendation.roadmap.milestones?.map((milestone: string, index: number) => <Text key={`${index}-${milestone}`} style={styles.trainingRoadmapMilestone}>• {milestone}</Text>)}
            </View>}
            {trainingRecommendation.activity_type !== 'rest' && <TouchableOpacity style={styles.trainingStartButton} onPress={startRecommendedPlan} activeOpacity={0.82}>
              <Text style={styles.trainingStartText}>Start this plan</Text><ChevronRight size={17} color="#FFFFFF" />
            </TouchableOpacity>}
          </> : <Text style={styles.trainingPlanBody}>{trainingError || 'Your plan will appear here once your fitness profile is ready.'}</Text>}
        </View>

        <View style={styles.integrationsCard}>
          <Text style={styles.integrationsHeading}>Connected apps</Text>
          <View style={styles.stravaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.stravaTitle}>Strava</Text>
              <Text style={styles.stravaSubtitle}>{stravaStatus?.connected ? `Connected${stravaStatus.connection?.athlete_name ? ` · ${stravaStatus.connection.athlete_name}` : ''}` : 'Sync your Strava runs and workouts with AVFIT'}</Text>
            </View>
            {stravaStatus?.connected ? <TouchableOpacity style={styles.stravaButton} onPress={syncStrava} disabled={stravaSyncing}>
              <RefreshCw size={14} color={Colors.primary} /><Text style={styles.stravaButtonText}>{stravaSyncing ? 'Syncing…' : 'Sync'}</Text>
            </TouchableOpacity> : <TouchableOpacity style={styles.stravaButton} onPress={connectStrava}>
              <ExternalLink size={14} color={Colors.primary} /><Text style={styles.stravaButtonText}>Connect</Text>
            </TouchableOpacity>}
          </View>
          {stravaActivities.slice(0, 3).map((activity) => <View key={activity.strava_activity_id} style={styles.stravaActivity}>
            <Text style={styles.stravaActivityName}>{activity.name}</Text>
            <Text style={styles.stravaActivityMeta}>{activity.sport_type} · {(Number(activity.distance_m || 0) / 1000).toFixed(1)} km · {Math.round(Number(activity.moving_time_sec || 0) / 60)} min</Text>
          </View>)}
        </View>

        {/* Personalized Nutrition Target Engine */}
        <View style={styles.nutritionEngineCard}>
          <View style={styles.nutritionEngineHeader}>
            <Text style={styles.engineTitle}>Personalized Nutrition Targets</Text>
            <TouchableOpacity onPress={() => navigation?.navigate?.('ProfileEdit')}>
              <Settings size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.nutritionRow}>
            <View>
              <Text style={styles.engineVal}>{calorieTarget} kcal</Text>
              <Text style={styles.engineSub}>Daily Calorie Target</Text>
            </View>
            <View style={styles.nutritionPillBadge}>
              <Text style={styles.nutritionPillText}>{proteinTarget}g Protein</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation?.navigate?.('DietPlan')} style={{ marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderSubtle }}>
            <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '800' }}>Open your personalized 7-day diet chart →</Text>
          </TouchableOpacity>
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

            {recentActivities.slice(0, 3).map((act) => (
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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function progressPercent(current: number, target: number) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function ProgressMetric({ label, current, target, unit, color, styles }: {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
  styles: Record<string, any>;
}) {
  const currentRounded = Math.round(current);
  const targetRounded = Math.round(target);
  return (
    <View style={styles.progressMetric}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{currentRounded.toLocaleString()} <Text style={styles.progressTarget}>/ {targetRounded.toLocaleString()} {unit}</Text></Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent(current, target)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
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
    backgroundColor: '#0D1824',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203846',
  },
  avatarEmoji: {
    fontSize: 20,
  },
  brandBadgePill: {
    backgroundColor: '#0D1824',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#203846',
    elevation: 1,
  },
  circleActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0D1824',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203846',
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
    backgroundColor: '#10362F',
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
  dailyProgressCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 17,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  dailyProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  dailyProgressTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' },
  dailyProgressSubtitle: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  progressDayPill: { backgroundColor: Colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  progressDayText: { color: Colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  stepProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  progressIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  progressMain: { flex: 1 },
  progressMetric: { marginBottom: 13 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  progressLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800' },
  progressValue: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900' },
  progressTarget: { color: Colors.textMuted, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: Colors.backgroundLight },
  progressFill: { height: '100%', borderRadius: 8 },
  progressDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.borderSubtle, marginTop: 15, marginBottom: 13 },
  nutritionProgressHeading: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900', marginBottom: 12 },
  trainingPlanCard: { backgroundColor: Colors.surface, borderRadius: 22, padding: 17, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 16 },
  integrationsCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 16 },
  integrationsHeading: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900', marginBottom: 12 },
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
  stravaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stravaTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' },
  stravaSubtitle: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  stravaButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  stravaButtonText: { color: Colors.primary, fontSize: 12, fontWeight: '900' },
  stravaActivity: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderSubtle, paddingTop: 9, marginTop: 9 },
  stravaActivityName: { color: Colors.textPrimary, fontSize: 12, fontWeight: '800' },
  stravaActivityMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  viewDiaryLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderSubtle, paddingTop: 11, marginTop: 1 },
  viewDiaryText: { color: Colors.primary, fontSize: 12, fontWeight: '900' },
  nutritionEngineCard: {
    backgroundColor: '#0D1824',
    borderRadius: 21,
    padding: 18,
    borderWidth: 1,
    borderColor: '#203846',
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
    backgroundColor: '#103B35',
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
  communityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 14, marginBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderSubtle },
  communityIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1824',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#203846',
    marginBottom: 16,
  },
  communityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#103B35',
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
    backgroundColor: '#0D1824',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#203846',
    marginBottom: 8,
  },
  activityItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#12202B',
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
    backgroundColor: '#0D1824',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#203846',
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
    backgroundColor: '#103B35',
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
    backgroundColor: '#10362F',
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

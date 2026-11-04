import { useTheme, useThemeStyles } from '../theme/ThemeContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import {
  SportType,
  RecordedActivity,
  UserFitnessStats,
  UserProfile,
} from '../types';
import { ActivityService } from '../services/activityService';
import ProfileAvatar from '../components/common/ProfileAvatar';
import { AuthService } from '../services/auth';
import AvfitLogo from '../components/common/AvfitLogo';
import AppNoticeCard from '../components/common/AppNoticeCard';
import { BackendApi } from '../services/backendApi';
import {
  Play,
  TrendingUp,
  Flame,
  Clock,
  MapPin,
  ChevronRight,
  Sparkles,
  Trophy,
  Bike,
  Footprints,
  Mountain,
  Dumbbell,
  PersonStanding,
  ChevronDown,
  Check,
  type LucideIcon,
} from 'lucide-react-native';

const SPORT_OPTIONS: { id: SportType; label: string; Icon: LucideIcon; actionLabel: string }[] = [
  { id: 'running', label: 'Run', Icon: PersonStanding, actionLabel: 'Start Running' },
  { id: 'walking', label: 'Walk', Icon: Footprints, actionLabel: 'Start Walking' },
  { id: 'cycling', label: 'Ride', Icon: Bike, actionLabel: 'Start Cycling' },
  { id: 'hiking', label: 'Hike', Icon: Mountain, actionLabel: 'Start Hiking' },
];
const GYM_CONFIG = { id: 'weight_training' as SportType, label: 'Gym', Icon: Dumbbell, actionLabel: 'Start Workout' };

export default function ActivityTrackerScreen({ navigation, route }: any) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const gymOnly = route?.params?.gymOnly === true;
  const [selectedSport, setSelectedSport] = useState<SportType>(gymOnly ? 'weight_training' : 'running');
  const [sportDropdownOpen, setSportDropdownOpen] = useState(false);
  const [userStats, setUserStats] = useState<UserFitnessStats | null>(null);
  const [activities, setActivities] = useState<RecordedActivity[]>([]);
  const [gymWorkouts, setGymWorkouts] = useState<Array<Record<string, any>>>([]);
  const [gymHistoryError, setGymHistoryError] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [statsResult, listResult, profileResult, gymResult] = await Promise.allSettled([
        ActivityService.getUserStats(),
        ActivityService.getUserActivities(),
        AuthService.getUserProfile(),
        gymOnly ? BackendApi.getStrengthWorkouts(100) : Promise.resolve(null),
      ]);
      if (statsResult.status === 'fulfilled') setUserStats(statsResult.value);
      if (listResult.status === 'fulfilled') setActivities(listResult.value);
      if (profileResult.status === 'fulfilled') setUserProfile(profileResult.value);
      if (gymOnly) {
        if (gymResult.status === 'fulfilled' && gymResult.value) {
          setGymWorkouts(gymResult.value.workouts || []);
          setGymHistoryError('');
        } else {
          setGymWorkouts([]);
          setGymHistoryError('Gym workout history is temporarily unavailable. Tap to retry.');
        }
      }
      const failed = [statsResult, listResult, profileResult].some((result) => result.status === 'rejected');
      setLoadError(failed ? 'Some activity history is temporarily unavailable. You can still start a new activity.' : null);
    } catch (error) {
      // Keep the tracker screen and its start action available even if history or
      // dashboard data is temporarily unreachable.
      console.warn('[ActivityTracker] Could not refresh activity history', error);
      setLoadError('Activity history is temporarily unavailable. You can still start a new activity.');
    }
  };

  useEffect(() => {
    void loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void loadData();
    });
    return unsubscribe;
  }, [navigation, gymOnly]);

  const activeSportConfig = gymOnly ? GYM_CONFIG : SPORT_OPTIONS.find((s) => s.id === selectedSport) || SPORT_OPTIONS[0];
  const availableSports = SPORT_OPTIONS;

  const handleStartActivity = () => {
    if (selectedSport === 'walking') {
      navigation.navigate('LiveWalkingAnalyzer');
      return;
    }
    if (selectedSport === 'weight_training') {
      navigation.navigate('GymWorkout');
      return;
    }
    navigation.navigate('RecordActivity', { initialSport: selectedSport });
  };

  const caloriesBurned = userStats?.todayCalories || 0;
  const totalDistance = userStats?.totalDistanceKm || 0;
  const activeDuration = userStats?.totalDurationMinutes || 0;
  const totalCompleted = userStats?.totalActivities || 0;
  const displayedHistoryCount = gymOnly ? gymWorkouts.length : totalCompleted;
  const hasDisplayedHistory = gymOnly ? gymWorkouts.length > 0 : activities.length > 0;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      {/* Screen Header */}
      <View style={styles.topHeader}>
        <AvfitLogo size={42} showWordmark={true} />
        <TouchableOpacity
          style={styles.profileBadge}
          onPress={() => navigation?.navigate?.('ProfileEdit')}
          activeOpacity={0.8}
        >
          <ProfileAvatar userId={userProfile?.id} hasPhoto={userProfile?.hasProfilePhoto} photoUpdatedAt={userProfile?.photoUpdatedAt} emoji={userProfile?.avatarUrl || ''} size={42} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 130 + insets.bottom },
        ]}
      >
        {loadError && <AppNoticeCard message={loadError} tone="warning" compact />}

        {/* Title & Introduction */}
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>{gymOnly ? 'Gym' : 'Record & Track'}</Text>
          <Text style={styles.pageSubtitle}>
            {gymOnly || selectedSport === 'weight_training'
              ? 'Equipment-based strength logging with sets, reps, and workout history.'
              : 'GPS-calibrated route tracking, distance, and real-time pace.'}
          </Text>
        </View>

        {!gymOnly && <View style={styles.sportDropdownContainer}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded: sportDropdownOpen }}
            accessibilityLabel={`Activity type: ${activeSportConfig.label}`}
            style={styles.sportDropdownTrigger}
            onPress={() => setSportDropdownOpen((open) => !open)}
            activeOpacity={0.85}
          >
            <activeSportConfig.Icon size={19} color={Colors.primaryLight} />
            <Text style={styles.sportDropdownValue}>{activeSportConfig.label}</Text>
            <ChevronDown size={18} color={Colors.textSecondary} style={sportDropdownOpen ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {sportDropdownOpen && (
            <View style={styles.sportDropdownMenu}>
              {availableSports.map(({ id, label, Icon }) => {
                const isSelected = selectedSport === id;
                return (
                  <TouchableOpacity
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.sportDropdownOption, isSelected && styles.sportDropdownOptionSelected]}
                    onPress={() => { setSelectedSport(id); setSportDropdownOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Icon size={18} color={isSelected ? Colors.primary : Colors.textSecondary} />
                    <Text style={[styles.sportDropdownOptionText, isSelected && styles.sportDropdownOptionTextSelected]}>{label}</Text>
                    {isSelected && <Check size={17} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>}

        {/* Keep the GPS start action prominent; remove the decorative route promo card. */}
        {gymOnly ? <View style={styles.heroActionCard}>
          <View style={styles.heroCardHeader}>
            <View style={styles.heroSportBadge}>
              <View style={styles.heroSportIcon}><activeSportConfig.Icon size={22} color={Colors.accentOrange} /></View>
              <View style={{ marginLeft: 11, flex: 1 }}>
                <Text style={styles.heroSportTitle}>Strength session</Text>
                <Text style={styles.heroSportSub}>Choose exercises and log each set as you go.</Text>
              </View>
            </View>
          </View>
          <View style={styles.gymSessionHint}><Text style={styles.gymSessionHintText}>Build a workout with your equipment and save your sets to history.</Text></View>
          <TouchableOpacity
            style={styles.startActionButton}
            onPress={handleStartActivity}
            activeOpacity={0.85}
          >
            <View style={styles.playIconCircle}>
              <Play size={18} color={Colors.primary} fill={Colors.primary} />
            </View>
            <Text style={styles.startActionText}>{activeSportConfig.actionLabel}</Text>
          </TouchableOpacity>
        </View> : <TouchableOpacity
          style={[styles.startActionButton, styles.startActionStandalone]}
          onPress={handleStartActivity}
          activeOpacity={0.85}
        >
          <View style={styles.playIconCircle}>
            <Play size={18} color={Colors.primary} fill={Colors.primary} />
          </View>
          <Text style={styles.startActionText}>{activeSportConfig.actionLabel}</Text>
        </TouchableOpacity>}

        {/* Authenticated User's Real Daily Fitness Summary */}
        {!gymOnly && <View style={styles.dailySummaryCard}>
          <View style={styles.summaryTitleRow}>
            <TrendingUp size={16} color={Colors.primary} />
            <Text style={styles.summaryTitle}>Your Recorded Progress</Text>
          </View>

          <View style={styles.summaryMetricsRow}>
            {/* Calories Burned */}
            <View style={styles.summaryMetricItem}>
              <View style={styles.summaryIconCircle}>
                <Flame size={16} color={Colors.accentOrange} />
              </View>
              <Text style={styles.summaryMetricNumber}>{caloriesBurned}</Text>
              <Text style={styles.summaryMetricUnit}>kcal burned</Text>
            </View>

            <View style={styles.summaryDivider} />

            {/* Total Distance */}
            <View style={styles.summaryMetricItem}>
              <View style={[styles.summaryIconCircle, { backgroundColor: '#103B35' }]}>
                <MapPin size={16} color={Colors.primary} />
              </View>
              <Text style={styles.summaryMetricNumber}>{totalDistance.toFixed(1)}</Text>
              <Text style={styles.summaryMetricUnit}>km total</Text>
            </View>

            <View style={styles.summaryDivider} />

            {/* Active Minutes */}
            <View style={styles.summaryMetricItem}>
              <View style={[styles.summaryIconCircle, { backgroundColor: '#241C36' }]}>
                <Clock size={16} color="#7E22CE" />
              </View>
              <Text style={styles.summaryMetricNumber}>{activeDuration}</Text>
              <Text style={styles.summaryMetricUnit}>active mins</Text>
            </View>
          </View>
        </View>}

        {/* Activity History Section */}
        <View style={styles.historySection}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.historyTitle}>Activity History</Text>
            <Text style={styles.historyCountText}>{displayedHistoryCount} sessions</Text>
          </View>

          {gymOnly && gymHistoryError ? (
            <TouchableOpacity style={styles.emptyStateContainer} onPress={() => void loadData()} accessibilityRole="button">
              <Text style={styles.emptyStateTitle}>Could not load Gym history</Text>
              <Text style={styles.emptyStateSubtitle}>{gymHistoryError}</Text>
            </TouchableOpacity>
          ) : !hasDisplayedHistory ? (
            /* Clean Empty State for New Users */
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconCircle}>
                {gymOnly ? <Dumbbell size={28} color={Colors.primaryLight} /> : <PersonStanding size={28} color={Colors.primaryLight} />}
              </View>
              <Text style={styles.emptyStateTitle}>{gymOnly ? 'No Gym workouts recorded yet' : 'No activities recorded yet'}</Text>
              <Text style={styles.emptyStateSubtitle}>
                {gymOnly ? 'Finish and save a Gym workout to see it here.' : `Tap “${activeSportConfig.actionLabel}” above to record your first outdoor GPS route.`}
              </Text>
            </View>
          ) : gymOnly ? (
            gymWorkouts.map((workout) => {
              const completedAt = workout.completedAt || workout.startedAt;
              const dateStr = completedAt ? new Date(completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Saved workout';
              const minutes = Math.max(0, Math.floor(Number(workout.durationSeconds || 0) / 60));
              const volume = Math.round(Number(workout.totalVolumeKg || 0)).toLocaleString();
              return (
                <TouchableOpacity
                  key={String(workout.id)}
                  style={styles.activityItemCard}
                  onPress={() => navigation.navigate('GymWorkoutDetail', { workoutId: String(workout.id) })}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${workout.name || 'Gym workout'} from ${dateStr}; ${minutes} minutes; ${volume} kilograms volume`}
                >
                  <View style={styles.activitySportBadge}><Dumbbell size={18} color={Colors.primaryLight} /></View>
                  <View style={styles.activityMainInfo}>
                    <Text style={styles.activityTitleText}>{workout.name || 'Strength Workout'}</Text>
                    <Text style={styles.activityMetaText}>{dateStr} • {minutes} mins • {Number(workout.caloriesBurned || 0)} kcal</Text>
                  </View>
                  <View style={styles.activityRightStats}>
                    <Text style={styles.activityDistanceText}>{volume} kg</Text>
                    <Text style={styles.activityPaceText}>work volume</Text>
                  </View>
                  <ChevronRight size={16} color={Colors.textSecondary} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })
          ) : (
            /* Real Activity History Cards */
            activities.map((act) => {
              const sportInfo =
                SPORT_OPTIONS.find((s) => s.id === act.sportType) || SPORT_OPTIONS[0];
              const ActivitySportIcon = sportInfo.Icon;
              const dateStr = new Date(act.startTime).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const mins = Math.floor(act.activeDurationSeconds / 60);
              const paceTotal = act.avgPaceSecPerKm || 0;
              const paceMin = Math.floor(paceTotal / 60);
              const paceSec = (paceTotal % 60).toString().padStart(2, '0');

              return (
                <TouchableOpacity
                  key={act.id}
                  style={styles.activityItemCard}
                  onPress={() => navigation.navigate('ActivitySummary', { activity: act })}
                  activeOpacity={0.8}
                >
                  <View style={styles.activitySportBadge}>
                    <ActivitySportIcon size={18} color={Colors.primaryLight} />
                  </View>
                  <View style={styles.activityMainInfo}>
                    <Text style={styles.activityTitleText}>{act.title}</Text>
                    <Text style={styles.activityMetaText}>
                      {dateStr} • {mins} mins • {act.caloriesBurned} kcal
                    </Text>
                  </View>
                  <View style={styles.activityRightStats}>
                    <Text style={styles.activityDistanceText}>
                      {act.distanceKm.toFixed(2)} km
                    </Text>
                    <Text style={styles.activityPaceText}>{paceMin}:{paceSec} /km</Text>
                  </View>
                  <ChevronRight size={16} color={Colors.textSecondary} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })
          )}
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  profileBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D1824',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203846',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  titleSection: {
    marginTop: 6,
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  sportDropdownContainer: { marginBottom: 16, zIndex: 2 },
  sportDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 11,
  },
  sportDropdownValue: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  sportDropdownMenu: { marginTop: 7, padding: 6, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, elevation: 5 },
  sportDropdownOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 11 },
  sportDropdownOptionSelected: { backgroundColor: Colors.primarySoft },
  sportDropdownOptionText: { flex: 1, color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  sportDropdownOptionTextSelected: { color: Colors.textPrimary, fontWeight: '900' },
  heroActionCard: { backgroundColor: Colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 20 },
  heroCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroSportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSportIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: Colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  heroSportTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  heroSportSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  startActionStandalone: { marginBottom: 20 },
  gymSessionHint: { marginTop: 14, marginBottom: 15, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderSubtle },
  gymSessionHintText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  heroMetricsGrid: { flexDirection: 'row', alignItems: 'center' },
  heroMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetricLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A4B8C1',
    letterSpacing: 0.6,
  },
  heroMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 3,
  },
  heroMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  startActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentOrange,
    paddingVertical: 14,
    borderRadius: 18,
    elevation: 3,
    shadowColor: Colors.accentOrange,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  playIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0D1824',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  startActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  dailySummaryCard: {
    backgroundColor: '#0D1824',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#203846',
    marginBottom: 20,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10362F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  summaryMetricNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  summaryMetricUnit: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#1A2B36',
  },
  historySection: {
    marginTop: 4,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  historyCountText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  emptyStateContainer: {
    backgroundColor: '#0D1824',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#203846',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  emptyStateIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#12202B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 260,
  },
  activityItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1824',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#203846',
    marginBottom: 10,
  },
  activitySportBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#12202B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityMainInfo: {
    flex: 1,
  },
  activityTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  activityMetaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activityRightStats: {
    alignItems: 'flex-end',
  },
  activityDistanceText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: Colors.primary,
  },
  activityPaceText: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});

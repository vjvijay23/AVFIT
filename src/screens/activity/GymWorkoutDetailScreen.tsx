import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Dumbbell, RotateCcw, Share2 } from 'lucide-react-native';
import { BackendApi } from '../../services/backendApi';
import { Colors } from '../../theme/colors';
import { useTheme, useThemeStyles } from '../../theme/ThemeContext';
import ActivityShareModal from '../../components/share/ActivityShareModal';

type WorkoutSet = {
  setIndex: number;
  setType: string;
  weightKg: number | string;
  reps: number;
  isCompleted: boolean;
  isPersonalRecord: boolean;
};

type WorkoutExercise = {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  sets: WorkoutSet[];
};

type WorkoutDetail = {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  totalVolumeKg: number | string;
  caloriesBurned: number;
  exercises: WorkoutExercise[];
};

export default function GymWorkoutDetailScreen({ navigation, route }: any) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const workoutId = String(route?.params?.workoutId || '');
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareVisible, setShareVisible] = useState(false);

  const loadWorkout = async () => {
    if (!workoutId) {
      setError('This workout link is invalid.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await BackendApi.getStrengthWorkout(workoutId);
      setWorkout(response.workout as WorkoutDetail);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load this Gym workout. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadWorkout(); }, [workoutId]);

  const totalSets = useMemo(() => (workout?.exercises || []).reduce((sum, exercise) => sum + (exercise.sets || []).length, 0), [workout]);
  const completedSets = useMemo(() => (workout?.exercises || []).reduce((sum, exercise) => sum + (exercise.sets || []).filter((set) => set.isCompleted).length, 0), [workout]);
  const date = workout?.completedAt ? new Date(workout.completedAt).toLocaleString() : '';
  const duration = Math.floor(Number(workout?.durationSeconds || 0) / 60);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Workout details</Text>
          <Text style={styles.headerSubtitle}>Your saved Gym session</Text>
        </View>
        <TouchableOpacity onPress={() => setShareVisible(true)} disabled={!workout} style={styles.shareHeaderButton} accessibilityRole="button" accessibilityLabel="Share Gym workout">
          <Share2 size={19} color={workout ? Colors.primary : Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={Colors.primary} size="large" style={styles.loader} /> : null}
        {!loading && error ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Workout unavailable</Text>
            <Text style={styles.messageText}>{error}</Text>
            <TouchableOpacity onPress={() => void loadWorkout()} style={styles.retryButton} accessibilityRole="button">
              <RotateCcw size={16} color="#FFFFFF" /><Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && workout ? <>
          <View style={styles.summaryCard}>
            <View style={styles.titleRow}>
              <View style={styles.workoutIcon}><Dumbbell size={22} color={Colors.primary} /></View>
              <View style={styles.titleText}>
                <Text style={styles.workoutName}>{workout.name}</Text>
                {!!date && <Text style={styles.dateText}>{date}</Text>}
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}><Text style={styles.statValue}>{workout.exercises.length}</Text><Text style={styles.statLabel}>Exercises</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{completedSets}/{totalSets}</Text><Text style={styles.statLabel}>Sets done</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{duration} min</Text><Text style={styles.statLabel}>Duration</Text></View>
            </View>
            <View style={styles.volumeRow}>
              <Text style={styles.volumeLabel}>Total work volume</Text>
              <Text style={styles.volumeValue}>{Math.round(Number(workout.totalVolumeKg) || 0).toLocaleString()} kg</Text>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Exercises & sets</Text>
            <Text style={styles.sectionCount}>{totalSets} sets</Text>
          </View>
          {workout.exercises.map((exercise, exerciseIndex) => (
            <View key={exercise.id} style={styles.exerciseCard}>
              <View style={styles.exerciseHeading}>
                <View style={styles.exerciseNumber}><Text style={styles.exerciseNumberText}>{exerciseIndex + 1}</Text></View>
                <View style={styles.exerciseTitleWrap}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMeta}>{String(exercise.primaryMuscle || '').replace(/_/g, ' ')} · {String(exercise.equipment || '').replace(/_/g, ' ')}</Text>
                </View>
                <Text style={styles.exerciseSetCount}>{exercise.sets.length} sets</Text>
              </View>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadingText, styles.setColumn]}>SET</Text>
                <Text style={[styles.tableHeadingText, styles.typeColumn]}>TYPE</Text>
                <Text style={[styles.tableHeadingText, styles.numberColumn]}>KG</Text>
                <Text style={[styles.tableHeadingText, styles.numberColumn]}>REPS</Text>
                <Text style={[styles.tableHeadingText, styles.doneColumn]}>DONE</Text>
              </View>
              {exercise.sets.map((set) => (
                <View key={`${exercise.id}-${set.setIndex}`} style={styles.setRow}>
                  <Text style={[styles.setValue, styles.setColumn]}>{set.setIndex}</Text>
                  <Text style={[styles.setValue, styles.typeColumn]}>{set.setType === 'N' ? 'Normal' : set.setType}</Text>
                  <Text style={[styles.setValue, styles.numberColumn]}>{Number(set.weightKg) || 0}</Text>
                  <Text style={[styles.setValue, styles.numberColumn]}>{set.reps}</Text>
                  <View style={styles.doneColumn}><View style={[styles.statusDot, set.isCompleted ? styles.statusDone : styles.statusPending]} /><Text style={styles.doneText}>{set.isCompleted ? 'Done' : 'Skip'}</Text></View>
                </View>
              ))}
            </View>
          ))}
        </> : null}
      </ScrollView>
      {workout ? <ActivityShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        activityType="Gym workout"
        title={workout.name}
        subtitle={`${date ? new Date(workout.completedAt).toLocaleDateString() : 'AVFIT strength session'}`}
        stats={[
          { label: 'Exercises', value: String(workout.exercises.length) },
          { label: 'Sets completed', value: `${completedSets}/${totalSets}` },
          { label: 'Work volume', value: `${Math.round(Number(workout.totalVolumeKg) || 0)} kg` },
          { label: 'Duration', value: `${duration} min` },
        ]}
        highlights={workout.exercises.map((exercise) => `${exercise.name} · ${exercise.sets.length} sets`)}
        caption={`${workout.name} complete — ${workout.exercises.length} exercises, ${completedSets} sets, ${Math.round(Number(workout.totalVolumeKg) || 0)} kg total work volume. Shared with AVFIT.`}
      /> : null}
    </View>
  );
}

const createStyles = () => ({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { minHeight: 64, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerText: { marginLeft: 10, flex: 1 },
  shareHeaderButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900' as const },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  content: { padding: 16 },
  loader: { marginTop: 60 },
  messageCard: { backgroundColor: Colors.surface, borderColor: Colors.borderSubtle, borderWidth: 1, borderRadius: 18, padding: 18 },
  messageTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900' as const },
  messageText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  retryButton: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' as const },
  summaryCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 20, padding: 16, marginBottom: 22 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  workoutIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: Colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 12 },
  titleText: { flex: 1 },
  workoutName: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' as const },
  dateText: { color: Colors.textSecondary, fontSize: 11, marginTop: 3 },
  statsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 22, paddingVertical: 10 },
  stat: { flex: 1, alignItems: 'center' as const },
  statValue: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' as const },
  statLabel: { color: Colors.textSecondary, fontSize: 10, marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.borderSubtle },
  volumeRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 13, marginTop: 5 },
  volumeLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
  volumeValue: { color: Colors.primary, fontSize: 13, fontWeight: '900' as const },
  sectionHeading: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 10 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900' as const },
  sectionCount: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const },
  exerciseCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 12 },
  exerciseHeading: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12 },
  exerciseNumber: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 9 },
  exerciseNumberText: { color: Colors.primary, fontSize: 12, fontWeight: '900' as const },
  exerciseTitleWrap: { flex: 1 },
  exerciseName: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' as const },
  exerciseMeta: { color: Colors.textSecondary, fontSize: 10, textTransform: 'capitalize' as const, marginTop: 3 },
  exerciseSetCount: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' as const },
  tableHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 32, backgroundColor: Colors.backgroundLight, borderRadius: 9, paddingHorizontal: 6 },
  tableHeadingText: { color: Colors.textMuted, fontSize: 9, fontWeight: '900' as const, textAlign: 'center' as const },
  setColumn: { width: 32, textAlign: 'center' as const },
  typeColumn: { flex: 1, textAlign: 'left' as const },
  numberColumn: { flex: 0.8, textAlign: 'center' as const },
  doneColumn: { width: 52, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  setRow: { minHeight: 38, flexDirection: 'row' as const, alignItems: 'center' as const, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, paddingHorizontal: 6 },
  setValue: { color: Colors.textPrimary, fontSize: 11, fontWeight: '700' as const },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  statusDone: { backgroundColor: Colors.success },
  statusPending: { backgroundColor: Colors.textMuted },
  doneText: { color: Colors.textSecondary, fontSize: 9, fontWeight: '700' as const },
});

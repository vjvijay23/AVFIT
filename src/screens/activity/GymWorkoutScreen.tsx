import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, Check, Clock3, Dumbbell, Plus, Play, Pause, RotateCcw, Save, Search, Trash2, X, Info, ImagePlus } from 'lucide-react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import { useTheme, useThemeStyles } from '../../theme/ThemeContext';
import { Colors } from '../../theme/colors';
import { BackendApi } from '../../services/backendApi';
import { SecureStorage } from '../../services/secureStorage';
import { ExerciseDemo, findExerciseDemo } from '../../services/exerciseDemoApi';

type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'smith_machine' | 'resistance_band' | 'ez_bar' | 'trap_bar' | 'medicine_ball' | 'suspension_trainer' | 'landmine';
type StrengthExercise = { id: string; name: string; equipment: Equipment; primaryMuscle: string; secondaryMuscles?: string[]; description?: string; instructions?: string[]; hasImage?: boolean };
type WorkoutSet = { key: string; weightKg: string; reps: string; completed: boolean; setType: 'N' | 'W' | 'D' | 'F' };
type SelectedExercise = { exercise: StrengthExercise; sets: WorkoutSet[] };
type RecentWorkout = { id: string; name: string; durationSeconds: number; totalVolumeKg: number; completedAt: string };

const EQUIPMENT_OPTIONS: Array<{ id: Equipment; label: string }> = [
  { id: 'barbell', label: 'Barbell' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'machine', label: 'Machine' },
  { id: 'cable', label: 'Cable' },
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'smith_machine', label: 'Smith Machine' },
  { id: 'resistance_band', label: 'Resistance Band' },
  { id: 'ez_bar', label: 'EZ Bar' },
  { id: 'trap_bar', label: 'Trap Bar' },
  { id: 'medicine_ball', label: 'Medicine Ball' },
  { id: 'suspension_trainer', label: 'Suspension Trainer' },
  { id: 'landmine', label: 'Landmine' },
];

const BUILT_IN_EXERCISES: StrengthExercise[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Barbell Back Squat', equipment: 'barbell', primaryMuscle: 'quads' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Barbell Deadlift', equipment: 'barbell', primaryMuscle: 'back' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Barbell Bench Press', equipment: 'barbell', primaryMuscle: 'chest' },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Barbell Overhead Press', equipment: 'barbell', primaryMuscle: 'shoulders' },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Barbell Row', equipment: 'barbell', primaryMuscle: 'back' },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Dumbbell Goblet Squat', equipment: 'dumbbell', primaryMuscle: 'quads' },
  { id: '00000000-0000-4000-8000-000000000007', name: 'Dumbbell Chest Press', equipment: 'dumbbell', primaryMuscle: 'chest' },
  { id: '00000000-0000-4000-8000-000000000008', name: 'Dumbbell Shoulder Press', equipment: 'dumbbell', primaryMuscle: 'shoulders' },
  { id: '00000000-0000-4000-8000-000000000009', name: 'Dumbbell Row', equipment: 'dumbbell', primaryMuscle: 'back' },
  { id: '00000000-0000-4000-8000-000000000010', name: 'Dumbbell Bicep Curl', equipment: 'dumbbell', primaryMuscle: 'biceps' },
  { id: '00000000-0000-4000-8000-000000000011', name: 'Leg Press', equipment: 'machine', primaryMuscle: 'quads' },
  { id: '00000000-0000-4000-8000-000000000012', name: 'Leg Extension', equipment: 'machine', primaryMuscle: 'quads' },
  { id: '00000000-0000-4000-8000-000000000013', name: 'Seated Cable Row', equipment: 'machine', primaryMuscle: 'back' },
  { id: '00000000-0000-4000-8000-000000000014', name: 'Chest Fly Machine', equipment: 'machine', primaryMuscle: 'chest' },
  { id: '00000000-0000-4000-8000-000000000015', name: 'Lat Pulldown', equipment: 'cable', primaryMuscle: 'back' },
  { id: '00000000-0000-4000-8000-000000000016', name: 'Cable Triceps Pushdown', equipment: 'cable', primaryMuscle: 'triceps' },
  { id: '00000000-0000-4000-8000-000000000017', name: 'Cable Face Pull', equipment: 'cable', primaryMuscle: 'shoulders' },
  { id: '00000000-0000-4000-8000-000000000018', name: 'Cable Lateral Raise', equipment: 'cable', primaryMuscle: 'shoulders' },
  { id: '00000000-0000-4000-8000-000000000019', name: 'Push-Up', equipment: 'bodyweight', primaryMuscle: 'chest' },
  { id: '00000000-0000-4000-8000-000000000020', name: 'Pull-Up', equipment: 'bodyweight', primaryMuscle: 'back' },
  { id: '00000000-0000-4000-8000-000000000021', name: 'Bodyweight Squat', equipment: 'bodyweight', primaryMuscle: 'quads' },
  { id: '00000000-0000-4000-8000-000000000022', name: 'Plank', equipment: 'bodyweight', primaryMuscle: 'core' },
  { id: 'offline-kettlebell-swing', name: 'Kettlebell Swing', equipment: 'kettlebell', primaryMuscle: 'glutes' },
  { id: 'offline-kettlebell-goblet-squat', name: 'Kettlebell Goblet Squat', equipment: 'kettlebell', primaryMuscle: 'quads' },
  { id: 'offline-smith-machine-squat', name: 'Smith Machine Squat', equipment: 'smith_machine', primaryMuscle: 'quads' },
  { id: 'offline-smith-machine-bench-press', name: 'Smith Machine Bench Press', equipment: 'smith_machine', primaryMuscle: 'chest' },
  { id: 'offline-band-row', name: 'Resistance Band Row', equipment: 'resistance_band', primaryMuscle: 'back' },
  { id: 'offline-band-pull-apart', name: 'Band Pull-Apart', equipment: 'resistance_band', primaryMuscle: 'shoulders' },
  { id: 'offline-ez-bar-curl', name: 'EZ-Bar Curl', equipment: 'ez_bar', primaryMuscle: 'biceps' },
  { id: 'offline-ez-bar-skull-crusher', name: 'EZ-Bar Skull Crusher', equipment: 'ez_bar', primaryMuscle: 'triceps' },
  { id: 'offline-trap-bar-deadlift', name: 'Trap-Bar Deadlift', equipment: 'trap_bar', primaryMuscle: 'hamstrings' },
  { id: 'offline-trap-bar-carry', name: 'Trap-Bar Farmer Carry', equipment: 'trap_bar', primaryMuscle: 'forearms' },
  { id: 'offline-medicine-ball-slam', name: 'Medicine-Ball Slam', equipment: 'medicine_ball', primaryMuscle: 'full_body' },
  { id: 'offline-medicine-ball-russian-twist', name: 'Medicine-Ball Russian Twist', equipment: 'medicine_ball', primaryMuscle: 'core' },
  { id: 'offline-suspension-row', name: 'Suspension Trainer Row', equipment: 'suspension_trainer', primaryMuscle: 'back' },
  { id: 'offline-suspension-chest-press', name: 'Suspension Trainer Chest Press', equipment: 'suspension_trainer', primaryMuscle: 'chest' },
  { id: 'offline-landmine-press', name: 'Landmine Press', equipment: 'landmine', primaryMuscle: 'shoulders' },
  { id: 'offline-landmine-row', name: 'Landmine Row', equipment: 'landmine', primaryMuscle: 'back' },
];

const MUSCLE_GROUP_ORDER = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];

const makeSet = (index: number): WorkoutSet => ({ key: `${Date.now()}-${index}-${Math.random()}`, weightKg: '', reps: '10', completed: false, setType: 'N' });

function parseRecommendedExercise(line: string): { name: string; sets: number; reps: number } | null {
  const cleaned = String(line || '').replace(/^\s*(?:[•*-]|\d+[.)])\s*/, '').trim();
  if (!cleaned || /warm.?up|cool.?down|stretch|rest|recovery|interval|minute/i.test(cleaned)) return null;
  const prescription = cleaned.match(/\s*[-–—:]?\s*(\d+)\s*(?:sets?\s*(?:of\s*)?)?(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:reps?|repetitions?)?/i);
  const name = (prescription ? cleaned.slice(0, prescription.index) : cleaned)
    .replace(/^exercise\s*\d*\s*:\s*/i, '')
    .replace(/^exercise\s*:\s*/i, '')
    .trim();
  if (!/^exercise\b/i.test(cleaned) && !prescription) return null;
  return {
    name,
    sets: Math.max(1, Math.min(8, Number(prescription?.[1] || 3))),
    reps: Math.max(1, Math.min(100, Number(prescription?.[2] || 10))),
  };
}

function recommendationMuscle(name: string): string | null {
  const value = name.toLowerCase().replace(/[_-]+/g, ' ');
  if (/triceps|pushdown|skull crusher/.test(value)) return 'triceps';
  if (/biceps|curl/.test(value)) return 'biceps';
  if (/chest|bench|floor press|push up|pushup|fly|pec/.test(value)) return 'chest';
  if (/shoulder|overhead press|lateral raise|face pull|arnold/.test(value)) return 'shoulders';
  if (/hamstring|romanian deadlift|leg curl|good morning/.test(value)) return 'hamstrings';
  if (/glute|hip thrust|kickback/.test(value)) return 'glutes';
  if (/quad|squat|lunge|leg press|leg extension|step up/.test(value)) return 'quads';
  if (/back|row|pulldown|pull down|pull up|pullup|deadlift|lat /.test(value)) return 'back';
  if (/calf|calves/.test(value)) return 'calves';
  if (/core|plank|crunch|russian twist/.test(value)) return 'core';
  return null;
}

function recommendationEquipment(name: string): Equipment | null {
  const value = name.toLowerCase().replace(/[_-]+/g, ' ');
  if (/resistance band|banded/.test(value)) return 'resistance_band';
  if (/dumbbell|\bdb\b/.test(value)) return 'dumbbell';
  if (/barbell|\bbb\b/.test(value)) return 'barbell';
  if (/kettlebell/.test(value)) return 'kettlebell';
  if (/smith machine/.test(value)) return 'smith_machine';
  if (/cable/.test(value)) return 'cable';
  if (/machine|pec deck|leg press/.test(value)) return 'machine';
  if (/bodyweight|push up|pushup|pull up|pullup|plank/.test(value)) return 'bodyweight';
  return null;
}

function matchRecommendedExercise(
  suggestion: { name: string },
  catalog: StrengthExercise[],
  usedIds: Set<string>,
): StrengthExercise | undefined {
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = normalized(suggestion.name);
  const available = catalog.filter((item) => !usedIds.has(item.id));
  const exact = available.find((item) => normalized(item.name) === wanted);
  if (exact) return exact;

  // Gemini can return a valid movement under a synonym (for example, "floor
  // press" vs the catalog's "chest press"). Preserve the target muscle and,
  // when named, the equipment instead of leaving the workout empty.
  const muscle = recommendationMuscle(suggestion.name);
  const equipment = recommendationEquipment(suggestion.name);
  const equivalent = available.filter((item) => {
    const sameMuscle = muscle && (
      item.primaryMuscle.toLowerCase() === muscle || item.secondaryMuscles?.some((value) => value.toLowerCase() === muscle)
    );
    const sameEquipment = equipment && item.equipment === equipment;
    return Boolean(sameMuscle && (!equipment || sameEquipment));
  });
  if (equivalent.length) {
    const words = suggestion.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    return equivalent.sort((a, b) => {
      const score = (item: StrengthExercise) => words.reduce((total, word) =>
        total + (item.name.toLowerCase().includes(word) ? 2 : 0), 0);
      return score(b) - score(a);
    })[0];
  }

  // For old or offline catalogs that lack the named equipment, use the same
  // target muscle from the user's available catalog as the final safe fallback.
  return muscle && !equipment ? available.find((item) =>
    item.primaryMuscle.toLowerCase() === muscle || item.secondaryMuscles?.some((value) => value.toLowerCase() === muscle),
  ) : undefined;
}

export default function GymWorkoutScreen({ navigation, route }: any) {
  const styles = useThemeStyles(createStyles);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [startedAt, setStartedAt] = useState(() => new Date());
  const [durationSeconds, setDurationSeconds] = useState(0);
  const initialWorkout = route?.params?.initialWorkout as { name?: string; exercises?: string[] } | undefined;
  const initialPlanApplied = useRef(false);
  const [workoutName, setWorkoutName] = useState(initialWorkout?.name || 'Strength Workout');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [equipmentMenuVisible, setEquipmentMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalog, setCatalog] = useState<StrengthExercise[]>([]);
  const catalogRequest = useRef(0);
  const [selected, setSelected] = useState<SelectedExercise[]>([]);
  const [history, setHistory] = useState<RecentWorkout[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [restEndTime, setRestEndTime] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const [workoutSaved, setWorkoutSaved] = useState(false);
  const [customExerciseVisible, setCustomExerciseVisible] = useState(false);
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, any> | null>(null);
  const [loadingExerciseDetails, setLoadingExerciseDetails] = useState(false);
  const exerciseDetailsRequest = useRef(0);
  const [expandedMuscleGroup, setExpandedMuscleGroup] = useState<string | null>(null);
  const [demoGender, setDemoGender] = useState<'male' | 'female'>('male');
  const [demoVideoPlaying, setDemoVideoPlaying] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [demo, setDemo] = useState<ExerciseDemo | null>(null);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState('');
  const [customSecondary, setCustomSecondary] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [customImage, setCustomImage] = useState<{ base64: string; mime: string } | null>(null);
  const [savingCustomExercise, setSavingCustomExercise] = useState(false);

  useEffect(() => {
    SecureStorage.getItemAsync('avfit_strength_workout_draft')
      .then((raw) => {
        if (!raw || initialWorkout) return;
        const draft = JSON.parse(raw) as { name?: string; startedAt?: string; selected?: SelectedExercise[] };
        if (draft.name) setWorkoutName(draft.name);
        if (draft.startedAt && !Number.isNaN(new Date(draft.startedAt).getTime())) setStartedAt(new Date(draft.startedAt));
        if (Array.isArray(draft.selected)) setSelected(draft.selected);
      })
      .catch(() => undefined)
      .finally(() => setSessionReady(true));
  }, []);

  const loadExercises = useCallback(async () => {
    const requestId = ++catalogRequest.current;
    const selectedEquipment = equipment;
    setLoadingCatalog(true);
    setCatalogError('');
    setCatalog([]);
    try {
      const response = await BackendApi.getStrengthExercises(initialWorkout?.exercises?.length ? undefined : selectedEquipment);
      if (requestId !== catalogRequest.current) return;
      const custom = BackendApi.hasAuthToken()
        ? await BackendApi.getMyStrengthExercises().catch(() => ({ exercises: [] }))
        : { exercises: [] };
      if (requestId !== catalogRequest.current) return;
      // The API is asked to filter, and the client applies the same filter as
      // a guard so a broad or stale response can never leak other equipment.
      const belongsToSelectedEquipment = (exercise: Record<string, any>) =>
        String(exercise.equipment || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === selectedEquipment;
      const allExercises = [...response.exercises, ...custom.exercises] as StrengthExercise[];
      const exercises = initialWorkout?.exercises?.length
        ? allExercises
        : allExercises.filter((exercise) => belongsToSelectedEquipment(exercise as Record<string, any>));
      setCatalog(exercises);
      setCatalogError('');
    } catch (error: any) {
      if (requestId !== catalogRequest.current) return;
      const builtIn = initialWorkout?.exercises?.length
        ? BUILT_IN_EXERCISES
        : BUILT_IN_EXERCISES.filter((exercise) => exercise.equipment === selectedEquipment);
      setCatalog(builtIn);
      setCatalogError(error?.message?.includes('(404)')
        ? 'This server does not have the Gym exercise API yet. Showing built-in exercises; workouts stay on this device until Gym sync is available.'
        : 'Showing built-in exercises because the Gym service could not be reached. Workouts stay on this device until syncing is available.');
    } finally {
      if (requestId === catalogRequest.current) setLoadingCatalog(false);
    }
  }, [equipment, initialWorkout?.exercises?.length]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await BackendApi.getStrengthWorkouts(5);
      setHistory(response.workouts as RecentWorkout[]);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadExercises();
  }, [loadExercises]);

  useEffect(() => {
    if (!initialWorkout?.exercises?.length || !sessionReady || loadingCatalog || initialPlanApplied.current) return;
    initialPlanApplied.current = true;
    const suggestions = initialWorkout.exercises.map(parseRecommendedExercise).filter(Boolean) as Array<{ name: string; sets: number; reps: number }>;
    const usedIds = new Set<string>();
    const matched = suggestions.flatMap((suggestion) => {
      const exercise = matchRecommendedExercise(suggestion, catalog, usedIds);
      if (!exercise) return [];
      usedIds.add(exercise.id);
      return [{
        exercise,
        sets: Array.from({ length: suggestion.sets }, (_, index) => ({ ...makeSet(index + 1), reps: String(suggestion.reps) })),
      }];
    });
    setSelected(matched);
    if (suggestions.length && matched.length < suggestions.length) {
      const missingCount = suggestions.length - matched.length;
      Alert.alert('Workout ready', `${matched.length} recommended exercises were added. ${missingCount} could not be matched to the exercise library and can be added manually.`);
    }
  }, [catalog, initialWorkout, loadingCatalog, sessionReady]);

  useEffect(() => {
    void loadHistory();
    if (!sessionReady) return;
    const timer = setInterval(() => setDurationSeconds(Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [loadHistory, sessionReady, startedAt]);

  useEffect(() => {
    if (!sessionReady || saving || workoutSaved) return;
    const timeout = setTimeout(() => {
      void SecureStorage.setItemAsync('avfit_strength_workout_draft', JSON.stringify({
        name: workoutName,
        startedAt: startedAt.toISOString(),
        selected,
      })).catch(() => undefined);
    }, 350);
    return () => clearTimeout(timeout);
  }, [selected, sessionReady, saving, startedAt, workoutName, workoutSaved]);

  useEffect(() => {
    if (!restEndTime) {
      setRestSeconds(0);
      return;
    }
    const updateRest = () => {
      const remaining = Math.max(0, Math.ceil((restEndTime - Date.now()) / 1000));
      setRestSeconds(remaining);
      if (remaining === 0) setRestEndTime(null);
    };
    updateRest();
    const timer = setInterval(updateRest, 500);
    return () => clearInterval(timer);
  }, [restEndTime]);

  const totalCompletedSets = useMemo(() => selected.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0), [selected]);
  const totalVolumeKg = useMemo(() => selected.reduce((sum, item) => sum + item.sets.reduce((setTotal, set) => {
    if (!set.completed || set.setType === 'W') return setTotal;
    return setTotal + (Number(set.weightKg) || 0) * (Number(set.reps) || 0);
  }, 0), 0), [selected]);
  const groupedCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const groups = new Map<string, StrengthExercise[]>();
    for (const exercise of catalog) {
      if (String(exercise.equipment || '').trim().toLowerCase().replace(/[\s-]+/g, '_') !== equipment) continue;
      const muscle = exercise.primaryMuscle.toLowerCase();
      const matchesSearch = !query || exercise.name.toLowerCase().includes(query)
        || muscle.replace(/_/g, ' ').includes(query);
      if (matchesSearch) groups.set(muscle, [...(groups.get(muscle) || []), exercise]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = MUSCLE_GROUP_ORDER.indexOf(a);
      const bi = MUSCLE_GROUP_ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
    });
  }, [catalog, equipment, searchQuery]);
  const activeMuscleGroup = groupedCatalog.find(([muscle]) => muscle === expandedMuscleGroup);

  const addExercise = async (exercise: StrengthExercise) => {
    if (selected.some((item) => item.exercise.id === exercise.id)) {
      Alert.alert('Already added', 'This exercise is already in your workout.');
      return;
    }
    let previousSets: Array<{ weightKg: number; reps: number }> = [];
    try {
      previousSets = (await BackendApi.getStrengthExerciseHistory(exercise.id)).sets;
    } catch {
      // A first workout or a temporarily unavailable history should not block logging.
    }
    const setCount = Math.max(3, previousSets.length);
    const sets = Array.from({ length: setCount }, (_, index) => {
      const previous = previousSets[index];
      const set = makeSet(index + 1);
      return previous ? { ...set, weightKg: String(Number(previous.weightKg) || 0), reps: String(previous.reps) } : set;
    });
    setSelected((items) => items.some((item) => item.exercise.id === exercise.id) ? items : [...items, { exercise, sets }]);
  };

  const chooseExerciseImage = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, includeBase64: true, maxWidth: 512, maxHeight: 512, quality: 0.6 });
    if (result.didCancel) return;
    if (result.errorCode || !result.assets?.[0]?.base64) {
      Alert.alert('Could not load image', result.errorMessage || 'Choose another image and try again.');
      return;
    }
    setCustomImage({ base64: result.assets[0].base64, mime: result.assets[0].type || 'image/jpeg' });
  };

  const saveCustomExercise = async () => {
    const instructions = customInstructions.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (customName.trim().length < 2 || customMuscle.trim().length < 2 || instructions.length === 0) {
      Alert.alert('Complete exercise details', 'Add a name, primary muscle group, and at least one instruction.');
      return;
    }
    setSavingCustomExercise(true);
    try {
      const result = await BackendApi.createStrengthExercise({
        name: customName.trim(),
        equipment,
        primaryMuscle: customMuscle.trim(),
        secondaryMuscles: customSecondary.split(',').map((muscle) => muscle.trim()).filter(Boolean),
        description: customDescription.trim(),
        instructions,
        ...(customImage ? { imageBase64: customImage.base64, imageMime: customImage.mime } : {}),
      });
      setCatalog((items) => [result.exercise as StrengthExercise, ...items]);
      setCustomExerciseVisible(false);
      setCustomName(''); setCustomMuscle(''); setCustomSecondary(''); setCustomDescription(''); setCustomInstructions(''); setCustomImage(null);
      Alert.alert('Exercise saved', 'Your custom exercise is now in your personal library and can be added to a workout.');
    } catch (error: any) {
      Alert.alert('Could not save exercise', error?.message || 'Check your connection and try again.');
    } finally { setSavingCustomExercise(false); }
  };

  const showExerciseDetails = async (exercise: StrengthExercise) => {
    const requestId = ++exerciseDetailsRequest.current;
    setDemo(null);
    setDemoError('');
    setDemoGender('male');
    setDemoVideoPlaying(false);
    setLoadingExerciseDetails(true);
    setExerciseDetails({ name: exercise.name, primaryMuscle: exercise.primaryMuscle, equipment: exercise.equipment, secondaryMuscles: exercise.secondaryMuscles || [], description: exercise.description || '', instructions: exercise.instructions || [] });
    try {
      const guide = await findExerciseDemo(exercise.name);
      if (requestId !== exerciseDetailsRequest.current) return;
      if (guide) {
        setDemo(guide);
        setExerciseDetails((current: any) => current ? {
          ...current,
          description: guide.description || current.description,
          secondaryMuscles: current.secondaryMuscles?.length ? current.secondaryMuscles : [],
          instructions: guide.instructions.length ? guide.instructions : current.instructions,
        } : current);
      } else setDemoError('No demo video was found for this exercise.');
    } catch (error: any) {
      if (requestId !== exerciseDetailsRequest.current) return;
      setDemoError(error?.name === 'AbortError' ? 'Demo guide timed out. You can still use the exercise details below.' : 'Demo video is temporarily unavailable. You can still use the exercise details below.');
    } finally { if (requestId === exerciseDetailsRequest.current) setLoadingExerciseDetails(false); }
  };

  const closeExerciseDetails = () => {
    exerciseDetailsRequest.current += 1;
    setLoadingExerciseDetails(false);
    setDemoVideoPlaying(false);
    setExerciseDetails(null);
  };

  const updateSet = (exerciseId: string, setKey: string, update: Partial<WorkoutSet>) => {
    setSelected((items) => items.map((item) => item.exercise.id !== exerciseId ? item : {
      ...item,
      sets: item.sets.map((set) => set.key === setKey ? { ...set, ...update } : set),
    }));
  };

  const toggleSetComplete = (exerciseId: string, set: WorkoutSet) => {
    const completed = !set.completed;
    updateSet(exerciseId, set.key, { completed });
    if (completed) setRestEndTime(Date.now() + 90_000);
  };

  const addSet = (exerciseId: string) => {
    setSelected((items) => items.map((item) => item.exercise.id !== exerciseId ? item : {
      ...item,
      sets: [...item.sets, makeSet(item.sets.length + 1)],
    }));
  };

  const finishWorkout = async () => {
    if (!workoutName.trim()) {
      Alert.alert('Add a workout name', 'Enter a name before saving your workout.');
      return;
    }
    if (selected.length === 0 || totalCompletedSets === 0) {
      Alert.alert('Complete a set first', 'Add an exercise and mark at least one set complete before saving.');
      return;
    }
    if (durationSeconds < 30) {
      Alert.alert('Workout is too short to save', 'Complete at least 30 seconds of workout time, then try again.');
      return;
    }

    setSaving(true);
    try {
      const result = await BackendApi.saveStrengthWorkout({
        name: workoutName.trim(),
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        exercises: selected.map((item) => ({
          exerciseId: item.exercise.id,
          sets: item.sets.map((set) => ({
            setType: set.setType,
            weightKg: Math.max(0, Number(set.weightKg) || 0),
            reps: Math.max(0, Math.floor(Number(set.reps) || 0)),
            isCompleted: set.completed,
          })),
        })),
      });
      setWorkoutSaved(true);
      await SecureStorage.deleteItemAsync('avfit_strength_workout_draft').catch(() => undefined);
      setHistory((items) => [result.workout as RecentWorkout, ...items].slice(0, 5));
      const recordText = result.personalRecords.length
        ? `\n\nNew personal records: ${result.personalRecords.map((record) => `${record.exercise} — ${record.metric}`).join(', ')}`
        : '';
      Alert.alert(
        'Workout saved',
        `${result.workout.name}\n${totalCompletedSets} sets · ${Math.round(totalVolumeKg).toLocaleString()} kg volume${recordText}`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (error: any) {
      Alert.alert('Workout kept on this device', 'The server could not save this workout yet. Your active workout draft is still stored on this device. Try saving again when the AVFIT backend is available.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 14) }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Gym Workout</Text>
          <Text style={styles.headerSubtitle}>Log your strength training</Text>
        </View>
        <View style={styles.durationBadge}><Clock3 size={14} color={Colors.primary} /><Text style={styles.durationText}>{formatClock(durationSeconds)}</Text></View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        <View style={styles.nameCard}>
          <View style={styles.sectionTitleRow}>
          <View style={styles.gymIcon}><Dumbbell size={18} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Session name</Text>
            </View>
          </View>
          <TextInput value={workoutName} onChangeText={setWorkoutName} style={styles.nameInput} placeholder="Strength workout" placeholderTextColor={Colors.textMuted} maxLength={80} />
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Choose equipment</Text><Text style={styles.helperText}>Filter the exercise library</Text></View>
        </View>
        <TouchableOpacity
          onPress={() => setEquipmentMenuVisible(true)}
          style={styles.equipmentDropdown}
          accessibilityRole="button"
          accessibilityLabel={`Equipment: ${EQUIPMENT_OPTIONS.find((option) => option.id === equipment)?.label}. Open equipment list.`}
          accessibilityState={{ expanded: equipmentMenuVisible }}
        >
          <Text style={styles.equipmentDropdownText}>{EQUIPMENT_OPTIONS.find((option) => option.id === equipment)?.label}</Text>
          <ChevronDown size={19} color={Colors.textSecondary} />
        </TouchableOpacity>

        <Modal
          transparent
          visible={equipmentMenuVisible}
          animationType="fade"
          onRequestClose={() => setEquipmentMenuVisible(false)}
          statusBarTranslucent
        >
          <TouchableOpacity activeOpacity={1} style={styles.equipmentModalBackdrop} onPress={() => setEquipmentMenuVisible(false)}>
            <View style={styles.equipmentMenu}>
              <Text style={styles.equipmentMenuTitle}>Choose equipment</Text>
              <ScrollView style={styles.equipmentOptionsScroll} showsVerticalScrollIndicator>
              {EQUIPMENT_OPTIONS.map((option) => {
                const active = equipment === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => {
                      setEquipment(option.id);
                      setEquipmentMenuVisible(false);
                    }}
                    style={[styles.equipmentOption, active && styles.equipmentOptionActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.equipmentOptionText, active && styles.equipmentOptionTextActive]}>{option.label}</Text>
                    {active && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal transparent visible={customExerciseVisible} animationType="slide" onRequestClose={() => setCustomExerciseVisible(false)} statusBarTranslucent>
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <View style={styles.dialogHeader}>
                <View style={{ flex: 1 }}><Text style={styles.dialogTitle}>Create exercise</Text><Text style={styles.helperText}>Saved to your account and available in your library.</Text></View>
                <TouchableOpacity onPress={() => setCustomExerciseVisible(false)} style={styles.dialogClose} accessibilityRole="button" accessibilityLabel="Close custom exercise form"><X size={19} color={Colors.textSecondary} /></TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput value={customName} onChangeText={setCustomName} style={styles.customInput} placeholder="e.g. Single-arm floor press" placeholderTextColor={Colors.textMuted} maxLength={80} />
                <Text style={styles.fieldLabel}>Equipment</Text>
                <Text style={styles.selectedEquipment}>{EQUIPMENT_OPTIONS.find((option) => option.id === equipment)?.label}</Text>
                <Text style={styles.fieldLabel}>Primary muscle group</Text>
                <TextInput value={customMuscle} onChangeText={setCustomMuscle} style={styles.customInput} placeholder="e.g. chest" placeholderTextColor={Colors.textMuted} maxLength={40} autoCapitalize="none" />
                <Text style={styles.fieldLabel}>Secondary muscles (optional)</Text>
                <TextInput value={customSecondary} onChangeText={setCustomSecondary} style={styles.customInput} placeholder="Comma-separated, e.g. triceps, shoulders" placeholderTextColor={Colors.textMuted} maxLength={240} autoCapitalize="none" />
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput value={customDescription} onChangeText={setCustomDescription} style={[styles.customInput, styles.multilineInput]} placeholder="What is this exercise for?" placeholderTextColor={Colors.textMuted} maxLength={500} multiline />
                <Text style={styles.fieldLabel}>Instructions (one step per line)</Text>
                <TextInput value={customInstructions} onChangeText={setCustomInstructions} style={[styles.customInput, styles.multilineInput]} placeholder={'1. Set your position\n2. Perform the movement with control'} placeholderTextColor={Colors.textMuted} maxLength={1600} multiline />
                <TouchableOpacity style={styles.imagePickerButton} onPress={() => void chooseExerciseImage()} accessibilityRole="button">
                  {customImage ? <Image source={{ uri: `data:${customImage.mime};base64,${customImage.base64}` }} style={styles.imagePreview} /> : <ImagePlus size={18} color={Colors.primary} />}
                  <Text style={styles.imagePickerText}>{customImage ? 'Change exercise image' : 'Add exercise image (optional)'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveCustomButton, savingCustomExercise && { opacity: 0.6 }]} onPress={() => void saveCustomExercise()} disabled={savingCustomExercise} accessibilityRole="button">
                  {savingCustomExercise ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={17} color="#FFFFFF" /><Text style={styles.saveCustomText}>Save to my library</Text></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal transparent visible={!!exerciseDetails} animationType="fade" onRequestClose={closeExerciseDetails} statusBarTranslucent>
          <View style={styles.dialogBackdrop}>
            <View style={styles.detailsCard}>
              <View style={styles.dialogHeader}>
                <View style={{ flex: 1 }}><Text style={styles.dialogTitle}>{exerciseDetails?.name}</Text><Text style={styles.helperText}>{loadingExerciseDetails ? 'Finding demo video and coaching tips…' : 'Exercise guide'}</Text></View>
                <TouchableOpacity onPress={closeExerciseDetails} style={styles.dialogClose} accessibilityRole="button" accessibilityLabel="Close exercise details"><X size={19} color={Colors.textSecondary} /></TouchableOpacity>
              </View>
              {!!exerciseDetails?.imageBase64 && <Image source={{ uri: `data:${exerciseDetails.imageMime || 'image/jpeg'};base64,${exerciseDetails.imageBase64}` }} style={styles.detailsImage} resizeMode="cover" />}
              <ScrollView showsVerticalScrollIndicator={false}>
                {!!demo?.videos?.[demoGender] && <View style={styles.demoVideoCard}>
                  <View style={styles.demoVideoHeader}><Text style={styles.fieldLabel}>DEMO VIDEO</Text><View style={styles.demoGenderSwitch}>{(['male', 'female'] as const).map((gender) => <TouchableOpacity key={gender} onPress={() => { setDemoGender(gender); setDemoVideoPlaying(false); }} style={[styles.demoGenderOption, demoGender === gender && styles.demoGenderOptionActive]} accessibilityRole="button" accessibilityState={{ selected: demoGender === gender }}><Text style={[styles.demoGenderText, demoGender === gender && styles.demoGenderTextActive]}>{gender === 'male' ? 'Male' : 'Female'}</Text></TouchableOpacity>)}</View></View>
                  {demoVideoPlaying ? <Video
                    key={`${demo.id}-${demoGender}`}
                    source={{ uri: demo.videos[demoGender]! }}
                    style={styles.demoVideo}
                    controls
                    paused={false}
                    resizeMode="contain"
                    poster={demo.thumbnails?.[demoGender] || demo.thumbnails?.male}
                    posterResizeMode="cover"
                    onEnd={() => setDemoVideoPlaying(false)}
                    onError={() => { setDemoVideoPlaying(false); setDemoError('The exercise demo could not be played. Please try again.'); }}
                  /> : <>
                    {!!(demo.thumbnails?.[demoGender] || demo.thumbnails?.male) && <Image source={{ uri: demo.thumbnails?.[demoGender] || demo.thumbnails?.male }} style={styles.demoVideo} resizeMode="cover" />}
                    <TouchableOpacity style={styles.demoPlayButton} onPress={() => { setDemoError(''); setDemoVideoPlaying(true); }} accessibilityRole="button" accessibilityLabel={`Play ${demoGender} demo video in AVFIT for ${exerciseDetails?.name}`}><Play size={17} color="#FFFFFF" fill="#FFFFFF" /><Text style={styles.demoPlayText}>Play demo in AVFIT</Text></TouchableOpacity>
                  </>}
                  {demoVideoPlaying && <TouchableOpacity style={styles.demoPlayButton} onPress={() => setDemoVideoPlaying(false)} accessibilityRole="button" accessibilityLabel="Stop exercise demo"><Pause size={17} color="#FFFFFF" fill="#FFFFFF" /><Text style={styles.demoPlayText}>Stop demo</Text></TouchableOpacity>}
                  {!!demoError && <Text style={styles.demoErrorText}>{demoError}</Text>}
                </View>}
                {loadingExerciseDetails && !demo ? <View style={styles.demoLoading}><ActivityIndicator size="small" color={Colors.primary} /><Text style={styles.helperText}>Loading demo media…</Text></View> : null}
                {!!demoError && !demo?.videos?.[demoGender] && <Text style={styles.demoErrorText}>{demoError}</Text>}
                <Text style={styles.detailsMeta}>{String(exerciseDetails?.primaryMuscle || '').replace(/_/g, ' ')} · {EQUIPMENT_OPTIONS.find((option) => option.id === exerciseDetails?.equipment)?.label || exerciseDetails?.equipment}</Text>
                {!!exerciseDetails?.secondaryMuscles?.length && <Text style={styles.detailsBody}><Text style={styles.detailsStrong}>Also works: </Text>{exerciseDetails.secondaryMuscles.map((item: string) => item.replace(/_/g, ' ')).join(', ')}</Text>}
                {!!exerciseDetails?.description && <Text style={styles.detailsBody}>{exerciseDetails.description}</Text>}
                {!!exerciseDetails?.instructions?.length && <View style={styles.instructionsBlock}><Text style={styles.fieldLabel}>How to perform</Text>{exerciseDetails.instructions.map((step: string, index: number) => <Text key={`${index}-${step}`} style={styles.instructionStep}>{index + 1}.  {step}</Text>)}</View>}
                {!!demo?.formCues?.length && <View style={styles.instructionsBlock}><Text style={styles.fieldLabel}>Form cues</Text>{demo.formCues.map((cue, index) => <Text key={`cue-${index}`} style={styles.instructionStep}>•  {cue}</Text>)}</View>}
                {!!demo?.commonMistakes?.length && <View style={styles.instructionsBlock}><Text style={styles.fieldLabel}>Avoid these mistakes</Text>{demo.commonMistakes.map((mistake, index) => <Text key={`mistake-${index}`} style={styles.instructionStep}>•  {mistake}</Text>)}</View>}
                {!!demo?.breathing && <Text style={styles.detailsBody}><Text style={styles.detailsStrong}>Breathing: </Text>{demo.breathing}</Text>}
              </ScrollView>
              <TouchableOpacity style={styles.detailsDoneButton} onPress={closeExerciseDetails}><Text style={styles.saveCustomText}>Done</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Exercise library</Text><Text style={styles.helperText}>Tap + to add an exercise to this session</Text></View>
          <View style={styles.libraryTools}>
            <TouchableOpacity onPress={() => {
              if (!BackendApi.hasAuthToken()) {
                Alert.alert('Sign in required', 'Sign in to save custom exercises to your personal library.');
                return;
              }
              setCustomExerciseVisible(true);
            }} style={styles.customButton} accessibilityRole="button"><Plus size={15} color={Colors.primary} /><Text style={styles.customButtonText}>Custom</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void loadExercises()} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh exercises"><RotateCcw size={16} color={Colors.primary} /></TouchableOpacity>
          </View>
        </View>
        {loadingCatalog ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} /> : null}
        {!!catalogError && <TouchableOpacity onPress={() => void loadExercises()} style={styles.noticeCard}><Text style={styles.noticeText}>{catalogError} Tap to retry.</Text></TouchableOpacity>}
        <View style={styles.searchBox}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} style={styles.searchInput} placeholder="Search exercise or muscle group" placeholderTextColor={Colors.textMuted} returnKeyType="search" accessibilityLabel="Search the exercise library" />
          {!!searchQuery && <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Clear exercise search"><X size={17} color={Colors.textSecondary} /></TouchableOpacity>}
        </View>
        {!loadingCatalog && groupedCatalog.length === 0 ? <Text style={styles.helperText}>{catalog.length ? 'No exercises match your search.' : 'No exercises found for this equipment.'}</Text> : !loadingCatalog ? (
          <View style={styles.libraryCard}>
            <Text style={styles.focusHeading}>Body focus area</Text>
            <Text style={styles.focusSubheading}>Choose a muscle group to explore</Text>
            <View style={styles.muscleGrid}>
              {groupedCatalog.map(([muscle, exercises]) => {
                const active = expandedMuscleGroup === muscle;
                return <TouchableOpacity key={muscle} style={[styles.muscleTile, active && styles.muscleTileActive]} onPress={() => setExpandedMuscleGroup(active ? null : muscle)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <View style={[styles.muscleTileIcon, active && styles.muscleTileIconActive]}><Dumbbell size={17} color={active ? Colors.textLight : Colors.primary} /></View>
                  <Text numberOfLines={1} style={[styles.muscleTileTitle, active && styles.muscleTileTitleActive]}>{muscle.replace(/_/g, ' ')}</Text>
                  <Text style={[styles.muscleTileCount, active && styles.muscleTileTitleActive]}>{exercises.length} {exercises.length === 1 ? 'move' : 'moves'}</Text>
                </TouchableOpacity>;
              })}
            </View>
            {activeMuscleGroup ? <View style={styles.focusExercises}>
              {activeMuscleGroup[1].map((exercise, index, exercises) => {
                const alreadyAdded = selected.some((item) => item.exercise.id === exercise.id);
                const equipmentLabel = EQUIPMENT_OPTIONS.find((option) => option.id === exercise.equipment)?.label || exercise.equipment;
                return <View key={exercise.id} style={[styles.libraryRow, index === exercises.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.exerciseIcon}><Dumbbell size={15} color={Colors.primary} /></View>
                  <View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.exerciseMeta}>{expandedMuscleGroup.replace(/_/g, ' ')} · {equipmentLabel}</Text></View>
                  <TouchableOpacity style={styles.infoButton} onPress={() => void showExerciseDetails(exercise)} accessibilityRole="button" accessibilityLabel={`Details for ${exercise.name}`}><Info size={17} color={Colors.primary} /></TouchableOpacity>
                  <TouchableOpacity style={[styles.addButton, alreadyAdded && styles.addButtonDisabled]} disabled={alreadyAdded} onPress={() => addExercise(exercise)} accessibilityRole="button" accessibilityLabel={`Add ${exercise.name}`}>
                    {alreadyAdded ? <Check size={17} color={Colors.primary} /> : <Plus size={18} color="#FFFFFF" />}
                  </TouchableOpacity>
                </View>;
              })}
            </View> : <View style={styles.focusEmpty}><Text style={styles.focusEmptyText}>Pick a focus area to see exercises for this equipment.</Text></View>}
          </View>
        ) : null}

        {selected.length > 0 && <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>This workout</Text><Text style={styles.helperText}>{selected.length} exercises · {totalCompletedSets} completed sets · {Math.round(totalVolumeKg).toLocaleString()} kg volume</Text></View></View>}
        {selected.map((item, exerciseIndex) => (
          <View key={item.exercise.id} style={styles.exerciseCard}>
            <View style={styles.exerciseCardHeader}>
              <View style={styles.exerciseIcon}><Dumbbell size={15} color={Colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.exerciseName}>{item.exercise.name}</Text><Text style={styles.exerciseMeta}>{item.exercise.primaryMuscle}</Text></View>
              <TouchableOpacity onPress={() => setSelected((items) => items.filter((entry) => entry.exercise.id !== item.exercise.id))} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Remove ${item.exercise.name}`}><Trash2 size={17} color={Colors.danger} /></TouchableOpacity>
            </View>
            <View style={styles.tableHeader}><Text style={[styles.tableHeaderText, { width: 46 }]}>SET</Text><Text style={[styles.tableHeaderText, { flex: 1 }]}>KG</Text><Text style={[styles.tableHeaderText, { flex: 1 }]}>REPS</Text><Text style={[styles.tableHeaderText, { width: 42 }]}>DONE</Text></View>
            {item.sets.map((set, index) => (
              <View key={set.key} style={[styles.setRow, set.completed && styles.setRowComplete]}>
                <TouchableOpacity
                  style={styles.setTypeButton}
                  onPress={() => {
                    const types: WorkoutSet['setType'][] = ['N', 'W', 'D', 'F'];
                    updateSet(item.exercise.id, set.key, { setType: types[(types.indexOf(set.setType) + 1) % types.length] });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${index + 1} type ${set.setType}. Tap to change.`}
                >
                  <Text style={[styles.setIndex, set.setType !== 'N' && styles.setTypeText]}>{set.setType === 'N' ? index + 1 : set.setType}</Text>
                </TouchableOpacity>
                <TextInput value={set.weightKg} onChangeText={(value) => updateSet(item.exercise.id, set.key, { weightKg: value.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textMuted} style={styles.setInput} accessibilityLabel={`${item.exercise.name}, set ${index + 1}, weight in kilograms`} />
                <TextInput value={set.reps} onChangeText={(value) => updateSet(item.exercise.id, set.key, { reps: value.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="10" placeholderTextColor={Colors.textMuted} style={styles.setInput} accessibilityLabel={`${item.exercise.name}, set ${index + 1}, repetitions`} />
                <TouchableOpacity onPress={() => toggleSetComplete(item.exercise.id, set)} style={[styles.completeSetButton, set.completed && styles.completeSetButtonActive]} accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }} accessibilityLabel={`Complete set ${index + 1}`}>
                  {set.completed && <Check size={16} color="#03130D" />}
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(item.exercise.id)} accessibilityRole="button"><Plus size={15} color={Colors.primary} /><Text style={styles.addSetText}>Add set</Text></TouchableOpacity>
          </View>
        ))}

        {restSeconds > 0 && <View style={styles.restCard}>
          <Clock3 size={18} color={Colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}><Text style={styles.restTitle}>Rest timer</Text><Text style={styles.restSub}>{formatClock(restSeconds)} remaining</Text></View>
          <TouchableOpacity style={styles.skipButton} onPress={() => setRestEndTime(null)}><Text style={styles.skipText}>Skip</Text></TouchableOpacity>
          <TouchableOpacity style={styles.plusButton} onPress={() => setRestEndTime((restEndTime || Date.now()) + 15_000)}><Text style={styles.plusText}>+15s</Text></TouchableOpacity>
        </View>}

        {history.length > 0 && <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent gym workouts</Text>
          {history.slice(0, 3).map((workout) => <TouchableOpacity key={workout.id} style={styles.historyRow} onPress={() => navigation.navigate('GymWorkoutDetail', { workoutId: workout.id })} accessibilityRole="button" accessibilityLabel={`Open ${workout.name} workout details`}><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{workout.name}</Text><Text style={styles.exerciseMeta}>{formatDate(workout.completedAt)} · {Math.round(workout.durationSeconds / 60)} min</Text></View><Text style={styles.volumeText}>{Math.round(Number(workout.totalVolumeKg) || 0).toLocaleString()} kg</Text></TouchableOpacity>)}
        </View>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={[styles.finishButton, (saving || selected.length === 0) && styles.finishButtonDisabled]} onPress={() => void finishWorkout()} disabled={saving || selected.length === 0} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={18} color="#FFFFFF" /><Text style={styles.finishButtonText}>Finish & Save Workout</Text></>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${mins}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

const createStyles = () => ({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: Colors.surface },
  headerTitleWrap: { flex: 1, marginLeft: 10 },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' as const },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  durationBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: Colors.surface, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8 },
  durationText: { color: Colors.textPrimary, fontWeight: '800' as const, fontVariant: ['tabular-nums'] as any },
  content: { padding: 16 },
  nameCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 20 },
  sectionTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  gymIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: Colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 10 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' as const },
  helperText: { color: Colors.textSecondary, fontSize: 11, marginTop: 3 },
  nameInput: { height: 46, marginTop: 14, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 13, color: Colors.textPrimary, fontSize: 14, fontWeight: '700' as const },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 10, marginTop: 4 },
  equipmentDropdown: { height: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface, marginBottom: 17 },
  equipmentDropdownText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' as const },
  equipmentModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center' as const, padding: 24 },
  equipmentMenu: { backgroundColor: Colors.surface, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: Colors.borderSubtle, maxHeight: '72%' as const },
  equipmentOptionsScroll: { flexShrink: 1 },
  equipmentMenuTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' as const, marginBottom: 8, paddingHorizontal: 4 },
  equipmentOption: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 12, borderRadius: 12 },
  equipmentOptionActive: { backgroundColor: Colors.primarySoft },
  equipmentOptionText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' as const },
  equipmentOptionTextActive: { color: Colors.textPrimary, fontWeight: '900' as const },
  refreshButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  libraryTools: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7 },
  customButton: { minHeight: 36, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 10, borderRadius: 18, backgroundColor: Colors.primarySoft },
  customButtonText: { color: Colors.primary, fontSize: 11, fontWeight: '900' as const },
  infoButton: { width: 32, height: 32, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 4 },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center' as const, padding: 18 },
  dialogCard: { maxHeight: '90%' as const, backgroundColor: Colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle },
  detailsCard: { maxHeight: '82%' as const, backgroundColor: Colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: Colors.borderSubtle },
  dialogHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 14 },
  dialogTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '900' as const },
  dialogClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 10 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '900' as const, marginTop: 13, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  customInput: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.background, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 13, fontWeight: '600' as const },
  multilineInput: { minHeight: 78, textAlignVertical: 'top' as const },
  selectedEquipment: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' as const, paddingVertical: 8 },
  imagePickerButton: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, marginTop: 15, borderRadius: 13, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.primarySoft },
  imagePreview: { width: 32, height: 32, borderRadius: 8 },
  imagePickerText: { color: Colors.primary, fontSize: 12, fontWeight: '800' as const },
  saveCustomButton: { minHeight: 50, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, marginTop: 14, marginBottom: 4, borderRadius: 14, backgroundColor: Colors.primary },
  saveCustomText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const },
  detailsImage: { width: '100%' as const, height: 190, borderRadius: 15, marginBottom: 12, backgroundColor: Colors.background },
  demoVideoCard: { marginBottom: 13, padding: 10, borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderSubtle },
  demoVideoHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 8 },
  demoGenderSwitch: { flexDirection: 'row' as const, padding: 3, borderRadius: 12, backgroundColor: Colors.surface },
  demoGenderOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  demoGenderOptionActive: { backgroundColor: Colors.primary },
  demoGenderText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800' as const },
  demoGenderTextActive: { color: '#FFFFFF' },
  demoVideo: { width: '100%' as const, height: 170, borderRadius: 12, backgroundColor: Colors.surface },
  demoPlayButton: { minHeight: 42, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, marginTop: 8, borderRadius: 12, backgroundColor: Colors.primary },
  demoPlayText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' as const },
  demoLoading: { minHeight: 52, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 9 },
  demoErrorText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16, marginVertical: 5 },
  detailsMeta: { color: Colors.primary, fontSize: 12, fontWeight: '900' as const, textTransform: 'capitalize' as const, marginBottom: 10 },
  detailsBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 10 },
  detailsStrong: { color: Colors.textPrimary, fontWeight: '900' as const },
  instructionsBlock: { marginBottom: 12 },
  instructionStep: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 5 },
  detailsDoneButton: { minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 13, backgroundColor: Colors.primary, marginTop: 8 },
  libraryCard: { backgroundColor: Colors.surface, borderRadius: 16, paddingHorizontal: 13, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 20 },
  focusHeading: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' as const, marginTop: 15 },
  focusSubheading: { color: Colors.textSecondary, fontSize: 11, marginTop: 3, marginBottom: 12 },
  muscleGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 9 },
  muscleTile: { width: '48%' as const, minHeight: 92, borderRadius: 16, padding: 11, backgroundColor: Colors.backgroundLight, borderWidth: 1, borderColor: Colors.borderSubtle },
  muscleTileActive: { backgroundColor: Colors.primarySoft, borderColor: Colors.primary },
  muscleTileIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 8 },
  muscleTileIconActive: { backgroundColor: Colors.primary },
  muscleTileTitle: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900' as const, textTransform: 'capitalize' as const },
  muscleTileTitleActive: { color: Colors.primary },
  muscleTileCount: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700' as const, marginTop: 3 },
  focusExercises: { marginTop: 8, paddingHorizontal: 8, borderRadius: 15, backgroundColor: Colors.backgroundLight },
  focusEmpty: { marginTop: 10, marginBottom: 2, padding: 13, borderRadius: 14, backgroundColor: Colors.backgroundLight },
  focusEmptyText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16 },
  libraryRow: { minHeight: 59, flexDirection: 'row' as const, alignItems: 'center' as const, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  muscleGroupHeader: { minHeight: 50, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, paddingHorizontal: 5, marginTop: 5 },
  muscleGroupHeading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9 },
  muscleGroupTitle: { color: Colors.primary, fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  muscleGroupCount: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800' as const, backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' as const },
  searchBox: { minHeight: 46, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, paddingHorizontal: 13, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 13, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 13, fontWeight: '600' as const, paddingVertical: 8 },
  exerciseIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 10 },
  exerciseName: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' as const },
  exerciseMeta: { color: Colors.textSecondary, fontSize: 10, marginTop: 3, textTransform: 'capitalize' as const },
  addButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  addButtonDisabled: { backgroundColor: Colors.background },
  noticeCard: { backgroundColor: Colors.warning, padding: 12, borderRadius: 14, marginBottom: 10 },
  noticeText: { color: Colors.background, fontSize: 11, lineHeight: 17, fontWeight: '800' as const },
  exerciseCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 18, padding: 14, marginBottom: 12 },
  exerciseCardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12 },
  removeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: Colors.background },
  tableHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 7, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.borderSubtle },
  tableHeaderText: { color: Colors.textMuted, fontSize: 9, fontWeight: '900' as const, textAlign: 'center' as const, letterSpacing: 0.7 },
  setRow: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 48, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, paddingVertical: 5 },
  setRowComplete: { backgroundColor: Colors.primarySoft },
  setIndex: { width: 46, color: Colors.textSecondary, textAlign: 'center' as const, fontSize: 13, fontWeight: '800' as const },
  setTypeButton: { width: 46, alignItems: 'center' as const, justifyContent: 'center' as const },
  setTypeText: { color: Colors.warning },
  setInput: { flex: 1, height: 36, marginHorizontal: 5, borderRadius: 9, backgroundColor: Colors.background, color: Colors.textPrimary, textAlign: 'center' as const, fontSize: 14, fontWeight: '800' as const, borderWidth: 1, borderColor: Colors.borderSubtle, paddingVertical: 0 },
  completeSetButton: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.borderSubtle, backgroundColor: Colors.background, marginHorizontal: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  completeSetButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  addSetButton: { height: 38, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5 },
  addSetText: { color: Colors.primary, fontSize: 12, fontWeight: '800' as const },
  restCard: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: Colors.surface, borderRadius: 16, padding: 13, marginBottom: 16, borderWidth: 1, borderColor: Colors.primary },
  restTitle: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900' as const },
  restSub: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  skipButton: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: Colors.background, borderRadius: 10, marginRight: 6 },
  skipText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800' as const },
  plusButton: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: Colors.primarySoft, borderRadius: 10 },
  plusText: { color: Colors.primary, fontSize: 11, fontWeight: '900' as const },
  historySection: { marginTop: 10, gap: 9 },
  historyRow: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, flexDirection: 'row' as const, alignItems: 'center' as const, borderWidth: 1, borderColor: Colors.borderSubtle },
  volumeText: { color: Colors.primary, fontSize: 12, fontWeight: '900' as const },
  footer: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 16, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  finishButton: { minHeight: 50, borderRadius: 16, backgroundColor: Colors.primary, flexDirection: 'row' as const, justifyContent: 'center' as const, alignItems: 'center' as const, gap: 8 },
  finishButtonDisabled: { opacity: 0.55 },
  finishButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const },
});

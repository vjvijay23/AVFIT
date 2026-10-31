import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, type Asset, type ImagePickerResponse } from 'react-native-image-picker';
import { Colors } from '../theme/colors';
import { FoodNutritionEstimate } from '../types';
import { ActivityService } from '../services/activityService';
import { AuthService } from '../services/auth';
import { BackendApi } from '../services/backendApi';
import { adjustNutritionPortion } from '../services/foodNutrition';
import AppNoticeCard from '../components/common/AppNoticeCard';
import {
  Camera as CameraIcon,
  Sparkles,
  CheckCircle,
  Plus,
  Minus,
  Utensils,
  Image as ImageIcon,
  Save,
  Check,
  ChevronRight,
  X,
} from 'lucide-react-native';

const MEAL_CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
type MealCategory = (typeof MEAL_CATEGORIES)[number];

type PreparedFoodImage = { uri: string; base64: string; mimeType: 'image/jpeg' | 'image/png'; width: number; height: number };

async function prepareFoodImage(asset: Asset): Promise<PreparedFoodImage> {
  const imageStarted = performance.now();
  const base64 = asset.base64;
  if (!base64) throw new Error('The selected image could not be encoded. Please choose another photo.');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;

  console.info('[FoodScan] Image prepared', {
    imageProcessingMs: Math.round(performance.now() - imageStarted),
    width: asset.width,
    height: asset.height,
    compressedBytes: Math.floor(base64.length * 3 / 4) - padding,
    base64EncodingIncludedInImageProcessing: true,
  });
  return { uri: asset.uri || '', base64, mimeType: asset.type === 'image/png' ? 'image/png' : 'image/jpeg', width: asset.width || 0, height: asset.height || 0 };
}

function firstAsset(result: ImagePickerResponse): Asset | undefined {
  return result.didCancel || result.errorCode ? undefined : result.assets?.[0];
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function mealIngredients(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function FoodScannerScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const scanInFlight = useRef(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MealCategory>('Lunch');
  const [portionGrams, setPortionGrams] = useState(350);
  const [isSaved, setIsSaved] = useState(false);
  const [mealId, setMealId] = useState<string | null>(null);
  const [recentMeals, setRecentMeals] = useState<Array<Record<string, any>>>([]);
  const [selectedMeal, setSelectedMeal] = useState<Record<string, any> | null>(null);
  const [screenNotice, setScreenNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const requireSignIn = () => {
    if (BackendApi.hasAuthToken()) return true;
    Alert.alert(
      'Sign in to scan meals',
      'Food analysis and saving meals are linked to your account. Sign in or create an account to continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => navigation.navigate('Login') },
        { text: 'Create account', onPress: () => navigation.navigate('Signup') },
      ],
    );
    return false;
  };

  const loadMeals = async () => {
    if (!BackendApi.hasAuthToken()) return;
    try {
      // Load the user's saved entries, not just today's UTC date, so older
      // meals stay available from the diary and can be opened for details.
      const response = await BackendApi.getMeals();
      setRecentMeals(response.meals);
    } catch (error) {
      console.warn('[FoodScanner] Could not load saved meals', error);
      setScreenNotice({ message: 'Saved meal history is temporarily unavailable. You can still scan a new meal.', tone: 'error' });
    }
  };

  useEffect(() => {
    void loadMeals();
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadMeals(); });
    return unsubscribe;
  }, [navigation]);

  const [scannedResult, setScannedResult] = useState<FoodNutritionEstimate | null>(null);

  const handleAdjustPortion = (delta: number) => {
    if (!scannedResult) return;
    const newWeight = Math.max(50, portionGrams + delta);
    setPortionGrams(newWeight);
    setIsSaved(false);
    setScannedResult(adjustNutritionPortion(scannedResult, newWeight));
  };

  const handlePickImage = async () => {
    if (!requireSignIn()) return;
    try {
      const response = await launchImageLibrary({
        mediaType: 'photo', selectionLimit: 1, includeBase64: true,
        maxWidth: 1440, maxHeight: 1440, quality: 0.7,
      });
      if (response.errorCode) throw new Error(response.errorMessage || 'Could not open your photo library. Please try again.');
      const asset = firstAsset(response);
      if (asset?.uri) {
        setSelectedImageUri(asset.uri);
        await runFoodScan(asset);
      }
    } catch (e: any) {
      setScreenNotice({ message: e?.message || 'Could not analyze this photo. Check your connection and try again.', tone: 'error' });
    }
  };

  const handleCaptureImage = async () => {
    if (!requireSignIn()) return;
    try {
      if (Platform.OS === 'android') {
        const cameraPermission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
          title: 'Allow AVFIT to use your camera',
          message: 'Camera access lets you photograph a meal for nutrition analysis.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });
        if (cameraPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          const permanentlyDenied = cameraPermission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
          throw new Error(permanentlyDenied
            ? 'Camera access is blocked. Open Android Settings > Apps > AVFIT > Permissions and allow Camera, or select a photo instead.'
            : 'Allow camera access to take a food photo, or select a photo from your gallery.');
        }
      }
      const response = await launchCamera({
        mediaType: 'photo', includeBase64: true, maxWidth: 1440, maxHeight: 1440, quality: 0.7,
        saveToPhotos: false,
      });
      if (response.errorCode) throw new Error(response.errorMessage || 'Could not open the camera. Check AVFIT camera permission in Settings.');
      const asset = firstAsset(response);
      if (asset?.uri) {
        setSelectedImageUri(asset.uri);
        await runFoodScan(asset);
      }
    } catch (e: any) {
      setScreenNotice({ message: e?.message || 'Could not analyze this photo. Check your connection and try again.', tone: 'error' });
    }
  };

  const runFoodScan = async (asset: Asset) => {
    if (scanInFlight.current) return;
    scanInFlight.current = true;
    setIsScanning(true);
    setScreenNotice(null);
    setScanStage('Preparing a 4:3 food photo…');
    setIsSaved(false);
    setMealId(null);
    setScannedResult(null);
    try {
      await nextFrame();
      const prepared = await prepareFoodImage(asset);
      setScanStage('Uploading the compressed photo securely…');
      await nextFrame();
      const result = await BackendApi.scanFood(prepared.base64, prepared.mimeType, () => {
        setScanStage('Sending photo and analyzing nutrition…');
      });
      setScanStage('Preparing nutrition results…');
      await nextFrame();
      setScannedResult(result);
      setPortionGrams(result.estimated_weight_g);
      setMealId(result.mealId || null);
      setScreenNotice({ message: 'Nutrition estimate is ready. Values are estimates; adjust the portion to match your meal.', tone: 'success' });
    } finally {
      scanInFlight.current = false;
      setIsScanning(false);
      setScanStage('');
    }
  };

  const handleSaveToDiary = async () => {
    if (!scannedResult) return;
    try {
      const meal = {
        dishName: scannedResult.dish_name,
        portionGrams,
        calories: scannedResult.calories,
        proteinG: scannedResult.protein_g,
        carbsG: scannedResult.carbs_g,
        fatG: scannedResult.fat_g,
        fiberG: scannedResult.fiber_g,
        sugarsG: scannedResult.sugars_g,
        saturatedFatG: scannedResult.saturated_fat_g,
        sodiumMg: scannedResult.sodium_mg,
        cholesterolMg: scannedResult.cholesterol_mg,
        confidence: scannedResult.confidence,
        healthTips: scannedResult.health_tips,
        ingredients: scannedResult.ingredients,
        mealType: selectedCategory.toLowerCase(),
      };
      if (mealId) await BackendApi.updateMeal(mealId, meal);
      else {
        const saved: any = await BackendApi.createMeal(meal);
        setMealId(saved.meal?.id || null);
      }
      setIsSaved(true);
      await loadMeals();
      setScreenNotice({ message: `${scannedResult.dish_name} (${scannedResult.calories} kcal) saved to your ${selectedCategory} diary.`, tone: 'success' });
    } catch (e: any) {
      setScreenNotice({ message: e?.message || 'Could not save this meal. Please try again.', tone: 'error' });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Screen Header */}
      <View style={styles.topHeader}>
        <Text style={styles.screenTitle}>AI Food Vision</Text>
        <View style={styles.aiBadge}>
          <Sparkles size={14} color={Colors.primary} />
          <Text style={styles.aiBadgeText}>Gemini AI Vision</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 130 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Meal Category Selector */}
        <View style={styles.categoryRow}>
          {MEAL_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryPill,
                selectedCategory === cat && styles.categoryPillActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat && styles.categoryTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {screenNotice && <>
          <AppNoticeCard message={screenNotice.message} tone={screenNotice.tone} compact />
          {!BackendApi.hasAuthToken() && <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.signInButtonText}>Sign in to scan and save meals</Text>
          </TouchableOpacity>}
        </>}

        {/* Viewfinder Camera Box */}
        <View style={styles.cameraBox}>
          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} style={styles.previewImage} resizeMode="contain" />
          ) : (
            <View style={styles.viewfinderCenter}>
              <View style={styles.cameraIconCircle}>
                <CameraIcon size={30} color={Colors.primary} />
              </View>
              <Text style={styles.cameraPrompt}>Photograph the full meal in good light</Text>
            </View>
          )}

          {isScanning && (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.scanningText}>{scanStage || 'Analyzing nutrition with AI Vision…'}</Text>
            </View>
          )}
        </View>

        {/* Camera & Gallery Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.captureBtn} onPress={handleCaptureImage} activeOpacity={0.8} disabled={isScanning}>
            <CameraIcon size={16} color="#FFFFFF" />
            <Text style={styles.captureBtnText}>Scan with Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.galleryBtn} onPress={handlePickImage} activeOpacity={0.8} disabled={isScanning}>
            <ImageIcon size={16} color={Colors.textPrimary} />
            <Text style={styles.galleryBtnText}>Select Photo</Text>
          </TouchableOpacity>
        </View>

        {!scannedResult && !isScanning && <View style={styles.resultCard}>
          <Text style={styles.ingredientsTitle}>Nutrition estimate</Text>
          <Text style={styles.dishSub}>Take a photo or choose one from your gallery. Gemini will estimate the food, portion, and nutrients.</Text>
        </View>}

        {/* Scanned Nutrition Results Card */}
        {scannedResult && <View style={styles.resultCard}>
          <View style={styles.dishHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dishTitle}>{scannedResult.dish_name}</Text>
              <Text style={styles.dishSub}>Estimated for {portionGrams}g portion • Approximate values</Text>
            </View>
            <View style={styles.confidencePill}>
              <CheckCircle size={12} color="#16A34A" />
              <Text style={styles.confidenceText}>{scannedResult.confidence} confidence</Text>
            </View>
          </View>

          <View style={styles.nutrientRows}>
            <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Fiber</Text><Text style={styles.ingredientMeta}>{scannedResult.fiber_g} g</Text></View>
            <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Sugars</Text><Text style={styles.ingredientMeta}>{scannedResult.sugars_g ?? '—'} g</Text></View>
            <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Saturated fat</Text><Text style={styles.ingredientMeta}>{scannedResult.saturated_fat_g ?? '—'} g</Text></View>
            <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Sodium</Text><Text style={styles.ingredientMeta}>{scannedResult.sodium_mg ?? '—'} mg</Text></View>
            <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Cholesterol</Text><Text style={styles.ingredientMeta}>{scannedResult.cholesterol_mg ?? '—'} mg</Text></View>
          </View>
          {!!scannedResult.health_tips && <Text style={styles.healthTip}>{scannedResult.health_tips}</Text>}

          {/* Calorie & Portion Adjuster */}
          <View style={styles.caloriesBanner}>
            <View>
              <Text style={styles.calorieBigNumber}>{scannedResult.calories}</Text>
              <Text style={styles.calorieLabel}>ESTIMATED KCAL</Text>
            </View>

            <View style={styles.portionControlRow}>
              <TouchableOpacity style={styles.portionBtn} onPress={() => handleAdjustPortion(-50)}>
                <Minus size={14} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.portionText}>{portionGrams}g</Text>
              <TouchableOpacity style={styles.portionBtn} onPress={() => handleAdjustPortion(50)}>
                <Plus size={14} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Macro Nutrition Split (Protein, Carbs, Fat) */}
          <View style={styles.macroGrid}>
            <View style={styles.macroBox}>
              <Text style={styles.macroValue}>{scannedResult.protein_g}g</Text>
              <Text style={styles.macroLabel}>Protein</Text>
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroBox}>
              <Text style={styles.macroValue}>{scannedResult.carbs_g}g</Text>
              <Text style={styles.macroLabel}>Carbs</Text>
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroBox}>
              <Text style={styles.macroValue}>{scannedResult.fat_g}g</Text>
              <Text style={styles.macroLabel}>Fats</Text>
            </View>
          </View>

          {/* Detected Ingredients */}
          <Text style={styles.ingredientsTitle}>Detected Ingredients</Text>
          {scannedResult.ingredients?.map((item, idx) => (
            <View key={idx} style={styles.ingredientRow}>
              <Text style={styles.ingredientName}>{item.name}</Text>
              <Text style={styles.ingredientMeta}>
                {item.weight_g}g • {item.calories} kcal
              </Text>
            </View>
          ))}

          {/* Save to Food Diary Button */}
          <TouchableOpacity
            style={[styles.saveDiaryBtn, isSaved && styles.savedDiaryBtn]}
            onPress={handleSaveToDiary}
            activeOpacity={0.8}
          >
            {isSaved ? (
              <>
                <Check size={18} color="#FFFFFF" />
                <Text style={styles.saveDiaryBtnText}>Logged in {selectedCategory} Diary</Text>
              </>
            ) : (
              <>
                <Save size={18} color="#FFFFFF" />
                <Text style={styles.saveDiaryBtnText}>Save to {selectedCategory} Diary</Text>
              </>
            )}
          </TouchableOpacity>
        </View>}

        {recentMeals.length > 0 && <View style={styles.diaryCard}>
          <Text style={styles.ingredientsTitle}>Saved Food Diary</Text>
          <Text style={styles.diarySubTitle}>Tap a meal to open its nutrition details.</Text>
          {recentMeals.map((meal) => <TouchableOpacity
            key={meal.id}
            style={styles.diaryMealRow}
            onPress={() => setSelectedMeal(meal)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Open ${meal.dish_name || 'saved meal'} nutrition details`}
          >
            <View style={styles.diaryMealMain}>
              <Text style={styles.ingredientName} numberOfLines={1}>{meal.dish_name || 'Saved meal'}</Text>
              <Text style={styles.diaryMealMeta}>
                {(meal.meal_type || 'meal').toString().replace(/^./, (letter: string) => letter.toUpperCase())}
                {meal.logged_at ? ` · ${new Date(meal.logged_at).toLocaleDateString()}` : ''}
              </Text>
            </View>
            <Text style={styles.ingredientMeta}>{Number(meal.calories || 0)} kcal</Text>
            <ChevronRight size={18} color={Colors.textSecondary} />
          </TouchableOpacity>)}
        </View>}
      </ScrollView>

      <Modal
        visible={!!selectedMeal}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMeal(null)}
      >
        <View style={styles.mealModalOverlay}>
          <View style={[styles.mealModalCard, { paddingBottom: Math.max(insets.bottom + 20, 28) }]}>
            <View style={styles.mealModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mealModalTitle}>{selectedMeal?.dish_name || 'Meal details'}</Text>
                <Text style={styles.diarySubTitle}>
                  {selectedMeal?.logged_at ? new Date(selectedMeal.logged_at).toLocaleString() : 'Saved food diary entry'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.mealModalClose}
                onPress={() => setSelectedMeal(null)}
                accessibilityRole="button"
                accessibilityLabel="Close meal details"
              >
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.mealCaloriesCard}>
                <Text style={styles.mealCaloriesValue}>{Number(selectedMeal?.calories || 0)}</Text>
                <Text style={styles.mealCaloriesLabel}>KCAL</Text>
                <Text style={styles.mealPortionText}>Estimated portion · {Number(selectedMeal?.portion_grams || 0)} g</Text>
              </View>
              <View style={styles.mealMacroGrid}>
                <View style={styles.mealMacroCell}><Text style={styles.mealMacroValue}>{Number(selectedMeal?.protein_g || 0)} g</Text><Text style={styles.mealMacroLabel}>Protein</Text></View>
                <View style={styles.mealMacroCell}><Text style={styles.mealMacroValue}>{Number(selectedMeal?.carbs_g || 0)} g</Text><Text style={styles.mealMacroLabel}>Carbs</Text></View>
                <View style={styles.mealMacroCell}><Text style={styles.mealMacroValue}>{Number(selectedMeal?.fat_g || 0)} g</Text><Text style={styles.mealMacroLabel}>Fat</Text></View>
                <View style={styles.mealMacroCell}><Text style={styles.mealMacroValue}>{Number(selectedMeal?.fiber_g || 0)} g</Text><Text style={styles.mealMacroLabel}>Fiber</Text></View>
              </View>
              <View style={styles.mealDetailRows}>
                <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Meal</Text><Text style={styles.ingredientMeta}>{(selectedMeal?.meal_type || 'meal').toString()}</Text></View>
                <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Sugars</Text><Text style={styles.ingredientMeta}>{Number(selectedMeal?.sugars_g || 0)} g</Text></View>
                <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Saturated fat</Text><Text style={styles.ingredientMeta}>{Number(selectedMeal?.saturated_fat_g || 0)} g</Text></View>
                <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Sodium</Text><Text style={styles.ingredientMeta}>{Number(selectedMeal?.sodium_mg || 0)} mg</Text></View>
                <View style={styles.nutrientRow}><Text style={styles.ingredientName}>Cholesterol</Text><Text style={styles.ingredientMeta}>{Number(selectedMeal?.cholesterol_mg || 0)} mg</Text></View>
              </View>
              {!!selectedMeal?.health_tips && <Text style={styles.healthTip}>{selectedMeal.health_tips}</Text>}
              {mealIngredients(selectedMeal?.ingredients).length > 0 && <>
                <Text style={[styles.ingredientsTitle, { marginTop: 12 }]}>Ingredients</Text>
                {mealIngredients(selectedMeal?.ingredients).map((item: any, index: number) => <View key={`${item.name || 'ingredient'}-${index}`} style={styles.ingredientRow}>
                  <Text style={styles.ingredientName}>{item.name || 'Ingredient'}</Text>
                  <Text style={styles.ingredientMeta}>{Number(item.weight_g || 0)} g · {Number(item.calories || 0)} kcal</Text>
                </View>)}
              </>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  diaryCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginTop: 14, borderWidth: 1, borderColor: Colors.borderSubtle },
  signInButton: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.primary },
  signInButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  diarySubTitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  diaryMealRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderSubtle },
  diaryMealMain: { flex: 1, minWidth: 0 },
  diaryMealMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  mealModalOverlay: { flex: 1, backgroundColor: 'rgba(18, 26, 21, 0.45)', justifyContent: 'flex-end' },
  mealModalCard: { maxHeight: '82%', backgroundColor: Colors.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20 },
  mealModalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  mealModalTitle: { fontSize: 21, lineHeight: 27, fontWeight: '900', color: Colors.textPrimary },
  mealModalClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  mealCaloriesCard: { backgroundColor: '#E8F1EC', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 14 },
  mealCaloriesValue: { fontSize: 36, fontWeight: '900', color: Colors.primary },
  mealCaloriesLabel: { color: Colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  mealPortionText: { color: Colors.textSecondary, fontSize: 13, marginTop: 6 },
  mealMacroGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 12, marginBottom: 12 },
  mealMacroCell: { width: '50%', alignItems: 'center', paddingVertical: 10 },
  mealMacroValue: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  mealMacroLabel: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  mealDetailRows: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12 },
  nutrientRows: { marginTop: 4, marginBottom: 10 },
  nutrientRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderSubtle },
  healthTip: { color: '#59645D', fontSize: 12, lineHeight: 18, backgroundColor: '#EFF5F0', padding: 11, borderRadius: 12, marginVertical: 8 },
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
  screenTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F1EC',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 4,
  },
  aiBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  categoryPill: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DFC8',
  },
  categoryPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  cameraBox: {
    height: 250,
    backgroundColor: '#1C2B22',
    borderRadius: 26,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1C2B22',
  },
  viewfinderCenter: {
    alignItems: 'center',
  },
  cameraIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cameraPrompt: {
    fontSize: 15,
    color: '#E0E7E3',
    fontWeight: '700',
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 43, 34, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  scanningText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  captureBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    minHeight: 54,
    paddingVertical: 14,
    borderRadius: 17,
    gap: 6,
  },
  captureBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  galleryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    minHeight: 54,
    paddingVertical: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E8DFC8',
    gap: 6,
  },
  galleryBtnText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8DFC8',
  },
  dishHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  dishTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dishSub: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  confidencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
    marginLeft: 6,
  },
  confidenceText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#16A34A',
  },
  caloriesBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F6F0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  calorieBigNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.primary,
  },
  calorieLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  portionControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  portionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8DFC8',
  },
  portionText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    minWidth: 46,
    textAlign: 'center',
  },
  macroGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3EFE6',
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  macroBox: {
    flex: 1,
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 19,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  macroLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  macroDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E8DFC8',
  },
  ingredientsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE1',
  },
  ingredientName: {
    fontSize: 12.5,
    color: Colors.textPrimary,
  },
  ingredientMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  saveDiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentOrange,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    marginTop: 18,
  },
  savedDiaryBtn: {
    backgroundColor: '#16A34A',
  },
  saveDiaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

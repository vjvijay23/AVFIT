import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../theme/colors';
import {
  Camera as CameraIcon,
  Sparkles,
  CheckCircle,
  Sliders,
  Plus,
  Minus,
  Zap,
} from 'lucide-react-native';
import { FoodNutritionEstimate } from '../types';

export default function FoodScannerScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [portionGrams, setPortionGrams] = useState(350);

  const [scannedResult, setScannedResult] = useState<FoodNutritionEstimate>({
    dish_name: 'Grilled Salmon with Quinoa & Steamed Greens',
    estimated_weight_g: 350,
    calories: 540,
    protein_g: 44,
    carbs_g: 46,
    fat_g: 16,
    fiber_g: 6.5,
    confidence: 'high',
    health_tips: 'High-protein, heart-healthy meal with clean carbs and Omega-3 fats.',
    ingredients: [
      { name: 'Grilled Atlantic Salmon', weight_g: 170, calories: 290 },
      { name: 'Steamed Quinoa', weight_g: 110, calories: 155 },
      { name: 'Steamed Broccoli & Kale', weight_g: 70, calories: 25 },
      { name: 'Extra Virgin Olive Oil', weight_g: 8, calories: 70 },
    ],
  });

  const handleAdjustPortion = (delta: number) => {
    const newWeight = Math.max(50, portionGrams + delta);
    const scale = newWeight / 350;
    setPortionGrams(newWeight);
    setScannedResult({
      ...scannedResult,
      calories: Math.round(540 * scale),
      protein_g: Math.round(44 * scale * 10) / 10,
      carbs_g: Math.round(46 * scale * 10) / 10,
      fat_g: Math.round(16 * scale * 10) / 10,
      fiber_g: Math.round(6.5 * scale * 10) / 10,
    });
  };

  const simulateScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setPortionGrams(350);
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Top Header */}
        <View style={styles.topHeader}>
          <Text style={styles.screenTitle}>AI Food Vision</Text>
          <View style={styles.aiBadge}>
            <Sparkles size={14} color={Colors.primary} />
            <Text style={styles.aiBadgeText}>Gemini 1.5</Text>
          </View>
        </View>

        {/* Viewfinder Camera Box */}
        <View style={styles.cameraBox}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />

          {isScanning ? (
            <View style={styles.scanningBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.scanningText}>Estimating macros with Gemini AI...</Text>
            </View>
          ) : (
            <View style={styles.viewfinderCenter}>
              <View style={styles.cameraIconCircle}>
                <CameraIcon size={32} color={Colors.primary} />
              </View>
              <Text style={styles.cameraPrompt}>Align plate inside viewfinder</Text>
              <TouchableOpacity style={styles.snapButton} onPress={simulateScan}>
                <Zap size={14} color="#FFFFFF" />
                <Text style={styles.snapButtonText}>Snap Food Photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* AI Results Card */}
        <View style={styles.resultsCard}>
          <View style={styles.resultTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dishTitle}>{scannedResult.dish_name}</Text>
              <View style={styles.confidenceRow}>
                <CheckCircle size={14} color={Colors.primary} />
                <Text style={styles.confidenceText}>High Confidence Detection</Text>
              </View>
            </View>
          </View>

          {/* Portion Stepper */}
          <View style={styles.portionControlRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sliders size={16} color={Colors.textSecondary} />
              <Text style={styles.portionLabel}>Serving Weight:</Text>
            </View>
            <View style={styles.stepperBox}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => handleAdjustPortion(-25)}
              >
                <Minus size={14} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.weightDisplay}>{portionGrams}g</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => handleAdjustPortion(25)}
              >
                <Plus size={14} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Macro Grid */}
          <View style={styles.macroGrid}>
            <View style={styles.macroCard}>
              <Text style={styles.macroVal}>{scannedResult.calories}</Text>
              <Text style={styles.macroLabel}>Calories</Text>
            </View>
            <View style={styles.macroCard}>
              <Text style={[styles.macroVal, { color: Colors.primary }]}>{scannedResult.protein_g}g</Text>
              <Text style={styles.macroLabel}>Protein</Text>
            </View>
            <View style={styles.macroCard}>
              <Text style={[styles.macroVal, { color: Colors.accentOrange }]}>{scannedResult.carbs_g}g</Text>
              <Text style={styles.macroLabel}>Carbs</Text>
            </View>
            <View style={styles.macroCard}>
              <Text style={[styles.macroVal, { color: '#C05621' }]}>{scannedResult.fat_g}g</Text>
              <Text style={styles.macroLabel}>Fat</Text>
            </View>
          </View>

          {/* Ingredients Breakdown */}
          <Text style={styles.ingredientsHeader}>Detected Ingredients</Text>
          {scannedResult.ingredients?.map((item, idx) => (
            <View key={idx} style={styles.ingredientRow}>
              <Text style={styles.ingredientName}>• {item.name}</Text>
              <Text style={styles.ingredientMeta}>{item.weight_g}g • {item.calories} kcal</Text>
            </View>
          ))}

          {/* Save to Diary Button */}
          <TouchableOpacity style={styles.logDiaryBtn}>
            <Text style={styles.logDiaryBtnText}>Log to Diary: Lunch ({scannedResult.calories} kcal)</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 90,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
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
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  cameraBox: {
    height: 200,
    backgroundColor: '#F3EDE2',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  cornerTL: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 22,
    height: 22,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: Colors.primary,
  },
  cornerTR: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 22,
    height: 22,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: Colors.primary,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    width: 22,
    height: 22,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: Colors.primary,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 22,
    height: 22,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: Colors.primary,
  },
  viewfinderCenter: {
    alignItems: 'center',
  },
  cameraIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cameraPrompt: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  snapButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    marginTop: 10,
  },
  snapButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scanningBox: {
    alignItems: 'center',
    gap: 8,
  },
  scanningText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  resultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  resultTitleRow: {
    marginBottom: 12,
  },
  dishTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  confidenceText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '700',
  },
  portionControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAF8F4',
    padding: 10,
    borderRadius: 16,
    marginBottom: 14,
  },
  portionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  weightDisplay: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 6,
  },
  macroCard: {
    flex: 1,
    backgroundColor: '#FAF8F4',
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  macroVal: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  macroLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  ingredientsHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFEB',
  },
  ingredientName: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
  ingredientMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  logDiaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  logDiaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

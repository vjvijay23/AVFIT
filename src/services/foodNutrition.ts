import { FoodNutritionEstimate } from '../types';

export function adjustNutritionPortion(
  nutrition: FoodNutritionEstimate,
  newWeightGrams: number,
): FoodNutritionEstimate {
  const weight = Math.max(50, Math.round(newWeightGrams / 50) * 50);
  const ratio = weight / Math.max(nutrition.estimated_weight_g, 1);
  return {
    ...nutrition,
    estimated_weight_g: weight,
    calories: Math.round(nutrition.calories * ratio),
    protein_g: Math.round(nutrition.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(nutrition.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(nutrition.fat_g * ratio * 10) / 10,
    fiber_g: Math.round(nutrition.fiber_g * ratio * 10) / 10,
    sugars_g: Math.round((nutrition.sugars_g || 0) * ratio * 10) / 10,
    saturated_fat_g: Math.round((nutrition.saturated_fat_g || 0) * ratio * 10) / 10,
    sodium_mg: Math.round((nutrition.sodium_mg || 0) * ratio * 10) / 10,
    cholesterol_mg: Math.round((nutrition.cholesterol_mg || 0) * ratio * 10) / 10,
  };
}

// Backward-compatible wrapper. Gemini calls and credentials stay server-side.
import { FoodNutritionEstimate } from '../types';
import { BackendApi } from './backendApi';

export function analyzeFoodImage(base64Image: string): Promise<FoodNutritionEstimate> {
  return BackendApi.scanFood(base64Image);
}

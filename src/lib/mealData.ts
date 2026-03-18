import { NutritionInfo } from '@/lib/shopify';

export interface MealInfo {
  nutrition: NutritionInfo;
  heatingInstructions: string;
}

/**
 * Local nutrition data and heating instructions for all meals,
 * keyed by Shopify product handle.
 */
export const MEAL_DATA: Record<string, MealInfo> = {
  'bbq-chicken-breast': {
    nutrition: { calories: 420, protein: 38, carbs: 32, fat: 14, fiber: 3, sodium: 680, sugar: 12 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 10 minutes\n3. Let stand 1 minute before serving',
  },
  'cajun-chicken': {
    nutrition: { calories: 450, protein: 36, carbs: 35, fat: 16, fiber: 4, sodium: 720, sugar: 4 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 10 minutes\n3. Stir and enjoy',
  },
  'carne-asada': {
    nutrition: { calories: 520, protein: 40, carbs: 42, fat: 18, fiber: 5, sodium: 650, sugar: 3 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 375°F for 12 minutes\n3. Let rest 1 minute before serving',
  },
  'chicken-balsamic-salad': {
    nutrition: { calories: 350, protein: 32, carbs: 18, fat: 16, fiber: 5, sodium: 520, sugar: 8 },
    heatingInstructions: 'Best served cold. Remove lid and enjoy. Add dressing just before eating.',
  },
  'chicken-caesar-salad': {
    nutrition: { calories: 380, protein: 34, carbs: 14, fat: 20, fiber: 4, sodium: 580, sugar: 3 },
    heatingInstructions: 'Best served cold. Toss with caesar dressing just before eating.',
  },
  'chicken-chickpea-pasta': {
    nutrition: { calories: 520, protein: 38, carbs: 52, fat: 14, fiber: 8, sodium: 590, sugar: 5 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 10 minutes\n3. Stir well and serve',
  },
  'chicken-teriyaki': {
    nutrition: { calories: 440, protein: 35, carbs: 42, fat: 12, fiber: 3, sodium: 710, sugar: 14 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 10 minutes\n3. Stir and serve',
  },
  'chicken-tikka-masala': {
    nutrition: { calories: 470, protein: 34, carbs: 38, fat: 18, fiber: 4, sodium: 660, sugar: 6 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 12 minutes\n3. Stir curry and serve over rice',
  },
  'chickpea-salad': {
    nutrition: { calories: 320, protein: 14, carbs: 36, fat: 12, fiber: 9, sodium: 480, sugar: 5 },
    heatingInstructions: 'Best served cold. Remove lid, toss with dressing, and enjoy.',
  },
  'chimichurri-steak': {
    nutrition: { calories: 490, protein: 42, carbs: 28, fat: 22, fiber: 3, sodium: 540, sugar: 2 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 375°F for 12 minutes\n3. Let rest 1 minute before serving',
  },
  'citrus-herb-chicken-breast': {
    nutrition: { calories: 390, protein: 36, carbs: 26, fat: 14, fiber: 4, sodium: 510, sugar: 6 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 10 minutes\n3. Let stand 1 minute before serving',
  },
  'kale-caesar-salad': {
    nutrition: { calories: 340, protein: 12, carbs: 20, fat: 22, fiber: 5, sodium: 560, sugar: 3 },
    heatingInstructions: 'Best served cold. Massage kale lightly, toss with dressing before eating.',
  },
  'kale-greek-salad': {
    nutrition: { calories: 310, protein: 10, carbs: 22, fat: 18, fiber: 6, sodium: 620, sugar: 4 },
    heatingInstructions: 'Best served cold. Remove lid, toss with vinaigrette, and enjoy.',
  },
  'korean-beef-bowl': {
    nutrition: { calories: 510, protein: 38, carbs: 44, fat: 18, fiber: 4, sodium: 740, sugar: 10 },
    heatingInstructions: '1. Remove lid\n2. Microwave 2-3 minutes or oven at 350°F for 10 minutes\n3. Stir and serve',
  },
  'protein-pancakes': {
    nutrition: { calories: 400, protein: 30, carbs: 42, fat: 10, fiber: 4, sodium: 380, sugar: 8 },
    heatingInstructions: '1. Microwave 60-90 seconds\n2. Or pan-warm on medium heat, 2 minutes per side\n3. Top with maple syrup and enjoy',
  },
  'protein-pancakes-1': {
    nutrition: { calories: 400, protein: 30, carbs: 42, fat: 10, fiber: 4, sodium: 380, sugar: 8 },
    heatingInstructions: '1. Microwave 60-90 seconds\n2. Or pan-warm on medium heat, 2 minutes per side\n3. Top with maple syrup and enjoy',
  },
  'protein-pancakes-2': {
    nutrition: { calories: 400, protein: 30, carbs: 42, fat: 10, fiber: 4, sodium: 380, sugar: 8 },
    heatingInstructions: '1. Microwave 60-90 seconds\n2. Or pan-warm on medium heat, 2 minutes per side\n3. Top with maple syrup and enjoy',
  },
  'southwest-chicken-salad': {
    nutrition: { calories: 370, protein: 34, carbs: 24, fat: 14, fiber: 6, sodium: 600, sugar: 5 },
    heatingInstructions: 'Best served cold. Add chipotle ranch dressing before eating.',
  },
};

/**
 * Get nutrition info for a product by handle, falling back to metafield data.
 */
export function getMealNutrition(handle: string): NutritionInfo | null {
  return MEAL_DATA[handle]?.nutrition ?? null;
}

/**
 * Get heating instructions for a product by handle.
 */
export function getMealHeatingInstructions(handle: string): string | null {
  return MEAL_DATA[handle]?.heatingInstructions ?? null;
}

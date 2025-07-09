/**
 * Nutrition Utilities
 * ------------------
 * Helper functions specific to nutritional calculations and processing.
 */

import { App, TFile } from 'obsidian';
import { parseGrams } from './parsingUtils';

/**
 * Interface for nutrition data
 */
export interface NutritionData {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  name?: string;
  serving?: string;
  macroLine?: string;
}

/**
 * Interface for macro row data
 */
export interface MacroRow {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  macroLine: string;
}

/**
 * Extracts the serving size from a food description
 * @param description The food description text
 * @returns The extracted serving size or "Unknown"
 */
export function extractServingSize(description: string): string {
  try {
    const regex = /Per\s*(\d+(\.\d+)?)\s*(g|medium|large|slice|cup|tbsp|oz)/i;
    const match = description.match(regex);
    return match ? `${match[1]}${match[3]}` : 'Unknown';
  } catch (error) {
    console.error('Error extracting serving size:', error);
    return 'Unknown';
  }
}

/**
 * Extracts nutritional data from a food description
 * @param description The food description text
 * @returns Object with extracted nutritional values
 */
export function extractNutritionalData(description: string): {
  calories: string;
  fat: string;
  carbs: string;
  protein: string;
} {
  try {
    const caloriesMatch = description.match(/Calories:\s*(\d+(\.\d+)?)kcal/i);
    const fatMatch = description.match(/Fat:\s*(\d+(\.\d+)?)g/i);
    const carbsMatch = description.match(/Carbs:\s*(\d+(\.\d+)?)g/i);
    const proteinMatch = description.match(/Protein:\s*(\d+(\.\d+)?)g/i);
    return {
      calories: caloriesMatch ? caloriesMatch[1] : 'N/A',
      fat: fatMatch ? fatMatch[1] : 'N/A',
      carbs: carbsMatch ? carbsMatch[1] : 'N/A',
      protein: proteinMatch ? proteinMatch[1] : 'N/A',
    };
  } catch (error) {
    console.error('Error extracting nutritional data:', error);
    return { calories: 'N/A', fat: 'N/A', carbs: 'N/A', protein: 'N/A' };
  }
}

/**
 * Processes nutritional data from a food file
 * @param app The Obsidian App instance
 * @param foodFile The food file to process
 * @param specifiedQuantity Optional quantity override
 * @returns Processed nutrition data or null if processing fails
 */
export function processNutritionalData(
  app: App,
  foodFile: TFile,
  specifiedQuantity: number | null = null
): NutritionData | null {
  const metadataCache = app.metadataCache;
  if (!metadataCache) return null;

  const cache = metadataCache.getFileCache(foodFile);
  if (!cache || !cache.frontmatter) return null;

  const fm = cache.frontmatter as Record<string, unknown>;
  const storedServing = (fm['serving_size'] as string) || '';
  if (!storedServing.toLowerCase().includes('g')) return null;

  const storedServingGrams = parseGrams(storedServing);
  if (isNaN(storedServingGrams)) return null;

  const quantity =
    specifiedQuantity != null && !isNaN(specifiedQuantity) ? specifiedQuantity : storedServingGrams;
  const scale = quantity / storedServingGrams;

  const cal = parseFloat(fm['calories'] as string) || 0;
  const prot = parseFloat(fm['protein'] as string) || 0;
  const fat = parseFloat(fm['fat'] as string) || 0;
  const carbs = parseFloat(fm['carbs'] as string) || 0;

  return {
    name: foodFile.name.replace(/\.md$/, ''),
    serving: `${quantity}g`,
    calories: cal * scale,
    protein: parseFloat((prot * scale).toFixed(1)),
    fat: parseFloat((fat * scale).toFixed(1)),
    carbs: parseFloat((carbs * scale).toFixed(1)),
  };
}

/**
 * Merges macro lines into unique entries
 * SIMPLIFIED: No multiplier logic, direct quantity merging
 * @param lines Array of macro lines
 * @returns Merged array of lines
 */
export function mergeMacroLines(lines: string[]): string[] {
  // Group items by meal and individual items
  const mealStructure = new Map<string, Map<string, number>>();
  const individualItems = new Map<string, number>();

  let currentMeal: string | null = null;

  lines.forEach((line) => {
    if (line.toLowerCase().startsWith('meal:')) {
      // SIMPLIFIED: Just extract meal name, no multiplier parsing
      currentMeal = line.substring(5).trim();

      if (!mealStructure.has(currentMeal)) {
        mealStructure.set(currentMeal, new Map());
      }
    } else if (line.startsWith('-') && currentMeal) {
      // Bullet point under a meal
      const itemText = line.substring(1).trim();
      const { foodName, quantity } = parseItemText(itemText);

      if (foodName) {
        const mealItems = mealStructure.get(currentMeal)!;
        const existingQuantity = mealItems.get(foodName) || 0;
        mealItems.set(foodName, existingQuantity + quantity);
      }
    } else if (!line.startsWith('-')) {
      // Individual food item (not under a meal)
      currentMeal = null;
      const { foodName, quantity } = parseItemText(line);

      if (foodName) {
        const existingQuantity = individualItems.get(foodName) || 0;
        individualItems.set(foodName, existingQuantity + quantity);
      }
    }
  });

  // Build output
  const output: string[] = [];

  // Add meals
  for (const [mealName, mealItems] of mealStructure) {
    output.push(`meal:${mealName}`);

    for (const [foodName, quantity] of mealItems) {
      output.push(`- ${foodName}:${quantity}g`);
    }
  }

  // Add individual items
  for (const [foodName, quantity] of individualItems) {
    output.push(`${foodName}:${quantity}g`);
  }

  return output;
}

/**
 * Parse item text to extract food name and quantity
 * HELPER: Common logic for parsing food items
 */
function parseItemText(itemText: string): { foodName: string; quantity: number } {
  if (itemText.includes(':')) {
    const parts = itemText.split(':').map((s) => s.trim());
    const foodName = parts[0];
    const quantityMatch = parts[1].match(/^([\d.]+)g?$/i);
    const quantity = quantityMatch ? parseFloat(quantityMatch[1]) : 100;

    return { foodName, quantity };
  } else {
    // No quantity specified, assume 100g default
    return { foodName: itemText.trim(), quantity: 100 };
  }
}

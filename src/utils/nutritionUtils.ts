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
 * @param lines Array of macro lines
 * @returns Merged array of lines
 */
export function mergeMacroLines(lines: string[]): string[] {
	const mergedFood: Record<string, { foodName: string; totalServing: number; firstIndex: number }> =
		{};
	const mergedMeals: Record<string, { mealName: string; count: number; firstIndex: number }> = {};

	lines.forEach((line, index) => {
		if (line.toLowerCase().startsWith('meal:')) {
			const fullMealText = line.substring(5).trim();
			let mealName = fullMealText;
			let existingCount = 1;
			const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
			if (countMatch) {
				mealName = countMatch[1];
				existingCount = parseInt(countMatch[2]);
			}
			const key = mealName.toLowerCase();
			if (!mergedMeals[key]) {
				mergedMeals[key] = { mealName, count: existingCount, firstIndex: index };
			} else {
				mergedMeals[key].count += existingCount;
			}
		} else if (!line.toLowerCase().startsWith('-') && line.includes(':')) {
			const match = line.match(/^([^:]+):\s*([\d.]+)g$/i);
			if (match) {
				const foodName = match[1].trim();
				const serving = parseFloat(match[2]);
				const key = foodName.toLowerCase();
				if (isNaN(serving)) return;
				if (!mergedFood[key]) {
					mergedFood[key] = { foodName, totalServing: serving, firstIndex: index };
				} else {
					mergedFood[key].totalServing += serving;
				}
			}
		}
	});

	const output: string[] = [];
	lines.forEach((line, index) => {
		if (line.toLowerCase().startsWith('meal:')) {
			const fullMealText = line.substring(5).trim();
			let mealName = fullMealText;
			const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
			if (countMatch) mealName = countMatch[1];
			const key = mealName.toLowerCase();
			if (mergedMeals[key] && mergedMeals[key].firstIndex === index) {
				output.push(
					mergedMeals[key].count > 1
						? `meal:${mealName} × ${mergedMeals[key].count}`
						: `meal:${mealName}`
				);
			}
		} else if (!line.toLowerCase().startsWith('-') && line.includes(':')) {
			const match = line.match(/^([^:]+):\s*([\d.]+)g$/i);
			if (match) {
				const key = match[1].trim().toLowerCase();
				if (mergedFood[key] && mergedFood[key].firstIndex === index) {
					output.push(`${mergedFood[key].foodName}:${mergedFood[key].totalServing}g`);
				}
				return;
			}
			output.push(line);
		} else if (!line.toLowerCase().startsWith('-')) {
			output.push(line);
		}
	});

	return output;
}

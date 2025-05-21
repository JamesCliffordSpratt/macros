import { parseGrams, processNutritionalData } from '../../utils';
import MacrosPlugin from '../../../main';
import { NutritionData, MacroTotals } from '../../utils';

export interface CalcBreakdown {
	id: string;
	totals: MacroTotals;
}

interface CalcResult {
	aggregate: MacroTotals;
	breakdown: CalcBreakdown[];
}

export function processNutritionalDataFromLines(plugin: MacrosPlugin, ids: string[]): CalcResult {
	const aggregate: MacroTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
	const breakdown: CalcBreakdown[] = [];

	// Add debug logging
	plugin.logger.debug(`Processing nutrition data for ${ids.length} IDs: ${ids.join(', ')}`);

	// Helper function for processing food items
	function processFoodItem(foodQuery: string, specifiedQuantity: number | null): NutritionData {
		// Use centralized method from DataManager
		const matchingFile = plugin.dataManager.findFoodFile(foodQuery);

		if (!matchingFile) {
			plugin.logger.debug(`No matching food file found for: ${foodQuery}`);
			return { calories: 0, protein: 0, fat: 0, carbs: 0 };
		}

		const nutrition = processNutritionalData(plugin.app, matchingFile, specifiedQuantity);
		return nutrition || { calories: 0, protein: 0, fat: 0, carbs: 0 };
	}

	for (const id of ids) {
		const total: MacroTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };

		// Get the data - log the number of lines for debugging
		const tableLines = plugin.macroService.macroTables.get(id);
		if (!tableLines) {
			plugin.logger.debug(`No table lines found for ID: ${id}`);
			continue;
		}

		plugin.logger.debug(`Processing ${tableLines.length} lines for ID: ${id}`);

		// First, organize the lines into meals and their bullet points
		const mealBullets: Record<string, string[]> = {};
		let currentMeal = '';

		// First pass - collect meal structures
		for (const line of tableLines) {
			if (line.toLowerCase().startsWith('meal:')) {
				// Start of a new meal
				currentMeal = line;
				mealBullets[currentMeal] = [];
			} else if (line.startsWith('-') && currentMeal) {
				// Bullet point for current meal
				mealBullets[currentMeal].push(line.substring(1).trim());
			}
		}

		// Now process all lines with bullet point awareness
		currentMeal = '';
		for (const line of tableLines) {
			if (line.toLowerCase().startsWith('meal:')) {
				// Extract meal details
				currentMeal = line;
				const mealText = line.substring(5).trim();
				let mealName = mealText;
				let count = 1;

				const countMatch = mealText.match(/^(.*)\s+×\s+(\d+)$/);
				if (countMatch) {
					mealName = countMatch[1];
					count = parseInt(countMatch[2]);
				}

				// Check if this meal has bullet points
				const bullets = mealBullets[currentMeal];
				if (bullets && bullets.length > 0) {
					// Use bullet points instead of template
					plugin.logger.debug(`Processing meal with ${bullets.length} bullet points: ${mealName}`);

					for (const bullet of bullets) {
						let foodQuery = bullet;
						let specifiedQuantity: number | null = null;

						if (bullet.includes(':')) {
							const parts = bullet.split(':').map((s) => s.trim());
							foodQuery = parts[0];
							specifiedQuantity = parseGrams(parts[1]);

							// Apply multiplier if present
							if (count > 1 && specifiedQuantity !== null) {
								specifiedQuantity = specifiedQuantity * count;
							}
						}

						plugin.logger.debug(
							`Processing bullet: ${foodQuery}${specifiedQuantity ? `:${specifiedQuantity}g` : ''}`
						);
						const result = processFoodItem(foodQuery, specifiedQuantity);
						total.calories += result.calories;
						total.protein += result.protein;
						total.fat += result.fat;
						total.carbs += result.carbs;
					}
				} else {
					// Fallback to template
					const meal = plugin.settings.mealTemplates.find(
						(m) => m.name.toLowerCase() === mealName.toLowerCase()
					);
					if (!meal) {
						plugin.logger.debug(`Meal template not found: ${mealName}`);
						continue;
					}

					plugin.logger.debug(
						`Falling back to meal template: ${mealName} with ${meal.items.length} items`
					);

					// Process template items
					for (const item of meal.items) {
						let foodQuery = item;
						let specifiedQuantity: number | null = null;

						if (item.includes(':')) {
							const parts = item.split(':').map((s) => s.trim());
							foodQuery = parts[0];
							specifiedQuantity = parseGrams(parts[1]);

							if (count > 1 && specifiedQuantity !== null) {
								specifiedQuantity = specifiedQuantity * count;
							}
						}

						const result = processFoodItem(foodQuery, specifiedQuantity);
						total.calories += result.calories;
						total.protein += result.protein;
						total.fat += result.fat;
						total.carbs += result.carbs;
					}
				}
			} else if (!line.startsWith('-') && !line.startsWith('id:')) {
				// Regular food item
				let foodQuery = line;
				let specifiedQuantity: number | null = null;

				if (line.includes(':')) {
					const parts = line.split(':').map((s) => s.trim());
					foodQuery = parts[0];
					specifiedQuantity = parseGrams(parts[1]);
				}

				plugin.logger.debug(
					`Processing regular item: ${foodQuery}${specifiedQuantity ? `:${specifiedQuantity}g` : ''}`
				);
				const result = processFoodItem(foodQuery, specifiedQuantity);
				total.calories += result.calories;
				total.protein += result.protein;
				total.fat += result.fat;
				total.carbs += result.carbs;
			}
		}

		// Add the totals for this ID
		plugin.logger.debug(
			`Calculated totals for ${id}: calories=${total.calories.toFixed(1)}, protein=${total.protein.toFixed(1)}g, fat=${total.fat.toFixed(1)}g, carbs=${total.carbs.toFixed(1)}g`
		);

		breakdown.push({ id, totals: total });
		aggregate.calories += total.calories;
		aggregate.protein += total.protein;
		aggregate.fat += total.fat;
		aggregate.carbs += total.carbs;
	}

	// Log the final aggregate
	plugin.logger.debug(
		`Calculated aggregate totals: calories=${aggregate.calories.toFixed(1)}, protein=${aggregate.protein.toFixed(1)}g, fat=${aggregate.fat.toFixed(1)}g, carbs=${aggregate.carbs.toFixed(1)}g`
	);

	return { aggregate, breakdown };
}

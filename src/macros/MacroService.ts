import MacrosPlugin from '../main';
import { TFile } from 'obsidian';
import { parseGrams, processNutritionalData } from '../utils';
/**
 * MacroService
 * ------------
 * Provides core nutrition-specific functions used throughout the plugin.
 * This centralizes domain logic related to nutritional calculations.
 */
export class MacroService {
	private plugin: MacrosPlugin;
	private static instance: MacroService;

	// Tracking for active renderers
	_activeMacrosCalcRenderers: Set<any> = new Set();

	private constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
		this._activeMacrosCalcRenderers = new Set();
	}

	/**
	 * Initialize the macro service
	 */
	static init(plugin: MacrosPlugin): MacroService {
		if (!this.instance) {
			this.instance = new MacroService(plugin);
		}
		return this.instance;
	}

	/**
	 * Clean up resources when plugin is unloaded
	 */
	static unload(): void {
		this.instance = null as unknown as MacroService;
	}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): MacroService {
		if (!this.instance) {
			throw new Error('MacroService not initialized. Call MacroService.init(plugin) first.');
		}
		return this.instance;
	}

	// ======================================================================
	// DELEGATION METHODS - These delegate to DataManager to maintain API
	// while ensuring data is only stored in one place
	// ======================================================================

	/**
	 * Access to macroTables map - delegates to DataManager
	 */
	get macroTables() {
		return this.plugin.dataManager.macroTables;
	}

	/**
	 * Access to macrospcContainers map - delegates to DataManager
	 */
	get macrospcContainers() {
		return this.plugin.dataManager.macrospcContainers;
	}

	/**
	 * Helper method to find a food file - now delegated to DataManager
	 */
	findFoodFile(foodQuery: string): TFile | null {
		return this.plugin.dataManager.findFoodFile(foodQuery);
	}

	/**
	 * Helper method for processors to get consistent calorie calcs
	 */
	getActualCaloriesFromItems(id: string): number {
		let total = 0;
		// Use the delegated macroTables property
		const macroLines = this.macroTables.get(id);
		if (!macroLines) return 0;

		macroLines.forEach((line) => {
			if (line.toLowerCase().startsWith('meal:')) {
				const fullMealText = line.substring(5).trim();
				let mealName = fullMealText;
				let count = 1;

				const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
				if (countMatch) {
					mealName = countMatch[1];
					count = parseInt(countMatch[2]);
				}

				const meal = this.plugin.settings.mealTemplates.find(
					(m) => m.name.toLowerCase() === mealName.toLowerCase()
				);
				if (!meal) return;

				meal.items.forEach((item: string) => {
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

					// Use centralized method from DataManager
					const matchingFile = this.plugin.dataManager.findFoodFile(foodQuery);
					if (!matchingFile) return;

					const nutrition = processNutritionalData(
						this.plugin.app,
						matchingFile,
						specifiedQuantity
					);
					if (!nutrition) return;

					total += parseFloat(nutrition.calories.toFixed(1));
				});
			} else {
				let foodQuery = line;
				let specifiedQuantity: number | null = null;

				if (line.includes(':')) {
					const parts = line.split(':').map((s) => s.trim());
					foodQuery = parts[0];
					specifiedQuantity = parseGrams(parts[1]);
				}

				// Use centralized method from DataManager
				const matchingFile = this.plugin.dataManager.findFoodFile(foodQuery);
				if (!matchingFile) return;

				const nutrition = processNutritionalData(this.plugin.app, matchingFile, specifiedQuantity);
				if (!nutrition) return;

				total += parseFloat(nutrition.calories.toFixed(1));
			}
		});

		return total;
	}

	/**
	 * Calculate macros from lines with promise-based processing
	 */
	async calculateMacrosFromLinesAsync(
		lines: string[]
	): Promise<{ protein: number; fat: number; carbs: number; calories: number }> {
		let totalProtein = 0,
			totalFat = 0,
			totalCarbs = 0,
			totalCalories = 0;

		// Process all lines first to identify if we're dealing with just meal headers
		const onlyMealHeaders = lines.every((line) => line.toLowerCase().startsWith('meal:'));
		const hasBulletPoints = lines.some((line) => line.startsWith('-'));

		// Handle bullet points more robustly - track the current meal
		let currentMeal = '';
		let mealMultiplier = 1;

		// Process each line
		for (const line of lines) {
			if (line.toLowerCase().startsWith('meal:')) {
				currentMeal = line.substring(5).trim();

				// Check for multiplier in meal line
				const countMatch = currentMeal.match(/^(.*)\s+×\s+(\d+)$/);
				if (countMatch) {
					currentMeal = countMatch[1];
					mealMultiplier = parseInt(countMatch[2]);
				} else {
					mealMultiplier = 1;
				}

				// If no bullet points follow, use the template approach
				if (!hasBulletPoints) {
					const template = this.plugin.settings.mealTemplates.find(
						(m) => m.name.toLowerCase() === currentMeal.toLowerCase()
					);

					if (template) {
						// Process template items
						for (const item of template.items) {
							let foodQuery = item;
							let grams: number | null = null;

							if (item.includes(':')) {
								const parts = item.split(':').map((s) => s.trim());
								foodQuery = parts[0];
								grams = parseGrams(parts[1]);
								if (grams !== null && mealMultiplier > 1) {
									grams *= mealMultiplier;
								}
							}

							// Use centralized method from DataManager
							const file = this.plugin.dataManager.findFoodFile(foodQuery);
							if (file) {
								const data = processNutritionalData(this.plugin.app, file, grams);
								if (data) {
									totalProtein += data.protein;
									totalFat += data.fat;
									totalCarbs += data.carbs;
									totalCalories += parseFloat(data.calories.toFixed(1));
								}
							}
						}
					}
				}
			} else if (line.startsWith('-') && currentMeal) {
				// This is a bullet point for a meal
				const itemText = line.substring(1).trim();

				let foodQuery = itemText;
				let grams: number | null = null;

				if (itemText.includes(':')) {
					const parts = itemText.split(':').map((s) => s.trim());
					foodQuery = parts[0];
					grams = parseGrams(parts[1]);

					// Apply multiplier if present
					if (grams !== null && mealMultiplier > 1) {
						grams *= mealMultiplier;
					}
				}

				// Use centralized method from DataManager
				const file = this.plugin.dataManager.findFoodFile(foodQuery);
				if (file) {
					const data = processNutritionalData(this.plugin.app, file, grams);
					if (data) {
						totalProtein += data.protein;
						totalFat += data.fat;
						totalCarbs += data.carbs;
						totalCalories += parseFloat(data.calories.toFixed(1));
					}
				}
			} else if (!line.startsWith('-') && !line.toLowerCase().startsWith('id:')) {
				// Regular food item
				let foodQuery = line;
				let grams: number | null = null;

				if (line.includes(':')) {
					const parts = line.split(':').map((s) => s.trim());
					foodQuery = parts[0];
					grams = parseGrams(parts[1]);
				}

				// Use centralized method from DataManager
				const file = this.plugin.dataManager.findFoodFile(foodQuery);
				if (file) {
					const data = processNutritionalData(this.plugin.app, file, grams);
					if (data) {
						totalProtein += data.protein;
						totalFat += data.fat;
						totalCarbs += data.carbs;
						totalCalories += parseFloat(data.calories.toFixed(1));
					}
				}
			}
		}

		// Round all values to one decimal place for consistency
		return {
			protein: parseFloat(totalProtein.toFixed(1)),
			fat: parseFloat(totalFat.toFixed(1)),
			carbs: parseFloat(totalCarbs.toFixed(1)),
			calories: parseFloat(totalCalories.toFixed(1)),
		};
	}

	/**
	 * Process nutritional data from lines
	 */
	processNutritionalDataFromLines(ids: string[]): {
		aggregate: { calories: number; protein: number; fat: number; carbs: number };
		breakdown: {
			id: string;
			totals: { calories: number; protein: number; fat: number; carbs: number };
		}[];
	} {
		const aggregate = { calories: 0, protein: 0, fat: 0, carbs: 0 };
		const breakdown: {
			id: string;
			totals: { calories: number; protein: number; fat: number; carbs: number };
		}[] = [];

		for (const id of ids) {
			const total = { calories: 0, protein: 0, fat: 0, carbs: 0 };

			// Get lines for this ID using the delegated property
			const tableLines = this.macroTables.get(id);
			if (!tableLines) {
				continue;
			}

			// Process lines (simplified version for now)
			for (const line of tableLines) {
				if (!line.startsWith('-') && !line.toLowerCase().startsWith('id:')) {
					let foodQuery = line;
					let specifiedQuantity: number | null = null;

					if (line.includes(':')) {
						const parts = line.split(':').map((s) => s.trim());
						foodQuery = parts[0];
						specifiedQuantity = parseGrams(parts[1]);
					}

					// Use centralized method from DataManager
					const file = this.plugin.dataManager.findFoodFile(foodQuery);
					if (file) {
						const data = processNutritionalData(this.plugin.app, file, specifiedQuantity);
						if (data) {
							total.protein += data.protein;
							total.fat += data.fat;
							total.carbs += data.carbs;
							total.calories += parseFloat(data.calories.toFixed(1));
						}
					}
				}
			}

			breakdown.push({ id, totals: total });
			aggregate.calories += total.calories;
			aggregate.protein += total.protein;
			aggregate.fat += total.fat;
			aggregate.carbs += total.carbs;
		}

		return { aggregate, breakdown };
	}
}

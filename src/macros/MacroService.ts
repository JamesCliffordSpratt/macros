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

    // CRITICAL FIX: First merge duplicate lines to avoid double counting
    const mergedLines = this.mergeDuplicateLines(lines);

    this.plugin.logger.debug(
      `Original lines: ${lines.length}, Merged lines: ${mergedLines.length}`
    );
    this.plugin.logger.debug('Merged lines:', mergedLines);

    // Process all lines first to identify if we're dealing with just meal headers
    const onlyMealHeaders = mergedLines.every((line) => line.toLowerCase().startsWith('meal:'));
    const hasBulletPoints = mergedLines.some((line) => line.startsWith('-'));

    // Handle bullet points more robustly - track the current meal
    let currentMeal = '';
    let mealMultiplier = 1;

    // Process each line
    for (const line of mergedLines) {
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

    this.plugin.logger.debug(
      `Final totals: protein=${totalProtein.toFixed(1)}g, fat=${totalFat.toFixed(1)}g, carbs=${totalCarbs.toFixed(1)}g, calories=${totalCalories.toFixed(1)}`
    );

    // Round all values to one decimal place for consistency
    return {
      protein: parseFloat(totalProtein.toFixed(1)),
      fat: parseFloat(totalFat.toFixed(1)),
      carbs: parseFloat(totalCarbs.toFixed(1)),
      calories: parseFloat(totalCalories.toFixed(1)),
    };
  }

  /**
   * Helper method to merge duplicate lines before calculation
   */
  private mergeDuplicateLines(lines: string[]): string[] {
    const mergedFood: Record<
      string,
      { foodName: string; totalServing: number; firstIndex: number }
    > = {};
    const mergedMeals: Record<string, { mealName: string; count: number; firstIndex: number }> = {};
    const output: string[] = [];

    // First pass: identify and merge duplicates
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

    // Second pass: build output with merged values
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

    this.plugin.logger.debug(
      `MacroService processing nutrition data for ${ids.length} IDs: ${ids.join(', ')}`
    );

    for (const id of ids) {
      const total = { calories: 0, protein: 0, fat: 0, carbs: 0 };

      // Get lines for this ID using the delegated property
      const tableLines = this.macroTables.get(id);
      if (!tableLines) {
        this.plugin.logger.debug(`No table lines found for ID: ${id}`);
        continue;
      }

      this.plugin.logger.debug(`MacroService processing ${tableLines.length} lines for ID: ${id}`);

      // CRITICAL FIX: Use the same merging logic as calculateMacrosFromLinesAsync
      const mergedLines = this.mergeDuplicateLines(tableLines);
      this.plugin.logger.debug(
        `MacroService after merging: ${mergedLines.length} lines for ID: ${id}`
      );

      // Process merged lines (simplified version for now)
      for (const line of mergedLines) {
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

      this.plugin.logger.debug(
        `MacroService calculated totals for ${id}: calories=${total.calories.toFixed(1)}, protein=${total.protein.toFixed(1)}g, fat=${total.fat.toFixed(1)}g, carbs=${total.carbs.toFixed(1)}g`
      );

      breakdown.push({ id, totals: total });
      aggregate.calories += total.calories;
      aggregate.protein += total.protein;
      aggregate.fat += total.fat;
      aggregate.carbs += total.carbs;
    }

    this.plugin.logger.debug(
      `MacroService calculated aggregate totals: calories=${aggregate.calories.toFixed(1)}, protein=${aggregate.protein.toFixed(1)}g, fat=${aggregate.fat.toFixed(1)}g, carbs=${aggregate.carbs.toFixed(1)}g`
    );

    return { aggregate, breakdown };
  }
}

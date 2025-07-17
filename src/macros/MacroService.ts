import MacrosPlugin from '../main';
import { TFile } from 'obsidian';
import { parseGrams, processNutritionalData } from '../utils';

// Type definition for MacrosCalc renderers
interface MacrosCalcRenderer {
  el: HTMLElement;
  getIds: () => string[];
  render: (
    aggregate: { calories: number; protein: number; fat: number; carbs: number },
    breakdown: Array<{
      id: string;
      totals: { calories: number; protein: number; fat: number; carbs: number };
    }>
  ) => Promise<void>;
  setNeedsRefresh?: () => void;
}

/**
 * MacroService
 * ------------
 * Provides core nutrition-specific functions used throughout the plugin.
 * This centralizes domain logic related to nutritional calculations.
 */
export class MacroService {
  private plugin: MacrosPlugin;
  private static instance: MacroService;

  // Tracking for active renderers with proper typing
  _activeMacrosCalcRenderers: Set<MacrosCalcRenderer> = new Set();

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
   * Helper method for processors to get consistent calorie calculations
   * SIMPLIFIED: No multiplier logic
   */
  getActualCaloriesFromItems(id: string): number {
    let total = 0;
    const macroLines = this.macroTables.get(id);
    if (!macroLines) return 0;

    let currentMeal = '';

    macroLines.forEach((line) => {
      if (line.toLowerCase().startsWith('meal:')) {
        // SIMPLIFIED: Just track meal context, no expansion
        currentMeal = line.substring(5).trim();
      } else if (line.startsWith('-') && currentMeal) {
        // Process meal item
        const itemText = line.substring(1).trim();
        const macroData = this.processSingleFoodItem(itemText);

        if (macroData) {
          total += macroData.calories;
        }
      } else if (!line.startsWith('-') && !line.toLowerCase().startsWith('id:')) {
        // Process individual food item
        currentMeal = ''; // Reset meal context
        const macroData = this.processSingleFoodItem(line);

        if (macroData) {
          total += macroData.calories;
        }
      }
    });

    return total;
  }

  /**
   * Calculate macros from lines with promise-based processing
   * SIMPLIFIED VERSION: No multiplier logic, direct processing
   */
  async calculateMacrosFromLinesAsync(
    lines: string[]
  ): Promise<{ protein: number; fat: number; carbs: number; calories: number }> {
    let totalProtein = 0,
      totalFat = 0,
      totalCarbs = 0,
      totalCalories = 0;

    // SIMPLIFIED: No complex merging needed since we handle duplicates at write time
    this.plugin.logger.debug(`Processing ${lines.length} lines`);

    // Track the current meal context
    let currentMeal = '';

    for (const line of lines) {
      if (line.toLowerCase().startsWith('meal:')) {
        // SIMPLIFIED: Just extract meal name, no multiplier
        currentMeal = line.substring(5).trim();

        // We don't expand meal templates here anymore since
        // the actual items are stored as bullet points
      } else if (line.startsWith('-') && currentMeal) {
        // Process bullet point (meal item)
        const itemText = line.substring(1).trim();
        const macroData = this.processSingleFoodItem(itemText);

        if (macroData) {
          totalProtein += macroData.protein;
          totalFat += macroData.fat;
          totalCarbs += macroData.carbs;
          totalCalories += macroData.calories;
        }
      } else if (!line.startsWith('-') && !line.toLowerCase().startsWith('id:')) {
        // Regular food item (not under a meal)
        currentMeal = ''; // Reset meal context

        const macroData = this.processSingleFoodItem(line);

        if (macroData) {
          totalProtein += macroData.protein;
          totalFat += macroData.fat;
          totalCarbs += macroData.carbs;
          totalCalories += macroData.calories;
        }
      }
    }

    this.plugin.logger.debug(
      `Final totals: protein=${totalProtein.toFixed(1)}g, fat=${totalFat.toFixed(1)}g, carbs=${totalCarbs.toFixed(1)}g, calories=${totalCalories.toFixed(1)}`
    );

    return {
      protein: parseFloat(totalProtein.toFixed(1)),
      fat: parseFloat(totalFat.toFixed(1)),
      carbs: parseFloat(totalCarbs.toFixed(1)),
      calories: parseFloat(totalCalories.toFixed(1)),
    };
  }

  /**
   * Process a single food item and return its macro data
   * SIMPLIFIED: Extract common logic for processing individual food items
   */
  private processSingleFoodItem(itemText: string): {
    protein: number;
    fat: number;
    carbs: number;
    calories: number;
  } | null {
    let foodQuery = itemText;
    let grams: number | null = null;

    if (itemText.includes(':')) {
      const parts = itemText.split(':').map((s) => s.trim());
      foodQuery = parts[0];
      grams = parseGrams(parts[1]);
    }

    const file = this.plugin.dataManager.findFoodFile(foodQuery);
    if (!file) {
      this.plugin.logger.warn(`Food file not found for: ${foodQuery}`);
      return null;
    }

    const data = processNutritionalData(this.plugin.app, file, grams);
    if (!data) {
      this.plugin.logger.warn(`Could not process nutrition data for: ${foodQuery}`);
      return null;
    }

    return {
      protein: data.protein,
      fat: data.fat,
      carbs: data.carbs,
      calories: parseFloat(data.calories.toFixed(1)),
    };
  }

  /**
   * Process nutritional data from lines
   * SIMPLIFIED: Remove complex merging logic
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

      const tableLines = this.macroTables.get(id);
      if (!tableLines) {
        this.plugin.logger.debug(`No table lines found for ID: ${id}`);
        continue;
      }

      this.plugin.logger.debug(`MacroService processing ${tableLines.length} lines for ID: ${id}`);

      let currentMeal = '';

      // SIMPLIFIED: Process lines directly without complex merging
      for (const line of tableLines) {
        if (line.toLowerCase().startsWith('meal:')) {
          currentMeal = line.substring(5).trim();
        } else if (line.startsWith('-') && currentMeal) {
          // Process meal item
          const itemText = line.substring(1).trim();
          const macroData = this.processSingleFoodItem(itemText);

          if (macroData) {
            total.protein += macroData.protein;
            total.fat += macroData.fat;
            total.carbs += macroData.carbs;
            total.calories += macroData.calories;
          }
        } else if (!line.startsWith('-') && !line.toLowerCase().startsWith('id:')) {
          // Process individual food item
          currentMeal = '';
          const macroData = this.processSingleFoodItem(line);

          if (macroData) {
            total.protein += macroData.protein;
            total.fat += macroData.fat;
            total.carbs += macroData.carbs;
            total.calories += macroData.calories;
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

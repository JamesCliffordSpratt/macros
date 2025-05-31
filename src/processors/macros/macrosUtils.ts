import { processNutritionalData } from '../../utils';
import MacrosPlugin from '../../main';
import { MacroRow } from '../../utils';

export function extractIdFromSource(lines: string[]): string | null {
  if (lines.length && /^id:\s*(\S+)/i.test(lines[0])) {
    const match = lines[0].match(/^id:\s*(\S+)/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function processFoodItem(
  plugin: MacrosPlugin,
  foodQuery: string,
  specifiedQuantity?: number | null
): MacroRow | null {
  try {
    if (!foodQuery || foodQuery.trim() === '') {
      return null;
    }

    // Use centralized method from DataManager
    const matchingFile = plugin.dataManager.findFoodFile(foodQuery);

    if (!matchingFile) {
      plugin.logger.error(`No matching food file found for query: ${foodQuery}`);
      return null;
    }

    try {
      const nutrition = processNutritionalData(plugin.app, matchingFile, specifiedQuantity);

      if (!nutrition) {
        plugin.logger.error(`Failed to process nutritional data from file: ${matchingFile.path}`);
        return null;
      }

      if (!nutrition.name || nutrition.name.trim() === '') {
        nutrition.name = foodQuery;
      }

      if (!nutrition.serving || nutrition.serving.trim() === '') {
        nutrition.serving = specifiedQuantity ? `${specifiedQuantity}g` : 'Standard';
      }

      const roundedRow: MacroRow = {
        name: nutrition.name,
        serving: nutrition.serving,
        calories: parseFloat(nutrition.calories.toFixed(1)),
        protein: parseFloat((isNaN(nutrition.protein) ? 0 : nutrition.protein).toFixed(1)),
        fat: parseFloat((isNaN(nutrition.fat) ? 0 : nutrition.fat).toFixed(1)),
        carbs: parseFloat((isNaN(nutrition.carbs) ? 0 : nutrition.carbs).toFixed(1)),
        macroLine: foodQuery + (specifiedQuantity ? `:${specifiedQuantity}g` : ''),
      };

      return roundedRow;
    } catch (nutritionError) {
      plugin.logger.error(
        `Error processing nutritional data for ${matchingFile.path}:`,
        nutritionError
      );
      return null;
    }
  } catch (error) {
    plugin.logger.error(`Error processing food item "${foodQuery}":`, error);
    return null;
  }
}

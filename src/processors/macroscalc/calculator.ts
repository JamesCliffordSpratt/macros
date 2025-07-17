import MacrosPlugin from '@/main';
import { MacroTotals } from '../../utils';

export interface CalcBreakdown {
  id: string;
  totals: MacroTotals;
}

interface CalcResult {
  aggregate: MacroTotals;
  breakdown: CalcBreakdown[];
}

export async function processNutritionalDataFromLines(
  plugin: MacrosPlugin,
  ids: string[]
): Promise<CalcResult> {
  const aggregate: MacroTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const breakdown: CalcBreakdown[] = [];

  // Add debug logging
  plugin.logger.debug(`Processing nutrition data for ${ids.length} IDs: ${ids.join(', ')}`);

  for (const id of ids) {
    const total: MacroTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };

    // Get the raw data from the cache (should include bullet points)
    const tableLines = plugin.macroService.macroTables.get(id);
    if (!tableLines) {
      plugin.logger.debug(`No table lines found for ID: ${id}`);
      continue;
    }

    plugin.logger.debug(`Processing ${tableLines.length} raw lines for ID: ${id}`);

    // CRITICAL FIX: Use MacroService's calculateMacrosFromLinesAsync to get consistent processing
    // This ensures the same merging and processing logic as used in the main macros processor
    try {
      const result = await plugin.macroService.calculateMacrosFromLinesAsync(tableLines);

      total.calories = result.calories;
      total.protein = result.protein;
      total.fat = result.fat;
      total.carbs = result.carbs;

      plugin.logger.debug(
        `MacroService calculated totals for ${id}: calories=${total.calories.toFixed(1)}, protein=${total.protein.toFixed(1)}g, fat=${total.fat.toFixed(1)}g, carbs=${total.carbs.toFixed(1)}g`
      );
    } catch (error) {
      plugin.logger.error(`Error calculating macros for ID ${id}:`, error);
      continue;
    }

    // Add the totals for this ID
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

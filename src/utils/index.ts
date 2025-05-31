import { findMatchingFoodFile } from './file';
import {
  parseGrams,
  extractServingSize,
  extractNutritionalData,
  escapeRegExp,
  normalizeName,
} from './parsing';
import {
  calculatePieChartAngles,
  createPieChartLegend,
  renderMacronutrientPieChart,
  cleanupMacroCharts,
} from './charts';
import {
  processNutritionalData as processNutritionData,
  mergeMacroLines as mergeMacroLinesNutrition,
  calculateConsistentCalories,
} from './nutrition';

// Import classes for re-export
import { DOMUtils } from './DOMUtils';
import { ChartLoader } from './ChartLoader';

// Export from other modules that don't have conflicts
export * from './constants';
export * from './types';
export * from './formatters';
export * from './MacrosState';
export * from './progress-bars';
export {
  TooltipManager,
  attachTooltip,
  attachLazyTooltip,
  safeAttachTooltip,
} from './TooltipManager';

// Export from DOMUtils
export { DOMUtils };

// Export ChartLoader with unique names
export { ChartLoader };
export { ensureChartJsLoaded } from './ChartLoader';

// Explicitly re-export the functions that had ambiguity issues
// File utils
export { findMatchingFoodFile };

// From parsing
export { parseGrams, extractServingSize, extractNutritionalData, escapeRegExp, normalizeName };

// From charts
export {
  calculatePieChartAngles,
  createPieChartLegend,
  renderMacronutrientPieChart,
  cleanupMacroCharts,
};

// From nutrition - rename to avoid conflicts
export {
  processNutritionData as processNutritionalData,
  mergeMacroLinesNutrition as mergeMacroLines,
  calculateConsistentCalories,
};

// Re-export types to maintain backward compatibility
export type { MacroRow, NutritionData, MacroTotals, DailyTargets, Group } from './types';

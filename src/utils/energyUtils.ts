/**
 * Energy Unit Conversion Utilities
 * Handles conversion between kilocalories (kcal) and kilojoules (kJ)
 */

// Conversion factor: 1 kcal = 4.184 kJ
export const KCAL_TO_KJ_FACTOR = 4.184;

/**
 * Convert energy values between kcal and kJ
 * @param value The energy value to convert
 * @param fromUnit The source unit ('kcal' or 'kJ')
 * @param toUnit The target unit ('kcal' or 'kJ')
 * @returns Converted energy value
 */
export function convertEnergyUnit(
  value: number,
  fromUnit: 'kcal' | 'kJ',
  toUnit: 'kcal' | 'kJ'
): number {
  // If converting to the same unit, return the original value
  if (fromUnit === toUnit) {
    return value;
  }

  if (fromUnit === 'kcal' && toUnit === 'kJ') {
    // Convert kcal to kJ
    return value * KCAL_TO_KJ_FACTOR;
  } else if (fromUnit === 'kJ' && toUnit === 'kcal') {
    // Convert kJ to kcal
    return value / KCAL_TO_KJ_FACTOR;
  }

  // This should never happen with proper typing, but return original value as fallback
  return value;
}

/**
 * Convert kcal to kJ
 * @param kcal Value in kilocalories
 * @returns Value in kilojoules
 */
export function kcalToKj(kcal: number): number {
  return kcal * KCAL_TO_KJ_FACTOR;
}

/**
 * Convert kJ to kcal
 * @param kj Value in kilojoules
 * @returns Value in kilocalories
 */
export function kjToKcal(kj: number): number {
  return kj / KCAL_TO_KJ_FACTOR;
}

/**
 * Format energy value with proper unit display
 * @param valueInKcal Energy value in kcal (internal storage format)
 * @param displayUnit The unit to display ('kcal' or 'kJ')
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted energy string with unit
 */
export function formatEnergyValue(
  valueInKcal: number,
  displayUnit: 'kcal' | 'kJ',
  decimals: number = 1
): string {
  const convertedValue = convertEnergyUnit(valueInKcal, 'kcal', displayUnit);
  return `${convertedValue.toFixed(decimals)} ${displayUnit}`;
}

/**
 * Parse energy input and convert to kcal (internal storage format)
 * @param input Energy input string (e.g., "2000 kcal" or "8368 kJ")
 * @returns Energy value in kcal, or null if parsing fails
 */
export function parseEnergyInput(input: string): number | null {
  const trimmed = input.trim().toLowerCase();

  // Extract number and unit
  const match = trimmed.match(/^([\d.]+)\s*(kcal|kj|cal)?$/);
  if (!match) {
    return null;
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'kcal'; // Default to kcal if no unit specified

  if (isNaN(value) || value < 0) {
    return null;
  }

  // Convert to kcal (internal storage format)
  if (unit === 'kj') {
    return kjToKcal(value);
  } else {
    // 'kcal' or 'cal' (treat 'cal' as 'kcal' for dietary purposes)
    return value;
  }
}

/**
 * Get energy unit display name with proper localization
 * @param unit Energy unit ('kcal' or 'kJ')
 * @returns Display name for the unit
 */
export function getEnergyUnitDisplayName(unit: 'kcal' | 'kJ'): string {
  switch (unit) {
    case 'kcal':
      return 'Kilocalories (kcal)';
    case 'kJ':
      return 'Kilojoules (kJ)';
    default:
      return unit;
  }
}

/**
 * Validate energy unit
 * @param unit String to validate
 * @returns True if valid energy unit
 */
export function isValidEnergyUnit(unit: string): unit is 'kcal' | 'kJ' {
  return unit === 'kcal' || unit === 'kJ';
}

/**
 * Get the opposite energy unit
 * @param unit Current energy unit
 * @returns Opposite energy unit
 */
export function getOppositeEnergyUnit(unit: 'kcal' | 'kJ'): 'kcal' | 'kJ' {
  return unit === 'kcal' ? 'kJ' : 'kcal';
}

/**
 * Calculate energy from macronutrients (Atwater factors)
 * @param protein Protein in grams
 * @param fat Fat in grams
 * @param carbs Carbohydrates in grams
 * @param alcohol Alcohol in grams (optional, default: 0)
 * @returns Energy in kcal
 */
export function calculateEnergyFromMacros(
  protein: number,
  fat: number,
  carbs: number,
  alcohol: number = 0
): number {
  // Atwater factors (kcal per gram)
  const PROTEIN_KCAL_PER_G = 4;
  const FAT_KCAL_PER_G = 9;
  const CARBS_KCAL_PER_G = 4;
  const ALCOHOL_KCAL_PER_G = 7;

  return (
    protein * PROTEIN_KCAL_PER_G +
    fat * FAT_KCAL_PER_G +
    carbs * CARBS_KCAL_PER_G +
    alcohol * ALCOHOL_KCAL_PER_G
  );
}

/**
 * Convert energy target between units while maintaining precision
 * @param target Target value in current unit
 * @param fromUnit Source unit
 * @param toUnit Target unit
 * @returns Converted target value, rounded to appropriate precision
 */
export function convertEnergyTarget(
  target: number,
  fromUnit: 'kcal' | 'kJ',
  toUnit: 'kcal' | 'kJ'
): number {
  const converted = convertEnergyUnit(target, fromUnit, toUnit);

  // Round to appropriate precision based on unit
  if (toUnit === 'kJ') {
    // kJ values are typically larger, round to nearest integer
    return Math.round(converted);
  } else {
    // kcal values can have one decimal place
    return Math.round(converted * 10) / 10;
  }
}

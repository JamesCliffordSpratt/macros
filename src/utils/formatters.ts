/**
 * Consolidated formatters for Macros Plugin
 * Provides standard formatting functions for all macro components
 */

/**
 * Formats a numeric value as grams with intelligent decimal handling
 * @param value The numeric value to format
 * @returns Formatted string with 'g' suffix
 */
export function formatGrams(value: number): string {
  // If the value is a whole number, don't show decimal
  if (Number.isInteger(value)) {
    return `${value}g`;
  }
  // Otherwise, show one decimal place
  return `${value.toFixed(1)}g`;
}

/**
 * Formats a numeric value as calories with intelligent decimal handling
 * @param value The numeric value to format
 * @returns Formatted string
 */
export function formatCalories(value: number): string {
  // If the value is a whole number, don't show decimal
  if (Number.isInteger(value)) {
    return value.toString();
  }
  // Otherwise, show one decimal place
  return value.toFixed(1);
}

/**
 * Formats a percentage value with no decimal places
 * @param value The percentage value to format
 * @returns Formatted string without % symbol
 */
export function formatPercentage(value: number): string {
  return value.toFixed(0); // returns just "58"
}

/**
 * Formats a percentage value with % symbol
 * @param value The percentage value to format
 * @returns Formatted string with % symbol
 */
export function formatPercentageWithSymbol(value: number): string {
  return `${value.toFixed(0)}%`; // returns "58%"
}

/**
 * Format a tooltip with consistent styling
 * @param value The numeric value
 * @param target The target value
 * @param label The label (e.g., "Protein")
 * @param options Display options
 * @returns Formatted tooltip string
 */
export function formatTooltip(
  value: number,
  target: number,
  label: string,
  options = { showPercentage: true, showTarget: true }
): string {
  const percentage = target > 0 ? (value / target) * 100 : 0;
  const suffix = label === 'Calories' ? '' : 'g';
  const formattedValue = `${value.toFixed(1)}${suffix}`;
  let tooltip = `${formattedValue} ${label.toLowerCase()}`;

  if (options.showPercentage && target > 0) {
    tooltip += ` • ${Math.round(percentage)}% of daily target`;
  }

  if (options.showTarget && target > 0) {
    const remaining = Math.abs(target - value);
    const rounded = Number.isInteger(remaining) ? remaining.toFixed(0) : remaining.toFixed(1);

    tooltip += value > target ? ` • ${rounded}${suffix} over` : ` • ${rounded}${suffix} remaining`;
  }

  if (percentage >= 100) {
    tooltip += ' (Target exceeded)';
  } else if (percentage >= 80) {
    tooltip += ' (Approaching target)';
  }

  return tooltip.trim();
}

/**
 * Formats a tooltip specifically for dashboard elements
 * with consistent styling and full information
 * @param value The numeric value
 * @param target The target value
 * @param label The label (e.g., "Protein")
 * @returns Formatted tooltip string
 */
export function formatDashboardTooltip(value: number, target: number, label: string): string {
  const percentage = target > 0 ? (value / target) * 100 : 0;
  const suffix = label === 'Calories' ? '' : 'g';
  const formattedValue = `${value}${suffix}`;
  const lowerLabel = label.toLowerCase();
  const status =
    percentage >= 100 ? '(Target exceeded)' : percentage >= 80 ? '(Approaching target)' : '';

  let tooltip = `${formattedValue} ${lowerLabel} • ${Math.round(percentage)}% of daily target`;

  // Calculate remaining or over
  if (target > 0) {
    const remaining = Math.abs(target - value);

    // Round nicely — no .0 if unnecessary
    const roundedRemaining = Number.isInteger(remaining)
      ? remaining.toFixed(0)
      : remaining.toFixed(1);

    if (value > target) {
      tooltip += ` • ${roundedRemaining}${suffix} over`;
    } else if (value < target) {
      tooltip += ` • ${roundedRemaining}${suffix} remaining`;
    }
  }

  // Add status if any
  if (status) {
    tooltip += ` ${status}`;
  }

  return tooltip.trim();
}

/**
 * Format a header for summary based on an ID (typically a date)
 * @param id The ID string (usually a date in YYYY-MM-DD format)
 * @returns Formatted header string
 */
export function getSummaryHeader(id: string): string {
  return formatDateHeader(id);
}

/**
 * Format a date-based header with human-readable text
 * @param id The ID string (usually a date in YYYY-MM-DD format)
 * @returns Formatted date header
 */
export function formatDateHeader(id: string): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(id);

  if (!isValidDate) return 'Summary';
  if (id === todayStr) return "Today's Summary";
  if (id === yesterdayStr) return "Yesterday's Summary";

  const date = new Date(id);
  const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  return `${date.toLocaleDateString(undefined, options)} Summary`;
}

/**
 * Format a value based on its type (calories, grams, etc.)
 * @param value The numeric value
 * @param type The type of value (calories, protein, fat, carbs)
 * @returns Formatted string
 */
export function formatValue(value: number, type: string): string {
  switch (type) {
    case 'calories':
      return formatCalories(value);
    case 'protein':
    case 'fat':
    case 'carbs':
      return formatGrams(value);
    default:
      return value.toFixed(1);
  }
}

/**
 * Format a macro value based on its type
 * Alias of formatValue for backward compatibility
 * @param value The numeric value
 * @param type The type of macro
 * @returns Formatted string
 */
export function formatMacroValue(value: number, type: string): string {
  return formatValue(value, type);
}

/**
 * Format a tooltip showing item details
 * @param name The food item name
 * @param calories Calorie value
 * @param protein Protein value in grams
 * @param fat Fat value in grams
 * @param carbs Carbs value in grams
 * @returns Formatted tooltip string
 */
export function formatItemTooltip(
  name: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number
): string {
  const total = protein + fat + carbs;
  const proteinPercent = total > 0 ? (protein / total) * 100 : 0;
  const fatPercent = total > 0 ? (fat / total) * 100 : 0;
  const carbsPercent = total > 0 ? (carbs / total) * 100 : 0;

  return `${name}
Calories: ${formatCalories(calories)}
Protein: ${formatGrams(protein)} (${formatPercentageWithSymbol(proteinPercent)})
Fat: ${formatGrams(fat)} (${formatPercentageWithSymbol(fatPercent)})
Carbs: ${formatGrams(carbs)} (${formatPercentageWithSymbol(carbsPercent)})`;
}

/**
 * Format a macro cell tooltip
 * @param macroLabel The macro label (e.g., "Protein")
 * @param value The numeric value
 * @param percentage The percentage value
 * @returns Formatted tooltip string
 */
export function formatMacroTooltip(macroLabel: string, value: number, percentage: number): string {
  const lowerMacro = macroLabel.toLowerCase();

  if (value === 0) {
    return `${macroLabel}: ${formatGrams(value)}`;
  }

  return `${macroLabel}: ${formatGrams(value)} • ${formatPercentageWithSymbol(percentage)} of daily ${lowerMacro} target`;
}

/**
 * Format remaining values with appropriate suffix and message
 * @param value The remaining value (can be negative for "over")
 * @param type The type of value (calories, protein, fat, carbs)
 * @returns Formatted string
 */
export function formatRemainingValue(value: number, type: string): string {
  const formattedValue = formatValue(value, type);
  if (value < 0) {
    return `${formattedValue} (over)`;
  } else if (value === 0) {
    return type === 'calories' ? '0' : '0.0g';
  } else {
    return formattedValue;
  }
}

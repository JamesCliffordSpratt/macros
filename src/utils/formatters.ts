import MacrosPlugin from '../main';
import { convertEnergyUnit } from './energyUtils';
import { t } from '../lang/I18nManager';

// Store a reference to the plugin instance for accessing settings
let formatterPlugin: MacrosPlugin | null = null;

/**
 * Set the plugin instance for formatters to access settings
 * This should be called during plugin initialization
 */
export function setFormatterPlugin(plugin: MacrosPlugin): void {
  formatterPlugin = plugin;
}

/**
 * Get the current energy unit setting
 */
function getCurrentEnergyUnit(): 'kcal' | 'kJ' {
  return formatterPlugin?.settings?.energyUnit || 'kcal';
}

/**
 * Format calories with proper unit conversion based on settings
 * @param calories Calorie value in kcal
 * @returns Formatted string with appropriate unit
 */
export function formatCalories(calories: number): string {
  if (!formatterPlugin) {
    // Fallback if plugin not set
    return `${calories.toFixed(1)} kcal`;
  }

  const currentUnit = getCurrentEnergyUnit();

  if (currentUnit === 'kJ') {
    const kj = convertEnergyUnit(calories, 'kcal', 'kJ');
    return `${kj.toFixed(1)} kJ`;
  } else {
    return `${calories.toFixed(1)} kcal`;
  }
}

/**
 * Format grams with one decimal place
 * @param grams Gram value
 * @returns Formatted string
 */
export function formatGrams(grams: number): string {
  return `${grams.toFixed(1)}g`;
}

/**
 * Format percentage with no decimal places
 * @param percentage Percentage value
 * @returns Formatted string
 */
export function formatPercentage(percentage: number): string {
  return Math.round(percentage).toString();
}

/**
 * Generate tooltip text for dashboard metric cards
 * @param currentValue Current consumed value
 * @param targetValue Target value
 * @param macroName Name of the macro (for translation)
 * @returns Formatted tooltip string
 */
export function formatDashboardTooltip(
  currentValue: number,
  targetValue: number,
  macroName: string
): string {
  const percentage = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;
  const remaining = targetValue - currentValue;

  let tooltipText = `${currentValue.toFixed(1)}g ${macroName.toLowerCase()} • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')}`;

  if (remaining > 0) {
    tooltipText += ` • ${remaining.toFixed(1)}g ${t('general.remaining')}`;
  } else if (remaining < 0) {
    tooltipText += ` • ${Math.abs(remaining).toFixed(1)}g ${t('table.summary.over')}`;
  }

  return tooltipText;
}

/**
 * Get summary header text based on ID
 * @param id The macro table ID
 * @returns Localized header text
 */
export function getSummaryHeader(id: string): string {
  if (!id) {
    return t('table.summary.macrosSummary');
  }

  // Check if it's a date format (YYYY-MM-DD)
  const dateMatch = id.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Compare dates (ignoring time)
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();

    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate();

    if (isToday) {
      return t('table.summary.today');
    } else if (isYesterday) {
      return t('table.summary.yesterday');
    } else {
      // Format the date nicely for other dates
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      };

      // Get the user's locale from the plugin if available
      let locale = 'en-US'; // Default fallback
      if (formatterPlugin?.i18nManager) {
        locale = formatterPlugin.i18nManager.getCurrentLocale();

        // Map some common locale codes to full locales for better date formatting
        const localeMap: Record<string, string> = {
          en: 'en-US',
          es: 'es-ES',
          fr: 'fr-FR',
          de: 'de-DE',
          it: 'it-IT',
          pt: 'pt-PT',
          ja: 'ja-JP',
          ko: 'ko-KR',
          'zh-CN': 'zh-CN',
          'zh-TW': 'zh-TW',
          ru: 'ru-RU',
          ar: 'ar-SA',
          he: 'he-IL',
        };

        locale = localeMap[locale] || locale;
      }

      const formattedDate = date.toLocaleDateString(locale, options);
      return t('table.summary.date', { date: formattedDate });
    }
  }

  // For non-date IDs, just return a generic summary
  return t('table.summary.macrosSummary');
}

/**
 * Format calories for tooltips with proper unit handling
 * @param calories Calorie value in kcal
 * @param target Target calorie value in kcal
 * @param percentage Percentage of target
 * @returns Formatted tooltip string
 */
export function formatCalorieTooltip(calories: number, target: number, percentage: number): string {
  if (!formatterPlugin) {
    // Fallback if plugin not set
    const remaining = target - calories;
    if (remaining > 0) {
      return `${calories.toFixed(1)} kcal • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')} • ${remaining.toFixed(1)} kcal ${t('general.remaining')}`;
    } else {
      return `${calories.toFixed(1)} kcal • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')} • ${Math.abs(remaining).toFixed(1)} kcal ${t('table.summary.over')}`;
    }
  }

  const currentUnit = getCurrentEnergyUnit();

  if (currentUnit === 'kJ') {
    const consumedKj = convertEnergyUnit(calories, 'kcal', 'kJ');
    const targetKj = convertEnergyUnit(target, 'kcal', 'kJ');
    const remainingKj = targetKj - consumedKj;

    let tooltipText = `${consumedKj.toFixed(1)} kJ • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')}`;

    if (remainingKj > 0) {
      tooltipText += ` • ${remainingKj.toFixed(1)} kJ ${t('general.remaining')}`;
    } else if (remainingKj < 0) {
      tooltipText += ` • ${Math.abs(remainingKj).toFixed(1)} kJ ${t('table.summary.over')}`;
    }

    return tooltipText;
  } else {
    const remaining = target - calories;

    let tooltipText = `${calories.toFixed(1)} kcal • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')}`;

    if (remaining > 0) {
      tooltipText += ` • ${remaining.toFixed(1)} kcal ${t('general.remaining')}`;
    } else if (remaining < 0) {
      tooltipText += ` • ${Math.abs(remaining).toFixed(1)} kcal ${t('table.summary.over')}`;
    }

    return tooltipText;
  }
}

/**
 * Format macro composition tooltip
 * @param macro Macro name
 * @param value Macro value in grams
 * @param percentage Percentage of total macros
 * @returns Formatted tooltip string
 */
export function formatMacroCompositionTooltip(
  macro: string,
  value: number,
  percentage: number
): string {
  return t('tooltips.macroComposition', {
    value: value.toFixed(1),
    macro: macro.toLowerCase(),
    percent: Math.round(percentage).toString(),
  });
}

/**
 * Format target tooltip
 * @param target Target value
 * @param unit Unit (g, kcal, kJ)
 * @returns Formatted tooltip string
 */
export function formatTargetTooltip(target: number, unit: string): string {
  return t('tooltips.target', {
    target: target.toString(),
    unit: unit,
  });
}

/**
 * Format percentage tooltip for macro cells
 * @param value Macro value in grams
 * @param macro Macro name
 * @param percentage Percentage of daily target
 * @param target Daily target value
 * @returns Formatted tooltip string
 */
export function formatMacroPercentageTooltip(
  value: number,
  macro: string,
  percentage: number,
  target: number
): string {
  const remaining = target - value;

  let tooltipText = t('tooltips.percentage', {
    value: value.toFixed(1),
    macro: macro.toLowerCase(),
    percent: Math.round(percentage).toString(),
  });

  if (remaining > 0) {
    tooltipText += ` • ${remaining.toFixed(1)}g ${t('general.remaining')}`;
  } else if (remaining < 0) {
    tooltipText += ` • ${t('tooltips.over', { over: Math.abs(remaining).toFixed(1) })}`;
  }

  return tooltipText;
}

/**
 * Format energy value with automatic unit conversion
 * @param valueInKcal Energy value in kcal
 * @param showUnit Whether to include the unit in the output
 * @returns Formatted energy string
 */
export function formatEnergy(valueInKcal: number, showUnit: boolean = true): string {
  if (!formatterPlugin) {
    return showUnit ? `${valueInKcal.toFixed(1)} kcal` : valueInKcal.toFixed(1);
  }

  const currentUnit = getCurrentEnergyUnit();

  if (currentUnit === 'kJ') {
    const kj = convertEnergyUnit(valueInKcal, 'kcal', 'kJ');
    return showUnit ? `${kj.toFixed(1)} kJ` : kj.toFixed(1);
  } else {
    return showUnit ? `${valueInKcal.toFixed(1)} kcal` : valueInKcal.toFixed(1);
  }
}

/**
 * Get the current energy unit as a string
 * @returns Current energy unit setting
 */
export function getCurrentEnergyUnitString(): string {
  const unit = getCurrentEnergyUnit();
  return unit === 'kJ' ? 'kJ' : 'kcal';
}

/**
 * Format a number with appropriate decimal places
 * @param value Numeric value
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted number string
 */
export function formatNumber(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

/**
 * Format meal summary text
 * @param mealName Name of the meal
 * @param itemCount Number of items in the meal
 * @param calories Total calories
 * @returns Formatted meal summary
 */
export function formatMealSummary(mealName: string, itemCount: number, calories: number): string {
  const calorieText = formatCalories(calories);
  const itemText = t('table.meal.items', { count: itemCount.toString() });
  return `${mealName} (${itemText}, ${calorieText})`;
}

/**
 * Format remaining/over values for summary rows
 * @param remaining Remaining value (negative if over target)
 * @param unit Unit string
 * @returns Formatted remaining/over string
 */
export function formatRemaining(remaining: number, unit: string): string {
  if (remaining < 0) {
    return `${formatNumber(Math.abs(remaining))}${unit} (${t('table.summary.over')})`;
  } else if (remaining === 0) {
    return `0${unit}`;
  } else {
    return `${formatNumber(remaining)}${unit}`;
  }
}

/**
 * Format chart title based on IDs
 * @param title Optional explicit title
 * @param ids Array of table IDs
 * @returns Formatted chart title
 */
export function formatChartTitle(title?: string, ids?: string[]): string {
  if (title) {
    return title;
  }

  if (!ids || ids.length === 0) {
    return t('charts.title');
  }

  if (ids.length === 1) {
    const id = ids[0];

    // Check if it's a date format (YYYY-MM-DD)
    const dateMatch = id.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      // Compare dates (ignoring time)
      const isToday =
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();

      const isYesterday =
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate();

      if (isToday) {
        return t('charts.title');
      } else if (isYesterday) {
        return t('charts.titleDate', { date: t('dates.yesterday') });
      } else {
        // Format the date nicely for other dates
        const options: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        };

        // Get the user's locale from the plugin if available
        let locale = 'en-US'; // Default fallback
        if (formatterPlugin?.i18nManager) {
          locale = formatterPlugin.i18nManager.getCurrentLocale();

          // Map some common locale codes to full locales for better date formatting
          const localeMap: Record<string, string> = {
            en: 'en-US',
            es: 'es-ES',
            fr: 'fr-FR',
            de: 'de-DE',
            it: 'it-IT',
            pt: 'pt-PT',
            ja: 'ja-JP',
            ko: 'ko-KR',
            'zh-CN': 'zh-CN',
            'zh-TW': 'zh-TW',
            ru: 'ru-RU',
            ar: 'ar-SA',
            he: 'he-IL',
          };

          locale = localeMap[locale] || locale;
        }

        const formattedDate = date.toLocaleDateString(locale, options);
        return t('charts.titleDate', { date: formattedDate });
      }
    }

    // For non-date single IDs
    return t('charts.titleDate', { date: id });
  }

  // Multiple IDs
  const allDates = ids.every((id) => /^\d{4}-\d{2}-\d{2}$/.test(id));

  if (allDates) {
    return t('charts.titleCombined', { days: ids.length.toString() });
  } else {
    return t('charts.titleMultiple', { ids: ids.join(', ') });
  }
}

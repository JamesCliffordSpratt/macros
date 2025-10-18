import { MacroscalcMetric, MetricValue, MetricData } from '../MetricsRegistry';
import { MetricsCalculator } from '../MetricsCalculator';
import { t } from '../../../../lang/I18nManager';

export class RatiosMetric implements MacroscalcMetric {
  id = 'ratios';
  name = t('metrics.ratios.name');
  description = t('metrics.ratios.description');
  category = 'ratios' as const;
  defaultEnabled = true;
  configurable = false;

  calculate(data: MetricData): MetricValue[] {
    const results: MetricValue[] = [];
    // Use totals instead of aggregate
    const { totals } = data;

    if (totals.calories <= 0) return results;

    // Calculate caloric ratios using standard conversion factors
    const proteinCalories = totals.protein * 4; // 4 kcal per gram
    const fatCalories = totals.fat * 9; // 9 kcal per gram
    const carbsCalories = totals.carbs * 4; // 4 kcal per gram

    const totalMacroCalories = proteinCalories + fatCalories + carbsCalories;

    if (totalMacroCalories <= 0) return results;

    const proteinPercent = (proteinCalories / totalMacroCalories) * 100;
    const fatPercent = (fatCalories / totalMacroCalories) * 100;
    const carbsPercent = (carbsCalories / totalMacroCalories) * 100;

    results.push({
      label: t('metrics.ratios.proteinPercent'),
      value: `${MetricsCalculator.formatValue(proteinPercent, 0)}%`,
      color: '#4caf50',
      tooltip: t('metrics.ratios.proteinPercentTooltip', {
        percent: MetricsCalculator.formatValue(proteinPercent, 1),
        grams: MetricsCalculator.formatValue(totals.protein, 1),
        calories: MetricsCalculator.formatValue(proteinCalories, 0),
      }),
    });

    results.push({
      label: t('metrics.ratios.fatPercent'),
      value: `${MetricsCalculator.formatValue(fatPercent, 0)}%`,
      color: '#f44336',
      tooltip: t('metrics.ratios.fatPercentTooltip', {
        percent: MetricsCalculator.formatValue(fatPercent, 1),
        grams: MetricsCalculator.formatValue(totals.fat, 1),
        calories: MetricsCalculator.formatValue(fatCalories, 0),
      }),
    });

    results.push({
      label: t('metrics.ratios.carbsPercent'),
      value: `${MetricsCalculator.formatValue(carbsPercent, 0)}%`,
      color: '#2196f3',
      tooltip: t('metrics.ratios.carbsPercentTooltip', {
        percent: MetricsCalculator.formatValue(carbsPercent, 1),
        grams: MetricsCalculator.formatValue(totals.carbs, 1),
        calories: MetricsCalculator.formatValue(carbsCalories, 0),
      }),
    });

    return results;
  }
}

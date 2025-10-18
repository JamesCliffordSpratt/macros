import { MacroscalcMetric, MetricValue, MetricData } from '../MetricsRegistry';
import { MetricsCalculator } from '../MetricsCalculator';
import { getCurrentEnergyUnitString } from '../../../../utils/formatters';
import { convertEnergyUnit } from '../../../../utils/energyUtils';
import { t } from '../../../../lang/I18nManager';

export class TotalsAndAveragesMetric implements MacroscalcMetric {
  id = 'totals-averages';
  name = t('metrics.totalsAverages.name');
  description = t('metrics.totalsAverages.description');
  category = 'totals' as const;
  defaultEnabled = true;
  configurable = false;

  calculate(data: MetricData): MetricValue[] {
    const results: MetricValue[] = [];
    const { breakdown, dateIds, totals } = data; // Use totals from data

    if (breakdown.length === 0) return results;

    const range = MetricsCalculator.calculateDateRange(dateIds);
    const dayCount = range?.dayCount || breakdown.length;

    // Use the totals directly (this is the aggregate)
    const aggregateTotals = totals;

    // Calculate averages
    const averages = {
      calories: aggregateTotals.calories / dayCount,
      protein: aggregateTotals.protein / dayCount,
      fat: aggregateTotals.fat / dayCount,
      carbs: aggregateTotals.carbs / dayCount,
    };

    // Format time range
    const timeRange = range
      ? MetricsCalculator.formatDateRange(range.start, range.end)
      : `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;

    // Energy unit handling
    const currentEnergyUnit = getCurrentEnergyUnitString();
    let totalCaloriesValue: string;
    let avgCaloriesValue: string;

    if (currentEnergyUnit === 'kJ') {
      const totalKj = convertEnergyUnit(aggregateTotals.calories, 'kcal', 'kJ');
      const avgKj = convertEnergyUnit(averages.calories, 'kcal', 'kJ');
      totalCaloriesValue = `${MetricsCalculator.formatValue(totalKj, 0)} kJ`;
      avgCaloriesValue = `${MetricsCalculator.formatValue(avgKj, 0)} kJ`;
    } else {
      totalCaloriesValue = `${MetricsCalculator.formatValue(aggregateTotals.calories, 0)} kcal`;
      avgCaloriesValue = `${MetricsCalculator.formatValue(averages.calories, 0)} kcal`;
    }

    // Add metrics
    results.push({
      label: t('metrics.totalsAverages.totalCalories'),
      value: totalCaloriesValue,
      subtext: timeRange,
      tooltip: t('metrics.totalsAverages.totalCaloriesTooltip', {
        days: dayCount.toString(),
        total: totalCaloriesValue,
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.avgCalories'),
      value: avgCaloriesValue,
      subtext: t('metrics.totalsAverages.perDay'),
      tooltip: t('metrics.totalsAverages.avgCaloriesTooltip', {
        avg: avgCaloriesValue,
        days: dayCount.toString(),
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.totalProtein'),
      value: `${MetricsCalculator.formatValue(aggregateTotals.protein, 0)}g`,
      subtext: timeRange,
      tooltip: t('metrics.totalsAverages.totalProteinTooltip', {
        total: MetricsCalculator.formatValue(aggregateTotals.protein, 0),
        days: dayCount.toString(),
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.avgProtein'),
      value: `${MetricsCalculator.formatValue(averages.protein)}g`,
      subtext: t('metrics.totalsAverages.perDay'),
      tooltip: t('metrics.totalsAverages.avgProteinTooltip', {
        avg: MetricsCalculator.formatValue(averages.protein),
        days: dayCount.toString(),
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.totalFat'),
      value: `${MetricsCalculator.formatValue(aggregateTotals.fat, 0)}g`,
      subtext: timeRange,
      tooltip: t('metrics.totalsAverages.totalFatTooltip', {
        total: MetricsCalculator.formatValue(aggregateTotals.fat, 0),
        days: dayCount.toString(),
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.avgFat'),
      value: `${MetricsCalculator.formatValue(averages.fat)}g`,
      subtext: t('metrics.totalsAverages.perDay'),
      tooltip: t('metrics.totalsAverages.avgFatTooltip', {
        avg: MetricsCalculator.formatValue(averages.fat),
        days: dayCount.toString(),
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.totalCarbs'),
      value: `${MetricsCalculator.formatValue(aggregateTotals.carbs, 0)}g`,
      subtext: timeRange,
      tooltip: t('metrics.totalsAverages.totalCarbsTooltip', {
        total: MetricsCalculator.formatValue(aggregateTotals.carbs, 0),
        days: dayCount.toString(),
      }),
    });

    results.push({
      label: t('metrics.totalsAverages.avgCarbs'),
      value: `${MetricsCalculator.formatValue(averages.carbs)}g`,
      subtext: t('metrics.totalsAverages.perDay'),
      tooltip: t('metrics.totalsAverages.avgCarbsTooltip', {
        avg: MetricsCalculator.formatValue(averages.carbs),
        days: dayCount.toString(),
      }),
    });

    return results;
  }
}

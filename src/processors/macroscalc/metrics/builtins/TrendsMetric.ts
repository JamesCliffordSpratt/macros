import { MacroscalcMetric, MetricValue, MetricData } from '../MetricsRegistry';
import { MetricsCalculator } from '../MetricsCalculator';
import { t } from '../../../../lang/I18nManager';
import { convertEnergyUnit } from '../../../../utils/energyUtils';
import { getCurrentEnergyUnitString } from '../../../../utils/formatters';

export class TrendsMetric implements MacroscalcMetric {
  id = 'trends';
  name = t('metrics.trends.name');
  description = t('metrics.trends.description');
  category = 'trends' as const;
  defaultEnabled = false;
  configurable = false; // Changed from true to false since we no longer need configuration

  calculate(data: MetricData): MetricValue[] {
    const results: MetricValue[] = [];
    const { breakdown, dateIds } = data;

    // Automatically determine window size based on the number of date IDs provided
    // Filter to only valid date IDs in case there are non-date IDs mixed in
    const validDateIds = dateIds.filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id));
    const windowSize = validDateIds.length > 0 ? validDateIds.length : breakdown.length;

    if (breakdown.length < windowSize || windowSize < 2) {
      results.push({
        label: t('metrics.trends.insufficientData'),
        value: t('metrics.trends.needMoreDays', { needed: '2' }), // Minimum 2 days for a trend
        subtext: t('metrics.trends.currentDays', { current: breakdown.length.toString() }),
      });
      return results;
    }

    // Convert breakdown to date-value pairs and sort by date
    const dataPoints = breakdown
      .map((item) => {
        const match = item.id.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
          const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          return {
            date,
            id: item.id,
            calories: item.totals.calories,
            protein: item.totals.protein,
            fat: item.totals.fat,
            carbs: item.totals.carbs,
          };
        }
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (dataPoints.length < windowSize) {
      results.push({
        label: t('metrics.trends.insufficientData'),
        value: t('metrics.trends.needMoreDays', { needed: windowSize.toString() }),
        subtext: t('metrics.trends.currentDays', { current: dataPoints.length.toString() }),
      });
      return results;
    }

    // Calculate rolling averages for all macros
    const calorieData = dataPoints.map((p) => ({ date: p.date, value: p.calories }));
    const proteinData = dataPoints.map((p) => ({ date: p.date, value: p.protein }));
    const fatData = dataPoints.map((p) => ({ date: p.date, value: p.fat }));
    const carbsData = dataPoints.map((p) => ({ date: p.date, value: p.carbs }));

    const rollingCalories = MetricsCalculator.calculateRollingAverage(calorieData, windowSize);
    const rollingProtein = MetricsCalculator.calculateRollingAverage(proteinData, windowSize);
    const rollingFat = MetricsCalculator.calculateRollingAverage(fatData, windowSize);
    const rollingCarbs = MetricsCalculator.calculateRollingAverage(carbsData, windowSize);

    if (rollingCalories.length === 0) {
      // If we don't have enough data for a rolling average of the full window size,
      // just calculate the simple average of all available data
      const avgCalories = dataPoints.reduce((sum, p) => sum + p.calories, 0) / dataPoints.length;
      const avgProtein = dataPoints.reduce((sum, p) => sum + p.protein, 0) / dataPoints.length;
      const avgFat = dataPoints.reduce((sum, p) => sum + p.fat, 0) / dataPoints.length;
      const avgCarbs = dataPoints.reduce((sum, p) => sum + p.carbs, 0) / dataPoints.length;

      const currentEnergyUnit = getCurrentEnergyUnitString();
      let calorieValue: string;

      if (currentEnergyUnit === 'kJ') {
        const kjValue = convertEnergyUnit(avgCalories, 'kcal', 'kJ');
        calorieValue = `${MetricsCalculator.formatValue(kjValue, 0)} kJ`;
      } else {
        calorieValue = `${MetricsCalculator.formatValue(avgCalories, 0)} kcal`;
      }

      results.push({
        label: t('metrics.trends.avgCalories', { days: dataPoints.length.toString() }),
        value: calorieValue,
        subtext: `${dataPoints.length} ${t('metrics.trends.daysAvailable')}`,
        tooltip: t('metrics.trends.simpleAvgTooltip', {
          days: dataPoints.length.toString(),
          value: calorieValue,
        }),
      });

      results.push({
        label: t('metrics.trends.avgProtein', { days: dataPoints.length.toString() }),
        value: `${MetricsCalculator.formatValue(avgProtein)}g`,
        subtext: `${dataPoints.length} ${t('metrics.trends.daysAvailable')}`,
        tooltip: t('metrics.trends.simpleAvgTooltip', {
          days: dataPoints.length.toString(),
          value: `${MetricsCalculator.formatValue(avgProtein)}g`,
        }),
      });

      results.push({
        label: t('metrics.trends.avgFat', { days: dataPoints.length.toString() }),
        value: `${MetricsCalculator.formatValue(avgFat)}g`,
        subtext: `${dataPoints.length} ${t('metrics.trends.daysAvailable')}`,
        tooltip: t('metrics.trends.simpleAvgTooltip', {
          days: dataPoints.length.toString(),
          value: `${MetricsCalculator.formatValue(avgFat)}g`,
        }),
      });

      results.push({
        label: t('metrics.trends.avgCarbs', { days: dataPoints.length.toString() }),
        value: `${MetricsCalculator.formatValue(avgCarbs)}g`,
        subtext: `${dataPoints.length} ${t('metrics.trends.daysAvailable')}`,
        tooltip: t('metrics.trends.simpleAvgTooltip', {
          days: dataPoints.length.toString(),
          value: `${MetricsCalculator.formatValue(avgCarbs)}g`,
        }),
      });

      return results;
    }

    // Get the most recent rolling averages
    const latestCalorieAvg = rollingCalories[rollingCalories.length - 1];
    const latestProteinAvg = rollingProtein[rollingProtein.length - 1];
    const latestFatAvg = rollingFat[rollingFat.length - 1];
    const latestCarbsAvg = rollingCarbs[rollingCarbs.length - 1];

    // Energy unit handling
    const currentEnergyUnit = getCurrentEnergyUnitString();
    let calorieValue: string;

    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(latestCalorieAvg.value, 'kcal', 'kJ');
      calorieValue = `${MetricsCalculator.formatValue(kjValue, 0)} kJ`;
    } else {
      calorieValue = `${MetricsCalculator.formatValue(latestCalorieAvg.value, 0)} kcal`;
    }

    // Add all rolling average metrics with dynamic window size
    results.push({
      label: t('metrics.trends.rollingAvgCalories', { days: windowSize.toString() }),
      value: calorieValue,
      subtext: `${t('metrics.trends.through')} ${MetricsCalculator.formatDate(latestCalorieAvg.date)}`,
      tooltip: t('metrics.trends.rollingAvgCaloriesTooltip', {
        days: windowSize.toString(),
        value: calorieValue,
        endDate: MetricsCalculator.formatDate(latestCalorieAvg.date),
      }),
    });

    results.push({
      label: t('metrics.trends.rollingAvgProtein', { days: windowSize.toString() }),
      value: `${MetricsCalculator.formatValue(latestProteinAvg.value)}g`,
      subtext: `${t('metrics.trends.through')} ${MetricsCalculator.formatDate(latestProteinAvg.date)}`,
      tooltip: t('metrics.trends.rollingAvgProteinTooltip', {
        days: windowSize.toString(),
        value: MetricsCalculator.formatValue(latestProteinAvg.value),
        endDate: MetricsCalculator.formatDate(latestProteinAvg.date),
      }),
    });

    results.push({
      label: t('metrics.trends.rollingAvgFat', { days: windowSize.toString() }),
      value: `${MetricsCalculator.formatValue(latestFatAvg.value)}g`,
      subtext: `${t('metrics.trends.through')} ${MetricsCalculator.formatDate(latestFatAvg.date)}`,
      tooltip: t('metrics.trends.rollingAvgFatTooltip', {
        days: windowSize.toString(),
        value: MetricsCalculator.formatValue(latestFatAvg.value),
        endDate: MetricsCalculator.formatDate(latestFatAvg.date),
      }),
    });

    results.push({
      label: t('metrics.trends.rollingAvgCarbs', { days: windowSize.toString() }),
      value: `${MetricsCalculator.formatValue(latestCarbsAvg.value)}g`,
      subtext: `${t('metrics.trends.through')} ${MetricsCalculator.formatDate(latestCarbsAvg.date)}`,
      tooltip: t('metrics.trends.rollingAvgCarbsTooltip', {
        days: windowSize.toString(),
        value: MetricsCalculator.formatValue(latestCarbsAvg.value),
        endDate: MetricsCalculator.formatDate(latestCarbsAvg.date),
      }),
    });

    return results;
  }
}

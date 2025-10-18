import { MacroscalcMetric, MetricValue, MetricData } from '../MetricsRegistry';
import { MetricsCalculator } from '../MetricsCalculator';
import { t } from '../../../../lang/I18nManager';
import { convertEnergyUnit } from '../../../../utils/energyUtils';
import { getCurrentEnergyUnitString } from '../../../../utils/formatters';

export class ExtremesMetric implements MacroscalcMetric {
  id = 'extremes';
  name = t('metrics.extremes.name');
  description = t('metrics.extremes.description');
  category = 'extremes' as const;
  defaultEnabled = true;
  configurable = false;

  calculate(data: MetricData): MetricValue[] {
    const results: MetricValue[] = [];
    const { breakdown } = data;

    if (breakdown.length === 0) return results;

    // Prepare data for extremes calculation
    const calorieData = breakdown.map((item) => ({
      id: item.id,
      value: item.totals.calories,
    }));

    const proteinData = breakdown.map((item) => ({
      id: item.id,
      value: item.totals.protein,
    }));

    const fatData = breakdown.map((item) => ({
      id: item.id,
      value: item.totals.fat,
    }));

    const carbsData = breakdown.map((item) => ({
      id: item.id,
      value: item.totals.carbs,
    }));

    // Find extremes for all macros
    const maxCalories = MetricsCalculator.findExtreme(calorieData, 'max');
    const minCalories = MetricsCalculator.findExtreme(calorieData, 'min');
    const maxProtein = MetricsCalculator.findExtreme(proteinData, 'max');
    const minProtein = MetricsCalculator.findExtreme(proteinData, 'min');
    const maxFat = MetricsCalculator.findExtreme(fatData, 'max');
    const minFat = MetricsCalculator.findExtreme(fatData, 'min');
    const maxCarbs = MetricsCalculator.findExtreme(carbsData, 'max');
    const minCarbs = MetricsCalculator.findExtreme(carbsData, 'min');

    // Format date for display
    const formatDateId = (id: string): string => {
      const match = id.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        return MetricsCalculator.formatDate(date);
      }
      return id;
    };

    // Energy unit handling for calories
    const currentEnergyUnit = getCurrentEnergyUnitString();

    if (maxCalories && minCalories) {
      let maxCalorieValue: string;
      let minCalorieValue: string;

      if (currentEnergyUnit === 'kJ') {
        const maxKj = convertEnergyUnit(maxCalories.value, 'kcal', 'kJ');
        const minKj = convertEnergyUnit(minCalories.value, 'kcal', 'kJ');
        maxCalorieValue = `${MetricsCalculator.formatValue(maxKj, 0)} kJ`;
        minCalorieValue = `${MetricsCalculator.formatValue(minKj, 0)} kJ`;
      } else {
        maxCalorieValue = `${MetricsCalculator.formatValue(maxCalories.value, 0)} kcal`;
        minCalorieValue = `${MetricsCalculator.formatValue(minCalories.value, 0)} kcal`;
      }

      results.push({
        label: t('metrics.extremes.maxCalories'),
        value: maxCalorieValue,
        subtext: formatDateId(maxCalories.id),
        tooltip: t('metrics.extremes.maxCaloriesTooltip', {
          value: maxCalorieValue,
          date: formatDateId(maxCalories.id),
        }),
      });

      results.push({
        label: t('metrics.extremes.minCalories'),
        value: minCalorieValue,
        subtext: formatDateId(minCalories.id),
        tooltip: t('metrics.extremes.minCaloriesTooltip', {
          value: minCalorieValue,
          date: formatDateId(minCalories.id),
        }),
      });
    }

    // Protein extremes
    if (maxProtein && minProtein) {
      results.push({
        label: t('metrics.extremes.maxProtein'),
        value: `${MetricsCalculator.formatValue(maxProtein.value, 1)}g`,
        subtext: formatDateId(maxProtein.id),
        tooltip: t('metrics.extremes.maxProteinTooltip', {
          value: MetricsCalculator.formatValue(maxProtein.value, 1),
          date: formatDateId(maxProtein.id),
        }),
      });

      results.push({
        label: t('metrics.extremes.minProtein'),
        value: `${MetricsCalculator.formatValue(minProtein.value, 1)}g`,
        subtext: formatDateId(minProtein.id),
        tooltip: t('metrics.extremes.minProteinTooltip', {
          value: MetricsCalculator.formatValue(minProtein.value, 1),
          date: formatDateId(minProtein.id),
        }),
      });
    }

    // Fat extremes
    if (maxFat && minFat) {
      results.push({
        label: t('metrics.extremes.maxFat'),
        value: `${MetricsCalculator.formatValue(maxFat.value, 1)}g`,
        subtext: formatDateId(maxFat.id),
        tooltip: t('metrics.extremes.maxFatTooltip', {
          value: MetricsCalculator.formatValue(maxFat.value, 1),
          date: formatDateId(maxFat.id),
        }),
      });

      results.push({
        label: t('metrics.extremes.minFat'),
        value: `${MetricsCalculator.formatValue(minFat.value, 1)}g`,
        subtext: formatDateId(minFat.id),
        tooltip: t('metrics.extremes.minFatTooltip', {
          value: MetricsCalculator.formatValue(minFat.value, 1),
          date: formatDateId(minFat.id),
        }),
      });
    }

    // Carbs extremes
    if (maxCarbs && minCarbs) {
      results.push({
        label: t('metrics.extremes.maxCarbs'),
        value: `${MetricsCalculator.formatValue(maxCarbs.value, 1)}g`,
        subtext: formatDateId(maxCarbs.id),
        tooltip: t('metrics.extremes.maxCarbsTooltip', {
          value: MetricsCalculator.formatValue(maxCarbs.value, 1),
          date: formatDateId(maxCarbs.id),
        }),
      });

      results.push({
        label: t('metrics.extremes.minCarbs'),
        value: `${MetricsCalculator.formatValue(minCarbs.value, 1)}g`,
        subtext: formatDateId(minCarbs.id),
        tooltip: t('metrics.extremes.minCarbsTooltip', {
          value: MetricsCalculator.formatValue(minCarbs.value, 1),
          date: formatDateId(minCarbs.id),
        }),
      });
    }

    return results;
  }
}

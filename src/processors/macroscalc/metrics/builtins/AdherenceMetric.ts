import { MacroscalcMetric, MetricValue, MetricData, MetricConfig } from '../MetricsRegistry';
import { MetricsCalculator } from '../MetricsCalculator';
import { Setting } from 'obsidian';
import { t } from '../../../../lang/I18nManager';

export class AdherenceMetric implements MacroscalcMetric {
  id = 'adherence';
  name = t('metrics.adherence.name');
  description = t('metrics.adherence.description');
  category = 'adherence' as const;
  defaultEnabled = false;
  configurable = true;

  getConfigUI() {
    return {
      render: (
        container: HTMLElement,
        config: Record<string, any>,
        onChange: (config: Record<string, any>) => void
      ) => {
        new Setting(container)
          .setName(t('metrics.adherence.calorieTolerance'))
          .setDesc(t('metrics.adherence.calorieToleranceDesc'))
          .addSlider((slider) => {
            slider
              .setLimits(5, 25, 5)
              .setValue(config.calorieTolerance || 10)
              .setDynamicTooltip()
              .onChange((value) => {
                config.calorieTolerance = value;
                onChange(config);
              });
          });

        new Setting(container)
          .setName(t('metrics.adherence.proteinTolerance'))
          .setDesc(t('metrics.adherence.proteinToleranceDesc'))
          .addSlider((slider) => {
            slider
              .setLimits(5, 25, 5)
              .setValue(config.proteinTolerance || 10)
              .setDynamicTooltip()
              .onChange((value) => {
                config.proteinTolerance = value;
                onChange(config);
              });
          });

        new Setting(container)
          .setName(t('metrics.adherence.fatTolerance'))
          .setDesc(t('metrics.adherence.fatToleranceDesc'))
          .addSlider((slider) => {
            slider
              .setLimits(5, 25, 5)
              .setValue(config.fatTolerance || 15)
              .setDynamicTooltip()
              .onChange((value) => {
                config.fatTolerance = value;
                onChange(config);
              });
          });

        new Setting(container)
          .setName(t('metrics.adherence.carbsTolerance'))
          .setDesc(t('metrics.adherence.carbsToleranceDesc'))
          .addSlider((slider) => {
            slider
              .setLimits(5, 25, 5)
              .setValue(config.carbsTolerance || 15)
              .setDynamicTooltip()
              .onChange((value) => {
                config.carbsTolerance = value;
                onChange(config);
              });
          });
      },
      getDefaultConfig: () => ({
        calorieTolerance: 10,
        proteinTolerance: 10,
        fatTolerance: 15,
        carbsTolerance: 15,
      }),
    };
  }

  calculate(data: MetricData & { configs?: MetricConfig[] }): MetricValue[] {
    const results: MetricValue[] = [];
    const { breakdown, targets } = data;

    // Get the actual config from the saved configs
    let config = {
      calorieTolerance: 10,
      proteinTolerance: 10,
      fatTolerance: 15,
      carbsTolerance: 15,
    };

    // If configs are passed with the data, find this metric's config
    if (data.configs) {
      const adherenceConfig = data.configs.find((c) => c.id === 'adherence');
      if (adherenceConfig && adherenceConfig.settings) {
        config = {
          calorieTolerance: adherenceConfig.settings.calorieTolerance || 10,
          proteinTolerance: adherenceConfig.settings.proteinTolerance || 10,
          fatTolerance: adherenceConfig.settings.fatTolerance || 15,
          carbsTolerance: adherenceConfig.settings.carbsTolerance || 15,
        };
      }
    }

    if (breakdown.length === 0) return results;

    // Prepare data sorted by date for streak calculations
    const sortedData = breakdown
      .map((item) => {
        const match = item.id.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
          const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          return {
            date,
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

    // Calculate adherence percentages for all macros
    const calorieData = breakdown.map((item) => ({ value: item.totals.calories }));
    const proteinData = breakdown.map((item) => ({ value: item.totals.protein }));
    const fatData = breakdown.map((item) => ({ value: item.totals.fat }));
    const carbsData = breakdown.map((item) => ({ value: item.totals.carbs }));

    const calorieAdherence = MetricsCalculator.calculateAdherencePercentage(
      calorieData,
      targets.calories,
      config.calorieTolerance
    );

    const proteinAdherence = MetricsCalculator.calculateAdherencePercentage(
      proteinData,
      targets.protein,
      config.proteinTolerance
    );

    const fatAdherence = MetricsCalculator.calculateAdherencePercentage(
      fatData,
      targets.fat,
      config.fatTolerance
    );

    const carbsAdherence = MetricsCalculator.calculateAdherencePercentage(
      carbsData,
      targets.carbs,
      config.carbsTolerance
    );

    // Calculate current streaks for all macros WITH TOLERANCE
    const calorieStreak = MetricsCalculator.calculateStreak(
      sortedData.map((item) => ({ value: item.calories })),
      targets.calories,
      config.calorieTolerance
    );

    const proteinStreak = MetricsCalculator.calculateStreak(
      sortedData.map((item) => ({ value: item.protein })),
      targets.protein,
      config.proteinTolerance
    );

    const fatStreak = MetricsCalculator.calculateStreak(
      sortedData.map((item) => ({ value: item.fat })),
      targets.fat,
      config.fatTolerance
    );

    const carbsStreak = MetricsCalculator.calculateStreak(
      sortedData.map((item) => ({ value: item.carbs })),
      targets.carbs,
      config.carbsTolerance
    );

    // Calculate longest streaks for all macros
    const longestCalorieStreak = MetricsCalculator.calculateLongestStreak(
      sortedData.map((item) => ({ date: item.date, value: item.calories })),
      targets.calories,
      config.calorieTolerance
    );

    const longestProteinStreak = MetricsCalculator.calculateLongestStreak(
      sortedData.map((item) => ({ date: item.date, value: item.protein })),
      targets.protein,
      config.proteinTolerance
    );

    const longestFatStreak = MetricsCalculator.calculateLongestStreak(
      sortedData.map((item) => ({ date: item.date, value: item.fat })),
      targets.fat,
      config.fatTolerance
    );

    const longestCarbsStreak = MetricsCalculator.calculateLongestStreak(
      sortedData.map((item) => ({ date: item.date, value: item.carbs })),
      targets.carbs,
      config.carbsTolerance
    );

    // Add adherence metrics
    results.push({
      label: t('metrics.adherence.calorieAdherence'),
      value: `${MetricsCalculator.formatValue(calorieAdherence, 0)}%`,
      subtext: t('metrics.adherence.withinTolerance', {
        tolerance: config.calorieTolerance.toString(),
      }),
      tooltip: t('metrics.adherence.calorieAdherenceTooltip', {
        percent: MetricsCalculator.formatValue(calorieAdherence, 1),
        tolerance: config.calorieTolerance.toString(),
        target: targets.calories.toString(),
        days: breakdown.length.toString(),
      }),
    });

    results.push({
      label: t('metrics.adherence.proteinAdherence'),
      value: `${MetricsCalculator.formatValue(proteinAdherence, 0)}%`,
      subtext: t('metrics.adherence.withinTolerance', {
        tolerance: config.proteinTolerance.toString(),
      }),
      tooltip: t('metrics.adherence.proteinAdherenceTooltip', {
        percent: MetricsCalculator.formatValue(proteinAdherence, 1),
        tolerance: config.proteinTolerance.toString(),
        target: targets.protein.toString(),
        days: breakdown.length.toString(),
      }),
    });

    results.push({
      label: t('metrics.adherence.fatAdherence'),
      value: `${MetricsCalculator.formatValue(fatAdherence, 0)}%`,
      subtext: t('metrics.adherence.withinTolerance', {
        tolerance: config.fatTolerance.toString(),
      }),
      tooltip: t('metrics.adherence.fatAdherenceTooltip', {
        percent: MetricsCalculator.formatValue(fatAdherence, 1),
        tolerance: config.fatTolerance.toString(),
        target: targets.fat.toString(),
        days: breakdown.length.toString(),
      }),
    });

    results.push({
      label: t('metrics.adherence.carbsAdherence'),
      value: `${MetricsCalculator.formatValue(carbsAdherence, 0)}%`,
      subtext: t('metrics.adherence.withinTolerance', {
        tolerance: config.carbsTolerance.toString(),
      }),
      tooltip: t('metrics.adherence.carbsAdherenceTooltip', {
        percent: MetricsCalculator.formatValue(carbsAdherence, 1),
        tolerance: config.carbsTolerance.toString(),
        target: targets.carbs.toString(),
        days: breakdown.length.toString(),
      }),
    });

    // Add current streak metrics
    results.push({
      label: t('metrics.adherence.calorieStreak'),
      value: calorieStreak.toString(),
      subtext: calorieStreak === 1 ? t('metrics.adherence.day') : t('metrics.adherence.days'),
      tooltip: t('metrics.adherence.calorieStreakTooltipWithTolerance', {
        streak: calorieStreak.toString(),
        target: targets.calories.toString(),
        tolerance: config.calorieTolerance.toString(),
      }),
    });

    results.push({
      label: t('metrics.adherence.proteinStreak'),
      value: proteinStreak.toString(),
      subtext: proteinStreak === 1 ? t('metrics.adherence.day') : t('metrics.adherence.days'),
      tooltip: t('metrics.adherence.proteinStreakTooltipWithTolerance', {
        streak: proteinStreak.toString(),
        target: targets.protein.toString(),
        tolerance: config.proteinTolerance.toString(),
      }),
    });

    results.push({
      label: t('metrics.adherence.fatStreak'),
      value: fatStreak.toString(),
      subtext: fatStreak === 1 ? t('metrics.adherence.day') : t('metrics.adherence.days'),
      tooltip: t('metrics.adherence.fatStreakTooltipWithTolerance', {
        streak: fatStreak.toString(),
        target: targets.fat.toString(),
        tolerance: config.fatTolerance.toString(),
      }),
    });

    results.push({
      label: t('metrics.adherence.carbsStreak'),
      value: carbsStreak.toString(),
      subtext: carbsStreak === 1 ? t('metrics.adherence.day') : t('metrics.adherence.days'),
      tooltip: t('metrics.adherence.carbsStreakTooltipWithTolerance', {
        streak: carbsStreak.toString(),
        target: targets.carbs.toString(),
        tolerance: config.carbsTolerance.toString(),
      }),
    });

    // Add longest streak metrics - always show all four
    results.push({
      label: t('metrics.adherence.longestCalorieStreak'),
      value: longestCalorieStreak.length.toString(),
      subtext:
        longestCalorieStreak.length > 0 &&
        longestCalorieStreak.startDate &&
        longestCalorieStreak.endDate
          ? longestCalorieStreak.length === 1
            ? MetricsCalculator.formatDate(longestCalorieStreak.startDate)
            : MetricsCalculator.formatDateRange(
                longestCalorieStreak.startDate,
                longestCalorieStreak.endDate
              )
          : t('metrics.adherence.noStreak'),
      tooltip:
        longestCalorieStreak.length > 0 &&
        longestCalorieStreak.startDate &&
        longestCalorieStreak.endDate
          ? t('metrics.adherence.longestCalorieStreakTooltip', {
              streak: longestCalorieStreak.length.toString(),
              target: targets.calories.toString(),
              tolerance: config.calorieTolerance.toString(),
              dateRange: MetricsCalculator.formatDateRange(
                longestCalorieStreak.startDate,
                longestCalorieStreak.endDate
              ),
            })
          : t('metrics.adherence.noStreakTooltip', {
              target: targets.calories.toString(),
              tolerance: config.calorieTolerance.toString(),
            }),
    });

    results.push({
      label: t('metrics.adherence.longestProteinStreak'),
      value: longestProteinStreak.length.toString(),
      subtext:
        longestProteinStreak.length > 0 &&
        longestProteinStreak.startDate &&
        longestProteinStreak.endDate
          ? longestProteinStreak.length === 1
            ? MetricsCalculator.formatDate(longestProteinStreak.startDate)
            : MetricsCalculator.formatDateRange(
                longestProteinStreak.startDate,
                longestProteinStreak.endDate
              )
          : t('metrics.adherence.noStreak'),
      tooltip:
        longestProteinStreak.length > 0 &&
        longestProteinStreak.startDate &&
        longestProteinStreak.endDate
          ? t('metrics.adherence.longestProteinStreakTooltip', {
              streak: longestProteinStreak.length.toString(),
              target: targets.protein.toString(),
              tolerance: config.proteinTolerance.toString(),
              dateRange: MetricsCalculator.formatDateRange(
                longestProteinStreak.startDate,
                longestProteinStreak.endDate
              ),
            })
          : t('metrics.adherence.noStreakTooltip', {
              target: targets.protein.toString(),
              tolerance: config.proteinTolerance.toString(),
            }),
    });

    results.push({
      label: t('metrics.adherence.longestFatStreak'),
      value: longestFatStreak.length.toString(),
      subtext:
        longestFatStreak.length > 0 && longestFatStreak.startDate && longestFatStreak.endDate
          ? longestFatStreak.length === 1
            ? MetricsCalculator.formatDate(longestFatStreak.startDate)
            : MetricsCalculator.formatDateRange(
                longestFatStreak.startDate,
                longestFatStreak.endDate
              )
          : t('metrics.adherence.noStreak'),
      tooltip:
        longestFatStreak.length > 0 && longestFatStreak.startDate && longestFatStreak.endDate
          ? t('metrics.adherence.longestFatStreakTooltip', {
              streak: longestFatStreak.length.toString(),
              target: targets.fat.toString(),
              tolerance: config.fatTolerance.toString(),
              dateRange: MetricsCalculator.formatDateRange(
                longestFatStreak.startDate,
                longestFatStreak.endDate
              ),
            })
          : t('metrics.adherence.noStreakTooltip', {
              target: targets.fat.toString(),
              tolerance: config.fatTolerance.toString(),
            }),
    });

    results.push({
      label: t('metrics.adherence.longestCarbsStreak'),
      value: longestCarbsStreak.length.toString(),
      subtext:
        longestCarbsStreak.length > 0 && longestCarbsStreak.startDate && longestCarbsStreak.endDate
          ? longestCarbsStreak.length === 1
            ? MetricsCalculator.formatDate(longestCarbsStreak.startDate)
            : MetricsCalculator.formatDateRange(
                longestCarbsStreak.startDate,
                longestCarbsStreak.endDate
              )
          : t('metrics.adherence.noStreak'),
      tooltip:
        longestCarbsStreak.length > 0 && longestCarbsStreak.startDate && longestCarbsStreak.endDate
          ? t('metrics.adherence.longestCarbsStreakTooltip', {
              streak: longestCarbsStreak.length.toString(),
              target: targets.carbs.toString(),
              tolerance: config.carbsTolerance.toString(),
              dateRange: MetricsCalculator.formatDateRange(
                longestCarbsStreak.startDate,
                longestCarbsStreak.endDate
              ),
            })
          : t('metrics.adherence.noStreakTooltip', {
              target: targets.carbs.toString(),
              tolerance: config.carbsTolerance.toString(),
            }),
    });

    return results;
  }
}

import MacrosPlugin from './../../main';
import {
  safeAttachTooltip,
  MacroTotals,
  DailyTargets,
  CLASS_NAMES,
  MACRO_TYPES,
  MacrosState,
} from '../../utils';
import {
  formatDashboardTooltip,
  getSummaryHeader,
  formatCalories,
  formatGrams,
} from '../../utils/formatters';
import { t } from '../../lang/I18nManager';

export class MacrosDashboard {
  private container: HTMLElement;
  private id: string;
  private plugin: MacrosPlugin;
  private dashboardHeader: HTMLElement | null = null;
  private dashboardContent: HTMLElement | null = null;
  private toggleIcon: HTMLElement | null = null;
  private state: MacrosState | null = null;

  constructor(container: HTMLElement, id: string, plugin: MacrosPlugin) {
    this.container = container;
    this.id = id;
    this.plugin = plugin;

    if (this.id) {
      this.state = new MacrosState(plugin, id, 'dashboard');
    }
  }

  create(combinedTotals: MacroTotals, dailyTargets: DailyTargets): void {
    try {
      const dashboardContainer = this.container.createDiv({ cls: CLASS_NAMES.DASHBOARD.CONTAINER });

      this.dashboardHeader = dashboardContainer.createDiv({
        cls: `${CLASS_NAMES.DASHBOARD.HEADER} collapsible-header`,
      });

      this.dashboardHeader.dataset.dashboardId = this.id;

      const headerContent = dashboardContainer.createDiv({ cls: 'header-content' });
      const headerText = getSummaryHeader(this.id);

      headerContent.createSpan({
        cls: 'header-label',
        text: headerText,
      });

      this.toggleIcon = headerContent.createSpan({ cls: 'toggle-icon' });
      this.toggleIcon.dataset.dashboardId = this.id;

      this.dashboardHeader.appendChild(headerContent);

      this.dashboardContent = dashboardContainer.createDiv({
        cls: `${CLASS_NAMES.DASHBOARD.CONTENT} collapsible-content`,
      });

      this.dashboardContent.dataset.dashboardId = this.id;

      const caloriePercentage = (combinedTotals.calories / dailyTargets.calories) * 100;
      const proteinPercentage = (combinedTotals.protein / dailyTargets.protein) * 100;
      const fatPercentage = (combinedTotals.fat / dailyTargets.fat) * 100;
      const carbsPercentage = (combinedTotals.carbs / dailyTargets.carbs) * 100;

      // FIXED: Pass raw calorie value for accurate tooltip calculation
      this.createMetricCard(
        this.dashboardContent,
        t('table.headers.calories'),
        formatCalories(combinedTotals.calories),
        dailyTargets.calories,
        caloriePercentage,
        MACRO_TYPES.CALORIES,
        combinedTotals.calories // Pass the raw kcal value
      );
      this.createMetricCard(
        this.dashboardContent,
        t('table.headers.protein'),
        formatGrams(combinedTotals.protein),
        dailyTargets.protein,
        proteinPercentage,
        MACRO_TYPES.PROTEIN
      );
      this.createMetricCard(
        this.dashboardContent,
        t('table.headers.fat'),
        formatGrams(combinedTotals.fat),
        dailyTargets.fat,
        fatPercentage,
        MACRO_TYPES.FAT
      );
      this.createMetricCard(
        this.dashboardContent,
        t('table.headers.carbs'),
        formatGrams(combinedTotals.carbs),
        dailyTargets.carbs,
        carbsPercentage,
        MACRO_TYPES.CARBS
      );

      const isCollapsed = this.loadCollapsedState();
      if (isCollapsed && this.dashboardHeader && this.dashboardContent && this.toggleIcon) {
        this.dashboardHeader.classList.add('collapsed');
        this.dashboardContent.classList.add('collapsed');
        this.toggleIcon.classList.add('collapsed');
      }

      const clickHandler = () => {
        if (this.dashboardHeader && this.dashboardContent && this.toggleIcon) {
          const isCurrentlyCollapsed = this.dashboardHeader.classList.contains('collapsed');
          const newCollapsedState = !isCurrentlyCollapsed;

          if (newCollapsedState) {
            this.dashboardHeader.classList.add('collapsed');
            this.dashboardContent.classList.add('collapsed');
            this.toggleIcon.classList.add('collapsed');
          } else {
            this.dashboardHeader.classList.remove('collapsed');
            this.dashboardContent.classList.remove('collapsed');
            this.toggleIcon.classList.remove('collapsed');
          }

          this.saveCollapsedState(newCollapsedState);
        }
      };

      if (this.dashboardHeader) {
        this.plugin.registerDomListener(this.dashboardHeader, 'click', clickHandler);
      }
    } catch (error) {
      this.plugin.logger.error('Error creating dashboard:', error);
    }
  }

  private saveCollapsedState(isCollapsed: boolean): void {
    if (this.state) {
      this.state.saveCollapsedState('dashboard', isCollapsed);
      this.plugin.logger.debug(`Saved dashboard collapsed state: ${isCollapsed}`);
    }
  }

  private loadCollapsedState(): boolean {
    if (this.state) {
      const isCollapsed = this.state.getCollapsedState('dashboard');
      this.plugin.logger.debug(`Loaded dashboard collapsed state: ${isCollapsed}`);
      return isCollapsed;
    }
    return false;
  }

  createMetricCard(
    container: HTMLElement,
    label: string,
    value: string,
    target: number,
    percentage: number,
    macroType: string,
    rawValue?: number // Optional raw value for accurate tooltip calculation
  ): void {
    try {
      const card = container.createDiv({
        cls: `${CLASS_NAMES.DASHBOARD.METRIC_CARD} macroscalc-metric-card ${macroType}-card`,
      });

      card.createDiv({
        cls: CLASS_NAMES.DASHBOARD.METRIC_LABEL,
        text: label,
      });

      const valueContainer = card.createDiv({ cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE_CONTAINER });

      valueContainer.createDiv({
        cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE,
        text: value,
      });

      // Create custom tooltip with proper energy unit handling and Chinese word order
      let tooltipMessage: string;
      const currentLocale = this.plugin.i18nManager.getCurrentLocale();

      if (label === t('table.headers.calories')) {
        const currentUnit = this.plugin.settings.energyUnit;

        if (currentUnit === 'kJ') {
          // Create custom tooltip for kJ
          const rawKcalValue = rawValue || 0;
          const consumedKj = rawKcalValue * 4.184;
          const targetKj = target * 4.184;
          const remainingKj = targetKj - consumedKj;
          const percentage = targetKj > 0 ? (consumedKj / targetKj) * 100 : 0;

          if (currentLocale === 'zh-CN') {
            tooltipMessage = `${consumedKj.toFixed(1)} kJ • 占 ${Math.round(percentage)}%`;
            if (remainingKj > 0) {
              tooltipMessage += ` • 剩余 ${remainingKj.toFixed(1)} kJ`;
            } else if (remainingKj < 0) {
              tooltipMessage += ` • 超出 ${Math.abs(remainingKj).toFixed(1)} kJ`;
            }
          } else {
            tooltipMessage = `${consumedKj.toFixed(1)} kJ • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')}`;
            if (remainingKj > 0) {
              tooltipMessage += ` • ${remainingKj.toFixed(1)} kJ ${t('general.remaining')}`;
            } else if (remainingKj < 0) {
              tooltipMessage += ` • ${Math.abs(remainingKj).toFixed(1)} kJ ${t('table.summary.over')}`;
            }
          }
        } else {
          // Use original kcal values for kcal display
          const consumedKcal = rawValue || parseFloat(value.match(/^([\d.]+)/)?.[1] || '0');
          const targetKcal = target;
          const remainingKcal = targetKcal - consumedKcal;
          const percentage = targetKcal > 0 ? (consumedKcal / targetKcal) * 100 : 0;

          if (currentLocale === 'zh-CN') {
            tooltipMessage = `${consumedKcal.toFixed(1)} kcal • 占 ${Math.round(percentage)}%`;
            if (remainingKcal > 0) {
              tooltipMessage += ` • 剩余 ${remainingKcal.toFixed(1)} kcal`;
            } else if (remainingKcal < 0) {
              tooltipMessage += ` • 超出 ${Math.abs(remainingKcal).toFixed(1)} kcal`;
            }
          } else {
            tooltipMessage = `${consumedKcal.toFixed(1)} kcal • ${Math.round(percentage)}% ${t('table.summary.dailyTarget')}`;
            if (remainingKcal > 0) {
              tooltipMessage += ` • ${remainingKcal.toFixed(1)} kcal ${t('general.remaining')}`;
            } else if (remainingKcal < 0) {
              tooltipMessage += ` • ${Math.abs(remainingKcal).toFixed(1)} kcal ${t('table.summary.over')}`;
            }
          }
        }
      } else {
        // Use the standard formatDashboardTooltip for non-calorie metrics
        const numericValue = parseFloat(value.replace('g', ''));

        if (currentLocale === 'zh-CN') {
          const percentage = target > 0 ? (numericValue / target) * 100 : 0;
          const remaining = target - numericValue;

          tooltipMessage = `${numericValue.toFixed(1)} g ${label.toLowerCase()} • 占 ${Math.round(percentage)}%`;
          if (remaining > 0) {
            tooltipMessage += ` • 剩余 ${remaining.toFixed(1)} g`;
          } else if (remaining < 0) {
            tooltipMessage += ` • 超出 ${Math.abs(remaining).toFixed(1)} g`;
          }
        } else {
          tooltipMessage = formatDashboardTooltip(numericValue, target, label);
        }
      }

      safeAttachTooltip(card, tooltipMessage, this.plugin);

      valueContainer.createDiv({
        cls: CLASS_NAMES.DASHBOARD.METRIC_PERCENTAGE,
        text: `${Math.round(percentage)}%`,
      });

      const progressContainer = card.createDiv({
        cls: CLASS_NAMES.DASHBOARD.METRIC_PROGRESS_CONTAINER,
      });

      let statusClass: string = CLASS_NAMES.PROGRESS.UNDER_TARGET;
      if (percentage >= 100) {
        statusClass = CLASS_NAMES.PROGRESS.OVER_TARGET;
      } else if (percentage >= 80) {
        statusClass = CLASS_NAMES.PROGRESS.NEAR_TARGET;
      }

      const progressBar = progressContainer.createDiv({
        cls: `${CLASS_NAMES.DASHBOARD.METRIC_PROGRESS_BAR} ${macroType}-progress ${statusClass} progress-bar-width`,
      });

      const safeWidth = Math.min(100, percentage);
      const roundedWidth = Math.round(safeWidth / 5) * 5;
      progressBar.addClass(`progress-width-${roundedWidth}`);

      if (percentage > 115) {
        progressContainer.createDiv({
          cls: 'overflow-indicator',
          text: `+${Math.round(percentage - 100)}%`,
        });
      }

      const targetIndicator = progressContainer.createDiv({
        cls: `${CLASS_NAMES.DASHBOARD.METRIC_TARGET_INDICATOR} target-indicator-full`,
      });

      // Format target for tooltip with appropriate unit and conversion
      let targetValueForDisplay: string;
      let unit: string;

      if (label === t('table.headers.calories')) {
        const currentUnit = this.plugin.settings.energyUnit;
        if (currentUnit === 'kJ') {
          // Convert target from kcal to kJ for display
          const targetInKj = target * 4.184;
          targetValueForDisplay = Math.round(targetInKj).toString();
          unit = ' kJ';
        } else {
          targetValueForDisplay = target.toString();
          unit = ' kcal';
        }
      } else {
        targetValueForDisplay = target.toString();
        unit = 'g';
      }

      safeAttachTooltip(
        targetIndicator,
        t('tooltips.target', {
          target: targetValueForDisplay,
          unit: unit,
        }),
        this.plugin
      );
    } catch (error) {
      this.plugin.logger.error(`Error creating metric card for ${label}:`, error);
    }
  }

  public toggleCollapsed(isCollapsed: boolean): void {
    if (this.dashboardHeader && this.dashboardContent && this.toggleIcon) {
      if (isCollapsed) {
        this.dashboardHeader.classList.add('collapsed');
        this.dashboardContent.classList.add('collapsed');
        this.toggleIcon.classList.add('collapsed');
      } else {
        this.dashboardHeader.classList.remove('collapsed');
        this.dashboardContent.classList.remove('collapsed');
        this.toggleIcon.classList.remove('collapsed');
      }

      this.saveCollapsedState(isCollapsed);
    }
  }
}

import MacrosPlugin from '../../main';
import {
  formatCalories,
  formatGrams,
  formatPercentage,
  safeAttachTooltip,
  ChartLoader,
  CLASS_NAMES,
  MACRO_TYPES,
  MacroTotals,
  ProgressBarFactory,
  MacrosState,
  getCurrentEnergyUnitString,
} from '../../utils';
import { CalcBreakdown } from './calculator';
import { parseGrams } from '../../utils/parsingUtils';
import { findMatchingFoodFile } from '../../utils/fileUtils';
import { processNutritionalData } from '../../utils/nutritionUtils';
import { processNutritionalDataFromLines } from './calculator';
import { t } from '../../lang/I18nManager';
import { convertEnergyUnit } from '../../utils/energyUtils';
import {
  MetricsRegistry,
  MetricsEditModal,
  registerBuiltinMetrics,
  MetricConfig,
  MetricData,
} from './metrics';

interface ChartReference {
  chart: import('chart.js').Chart;
  caloriesChart: import('chart.js').Chart | null;
  resizeHandler: () => void;
}

export class MacrosCalcRenderer {
  private plugin: MacrosPlugin;
  public el: HTMLElement;
  private ids: string[];
  private sortConfig: { column: string; ascending: boolean } = { column: '', ascending: true };
  private expandedRows: Set<string> = new Set();
  private charts: ChartReference[] = [];
  private state: MacrosState | null;
  private isDashboardCollapsed = false;
  private needsDataRefresh = true;
  private chartLoader: ChartLoader = ChartLoader.getInstance();

  // Metrics system properties
  private metricsConfigs: MetricConfig[] = [];
  private lastCalculatedTotals: MacroTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  private lastBreakdownData: CalcBreakdown[] = [];

  constructor(plugin: MacrosPlugin, el: HTMLElement, ids: string[]) {
    this.plugin = plugin;
    this.el = el;
    this.ids = ids;

    const combinedId = this.ids.join('-');
    this.state = new MacrosState(plugin, combinedId, 'calc');

    // Initialize metrics system
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Register built-in metrics
    const registry = MetricsRegistry.getInstance();
    registerBuiltinMetrics(registry);

    // Load user's metric configurations
    this.loadMetricsConfig();
  }

  private loadMetricsConfig(): void {
    // Get saved configs from plugin settings
    const savedConfigs = this.plugin.settings.macroscalcMetricsConfigs || [];

    // If no saved configs, use defaults
    if (savedConfigs.length === 0) {
      const registry = MetricsRegistry.getInstance();
      this.metricsConfigs = registry.getAll().map((metric) => ({
        id: metric.id,
        enabled: metric.defaultEnabled,
        settings: metric.getConfigUI?.()?.getDefaultConfig() || {},
      }));
    } else {
      this.metricsConfigs = savedConfigs;
    }
  }

  private saveMetricsConfig(): void {
    this.plugin.settings.macroscalcMetricsConfigs = this.metricsConfigs;
    this.plugin.saveSettings();
  }

  // Add this method to get display options from metrics config
  private getDisplayOptions(): { showTable: boolean; showChart: boolean } {
    // Find the display options config
    const displayConfig = this.metricsConfigs.find((config) => config.id === 'display-options');

    if (displayConfig && displayConfig.enabled && displayConfig.settings) {
      return {
        showTable: displayConfig.settings.showTable !== false,
        showChart: displayConfig.settings.showChart !== false,
      };
    }

    // Default to showing both if no config found
    return { showTable: true, showChart: true };
  }

  public getIds(): string[] {
    return this.ids;
  }

  public setNeedsRefresh(): void {
    this.needsDataRefresh = true;
    this.plugin.logger.debug(`MacrosCalc renderer for ${this.ids.join(',')} marked for refresh`);
  }

  private saveDashboardCollapseState(isCollapsed: boolean): void {
    if (this.state) {
      this.state.saveCollapsedState('dashboard', isCollapsed);
    }
  }

  private loadDashboardCollapseState(): boolean {
    return this.state ? this.state.getCollapsedState('dashboard') : false;
  }

  async render(aggregate: MacroTotals, breakdown: CalcBreakdown[]): Promise<void> {
    // Always force fresh data fetch if needed
    if (this.needsDataRefresh) {
      this.plugin.logger.debug('MacrosCalc refresh triggered - reloading all data');

      for (const id of this.ids) {
        if (this.plugin.macroService.macroTables.has(id)) {
          this.plugin.macroService.macroTables.delete(id);
        }

        this.plugin.logger.debug(`MacrosCalc reloading data for ${id}`);
        const allLines = await this.plugin.dataManager.getFullMacrosData(id);

        if (allLines && allLines.length > 0) {
          this.plugin.logger.debug(
            `MacrosCalc loaded ${allLines.length} lines for ${id} (including bullet points)`
          );
          this.plugin.macroService.macroTables.set(id, allLines);
        } else {
          this.plugin.logger.debug(`No data found for ID ${id}`);
        }
      }

      this.needsDataRefresh = false;
    }

    // Always recalculate the aggregate and breakdown using the fixed calculator
    // But only if we don't already have cached totals (for display-only refreshes)
    let finalAggregate = aggregate;
    let finalBreakdown = breakdown;

    if (
      this.needsDataRefresh ||
      !this.lastCalculatedTotals ||
      this.lastCalculatedTotals.calories === 0
    ) {
      const { aggregate: freshAggregate, breakdown: freshBreakdown } =
        await processNutritionalDataFromLines(this.plugin, this.ids);

      this.plugin.logger.debug('MacrosCalc using fresh calculations:', {
        aggregate: freshAggregate,
        breakdown: freshBreakdown,
      });

      // Cache the calculations for metrics
      this.lastCalculatedTotals = freshAggregate;
      this.lastBreakdownData = freshBreakdown;

      finalAggregate = freshAggregate;
      finalBreakdown = freshBreakdown;
    } else {
      // Use cached data for display-only refreshes
      finalAggregate = this.lastCalculatedTotals;
      finalBreakdown = this.lastBreakdownData;
      this.plugin.logger.debug('MacrosCalc using cached calculations for display refresh');
    }

    // Get display options
    const displayOptions = this.getDisplayOptions();

    // Create a document fragment to batch DOM operations
    const fragment = document.createDocumentFragment();
    this.el.empty();

    // Load state from MacrosState
    this.isDashboardCollapsed = this.loadDashboardCollapseState();

    // Create dashboard summary at the top - use the FRESH aggregate data
    this.renderDashboard(fragment as unknown as HTMLElement, finalAggregate);

    // Only create the main table if showTable is enabled
    if (displayOptions.showTable) {
      // Create the main table with styling that matches other components
      const tableContainer = (fragment as unknown as HTMLElement).createDiv({
        cls: 'macroscalc-container',
      });

      // Apply initial collapse state to the table container
      if (this.isDashboardCollapsed) {
        tableContainer.classList.add('macroscalc-hidden');
      }

      const table = tableContainer.createEl('table', { cls: CLASS_NAMES.TABLE.CONTAINER });

      // Create header row with mobile-responsive headers
      const headerRow = table.insertRow();
      const headerData = [
        { text: t('calculator.tableHeaders.id'), mobileText: 'ID' },
        { text: t('table.headers.calories'), mobileText: 'Cal' },
        { text: t('table.headers.protein'), mobileText: 'Pro' },
        { text: t('table.headers.fat'), mobileText: 'Fat' },
        { text: t('table.headers.carbs'), mobileText: 'Carb' },
      ];

      headerData.forEach((headerInfo, index) => {
        const cell = headerRow.insertCell();

        const headerContainer = cell.createDiv({ cls: 'macroscalc-header-container' });

        headerContainer.createSpan({
          cls: 'header-text-desktop',
          text: headerInfo.text,
        });

        headerContainer.createSpan({
          cls: 'header-text-mobile',
          text: headerInfo.mobileText,
        });

        if (index > 0) {
          const sortButton = headerContainer.createSpan({ cls: 'macroscalc-sort-icon' });
          sortButton.setText('⇅');

          if (this.sortConfig.column === headerInfo.text) {
            sortButton.setText(this.sortConfig.ascending ? '↑' : '↓');
            sortButton.classList.add('active');
          }

          sortButton.addEventListener('click', () => {
            this.sortTable(table, headerInfo.text);
          });
        }

        cell.classList.add(CLASS_NAMES.TABLE.COLUMN_HEADER);

        if (headerInfo.text === t('table.headers.protein'))
          cell.classList.add(CLASS_NAMES.MACRO.PROTEIN_CELL);
        if (headerInfo.text === t('table.headers.fat'))
          cell.classList.add(CLASS_NAMES.MACRO.FAT_CELL);
        if (headerInfo.text === t('table.headers.carbs'))
          cell.classList.add(CLASS_NAMES.MACRO.CARBS_CELL);
        if (headerInfo.text === t('table.headers.calories'))
          cell.classList.add(CLASS_NAMES.MACRO.CALORIES_CELL);
      });

      // Render each breakdown row - use the FRESH breakdown data
      finalBreakdown.forEach((item, index) => {
        this.renderTableRow(table, item, finalAggregate, index % 2 === 1);
        this.renderExpandableDetailRow(table, item);
      });

      // Render aggregate totals row with special styling - use the FRESH aggregate data
      const aggregateRow = table.insertRow();
      aggregateRow.classList.add(CLASS_NAMES.TABLE.TOTALS_ROW);

      const aggLabelCell = aggregateRow.insertCell();
      aggLabelCell.classList.add('macro-bold-cell');

      aggLabelCell.createSpan({
        cls: 'header-text-desktop',
        text: t('calculator.combinedTotals'),
      });

      aggLabelCell.createSpan({
        cls: 'header-text-mobile',
        text: t('table.summary.totals'),
      });

      // Calculate total macros for percentages
      const totalMacros = finalAggregate.protein + finalAggregate.fat + finalAggregate.carbs;

      // Enhanced calories cell with kJ support
      const aggCaloriesCell = aggregateRow.insertCell();
      aggCaloriesCell.classList.add('macro-bold-cell', CLASS_NAMES.MACRO.CALORIES_CELL);

      const currentEnergyUnit = this.plugin.settings.energyUnit;
      if (currentEnergyUnit === 'kJ') {
        const kjValue = convertEnergyUnit(finalAggregate.calories, 'kcal', 'kJ');
        aggCaloriesCell.innerText = `${kjValue.toFixed(1)} kJ`;
        safeAttachTooltip(
          aggCaloriesCell,
          `${finalAggregate.calories.toFixed(1)} kcal = ${kjValue.toFixed(1)} kJ`,
          this.plugin
        );
      } else {
        aggCaloriesCell.innerText = formatCalories(finalAggregate.calories);
      }

      // Protein
      const aggProteinCell = aggregateRow.insertCell();
      aggProteinCell.classList.add('macro-bold-cell', CLASS_NAMES.MACRO.PROTEIN_CELL);
      aggProteinCell.textContent = formatGrams(finalAggregate.protein);
      if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
        const proteinPercentage = formatPercentage((finalAggregate.protein / totalMacros) * 100);
        aggProteinCell.createSpan({
          cls: CLASS_NAMES.MACRO.PERCENTAGE,
          text: `(${proteinPercentage}%)`,
        });
      }

      // Fat
      const aggFatCell = aggregateRow.insertCell();
      aggFatCell.classList.add('macro-bold-cell', CLASS_NAMES.MACRO.FAT_CELL);
      aggFatCell.textContent = formatGrams(finalAggregate.fat);
      if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
        const fatPercentage = formatPercentage((finalAggregate.fat / totalMacros) * 100);
        aggFatCell.createSpan({
          cls: CLASS_NAMES.MACRO.PERCENTAGE,
          text: `(${fatPercentage}%)`,
        });
      }

      // Carbs
      const aggCarbsCell = aggregateRow.insertCell();
      aggCarbsCell.classList.add('macro-bold-cell', CLASS_NAMES.MACRO.CARBS_CELL);
      aggCarbsCell.textContent = formatGrams(finalAggregate.carbs);
      if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
        const carbsPercentage = formatPercentage((finalAggregate.carbs / totalMacros) * 100);
        aggCarbsCell.createSpan({
          cls: CLASS_NAMES.MACRO.PERCENTAGE,
          text: `(${carbsPercentage}%)`,
        });
      }
    }

    // Only add comparison visualization if showChart is enabled
    if (displayOptions.showChart) {
      const chartSection = (fragment as unknown as HTMLElement).createDiv({
        cls: 'macroscalc-chart-section',
      });

      if (this.isDashboardCollapsed) {
        chartSection.classList.add('macroscalc-hidden');
      }

      await this.renderComparisonChart(chartSection, finalBreakdown);
    }

    // Add to main element
    this.el.appendChild(fragment);
  }

  private renderDashboard(container: HTMLElement, totals: MacroTotals): void {
    const dashboardContainer = container.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.CONTAINER} macroscalc-dashboard-container`,
    });

    // Create header with edit button and toggle functionality
    const dashboardHeader = dashboardContainer.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.HEADER} macroscalc-dashboard-header collapsible-header`,
    });

    const headerContent = dashboardHeader.createDiv({ cls: 'header-content' });

    // Add title
    headerContent.createSpan({
      cls: 'header-label',
      text: this.getSummaryLabel(),
    });

    // Add edit button
    const editButton = headerContent.createSpan({
      cls: 'macroscalc-edit-metrics-btn',
      text: '⚙️',
      attr: { 'aria-label': t('metrics.edit.title') },
    });

    // Add toggle button
    const toggleButton = headerContent.createSpan({
      cls: 'toggle-icon',
    });

    // Set initial toggle state
    if (this.isDashboardCollapsed) {
      toggleButton.classList.add('collapsed');
      dashboardHeader.classList.add('collapsed');
    }

    // Edit button click handler
    this.plugin.registerDomListener(editButton, 'click', (e: Event) => {
      e.stopPropagation();
      this.openMetricsEditModal();
    });

    // Toggle button click handler
    this.plugin.registerDomListener(dashboardHeader, 'click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('macroscalc-edit-metrics-btn')) {
        return; // Don't toggle when clicking edit button
      }
      this.toggleDashboard(dashboardContainer, toggleButton);
    });

    // Create content area
    const dashboardContent = dashboardContainer.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.CONTENT} macroscalc-dashboard-content collapsible-content`,
    });

    // Apply initial collapse state
    if (this.isDashboardCollapsed) {
      dashboardContent.classList.add('collapsed');
    }

    // Only render the organized custom metrics (removed basic metrics)
    this.renderCustomMetrics(dashboardContent, totals);
  }

  private renderBasicMetrics(container: HTMLElement, totals: MacroTotals): void {
    // Remove this method's content entirely since we now have organized custom metrics
    // that include totals, averages, and ratios in a much better format.
    // The custom metrics system handles all the data display we need.

    // This method is now intentionally empty to avoid redundant metric cards
    return;
  }

  private renderCustomMetrics(container: HTMLElement, totals: MacroTotals): void {
    // Create metrics data with configs included
    const metricsData: MetricData & { configs?: MetricConfig[] } = {
      id: this.ids.join(','),
      totals,
      breakdown: this.lastBreakdownData,
      dateIds: this.ids.filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id)),
      targets: {
        calories: this.plugin.settings.dailyCaloriesTarget,
        protein: this.plugin.settings.dailyProteinTarget,
        fat: this.plugin.settings.dailyFatTarget,
        carbs: this.plugin.settings.dailyCarbsTarget,
      },
      configs: this.metricsConfigs, // Pass the configs to the metrics
    };

    // Calculate metrics with configs passed in the data
    const registry = MetricsRegistry.getInstance();
    const metricResults = registry.calculateMetrics(metricsData, this.metricsConfigs);

    // Group metrics by category
    const categorizedMetrics = new Map<string, { metric: any; values: any[] }[]>();

    for (const [metricId, values] of metricResults) {
      const metric = registry.get(metricId);
      if (!metric || values.length === 0) continue;

      const category = metric.category || 'other';
      if (!categorizedMetrics.has(category)) {
        categorizedMetrics.set(category, []);
      }
      categorizedMetrics.get(category)!.push({ metric, values });
    }

    // Render categories in a specific order (excluding display since it doesn't show metrics)
    const categoryOrder = ['totals', 'ratios', 'trends', 'extremes', 'adherence', 'other'];

    categoryOrder.forEach((categoryKey) => {
      const categoryMetrics = categorizedMetrics.get(categoryKey);
      if (!categoryMetrics || categoryMetrics.length === 0) return;

      // Create section for this category
      const categorySection = container.createDiv({
        cls: 'macroscalc-metrics-category-section',
      });

      // Add category header
      const categoryHeader = categorySection.createDiv({
        cls: 'macroscalc-metrics-section-header',
      });
      categoryHeader.textContent = this.getCategoryDisplayName(categoryKey);

      // Create appropriate grid for this category
      const gridClass = this.getGridClassForCategory(categoryKey);
      const categoryGrid = categorySection.createDiv({
        cls: gridClass,
      });

      // Render all metrics in this category
      categoryMetrics.forEach(({ metric, values }) => {
        values.forEach((value) => {
          this.createCustomMetricCard(categoryGrid, value, categoryKey);
        });
      });
    });
  }

  private getCategoryDisplayName(category: string): string {
    const categoryNames: Record<string, string> = {
      totals: 'TOTALS & AVERAGES',
      ratios: 'MACRO RATIOS',
      trends: 'TRENDS',
      extremes: 'EXTREMES',
      adherence: 'ADHERENCE & STREAKS',
      other: 'OTHER METRICS',
    };
    return categoryNames[category] || category.toUpperCase();
  }

  private getGridClassForCategory(category: string): string {
    const gridClasses: Record<string, string> = {
      totals: 'macroscalc-totals-grid',
      ratios: 'macroscalc-ratios-grid',
      trends: 'macroscalc-trends-grid',
      extremes: 'macroscalc-extremes-grid',
      adherence: 'macroscalc-adherence-grid',
      other: 'macroscalc-metrics-category-grid',
    };
    return gridClasses[category] || 'macroscalc-metrics-category-grid';
  }

  private createCustomMetricCard(
    container: HTMLElement,
    metricValue: any,
    category?: string
  ): void {
    const card = container.createDiv({
      cls: 'macroscalc-custom-metric-card',
    });

    // Add category data attribute for styling
    if (category) {
      card.setAttribute('data-category', category);
    }

    if (metricValue.color) {
      card.style.borderLeftColor = metricValue.color;
      card.addClass('colored-metric');
    }

    card.createDiv({
      cls: 'metric-label',
      text: metricValue.label,
    });

    const valueEl = card.createDiv({
      cls: 'metric-value',
      text: metricValue.value.toString(),
    });

    if (metricValue.unit) {
      valueEl.createSpan({
        cls: 'metric-unit',
        text: metricValue.unit,
      });
    }

    if (metricValue.subtext) {
      card.createDiv({
        cls: 'metric-subtext',
        text: metricValue.subtext,
      });
    }

    if (metricValue.tooltip) {
      safeAttachTooltip(card, metricValue.tooltip, this.plugin);
    }
  }

  private openMetricsEditModal(): void {
    const modal = new MetricsEditModal(this.plugin, this.metricsConfigs, (newConfigs) => {
      this.metricsConfigs = newConfigs;
      this.saveMetricsConfig();

      // Force a complete re-render instead of just refreshing the dashboard
      this.forceCompleteRerender();
    });
    modal.open();
  }

  private forceCompleteRerender(): void {
    // Mark that we need a data refresh (even though we don't, this ensures fresh rendering)
    this.setNeedsRefresh();

    // Force re-render the entire component with fresh calculations
    this.render(this.lastCalculatedTotals, this.lastBreakdownData);
  }

  private refreshDashboard(): void {
    // Find the dashboard content and re-render it
    const dashboardContent = this.el.querySelector('.macroscalc-dashboard-content');
    if (dashboardContent) {
      dashboardContent.empty();

      // Only render the organized custom metrics (removed basic metrics)
      this.renderCustomMetrics(dashboardContent as HTMLElement, this.lastCalculatedTotals);
    }
  }

  private toggleDashboard(container: HTMLElement, toggleButton: HTMLElement): void {
    this.isDashboardCollapsed = !this.isDashboardCollapsed;

    const dashboardHeader = container.querySelector('.macroscalc-dashboard-header') as HTMLElement;
    const content = container.querySelector('.macroscalc-dashboard-content') as HTMLElement;
    const tableContainer = this.el.querySelector('.macroscalc-container') as HTMLElement;
    const chartSection = this.el.querySelector('.macroscalc-chart-section') as HTMLElement;

    // Update the toggle button and header state
    toggleButton.classList.toggle('collapsed', this.isDashboardCollapsed);
    dashboardHeader.classList.toggle('collapsed', this.isDashboardCollapsed);

    if (this.isDashboardCollapsed) {
      if (content) {
        content.classList.add('collapsed');
      }
      // Only hide table if it exists
      if (tableContainer) tableContainer.classList.add('macroscalc-hidden');
      // Only hide chart if it exists
      if (chartSection) chartSection.classList.add('macroscalc-hidden');
    } else {
      if (content) {
        content.classList.remove('collapsed');
      }
      // Only show table if it exists
      if (tableContainer) tableContainer.classList.remove('macroscalc-hidden');
      // Only show chart if it exists
      if (chartSection) chartSection.classList.remove('macroscalc-hidden');
    }

    this.saveDashboardCollapseState(this.isDashboardCollapsed);
  }

  private getSummaryLabel(): string {
    // Check if all IDs are dates in YYYY-MM-DD format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const allDates = this.ids.every((id) => datePattern.test(id));

    if (allDates) {
      // Parse all dates and sort them
      const dates = this.ids
        .map((id) => {
          const [year, month, day] = id.split('-').map((n) => parseInt(n));
          return new Date(year, month - 1, day);
        })
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length === 0) {
        return t('calculator.summaryTables', {
          count: this.ids.length,
          tables: this.ids.length === 1 ? '' : 's',
        });
      }

      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];

      // Format dates nicely
      const formatDate = (date: Date): string => {
        const months = [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ];

        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();

        // If same year as last date, omit year from first date
        if (firstDate !== lastDate && firstDate.getFullYear() === lastDate.getFullYear()) {
          return `${month} ${day}`;
        }
        return `${month} ${day}, ${year}`;
      };

      // Special case: single date
      if (dates.length === 1) {
        return t('calculator.summarySingleDate', {
          date: formatDate(firstDate),
        });
      }

      // Special case: same date (shouldn't happen but handle it)
      if (firstDate.getTime() === lastDate.getTime()) {
        return t('calculator.summarySingleDate', {
          date: formatDate(firstDate),
        });
      }

      // Special case: consecutive dates in same month
      if (
        firstDate.getMonth() === lastDate.getMonth() &&
        firstDate.getFullYear() === lastDate.getFullYear()
      ) {
        const month = [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ][firstDate.getMonth()];

        return t('calculator.summaryDateRangeSameMonth', {
          month: month,
          startDay: firstDate.getDate(),
          endDay: lastDate.getDate(),
          year: firstDate.getFullYear(),
        });
      }

      // Different months or years
      return t('calculator.summaryDateRange', {
        startDate: formatDate(firstDate),
        endDate: formatDate(lastDate),
      });
    } else {
      // Mixed IDs or non-date IDs - use the original logic
      return t('calculator.summaryTables', {
        count: this.ids.length,
        tables: this.ids.length === 1 ? '' : 's',
      });
    }
  }

  private createMetricCard(
    container: HTMLElement,
    label: string,
    value: string,
    macroType: string
  ): void {
    const card = container.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.METRIC_CARD} macroscalc-metric-card ${macroType}-card`,
    });

    const labelEl = card.createDiv({ cls: CLASS_NAMES.DASHBOARD.METRIC_LABEL });
    labelEl.setText(label);

    const valueContainer = card.createDiv({ cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE_CONTAINER });

    // Extract the numeric value and percentage from the combined value
    let displayValue = value;
    let percentageValue = '';

    const percentMatch = value.match(/(\d+\.?\d*g?)\s*\((\d+)%\)/);
    if (percentMatch) {
      displayValue = percentMatch[1];
      percentageValue = percentMatch[2];
    }

    // Main value
    const valueEl = valueContainer.createDiv({ cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE });
    valueEl.setText(displayValue);

    // Add percentage display
    if (percentageValue) {
      valueContainer.createDiv({
        cls: CLASS_NAMES.DASHBOARD.METRIC_PERCENTAGE,
        text: `${percentageValue}%`,
      });
    }

    // Add progress bars for percentages
    if (percentageValue && parseInt(percentageValue) > 0) {
      const percentage = parseInt(percentageValue);

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
    }
  }

  private renderTableRow(
    table: HTMLTableElement,
    item: CalcBreakdown,
    aggregate: MacroTotals,
    isAltRow: boolean
  ): void {
    const row = table.insertRow();
    row.dataset.id = item.id;

    if (isAltRow) {
      row.classList.add('macroscalc-alt-row');
    }

    // ID cell with expand toggle
    const idCell = row.insertCell();
    idCell.classList.add('macroscalc-id-cell-container');

    const expandToggle = idCell.createSpan({ cls: 'toggle-icon macroscalc-expand-toggle' });
    if (this.expandedRows.has(item.id)) {
      expandToggle.classList.add('expanded');
    }

    expandToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDetailRow(item.id, expandToggle);
    });

    idCell.createSpan({ text: item.id, cls: 'macroscalc-id-text' });

    // Calculate total macros for percentages
    const totalMacros = item.totals.protein + item.totals.fat + item.totals.carbs;

    // Enhanced calories cell with kJ support
    const caloriesCell = row.insertCell();
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL);

    const currentEnergyUnit = this.plugin.settings.energyUnit;
    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
      caloriesCell.textContent = `${kjValue.toFixed(1)} kJ`;
    } else {
      caloriesCell.textContent = formatCalories(item.totals.calories);
    }

    const caloriePercentage = (item.totals.calories / aggregate.calories) * 100;
    ProgressBarFactory.createMacroProgressBar(
      caloriesCell,
      caloriePercentage,
      MACRO_TYPES.CALORIES
    );

    // Enhanced tooltip with energy unit support
    let calorieTooltip: string;
    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
      calorieTooltip = t('calculator.tooltips.calories', {
        value: kjValue.toFixed(1) + ' kJ',
        id: item.id,
        percentage: caloriePercentage.toFixed(0),
      });
    } else {
      calorieTooltip = t('calculator.tooltips.calories', {
        value: item.totals.calories.toFixed(1),
        id: item.id,
        percentage: caloriePercentage.toFixed(0),
      });
    }

    safeAttachTooltip(caloriesCell, calorieTooltip, this.plugin);

    // Protein cell
    const proteinCell = row.insertCell();
    proteinCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.PROTEIN_CELL);
    proteinCell.textContent = formatGrams(item.totals.protein);

    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const proteinPercentage = Math.round((item.totals.protein / totalMacros) * 100);
      proteinCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${proteinPercentage}%)`,
      });
    }

    const proteinPercentage = totalMacros > 0 ? (item.totals.protein / totalMacros) * 100 : 0;
    ProgressBarFactory.createMacroProgressBar(proteinCell, proteinPercentage, MACRO_TYPES.PROTEIN);

    safeAttachTooltip(
      proteinCell,
      t('calculator.tooltips.macro', {
        value: formatGrams(item.totals.protein),
        macro: t('table.headers.protein').toLowerCase(),
        percentage: Math.round(proteinPercentage),
      }),
      this.plugin
    );

    // Fat cell
    const fatCell = row.insertCell();
    fatCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.FAT_CELL);
    fatCell.textContent = formatGrams(item.totals.fat);

    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const fatPercentage = Math.round((item.totals.fat / totalMacros) * 100);
      fatCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${fatPercentage}%)`,
      });
    }

    const fatPercentage = totalMacros > 0 ? (item.totals.fat / totalMacros) * 100 : 0;
    ProgressBarFactory.createMacroProgressBar(fatCell, fatPercentage, MACRO_TYPES.FAT);

    safeAttachTooltip(
      fatCell,
      t('calculator.tooltips.macro', {
        value: formatGrams(item.totals.fat),
        macro: t('table.headers.fat').toLowerCase(),
        percentage: Math.round(fatPercentage),
      }),
      this.plugin
    );

    // Carbs cell
    const carbsCell = row.insertCell();
    carbsCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CARBS_CELL);
    carbsCell.textContent = formatGrams(item.totals.carbs);

    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const carbsPercentage = Math.round((item.totals.carbs / totalMacros) * 100);
      carbsCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${carbsPercentage}%)`,
      });
    }

    const carbsPercentage = totalMacros > 0 ? (item.totals.carbs / totalMacros) * 100 : 0;
    ProgressBarFactory.createMacroProgressBar(carbsCell, carbsPercentage, MACRO_TYPES.CARBS);

    safeAttachTooltip(
      carbsCell,
      t('calculator.tooltips.macro', {
        value: formatGrams(item.totals.carbs),
        macro: t('table.headers.carbs').toLowerCase(),
        percentage: Math.round(carbsPercentage),
      }),
      this.plugin
    );
  }

  private renderExpandableDetailRow(table: HTMLTableElement, item: CalcBreakdown): void {
    const detailRow = table.insertRow();
    detailRow.dataset.parentId = item.id;
    detailRow.classList.add('macroscalc-detail-row');

    if (!this.expandedRows.has(item.id)) {
      detailRow.classList.add('table-row-hidden');
    } else {
      detailRow.classList.add('table-row-visible');
    }

    const detailCell = detailRow.insertCell();
    detailCell.colSpan = 5;

    const loadingMessage = detailCell.createEl('p', { text: t('general.loading') });

    (async () => {
      try {
        const context = await this.plugin.dataManager.getDocumentContext(item.id);
        const detailContent = detailCell.createDiv();

        if (loadingMessage && loadingMessage.parentNode) {
          loadingMessage.parentNode.removeChild(loadingMessage);
        }

        if (!context || context.allLines.length === 0) {
          detailContent.createEl('p', { text: t('calculator.noDetailData') });
          return;
        }

        const foodList = detailContent.createEl('table', { cls: 'macroscalc-details-table' });

        const foodHeader = foodList.createTHead().insertRow();
        const detailHeaderData = [
          { text: t('table.headers.food'), mobileText: t('table.headers.food') },
          { text: t('calculator.quantity'), mobileText: 'Qty' },
          { text: t('table.headers.calories'), mobileText: 'Cal' },
          { text: t('table.headers.protein'), mobileText: 'Pro' },
          { text: t('table.headers.fat'), mobileText: 'Fat' },
          { text: t('table.headers.carbs'), mobileText: 'Carb' },
        ];

        detailHeaderData.forEach((headerInfo) => {
          const th = document.createElement('th');
          const desktopSpan = createEl('span', {
            cls: 'header-text-desktop',
            text: headerInfo.text,
          });
          const mobileSpan = createEl('span', {
            cls: 'header-text-mobile',
            text: headerInfo.mobileText,
          });
          th.appendChild(desktopSpan);
          th.appendChild(mobileSpan);
          foodHeader.appendChild(th);
        });

        const foodBody = foodList.createTBody();

        let currentMealName = '';

        context.allLines.forEach((line) => {
          if (line.trim() === '' || line.startsWith('id:')) return;

          if (line.toLowerCase().startsWith('meal:') || line.toLowerCase().startsWith('group:')) {
            const isGroup = line.toLowerCase().startsWith('group:');
            currentMealName = line.substring(isGroup ? 6 : 5).trim();

            let displayName = currentMealName;
            let comment = '';
            let timestamp = '';

            // Parse comment
            const commentIndex = currentMealName.indexOf('//');
            if (commentIndex !== -1) {
              displayName = currentMealName.substring(0, commentIndex).trim();
              comment = currentMealName.substring(commentIndex + 2).trim();
            }

            // Parse timestamp
            const timestampMatch = displayName.match(/@(\d{2}:\d{2})/);
            if (timestampMatch) {
              timestamp = timestampMatch[1];
              displayName = displayName.replace(/@\d{2}:\d{2}/g, '').trim();
            }

            const headerRow = foodBody.insertRow();
            const headerCell = headerRow.insertCell();
            headerCell.classList.add('macroscalc-meal-header');
            headerCell.colSpan = 6;

            const headerContainer = headerCell.createDiv({ cls: 'macro-food-name-container' });
            const headerContent = headerContainer.createDiv({ cls: 'food-name-content' });

            headerContent.createSpan({
              cls: 'macro-food-name',
              text: displayName,
            });

            // Create icons container for proper alignment
            const iconsContainer = headerContent.createDiv({ cls: 'food-icons-container' });

            // Add timestamp icon if timestamp exists
            if (timestamp) {
              const timestampIcon = iconsContainer.createSpan({
                cls: 'food-timestamp-icon',
                text: '⏰',
              });

              safeAttachTooltip(
                timestampIcon,
                t('timestamps.consumed', { time: timestamp }),
                this.plugin
              );
            }

            // Add comment icon if comment exists
            if (comment) {
              const commentIcon = iconsContainer.createSpan({
                cls: 'food-comment-icon',
                text: '💬',
              });

              safeAttachTooltip(commentIcon, comment, this.plugin);
            }
          } else if (line.startsWith('-') && currentMealName) {
            const bulletContent = line.substring(1).trim();
            this.renderFoodItemRowFromBullet(foodBody, bulletContent);
          } else if (!line.startsWith('-')) {
            this.renderFoodItemRowFromLine(foodBody, line);
          }
        });
      } catch (error) {
        this.plugin.logger.error(`Error rendering detail row for ID ${item.id}:`, error);
        if (loadingMessage && loadingMessage.parentNode) {
          loadingMessage.textContent = t('calculator.errorLoadingData', {
            error: (error as Error).message,
          });
        }
      }
    })();
  }

  /**
   * Parse timestamp from a macro line
   * @param line The macro line text
   * @returns The timestamp text (without @) or empty string if no timestamp
   */
  private parseTimestampFromLine(line: string): string {
    const timestampMatch = line.match(/@(\d{2}:\d{2})/);
    return timestampMatch ? timestampMatch[1] : '';
  }

  private renderFoodItemRowFromBullet(
    foodBody: HTMLTableSectionElement,
    bulletContent: string
  ): void {
    let itemText = bulletContent;
    let comment = '';
    let timestamp = '';

    // Parse comment
    const commentIndex = bulletContent.indexOf('//');
    if (commentIndex !== -1) {
      itemText = bulletContent.substring(0, commentIndex).trim();
      comment = bulletContent.substring(commentIndex + 2).trim();
    }

    // Parse timestamp from the item text before extracting food name
    timestamp = this.parseTimestampFromLine(itemText);
    if (timestamp) {
      itemText = itemText.replace(/@\d{2}:\d{2}/g, '').trim();
    }

    let foodName = itemText;
    let quantity = t('calculator.standardQuantity');
    let specifiedQuantity: number | null = null;

    if (itemText.includes(':')) {
      const parts = itemText.split(':');
      foodName = parts[0].trim();
      quantity = parts.length > 1 ? parts[1].trim() : t('calculator.standardQuantity');
      specifiedQuantity = parseGrams(quantity);
    }

    const fullLine = comment ? `${itemText} // ${comment}` : itemText;
    this.renderFoodItemRow(
      foodBody,
      fullLine,
      quantity,
      specifiedQuantity,
      foodName,
      comment,
      timestamp
    );
  }

  private renderFoodItemRowFromLine(foodBody: HTMLTableSectionElement, line: string): void {
    let itemText = line;
    let comment = '';
    let timestamp = '';

    // Parse comment
    const commentIndex = line.indexOf('//');
    if (commentIndex !== -1) {
      itemText = line.substring(0, commentIndex).trim();
      comment = line.substring(commentIndex + 2).trim();
    }

    // Parse timestamp from the item text before extracting food name
    timestamp = this.parseTimestampFromLine(itemText);
    if (timestamp) {
      itemText = itemText.replace(/@\d{2}:\d{2}/g, '').trim();
    }

    let foodName = itemText;
    let quantity = t('calculator.standardQuantity');
    let specifiedQuantity: number | null = null;

    if (itemText.includes(':')) {
      const parts = itemText.split(':');
      foodName = parts[0].trim();
      quantity = parts.length > 1 ? parts[1].trim() : t('calculator.standardQuantity');
      specifiedQuantity = parseGrams(quantity);
    }

    const fullLine = comment ? `${itemText} // ${comment}` : itemText;
    this.renderFoodItemRow(
      foodBody,
      fullLine,
      quantity,
      specifiedQuantity,
      foodName,
      comment,
      timestamp
    );
  }

  private renderFoodItemRow(
    foodBody: HTMLTableSectionElement,
    itemLine: string,
    quantity: string,
    specifiedQuantity: number | null = null,
    explicitFoodName?: string,
    comment?: string,
    timestamp?: string
  ): void {
    let cleanItemLine = itemLine;
    if (comment) {
      const commentIndex = itemLine.indexOf('//');
      if (commentIndex !== -1) {
        cleanItemLine = itemLine.substring(0, commentIndex).trim();
      }
    }

    let foodName = explicitFoodName || cleanItemLine;

    if (!explicitFoodName && cleanItemLine.includes(':') && specifiedQuantity === null) {
      const parts = cleanItemLine.split(':');
      foodName = parts[0].trim();
      quantity = parts.length > 1 ? parts[1].trim() : t('calculator.standardQuantity');
      specifiedQuantity = parseGrams(quantity);
    }

    const foodRow = foodBody.insertRow();

    const folderPath = this.plugin.settings.storageFolder;
    const files = this.plugin.dataManager.getFilesInFolder(folderPath);
    const matchingFile = findMatchingFoodFile(files, foodName);

    let nutritionData = { calories: 0, protein: 0, fat: 0, carbs: 0 };

    if (matchingFile) {
      const processed = processNutritionalData(this.plugin.app, matchingFile, specifiedQuantity);
      if (processed) {
        nutritionData = processed;
      }
    }

    const totalMacros = nutritionData.protein + nutritionData.fat + nutritionData.carbs;

    const nameCell = foodRow.insertCell();
    const nameContainer = nameCell.createDiv({ cls: 'macro-food-name-container' });
    const nameContentDiv = nameContainer.createDiv({ cls: 'food-name-content' });

    const nameSpan = nameContentDiv.createSpan({
      cls: 'macro-food-name',
    });
    nameSpan.textContent = foodName;

    // Create icons container for proper alignment
    const iconsContainer = nameContentDiv.createDiv({ cls: 'food-icons-container' });

    // Add timestamp icon first if timestamp exists (most important)
    if (timestamp) {
      const timestampIcon = iconsContainer.createSpan({
        cls: 'food-timestamp-icon',
        text: '⏰',
      });

      safeAttachTooltip(timestampIcon, t('timestamps.consumed', { time: timestamp }), this.plugin);
    }

    // Add comment icon if comment exists
    if (comment) {
      const commentIcon = iconsContainer.createSpan({
        cls: 'food-comment-icon',
        text: '💬',
      });

      safeAttachTooltip(commentIcon, comment, this.plugin);
    }

    setTimeout(() => {
      const isOverflowing = nameSpan.scrollWidth > nameSpan.clientWidth + 2;
      if (isOverflowing) {
        nameSpan.removeAttribute('title');
        safeAttachTooltip(nameSpan, foodName, this.plugin);
      }
    }, 200);

    const quantityCell = foodRow.insertCell();
    quantityCell.textContent = quantity;

    const caloriesCell = foodRow.insertCell();
    const currentEnergyUnit = this.plugin.settings.energyUnit;
    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(nutritionData.calories, 'kcal', 'kJ');
      caloriesCell.textContent = `${kjValue.toFixed(1)} kJ`;
    } else {
      caloriesCell.textContent = formatCalories(nutritionData.calories);
    }

    const proteinCell = foodRow.insertCell();
    proteinCell.textContent = formatGrams(nutritionData.protein);

    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const proteinPercentage = Math.round((nutritionData.protein / totalMacros) * 100);
      proteinCell.createSpan({
        cls: 'macro-percentage',
        text: `(${proteinPercentage}%)`,
      });
    }

    proteinCell.classList.add('macroscalc-protein-value');

    const fatCell = foodRow.insertCell();
    fatCell.textContent = formatGrams(nutritionData.fat);

    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const fatPercentage = Math.round((nutritionData.fat / totalMacros) * 100);
      fatCell.createSpan({
        cls: 'macro-percentage',
        text: `(${fatPercentage}%)`,
      });
    }

    fatCell.classList.add('macroscalc-fat-value');

    const carbsCell = foodRow.insertCell();
    carbsCell.textContent = formatGrams(nutritionData.carbs);

    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const carbsPercentage = Math.round((nutritionData.carbs / totalMacros) * 100);
      carbsCell.createSpan({
        cls: 'macro-percentage',
        text: `(${carbsPercentage}%)`,
      });
    }

    carbsCell.classList.add('macroscalc-carbs-value');
  }

  private toggleDetailRow(id: string, toggle: HTMLElement): void {
    const detailRow = this.el.querySelector(`tr[data-parent-id="${id}"]`) as HTMLTableRowElement;

    if (!detailRow) return;

    if (detailRow.classList.contains('table-row-hidden')) {
      detailRow.classList.remove('table-row-hidden');
      detailRow.classList.add('table-row-visible');
      toggle.classList.add('expanded');
      this.expandedRows.add(id);
    } else {
      detailRow.classList.add('table-row-hidden');
      detailRow.classList.remove('table-row-visible');
      toggle.classList.remove('expanded');
      this.expandedRows.delete(id);
    }
  }

  private sortTable(table: HTMLTableElement, column: string): void {
    const headers: Record<string, number> = {
      [t('calculator.tableHeaders.id')]: 0,
      [t('table.headers.calories')]: 1,
      [t('table.headers.protein')]: 2,
      [t('table.headers.fat')]: 3,
      [t('table.headers.carbs')]: 4,
    };

    const columnIndex = headers[column];

    let ascending = true;
    if (this.sortConfig.column === column) {
      ascending = !this.sortConfig.ascending;
    }

    this.sortConfig = { column, ascending };

    const headerRow = table.rows[0];
    for (let i = 0; i < headerRow.cells.length; i++) {
      const sortIcon = headerRow.cells[i].querySelector(
        '.macroscalc-sort-icon'
      ) as HTMLElement | null;
      if (sortIcon) {
        if (i === columnIndex) {
          sortIcon.textContent = ascending ? '↑' : '↓';
          sortIcon.classList.add('active');
        } else {
          sortIcon.textContent = '⇅';
          sortIcon.classList.remove('active');
        }
      }
    }

    const allRows = Array.from(table.rows);
    const dataRowsWithDetails = allRows.slice(1, allRows.length - 1);
    const aggregateRow = allRows[allRows.length - 1];

    if (dataRowsWithDetails.length === 0) return;

    const rowGroups: { mainRow: HTMLTableRowElement; detailRow?: HTMLTableRowElement }[] = [];
    let currentMainRow: HTMLTableRowElement | null = null;

    dataRowsWithDetails.forEach((row) => {
      if (!row.classList.contains('macroscalc-detail-row')) {
        currentMainRow = row as HTMLTableRowElement;
        rowGroups.push({ mainRow: currentMainRow });
      } else if (currentMainRow && row.classList.contains('macroscalc-detail-row')) {
        const lastGroup = rowGroups[rowGroups.length - 1];
        lastGroup.detailRow = row as HTMLTableRowElement;
      }
    });

    rowGroups.sort((a, b) => {
      const aValue = a.mainRow.cells[columnIndex].textContent || '';
      const bValue = b.mainRow.cells[columnIndex].textContent || '';

      if (columnIndex > 0) {
        let aNum = 0;
        let bNum = 0;

        if (columnIndex === 1 && (aValue.includes('kJ') || bValue.includes('kJ'))) {
          const aKjMatch = aValue.match(/^([\d.]+)\s*kJ/);
          const bKjMatch = bValue.match(/^([\d.]+)\s*kJ/);

          if (aKjMatch) {
            aNum = convertEnergyUnit(parseFloat(aKjMatch[1]), 'kJ', 'kcal');
          } else {
            const aKcalMatch = aValue.match(/^([\d.]+)/);
            aNum = aKcalMatch ? parseFloat(aKcalMatch[1]) : 0;
          }

          if (bKjMatch) {
            bNum = convertEnergyUnit(parseFloat(bKjMatch[1]), 'kJ', 'kcal');
          } else {
            const bKcalMatch = bValue.match(/^([\d.]+)/);
            bNum = bKcalMatch ? parseFloat(bKcalMatch[1]) : 0;
          }
        } else {
          const aNumMatch = aValue.match(/^([\d.]+)/);
          const bNumMatch = bValue.match(/^([\d.]+)/);

          aNum = aNumMatch ? parseFloat(aNumMatch[1]) : 0;
          bNum = bNumMatch ? parseFloat(bNumMatch[1]) : 0;
        }

        if (ascending) {
          return aNum - bNum;
        } else {
          return bNum - aNum;
        }
      } else {
        if (ascending) {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }
    });

    const tbody = table.tBodies[0];
    const headerClone = table.rows[0];

    while (tbody.rows.length > 0) {
      tbody.deleteRow(0);
    }

    tbody.appendChild(headerClone);

    rowGroups.forEach((group, index) => {
      if (index % 2 === 1) {
        group.mainRow.classList.add('macroscalc-alt-row');
      } else {
        group.mainRow.classList.remove('macroscalc-alt-row');
      }

      tbody.appendChild(group.mainRow);

      if (group.detailRow) {
        tbody.appendChild(group.detailRow);
      }
    });

    tbody.appendChild(aggregateRow);

    for (let i = 0; i < headerRow.cells.length; i++) {
      const sortIcon = headerRow.cells[i].querySelector(
        '.macroscalc-sort-icon'
      ) as HTMLElement | null;
      if (sortIcon) {
        const newSortIcon = sortIcon.cloneNode(true) as HTMLElement;
        sortIcon.parentNode?.replaceChild(newSortIcon, sortIcon);

        const headerText = Array.from(Object.keys(headers)).find((key) => headers[key] === i);

        if (headerText) {
          newSortIcon.addEventListener('click', () => {
            this.sortTable(table, headerText);
          });
        }
      }
    }
  }

  private async renderComparisonChart(
    container: HTMLElement,
    breakdown: CalcBreakdown[]
  ): Promise<void> {
    this.plugin.logger.debug(`renderComparisonChart called with ${breakdown.length} items`);

    const chartSection = container.createDiv({
      cls: 'macroscalc-chart-section macro-dashboard',
    });

    const dashboardHeader = chartSection.createDiv({
      cls: 'macroscalc-dashboard-header macro-dashboard-header',
    });

    const headerContent = dashboardHeader.createDiv({
      cls: 'macroscalc-header-content',
    });

    headerContent.createSpan({
      cls: 'macroscalc-header-title',
      text: t('calculator.chartTitle'),
    });

    const chartContent = chartSection.createDiv({
      cls: 'macro-dashboard-flex-container',
    });

    if (breakdown.length < 2) {
      chartContent.createEl('p', {
        text: t('calculator.notEnoughData', { count: breakdown.length }),
        cls: 'macroscalc-chart-info',
      });
      this.plugin.logger.debug('Not enough data points for chart');
      return;
    }

    try {
      this.destroyCharts();

      this.plugin.logger.debug('Chart.js available on window:', !!window.Chart);

      await this.chartLoader.loadChart();

      this.plugin.logger.debug('Chart.js available after loading:', !!window.Chart);

      if (!window.Chart) {
        throw new Error('Chart.js failed to load');
      }

      const chartWrapper = chartContent.createDiv({
        cls: 'macroscalc-chart-wrapper',
      });

      chartWrapper.setAttribute('data-height', '300');
      chartWrapper.setAttribute('data-width', '100');

      const chartCanvas = chartWrapper.createEl('canvas', {
        cls: 'macroscalc-line-chart',
        attr: {
          'data-width': '800',
          'data-height': '300',
        },
      });

      chartCanvas.width = 800;
      chartCanvas.height = 300;

      const chartId = `macroscalc-${this.ids.join('-')}-chart`;
      chartCanvas.id = chartId;

      const ctx = chartCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      this.plugin.logger.debug('Creating chart with data:', {
        labels: breakdown.map((item) => item.id),
        proteinData: breakdown.map((item) => item.totals.protein),
        fatData: breakdown.map((item) => item.totals.fat),
        carbsData: breakdown.map((item) => item.totals.carbs),
        caloriesData: breakdown.map((item) => item.totals.calories),
      });

      const currentEnergyUnit = getCurrentEnergyUnitString();
      const isKjUnit = currentEnergyUnit === 'kJ';

      const calorieData = breakdown.map((item) => {
        if (isKjUnit) {
          return convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
        }
        return item.totals.calories;
      });

      const chartConfig: import('chart.js').ChartConfiguration<'line', number[], string> = {
        type: 'line',
        data: {
          labels: breakdown.map((item) => item.id),
          datasets: [
            {
              label: t('table.headers.protein') + ' (g)',
              data: breakdown.map((item) => item.totals.protein),
              borderColor: this.plugin.settings.proteinColor || '#4caf50',
              backgroundColor: (this.plugin.settings.proteinColor || '#4caf50') + '20',
              tension: 0.2,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
            {
              label: t('table.headers.fat') + ' (g)',
              data: breakdown.map((item) => item.totals.fat),
              borderColor: this.plugin.settings.fatColor || '#f44336',
              backgroundColor: (this.plugin.settings.fatColor || '#f44336') + '20',
              tension: 0.2,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
            {
              label: t('table.headers.carbs') + ' (g)',
              data: breakdown.map((item) => item.totals.carbs),
              borderColor: this.plugin.settings.carbsColor || '#2196f3',
              backgroundColor: (this.plugin.settings.carbsColor || '#2196f3') + '20',
              tension: 0.2,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
            {
              label: t('table.headers.calories') + ` (${currentEnergyUnit})`,
              data: calorieData,
              borderColor: '#ff9800',
              backgroundColor: '#ff980020',
              tension: 0.2,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 6,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
          },
          plugins: {
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                label: function (context: import('chart.js').TooltipItem<'line'>) {
                  let value = context.parsed.y.toFixed(1);
                  let unit = '';

                  if (context.dataset.label?.includes('calorie') && isKjUnit) {
                    const kjValue = convertEnergyUnit(context.parsed.y, 'kcal', 'kJ');
                    value = kjValue.toFixed(1);
                    unit = ' kJ';
                  } else if (context.dataset.label?.includes('calorie')) {
                    unit = ' kcal';
                  } else {
                    unit = 'g';
                  }

                  return `${context.dataset.label}: ${value}${unit}`;
                },
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: t('calculator.chartAxisDate'),
              },
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: t('calculator.chartAxisGrams'),
              },
              position: 'left',
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              title: {
                display: true,
                text: `${t('table.headers.calories')} (${currentEnergyUnit})`,
              },
              grid: {
                drawOnChartArea: false,
              },
              beginAtZero: true,
            },
          },
        },
      };

      this.plugin.logger.debug('Creating Chart.js instance...');

      const chart = new window.Chart(ctx, chartConfig);

      this.plugin.logger.debug('Chart created successfully:', chart);

      const resizeHandler = () => {
        if (document.contains(chartCanvas)) {
          chart.resize();
        }
      };

      window.addEventListener('resize', resizeHandler);
      this.charts.push({ chart, caloriesChart: null, resizeHandler });
      this.chartLoader.registerChart(chartId, chart);

      this.plugin.logger.debug('Chart setup complete');
    } catch (error) {
      this.plugin.logger.error('Error creating chart:', error);

      const errorDiv = chartContent.createDiv({ cls: 'macroscalc-chart-error' });
      errorDiv.createEl('p', {
        text: t('calculator.chartError', { error: (error as Error).message }),
        cls: 'error-message',
      });

      this.renderFallbackTable(chartContent, breakdown);
    }
  }

  private renderFallbackTable(container: HTMLElement, breakdown: CalcBreakdown[]): void {
    const fallbackDiv = container.createDiv({ cls: 'chart-fallback' });

    fallbackDiv.createEl('h4', { text: t('calculator.dataSummary') });

    const table = fallbackDiv.createEl('table', { cls: 'fallback-data-table' });
    const headerRow = table.insertRow();

    const currentEnergyUnit = getCurrentEnergyUnitString();
    [
      t('calculator.tableHeaders.id'),
      `${t('table.headers.calories')} (${currentEnergyUnit})`,
      t('table.headers.protein'),
      t('table.headers.fat'),
      t('table.headers.carbs'),
    ].forEach((header) => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });

    breakdown.forEach((item) => {
      const row = table.insertRow();
      row.insertCell().textContent = item.id;

      const currentEnergyUnit = this.plugin.settings.energyUnit;
      if (currentEnergyUnit === 'kJ') {
        const kjValue = convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
        row.insertCell().textContent = kjValue.toFixed(1) + ' kJ';
      } else {
        row.insertCell().textContent = item.totals.calories.toFixed(1) + ' kcal';
      }

      row.insertCell().textContent = item.totals.protein.toFixed(1) + 'g';
      row.insertCell().textContent = item.totals.fat.toFixed(1) + 'g';
      row.insertCell().textContent = item.totals.carbs.toFixed(1) + 'g';
    });
  }

  public destroyCharts(): void {
    if (this.charts && this.charts.length > 0) {
      this.plugin.logger.debug(`Cleaning up ${this.charts.length} charts`);

      this.charts.forEach(({ chart, caloriesChart, resizeHandler }) => {
        try {
          if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
          }

          if (chart) {
            const chartId = `macroscalc-${this.ids.join('-')}-chart`;
            this.plugin.logger.debug(`Destroying chart: ${chartId}`);
            this.chartLoader.destroyChart(chartId);
          }

          if (caloriesChart) {
            const caloriesChartId = `macroscalc-${this.ids.join('-')}-calories-chart`;
            this.plugin.logger.debug(`Destroying calories chart: ${caloriesChartId}`);
            this.chartLoader.destroyChart(caloriesChartId);
          }
        } catch (e) {
          this.plugin.logger.error('Error destroying chart:', e);
        }
      });

      this.charts = [];
    }
  }
}

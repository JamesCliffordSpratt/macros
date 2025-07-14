import MacrosPlugin from '../../main';
import {
  formatCalories,
  formatGrams,
  formatPercentage,
  ChartLoader,
  safeAttachTooltip,
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

// Define the chart reference type for proper TypeScript support
interface ChartReference {
  chart: any; // Chart.js instance
  caloriesChart: any; // Chart.js instance for calories
  resizeHandler: () => void; // Resize event handler
}

export class MacrosCalcRenderer {
  private plugin: MacrosPlugin;
  public el: HTMLElement;
  private ids: string[];
  private sortConfig: { column: string; ascending: boolean } = { column: '', ascending: true };
  private expandedRows: Set<string> = new Set();
  private charts: ChartReference[] = []; // Add the charts property with proper typing
  private state: MacrosState | null;
  private isDashboardCollapsed = false;
  // Add a new property to track if data needs refreshing
  private needsDataRefresh = true;
  // Add a reference to the ChartLoader
  private chartLoader: ChartLoader = ChartLoader.getInstance();

  constructor(plugin: MacrosPlugin, el: HTMLElement, ids: string[]) {
    this.plugin = plugin;
    this.el = el;
    this.ids = ids;

    // Create a unique ID for this instance based on the IDs
    const combinedId = this.ids.join('-');
    // Initialize MacrosState
    this.state = new MacrosState(plugin, combinedId, 'calc');
  }

  // Add a getter for the IDs
  public getIds(): string[] {
    return this.ids;
  }

  // Add a method to force a data refresh
  public setNeedsRefresh(): void {
    this.needsDataRefresh = true;
    this.plugin.logger.debug(`MacrosCalc renderer for ${this.ids.join(',')} marked for refresh`);
  }

  // Save collapse state using MacrosState
  private saveDashboardCollapseState(isCollapsed: boolean): void {
    if (this.state) {
      this.state.saveCollapsedState('dashboard', isCollapsed);
    }
  }

  // Load collapse state from MacrosState
  private loadDashboardCollapseState(): boolean {
    return this.state ? this.state.getCollapsedState('dashboard') : false;
  }

  async render(aggregate: MacroTotals, breakdown: CalcBreakdown[]): Promise<void> {
    // Always force fresh data fetch if needed
    if (this.needsDataRefresh) {
      this.plugin.logger.debug('MacrosCalc refresh triggered - reloading all data');

      // First clear all cached data for our IDs
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

          // Store these lines for calculation
          this.plugin.macroService.macroTables.set(id, allLines);
        } else {
          this.plugin.logger.debug(`No data found for ID ${id}`);
        }
      }

      // Reset the refresh flag
      this.needsDataRefresh = false;
    }

    // CRITICAL FIX: Always recalculate the aggregate and breakdown using the fixed calculator
    // Don't trust the passed-in values as they might be from the old calculation logic
    const { aggregate: freshAggregate, breakdown: freshBreakdown } =
      await processNutritionalDataFromLines(this.plugin, this.ids);

    this.plugin.logger.debug('MacrosCalc using fresh calculations:', {
      aggregate: freshAggregate,
      breakdown: freshBreakdown,
    });

    // Use the fresh calculations instead of the passed-in values
    const finalAggregate = freshAggregate;
    const finalBreakdown = freshBreakdown;

    // Create a document fragment to batch DOM operations
    const fragment = document.createDocumentFragment();
    this.el.empty();

    // Load state from MacrosState
    this.isDashboardCollapsed = this.loadDashboardCollapseState();

    // Create dashboard summary at the top - use the FRESH aggregate data
    this.renderDashboard(fragment as unknown as HTMLElement, finalAggregate);

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

      // Create a container for the header content to allow sorting UI
      const headerContainer = cell.createDiv({ cls: 'macroscalc-header-container' });

      // Create spans for responsive text
      const desktopSpan = headerContainer.createSpan({
        cls: 'header-text-desktop',
        text: headerInfo.text,
      });

      const mobileSpan = headerContainer.createSpan({
        cls: 'header-text-mobile',
        text: headerInfo.mobileText,
      });

      if (index > 0) {
        // Don't add sort button to Table ID column
        const sortButton = headerContainer.createSpan({ cls: 'macroscalc-sort-icon' });
        sortButton.setText('⇅');

        // Set initial sort indicator if this is the current sort column
        if (this.sortConfig.column === headerInfo.text) {
          sortButton.setText(this.sortConfig.ascending ? '↑' : '↓');
          sortButton.classList.add('active');
        }

        // Add sort functionality
        sortButton.addEventListener('click', () => {
          this.sortTable(table, headerInfo.text);
        });
      }

      cell.classList.add(CLASS_NAMES.TABLE.COLUMN_HEADER);

      // Add specific macro styling for appropriate columns
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

      // Render expandable detail row (initially hidden)
      this.renderExpandableDetailRow(table, item);
    });

    // Render aggregate totals row with special styling - use the FRESH aggregate data
    const aggregateRow = table.insertRow();
    aggregateRow.classList.add(CLASS_NAMES.TABLE.TOTALS_ROW);

    const aggLabelCell = aggregateRow.insertCell();
    aggLabelCell.classList.add('macro-bold-cell');

    // Create responsive text for "Combined Totals" vs "Totals"
    const desktopLabel = aggLabelCell.createSpan({
      cls: 'header-text-desktop',
      text: t('calculator.combinedTotals'),
    });

    const mobileLabel = aggLabelCell.createSpan({
      cls: 'header-text-mobile',
      text: t('table.summary.totals'),
    });

    // Calculate total macros for percentages
    const totalMacros = finalAggregate.protein + finalAggregate.fat + finalAggregate.carbs;

    // Enhanced calories cell with kJ support
    const aggCaloriesCell = aggregateRow.insertCell();
    aggCaloriesCell.classList.add('macro-bold-cell', CLASS_NAMES.MACRO.CALORIES_CELL);

    // Display calories with proper energy unit
    const currentEnergyUnit = this.plugin.settings.energyUnit;
    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(finalAggregate.calories, 'kcal', 'kJ');
      aggCaloriesCell.innerText = `${kjValue.toFixed(1)} kJ`;
      // Add tooltip showing both units
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

    // Add comparison visualization - only if not collapsed - use the FRESH breakdown data
    const chartSection = (fragment as unknown as HTMLElement).createDiv({
      cls: 'macroscalc-chart-section',
    });

    if (this.isDashboardCollapsed) {
      chartSection.classList.add('macroscalc-hidden');
    }

    await this.renderComparisonChart(chartSection, finalBreakdown);

    // Add to main element
    this.el.appendChild(fragment);
  }

  private renderDashboard(container: HTMLElement, totals: MacroTotals): void {
    const dashboardContainer = container.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.CONTAINER} macroscalc-dashboard-container`,
    });

    // Create a header with collapse/expand controls - use the new collapsible-header class
    const dashboardHeader = dashboardContainer.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.HEADER} macroscalc-dashboard-header collapsible-header`,
    });

    // Create a container for the header content - use header-content class
    const headerContent = dashboardHeader.createDiv({ cls: 'header-content' });

    // Add title - use header-label class
    headerContent.createSpan({
      cls: 'header-label',
      text: this.getSummaryLabel(),
    });

    // Add toggle button - use toggle-icon class
    const toggleButton = headerContent.createSpan({
      cls: 'toggle-icon',
    });

    // Set initial toggle state
    if (this.isDashboardCollapsed) {
      toggleButton.classList.add('collapsed');
      dashboardHeader.classList.add('collapsed');
    }

    // Add click handler to the ENTIRE header, not just the button
    // Use the plugin's registerEvent for proper cleanup
    this.plugin.registerDomListener(dashboardHeader, 'click', () => {
      this.toggleDashboard(dashboardContainer, toggleButton);
    });

    // Create content area - use collapsible-content class
    const dashboardContent = dashboardContainer.createDiv({
      cls: `${CLASS_NAMES.DASHBOARD.CONTENT} macroscalc-dashboard-content collapsible-content`,
    });

    // Apply initial collapse state
    if (this.isDashboardCollapsed) {
      dashboardContent.classList.add('collapsed');
    }

    // Calculate total macro grams for percentage calculation
    const totalMacros = totals.protein + totals.fat + totals.carbs;

    // Calculate percentages for display
    const proteinPercentage =
      totalMacros > 0 ? Math.round((totals.protein / totalMacros) * 100) : 0;
    const fatPercentage = totalMacros > 0 ? Math.round((totals.fat / totalMacros) * 100) : 0;
    const carbsPercentage = totalMacros > 0 ? Math.round((totals.carbs / totalMacros) * 100) : 0;

    // Enhanced calories metric card with kJ support
    const currentEnergyUnit = this.plugin.settings.energyUnit;
    let calorieDisplayValue: string;
    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(totals.calories, 'kcal', 'kJ');
      calorieDisplayValue = `${kjValue.toFixed(1)} kJ`;
    } else {
      calorieDisplayValue = formatCalories(totals.calories);
    }

    this.createMetricCard(
      dashboardContent,
      t('table.headers.calories'),
      calorieDisplayValue,
      MACRO_TYPES.CALORIES
    );

    this.createMetricCard(
      dashboardContent,
      t('table.headers.protein'),
      `${formatGrams(totals.protein)} (${proteinPercentage}%)`,
      MACRO_TYPES.PROTEIN
    );

    this.createMetricCard(
      dashboardContent,
      t('table.headers.fat'),
      `${formatGrams(totals.fat)} (${fatPercentage}%)`,
      MACRO_TYPES.FAT
    );

    this.createMetricCard(
      dashboardContent,
      t('table.headers.carbs'),
      `${formatGrams(totals.carbs)} (${carbsPercentage}%)`,
      MACRO_TYPES.CARBS
    );
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
      // COLLAPSING
      if (content) {
        content.classList.add('collapsed');
      }

      if (tableContainer) tableContainer.classList.add('macroscalc-hidden');
      if (chartSection) chartSection.classList.add('macroscalc-hidden');
    } else {
      // EXPANDING
      if (content) {
        content.classList.remove('collapsed');
      }

      if (tableContainer) tableContainer.classList.remove('macroscalc-hidden');
      if (chartSection) chartSection.classList.remove('macroscalc-hidden');
    }

    // Save the state using MacrosState
    this.saveDashboardCollapseState(this.isDashboardCollapsed);
  }

  private getSummaryLabel(): string {
    const allDates = this.ids.every((id) => /^\d{4}-\d{2}-\d{2}$/.test(id));
    if (allDates) {
      return t('calculator.summaryDays', {
        count: this.ids.length,
        days: this.ids.length === 1 ? '' : 's',
      });
    } else {
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
    // For example, from "31.0g (21%)" extract "31.0g" and "21%"
    let displayValue = value;
    let percentageValue = '';

    const percentMatch = value.match(/(\d+\.?\d*g?)\s*\((\d+)%\)/);
    if (percentMatch) {
      displayValue = percentMatch[1]; // The numeric part
      percentageValue = percentMatch[2]; // Just the percentage number without %
    }

    // Main value
    const valueEl = valueContainer.createDiv({ cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE });
    valueEl.setText(displayValue);

    // Add percentage display similar to macros dashboard
    if (percentageValue) {
      valueContainer.createDiv({
        cls: CLASS_NAMES.DASHBOARD.METRIC_PERCENTAGE,
        text: `${percentageValue}%`,
      });
    }

    // If we have extracted a percentage, we can also add progress bars
    if (percentageValue && parseInt(percentageValue) > 0) {
      const percentage = parseInt(percentageValue);

      // Add progress bar with the same styling as in MacrosDashboard
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

      // Add overflow indicator for values over 115%
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

    // Apply alternating row background
    if (isAltRow) {
      row.classList.add('macroscalc-alt-row');
    }

    // ID cell with expand toggle
    const idCell = row.insertCell();
    idCell.classList.add('macroscalc-id-cell-container');

    // Create the expand toggle with the new toggle-icon class
    const expandToggle = idCell.createSpan({ cls: 'toggle-icon macroscalc-expand-toggle' });
    if (this.expandedRows.has(item.id)) {
      expandToggle.classList.add('expanded');
    }

    expandToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDetailRow(item.id, expandToggle);
    });

    // Add the ID text directly after the toggle (no wrapper div)
    idCell.createSpan({ text: item.id, cls: 'macroscalc-id-text' });

    // Calculate total macros for percentages
    const totalMacros = item.totals.protein + item.totals.fat + item.totals.carbs;

    // Enhanced calories cell with kJ support
    const caloriesCell = row.insertCell();
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL);

    // Display calories with proper energy unit
    const currentEnergyUnit = this.plugin.settings.energyUnit;
    if (currentEnergyUnit === 'kJ') {
      const kjValue = convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
      caloriesCell.textContent = `${kjValue.toFixed(1)} kJ`;
    } else {
      caloriesCell.textContent = formatCalories(item.totals.calories);
    }

    // Conditional formatting for high values
    const caloriePercentage = (item.totals.calories / aggregate.calories) * 100;

    // Create progress bar for calories similar to other macros
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

    // Only add percentage if the setting is enabled
    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const proteinPercentage = Math.round((item.totals.protein / totalMacros) * 100);
      proteinCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${proteinPercentage}%)`,
      });
    }

    // Create progress bar based on percentage
    const proteinPercentage = totalMacros > 0 ? (item.totals.protein / totalMacros) * 100 : 0;
    ProgressBarFactory.createMacroProgressBar(proteinCell, proteinPercentage, MACRO_TYPES.PROTEIN);

    // Add tooltip
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

    // Only add percentage if the setting is enabled
    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const fatPercentage = Math.round((item.totals.fat / totalMacros) * 100);
      fatCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${fatPercentage}%)`,
      });
    }

    // Create progress bar based on percentage
    const fatPercentage = totalMacros > 0 ? (item.totals.fat / totalMacros) * 100 : 0;
    ProgressBarFactory.createMacroProgressBar(fatCell, fatPercentage, MACRO_TYPES.FAT);

    // Add tooltip
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

    // Only add percentage if the setting is enabled
    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const carbsPercentage = Math.round((item.totals.carbs / totalMacros) * 100);
      carbsCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${carbsPercentage}%)`,
      });
    }

    // Create progress bar based on percentage
    const carbsPercentage = totalMacros > 0 ? (item.totals.carbs / totalMacros) * 100 : 0;
    ProgressBarFactory.createMacroProgressBar(carbsCell, carbsPercentage, MACRO_TYPES.CARBS);

    // Add tooltip
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

    // Initially hide the detail row
    if (!this.expandedRows.has(item.id)) {
      detailRow.classList.add('table-row-hidden');
    } else {
      detailRow.classList.add('table-row-visible');
    }

    // Create a cell that spans all columns
    const detailCell = detailRow.insertCell();
    detailCell.colSpan = 5;

    // Attach a progress indicator until data loads
    const loadingMessage = detailCell.createEl('p', { text: t('general.loading') });

    // Use a Promise to handle async document loading
    (async () => {
      try {
        // Use the centralized method to get document context
        const context = await this.plugin.dataManager.getDocumentContext(item.id);

        // Create the detail content
        const detailContent = detailCell.createDiv();

        // Remove loading message
        if (loadingMessage && loadingMessage.parentNode) {
          loadingMessage.parentNode.removeChild(loadingMessage);
        }

        if (!context || context.allLines.length === 0) {
          detailContent.createEl('p', { text: t('calculator.noDetailData') });
          return;
        }

        // Create a mini table for the food items with mobile optimization
        const foodList = detailContent.createEl('table', { cls: 'macroscalc-details-table' });

        // Add header with mobile-responsive text
        const foodHeader = foodList.createTHead().insertRow();
        const detailHeaderData = [
          { text: t('table.headers.food'), mobileText: t('table.headers.food') },
          {
            text: t('calculator.quantity'),
            mobileText: 'Qty',
          },
          {
            text: t('table.headers.calories'),
            mobileText: 'Cal',
          },
          {
            text: t('table.headers.protein'),
            mobileText: 'Pro',
          },
          {
            text: t('table.headers.fat'),
            mobileText: 'Fat',
          },
          {
            text: t('table.headers.carbs'),
            mobileText: 'Carb',
          },
        ];

        detailHeaderData.forEach((headerInfo) => {
          const th = document.createElement('th');

          // Create spans for responsive text
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

        // Process and display each line
        let currentMealName = '';

        context.allLines.forEach((line) => {
          if (line.trim() === '' || line.startsWith('id:')) return;

          if (line.toLowerCase().startsWith('meal:') || line.toLowerCase().startsWith('group:')) {
            // FIXED: Handle meal/group headers with comments properly
            const isGroup = line.toLowerCase().startsWith('group:');
            currentMealName = line.substring(isGroup ? 6 : 5).trim();

            // Parse comment from meal/group line
            let displayName = currentMealName;
            let comment = '';

            const commentIndex = currentMealName.indexOf('//');
            if (commentIndex !== -1) {
              displayName = currentMealName.substring(0, commentIndex).trim();
              comment = currentMealName.substring(commentIndex + 2).trim();
            }

            // Extract meal name and count if present
            let mealName = displayName;
            let count = 1;

            // Check if there's a count indicator like "× 2"
            const countMatch = displayName.match(/^(.*)\s+×\s+(\d+)$/);
            if (countMatch) {
              mealName = countMatch[1];
              count = parseInt(countMatch[2]);
            }

            const headerRow = foodBody.insertRow();
            const headerCell = headerRow.insertCell();
            headerCell.classList.add('macroscalc-meal-header');
            headerCell.colSpan = 6; // Span all columns

            // FIXED: Create header content with comment icon (same structure as main macros processor)
            const headerContainer = headerCell.createDiv({ cls: 'macro-food-name-container' });
            const headerContent = headerContainer.createDiv({ cls: 'food-name-content' });

            // Add the meal/group name
            const nameSpan = headerContent.createSpan({
              cls: 'macro-food-name',
              text: displayName,
            });

            // FIXED: Add comment icon if comment exists
            if (comment) {
              const commentIcon = headerContent.createSpan({
                cls: 'food-comment-icon',
                text: '💬',
              });

              // Add tooltip with the comment text
              safeAttachTooltip(commentIcon, comment, this.plugin);
            }

            // We'll collect bullet points and display them directly instead of using templates
          } else if (line.startsWith('-') && currentMealName) {
            // This is a bullet point for the current meal
            const bulletContent = line.substring(1).trim();

            // FIXED: Process this bullet point item with proper comment separation
            this.renderFoodItemRowFromBullet(foodBody, bulletContent);
          } else if (!line.startsWith('-')) {
            // Regular food item (not part of a meal template)
            // FIXED: Process regular food items with proper comment separation
            this.renderFoodItemRowFromLine(foodBody, line);
          }
        });
      } catch (error) {
        this.plugin.logger.error(`Error rendering detail row for ID ${item.id}:`, error);

        // Update loading message to show error
        if (loadingMessage && loadingMessage.parentNode) {
          loadingMessage.textContent = t('calculator.errorLoadingData', {
            error: (error as Error).message,
          });
        }
      }
    })();
  }

  /**
   * FIXED: New method to render food item from bullet point with proper comment handling
   */
  private renderFoodItemRowFromBullet(
    foodBody: HTMLTableSectionElement,
    bulletContent: string
  ): void {
    // Parse the bullet content to separate food info from comments
    let itemText = bulletContent;
    let comment = '';

    // Check for comment syntax
    const commentIndex = bulletContent.indexOf('//');
    if (commentIndex !== -1) {
      itemText = bulletContent.substring(0, commentIndex).trim();
      comment = bulletContent.substring(commentIndex + 2).trim();
    }

    // Process food name and quantity from the clean item text
    let foodName = itemText;
    let quantity = t('calculator.standardQuantity');
    let specifiedQuantity: number | null = null;

    if (itemText.includes(':')) {
      const parts = itemText.split(':');
      foodName = parts[0].trim();
      quantity = parts.length > 1 ? parts[1].trim() : t('calculator.standardQuantity');
      specifiedQuantity = parseGrams(quantity);
    }

    // Create the full line for processing (including comment for tooltip)
    const fullLine = comment ? `${itemText} // ${comment}` : itemText;

    // FIXED: Pass the clean food name, not the full item text
    this.renderFoodItemRow(foodBody, fullLine, quantity, specifiedQuantity, foodName);
  }

  /**
   * FIXED: New method to render food item from regular line with proper comment handling
   */
  private renderFoodItemRowFromLine(foodBody: HTMLTableSectionElement, line: string): void {
    // Parse the line to separate food info from comments
    let itemText = line;
    let comment = '';

    // Check for comment syntax
    const commentIndex = line.indexOf('//');
    if (commentIndex !== -1) {
      itemText = line.substring(0, commentIndex).trim();
      comment = line.substring(commentIndex + 2).trim();
    }

    // Process food name and quantity from the clean item text
    let foodName = itemText;
    let quantity = t('calculator.standardQuantity');
    let specifiedQuantity: number | null = null;

    if (itemText.includes(':')) {
      const parts = itemText.split(':');
      foodName = parts[0].trim();
      quantity = parts.length > 1 ? parts[1].trim() : t('calculator.standardQuantity');
      specifiedQuantity = parseGrams(quantity);
    }

    // Create the full line for processing (including comment for tooltip)
    const fullLine = comment ? `${itemText} // ${comment}` : itemText;

    // FIXED: Pass the clean food name, not the full item text
    this.renderFoodItemRow(foodBody, fullLine, quantity, specifiedQuantity, foodName);
  }

  // FIXED: Updated renderFoodItemRow method with explicit foodName parameter
  private renderFoodItemRow(
    foodBody: HTMLTableSectionElement,
    itemLine: string,
    quantity: string,
    specifiedQuantity: number | null = null,
    explicitFoodName?: string // FIXED: Add explicit food name parameter
  ): void {
    // Parse comment from the item line first
    const comment = this.parseCommentFromLine(itemLine);

    // Get the clean item text without comment for food processing
    let cleanItemLine = itemLine;
    if (comment) {
      const commentIndex = itemLine.indexOf('//');
      if (commentIndex !== -1) {
        cleanItemLine = itemLine.substring(0, commentIndex).trim();
      }
    }

    // FIXED: Use explicit food name if provided, otherwise extract from line
    let foodName = explicitFoodName || cleanItemLine;

    if (!explicitFoodName && cleanItemLine.includes(':') && specifiedQuantity === null) {
      const parts = cleanItemLine.split(':');
      foodName = parts[0].trim();
      quantity = parts.length > 1 ? parts[1].trim() : t('calculator.standardQuantity');
      specifiedQuantity = parseGrams(quantity);
    }

    // Create a row for this food item
    const foodRow = foodBody.insertRow();

    // Find matching food file and get nutrition data
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

    // Calculate total macros for percentages
    const totalMacros = nutritionData.protein + nutritionData.fat + nutritionData.carbs;

    // FIXED: Add name cell with proper comment handling (same as macros processor)
    const nameCell = foodRow.insertCell();
    const nameContainer = nameCell.createDiv({ cls: 'macro-food-name-container' });

    // Create main food name container
    const nameContentDiv = nameContainer.createDiv({ cls: 'food-name-content' });

    // Create a span for the food name
    const nameSpan = nameContentDiv.createSpan({
      cls: 'macro-food-name',
    });
    nameSpan.textContent = foodName; // FIXED: Use clean food name without serving size

    // FIXED: Add comment icon if comment exists
    if (comment) {
      const commentIcon = nameContentDiv.createSpan({
        cls: 'food-comment-icon',
        text: '💬',
      });

      // Add tooltip with the comment text
      safeAttachTooltip(commentIcon, comment, this.plugin);
    }

    // Handle truncation tooltip for long food names
    setTimeout(() => {
      const isOverflowing = nameSpan.scrollWidth > nameSpan.clientWidth + 2;
      if (isOverflowing) {
        nameSpan.removeAttribute('title');
        safeAttachTooltip(nameSpan, foodName, this.plugin);
      }
    }, 200);

    // FIXED: Clean quantity cell (no comments)
    const quantityCell = foodRow.insertCell();
    quantityCell.textContent = quantity;

    // Enhanced calories cell with kJ support
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

    // Only add percentage if the setting is enabled and there are macros
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

    // Only add percentage if the setting is enabled and there are macros
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

    // Only add percentage if the setting is enabled and there are macros
    if (totalMacros > 0 && this.plugin.settings.showCellPercentages) {
      const carbsPercentage = Math.round((nutritionData.carbs / totalMacros) * 100);
      carbsCell.createSpan({
        cls: 'macro-percentage',
        text: `(${carbsPercentage}%)`,
      });
    }

    carbsCell.classList.add('macroscalc-carbs-value');
  }

  /**
   * Parse comment from a macro line (same as RowRenderer)
   */
  private parseCommentFromLine(line: string): string {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return '';
    return line.substring(commentIndex + 2).trim();
  }

  private toggleDetailRow(id: string, toggle: HTMLElement): void {
    const detailRow = this.el.querySelector(`tr[data-parent-id="${id}"]`) as HTMLTableRowElement;

    if (!detailRow) return;

    if (detailRow.classList.contains('table-row-hidden')) {
      // Show the row
      detailRow.classList.remove('table-row-hidden');
      detailRow.classList.add('table-row-visible');

      // Use the common collapsed state
      toggle.classList.add('expanded');
      this.expandedRows.add(id);
    } else {
      // Hide the row
      detailRow.classList.add('table-row-hidden');
      detailRow.classList.remove('table-row-visible');

      // Use the common collapsed state
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

    // Determine sort direction
    let ascending = true;
    if (this.sortConfig.column === column) {
      ascending = !this.sortConfig.ascending;
    }

    // Update sort config
    this.sortConfig = { column, ascending };

    // Update sort indicators in header
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

    // Get all rows except the header row and aggregate row
    const allRows = Array.from(table.rows);
    const dataRowsWithDetails = allRows.slice(1, allRows.length - 1);
    const aggregateRow = allRows[allRows.length - 1];

    if (dataRowsWithDetails.length === 0) return;

    // Group main rows with their detail rows
    const rowGroups: { mainRow: HTMLTableRowElement; detailRow?: HTMLTableRowElement }[] = [];
    let currentMainRow: HTMLTableRowElement | null = null;

    dataRowsWithDetails.forEach((row) => {
      if (!row.classList.contains('macroscalc-detail-row')) {
        // This is a main data row
        currentMainRow = row as HTMLTableRowElement;
        rowGroups.push({ mainRow: currentMainRow });
      } else if (currentMainRow && row.classList.contains('macroscalc-detail-row')) {
        // This is a detail row for the current main row
        const lastGroup = rowGroups[rowGroups.length - 1];
        lastGroup.detailRow = row as HTMLTableRowElement;
      }
    });

    // Enhanced sorting with energy unit support
    rowGroups.sort((a, b) => {
      const aValue = a.mainRow.cells[columnIndex].textContent || '';
      const bValue = b.mainRow.cells[columnIndex].textContent || '';

      // For numeric columns, extract numbers and sort
      if (columnIndex > 0) {
        let aNum = 0;
        let bNum = 0;

        // Enhanced parsing for energy units
        if (columnIndex === 1 && (aValue.includes('kJ') || bValue.includes('kJ'))) {
          // Handle kJ values - convert to kcal for consistent sorting
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
          // Extract just the numbers, ignoring the (%) parts
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
        // For text columns (like Table ID)
        if (ascending) {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }
    });

    // Clear tbody and rebuild it
    const tbody = table.tBodies[0];

    // Keep header row
    const headerClone = table.rows[0];

    // Remove all rows
    while (tbody.rows.length > 0) {
      tbody.deleteRow(0);
    }

    // Add the header back
    tbody.appendChild(headerClone);

    // Add sorted rows with their detail rows
    rowGroups.forEach((group, index) => {
      // Apply alternating background
      if (index % 2 === 1) {
        group.mainRow.classList.add('macroscalc-alt-row');
      } else {
        group.mainRow.classList.remove('macroscalc-alt-row');
      }

      tbody.appendChild(group.mainRow);

      // Add detail row if exists
      if (group.detailRow) {
        tbody.appendChild(group.detailRow);
      }
    });

    // Add aggregate row back
    tbody.appendChild(aggregateRow);

    // Re-attach event listeners to the sort buttons
    for (let i = 0; i < headerRow.cells.length; i++) {
      const sortIcon = headerRow.cells[i].querySelector(
        '.macroscalc-sort-icon'
      ) as HTMLElement | null;
      if (sortIcon) {
        // Remove existing listeners to avoid duplicates
        const newSortIcon = sortIcon.cloneNode(true) as HTMLElement;
        sortIcon.parentNode?.replaceChild(newSortIcon, sortIcon);

        // Determine which column this header is for
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

    // Always show the header, even if we can't render the chart
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

    // Check if we have enough data for a chart
    if (breakdown.length < 2) {
      chartContent.createEl('p', {
        text: t('calculator.notEnoughData', { count: breakdown.length }),
        cls: 'macroscalc-chart-info',
      });
      this.plugin.logger.debug('Not enough data points for chart');
      return;
    }

    try {
      // Clean up any existing charts first
      this.destroyCharts();

      // Debug Chart.js availability
      this.plugin.logger.debug('Chart.js available on window:', !!window.Chart);

      // Load Chart.js through ChartLoader
      await this.chartLoader.loadChart();

      // Check again after loading
      this.plugin.logger.debug('Chart.js available after loading:', !!window.Chart);

      if (!window.Chart) {
        throw new Error('Chart.js failed to load');
      }

      // Create the chart wrapper
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

      // Enhanced chart configuration with energy unit support
      const currentEnergyUnit = getCurrentEnergyUnitString();
      const isKjUnit = currentEnergyUnit === 'kJ';

      // Convert calorie data if needed for display
      const calorieData = breakdown.map((item) => {
        if (isKjUnit) {
          return convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
        }
        return item.totals.calories;
      });

      // Properly typed chart configuration
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
                label: function (context: any) {
                  let value = context.parsed.y.toFixed(1);
                  let unit = '';

                  if (context.dataset.label?.includes('calories')) {
                    unit = ` ${currentEnergyUnit}`;
                    // Add conversion info in tooltip if showing kJ
                    if (isKjUnit) {
                      const originalKcal = breakdown[context.dataIndex].totals.calories;
                      return `${context.dataset.label}: ${value}${unit} (${originalKcal.toFixed(1)} kcal)`;
                    }
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

      // Create the chart with proper typing
      const chart = new window.Chart(ctx, chartConfig);

      this.plugin.logger.debug('Chart created successfully:', chart);

      // Save reference for cleanup
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

      // Show error message in UI
      const errorDiv = chartContent.createDiv({ cls: 'macroscalc-chart-error' });
      errorDiv.createEl('p', {
        text: t('calculator.chartError', { error: (error as Error).message }),
        cls: 'error-message',
      });

      // Show fallback table
      this.renderFallbackTable(chartContent, breakdown);
    }
  }

  private renderFallbackTable(container: HTMLElement, breakdown: CalcBreakdown[]): void {
    const fallbackDiv = container.createDiv({ cls: 'chart-fallback' });

    fallbackDiv.createEl('h4', { text: t('calculator.dataSummary') });

    const table = fallbackDiv.createEl('table', { cls: 'fallback-data-table' });
    const headerRow = table.insertRow();

    // Use localized headers with energy unit support
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

      // Enhanced calorie display with kJ support
      const calorieCell = row.insertCell();
      if (currentEnergyUnit === 'kJ') {
        const kjValue = convertEnergyUnit(item.totals.calories, 'kcal', 'kJ');
        calorieCell.textContent = kjValue.toFixed(1);
      } else {
        calorieCell.textContent = item.totals.calories.toFixed(1);
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
          // Remove the resize event listener first
          if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
          }

          // Destroy charts using the ChartLoader
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

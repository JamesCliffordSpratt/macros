import MacrosPlugin from '../../../main';
import {
  MacrosState,
  CLASS_NAMES,
  MacroTotals,
  DailyTargets,
  Group,
  MacroRow,
} from '../../../utils';
import { TableHeader } from '../table-header';
import { MacrosDashboard } from '../dashboard';
import { GroupRenderer } from './GroupRenderer';
import { processLinesIntoGroups } from '../utils/group-utils';
import { Notice, debounce, TFile } from 'obsidian';

/**
 * Helper function to ensure consistent calorie calculation in groups
 * @param group A group of macro rows
 * @returns The total calories calculated consistently
 */
function calculateConsistentCaloriesForGroup(group: Group): number {
  let totalCalories = 0;

  group.rows.forEach((row: MacroRow) => {
    totalCalories += row.calories;
  });

  return totalCalories;
}

export class MacrosTableRenderer {
  private plugin: MacrosPlugin;
  private el: HTMLElement;
  private id: string | null;
  private state: MacrosState | null;
  private groupRenderer: GroupRenderer;
  private tableHeader: TableHeader | null = null;
  private updateInProgress = false;
  private cachedLines: string[] | null = null;
  private cachedProcessedGroups: Group[] | null = null;

  // Debounced redraw function to prevent multiple consecutive redraws
  private debouncedRedraw = debounce(
    async () => {
      await this.plugin.forceCompleteReload();
    },
    200,
    true
  );

  // New field to track if a full refresh is needed
  private needsFullRefresh = false;

  constructor(plugin: MacrosPlugin, el: HTMLElement, id: string | null) {
    this.plugin = plugin;
    this.el = el;
    this.id = id;
    this.state = null;

    if (id) {
      // Create state with plugin ID for better isolation
      // Use the unified MacrosState instead of MacrosTableState
      this.state = new MacrosState(plugin, id, 'table');

      // Migrate from legacy storage if needed - this is handled automatically by MacrosState
    }

    this.groupRenderer = new GroupRenderer(this.plugin, this.state);

    // Register event handlers to detect external file changes using Obsidian's API
    this.plugin.registerEvent(this.plugin.app.vault.on('modify', this.handleFileModify.bind(this)));
  }

  /**
   * Handle external file modifications
   */
  private handleFileModify(file: TFile): void {
    const activeFile = this.plugin.dataManager.getActiveFile();
    if (activeFile && file.path === activeFile.path) {
      // File was modified externally, invalidate caches
      this.invalidateCache();
      // Mark that we need a full refresh
      this.needsFullRefresh = true;
    }
  }

  async render(lines: string[]): Promise<void> {
    await this.refreshTable(lines);
  }

  /**
   * Extract the base food name from a macro line, removing any quantities
   * @param macroLine The macro line text
   * @returns The food name without quantity
   */
  private extractFoodName(macroLine: string): string {
    // Check if line has a quantity
    if (macroLine.includes(':')) {
      return macroLine.split(':')[0].trim();
    }
    return macroLine.trim();
  }

  private async refreshTable(lines: string[]): Promise<void> {
    const activeFile = this.plugin.dataManager.getActiveFile();
    if (!activeFile || !this.id) {
      this.renderTableFromLines(lines);
      return;
    }

    try {
      // Always force a fresh read from the file when refreshing the table
      // This is critical to handle external file changes
      this.invalidateCache();

      // UPDATED: Use centralized DataManager method to get lines
      const extractedLines = await this.plugin.dataManager.getFullMacrosData(this.id);

      if (extractedLines && extractedLines.length > 0) {
        this.renderTableFromLines(extractedLines);

        // If we need a full refresh after rendering
        if (this.needsFullRefresh) {
          this.plugin.logger.debug('Performing full refresh of all views');

          // Use the centralized refresh method for a complete refresh
          await this.plugin.forceCompleteReload();

          // Reset the flag
          this.needsFullRefresh = false;
        }
      } else {
        this.renderTableFromLines(lines);
      }
    } catch (error) {
      this.plugin.logger.error('Error refreshing table:', error);
      this.renderTableFromLines(lines);
    }
  }

  /**
   * Compare two arrays of strings to check if they are equal
   */
  private areLineArraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

  private renderTableFromLines(lines: string[]): void {
    // If lines are the same as cached lines, skip processing
    if (this.cachedLines && this.areLineArraysEqual(this.cachedLines, lines)) {
      return;
    }

    // Cache the new lines
    this.cachedLines = [...lines];

    // Create a document fragment to batch DOM operations
    const fragment = createFragment();
    this.el.empty();

    const dailyTargets: DailyTargets = {
      calories: this.plugin.settings.dailyCaloriesTarget,
      protein: this.plugin.settings.dailyProteinTarget,
      fat: this.plugin.settings.dailyFatTarget,
      carbs: this.plugin.settings.dailyCarbsTarget,
    };

    // Process groups only if needed (memoize expensive operation)
    let groups: Group[];
    if (!this.cachedProcessedGroups) {
      groups = processLinesIntoGroups(lines, this.plugin);
      this.cachedProcessedGroups = groups;
    } else {
      groups = this.cachedProcessedGroups;
    }

    // Calculate combined totals in one pass with consistent rounding
    const combinedTotals: MacroTotals = {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    };

    // Use a consistent rounding approach when aggregating
    groups.forEach((g) => {
      // Use the consistent calculation for calories
      combinedTotals.calories += calculateConsistentCaloriesForGroup(g);
      combinedTotals.protein += g.total.protein;
      combinedTotals.fat += g.total.fat;
      combinedTotals.carbs += g.total.carbs;
    });

    // For debugging
    if (this.id) {
      this.plugin.logger.debug(`Dashboard calories for ${this.id}: ${combinedTotals.calories}`);
    }

    // Create header with toggle functionality
    this.tableHeader = new TableHeader(
      fragment as unknown as HTMLElement,
      this.id,
      (collapse) => this.toggleAllSections(collapse),
      this.plugin
    );
    this.tableHeader.render();

    // Add dashboard to fragment
    const dashboard = new MacrosDashboard(
      fragment as unknown as HTMLElement,
      this.id ?? '',
      this.plugin
    );
    dashboard.create(combinedTotals, dailyTargets);

    // Create table in fragment
    const table = createEl('table', {
      cls: ['macros-table', 'macros-table-colored'],
    });

    // Store macros ID on the table for context menu functionality
    if (this.id) {
      table.dataset.macrosId = this.id;
    }

    // Render groups to table - UPDATED: Pass macrosId for comment functionality
    this.groupRenderer.renderGroups(
      table,
      groups,
      combinedTotals,
      dailyTargets,
      async (macroLine) => await this.removeMacroLine(macroLine),
      async (macroLine, newQuantity, isMealItem, mealName) =>
        await this.updateMacroLineQuantity(macroLine, newQuantity, isMealItem, mealName),
      this.id || '' // Pass macrosId for comment functionality
    );

    fragment.appendChild(table);

    // Single DOM update
    this.el.appendChild(fragment);
  }

  /**
   * Updates the quantity of a meal item directly in the file
   * SIMPLIFIED: No multiplier handling
   */
  private async updateLocalMealItem(
    mealName: string,
    foodName: string,
    newQuantity: number
  ): Promise<string[]> {
    if (!this.id) {
      throw new Error('No macro ID');
    }

    try {
      const context = await this.plugin.dataManager.getDocumentContext(this.id);

      if (!context || context.allLines.length === 0) {
        throw new Error('No macros data found');
      }

      this.plugin.logger.debug(`Searching for meal: "${mealName}" in block with id: "${this.id}"`);

      // Find meal line - SIMPLIFIED: No multiplier matching
      const mealLineIndex = context.allLines.findIndex((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine.toLowerCase().startsWith('meal:')) return false;

        const extractedMealName = trimmedLine.substring(5).trim();
        return extractedMealName.toLowerCase() === mealName.toLowerCase();
      });

      if (mealLineIndex === -1) {
        this.plugin.logger.error(`Meal '${mealName}' not found. Available lines in the block:`);
        context.allLines.forEach((line, i) => {
          this.plugin.logger.debug(`Line ${i}: ${line}`);
        });
        throw new Error(`Meal '${mealName}' not found in this macros block`);
      }

      const updatedLines = [...context.allLines];

      // Look for the food item in the bullet points following the meal line
      let itemFound = false;
      let i = mealLineIndex + 1;

      while (i < context.allLines.length && context.allLines[i].trim().startsWith('-')) {
        const line = context.allLines[i].trim();
        const itemText = line.substring(1).trim();
        const itemFoodName = this.extractFoodName(itemText);

        if (itemFoodName.toLowerCase() === foodName.toLowerCase()) {
          // Update this item's quantity
          const newLine = `- ${foodName}:${newQuantity}g`;
          updatedLines[i] = newLine;
          itemFound = true;
          break;
        }

        i++;
      }

      if (!itemFound) {
        throw new Error(`Food item '${foodName}' not found under meal '${mealName}'`);
      }

      const success = await this.plugin.dataManager.updateMacrosBlock(this.id, updatedLines);

      if (!success) {
        throw new Error('Failed to update macros block');
      }

      return updatedLines.filter((l) => l !== '' && !l.startsWith('id:'));
    } catch (error) {
      this.plugin.logger.error('Error updating local meal item:', error);
      throw error;
    }
  }

  /**
   * Updates the quantity of a food item in the macros table.
   * Enhanced with centralized refresh mechanism
   * @param macroLine The original macro line to update
   * @param newQuantity The new quantity in grams
   * @param isMealItem Whether this is a meal template item
   * @param mealName The name of the meal if this is a meal item
   */
  private async updateMacroLineQuantity(
    macroLine: string,
    newQuantity: number,
    isMealItem = false,
    mealName = ''
  ): Promise<void> {
    // Extract the food name without quantity for more flexible matching
    const foodName = this.extractFoodName(macroLine);

    // Prevent multiple concurrent updates
    if (this.updateInProgress) {
      new Notice('Update already in progress, please wait...');
      return;
    }

    this.updateInProgress = true;

    try {
      // Handle meal template items with local updates
      if (isMealItem && mealName) {
        await this.updateLocalMealItem(mealName, foodName, newQuantity);
      } else if (this.id) {
        // Use the centralized document context method
        const context = await this.plugin.dataManager.getDocumentContext(this.id);

        if (!context || context.allLines.length === 0) {
          throw new Error('Could not load macros data for update');
        }

        // Update the lines with the new quantity
        const newLines = context.allLines.map((line) => {
          // Skip meal items as they're handled separately
          if (line.toLowerCase().startsWith('meal:') || line.startsWith('-')) {
            return line;
          }

          const lineFoodName = this.extractFoodName(line);

          // If this line matches our food item (ignoring quantity)
          if (lineFoodName.toLowerCase() === foodName.toLowerCase()) {
            // Create a new line with the updated quantity
            return `${foodName}:${newQuantity}g`;
          }

          // Keep other lines unchanged
          return line;
        });

        // UPDATED: Use centralized DataManager method to update the block
        const success = await this.plugin.dataManager.updateMacrosBlock(this.id, newLines);

        if (!success) {
          throw new Error(`Could not update macros block for ID ${this.id}`);
        }
      }

      // Use the centralized force complete refresh method
      await this.plugin.forceCompleteReload();

      new Notice('Item updated successfully');
    } catch (error) {
      this.plugin.logger.error('Error updating macro line:', error);
      new Notice(`Error updating item: ${(error as Error).message || 'Unknown error'}`);
    } finally {
      this.updateInProgress = false;
    }
  }

  /**
   * Removes a macro line from the macros block
   * SIMPLIFIED: No multiplier logic
   * @param macroLine The line to remove
   */
  private async removeMacroLine(macroLine: string): Promise<void> {
    if (this.updateInProgress) {
      new Notice('Update already in progress, please wait...');
      return;
    }

    this.updateInProgress = true;

    try {
      const foodName = this.extractFoodName(macroLine);

      if (!this.id) {
        throw new Error('No macros ID available for operation');
      }

      const context = await this.plugin.dataManager.getDocumentContext(this.id);

      if (!context || context.allLines.length === 0) {
        throw new Error(`No data found for ID ${this.id}`);
      }

      let newLines: string[] = [];

      if (macroLine.toLowerCase().startsWith('meal:')) {
        // For meal lines, remove the entire meal section
        // SIMPLIFIED: Just find meal by name, no multiplier matching
        const mealName = macroLine.substring(5).trim();

        const mealLineIndex = context.allLines.findIndex(
          (l) =>
            l.toLowerCase().startsWith('meal:') &&
            l.substring(5).trim().toLowerCase() === mealName.toLowerCase()
        );

        if (mealLineIndex === -1) {
          throw new Error('Meal not found');
        }

        // Remove meal line and all its bullet points
        newLines = context.allLines.slice(0, mealLineIndex);
        let j = mealLineIndex + 1;
        while (j < context.allLines.length && context.allLines[j].startsWith('-')) {
          j++;
        }
        newLines = newLines.concat(context.allLines.slice(j));
      } else {
        // For food items, filter based on the food name
        newLines = context.allLines.filter((line) => {
          if (line.startsWith('-') || line.toLowerCase().startsWith('meal:')) {
            return true; // Keep all meal-related lines
          }
          const lineFoodName = this.extractFoodName(line);
          return lineFoodName.toLowerCase() !== foodName.toLowerCase();
        });
      }

      const success = await this.plugin.dataManager.updateMacrosBlock(this.id, newLines);

      if (!success) {
        throw new Error(`Failed to update macros block for ID ${this.id}`);
      }

      await this.plugin.forceCompleteReload();

      new Notice('Item removed successfully');
    } catch (error) {
      this.plugin.logger.error('Error removing macro line:', error);
      new Notice(`Error removing item: ${(error as Error).message || 'Unknown error'}`);
    } finally {
      this.updateInProgress = false;
    }
  }

  // Direct DOM manipulation methods
  private collapseAllSections(): void {
    const tables = this.el.querySelectorAll('table');
    if (tables.length === 0) return;

    tables.forEach((table) => {
      const headers = table.querySelectorAll(
        `.${CLASS_NAMES.TABLE.MEAL_HEADER_CELL}.${CLASS_NAMES.TABLE.COLLAPSIBLE}, .combined-totals-header .${CLASS_NAMES.TABLE.COLLAPSIBLE}`
      );

      headers.forEach((header) => {
        header.classList.add(CLASS_NAMES.TABLE.COLLAPSED);
        header.classList.add('collapsed');
        const toggleIcon = header.querySelector(`.${CLASS_NAMES.TABLE.MEAL_TOGGLE_ICON}`);
        if (toggleIcon) toggleIcon.textContent = '▶';

        const headerRow = header.parentElement as HTMLTableRowElement;
        if (!headerRow || !headerRow.dataset.section) return;
        const sectionName = headerRow.dataset.section;

        const childRows = table.querySelectorAll(`tr[data-parent="${sectionName}"]`);
        childRows.forEach((row) => {
          const el = row as HTMLElement;
          el.classList.add('table-row-hidden');
          el.classList.remove('table-row-visible');
        });

        (header as HTMLElement).dataset.macroState = 'collapsed';

        if (this.state && this.id) {
          // Use the new MacrosState saveCollapsedState method
          this.state.saveCollapsedState(sectionName, true);
        }
      });
    });

    if (this.tableHeader) {
      this.tableHeader.setCollapseState();
    }
  }

  private expandAllSections(): void {
    const tables = this.el.querySelectorAll('table');
    if (tables.length === 0) return;

    tables.forEach((table) => {
      const headers = table.querySelectorAll(
        `.${CLASS_NAMES.TABLE.MEAL_HEADER_CELL}.${CLASS_NAMES.TABLE.COLLAPSIBLE}, .combined-totals-header .${CLASS_NAMES.TABLE.COLLAPSIBLE}`
      );

      headers.forEach((header) => {
        header.classList.remove(CLASS_NAMES.TABLE.COLLAPSED);
        header.classList.remove('collapsed');
        const toggleIcon = header.querySelector(`.${CLASS_NAMES.TABLE.MEAL_TOGGLE_ICON}`);
        if (toggleIcon) toggleIcon.textContent = '▼';

        const headerRow = header.parentElement as HTMLTableRowElement;
        if (!headerRow || !headerRow.dataset.section) return;
        const sectionName = headerRow.dataset.section;

        const childRows = table.querySelectorAll(`tr[data-parent="${sectionName}"]`);
        childRows.forEach((row) => {
          const el = row as HTMLElement;
          el.classList.add('table-row-visible');
          el.classList.remove('table-row-hidden');
        });

        (header as HTMLElement).dataset.macroState = 'expanded';

        if (this.state && this.id) {
          // Use the new MacrosState saveCollapsedState method
          this.state.saveCollapsedState(sectionName, false);
        }
      });
    });

    if (this.tableHeader) {
      this.tableHeader.setExpandState();
    }
  }

  // Updated toggle method that directly manipulates DOM and updates the button state
  private toggleAllSections(collapse: boolean): void {
    this.plugin.logger.debug(`Toggle all sections called with collapse=${collapse}`);

    if (collapse) {
      this.collapseAllSections();

      // Also collapse the dashboard and save its state
      const dashboardHeader = this.el.querySelector('.macro-dashboard-header');
      const dashboardContent = this.el.querySelector('.macro-dashboard-content');
      const toggleIcon = dashboardHeader?.querySelector('.toggle-icon');

      if (dashboardHeader) {
        dashboardHeader.classList.add('collapsed');
      }
      if (dashboardContent) {
        dashboardContent.classList.add('collapsed');
      }
      if (toggleIcon) {
        toggleIcon.classList.add('collapsed');
      }

      // Save dashboard state
      if (this.id && this.state) {
        const dashboardState = new MacrosState(this.plugin, this.id, 'dashboard');
        dashboardState.saveCollapsedState('dashboard', true);
      }
    } else {
      this.expandAllSections();

      // Also expand the dashboard and save its state
      const dashboardHeader = this.el.querySelector('.macro-dashboard-header');
      const dashboardContent = this.el.querySelector('.macro-dashboard-content');
      const toggleIcon = dashboardHeader?.querySelector('.toggle-icon');

      if (dashboardHeader) {
        dashboardHeader.classList.remove('collapsed');
      }
      if (dashboardContent) {
        dashboardContent.classList.remove('collapsed');
      }
      if (toggleIcon) {
        toggleIcon.classList.remove('collapsed');
      }

      // Save dashboard state
      if (this.id && this.state) {
        const dashboardState = new MacrosState(this.plugin, this.id, 'dashboard');
        dashboardState.saveCollapsedState('dashboard', false);
      }
    }
  }

  /**
   * Invalidate caches when needed
   */
  public invalidateCache(): void {
    this.cachedLines = null;
    this.cachedProcessedGroups = null;
  }
}

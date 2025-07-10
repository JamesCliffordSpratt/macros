import MacrosPlugin from '../../../main';
import {
  formatCalories,
  formatGrams,
  formatPercentage,
  safeAttachTooltip,
  MacroRow,
  Group,
  MacroTotals,
  DailyTargets,
  CLASS_NAMES,
  MACRO_TYPES,
  ProgressBarFactory,
} from '../../../utils';
import { parseGrams } from '../../../utils/parsingUtils';
import { formatServing } from '../../../utils/formatters';
import { Notice, Modal, ButtonComponent } from 'obsidian';
import { t } from '../../../lang/I18nManager';

/**
 * Confirmation Modal for Delete Actions - FIXED LOCALIZATION
 */
class DeleteConfirmationModal extends Modal {
  private itemName: string;
  private isMealItem: boolean;
  private mealName: string;
  private onConfirm: () => Promise<void>;
  private onCancel: () => void;

  constructor(
    plugin: MacrosPlugin,
    itemName: string,
    isMealItem: boolean,
    mealName: string,
    onConfirm: () => Promise<void>,
    onCancel: () => void
  ) {
    super(plugin.app);
    this.itemName = itemName;
    this.isMealItem = isMealItem;
    this.mealName = mealName;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Modal header
    const header = contentEl.createEl('div', { cls: 'modal-header delete-confirmation-header' });
    header.createEl('h2', {
      text: t('table.actions.removeItem'),
      cls: 'delete-confirmation-title',
    });

    // Modal content
    const content = contentEl.createEl('div', { cls: 'modal-content delete-confirmation-content' });

    // Warning icon and message
    const messageContainer = content.createEl('div', { cls: 'delete-message-container' });
    messageContainer.createEl('div', {
      cls: 'delete-warning-icon',
      text: '⚠️',
    });

    // Fixed: Use proper interpolation for the message
    const message = this.isMealItem
      ? t('table.confirmDelete.mealitem')
      : t('table.confirmDelete.item', { itemName: this.itemName });

    messageContainer.createEl('p', {
      text: message,
      cls: 'delete-confirmation-message',
    });

    // Additional context
    const contextText = this.isMealItem
      ? t('table.confirmDelete.mealitemContext')
      : t('table.confirmDelete.itemContext');

    content.createEl('p', {
      text: contextText,
      cls: 'delete-context-message',
    });

    // Button container
    const buttonContainer = content.createEl('div', { cls: 'modal-button-container' });

    // Cancel button
    const cancelBtn = new ButtonComponent(buttonContainer)
      .setButtonText(t('general.cancel'))
      .setClass('mod-muted')
      .onClick(() => {
        this.onCancel();
        this.close();
      });

    // Delete button
    const deleteBtn = new ButtonComponent(buttonContainer)
      .setButtonText(t('general.remove'))
      .setClass('mod-warning')
      .onClick(async () => {
        try {
          await this.onConfirm();
          this.close();
        } catch (error) {
          console.error('Error during delete:', error);
          new Notice(t('notifications.itemRemoveError', { error: (error as Error).message }));
        }
      });

    // Focus the cancel button by default for safety
    cancelBtn.buttonEl.focus();

    // Handle escape key
    this.scope.register([], 'Escape', () => {
      this.onCancel();
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class RowRenderer {
  private plugin: MacrosPlugin;
  private removeCallback: ((macroLine: string) => Promise<void>) | null = null;
  private updateQuantityCallback:
    | ((
        macroLine: string,
        newQuantity: number,
        isMealItem?: boolean,
        mealName?: string,
        originalItemText?: string
      ) => Promise<void>)
    | null = null;

  constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
  }

  setRemoveCallback(callback: (macroLine: string) => Promise<void>): void {
    this.removeCallback = callback;
  }

  setUpdateQuantityCallback(
    callback: (
      macroLine: string,
      newQuantity: number,
      isMealItem?: boolean,
      mealName?: string,
      originalItemText?: string
    ) => Promise<void>
  ): void {
    this.updateQuantityCallback = callback;
  }

  private extractFoodName(macroLine: string): string {
    if (macroLine.includes(':')) {
      return macroLine.split(':')[0].trim();
    }
    return macroLine.trim();
  }

  private generateMacroCompositionTooltip(
    macro: 'protein' | 'fat' | 'carbs',
    value: number,
    row: MacroRow,
    macroPercent: number
  ): string {
    const macroLabel =
      macro === 'protein'
        ? t('table.headers.protein')
        : macro === 'fat'
          ? t('table.headers.fat')
          : t('table.headers.carbs');
    return t('tooltips.macroComposition', {
      macro: macroLabel,
      value: value.toString(),
      percent: macroPercent.toString(),
    });
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Detects if the current device is mobile/touch-capable
   */
  private isMobileDevice(): boolean {
    return window.innerWidth <= 768 || 'ontouchstart' in window;
  }

  /**
   * Implements long press to delete functionality for mobile devices
   */
  private setupLongPressToDelete(
    tableRow: HTMLTableRowElement,
    row: MacroRow,
    isMealItem: boolean,
    mealName: string
  ): void {
    if (!this.isMobileDevice()) {
      return; // Only enable on mobile devices
    }

    let longPressTimer: NodeJS.Timeout | null = null;
    let startTime = 0;
    let startX = 0;
    let startY = 0;
    let isLongPress = false;
    let hasMovedTooMuch = false;

    const longPressDuration = 800; // 800ms for long press
    const movementThreshold = 10; // 10px movement tolerance

    // Touch start handler
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return; // Only single touch

      const touch = e.touches[0];
      startTime = Date.now();
      startX = touch.clientX;
      startY = touch.clientY;
      isLongPress = false;
      hasMovedTooMuch = false;

      // Add visual feedback class
      tableRow.classList.add('long-press-active');

      // Start long press timer
      longPressTimer = setTimeout(() => {
        if (!hasMovedTooMuch) {
          isLongPress = true;
          tableRow.classList.add('long-press-ready');

          // Haptic feedback if available
          if ('vibrate' in navigator) {
            navigator.vibrate([50, 50, 100]); // Pattern: short, short, long
          }

          // Show delete confirmation modal
          this.showDeleteConfirmation(row, isMealItem, mealName);
        }
      }, longPressDuration);
    };

    // Touch move handler
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !longPressTimer) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      // If user moves too much, cancel long press
      if (deltaX > movementThreshold || deltaY > movementThreshold) {
        hasMovedTooMuch = true;
        this.cancelLongPress(tableRow, longPressTimer);
        longPressTimer = null;
      }
    };

    // Touch end handler
    const handleTouchEnd = () => {
      if (longPressTimer) {
        this.cancelLongPress(tableRow, longPressTimer);
        longPressTimer = null;
      }

      // Clean up visual states
      tableRow.classList.remove('long-press-active', 'long-press-ready');
      isLongPress = false;
      hasMovedTooMuch = false;
    };

    // Touch cancel handler
    const handleTouchCancel = () => {
      if (longPressTimer) {
        this.cancelLongPress(tableRow, longPressTimer);
        longPressTimer = null;
      }

      tableRow.classList.remove('long-press-active', 'long-press-ready');
      isLongPress = false;
      hasMovedTooMuch = false;
    };

    // Register event listeners
    this.plugin.registerDomEvent(tableRow, 'touchstart', handleTouchStart, { passive: true });
    this.plugin.registerDomEvent(tableRow, 'touchmove', handleTouchMove, { passive: true });
    this.plugin.registerDomEvent(tableRow, 'touchend', handleTouchEnd, { passive: true });
    this.plugin.registerDomEvent(tableRow, 'touchcancel', handleTouchCancel, { passive: true });

    // Prevent context menu on long press (which can interfere)
    this.plugin.registerDomEvent(tableRow, 'contextmenu', (e: Event) => {
      if (this.isMobileDevice()) {
        e.preventDefault();
      }
    });
  }

  /**
   * Cancels an active long press
   */
  private cancelLongPress(tableRow: HTMLTableRowElement, timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    tableRow.classList.remove('long-press-active', 'long-press-ready');
  }

  /**
   * Shows the delete confirmation modal
   */
  private showDeleteConfirmation(row: MacroRow, isMealItem: boolean, mealName: string): void {
    const modal = new DeleteConfirmationModal(
      this.plugin,
      row.name,
      isMealItem,
      mealName,
      async () => {
        // Confirm action
        try {
          if (isMealItem) {
            await this.onRemoveMealItem(mealName, row.name, row.macroLine);
          } else {
            await this.onRemove(row.macroLine);
          }

          const itemDescription = isMealItem
            ? `${row.name} ${t('general.from')} ${mealName}`
            : row.name;
          new Notice(t('notifications.itemRemoved', { item: itemDescription }));
        } catch (error) {
          this.plugin.logger.error('Error removing item:', error);
          new Notice(t('notifications.itemRemoveError', { error: (error as Error).message }));
        }
      },
      () => {
        // Cancel action
        new Notice(t('notifications.removalCancelled'));
      }
    );

    modal.open();
  }

  /**
   * Creates a desktop remove button (only shown on non-mobile devices)
   */
  private createDesktopRemoveButton(
    container: HTMLElement,
    isMealItem: boolean,
    mealName: string,
    row: MacroRow
  ): HTMLElement | null {
    if (this.isMobileDevice()) {
      return null; // Don't create button on mobile
    }

    const removeBtn = container.createSpan({
      cls: `${CLASS_NAMES.TABLE.CONTROL_ICON} ${CLASS_NAMES.ICONS.REMOVE} macro-food-remove-btn`,
      text: '–',
    });

    const tooltipText = isMealItem
      ? t('table.actions.removeFromMeal', { itemName: row.name, mealName: mealName })
      : t('table.actions.removeItem');

    safeAttachTooltip(removeBtn, tooltipText, this.plugin);

    this.plugin.registerDomEvent(removeBtn, 'click', async (e: MouseEvent) => {
      e.stopPropagation();

      // Show confirmation modal on desktop too for consistency
      this.showDeleteConfirmation(row, isMealItem, mealName);
    });

    return removeBtn;
  }

  async onRemove(macroLine: string): Promise<void> {
    if (this.removeCallback) {
      await this.removeCallback(macroLine);
    }
  }

  async onUpdateQuantity(
    macroLine: string,
    newQuantity: number,
    isMealItem = false,
    mealName = '',
    originalItemText = ''
  ): Promise<void> {
    if (this.updateQuantityCallback) {
      await this.updateQuantityCallback(
        macroLine,
        newQuantity,
        isMealItem,
        mealName,
        originalItemText
      );

      await this.plugin.forceCompleteReload();
    }
  }

  /**
   * Remove a meal template item by modifying the macros block
   */
  async onRemoveMealItem(mealName: string, foodName: string, macroLine: string): Promise<void> {
    if (!this.plugin.dataManager.getActiveFile()) {
      new Notice(t('errors.noActiveFile'));
      return;
    }

    try {
      // Find the macros block ID from the current context
      const macrosContainer = document.querySelector('[data-macros-id]');
      const macrosId = macrosContainer?.getAttribute('data-macros-id');

      if (!macrosId) {
        // Fallback: try to find ID from DOM or use a different approach
        this.plugin.logger.warn('Could not find macros ID, attempting fallback');

        // Look for the ID in the page content
        const activeFile = this.plugin.dataManager.getActiveFile();
        if (!activeFile) {
          throw new Error(t('errors.noActiveFile'));
        }

        const content = await this.plugin.dataManager.readFileContent(activeFile, true);
        const regex = /```macros\s+id:\s*(\S+)\s*([\s\S]*?)```/g;
        let foundId = null;
        let match;

        while ((match = regex.exec(content)) !== null) {
          const blockContent = match[2];
          if (
            blockContent.includes(`meal:${mealName}`) ||
            blockContent.includes(`meal: ${mealName}`)
          ) {
            foundId = match[1];
            break;
          }
        }

        if (!foundId) {
          throw new Error(t('errors.macrosBlockNotFound', { mealName: mealName }));
        }

        await this.removeMealItemFromBlock(foundId, mealName, foodName);
      } else {
        await this.removeMealItemFromBlock(macrosId, mealName, foodName);
      }

      await this.plugin.forceCompleteReload();
    } catch (error) {
      this.plugin.logger.error('Error removing meal item:', error);
      throw error; // Re-throw so modal can handle it
    }
  }

  /**
   * Remove a specific food item from a meal template in the macros block
   */
  private async removeMealItemFromBlock(
    macrosId: string,
    mealName: string,
    foodName: string
  ): Promise<void> {
    const context = await this.plugin.dataManager.getDocumentContext(macrosId);

    if (!context || context.allLines.length === 0) {
      throw new Error(t('errors.noMacrosData'));
    }

    // Find the meal line
    const mealLineIndex = context.allLines.findIndex((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine.toLowerCase().startsWith('meal:')) return false;

      const extractedMealName = trimmedLine.substring(5).trim();
      const baseMealName = extractedMealName.includes(' × ')
        ? extractedMealName.split(' × ')[0]
        : extractedMealName;

      return baseMealName.toLowerCase() === mealName.toLowerCase();
    });

    if (mealLineIndex === -1) {
      throw new Error(t('errors.mealNotFound', { mealName: mealName }));
    }

    // Create a new array of lines with the food item removed
    const updatedLines = [...context.allLines];
    let i = mealLineIndex + 1;
    let itemRemoved = false;

    // Look through bullet points following the meal line
    while (i < context.allLines.length && context.allLines[i].trim().startsWith('-')) {
      const line = context.allLines[i].trim();
      const itemText = line.substring(1).trim(); // Remove the bullet
      const itemFoodName = this.extractFoodName(itemText);

      // Check if this item matches the food we want to remove
      if (itemFoodName.toLowerCase() === foodName.toLowerCase()) {
        // Remove this line
        updatedLines.splice(i, 1);
        itemRemoved = true;
        break;
      }

      i++;
    }

    if (!itemRemoved) {
      throw new Error(t('errors.foodItemNotFound', { foodName: foodName, mealName: mealName }));
    }

    // Update the macros block
    const success = await this.plugin.dataManager.updateMacrosBlock(macrosId, updatedLines);

    if (!success) {
      throw new Error(t('errors.updateMacrosBlockFailed'));
    }
  }

  renderFoodRow(
    table: HTMLTableElement,
    row: MacroRow,
    group: Group,
    parentSection: string,
    dailyTargets: DailyTargets
  ): void {
    const r = table.insertRow();
    r.dataset.parent = parentSection;
    r.dataset.macroLine = row.macroLine;
    r.dataset.foodName = this.extractFoodName(row.macroLine);

    const isMealItem = !!group.macroLine && group.macroLine.toLowerCase().startsWith('meal:');
    const mealName = isMealItem ? group.name : '';

    // Set up long press to delete for mobile (applies to the whole row)
    if (!group.macroLine || isMealItem) {
      this.setupLongPressToDelete(r, row, isMealItem, mealName);
    }

    // Create name cell
    const nameCell = r.insertCell();
    const nameContainer = nameCell.createDiv({ cls: 'macro-food-name-container' });

    // Create a span for the food name with text truncation
    const nameSpan = nameContainer.createSpan({
      cls: 'macro-food-name',
    });
    nameSpan.textContent = row.name;

    // Explicitly remove any title attribute that might have been set
    nameSpan.removeAttribute('title');

    // Use TooltipManager for consistent tooltips - check if truncated after DOM is ready
    setTimeout(() => {
      // Check if the text is actually truncated by comparing scroll width vs client width
      if (nameSpan.scrollWidth > nameSpan.clientWidth) {
        // Double-check no title attribute is present
        nameSpan.removeAttribute('title');
        safeAttachTooltip(nameSpan, row.name, this.plugin);
      }
    }, 150);

    // Add remove button only on desktop (mobile uses long press)
    if (!group.macroLine || isMealItem) {
      this.createDesktopRemoveButton(nameContainer, isMealItem, mealName, row);
    }

    // Add mobile instruction tooltip
    if (this.isMobileDevice() && (!group.macroLine || isMealItem)) {
      safeAttachTooltip(nameCell, t('table.actions.longPressToDelete'), this.plugin);
    }

    const quantityCell = r.insertCell();
    quantityCell.classList.add('editable-quantity');
    safeAttachTooltip(quantityCell, t('table.actions.clickToEdit'), this.plugin);
    quantityCell.textContent = formatServing(row.serving);

    const servingValue = parseGrams(row.serving);

    const quantityCellClickHandler = (e: MouseEvent) => {
      if (quantityCell.querySelector('input')) return;
      quantityCell.empty();

      const input = createEl('input', {
        type: 'number',
        attr: { min: '0', step: '1', value: servingValue.toString() },
      });
      quantityCell.appendChild(input);
      input.focus();
      input.select();

      let inputProcessed = false;
      const applyQuantityChange = async () => {
        if (inputProcessed) return;
        inputProcessed = true;

        const newValue = parseFloat(input.value);
        if (!isNaN(newValue) && newValue >= 0) {
          try {
            quantityCell.classList.add('quantity-updating');
            quantityCell.textContent = `${newValue}g (${t('general.updating')}...)`;
            await this.onUpdateQuantity(
              row.macroLine,
              newValue,
              isMealItem,
              mealName,
              row.macroLine
            );
          } catch (error) {
            this.plugin.logger.error('Error updating quantity:', error);
            quantityCell.classList.remove('quantity-updating');
            quantityCell.classList.add('quantity-error');
            quantityCell.textContent = `${servingValue}g (${t('general.error').toLowerCase()})`;
            setTimeout(() => {
              quantityCell.classList.remove('quantity-error');
              quantityCell.textContent = row.serving;
            }, 2000);
            new Notice(
              t('notifications.quantityUpdateError', {
                error: (error as Error).message || t('errors.unknownError'),
              })
            );
          }
        } else {
          quantityCell.textContent = row.serving;
        }
      };

      const inputBlurHandler = applyQuantityChange;
      const inputKeydownHandler = async (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await applyQuantityChange();
        } else if (e.key === 'Escape') {
          inputProcessed = true;
          quantityCell.textContent = row.serving;
        }
      };

      this.plugin.registerDomEvent(input, 'blur', inputBlurHandler);
      this.plugin.registerDomEvent(input, 'keydown', inputKeydownHandler);

      e.stopPropagation();
    };

    this.plugin.registerDomEvent(quantityCell, 'click', quantityCellClickHandler);

    const caloriesCell = r.insertCell();
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL);
    caloriesCell.textContent = formatCalories(row.calories);

    // Create custom tooltip for calories with proper energy unit handling
    let calorieTooltipMessage: string;
    const currentUnit = this.plugin.settings.energyUnit;
    const caloriePercentage = (row.calories / dailyTargets.calories) * 100;

    if (currentUnit === 'kJ') {
      // Convert kcal to kJ for tooltip
      const caloriesInKj = row.calories * 4.184;
      calorieTooltipMessage = `${caloriesInKj.toFixed(1)} kJ • ${Math.round(caloriePercentage)}% ${t('table.summary.dailyTarget')}`;
    } else {
      // Use kcal values directly
      calorieTooltipMessage = `${row.calories.toFixed(1)} kcal • ${Math.round(caloriePercentage)}% ${t('table.summary.dailyTarget')}`;
    }

    safeAttachTooltip(caloriesCell, calorieTooltipMessage, this.plugin);

    this.renderMacroCell(r, row.protein, row, MACRO_TYPES.PROTEIN, dailyTargets);
    this.renderMacroCell(r, row.fat, row, MACRO_TYPES.FAT, dailyTargets);
    this.renderMacroCell(r, row.carbs, row, MACRO_TYPES.CARBS, dailyTargets);
  }

  renderMacroCell(
    tableRow: HTMLTableRowElement,
    value: number,
    row: MacroRow,
    macroType: string,
    dailyTargets: DailyTargets
  ): void {
    const cell = tableRow.insertCell();
    cell.classList.add(CLASS_NAMES.MACRO.CELL, `${macroType}-cell`);

    const content = document.createElement('div');

    const total = row.protein + row.fat + row.carbs;
    const percentageOfFood = total > 0 ? Math.round((value / total) * 100) : 0;

    content.textContent = formatGrams(value);

    if (total > 0 && this.plugin.settings.showCellPercentages) {
      content.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${percentageOfFood}%)`,
      });
    }

    cell.appendChild(content);

    ProgressBarFactory.createMacroProgressBar(cell, percentageOfFood, macroType);

    let macroLabel = '';
    let target = 0;
    let macroType2: 'protein' | 'fat' | 'carbs' = 'protein';

    if (macroType === MACRO_TYPES.PROTEIN) {
      macroLabel = t('table.headers.protein');
      target = dailyTargets.protein;
      macroType2 = 'protein';
    } else if (macroType === MACRO_TYPES.FAT) {
      macroLabel = t('table.headers.fat');
      target = dailyTargets.fat;
      macroType2 = 'fat';
    } else if (macroType === MACRO_TYPES.CARBS) {
      macroLabel = t('table.headers.carbs');
      target = dailyTargets.carbs;
      macroType2 = 'carbs';
    }

    const tooltipText = this.generateMacroCompositionTooltip(
      macroType2,
      value,
      row,
      percentageOfFood
    );
    safeAttachTooltip(cell, tooltipText, this.plugin);
  }

  renderTotalCells(row: HTMLTableRowElement, totals: MacroTotals): void {
    const totalMacrosGrams = totals.protein + totals.fat + totals.carbs;

    const caloriesCell = row.insertCell();
    caloriesCell.textContent = formatCalories(totals.calories);

    const proteinCell = row.insertCell();
    proteinCell.classList.add(CLASS_NAMES.MACRO.PROTEIN_CELL);
    proteinCell.textContent = formatGrams(totals.protein);
    if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
      const proteinPercentage = formatPercentage((totals.protein / totalMacrosGrams) * 100);
      proteinCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${proteinPercentage}%)`,
      });
    }

    const fatCell = row.insertCell();
    fatCell.classList.add(CLASS_NAMES.MACRO.FAT_CELL);
    fatCell.textContent = formatGrams(totals.fat);
    if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
      const fatPercentage = formatPercentage((totals.fat / totalMacrosGrams) * 100);
      fatCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${fatPercentage}%)`,
      });
    }

    const carbsCell = row.insertCell();
    carbsCell.classList.add(CLASS_NAMES.MACRO.CARBS_CELL);
    carbsCell.textContent = formatGrams(totals.carbs);
    if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
      const carbsPercentage = formatPercentage((totals.carbs / totalMacrosGrams) * 100);
      carbsCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${carbsPercentage}%)`,
      });
    }
  }

  renderTargetCells(row: HTMLTableRowElement, totals: MacroTotals, targets: DailyTargets): void {
    const caloriesCell = row.insertCell();
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL);
    caloriesCell.textContent = formatCalories(targets.calories);

    // Calculate percentage based on original kcal values for consistency
    const caloriePercentage = (totals.calories / targets.calories) * 100;

    if (this.plugin.settings.showCellPercentages) {
      caloriesCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${formatPercentage(caloriePercentage)}%)`,
      });
    }
    ProgressBarFactory.createEnhancedTargetBar(
      caloriesCell,
      totals.calories,
      targets.calories,
      MACRO_TYPES.CALORIES
    );

    const proteinCell = row.insertCell();
    proteinCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.PROTEIN_CELL);
    proteinCell.textContent = targets.protein.toString();
    if (this.plugin.settings.showCellPercentages) {
      const proteinPercentage = formatPercentage((totals.protein / targets.protein) * 100);
      proteinCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${proteinPercentage}%)`,
      });
    }
    ProgressBarFactory.createEnhancedTargetBar(
      proteinCell,
      totals.protein,
      targets.protein,
      MACRO_TYPES.PROTEIN
    );

    const fatCell = row.insertCell();
    fatCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.FAT_CELL);
    fatCell.textContent = targets.fat.toString();
    if (this.plugin.settings.showCellPercentages) {
      const fatPercentage = formatPercentage((totals.fat / targets.fat) * 100);
      fatCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${fatPercentage}%)`,
      });
    }
    ProgressBarFactory.createEnhancedTargetBar(fatCell, totals.fat, targets.fat, MACRO_TYPES.FAT);

    const carbsCell = row.insertCell();
    carbsCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CARBS_CELL);
    carbsCell.textContent = targets.carbs.toString();
    if (this.plugin.settings.showCellPercentages) {
      const carbsPercentage = formatPercentage((totals.carbs / targets.carbs) * 100);
      carbsCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${carbsPercentage}%)`,
      });
    }
    ProgressBarFactory.createEnhancedTargetBar(
      carbsCell,
      totals.carbs,
      targets.carbs,
      MACRO_TYPES.CARBS
    );
  }

  renderRemainingCells(row: HTMLTableRowElement, totals: MacroTotals, targets: DailyTargets): void {
    const remainingCalories = targets.calories - totals.calories;
    const remainingProtein = targets.protein - totals.protein;
    const remainingFat = targets.fat - totals.fat;
    const remainingCarbs = targets.carbs - totals.carbs;

    const caloriesCell = row.insertCell();
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL);
    if (remainingCalories < 0) {
      caloriesCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
      caloriesCell.textContent = `${formatCalories(remainingCalories)} (${t('table.summary.over')})`;
    } else if (remainingCalories === 0) {
      caloriesCell.textContent = '0';
    } else {
      caloriesCell.textContent = formatCalories(remainingCalories);
    }

    const proteinCell = row.insertCell();
    proteinCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.PROTEIN_CELL);
    if (remainingProtein < 0) {
      proteinCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
      proteinCell.textContent = `${formatGrams(remainingProtein)} (${t('table.summary.over')})`;
    } else if (remainingProtein === 0) {
      proteinCell.textContent = '0.0g';
    } else {
      proteinCell.textContent = formatGrams(remainingProtein);
    }

    const fatCell = row.insertCell();
    fatCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.FAT_CELL);
    if (remainingFat < 0) {
      fatCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
      fatCell.textContent = `${formatGrams(remainingFat)} (${t('table.summary.over')})`;
    } else if (remainingFat === 0) {
      fatCell.textContent = '0.0g';
    } else {
      fatCell.textContent = formatGrams(remainingFat);
    }

    const carbsCell = row.insertCell();
    carbsCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CARBS_CELL);
    if (remainingCarbs < 0) {
      carbsCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
      carbsCell.textContent = `${formatGrams(remainingCarbs)} (${t('table.summary.over')})`;
    } else if (remainingCarbs === 0) {
      carbsCell.textContent = '0.0g';
    } else {
      carbsCell.textContent = formatGrams(remainingCarbs);
    }
  }
}

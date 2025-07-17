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
import { ContextMenuManager, CommentTarget } from '../../../ui/modals/ContextMenuManager';

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

    // Delete button - FIX: Use the button instead of assigning to unused variable
    new ButtonComponent(buttonContainer)
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

  /**
   * FIXED: Extract clean name without comments
   * @param name Name that might contain comments (e.g., "Meal1 // test")
   * @returns Clean name without comments (e.g., "Meal1")
   */
  private extractCleanName(name: string): string {
    if (name.includes(' //')) {
      return name.split(' //')[0].trim();
    }
    return name.trim();
  }

  /**
   * Parse comment from a macro line
   */
  private parseCommentFromLine(line: string): string {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return '';
    return line.substring(commentIndex + 2).trim();
  }

  /**
   * UPDATED: Enhanced context menu setup with remove item option for mobile
   */
  private setupFoodItemContextMenu(
    tableRow: HTMLTableRowElement,
    row: MacroRow,
    macrosId: string,
    isMealItem = false,
    containerName = ''
  ): void {
    const contextMenuHandler = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // Don't show context menu if clicking on input fields or buttons
      const target = mouseEvent.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.classList.contains(CLASS_NAMES.ICONS.REMOVE) ||
        target.closest('input')
      ) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();

      // Extract current comment from macro line
      const currentComment = this.parseCommentFromLine(row.macroLine);

      const commentTarget: CommentTarget = {
        type: 'food-item',
        name: row.name,
        macroLine: row.macroLine,
        macrosId,
        currentComment,
      };

      const contextMenuManager = new ContextMenuManager(this.plugin);

      // Create enhanced context menu with remove option
      contextMenuManager.showEnhancedFoodItemContextMenu(
        mouseEvent,
        commentTarget,
        async () => {
          // Refresh the table after comment update
          await this.plugin.forceCompleteReload();
        },
        // Add remove callback for mobile
        async () => {
          await this.handleRemoveItem(row, isMealItem, containerName);
        },
        isMealItem,
        containerName
      );
    };

    this.plugin.registerDomListener(tableRow, 'contextmenu', contextMenuHandler);
  }

  /**
   * NEW: Unified long press handler that shows context menu instead of delete modal
   * FIX: Use underscore prefix for unused parameters to satisfy ESLint
   */
  private setupUnifiedLongPress(
    tableRow: HTMLTableRowElement,
    _row: MacroRow,
    _macrosId: string,
    _isMealItem: boolean,
    _containerName: string
  ): void {
    if (!this.isMobileDevice()) {
      return; // Only enable on mobile devices
    }

    let longPressTimer: NodeJS.Timeout | null = null;
    let startX = 0;
    let startY = 0;
    let hasMovedTooMuch = false;

    const longPressDuration = 500; // Reduced to 500ms for better UX
    const movementThreshold = 10; // 10px movement tolerance

    // Touch start handler
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return; // Only single touch

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      hasMovedTooMuch = false;

      // Add subtle visual feedback
      tableRow.classList.add('long-press-active');

      // Start long press timer
      longPressTimer = setTimeout(() => {
        if (!hasMovedTooMuch) {
          // Haptic feedback if available
          if ('vibrate' in navigator) {
            navigator.vibrate(50); // Short vibration
          }

          // Clean up visual state and show context menu
          tableRow.classList.remove('long-press-active');

          // Create a synthetic right-click event to trigger context menu
          const contextMenuEvent = new MouseEvent('contextmenu', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
            cancelable: true,
          });

          // Trigger the context menu
          tableRow.dispatchEvent(contextMenuEvent);
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
      tableRow.classList.remove('long-press-active');
      hasMovedTooMuch = false;
    };

    // Touch cancel handler
    const handleTouchCancel = () => {
      if (longPressTimer) {
        this.cancelLongPress(tableRow, longPressTimer);
        longPressTimer = null;
      }

      tableRow.classList.remove('long-press-active');
      hasMovedTooMuch = false;
    };

    // Register event listeners
    this.plugin.registerDomEvent(tableRow, 'touchstart', handleTouchStart, { passive: true });
    this.plugin.registerDomEvent(tableRow, 'touchmove', handleTouchMove, { passive: true });
    this.plugin.registerDomEvent(tableRow, 'touchend', handleTouchEnd, { passive: true });
    this.plugin.registerDomEvent(tableRow, 'touchcancel', handleTouchCancel, { passive: true });
  }

  /**
   * NEW: Handle remove item action (extracted from delete confirmation flow)
   */
  private async handleRemoveItem(
    row: MacroRow,
    isMealItem: boolean,
    containerName: string
  ): Promise<void> {
    try {
      if (isMealItem) {
        await this.onRemoveMealItem(containerName, row.name, row.macroLine);
      } else {
        await this.onRemove(row.macroLine);
      }

      const itemDescription = isMealItem
        ? `${row.name} ${t('general.from')} ${containerName}`
        : row.name;
      new Notice(t('notifications.itemRemoved', { item: itemDescription }));
    } catch (error) {
      this.plugin.logger.error('Error removing item:', error);
      new Notice(t('notifications.itemRemoveError', { error: (error as Error).message }));
    }
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
   * Cancels an active long press
   */
  private cancelLongPress(tableRow: HTMLTableRowElement, timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    tableRow.classList.remove('long-press-active');
  }

  /**
   * Shows the delete confirmation modal (kept for desktop and explicit delete actions)
   */
  private showDeleteConfirmation(row: MacroRow, isMealItem: boolean, containerName: string): void {
    const modal = new DeleteConfirmationModal(
      this.plugin,
      row.name,
      isMealItem,
      containerName,
      async () => {
        await this.handleRemoveItem(row, isMealItem, containerName);
      },
      () => {
        // Cancel action
        new Notice(t('notifications.removalCancelled'));
      }
    );

    modal.open();
  }

  /**
   * UPDATED: Creates a desktop remove button with clean names
   */
  private createDesktopRemoveButton(
    container: HTMLElement,
    isMealItem: boolean,
    containerName: string,
    row: MacroRow
  ): HTMLElement | null {
    if (this.isMobileDevice()) {
      return null; // Don't create button on mobile
    }

    const removeBtn = container.createSpan({
      cls: `${CLASS_NAMES.TABLE.CONTROL_ICON} ${CLASS_NAMES.ICONS.REMOVE} macro-food-remove-btn`,
      text: '–',
    });

    const cleanContainerName = this.extractCleanName(containerName);

    const tooltipText = isMealItem
      ? t('table.actions.removeFromMeal', { itemName: row.name, mealName: cleanContainerName })
      : t('table.actions.removeItem');

    safeAttachTooltip(removeBtn, tooltipText, this.plugin);

    this.plugin.registerDomEvent(removeBtn, 'click', async (e: Event) => {
      const mouseEvent = e as MouseEvent;
      mouseEvent.stopPropagation();

      // Show confirmation modal on desktop
      this.showDeleteConfirmation(row, isMealItem, cleanContainerName);
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
    containerName = '',
    originalItemText = ''
  ): Promise<void> {
    if (this.updateQuantityCallback) {
      await this.updateQuantityCallback(
        macroLine,
        newQuantity,
        isMealItem,
        containerName,
        originalItemText
      );

      await this.plugin.forceCompleteReload();
    }
  }

  /**
   * Remove a meal/group item by modifying the macros block with clean names
   * FIX: Use underscore prefix for unused parameter
   */
  async onRemoveMealItem(
    containerName: string,
    foodName: string,
    _macroLine: string
  ): Promise<void> {
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

        const activeFile = this.plugin.dataManager.getActiveFile();
        if (!activeFile) {
          throw new Error(t('errors.noActiveFile'));
        }

        const content = await this.plugin.dataManager.readFileContent(activeFile, true);
        const regex = /```macros\s+id:\s*(\S+)\s*([\s\S]*?)```/g;
        let foundId = null;
        let match;

        const cleanContainerName = this.extractCleanName(containerName);

        while ((match = regex.exec(content)) !== null) {
          const blockContent = match[2];
          if (
            blockContent.includes(`meal:${cleanContainerName}`) ||
            blockContent.includes(`meal: ${cleanContainerName}`) ||
            blockContent.includes(`group:${cleanContainerName}`) ||
            blockContent.includes(`group: ${cleanContainerName}`)
          ) {
            foundId = match[1];
            break;
          }
        }

        if (!foundId) {
          throw new Error(t('errors.macrosBlockNotFound', { mealName: cleanContainerName }));
        }

        await this.removeMealItemFromBlock(foundId, cleanContainerName, foodName);
      } else {
        const cleanContainerName = this.extractCleanName(containerName);
        await this.removeMealItemFromBlock(macrosId, cleanContainerName, foodName);
      }

      await this.plugin.forceCompleteReload();
    } catch (error) {
      this.plugin.logger.error('Error removing meal/group item:', error);
      throw error;
    }
  }

  /**
   * Remove a specific food item from a meal/group in the macros block with clean names
   */
  private async removeMealItemFromBlock(
    macrosId: string,
    containerName: string,
    foodName: string
  ): Promise<void> {
    const context = await this.plugin.dataManager.getDocumentContext(macrosId);

    if (!context || context.allLines.length === 0) {
      throw new Error(t('errors.noMacrosData'));
    }

    const containerLineIndex = context.allLines.findIndex((line) => {
      const trimmedLine = line.trim();
      if (
        !trimmedLine.toLowerCase().startsWith('meal:') &&
        !trimmedLine.toLowerCase().startsWith('group:')
      ) {
        return false;
      }

      const extractedContainerName = trimmedLine.startsWith('meal:')
        ? trimmedLine.substring(5).trim()
        : trimmedLine.substring(6).trim();

      const cleanExtractedName = this.extractCleanName(extractedContainerName);

      return cleanExtractedName.toLowerCase() === containerName.toLowerCase();
    });

    if (containerLineIndex === -1) {
      throw new Error(t('errors.mealNotFound', { mealName: containerName }));
    }

    const updatedLines = [...context.allLines];
    let i = containerLineIndex + 1;
    let itemRemoved = false;

    while (i < context.allLines.length && context.allLines[i].trim().startsWith('-')) {
      const line = context.allLines[i].trim();
      const itemText = line.substring(1).trim();
      const itemFoodName = this.extractFoodName(itemText);

      if (itemFoodName.toLowerCase() === foodName.toLowerCase()) {
        updatedLines.splice(i, 1);
        itemRemoved = true;
        break;
      }

      i++;
    }

    if (!itemRemoved) {
      throw new Error(
        t('errors.foodItemNotFound', { foodName: foodName, mealName: containerName })
      );
    }

    const success = await this.plugin.dataManager.updateMacrosBlock(macrosId, updatedLines);

    if (!success) {
      throw new Error(t('errors.updateMacrosBlockFailed'));
    }
  }

  /**
   * UPDATED: Main renderFoodRow method with unified long press
   */
  renderFoodRow(
    table: HTMLTableElement,
    row: MacroRow,
    group: Group,
    parentSection: string,
    dailyTargets: DailyTargets,
    macrosId?: string
  ): void {
    const r = table.insertRow();
    r.dataset.parent = parentSection;
    r.dataset.macroLine = row.macroLine;
    r.dataset.foodName = this.extractFoodName(row.macroLine);

    const isMealItem =
      !!group.macroLine &&
      (group.macroLine.toLowerCase().startsWith('meal:') ||
        group.macroLine.toLowerCase().startsWith('group:'));
    const containerName = isMealItem ? group.name : '';

    // Set up context menu for food items (if macrosId is provided)
    if (macrosId) {
      this.setupFoodItemContextMenu(r, row, macrosId, isMealItem, containerName);
    }

    // UPDATED: Set up unified long press (only for items that can be removed)
    if (macrosId && (!group.macroLine || isMealItem)) {
      this.setupUnifiedLongPress(r, row, macrosId, isMealItem, containerName);
    }

    const nameCell = r.insertCell();
    const nameContainer = nameCell.createDiv({ cls: 'macro-food-name-container' });

    // Parse comment from the macro line
    const comment = this.parseCommentFromLine(row.macroLine);

    // Create main food name container
    const nameContentDiv = nameContainer.createDiv({ cls: 'food-name-content' });

    // Create a span for the food name
    const nameSpan = nameContentDiv.createSpan({
      cls: 'macro-food-name',
    });
    nameSpan.textContent = row.name;

    // Add comment icon if comment exists
    if (comment) {
      const commentIcon = nameContentDiv.createSpan({
        cls: 'food-comment-icon',
        text: '💬',
      });

      safeAttachTooltip(commentIcon, comment, this.plugin);
    }

    // Better truncation detection and tooltip handling
    nameSpan.removeAttribute('title');

    setTimeout(() => {
      const isOverflowing = nameSpan.scrollWidth > nameSpan.clientWidth + 2;

      if (isOverflowing) {
        nameSpan.removeAttribute('title');
        safeAttachTooltip(nameSpan, row.name, this.plugin);
      }
    }, 200);

    // Add remove button only on desktop (mobile uses context menu)
    if (!group.macroLine || isMealItem) {
      this.createDesktopRemoveButton(nameContainer, isMealItem, containerName, row);
    }

    if (this.isMobileDevice() && (!group.macroLine || isMealItem)) {
      const instructions = macrosId
        ? t('table.actions.longPressForOptions')
        : t('table.actions.longPressForOptions');
      safeAttachTooltip(nameCell, instructions, this.plugin);
    } else if (!this.isMobileDevice() && macrosId) {
      safeAttachTooltip(nameCell, t('table.actions.rightClickForOptions'), this.plugin);
    }

    const quantityCell = r.insertCell();
    quantityCell.classList.add('editable-quantity');
    safeAttachTooltip(quantityCell, t('table.actions.clickToEdit'), this.plugin);
    quantityCell.textContent = formatServing(row.serving);

    const servingValue = parseGrams(row.serving);

    const quantityCellClickHandler = (e: Event) => {
      const mouseEvent = e as MouseEvent;
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
              containerName,
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
      const inputKeydownHandler = async (e: Event) => {
        const keyboardEvent = e as KeyboardEvent;
        if (keyboardEvent.key === 'Enter') {
          keyboardEvent.preventDefault();
          await applyQuantityChange();
        } else if (keyboardEvent.key === 'Escape') {
          inputProcessed = true;
          quantityCell.textContent = row.serving;
        }
      };

      this.plugin.registerDomEvent(input, 'blur', inputBlurHandler);
      this.plugin.registerDomEvent(input, 'keydown', inputKeydownHandler);

      mouseEvent.stopPropagation();
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
      const caloriesInKj = row.calories * 4.184;
      calorieTooltipMessage = `${caloriesInKj.toFixed(1)} kJ • ${Math.round(caloriePercentage)}% ${t('table.summary.dailyTarget')}`;
    } else {
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
    _dailyTargets: DailyTargets
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

    // FIX: Use the variables instead of declaring unused ones
    let macroType2: 'protein' | 'fat' | 'carbs' = 'protein';

    if (macroType === MACRO_TYPES.PROTEIN) {
      macroType2 = 'protein';
    } else if (macroType === MACRO_TYPES.FAT) {
      macroType2 = 'fat';
    } else if (macroType === MACRO_TYPES.CARBS) {
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
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL);
    caloriesCell.textContent = formatCalories(totals.calories);

    const proteinCell = row.insertCell();
    proteinCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.PROTEIN_CELL);
    proteinCell.textContent = formatGrams(totals.protein);
    if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
      const proteinPercentage = formatPercentage((totals.protein / totalMacrosGrams) * 100);
      proteinCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${proteinPercentage}%)`,
      });
    }

    const fatCell = row.insertCell();
    fatCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.FAT_CELL);
    fatCell.textContent = formatGrams(totals.fat);
    if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
      const fatPercentage = formatPercentage((totals.fat / totalMacrosGrams) * 100);
      fatCell.createSpan({
        cls: CLASS_NAMES.MACRO.PERCENTAGE,
        text: `(${fatPercentage}%)`,
      });
    }

    const carbsCell = row.insertCell();
    carbsCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CARBS_CELL);
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
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL);
    caloriesCell.textContent = formatCalories(targets.calories);

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
    caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL);
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

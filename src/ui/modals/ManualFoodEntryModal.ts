import { App, Modal, Notice, Component, normalizePath } from 'obsidian';
import MacrosPlugin from '../../main';
import { convertEnergyUnit } from '../../utils/energyUtils';
import { t } from '../../lang/I18nManager';

/**
 * Modal for manually entering food nutritional data with "Add More" functionality
 */
export class ManualFoodEntryModal extends Modal {
  private plugin: MacrosPlugin;
  private onFoodSelected: (item: { food_name: string; food_description: string }) => void;
  private component: Component;

  // Form elements
  private foodNameInput: HTMLInputElement;
  private servingSizeInput: HTMLInputElement;
  private caloriesInput: HTMLInputElement;
  private kjInput: HTMLInputElement;
  private proteinInput: HTMLInputElement;
  private fatInput: HTMLInputElement;
  private carbsInput: HTMLInputElement;

  // Status elements
  private statusContainer: HTMLElement;
  private addedItemsList: HTMLElement;

  // Data tracking
  private addedItems: string[] = [];

  constructor(
    app: App,
    plugin: MacrosPlugin,
    onFoodSelected: (item: { food_name: string; food_description: string }) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.onFoodSelected = onFoodSelected;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('manual-food-entry-modal');

    // Create header with translated text
    contentEl.createEl('h2', {
      text: t('food.manual.title'),
      cls: 'modal-title macros-modal-title',
    });

    contentEl.createEl('p', {
      text: t('food.manual.description'),
      cls: 'modal-description macros-modal-description',
    });

    // Create status section
    this.createStatusSection();

    // Create form container
    const formContainer = contentEl.createDiv({ cls: 'manual-entry-form' });

    // Food Name Field
    const nameGroup = formContainer.createDiv({ cls: 'form-group macros-form-group' });
    nameGroup.createEl('label', {
      text: t('food.manual.foodName'),
      cls: 'form-label macros-form-label required',
    });
    this.foodNameInput = nameGroup.createEl('input', {
      type: 'text',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: 'e.g., Chicken Breast',
        required: 'true',
      },
    });

    // Serving Size Field
    const servingGroup = formContainer.createDiv({ cls: 'form-group macros-form-group' });
    servingGroup.createEl('label', {
      text: t('food.manual.servingSize'),
      cls: 'form-label macros-form-label required',
    });
    this.servingSizeInput = servingGroup.createEl('input', {
      type: 'number',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: '100',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // Nutrition Fields Container
    const nutritionContainer = formContainer.createDiv({ cls: 'nutrition-fields' });

    // Energy Fields Container (kcal and kJ side by side)
    const energyContainer = nutritionContainer.createDiv({ cls: 'energy-fields-container' });

    // Calories Field with bold label
    const caloriesGroup = energyContainer.createDiv({
      cls: 'form-group macros-form-group energy-field',
    });
    caloriesGroup.createEl('label', {
      text: t('food.manual.calories'),
      cls: 'form-label macros-form-label required energy-label-bold',
    });
    this.caloriesInput = caloriesGroup.createEl('input', {
      type: 'number',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // kJ Field with bold label
    const kjGroup = energyContainer.createDiv({ cls: 'form-group macros-form-group energy-field' });
    kjGroup.createEl('label', {
      text: t('food.manual.energy') + ' (kJ)',
      cls: 'form-label macros-form-label energy-label-bold',
    });
    this.kjInput = kjGroup.createEl('input', {
      type: 'number',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
      },
    });

    // Set up bidirectional energy conversion
    this.setupEnergyConversion();

    // Protein Field
    const proteinGroup = nutritionContainer.createDiv({ cls: 'form-group macros-form-group' });
    proteinGroup.createEl('label', {
      text: t('food.manual.protein'),
      cls: 'form-label macros-form-label required',
    });
    this.proteinInput = proteinGroup.createEl('input', {
      type: 'number',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // Fat Field
    const fatGroup = nutritionContainer.createDiv({ cls: 'form-group macros-form-group' });
    fatGroup.createEl('label', {
      text: t('food.manual.fat'),
      cls: 'form-label macros-form-label required',
    });
    this.fatInput = fatGroup.createEl('input', {
      type: 'number',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // Carbs Field
    const carbsGroup = nutritionContainer.createDiv({ cls: 'form-group macros-form-group' });
    carbsGroup.createEl('label', {
      text: t('food.manual.carbs'),
      cls: 'form-label macros-form-label required',
    });
    this.carbsInput = carbsGroup.createEl('input', {
      type: 'number',
      cls: 'form-input macros-form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // Add validation info
    const validationInfo = formContainer.createDiv({ cls: 'validation-info' });
    validationInfo.createEl('p', {
      text: t('food.manual.required'),
      cls: 'required-note',
    });

    // Add energy conversion info
    const energyInfo = formContainer.createDiv({ cls: 'energy-info' });
    energyInfo.createEl('p', {
      text: t('settings.display.energyConversionNote'),
      cls: 'energy-note',
    });

    // Add keyboard shortcuts info in same style as energy info
    const shortcutsInfo = formContainer.createDiv({ cls: 'energy-info' });
    shortcutsInfo.createEl('p', {
      text: t('food.manual.keyboardShortcuts'),
      cls: 'energy-note',
    });

    // Button container
    this.createActionButtons(formContainer);

    // Focus on food name input
    this.foodNameInput.focus();
  }

  private createStatusSection(): void {
    this.statusContainer = this.contentEl.createDiv({ cls: 'status-section' });

    // Only show status section if we have added items
    if (this.addedItems.length > 0) {
      this.statusContainer.style.display = 'block';

      const addedHeader = this.statusContainer.createDiv({ cls: 'added-items-header' });
      addedHeader.createEl('h3', {
        text: `${t('food.manual.addedItems')} (${this.addedItems.length})`,
        cls: 'added-items-title',
      });

      this.addedItemsList = this.statusContainer.createDiv({ cls: 'added-items-list' });
      this.updateAddedItemsDisplay();
    } else {
      this.statusContainer.style.display = 'none';
    }
  }

  private updateAddedItemsDisplay(): void {
    if (!this.addedItemsList) return;

    this.addedItemsList.empty();

    this.addedItems.forEach((itemName, index) => {
      const itemDiv = this.addedItemsList.createDiv({ cls: 'added-item' });

      itemDiv.createSpan({ cls: 'item-icon', text: '✓' });
      itemDiv.createSpan({ cls: 'item-text', text: itemName });

      const removeBtn = itemDiv.createEl('button', {
        text: '×',
        cls: 'remove-item-btn',
        attr: { title: t('general.remove') },
      });

      this.component.registerDomEvent(removeBtn, 'click', () => {
        this.addedItems.splice(index, 1);
        this.updateStatusSection();
        new Notice(t('food.manual.itemRemoved'));
      });
    });
  }

  private updateStatusSection(): void {
    // Update the header count
    const header = this.statusContainer.querySelector('.added-items-title');
    if (header) {
      header.textContent = `${t('food.manual.addedItems')} (${this.addedItems.length})`;
    }

    // Show/hide status section based on items
    if (this.addedItems.length > 0) {
      this.statusContainer.style.display = 'block';
      this.updateAddedItemsDisplay();
    } else {
      this.statusContainer.style.display = 'none';
    }
  }

  private setupEnergyConversion(): void {
    // Convert from kcal to kJ
    this.component.registerDomEvent(this.caloriesInput, 'input', () => {
      const kcalValue = parseFloat(this.caloriesInput.value);
      if (!isNaN(kcalValue) && kcalValue >= 0) {
        const kjValue = convertEnergyUnit(kcalValue, 'kcal', 'kJ');
        this.kjInput.value = kjValue.toFixed(1);
      } else if (this.caloriesInput.value === '') {
        this.kjInput.value = '';
      }
    });

    // Convert from kJ to kcal
    this.component.registerDomEvent(this.kjInput, 'input', () => {
      const kjValue = parseFloat(this.kjInput.value);
      if (!isNaN(kjValue) && kjValue >= 0) {
        const kcalValue = convertEnergyUnit(kjValue, 'kJ', 'kcal');
        this.caloriesInput.value = kcalValue.toFixed(1);
      } else if (this.kjInput.value === '') {
        this.caloriesInput.value = '';
      }
    });
  }

  private createActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv({
      cls: 'button-container macros-button-container',
    });

    const cancelBtn = buttonContainer.createEl('button', {
      text: this.addedItems.length > 0 ? t('food.manual.finishAdding') : t('general.cancel'),
      cls: 'mod-button',
    });

    // Only show "Add More" button if we already have items or user has started entering data
    const addMoreBtn = buttonContainer.createEl('button', {
      text: t('food.manual.addAndContinue'),
      cls: 'mod-button',
    });

    const saveBtn = buttonContainer.createEl('button', {
      text: this.addedItems.length > 0 ? t('food.manual.addThisItem') : t('food.manual.save'),
      cls: 'mod-button mod-cta',
    });

    // Event handlers
    this.component.registerDomEvent(cancelBtn, 'click', () => {
      if (this.addedItems.length > 0) {
        new Notice(t('food.manual.allItemsSaved', { count: this.addedItems.length.toString() }));
      }
      this.close();
    });

    this.component.registerDomEvent(addMoreBtn, 'click', () => {
      this.handleAddMore();
    });

    this.component.registerDomEvent(saveBtn, 'click', () => {
      this.handleSave();
    });

    // Handle Enter key submission
    const handleEnterKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          this.handleAddMore();
        } else {
          this.handleSave();
        }
      }
    };

    // Add Enter key handler to all inputs
    [
      this.foodNameInput,
      this.servingSizeInput,
      this.caloriesInput,
      this.kjInput,
      this.proteinInput,
      this.fatInput,
      this.carbsInput,
    ].forEach((input) => {
      this.component.registerDomEvent(input, 'keydown', handleEnterKey);
    });
  }

  private async validateForm(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.foodNameInput.value.trim()) {
      errors.push(t('validation.required'));
    }

    const servingSize = parseFloat(this.servingSizeInput.value);
    if (isNaN(servingSize) || servingSize <= 0) {
      errors.push(t('validation.invalidServing'));
    }

    const calories = parseFloat(this.caloriesInput.value);
    if (isNaN(calories) || calories < 0) {
      errors.push(t('validation.invalidNumber'));
    }

    const protein = parseFloat(this.proteinInput.value);
    if (isNaN(protein) || protein < 0) {
      errors.push(t('validation.invalidNumber'));
    }

    const fat = parseFloat(this.fatInput.value);
    if (isNaN(fat) || fat < 0) {
      errors.push(t('validation.invalidNumber'));
    }

    const carbs = parseFloat(this.carbsInput.value);
    if (isNaN(carbs) || carbs < 0) {
      errors.push(t('validation.invalidNumber'));
    }

    // Check if food name already exists
    const foodName = this.foodNameInput.value.trim();
    const folderPath = normalizePath(this.plugin.settings.storageFolder);
    const fileName = `${foodName}.md`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    try {
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        errors.push(t('validation.duplicateName', { name: foodName }));
      }
    } catch (error) {
      // File doesn't exist, which is expected
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private async handleSave(): Promise<void> {
    try {
      const validation = await this.validateForm();
      if (!validation.isValid) {
        this.showValidationErrors(validation.errors);
        return;
      }

      await this.saveCurrentItem();

      if (this.addedItems.length === 1) {
        new Notice(t('notifications.foodSaved', { fileName: this.addedItems[0] }));
        this.close();
      } else {
        new Notice(t('food.manual.allItemsSaved', { count: this.addedItems.length.toString() }));
        this.close();
      }
    } catch (error) {
      this.plugin.logger.error('Error saving food item:', error);
      new Notice(
        t('notifications.foodSaveError', {
          error: (error as Error).message || t('errors.unknownError'),
        })
      );
    }
  }

  private async handleAddMore(): Promise<void> {
    try {
      const validation = await this.validateForm();
      if (!validation.isValid) {
        this.showValidationErrors(validation.errors);
        return;
      }

      await this.saveCurrentItem();
      this.clearForm();
      this.updateButtonText();
      this.updateStatusSection();

      this.foodNameInput.focus();
      new Notice(t('food.manual.itemSavedReadyForNext'));
    } catch (error) {
      this.plugin.logger.error('Error saving food item:', error);
      new Notice(
        t('notifications.foodSaveError', {
          error: (error as Error).message || t('errors.unknownError'),
        })
      );
    }
  }

  private async saveCurrentItem(): Promise<void> {
    const foodName = this.foodNameInput.value.trim();
    const servingSize = parseFloat(this.servingSizeInput.value);
    const calories = parseFloat(this.caloriesInput.value);
    const kj = parseFloat(this.kjInput.value);
    const protein = parseFloat(this.proteinInput.value);
    const fat = parseFloat(this.fatInput.value);
    const carbs = parseFloat(this.carbsInput.value);

    const fileName = `${foodName}.md`;
    const frontmatter = `---
calories: ${calories}
kj: ${kj}
protein: ${protein}
fat: ${fat}
carbs: ${carbs}
serving_size: ${servingSize}g
source: manual_entry
created: ${new Date().toISOString()}
---

# ${foodName}

## Nutritional Information (per ${servingSize}g)
- **${t('food.manual.calories')}:** ${calories} kcal
- **${t('food.manual.energy')}:** ${kj} kJ
- **${t('food.manual.protein')}:** ${protein}g
- **${t('food.manual.fat')}:** ${fat}g
- **${t('food.manual.carbs')}:** ${carbs}g
`;

    const folderPath = normalizePath(this.plugin.settings.storageFolder);
    const folder = this.plugin.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      await this.plugin.app.vault.createFolder(folderPath);
    }

    const filePath = normalizePath(`${folderPath}/${fileName}`);
    await this.plugin.app.vault.create(filePath, frontmatter);

    this.addedItems.push(foodName);
    this.plugin.dataManager.invalidateFileCache();
  }

  private clearForm(): void {
    this.foodNameInput.value = '';
    this.servingSizeInput.value = '';
    this.caloriesInput.value = '';
    this.kjInput.value = '';
    this.proteinInput.value = '';
    this.fatInput.value = '';
    this.carbsInput.value = '';

    const errorContainer = this.contentEl.querySelector('.validation-errors');
    if (errorContainer) {
      errorContainer.remove();
    }
  }

  private updateButtonText(): void {
    const saveBtn = this.contentEl.querySelector('.mod-cta');
    const cancelBtn = this.contentEl.querySelector('.mod-button');

    if (saveBtn) {
      saveBtn.textContent =
        this.addedItems.length > 0 ? t('food.manual.addThisItem') : t('food.manual.save');
    }

    if (cancelBtn) {
      cancelBtn.textContent =
        this.addedItems.length > 0 ? t('food.manual.finishAdding') : t('general.cancel');
    }
  }

  private showValidationErrors(errors: string[]): void {
    const existingErrorContainer = this.contentEl.querySelector('.validation-errors');
    if (existingErrorContainer) {
      existingErrorContainer.remove();
    }

    const formContainer = this.contentEl.querySelector('.manual-entry-form');
    if (formContainer) {
      const errorsDiv = formContainer.createDiv({ cls: 'validation-errors' });
      errors.forEach((error) => {
        errorsDiv.createEl('p', { text: error, cls: 'error-message macros-error-message' });
      });
    }
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

import { App, Modal, Notice, Component, normalizePath } from 'obsidian';
import MacrosPlugin from '../../main';
import { convertEnergyUnit } from '../../utils/energyUtils';
import { t } from '../../lang/I18nManager';

/**
 * Modal for manually entering food nutritional data - Updated with I18n and kJ support
 */
export class ManualFoodEntryModal extends Modal {
  private plugin: MacrosPlugin;
  private onFoodSelected: (item: any) => void;
  private component: Component;

  // Form elements
  private foodNameInput: HTMLInputElement;
  private servingSizeInput: HTMLInputElement;
  private caloriesInput: HTMLInputElement;
  private kjInput: HTMLInputElement;
  private proteinInput: HTMLInputElement;
  private fatInput: HTMLInputElement;
  private carbsInput: HTMLInputElement;

  constructor(app: App, plugin: MacrosPlugin, onFoodSelected: (item: any) => void) {
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
      cls: 'modal-title',
    });

    contentEl.createEl('p', {
      text: t('food.manual.description'),
      cls: 'modal-description',
    });

    // Create form container
    const formContainer = contentEl.createDiv({ cls: 'manual-entry-form' });

    // Food Name Field
    const nameGroup = formContainer.createDiv({ cls: 'form-group' });
    nameGroup.createEl('label', {
      text: t('food.manual.foodName'),
      cls: 'form-label required',
    });
    this.foodNameInput = nameGroup.createEl('input', {
      type: 'text',
      cls: 'form-input',
      attr: {
        placeholder: 'e.g., Chicken Breast',
        required: 'true',
      },
    });

    // Serving Size Field
    const servingGroup = formContainer.createDiv({ cls: 'form-group' });
    servingGroup.createEl('label', {
      text: t('food.manual.servingSize'),
      cls: 'form-label required',
    });
    this.servingSizeInput = servingGroup.createEl('input', {
      type: 'number',
      cls: 'form-input',
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
    const caloriesGroup = energyContainer.createDiv({ cls: 'form-group energy-field' });
    caloriesGroup.createEl('label', {
      text: t('food.manual.calories'),
      cls: 'form-label required energy-label-bold',
    });
    this.caloriesInput = caloriesGroup.createEl('input', {
      type: 'number',
      cls: 'form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // kJ Field with bold label
    const kjGroup = energyContainer.createDiv({ cls: 'form-group energy-field' });
    kjGroup.createEl('label', {
      text: t('food.manual.energy') + ' (kJ)',
      cls: 'form-label energy-label-bold',
    });
    this.kjInput = kjGroup.createEl('input', {
      type: 'number',
      cls: 'form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
      },
    });

    // Set up bidirectional energy conversion
    this.setupEnergyConversion();

    // Protein Field
    const proteinGroup = nutritionContainer.createDiv({ cls: 'form-group' });
    proteinGroup.createEl('label', {
      text: t('food.manual.protein'),
      cls: 'form-label required',
    });
    this.proteinInput = proteinGroup.createEl('input', {
      type: 'number',
      cls: 'form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // Fat Field
    const fatGroup = nutritionContainer.createDiv({ cls: 'form-group' });
    fatGroup.createEl('label', {
      text: t('food.manual.fat'),
      cls: 'form-label required',
    });
    this.fatInput = fatGroup.createEl('input', {
      type: 'number',
      cls: 'form-input',
      attr: {
        placeholder: '0',
        min: '0',
        step: '0.1',
        required: 'true',
      },
    });

    // Carbs Field
    const carbsGroup = nutritionContainer.createDiv({ cls: 'form-group' });
    carbsGroup.createEl('label', {
      text: t('food.manual.carbs'),
      cls: 'form-label required',
    });
    this.carbsInput = carbsGroup.createEl('input', {
      type: 'number',
      cls: 'form-input',
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

    // Button container
    const buttonContainer = formContainer.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'mod-button',
    });

    const saveBtn = buttonContainer.createEl('button', {
      text: t('food.manual.save'),
      cls: 'mod-button mod-cta',
    });

    // Add event handlers
    this.component.registerDomEvent(cancelBtn, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(saveBtn, 'click', () => {
      this.handleSave();
    });

    // Handle Enter key submission
    const handleEnterKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSave();
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

    // Focus on food name input
    this.foodNameInput.focus();
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

  private async validateForm(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check required fields with translated error messages
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
      this.plugin.logger.debug(`File ${filePath} doesn't exist yet, which is expected`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private async handleSave(): Promise<void> {
    try {
      // Validate form
      const validation = await this.validateForm();
      if (!validation.isValid) {
        // Show validation errors
        const errorContainer = this.contentEl.querySelector('.validation-errors');
        if (errorContainer) {
          errorContainer.remove();
        }

        const errorsDiv = this.contentEl.createDiv({ cls: 'validation-errors' });
        validation.errors.forEach((error) => {
          errorsDiv.createEl('p', { text: error, cls: 'error-message' });
        });

        return;
      }

      // Get form values
      const foodName = this.foodNameInput.value.trim();
      const servingSize = parseFloat(this.servingSizeInput.value);
      const calories = parseFloat(this.caloriesInput.value);
      const kj = parseFloat(this.kjInput.value);
      const protein = parseFloat(this.proteinInput.value);
      const fat = parseFloat(this.fatInput.value);
      const carbs = parseFloat(this.carbsInput.value);

      // Create the food file with translated content
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

      // Normalize the path for folder and create if needed
      const folderPath = normalizePath(this.plugin.settings.storageFolder);

      // Check if folder exists, create if needed
      const folder = this.plugin.app.vault.getFolderByPath(folderPath);
      if (!folder) {
        await this.plugin.app.vault.createFolder(folderPath);
      }

      // Create the file with normalized path
      const filePath = normalizePath(`${folderPath}/${fileName}`);
      await this.plugin.app.vault.create(filePath, frontmatter);

      // Invalidate the DataManager file cache so it picks up the new file
      this.plugin.dataManager.invalidateFileCache();

      new Notice(t('notifications.foodSaved', { fileName: foodName }));
      this.close();
    } catch (error) {
      this.plugin.logger.error('Error saving manual food entry:', error);
      new Notice(
        t('notifications.foodSaveError', {
          error: (error as Error).message || t('errors.unknownError'),
        })
      );
    }
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

import { App, Modal, Notice, Component, normalizePath } from 'obsidian';
import MacrosPlugin from '../../main';

/**
 * Modal for manually entering food nutritional data
 */
export class ManualFoodEntryModal extends Modal {
  private plugin: MacrosPlugin;
  private onFoodSelected: (item: any) => void;
  private component: Component;

  // Form elements
  private foodNameInput: HTMLInputElement;
  private servingSizeInput: HTMLInputElement;
  private caloriesInput: HTMLInputElement;
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

    // Create header
    contentEl.createEl('h2', {
      text: 'Manual Food Entry',
      cls: 'modal-title',
    });

    contentEl.createEl('p', {
      text: 'Enter the nutritional information for your food item:',
      cls: 'modal-description',
    });

    // Create form container
    const formContainer = contentEl.createDiv({ cls: 'manual-entry-form' });

    // Food Name Field
    const nameGroup = formContainer.createDiv({ cls: 'form-group' });
    nameGroup.createEl('label', {
      text: 'Food Name',
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
      text: 'Serving Size (grams)',
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

    // Calories Field
    const caloriesGroup = nutritionContainer.createDiv({ cls: 'form-group' });
    caloriesGroup.createEl('label', {
      text: 'Calories',
      cls: 'form-label required',
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

    // Protein Field
    const proteinGroup = nutritionContainer.createDiv({ cls: 'form-group' });
    proteinGroup.createEl('label', {
      text: 'Protein (g)',
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
      text: 'Fat (g)',
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
      text: 'Carbohydrates (g)',
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
      text: '* Required fields',
      cls: 'required-note',
    });

    // Button container
    const buttonContainer = formContainer.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'mod-button',
    });

    const saveBtn = buttonContainer.createEl('button', {
      text: 'Save Food Item',
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
      this.proteinInput,
      this.fatInput,
      this.carbsInput,
    ].forEach((input) => {
      this.component.registerDomEvent(input, 'keydown', handleEnterKey);
    });

    // Focus on food name input
    this.foodNameInput.focus();
  }

  private async validateForm(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check required fields
    if (!this.foodNameInput.value.trim()) {
      errors.push('Food name is required');
    }

    const servingSize = parseFloat(this.servingSizeInput.value);
    if (isNaN(servingSize) || servingSize <= 0) {
      errors.push('Valid serving size is required');
    }

    const calories = parseFloat(this.caloriesInput.value);
    if (isNaN(calories) || calories < 0) {
      errors.push('Valid calories value is required');
    }

    const protein = parseFloat(this.proteinInput.value);
    if (isNaN(protein) || protein < 0) {
      errors.push('Valid protein value is required');
    }

    const fat = parseFloat(this.fatInput.value);
    if (isNaN(fat) || fat < 0) {
      errors.push('Valid fat value is required');
    }

    const carbs = parseFloat(this.carbsInput.value);
    if (isNaN(carbs) || carbs < 0) {
      errors.push('Valid carbohydrates value is required');
    }

    // Check if food name already exists by checking the vault directly
    const foodName = this.foodNameInput.value.trim();
    const folderPath = normalizePath(this.plugin.settings.storageFolder);
    const fileName = `${foodName}.md`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    try {
      // Check if the file already exists in the vault
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        errors.push(`A food item named "${foodName}" already exists`);
      }
    } catch (error) {
      // File doesn't exist, which is what we want
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
      const protein = parseFloat(this.proteinInput.value);
      const fat = parseFloat(this.fatInput.value);
      const carbs = parseFloat(this.carbsInput.value);

      // Create the food file
      const fileName = `${foodName}.md`;
      const frontmatter = `---
calories: ${calories}
protein: ${protein}
fat: ${fat}
carbs: ${carbs}
serving_size: ${servingSize}g
source: manual_entry
created: ${new Date().toISOString()}
---

# ${foodName}

## Nutritional Information (per ${servingSize}g)
- **Calories:** ${calories}
- **Protein:** ${protein}g
- **Fat:** ${fat}g
- **Carbohydrates:** ${carbs}g
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

      new Notice(`Successfully saved "${foodName}" to your food database`);
      this.close();
    } catch (error) {
      this.plugin.logger.error('Error saving manual food entry:', error);
      new Notice(`Error saving food item: ${(error as Error).message || 'Unknown error'}`);
    }
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

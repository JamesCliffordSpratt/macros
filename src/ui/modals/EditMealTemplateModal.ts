import { Modal, Notice, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData, findMatchingFoodFile } from '../../utils';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { CustomServingSizeModal } from './CustomServingSizeModal';

interface FoodItemData {
  name: string;
  file: any;
  nutrition?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    serving: string;
  };
  isSelected: boolean;
  customServing?: number;
}

export class EditMealTemplateModal extends Modal {
  plugin: MacrosPlugin;
  meal: MealTemplate;
  private component: Component;

  // UI elements
  private searchInput: HTMLInputElement;
  private foodsContainer: HTMLElement;
  private selectedItemsContainer: HTMLElement;
  private saveButton: HTMLElement;

  // Data
  private allFoods: FoodItemData[] = [];
  private filteredFoods: FoodItemData[] = [];

  constructor(plugin: MacrosPlugin, meal: MealTemplate) {
    super(plugin.app);
    this.plugin = plugin;
    this.meal = meal;
    this.component = new Component();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('enhanced-meal-template-modal');

    // Load and prepare data
    await this.loadData();

    // Create the interface
    this.createHeader();
    this.createSearchBar();
    this.createFoodsSection();
    this.createSelectedItemsSection();
    this.createActionButtons();

    // Initial render
    this.filterAndRender('');
    this.updateSelectedItemsDisplay();
  }

  private async loadData(): Promise<void> {
    // Load all food items
    const folder = normalizePath(this.plugin.settings.storageFolder);
    const fileList = this.app.vault.getFiles().filter((f) => f.path.startsWith(folder));

    this.allFoods = await Promise.all(
      fileList.map(async (file): Promise<FoodItemData> => {
        const name = file.name.replace(/\.md$/, '');
        const nutrition = processNutritionalData(this.app, file);

        // Check if this food is already in the meal template
        const existingItem = this.meal.items.find((item) => {
          const itemName = item.includes(':') ? item.split(':')[0].trim() : item.trim();
          return itemName.toLowerCase() === name.toLowerCase();
        });

        let customServing: number | undefined;
        if (existingItem && existingItem.includes(':')) {
          customServing = parseGrams(existingItem.split(':')[1]);
        }

        return {
          name,
          file,
          nutrition: nutrition
            ? {
                calories: nutrition.calories,
                protein: nutrition.protein,
                fat: nutrition.fat,
                carbs: nutrition.carbs,
                serving: nutrition.serving || '100g',
              }
            : undefined,
          isSelected: !!existingItem,
          customServing,
        };
      })
    );

    // Sort foods alphabetically
    this.allFoods.sort((a, b) =>
      a.name.localeCompare(b.name, 'en-US', {
        sensitivity: 'base',
        numeric: true,
        ignorePunctuation: true,
      })
    );
  }

  private createHeader(): void {
    const header = this.contentEl.createDiv({ cls: 'modal-header' });
    header.createEl('h2', {
      text: `Edit Meal Template: "${this.meal.name}"`,
      cls: 'modal-title',
    });
    header.createEl('p', {
      text: 'Search and select food items to include in this meal template. You can customize serving sizes for each item.',
      cls: 'modal-description',
    });
  }

  private createSearchBar(): void {
    const searchContainer = this.contentEl.createDiv({ cls: 'search-container' });

    const searchWrapper = searchContainer.createDiv({ cls: 'search-wrapper' });
    searchWrapper.createEl('span', { cls: 'search-icon', text: '🔍' });

    this.searchInput = searchWrapper.createEl('input', {
      type: 'text',
      cls: 'search-input',
      attr: { placeholder: 'Search food items...' },
    });

    // Add search functionality
    this.component.registerDomEvent(this.searchInput, 'input', () => {
      const query = this.searchInput.value;
      this.filterAndRender(query);
    });
  }

  private createFoodsSection(): void {
    const sectionContainer = this.contentEl.createDiv({ cls: 'foods-section' });

    const sectionHeader = sectionContainer.createDiv({ cls: 'section-header' });
    sectionHeader.createEl('h3', { text: '🥗 Available Food Items', cls: 'section-title' });

    this.foodsContainer = sectionContainer.createDiv({ cls: 'foods-container' });
  }

  private filterAndRender(query: string): void {
    const searchTerm = query.toLowerCase().trim();

    // Filter foods
    this.filteredFoods = this.allFoods.filter((food) =>
      food.name.toLowerCase().includes(searchTerm)
    );

    // Render filtered results
    this.renderFoods();
  }

  private renderFoods(): void {
    this.foodsContainer.empty();

    if (this.filteredFoods.length === 0) {
      this.foodsContainer.createDiv({
        cls: 'no-results',
        text: 'No food items found',
      });
      return;
    }

    this.filteredFoods.forEach((food) => {
      const foodCard = this.foodsContainer.createDiv({ cls: 'food-card' });

      // Food name
      const foodHeader = foodCard.createDiv({ cls: 'food-header' });
      foodHeader.createEl('h3', { text: food.name, cls: 'food-name' });

      // Nutrition info (if available)
      if (food.nutrition) {
        const nutritionInfo = foodCard.createDiv({ cls: 'nutrition-info' });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.calories} cal`,
          cls: 'nutrition-item calories',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.protein}g protein`,
          cls: 'nutrition-item protein',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.fat}g fat`,
          cls: 'nutrition-item fat',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.carbs}g carbs`,
          cls: 'nutrition-item carbs',
        });

        // Serving size
        const servingInfo = foodCard.createDiv({ cls: 'serving-info' });
        const servingText = food.customServing
          ? `Custom: ${food.customServing}g`
          : `Default: ${food.nutrition.serving}`;
        servingInfo.createEl('span', {
          text: servingText,
          cls: 'serving-size',
        });
      }

      // Action buttons container
      const buttonContainer = foodCard.createDiv({ cls: 'button-container' });

      if (food.isSelected) {
        // Remove button
        const removeButton = buttonContainer.createEl('button', {
          text: '− Remove',
          cls: 'remove-button',
        });

        // Edit serving button (if nutrition data available)
        if (food.nutrition) {
          const editButton = buttonContainer.createEl('button', {
            text: '✎ Edit Serving',
            cls: 'edit-button',
          });

          this.component.registerDomEvent(editButton, 'click', () => {
            this.editFoodServing(food);
          });
        }

        this.component.registerDomEvent(removeButton, 'click', () => {
          this.removeFood(food);
        });

        foodCard.addClass('selected');
      } else {
        // Add button
        const addButton = buttonContainer.createEl('button', {
          text: '+ Add to Meal',
          cls: 'add-button',
        });

        this.component.registerDomEvent(addButton, 'click', () => {
          this.addFood(food);
        });
      }
    });
  }

  private async addFood(food: FoodItemData): Promise<void> {
    if (!food.nutrition) {
      new Notice('Could not process nutrition data for this food.');
      return;
    }

    const defaultServing = parseGrams(food.nutrition.serving);

    new CustomServingSizeModal(
      this.app,
      food.name,
      defaultServing,
      async (customServing: number) => {
        // Update the food item
        food.isSelected = true;
        food.customServing = customServing;

        // Add to meal template
        const itemString = `${food.name}:${customServing}g`;
        this.meal.items.push(itemString);

        await this.plugin.saveSettings();
        this.updateUI();

        new Notice(`Added ${food.name} (${customServing}g) to ${this.meal.name}`);
      },
      this.plugin
    ).open();
  }

  private async removeFood(food: FoodItemData): Promise<void> {
    // Update the food item
    food.isSelected = false;
    food.customServing = undefined;

    // Remove from meal template
    this.meal.items = this.meal.items.filter((item) => {
      const itemName = item.includes(':') ? item.split(':')[0].trim() : item.trim();
      return itemName.toLowerCase() !== food.name.toLowerCase();
    });

    await this.plugin.saveSettings();
    this.updateUI();

    new Notice(`Removed ${food.name} from ${this.meal.name}`);
  }

  private async editFoodServing(food: FoodItemData): Promise<void> {
    if (!food.nutrition || !food.customServing) return;

    new CustomServingSizeModal(
      this.app,
      food.name,
      food.customServing,
      async (newServing: number) => {
        // Update the food item
        food.customServing = newServing;

        // Update meal template
        const itemIndex = this.meal.items.findIndex((item) => {
          const itemName = item.includes(':') ? item.split(':')[0].trim() : item.trim();
          return itemName.toLowerCase() === food.name.toLowerCase();
        });

        if (itemIndex !== -1) {
          this.meal.items[itemIndex] = `${food.name}:${newServing}g`;
        }

        await this.plugin.saveSettings();
        this.updateUI();

        new Notice(`Updated ${food.name} serving to ${newServing}g`);
      },
      this.plugin
    ).open();
  }

  private updateUI(): void {
    this.renderFoods();
    this.updateSelectedItemsDisplay();
  }

  private createSelectedItemsSection(): void {
    const selectedSection = this.contentEl.createDiv({ cls: 'selected-items-section' });

    const header = selectedSection.createDiv({ cls: 'selected-header' });
    header.createEl('h3', { text: 'Selected Items', cls: 'selected-title' });

    this.selectedItemsContainer = selectedSection.createDiv({ cls: 'selected-items-container' });
  }

  private updateSelectedItemsDisplay(): void {
    this.selectedItemsContainer.empty();

    const selectedFoods = this.allFoods.filter((food) => food.isSelected);

    if (selectedFoods.length === 0) {
      this.selectedItemsContainer.createDiv({
        cls: 'no-selected-items',
        text: 'No items selected yet',
      });
    } else {
      selectedFoods.forEach((food) => {
        const itemTag = this.selectedItemsContainer.createDiv({ cls: 'selected-item-tag' });

        const displayText = food.customServing ? `${food.name}:${food.customServing}g` : food.name;

        itemTag.createEl('span', { text: displayText, cls: 'item-text' });

        const removeButton = itemTag.createEl('button', {
          text: '×',
          cls: 'remove-item-button',
        });

        this.component.registerDomEvent(removeButton, 'click', () => {
          this.removeFood(food);
        });
      });
    }

    // Update save button state
    if (this.saveButton) {
      const hasItems = selectedFoods.length > 0;
      if (hasItems) {
        this.saveButton.removeClass('disabled');
        (this.saveButton as HTMLButtonElement).disabled = false;
      } else {
        this.saveButton.addClass('disabled');
        (this.saveButton as HTMLButtonElement).disabled = true;
      }
    }
  }

  private createActionButtons(): void {
    const buttonContainer = this.contentEl.createDiv({ cls: 'action-buttons' });

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'cancel-button',
    });

    this.saveButton = buttonContainer.createEl('button', {
      text: 'Save Changes',
      cls: 'save-button',
    });

    this.component.registerDomEvent(cancelButton, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(this.saveButton, 'click', async () => {
      await this.plugin.saveSettings();
      new Notice(`Meal template "${this.meal.name}" updated successfully`);
      this.close();

      // Refresh the settings display
      this.plugin.nutritionalSettingTab.display();
    });
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

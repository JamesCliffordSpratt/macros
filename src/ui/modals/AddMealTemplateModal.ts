import { Modal, Notice, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData } from '../../utils';
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

export class AddMealTemplateModal extends Modal {
  plugin: MacrosPlugin;
  private component: Component;

  // UI elements
  private mealNameInput: HTMLInputElement;
  private searchInput: HTMLInputElement;
  private foodsContainer: HTMLElement;
  private selectedItemsContainer: HTMLElement;
  private createButton: HTMLElement;

  // Data
  private newMealName: string = '';
  private allFoods: FoodItemData[] = [];
  private filteredFoods: FoodItemData[] = [];

  constructor(plugin: MacrosPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.component = new Component();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('enhanced-meal-template-modal');

    // Load and prepare data
    await this.loadData();

    // Create the interface
    this.createHeader();
    this.createMealNameSection();
    this.createSearchBar();
    this.createFoodsSection();
    this.createSelectedItemsSection();
    this.createActionButtons();

    // Initial render
    this.filterAndRender('');
    this.updateSelectedItemsDisplay();

    // Focus on meal name input
    this.mealNameInput.focus();
  }

  private async loadData(): Promise<void> {
    // Load all food items
    const folder = normalizePath(this.plugin.settings.storageFolder);
    const fileList = this.app.vault.getFiles().filter((f) => f.path.startsWith(folder));

    this.allFoods = await Promise.all(
      fileList.map(async (file): Promise<FoodItemData> => {
        const name = file.name.replace(/\.md$/, '');
        const nutrition = processNutritionalData(this.app, file);

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
          isSelected: false,
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
      text: 'Create New Meal Template',
      cls: 'modal-title',
    });
    header.createEl('p', {
      text: 'Give your meal template a name, then search and select food items to include in it.',
      cls: 'modal-description',
    });
  }

  private createMealNameSection(): void {
    const nameSection = this.contentEl.createDiv({ cls: 'meal-name-section' });

    const label = nameSection.createEl('label', {
      text: 'Meal Template Name',
      cls: 'meal-name-label',
    });

    this.mealNameInput = nameSection.createEl('input', {
      type: 'text',
      cls: 'meal-name-input',
      attr: { placeholder: 'e.g., Breakfast, Post-Workout, etc.' },
    });

    // Add validation and update functionality
    this.component.registerDomEvent(this.mealNameInput, 'input', () => {
      this.newMealName = this.mealNameInput.value.trim();
      this.updateCreateButtonState();
    });

    this.component.registerDomEvent(this.mealNameInput, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (this.newMealName) {
          this.searchInput.focus();
        }
      }
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

        this.updateUI();
        new Notice(`Added ${food.name} (${customServing}g) to meal template`);
      },
      this.plugin
    ).open();
  }

  private removeFood(food: FoodItemData): void {
    // Update the food item
    food.isSelected = false;
    food.customServing = undefined;

    this.updateUI();
    new Notice(`Removed ${food.name} from meal template`);
  }

  private editFoodServing(food: FoodItemData): void {
    if (!food.nutrition || !food.customServing) return;

    new CustomServingSizeModal(
      this.app,
      food.name,
      food.customServing,
      async (newServing: number) => {
        // Update the food item
        food.customServing = newServing;

        this.updateUI();
        new Notice(`Updated ${food.name} serving to ${newServing}g`);
      },
      this.plugin
    ).open();
  }

  private updateUI(): void {
    this.renderFoods();
    this.updateSelectedItemsDisplay();
    this.updateCreateButtonState();
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
  }

  private updateCreateButtonState(): void {
    if (!this.createButton) return;

    const hasName = this.newMealName.length > 0;
    const hasItems = this.allFoods.some((food) => food.isSelected);
    const canCreate = hasName && hasItems;

    if (canCreate) {
      this.createButton.removeClass('disabled');
      (this.createButton as HTMLButtonElement).disabled = false;
    } else {
      this.createButton.addClass('disabled');
      (this.createButton as HTMLButtonElement).disabled = true;
    }
  }

  private createActionButtons(): void {
    const buttonContainer = this.contentEl.createDiv({ cls: 'action-buttons' });

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'cancel-button',
    });

    this.createButton = buttonContainer.createEl('button', {
      text: 'Create Meal Template',
      cls: 'create-button disabled',
    });

    (this.createButton as HTMLButtonElement).disabled = true;

    this.component.registerDomEvent(cancelButton, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(this.createButton, 'click', async () => {
      await this.createMealTemplate();
    });
  }

  private async createMealTemplate(): Promise<void> {
    // Validate meal name
    if (!this.newMealName) {
      new Notice('Please enter a meal name.');
      this.mealNameInput.focus();
      return;
    }

    // Check for duplicate names
    const existingMeal = this.plugin.settings.mealTemplates.find(
      (m: MealTemplate) => m.name.toLowerCase() === this.newMealName.toLowerCase()
    );

    if (existingMeal) {
      new Notice('A meal template with that name already exists. Please choose a different name.');
      this.mealNameInput.focus();
      return;
    }

    // Get selected foods
    const selectedFoods = this.allFoods.filter((food) => food.isSelected);

    if (selectedFoods.length === 0) {
      new Notice('Please select at least one food item.');
      return;
    }

    // Create the meal template
    const newMeal: MealTemplate = {
      name: this.newMealName,
      items: selectedFoods.map((food) =>
        food.customServing ? `${food.name}:${food.customServing}g` : food.name
      ),
    };

    // Add to settings
    this.plugin.settings.mealTemplates.push(newMeal);
    await this.plugin.saveSettings();

    new Notice(
      `Meal template "${this.newMealName}" created successfully with ${selectedFoods.length} items!`
    );

    this.close();

    // Refresh the settings display
    this.plugin.nutritionalSettingTab.display();
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

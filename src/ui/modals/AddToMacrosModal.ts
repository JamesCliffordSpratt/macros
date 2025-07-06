import { App, Modal, Notice, TFile, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData, findMatchingFoodFile } from '../../utils';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { CustomServingSizeModal } from './CustomServingSizeModal';

interface FoodItemData {
  name: string;
  file: TFile;
  nutrition?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    serving: string;
  };
}

export class AddToMacrosModal extends Modal {
  plugin: MacrosPlugin;
  tableId: string;
  onDone: () => Promise<void>;
  selectedItems: string[] = [];
  private component: Component;

  // UI elements
  private searchInput: HTMLInputElement;
  private mealsContainer: HTMLElement;
  private foodsContainer: HTMLElement;
  private selectedItemsContainer: HTMLElement;
  private confirmButton: HTMLElement;

  // Data
  private allMeals: MealTemplate[] = [];
  private allFoods: FoodItemData[] = [];
  private filteredMeals: MealTemplate[] = [];
  private filteredFoods: FoodItemData[] = [];

  constructor(app: App, plugin: MacrosPlugin, tableId: string, onDone: () => Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.tableId = tableId;
    this.onDone = onDone;
    this.component = new Component();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('enhanced-add-to-macros-modal');

    // Load and prepare data
    await this.loadData();

    // Create the interface
    this.createHeader();
    this.createSearchBar();
    this.createTabsAndContent();
    this.createSelectedItemsSection();
    this.createActionButtons();

    // Initial render
    this.filterAndRender('');
    this.updateSelectedItemsDisplay();
  }

  private async loadData(): Promise<void> {
    // Load meal templates
    this.allMeals = [...this.plugin.settings.mealTemplates].sort((a, b) =>
      a.name.localeCompare(b.name, 'en-US', {
        sensitivity: 'base',
        numeric: true,
        ignorePunctuation: true,
      })
    );

    // Load food items
    const folder = normalizePath(this.plugin.settings.storageFolder);
    const fileList = this.app.vault.getFiles().filter((f: TFile) => f.path.startsWith(folder));

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
    header.createEl('h2', { text: 'Add Items to Macros', cls: 'modal-title' });
    header.createEl('p', {
      text: 'Search and select meal templates or individual food items to add to your macros table.',
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
      attr: { placeholder: 'Search meals and foods...' },
    });

    // Add search functionality
    this.component.registerDomEvent(this.searchInput, 'input', () => {
      const query = this.searchInput.value;
      this.filterAndRender(query);
    });
  }

  private createTabsAndContent(): void {
    const contentContainer = this.contentEl.createDiv({ cls: 'content-container' });

    // Create tabs
    const tabsContainer = contentContainer.createDiv({ cls: 'tabs-container' });
    const mealsTab = tabsContainer.createEl('button', {
      text: '🍽️ Meal Templates',
      cls: 'tab-button active',
    });
    const foodsTab = tabsContainer.createEl('button', {
      text: '🥗 Individual Foods',
      cls: 'tab-button',
    });

    // Create content areas
    const contentArea = contentContainer.createDiv({ cls: 'content-area' });
    this.mealsContainer = contentArea.createDiv({ cls: 'items-container meals-container active' });
    this.foodsContainer = contentArea.createDiv({ cls: 'items-container foods-container' });

    // Tab switching
    this.component.registerDomEvent(mealsTab, 'click', () => {
      this.switchTab('meals', mealsTab, foodsTab);
    });

    this.component.registerDomEvent(foodsTab, 'click', () => {
      this.switchTab('foods', mealsTab, foodsTab);
    });
  }

  private switchTab(
    activeTab: 'meals' | 'foods',
    mealsTab: HTMLElement,
    foodsTab: HTMLElement
  ): void {
    // Update tab buttons
    mealsTab.classList.toggle('active', activeTab === 'meals');
    foodsTab.classList.toggle('active', activeTab === 'foods');

    // Update content visibility
    this.mealsContainer.classList.toggle('active', activeTab === 'meals');
    this.foodsContainer.classList.toggle('active', activeTab === 'foods');
  }

  private filterAndRender(query: string): void {
    const searchTerm = query.toLowerCase().trim();

    // Filter meals
    this.filteredMeals = this.allMeals.filter(
      (meal) =>
        meal.name.toLowerCase().includes(searchTerm) ||
        meal.items.some((item) => item.toLowerCase().includes(searchTerm))
    );

    // Filter foods
    this.filteredFoods = this.allFoods.filter((food) =>
      food.name.toLowerCase().includes(searchTerm)
    );

    // Render filtered results
    this.renderMeals();
    this.renderFoods();
  }

  private renderMeals(): void {
    this.mealsContainer.empty();

    if (this.filteredMeals.length === 0) {
      this.mealsContainer.createDiv({
        cls: 'no-results',
        text: 'No meal templates found',
      });
      return;
    }

    this.filteredMeals.forEach((meal) => {
      const mealCard = this.mealsContainer.createDiv({ cls: 'meal-card' });

      // Meal header
      const mealHeader = mealCard.createDiv({ cls: 'meal-header' });
      mealHeader.createEl('h3', { text: meal.name, cls: 'meal-name' });
      mealHeader.createEl('span', {
        text: `${meal.items.length} items`,
        cls: 'meal-count',
      });

      // Meal items preview
      const itemsPreview = mealCard.createDiv({ cls: 'meal-items-preview' });
      const previewItems = meal.items.slice(0, 3);
      previewItems.forEach((item) => {
        itemsPreview.createEl('span', { text: item, cls: 'preview-item' });
      });

      if (meal.items.length > 3) {
        itemsPreview.createEl('span', {
          text: `+${meal.items.length - 3} more`,
          cls: 'preview-more',
        });
      }

      // Add button
      const addButton = mealCard.createEl('button', {
        text: '+ Add Meal',
        cls: 'add-button meal-add-button',
      });

      this.component.registerDomEvent(addButton, 'click', () => {
        this.addMeal(meal);
      });

      // Add selection state
      const mealValue = `interactive:meal:${meal.name}`;
      if (this.selectedItems.includes(mealValue)) {
        mealCard.addClass('selected');
        addButton.textContent = '✓ Added';
        addButton.addClass('selected');
      }
    });
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
        servingInfo.createEl('span', {
          text: `Per ${food.nutrition.serving}`,
          cls: 'serving-size',
        });
      }

      // Add button
      const addButton = foodCard.createEl('button', {
        text: '+ Add Food',
        cls: 'add-button food-add-button',
      });

      this.component.registerDomEvent(addButton, 'click', () => {
        this.addFood(food);
      });

      // Check if already selected
      const isSelected = this.selectedItems.some((item) =>
        item.startsWith(`interactive:${food.name}:`)
      );

      if (isSelected) {
        foodCard.addClass('selected');
        addButton.textContent = '✓ Added';
        addButton.addClass('selected');
      }
    });
  }

  private async addMeal(meal: MealTemplate): Promise<void> {
    const mealValue = `interactive:meal:${meal.name}`;

    if (this.selectedItems.includes(mealValue)) {
      // Remove if already selected
      this.selectedItems = this.selectedItems.filter((item) => item !== mealValue);
    } else {
      // Add meal
      this.selectedItems.push(mealValue);
    }

    this.updateUI();
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
        const newItem = `interactive:${food.name}:${customServing}g`;

        // Remove any existing entry for this food
        this.selectedItems = this.selectedItems.filter(
          (item) => !item.startsWith(`interactive:${food.name}:`)
        );

        // Add new entry
        this.selectedItems.push(newItem);
        this.updateUI();
      },
      this.plugin
    ).open();
  }

  private updateUI(): void {
    this.renderMeals();
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

    if (this.selectedItems.length === 0) {
      this.selectedItemsContainer.createDiv({
        cls: 'no-selected-items',
        text: 'No items selected yet',
      });
    } else {
      this.selectedItems.forEach((item, index) => {
        const itemTag = this.selectedItemsContainer.createDiv({ cls: 'selected-item-tag' });

        const displayText = item.startsWith('interactive:')
          ? item.substring('interactive:'.length)
          : item;

        itemTag.createEl('span', { text: displayText, cls: 'item-text' });

        const removeButton = itemTag.createEl('button', {
          text: '×',
          cls: 'remove-item-button',
        });

        this.component.registerDomEvent(removeButton, 'click', () => {
          this.selectedItems.splice(index, 1);
          this.updateUI();
        });
      });
    }

    // Update confirm button state
    if (this.confirmButton) {
      if (this.selectedItems.length > 0) {
        this.confirmButton.removeClass('disabled');
        (this.confirmButton as HTMLButtonElement).disabled = false;
      } else {
        this.confirmButton.addClass('disabled');
        (this.confirmButton as HTMLButtonElement).disabled = true;
      }
    }
  }

  private createActionButtons(): void {
    const buttonContainer = this.contentEl.createDiv({ cls: 'action-buttons' });

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'cancel-button',
    });

    this.confirmButton = buttonContainer.createEl('button', {
      text: 'Add Selected Items',
      cls: 'confirm-button disabled',
    });

    (this.confirmButton as HTMLButtonElement).disabled = true;

    this.component.registerDomEvent(cancelButton, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(this.confirmButton, 'click', async () => {
      if (this.selectedItems.length === 0) return;

      try {
        // Ensure the additionalMacros map is properly initialized
        if (!this.plugin.dataManager.additionalMacros) {
          this.plugin.dataManager.additionalMacros = new Map();
        }

        // Ensure the data structure exists for this table ID
        if (!this.plugin.dataManager.additionalMacros.has(this.tableId)) {
          this.plugin.dataManager.additionalMacros.set(this.tableId, []);
        }

        // Get the array for this table ID
        const arr = this.plugin.dataManager.additionalMacros.get(this.tableId);
        if (!arr) {
          throw new Error('Failed to access macro data');
        }

        // Add each selected item to the array
        this.selectedItems.forEach((item) => arr.push(item));

        // Update the macros code block
        await this.onDone();

        new Notice(`Added ${this.selectedItems.length} items to your macros table.`);
        this.close();
      } catch (error) {
        this.plugin.logger.error('Error adding items to macros:', error);
        new Notice(`Error adding items: ${(error as Error).message || 'Unknown error'}`);
      }
    });
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

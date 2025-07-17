import { Modal, Notice, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData } from '../../utils';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { CustomServingSizeModal } from './CustomServingSizeModal';
import { t } from '../../lang/I18nManager';
import { convertEnergyUnit } from '../../utils/energyUtils';

interface FoodItemData {
  name: string;
  file: import('obsidian').TFile;
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
  private newMealName = '';
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
    const header = this.contentEl.createDiv({ cls: 'modal-header macros-modal-header' });
    header.createEl('h2', {
      text: t('meals.create.title'),
      cls: 'modal-title macros-modal-title',
    });
    header.createEl('p', {
      text: t('meals.create.description'),
      cls: 'modal-description macros-modal-description',
    });
  }

  private createMealNameSection(): void {
    const nameSection = this.contentEl.createDiv({ cls: 'meal-name-section' });

    const _label = nameSection.createEl('label', {
      text: t('meals.create.nameLabel'),
      cls: 'meal-name-label',
    });

    this.mealNameInput = nameSection.createEl('input', {
      type: 'text',
      cls: 'meal-name-input',
      attr: { placeholder: t('meals.create.namePlaceholder') },
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
    const searchContainer = this.contentEl.createDiv({
      cls: 'search-container macros-search-container',
    });

    const searchWrapper = searchContainer.createDiv({
      cls: 'search-wrapper macros-search-wrapper',
    });
    searchWrapper.createEl('span', { cls: 'search-icon macros-search-icon', text: '🔍' });

    this.searchInput = searchWrapper.createEl('input', {
      type: 'text',
      cls: 'search-input macros-search-input',
      attr: { placeholder: t('meals.create.searchPlaceholder') },
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
    sectionHeader.createEl('h3', { text: t('meals.create.availableFoods'), cls: 'section-title' });

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
        cls: 'no-results macros-no-results',
        text: t('meals.create.noResults'),
      });
      return;
    }

    this.filteredFoods.forEach((food) => {
      const foodCard = this.foodsContainer.createDiv({ cls: 'food-card' });

      // Food name
      const foodHeader = foodCard.createDiv({ cls: 'food-header' });
      foodHeader.createEl('h3', { text: food.name, cls: 'food-name' });

      // Enhanced nutrition info with kJ support
      if (food.nutrition) {
        const nutritionInfo = foodCard.createDiv({ cls: 'nutrition-info macros-nutrition-info' });

        // Enhanced calorie display with kJ support
        const currentEnergyUnit = this.plugin.settings.energyUnit;
        const calorieSpan = nutritionInfo.createEl('span', {
          cls: 'nutrition-item macros-nutrition-item calories',
        });

        if (currentEnergyUnit === 'kJ') {
          const kjValue = convertEnergyUnit(food.nutrition.calories, 'kcal', 'kJ');
          calorieSpan.textContent = `${kjValue.toFixed(1)} kJ`;
          // Add tooltip showing both units
          calorieSpan.setAttribute(
            'title',
            `${food.nutrition.calories.toFixed(1)} kcal = ${kjValue.toFixed(1)} kJ`
          );
        } else {
          calorieSpan.textContent = `${food.nutrition.calories.toFixed(1)} kcal`;
        }

        nutritionInfo.createEl('span', {
          text: `${food.nutrition.protein.toFixed(1)}g ${t('table.headers.protein').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item protein',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.fat.toFixed(1)}g ${t('table.headers.fat').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item fat',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.carbs.toFixed(1)}g ${t('table.headers.carbs').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item carbs',
        });

        // Serving size
        const servingInfo = foodCard.createDiv({ cls: 'serving-info' });
        const servingText = food.customServing
          ? t('meals.create.customServing', { serving: food.customServing.toString() })
          : t('meals.create.defaultServing', { serving: food.nutrition.serving });
        servingInfo.createEl('span', {
          text: servingText,
          cls: 'serving-size',
        });
      }

      // Action buttons container
      const buttonContainer = foodCard.createDiv({
        cls: 'button-container macros-button-container',
      });

      if (food.isSelected) {
        // Remove button
        const removeButton = buttonContainer.createEl('button', {
          text: t('meals.create.remove'),
          cls: 'remove-button',
        });

        // Edit serving button (if nutrition data available)
        if (food.nutrition) {
          const editButton = buttonContainer.createEl('button', {
            text: t('meals.create.editServing'),
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
          text: t('meals.create.addToMeal'),
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
      new Notice(t('validation.noNutritionData'));
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
        new Notice(t('notifications.itemsAdded', { count: '1' }));
      },
      this.plugin
    ).open();
  }

  private removeFood(food: FoodItemData): void {
    // Update the food item
    food.isSelected = false;
    food.customServing = undefined;

    this.updateUI();
    new Notice(t('general.remove') + ` ${food.name}`);
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
        new Notice(t('general.success'));
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
    header.createEl('h3', { text: t('meals.create.selectedItems'), cls: 'selected-title' });

    this.selectedItemsContainer = selectedSection.createDiv({ cls: 'selected-items-container' });
  }

  private updateSelectedItemsDisplay(): void {
    this.selectedItemsContainer.empty();

    const selectedFoods = this.allFoods.filter((food) => food.isSelected);

    if (selectedFoods.length === 0) {
      this.selectedItemsContainer.createDiv({
        cls: 'no-selected-items',
        text: t('meals.create.noSelectedItems'),
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
    const buttonContainer = this.contentEl.createDiv({
      cls: 'action-buttons macros-action-buttons',
    });

    const cancelButton = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'cancel-button',
    });

    this.createButton = buttonContainer.createEl('button', {
      text: t('meals.create.create'),
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
      new Notice(t('validation.enterMealName'));
      this.mealNameInput.focus();
      return;
    }

    // Check for duplicate names
    const existingMeal = this.plugin.settings.mealTemplates.find(
      (m: MealTemplate) => m.name.toLowerCase() === this.newMealName.toLowerCase()
    );

    if (existingMeal) {
      new Notice(t('validation.duplicateMealName'));
      this.mealNameInput.focus();
      return;
    }

    // Get selected foods
    const selectedFoods = this.allFoods.filter((food) => food.isSelected);

    if (selectedFoods.length === 0) {
      new Notice(t('validation.selectAtLeastOne'));
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
      t('notifications.mealTemplateCreated', {
        name: this.newMealName,
        count: selectedFoods.length.toString(),
      })
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

// EditMealTemplateModal.ts - Enhanced with kJ support
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
    const header = this.contentEl.createDiv({ cls: 'modal-header macros-modal-header' });
    header.createEl('h2', {
      text: t('meals.edit.title', { mealName: this.meal.name }),
      cls: 'modal-title macros-modal-title',
    });
    header.createEl('p', {
      text: t('meals.edit.description'),
      cls: 'modal-description macros-modal-description',
    });
  }

  private createSearchBar(): void {
    const searchContainer = this.contentEl.createDiv({
      cls: 'search-container macros-search-container',
    });

    const searchWrapper = searchContainer.createDiv({
      cls: 'search-wrapper macros-search-wrapper',
    });
    searchWrapper.createEl('span', { cls: 'search-icon macros-search-icon', text: '🔍' });

    this.searchInput = searchWrapper.createEl('input', {
      type: 'text',
      cls: 'search-input macros-search-input',
      attr: { placeholder: t('meals.create.searchPlaceholder') },
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
    sectionHeader.createEl('h3', { text: t('meals.create.availableFoods'), cls: 'section-title' });

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
        cls: 'no-results macros-no-results',
        text: t('meals.create.noResults'),
      });
      return;
    }

    this.filteredFoods.forEach((food) => {
      const foodCard = this.foodsContainer.createDiv({ cls: 'food-card' });

      // Food name
      const foodHeader = foodCard.createDiv({ cls: 'food-header' });
      foodHeader.createEl('h3', { text: food.name, cls: 'food-name' });

      // Enhanced nutrition info with kJ support
      if (food.nutrition) {
        const nutritionInfo = foodCard.createDiv({ cls: 'nutrition-info macros-nutrition-info' });

        // Enhanced calorie display with kJ support
        const currentEnergyUnit = this.plugin.settings.energyUnit;
        const calorieSpan = nutritionInfo.createEl('span', {
          cls: 'nutrition-item macros-nutrition-item calories',
        });

        if (currentEnergyUnit === 'kJ') {
          const kjValue = convertEnergyUnit(food.nutrition.calories, 'kcal', 'kJ');
          calorieSpan.textContent = `${kjValue.toFixed(1)} kJ`;
          // Add tooltip showing both units
          calorieSpan.setAttribute(
            'title',
            `${food.nutrition.calories.toFixed(1)} kcal = ${kjValue.toFixed(1)} kJ`
          );
        } else {
          calorieSpan.textContent = `${food.nutrition.calories.toFixed(1)} kcal`;
        }

        nutritionInfo.createEl('span', {
          text: `${food.nutrition.protein.toFixed(1)}g ${t('table.headers.protein').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item protein',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.fat.toFixed(1)}g ${t('table.headers.fat').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item fat',
        });
        nutritionInfo.createEl('span', {
          text: `${food.nutrition.carbs.toFixed(1)}g ${t('table.headers.carbs').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item carbs',
        });

        // Serving size - Enhanced with proper translation keys
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
      const buttonContainer = foodCard.createDiv({
        cls: 'button-container macros-button-container',
      });

      if (food.isSelected) {
        // Remove button
        const removeButton = buttonContainer.createEl('button', {
          text: t('meals.create.remove'),
          cls: 'remove-button',
        });

        // Edit serving button (if nutrition data available)
        if (food.nutrition) {
          const editButton = buttonContainer.createEl('button', {
            text: t('meals.create.editServing'),
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
          text: t('meals.create.addToMeal'),
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
      new Notice(t('validation.noNutritionData'));
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

        new Notice(t('notifications.itemsAdded', { count: '1' }));
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

    new Notice(`${t('general.remove')} ${food.name}`);
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

        new Notice(t('general.success'));
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
    header.createEl('h3', { text: t('meals.create.selectedItems'), cls: 'selected-title' });

    this.selectedItemsContainer = selectedSection.createDiv({ cls: 'selected-items-container' });
  }

  private updateSelectedItemsDisplay(): void {
    this.selectedItemsContainer.empty();

    const selectedFoods = this.allFoods.filter((food) => food.isSelected);

    if (selectedFoods.length === 0) {
      this.selectedItemsContainer.createDiv({
        cls: 'no-selected-items',
        text: t('meals.create.noSelectedItems'),
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
    const buttonContainer = this.contentEl.createDiv({
      cls: 'action-buttons macros-action-buttons',
    });

    const cancelButton = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'cancel-button',
    });

    this.saveButton = buttonContainer.createEl('button', {
      text: t('meals.edit.saveChanges'),
      cls: 'save-button',
    });

    this.component.registerDomEvent(cancelButton, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(this.saveButton, 'click', async () => {
      await this.plugin.saveSettings();
      new Notice(t('notifications.mealTemplateUpdated', { name: this.meal.name }));
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

import { App, Modal, Notice, TFile, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData } from '../../utils';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { CustomServingSizeModal } from './CustomServingSizeModal';
import { t } from '../../lang/I18nManager';
import { convertEnergyUnit } from '../../utils/energyUtils';

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

interface MealNutritionData {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  itemCount: number;
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
  private groupContainer: HTMLElement;
  private selectedItemsContainer: HTMLElement;
  private confirmButton: HTMLElement;
  private mealsTab: HTMLElement;
  private foodsTab: HTMLElement;
  private groupTab: HTMLElement;

  // Group creation elements
  private groupNameInput: HTMLInputElement;
  private groupFoodsContainer: HTMLElement;
  private groupSelectedItems: string[] = [];

  // Data
  private allMeals: MealTemplate[] = [];
  private mealNutritionData: Map<string, MealNutritionData> = new Map();
  private allFoods: FoodItemData[] = [];
  private filteredMeals: MealTemplate[] = [];
  private filteredFoods: FoodItemData[] = [];
  private filteredGroupFoods: FoodItemData[] = [];

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

    // Auto-focus search input
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
        this.searchInput.setSelectionRange(0, 0);
      }
    }, 150);
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

    // Calculate nutrition data for each meal
    await this.calculateMealNutrition();

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

  private async calculateMealNutrition(): Promise<void> {
    for (const meal of this.allMeals) {
      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;
      let totalCarbs = 0;
      let validItemCount = 0;

      for (const item of meal.items) {
        let foodName = item;
        let quantity = 100; // default

        if (item.includes(':')) {
          const parts = item.split(':').map((s) => s.trim());
          foodName = parts[0];
          quantity = parseGrams(parts[1]) || 100;
        }

        // Find the food file
        const folder = normalizePath(this.plugin.settings.storageFolder);
        const fileList = this.app.vault.getFiles().filter((f: TFile) => f.path.startsWith(folder));
        const matchingFile = fileList.find(
          (f) => f.name.replace(/\.md$/, '').toLowerCase() === foodName.toLowerCase()
        );

        if (matchingFile) {
          const nutrition = processNutritionalData(this.app, matchingFile, quantity);
          if (nutrition) {
            totalCalories += nutrition.calories;
            totalProtein += nutrition.protein;
            totalFat += nutrition.fat;
            totalCarbs += nutrition.carbs;
            validItemCount++;
          }
        }
      }

      this.mealNutritionData.set(meal.name, {
        calories: totalCalories,
        protein: totalProtein,
        fat: totalFat,
        carbs: totalCarbs,
        itemCount: validItemCount,
      });
    }
  }

  private createHeader(): void {
    const header = this.contentEl.createDiv({ cls: 'modal-header macros-modal-header' });
    header.createEl('h2', { text: t('meals.addTo.title'), cls: 'modal-title macros-modal-title' });
    header.createEl('p', {
      text: t('meals.addTo.description'),
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
      attr: { placeholder: t('meals.addTo.searchPlaceholder') },
    });

    // Add search functionality
    this.component.registerDomEvent(this.searchInput, 'input', () => {
      const query = this.searchInput.value;
      this.filterAndRender(query);
    });

    // Handle keyboard navigation between tabs
    this.component.registerDomEvent(this.searchInput, 'keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Tab') {
          e.preventDefault();
          if (e.shiftKey) {
            this.switchToPreviousTab();
          } else {
            this.switchToNextTab();
          }
        }
      }
    });
  }

  private createTabsAndContent(): void {
    const contentContainer = this.contentEl.createDiv({ cls: 'content-container' });

    // Get tab order from settings
    const tabOrder = this.plugin.settings.addToMacrosTabOrder;

    // Create perfectly centered tabs container
    const tabsContainer = contentContainer.createDiv({ cls: 'tabs-container centered-tabs' });

    // Initialize tab references
    const tabElements: { [key: string]: HTMLElement } = {};

    // Create tabs in the order specified by settings
    tabOrder.forEach((tabKey, index) => {
      const isFirst = index === 0;

      switch (tabKey) {
        case 'meals':
          tabElements.meals = this.createTab(
            tabsContainer,
            t('meals.addTo.mealTemplates'),
            isFirst
          );
          break;
        case 'foods':
          tabElements.foods = this.createTab(
            tabsContainer,
            t('meals.addTo.individualFoods'),
            isFirst
          );
          break;
        case 'group':
          tabElements.group = this.createTab(tabsContainer, t('meals.addTo.createGroup'), isFirst);
          break;
      }
    });

    // Assign tab references based on order
    this.mealsTab = tabElements.meals;
    this.foodsTab = tabElements.foods;
    this.groupTab = tabElements.group;

    // Create content areas
    const contentArea = contentContainer.createDiv({ cls: 'content-area macros-content-area' });

    // Create content containers and show the first one by default
    const firstTab = tabOrder[0];

    // Always create all containers, but only show the first one
    this.mealsContainer = contentArea.createDiv({
      cls: `items-container meals-container ${firstTab === 'meals' ? 'active' : ''}`,
    });
    this.foodsContainer = contentArea.createDiv({
      cls: `items-container foods-container ${firstTab === 'foods' ? 'active' : ''}`,
    });
    this.groupContainer = contentArea.createDiv({
      cls: `items-container group-container ${firstTab === 'group' ? 'active' : ''}`,
    });

    // Setup group creation content
    this.setupGroupCreationContent();

    // Tab switching
    this.component.registerDomEvent(this.mealsTab, 'click', () => {
      this.switchTab('meals');
    });

    this.component.registerDomEvent(this.foodsTab, 'click', () => {
      this.switchTab('foods');
    });

    this.component.registerDomEvent(this.groupTab, 'click', () => {
      this.switchTab('group');
    });

    // Add keyboard navigation for tabs
    [this.mealsTab, this.foodsTab, this.groupTab].forEach((tab, index) => {
      this.component.registerDomEvent(tab, 'keydown', (e: KeyboardEvent) => {
        this.handleTabKeyboardNavigation(e, index);
      });
    });
  }

  private createTab(container: HTMLElement, text: string, isActive: boolean): HTMLElement {
    const tab = container.createEl('button', {
      text: text,
      cls: `tab-button macros-tab-button ${isActive ? 'active' : ''}`,
    });
    return tab;
  }

  private setupGroupCreationContent(): void {
    // Group name input section
    const groupNameSection = this.groupContainer.createDiv({ cls: 'group-name-section' });

    groupNameSection.createEl('label', {
      text: t('meals.addTo.groupName'),
      cls: 'group-name-label',
    });

    this.groupNameInput = groupNameSection.createEl('input', {
      type: 'text',
      cls: 'group-name-input',
      attr: { placeholder: t('meals.addTo.groupNamePlaceholder') },
    });

    // Add validation and update functionality - re-render group foods when name changes
    this.component.registerDomEvent(this.groupNameInput, 'input', () => {
      this.renderGroupFoods(); // Re-render to update click handlers and state
      this.updateConfirmButtonState();
    });

    // Food selection for group
    const groupFoodSection = this.groupContainer.createDiv({ cls: 'group-food-section' });

    groupFoodSection.createEl('h3', {
      text: t('meals.addTo.selectFoodsForGroup'),
      cls: 'group-food-title',
    });

    this.groupFoodsContainer = groupFoodSection.createDiv({ cls: 'group-foods-container' });
  }

  private switchTab(activeTab: 'meals' | 'foods' | 'group'): void {
    // Update tab buttons
    this.mealsTab.classList.toggle('active', activeTab === 'meals');
    this.foodsTab.classList.toggle('active', activeTab === 'foods');
    this.groupTab.classList.toggle('active', activeTab === 'group');

    // Update content visibility
    this.mealsContainer.classList.toggle('active', activeTab === 'meals');
    this.foodsContainer.classList.toggle('active', activeTab === 'foods');
    this.groupContainer.classList.toggle('active', activeTab === 'group');

    // Handle search input focus and filtering
    setTimeout(() => {
      if (this.searchInput) {
        if (activeTab === 'group') {
          // For group tab, focus on group name input instead
          this.groupNameInput.focus();
        } else {
          this.searchInput.focus();
        }
      }
    }, 50);

    // If switching to group tab, render group foods
    if (activeTab === 'group') {
      this.renderGroupFoods();
    }
  }

  private switchToNextTab(): void {
    const tabOrder = this.plugin.settings.addToMacrosTabOrder;
    const currentActiveIndex = this.getCurrentActiveTabIndex();
    const nextIndex = (currentActiveIndex + 1) % tabOrder.length;
    const nextTab = tabOrder[nextIndex];

    this.switchTab(nextTab);
    this.getTabElement(nextTab)?.focus();
  }

  private switchToPreviousTab(): void {
    const tabOrder = this.plugin.settings.addToMacrosTabOrder;
    const currentActiveIndex = this.getCurrentActiveTabIndex();
    const prevIndex = (currentActiveIndex - 1 + tabOrder.length) % tabOrder.length;
    const prevTab = tabOrder[prevIndex];

    this.switchTab(prevTab);
    this.getTabElement(prevTab)?.focus();
  }

  private getCurrentActiveTabIndex(): number {
    if (this.mealsTab?.classList.contains('active'))
      return this.plugin.settings.addToMacrosTabOrder.indexOf('meals');
    if (this.foodsTab?.classList.contains('active'))
      return this.plugin.settings.addToMacrosTabOrder.indexOf('foods');
    if (this.groupTab?.classList.contains('active'))
      return this.plugin.settings.addToMacrosTabOrder.indexOf('group');
    return 0;
  }

  private getTabElement(tabKey: string): HTMLElement | null {
    switch (tabKey) {
      case 'meals':
        return this.mealsTab;
      case 'foods':
        return this.foodsTab;
      case 'group':
        return this.groupTab;
      default:
        return null;
    }
  }

  private handleTabKeyboardNavigation(e: KeyboardEvent, tabIndex: number): void {
    const tabOrder = this.plugin.settings.addToMacrosTabOrder;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const tabKey = tabOrder[tabIndex];
      this.switchTab(tabKey);

      setTimeout(() => {
        if (tabKey === 'group') {
          this.groupNameInput.focus();
        } else {
          this.searchInput.focus();
        }
      }, 100);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.key === 'ArrowRight') {
        this.switchToNextTab();
      } else {
        this.switchToPreviousTab();
      }
    }
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

    // Filter group foods (for group creation)
    this.filteredGroupFoods = this.allFoods.filter((food) =>
      food.name.toLowerCase().includes(searchTerm)
    );

    // Render filtered results
    this.renderMeals();
    this.renderFoods();
    this.renderGroupFoods();
  }

  private renderMeals(): void {
    this.mealsContainer.empty();

    if (this.filteredMeals.length === 0) {
      this.mealsContainer.createDiv({
        cls: 'no-results macros-no-results',
        text: t('meals.create.noResults'),
      });
      return;
    }

    this.filteredMeals.forEach((meal) => {
      const mealCard = this.mealsContainer.createDiv({ cls: 'meal-card' });

      // Meal header
      const mealHeader = mealCard.createDiv({ cls: 'meal-header' });
      mealHeader.createEl('h3', { text: meal.name, cls: 'meal-name' });
      mealHeader.createEl('span', {
        text: t('table.meal.items', { count: meal.items.length.toString() }),
        cls: 'meal-count',
      });

      // Add nutrition information matching individual foods styling exactly
      const mealNutrition = this.mealNutritionData.get(meal.name);
      if (mealNutrition) {
        const nutritionInfo = mealCard.createDiv({ cls: 'nutrition-info macros-nutrition-info' });

        // Use consistent styling with individual food cards - separate spans with background colors
        const currentEnergyUnit = this.plugin.settings.energyUnit;
        const calorieSpan = nutritionInfo.createEl('span', {
          cls: 'nutrition-item macros-nutrition-item calories',
        });

        if (currentEnergyUnit === 'kJ') {
          const kjValue = convertEnergyUnit(mealNutrition.calories, 'kcal', 'kJ');
          calorieSpan.textContent = `${kjValue.toFixed(1)} kJ`;
          calorieSpan.setAttribute(
            'title',
            `${mealNutrition.calories.toFixed(1)} kcal = ${kjValue.toFixed(1)} kJ`
          );
        } else {
          calorieSpan.textContent = `${mealNutrition.calories.toFixed(1)} kcal`;
        }

        nutritionInfo.createEl('span', {
          text: `${mealNutrition.protein.toFixed(1)}g ${t('table.headers.protein').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item protein',
        });
        nutritionInfo.createEl('span', {
          text: `${mealNutrition.fat.toFixed(1)}g ${t('table.headers.fat').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item fat',
        });
        nutritionInfo.createEl('span', {
          text: `${mealNutrition.carbs.toFixed(1)}g ${t('table.headers.carbs').toLowerCase()}`,
          cls: 'nutrition-item macros-nutrition-item carbs',
        });

        // Serving size info to match individual foods
        const servingInfo = mealCard.createDiv({ cls: 'serving-info' });
        servingInfo.createEl('span', {
          text: `Total for meal`,
          cls: 'serving-size',
        });
      }

      // Meal items preview (moved below nutrition info)
      const itemsPreview = mealCard.createDiv({ cls: 'meal-items-preview' });
      const previewItems = meal.items.slice(0, 3);
      previewItems.forEach((item) => {
        itemsPreview.createEl('span', { text: item, cls: 'preview-item' });
      });

      if (meal.items.length > 3) {
        itemsPreview.createEl('span', {
          text: `+${meal.items.length - 3} ${t('general.more')}`,
          cls: 'preview-more',
        });
      }

      // Add button
      const addButton = mealCard.createEl('button', {
        text: t('meals.addTo.addMeal'),
        cls: 'add-button meal-add-button',
      });

      this.component.registerDomEvent(addButton, 'click', () => {
        this.addMeal(meal);
      });

      // Add selection state
      const mealValue = `interactive:meal:${meal.name}`;
      if (this.selectedItems.includes(mealValue)) {
        mealCard.addClass('selected');
        addButton.textContent = t('meals.addTo.added');
        addButton.addClass('selected');
      }
    });
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
        servingInfo.createEl('span', {
          text: `Per ${food.nutrition.serving}`,
          cls: 'serving-size',
        });
      }

      // Add button
      const addButton = foodCard.createEl('button', {
        text: t('meals.addTo.addFood'),
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
        addButton.textContent = t('meals.addTo.added');
        addButton.addClass('selected');
      }
    });
  }

  private renderGroupFoods(): void {
    this.groupFoodsContainer.empty();

    if (this.filteredGroupFoods.length === 0) {
      this.groupFoodsContainer.createDiv({
        cls: 'no-results macros-no-results',
        text: t('meals.create.noResults'),
      });
      return;
    }

    const hasGroupName = this.groupNameInput.value.trim().length > 0;

    this.filteredGroupFoods.forEach((food) => {
      const foodCard = this.groupFoodsContainer.createDiv({
        cls: `food-card group-food-card ${!hasGroupName ? 'disabled' : ''}`,
      });

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
        servingInfo.createEl('span', {
          text: `Per ${food.nutrition.serving}`,
          cls: 'serving-size',
        });
      }

      // Add button - Dynamic button text based on group name and selection state
      const addButton = foodCard.createEl('button', {
        text: this.getGroupFoodButtonText(food, hasGroupName),
        cls: 'add-button group-food-add-button',
      });

      // Always add click handler, but check conditions inside the handler
      this.component.registerDomEvent(addButton, 'click', () => {
        // Check if group has a name before allowing addition
        if (!hasGroupName) {
          new Notice(t('meals.addTo.enterGroupNameFirst'));
          return;
        }
        this.addFoodToGroup(food);
      });

      // Check if already selected for group
      const isSelected = this.groupSelectedItems.some((item) => item.startsWith(`${food.name}:`));

      if (isSelected && hasGroupName) {
        foodCard.addClass('selected');
        addButton.textContent = t('meals.addTo.added');
        addButton.addClass('selected');
      }
    });
  }

  private getGroupFoodButtonText(food: FoodItemData, hasGroupName: boolean): string {
    if (!hasGroupName) {
      return t('meals.addTo.enterGroupNameFirst');
    }

    // Check if already selected
    const isSelected = this.groupSelectedItems.some((item) => item.startsWith(`${food.name}:`));

    if (isSelected) {
      return t('meals.addTo.added');
    }

    return t('meals.addTo.addToGroup');
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
      new Notice(t('validation.noNutritionData'));
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

  private async addFoodToGroup(food: FoodItemData): Promise<void> {
    // Check if group name exists before allowing addition
    const groupName = this.groupNameInput.value.trim();
    if (!groupName) {
      new Notice(t('meals.addTo.enterGroupNameFirst'));
      return;
    }

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
        const newItem = `${food.name}:${customServing}g`;

        // Remove any existing entry for this food in the group
        this.groupSelectedItems = this.groupSelectedItems.filter(
          (item) => !item.startsWith(`${food.name}:`)
        );

        // Add new entry to group
        this.groupSelectedItems.push(newItem);

        // Update all UI components after adding item
        this.renderGroupFoods(); // Re-render group foods to update button states
        this.updateSelectedItemsDisplay(); // Update selected items display
        this.updateConfirmButtonState(); // Update confirm button state

        new Notice(t('notifications.itemsAdded', { count: '1' }));
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
    header.createEl('h3', { text: t('meals.addTo.selectedItems'), cls: 'selected-title' });

    this.selectedItemsContainer = selectedSection.createDiv({ cls: 'selected-items-container' });
  }

  private updateSelectedItemsDisplay(): void {
    this.selectedItemsContainer.empty();

    // Combine regular selected items and group (but not individual group items)
    const allSelectedItems = [...this.selectedItems];

    // Only add group summary, not individual items to reduce clutter
    if (this.groupSelectedItems.length > 0 && this.groupNameInput.value.trim()) {
      const groupName = this.groupNameInput.value.trim();
      allSelectedItems.push(`🗂️ ${groupName} (${this.groupSelectedItems.length} items)`);
    } else if (this.groupSelectedItems.length > 0) {
      // Show group items even without a name (as pending) - Use translation key
      allSelectedItems.push(
        `🗂️ ${t('meals.addTo.pendingGroup')} (${this.groupSelectedItems.length} items)`
      );
    }

    if (allSelectedItems.length === 0) {
      this.selectedItemsContainer.createDiv({
        cls: 'no-selected-items',
        text: t('meals.addTo.noSelectedItems'),
      });
    } else {
      allSelectedItems.forEach((item, index) => {
        const itemTag = this.selectedItemsContainer.createDiv({ cls: 'selected-item-tag' });

        let displayText = item.startsWith('interactive:')
          ? item.substring('interactive:'.length)
          : item;

        // Special handling for group display
        if (item.startsWith('🗂️')) {
          displayText = item; // Show the full group description
          itemTag.addClass('group-item-tag');
        }

        itemTag.createEl('span', { text: displayText, cls: 'item-text' });

        const removeButton = itemTag.createEl('button', {
          text: '×',
          cls: 'remove-item-button',
        });

        this.component.registerDomEvent(removeButton, 'click', () => {
          if (item.startsWith('🗂️')) {
            // Clear the group
            this.groupSelectedItems = [];
            this.groupNameInput.value = '';
            this.renderGroupFoods();
          } else {
            // Remove regular item
            const originalItem = item.startsWith('interactive:') ? item : `interactive:${item}`;
            const itemIndex = this.selectedItems.findIndex(
              (selectedItem) => selectedItem === originalItem || selectedItem === item
            );
            if (itemIndex !== -1) {
              this.selectedItems.splice(itemIndex, 1);
            }
          }
          this.updateUI();
        });
      });
    }

    // Update confirm button state
    this.updateConfirmButtonState();
  }

  private updateConfirmButtonState(): void {
    if (!this.confirmButton) return;

    const hasRegularItems = this.selectedItems.length > 0;
    const hasGroupItems = this.groupSelectedItems.length > 0 && this.groupNameInput.value.trim();
    const canConfirm = hasRegularItems || hasGroupItems;

    if (canConfirm) {
      this.confirmButton.removeClass('disabled');
      (this.confirmButton as HTMLButtonElement).disabled = false;
    } else {
      this.confirmButton.addClass('disabled');
      (this.confirmButton as HTMLButtonElement).disabled = true;
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

    this.confirmButton = buttonContainer.createEl('button', {
      text: t('meals.addTo.addSelectedItems'),
      cls: 'confirm-button disabled',
    });

    (this.confirmButton as HTMLButtonElement).disabled = true;

    this.component.registerDomEvent(cancelButton, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(this.confirmButton, 'click', async () => {
      await this.handleConfirm();
    });
  }

  private async handleConfirm(): Promise<void> {
    const allItemsToAdd: string[] = [];

    // Add regular selected items
    allItemsToAdd.push(...this.selectedItems);

    // Add group if it has content - Proper group name handling
    if (this.groupSelectedItems.length > 0 && this.groupNameInput.value.trim()) {
      const groupName = this.groupNameInput.value.trim();

      // Add the group header with proper syntax
      allItemsToAdd.push(`interactive:group:${groupName}`);

      // Add all group items as bullet points with proper formatting
      this.groupSelectedItems.forEach((item) => {
        // The item already contains the food name and quantity, just add the bullet prefix
        allItemsToAdd.push(`interactive:- ${item}`);
      });
    }

    if (allItemsToAdd.length === 0) return;

    try {
      // Rest of the method remains the same...
      if (!this.plugin.dataManager.additionalMacros) {
        this.plugin.dataManager.additionalMacros = new Map();
      }

      if (!this.plugin.dataManager.additionalMacros.has(this.tableId)) {
        this.plugin.dataManager.additionalMacros.set(this.tableId, []);
      }

      const arr = this.plugin.dataManager.additionalMacros.get(this.tableId);
      if (!arr) {
        throw new Error('Failed to access macro data');
      }

      allItemsToAdd.forEach((item) => arr.push(item));

      await this.onDone();

      const totalCount = this.selectedItems.length + (this.groupSelectedItems.length > 0 ? 1 : 0);
      new Notice(t('notifications.itemsAdded', { count: totalCount.toString() }));
      this.close();
    } catch (error) {
      this.plugin.logger.error('Error adding items to macros:', error);
      new Notice(
        t('notifications.itemsAddError', {
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

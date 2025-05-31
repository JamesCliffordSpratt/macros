import { App, Modal, Notice, TFile, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData, findMatchingFoodFile } from '../../utils';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { CustomServingSizeModal } from './CustomServingSizeModal';

export class AddToMacrosModal extends Modal {
  plugin: MacrosPlugin;
  tableId: string;
  onDone: () => Promise<void>;
  selectedItems: string[] = [];
  private component: Component;

  constructor(app: App, plugin: MacrosPlugin, tableId: string, onDone: () => Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.tableId = tableId;
    this.onDone = onDone;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Add to macros', cls: 'mod-header' });

    const mealRow = contentEl.createDiv({ cls: 'add-to-macros-row' });
    mealRow.createEl('label', { text: 'Select meal:' });
    const mealControl = mealRow.createDiv({ cls: 'setting-item-control' });
    const mealSelect = mealRow.createEl('select');
    mealControl.appendChild(mealSelect);
    mealSelect.createEl('option', { text: '-- None --', value: '' });
    this.plugin.settings.mealTemplates.forEach((meal: MealTemplate) => {
      mealSelect.createEl('option', { text: meal.name, value: `interactive:meal:${meal.name}` });
    });

    const addMealBtn = mealRow.createEl('button', { text: 'Add meal' });
    addMealBtn.addClass('mod-button');
    const mealBtnControl = mealRow.createDiv({ cls: 'setting-item-control' });
    mealBtnControl.appendChild(addMealBtn);

    this.component.registerDomEvent(addMealBtn, 'click', () => {
      const mealValue = mealSelect.value;
      if (mealValue) {
        this.selectedItems.push(mealValue);
        refreshSummary();
        mealSelect.value = '';
      }
    });

    const foodRow = contentEl.createDiv({ cls: 'add-to-macros-row' });
    foodRow.createEl('label', { text: 'Select food:' });
    const foodControl = foodRow.createDiv({ cls: 'setting-item-control' });
    const foodSelect = foodRow.createEl('select');
    foodControl.appendChild(foodSelect);
    foodSelect.createEl('option', { text: '-- None --', value: '' });

    // Normalize the folder path
    const folder = normalizePath(this.plugin.settings.storageFolder);

    const fileList = this.app.vault.getFiles().filter((f: TFile) => f.path.startsWith(folder));
    const foodNames = fileList.map((f: TFile) => f.name.replace(/\.md$/, ''));
    foodNames.forEach((food: string) => {
      foodSelect.createEl('option', { text: food, value: 'interactive:' + food });
    });

    const addFoodBtn = foodRow.createEl('button', { text: 'Add food' });
    addFoodBtn.addClass('mod-button');
    const foodBtnControl = foodRow.createDiv({ cls: 'setting-item-control' });
    foodBtnControl.appendChild(addFoodBtn);

    this.component.registerDomEvent(addFoodBtn, 'click', async () => {
      const foodValue = foodSelect.value;
      if (foodValue) {
        const foodName = foodValue.substring('interactive:'.length);
        const file = findMatchingFoodFile(fileList, foodName);
        if (!file) {
          new Notice('Food item not found.');
          return;
        }

        const nutrition = processNutritionalData(this.app, file);
        if (!nutrition || !nutrition.serving) {
          new Notice('Could not process nutrition data for this food.');
          return;
        }

        const defaultServing = parseGrams(nutrition.serving);

        new CustomServingSizeModal(
          this.app,
          foodName,
          defaultServing,
          async (customServing: number) => {
            const newItem = `interactive:${foodName}:${customServing}g`;
            this.selectedItems.push(newItem);
            refreshSummary();
          },
          this.plugin
        ).open();
        foodSelect.value = '';
      }
    });

    const summaryDiv = contentEl.createDiv({ cls: 'macro-summary-div' });
    summaryDiv.createEl('h3', { text: 'Items to add:' });
    const summaryList = summaryDiv.createEl('ul');

    const refreshSummary = () => {
      summaryList.empty();
      this.selectedItems.forEach((item, index) => {
        const displayText = item.startsWith('interactive:')
          ? item.substring('interactive:'.length)
          : item;
        const listItem = summaryList.createEl('li');
        listItem.createEl('span', { text: displayText });

        const removeBtn = listItem.createEl('button', {
          cls: 'clickable-icon remove-summary-item',
          attr: {
            'data-icon': 'x',
            'aria-label': 'Remove',
          },
        });

        this.component.registerDomEvent(removeBtn, 'click', () => {
          this.selectedItems.splice(index, 1);
          refreshSummary();
        });
      });
    };

    const confirmBtn = contentEl.createEl('button', {
      text: 'Confirm changes',
      cls: 'confirm-changes-button',
    });

    this.component.registerDomEvent(confirmBtn, 'click', async () => {
      if (this.selectedItems.length === 0) {
        new Notice('No items selected to add.');
        return;
      }

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

        // Log the existing items for debugging
        this.plugin.logger.debug(`Existing items for ${this.tableId}: ${arr.length}`);

        // Add each selected item to the array
        this.selectedItems.forEach((item) => arr.push(item));

        // Log for debugging
        this.plugin.logger.debug(
          `Added ${this.selectedItems.length} items to table ${this.tableId}`
        );
        this.plugin.logger.debug(`Items: ${this.selectedItems.join(', ')}`);
        this.plugin.logger.debug(`New total items: ${arr.length}`);

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

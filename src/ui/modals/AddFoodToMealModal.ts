import { Modal, Notice, normalizePath, Component } from 'obsidian';
import { parseGrams, processNutritionalData, findMatchingFoodFile } from '../../utils';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { CustomServingSizeModal } from './CustomServingSizeModal';
import { t } from '../../lang/I18nManager';

export class AddFoodToMealModal extends Modal {
  plugin: MacrosPlugin;
  meal: MealTemplate;
  files: string[] = [];
  itemListEl: HTMLElement | null = null;
  private component: Component;

  constructor(plugin: MacrosPlugin, meal: MealTemplate) {
    super(plugin.app);
    this.plugin = plugin;
    this.meal = meal;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('meals.addTo.title') + ` "${this.meal.name}"` });

    const row = contentEl.createDiv({ cls: 'add-food-row' });
    const folder = normalizePath(this.plugin.settings.storageFolder);
    const fileList = this.app.vault.getFiles().filter((f) => f.path.startsWith(folder));
    this.files = fileList.map((f) => f.name.replace(/\.md$/, ''));

    const dropdown = row.createEl('select');
    dropdown.createEl('option', { text: `-- ${t('food.search.placeholder')} --`, value: '' });
    this.files.forEach((fname) => {
      const option = dropdown.createEl('option');
      option.value = fname;
      option.text = fname;
    });

    const addBtn = row.createEl('button', {
      text: t('general.add') + ' ' + t('food.search.title').toLowerCase(),
    });
    this.component.registerDomEvent(addBtn, 'click', async () => {
      const selected = dropdown.value;
      if (selected && !this.meal.items.some((item) => item.startsWith(selected))) {
        const matchingFile = findMatchingFoodFile(fileList, selected);
        if (!matchingFile) {
          new Notice(t('errors.fileNotFound'));
          return;
        }

        const nutrition = processNutritionalData(this.app, matchingFile);
        if (!nutrition || !nutrition.serving) {
          new Notice(t('errors.noNutritionData'));
          return;
        }

        const defaultServing = parseGrams(nutrition.serving);
        if (isNaN(defaultServing)) {
          new Notice(t('errors.invalidServing'));
          return;
        }

        new CustomServingSizeModal(
          this.app,
          selected,
          defaultServing,
          async (customServing: number) => {
            this.meal.items.push(`${selected}:${customServing}g`);
            await this.plugin.saveSettings();
            this.refreshItemList();
            new Notice(t('notifications.itemsAdded', { count: '1' }));
          },
          this.plugin
        ).open();
      } else {
        new Notice(t('validation.selectAtLeastOne'));
      }
    });

    this.itemListEl = contentEl.createEl('ul');
    this.itemListEl.classList.add('meal-item-list');
    this.refreshItemList();

    const finishBtn = contentEl.createEl('button', { text: t('general.close') });
    this.component.registerDomEvent(finishBtn, 'click', () => {
      this.close();
      this.plugin.nutritionalSettingTab.display();
    });
  }

  private refreshItemList() {
    if (!this.itemListEl) return;
    this.itemListEl.empty();
    const list = this.itemListEl;
    this.meal.items.forEach((item, index) => {
      const li = list.createEl('li');
      const span = li.createEl('span', { text: item });
      span.classList.add('meal-item-label');

      const removeBtn = li.createEl('button', { text: '×' });
      removeBtn.classList.add('mod-button', 'mod-warning', 'remove-meal-item-button');

      this.component.registerDomEvent(removeBtn, 'click', async () => {
        this.meal.items.splice(index, 1);
        await this.plugin.saveSettings();
        this.refreshItemList();
        new Notice(t('general.remove') + ` "${item}" ${t('general.from')} ${this.meal.name}`);
      });
    });
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

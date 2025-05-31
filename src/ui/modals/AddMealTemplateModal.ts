import { Modal, Notice, Component } from 'obsidian';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { AddFoodToMealModal } from './AddFoodToMealModal';

export class AddMealTemplateModal extends Modal {
  plugin: MacrosPlugin;
  private component: Component;

  constructor(plugin: MacrosPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'New meal template', cls: 'mod-header' });
    const nameInput = contentEl.createEl('input', { type: 'text' });
    nameInput.placeholder = 'Meal name (e.g., Meal1)';

    const createMeal = async () => {
      const mealName = nameInput.value.trim();
      if (!mealName) {
        new Notice('Please enter a valid meal name.');
        return;
      }
      if (
        this.plugin.settings.mealTemplates.some(
          (m: MealTemplate) => m.name.toLowerCase() === mealName.toLowerCase()
        )
      ) {
        new Notice(
          'A meal template with that name already exists. Please choose a different name.'
        );
        return;
      }
      const newMeal: MealTemplate = {
        name: mealName,
        items: [],
      };
      this.plugin.settings.mealTemplates.push(newMeal);
      await this.plugin.saveSettings();
      this.close();
      new AddFoodToMealModal(this.plugin, newMeal).open();
      this.plugin.nutritionalSettingTab.display();
    };

    this.component.registerDomEvent(nameInput, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createMeal();
      }
    });

    const createBtn = contentEl.createEl('button', { text: 'Create meal template' });
    createBtn.addClass('mod-button', 'mod-cta');
    this.component.registerDomEvent(createBtn, 'click', createMeal);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

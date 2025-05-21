import { Modal, Notice } from 'obsidian';
import { MealTemplate } from '../../settings/StorageService';
import MacrosPlugin from '../../main';
import { AddFoodToMealModal } from './AddFoodToMealModal';
import { EventManager } from '../../utils/EventManager';

/**
 * AddMealTemplateModal
 * --------------------
 * Provides a modal interface for creating a new meal template.
 *
 * @param plugin - The instance of MacrosPlugin.
 */
export class AddMealTemplateModal extends Modal {
	plugin: MacrosPlugin;
	private eventManager: EventManager;

	constructor(plugin: MacrosPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.eventManager = new EventManager(plugin);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'New Meal Template', cls: 'mod-header' });
		const nameInput = contentEl.createEl('input', { type: 'text' });
		nameInput.placeholder = 'Meal Name (e.g., Meal1)';

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

		// Use EventManager for event handling
		this.eventManager.registerDomEvent(nameInput, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				createMeal();
			}
		});

		const createBtn = contentEl.createEl('button', { text: 'Create Meal Template' });
		createBtn.addClass('mod-button', 'mod-cta');

		this.eventManager.registerDomEvent(createBtn, 'click', createMeal);
	}

	onClose() {
		this.eventManager.cleanup();
		this.contentEl.empty();
	}
}

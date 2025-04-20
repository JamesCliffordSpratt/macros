import { App, Modal, Notice, TFile } from 'obsidian';
import { parseGrams, processNutritionalData, findMatchingFoodFile } from './utils';
import { MealTemplate } from './settings';
import { fetchFoodData, FoodItem } from './api';
import { extractServingSize } from './utils';
import MacrosPlugin from './main';

/*
 * Modals for Macros Plugin
 * -----------------------------------
 * This file defines all custom modals for the plugin.
 * These include:
 *  - FoodSearchModal: To prompt the user for a food search term.
 *  - FoodResultsModal: To display the search results fetched from the FatSecret API.
 *  - AddToMacrosModal: To allow users to add selected food items or meal templates to a macros block.
 *  - AddMealTemplateModal: For creating new meal templates.
 *  - EditMealTemplateModal: For editing an existing meal template.
 *  - CustomServingSizeModal: For specifying a custom serving size.
 *  - AddFoodToMealModal: For adding food items to a meal template.
 */

/**
 * AddToMacrosModal
 * ----------------
 * A modal dialog that allows users to add selected food items or meal templates to a macros table.
 *
 * @param app - The Obsidian application instance.
 * @param plugin - The instance of MacrosPlugin.
 * @param tableId - The unique identifier for the macros table.
 * @param onDone - A callback function invoked after changes are confirmed.
 */
export class AddToMacrosModal extends Modal {
	plugin: MacrosPlugin;
	tableId: string;
	onDone: () => Promise<void>;
	selectedItems: string[] = [];

	constructor(app: App, plugin: MacrosPlugin, tableId: string, onDone: () => Promise<void>) {
		super(app);
		this.plugin = plugin;
		this.tableId = tableId;
		this.onDone = onDone;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Add to Macros', cls: 'macros-modal-title' });
		
		// Meal row.
		const mealRow = contentEl.createDiv({ cls: 'macros-modal-row' });
		mealRow.createEl('label', { text: 'Select Meal:' });
		const mealSelect = mealRow.createEl('select');
		mealSelect.createEl('option', { text: '-- None --', value: '' });
		this.plugin.settings.mealTemplates.forEach((meal: MealTemplate) => {
			mealSelect.createEl('option', { text: meal.name, value: `interactive:meal:${meal.name}` });
		});
		const addMealBtn = mealRow.createEl('button', { text: 'Add Meal' });
		addMealBtn.onclick = () => {
			const mealValue = mealSelect.value;
			if (mealValue) {
				// Always add the meal, even if it's already in the list
				// This allows for multiple instances of the same meal
				this.selectedItems.push(mealValue);
				refreshSummary();
				mealSelect.value = '';
			}
		};
		
		// Food row.
		const foodRow = contentEl.createDiv({ cls: 'macros-modal-row' });
		foodRow.createEl('label', { text: 'Select Food:' });
		const foodSelect = foodRow.createEl('select');
		foodSelect.createEl('option', { text: '-- None --', value: '' });
		const folder = this.plugin.settings.storageFolder;
		const fileList = this.app.vault.getFiles().filter((f: TFile) => f.path.startsWith(folder));
		const foodNames = fileList.map((f: TFile) => f.name.replace(/\.md$/, ''));
		foodNames.forEach((food: string) => {
			foodSelect.createEl('option', { text: food, value: 'interactive:' + food });
		});
		const addFoodBtn = foodRow.createEl('button', { text: 'Add Food' });
		addFoodBtn.onclick = async () => {
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
				
				new CustomServingSizeModal(this.app, foodName, defaultServing, async (customServing: number) => {
					const newItem = `interactive:${foodName}:${customServing}g`;
					this.selectedItems.push(newItem);
					refreshSummary();
				}).open();
				foodSelect.value = '';
			}
		};
		
		// Summary.
		const summaryDiv = contentEl.createDiv({ cls: 'macros-summary' });
		summaryDiv.createEl('h3', { text: 'Items to add:' });
		const summaryList = summaryDiv.createEl('ul', { cls: 'macros-modal-list' });
		
		const refreshSummary = () => {
			summaryList.empty();
			this.selectedItems.forEach((item, index) => {
				const displayText = item.startsWith('interactive:') ? item.substring('interactive:'.length) : item;
				const listItem = summaryList.createEl('li', { cls: 'macros-modal-list-item' });
				listItem.createEl('span', { text: displayText, cls: 'macros-modal-item-text' });
				
				// Add a remove button for each item
				const removeBtn = listItem.createEl('button', { 
					text: ' ×',
					cls: 'macros-modal-remove-btn'
				});
				
				removeBtn.onclick = () => {
					this.selectedItems.splice(index, 1);
					refreshSummary();
				};
			});
		};
		
		const confirmBtn = contentEl.createEl('button', {
			text: 'Confirm Changes',
			cls: 'macros-modal-button'
		});
		
		confirmBtn.onclick = async () => {
			if (!this.plugin.additionalMacros.has(this.tableId)) {
				this.plugin.additionalMacros.set(this.tableId, []);
			}
			const arr = this.plugin.additionalMacros.get(this.tableId)!;
			this.selectedItems.forEach(item => arr.push(item));
			
			await this.onDone();
			this.close();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * FoodSearchModal
 * ---------------
 * A modal that prompts the user to enter a food search term.
 *
 * @param app - The Obsidian application instance.
 * @param onSubmit - A callback function to handle the submitted search term.
 */
export class FoodSearchModal extends Modal {
	onSubmit: (searchTerm: string) => void;
	constructor(app: App, onSubmit: (searchTerm: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Enter Food Search Term', cls: 'macros-modal-title' });
		const inputEl = contentEl.createEl('input', { 
			type: 'text',
			cls: 'macros-modal-input'
		});
		
		inputEl.placeholder = 'e.g. Apple';
		inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.onSubmit(inputEl.value);
				this.close();
			}
		});
		inputEl.focus();
	}
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * FoodResultsModal
 * ----------------
 * Displays a list of food items fetched from the FatSecret API based on the user's search term.
 *
 * @param app - The Obsidian application instance.
 * @param searchTerm - The search term provided by the user.
 * @param apiKey - The FatSecret API key.
 * @param apiSecret - The FatSecret API secret.
 * @param onSelect - A callback function that handles the selection of a food item.
 */
export class FoodResultsModal extends Modal {
	searchTerm: string;
	currentPage: number = 0;
	results: FoodItem[] = [];
	maxResults: number = 20;
	apiKey: string;
	apiSecret: string;
	onSelect: (food: FoodItem) => void;

	constructor(
		app: App,
		searchTerm: string,
		apiKey: string,
		apiSecret: string,
		onSelect: (food: FoodItem) => void
	) {
		super(app);
		this.searchTerm = searchTerm;
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
		this.onSelect = onSelect;
	}

	async loadPage(page: number) {
		try {
			this.currentPage = page;
			this.results = await fetchFoodData(
				this.app,
				this.searchTerm,
				this.currentPage,
				this.maxResults,
				this.apiKey,
				this.apiSecret
			);
			this.renderContent();
		} catch (error) {
			console.error('Error loading food data:', error);
			new Notice('Error fetching food data');
		}
	}

	renderContent() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { 
			text: `Results for "${this.searchTerm}" (Page ${this.currentPage + 1})`,
			cls: 'macros-modal-title'
		});
		
		if (this.results.length === 0) {
			contentEl.createEl('p', { text: 'No results found on this page.' });
		} else {
			this.results.forEach((food) => {
				const servingSize = extractServingSize(food.food_description);
				const btn = contentEl.createEl('button', { 
					text: `${food.food_name} - ${servingSize}`,
					cls: 'macros-modal-button'
				});
				
				btn.onclick = () => {
					this.onSelect(food);
					this.close();
				};
			});
		}
		
		const navDiv = contentEl.createDiv({ cls: 'food-nav' });
		if (this.currentPage > 0) {
			const prevBtn = navDiv.createEl('button', { text: '< Prev' });
			prevBtn.onclick = () => this.loadPage(this.currentPage - 1);
		}
		navDiv.createEl('span', { text: ` Page ${this.currentPage + 1} ` });
		if (this.results.length === this.maxResults) {
			const nextBtn = navDiv.createEl('button', { text: 'Next >' });
			nextBtn.onclick = () => this.loadPage(this.currentPage + 1);
		}
	}

	async onOpen() {
		await this.loadPage(0);
	}
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * AddMealTemplateModal
 * --------------------
 * Provides a modal interface for creating a new meal template.
 *
 * @param plugin - The instance of MacrosPlugin.
 */
export class AddMealTemplateModal extends Modal {
	plugin: MacrosPlugin;
	constructor(plugin: MacrosPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { 
			text: 'New Meal Template',
			cls: 'macros-modal-title'
		});
		
		const nameInput = contentEl.createEl('input', { 
			type: 'text',
			cls: 'macros-modal-input'
		});
		
		nameInput.placeholder = 'Meal Name (e.g., Meal1)';
		const createMeal = async () => {
			const mealName = nameInput.value.trim();
			if (!mealName) {
				new Notice('Please enter a valid meal name.');
				return;
			}
			if (this.plugin.settings.mealTemplates.some((m: MealTemplate) => m.name.toLowerCase() === mealName.toLowerCase())) {
				new Notice('A meal template with that name already exists. Please choose a different name.');
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
		nameInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				createMeal();
			}
		});
		const createBtn = contentEl.createEl('button', { 
			text: 'Create Meal Template',
			cls: 'macros-modal-button'
		});
		
		createBtn.onclick = createMeal;
	}
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * EditMealTemplateModal
 * ---------------------
 * Enables editing of an existing meal template, allowing the user to modify the list of food items.
 *
 * @param plugin - The instance of MacrosPlugin.
 * @param meal - The meal template object being edited.
 */
export class EditMealTemplateModal extends Modal {
	plugin: MacrosPlugin;
	meal: MealTemplate;
	constructor(plugin: MacrosPlugin, meal: MealTemplate) {
		super(plugin.app);
		this.plugin = plugin;
		this.meal = meal;
	}
	renderContent() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { 
			text: `Edit Meal: ${this.meal.name}`,
			cls: 'macros-modal-title'
		});
		
		const itemList = contentEl.createEl('ul', { cls: 'macros-modal-list' });
		this.meal.items.forEach((item, index) => {
			const li = itemList.createEl('li', { cls: 'macros-modal-list-item' });
			li.createEl('span', { text: item, cls: 'macros-modal-item-text' });
			const removeBtn = li.createEl('button', { 
				text: 'Remove',
				cls: 'macros-modal-remove-btn' 
			});
			
			removeBtn.onclick = async () => {
				if (this.meal.items.length <= 1) {
					new Notice('You must have at least 1 food item');
					return;
				}
				this.meal.items.splice(index, 1);
				await this.plugin.saveSettings();
				this.close();
				this.plugin.nutritionalSettingTab.display();
			};
		});
		const addFoodBtn = contentEl.createEl('button', { 
			text: '+ Add Food Item',
			cls: 'macros-modal-button'
		});
		
		addFoodBtn.onclick = () => {
			new AddFoodToMealModal(this.plugin, this.meal).open();
			this.close();
			this.plugin.nutritionalSettingTab.display();
		};
	}
	onOpen() {
		this.renderContent();
	}
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * CustomServingSizeModal
 * ----------------------
 * A modal dialog that allows the user to specify a custom serving size for a selected food item.
 *
 * @param app - The Obsidian application instance.
 * @param foodName - The name of the food item.
 * @param defaultServing - The default serving size value (in grams).
 * @param onSubmit - A callback function that receives the custom serving size.
 */
export class CustomServingSizeModal extends Modal {
	foodName: string;
	defaultServing: number;
	onSubmit: (customServing: number) => void;
	constructor(app: App, foodName: string, defaultServing: number, onSubmit: (customServing: number) => void) {
		super(app);
		this.foodName = foodName;
		this.defaultServing = defaultServing;
		this.onSubmit = onSubmit;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { 
			text: `Custom Serving Size for ${this.foodName}`,
			cls: 'macros-modal-title'
		});
		
		contentEl.createEl('p', { 
			text: `Default serving is ${this.defaultServing}g. Enter a custom serving size in grams:`,
			cls: 'macros-serving-description'
		});
		
		const inputEl = contentEl.createEl('input', { 
			type: 'number',
			cls: 'macros-serving-input'
		});
		
		inputEl.placeholder = `${this.defaultServing}`;
		inputEl.value = `${this.defaultServing}`;
		inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				const value = parseFloat(inputEl.value);
				if (isNaN(value) || value <= 0) {
					new Notice('Please enter a valid serving size.');
				} else {
					this.onSubmit(value);
					this.close();
				}
			}
		});
		const submitBtn = contentEl.createEl('button', { 
			text: 'Submit',
			cls: 'macros-modal-button'
		});
		
		submitBtn.onclick = () => {
			const value = parseFloat(inputEl.value);
			if (isNaN(value) || value <= 0) {
				new Notice('Please enter a valid serving size.');
			} else {
				this.onSubmit(value);
				this.close();
			}
		};
		inputEl.focus();
	}
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * AddFoodToMealModal
 * ------------------
 * Presents a modal that allows the user to add food items to an existing meal template.
 *
 * @param plugin - The instance of MacrosPlugin.
 * @param meal - The meal template to which food will be added.
 */
class AddFoodToMealModal extends Modal {
	plugin: MacrosPlugin;
	meal: MealTemplate;
	files: string[] = [];
	itemListEl: HTMLElement | null = null;
	constructor(plugin: MacrosPlugin, meal: MealTemplate) {
		super(plugin.app);
		this.plugin = plugin;
		this.meal = meal;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { 
			text: `Add Food Items to "${this.meal.name}"`,
			cls: 'macros-modal-title'
		});
		
		const row = contentEl.createDiv({ cls: 'macros-modal-row' });
		const folder = this.plugin.settings.storageFolder;
		const fileList = this.app.vault.getFiles().filter(f => f.path.startsWith(folder));
		this.files = fileList.map(f => f.name.replace(/\.md$/, ''));
		const dropdown = row.createEl('select');
		dropdown.createEl('option', { text: '-- Select Food --', value: '' });
		this.files.forEach(fname => {
			const option = dropdown.createEl('option');
			option.value = fname;
			option.text = fname;
		});
		const addBtn = row.createEl('button', { text: '+ Add Selected Item' });
		addBtn.onclick = async () => {
			const selected = dropdown.value;
			if (selected && !this.meal.items.some(item => item.startsWith(selected))) {
				const matchingFile = findMatchingFoodFile(fileList, selected);
				if (!matchingFile) {
					new Notice('Selected food item not found.');
					return;
				}
				
				const nutrition = processNutritionalData(this.app, matchingFile);
				if (!nutrition || !nutrition.serving) {
					new Notice('No nutritional data available for this item.');
					return;
				}
				
				const defaultServing = parseGrams(nutrition.serving);
				if (isNaN(defaultServing)) {
					new Notice('Invalid default serving size.');
					return;
				}
				
				new CustomServingSizeModal(this.app, selected, defaultServing, async (customServing: number) => {
					this.meal.items.push(`${selected}:${customServing}g`);
					await this.plugin.saveSettings();
					this.refreshItemList();
					new Notice(`${selected} (${customServing}g) added to ${this.meal.name}`);
				}).open();
			} else {
				new Notice('Item is already in the meal or not selected.');
			}
		};

		this.itemListEl = contentEl.createEl('ul', { cls: 'macros-modal-list' });
		this.refreshItemList();

		const finishBtn = contentEl.createEl('button', { 
			text: 'Finish',
			cls: 'macros-modal-button'
		});
		
		finishBtn.onclick = () => {
			this.close();
			this.plugin.nutritionalSettingTab.display();
		};
	}
	private refreshItemList() {
		if (!this.itemListEl) return;
		this.itemListEl.empty();
		this.meal.items.forEach((item, index) => {
			const li = this.itemListEl!.createEl('li', { cls: 'macros-modal-list-item' });
			const span = li.createEl('span', { 
				text: item,
				cls: 'macros-modal-item-text'
			});
			
			const removeBtn = li.createEl('button', { 
				text: '×',
				cls: 'macros-modal-remove-btn'
			});
			
			removeBtn.onclick = async () => {
				this.meal.items.splice(index, 1);
				await this.plugin.saveSettings();
				this.refreshItemList();
				new Notice(`Removed "${item}" from ${this.meal.name}`);
			};
		});
	}
	onClose() {
		this.contentEl.empty();
	}
}
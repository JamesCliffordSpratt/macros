import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { getVaultFolders, renderMacronutrientPieChart } from './utils';
import { AddMealTemplateModal, EditMealTemplateModal } from './modals';
import MacrosPlugin from './main';
import { fetchFoodData } from './api';

/*
 * Plugin Settings for Macros Plugin
 * ---------------------------------------------
 * Defines the settings interface, default values, and the settings UI.
 * Options include:
 *  - Storage folder for food markdown files.
 *  - Color settings for nutritional pie charts.
 *  - Meal templates for grouping food items.
 *  - Advanced: FatSecret API credentials.
 */

export interface MealTemplate {
	// The name of the meal template.
	name: string;
	// List of food file names (without .md) or in the format "FoodName:CustomServingSize"
	items: string[];
}

export interface PluginSettings {
	storageFolder: string;
	proteinColor: string;
	fatColor: string;
	carbsColor: string;
	mealTemplates: MealTemplate[];
	// Advanced API credentials (empty by default; will use the built-in defaults if empty)
	fatSecretApiKey: string;
	fatSecretApiSecret: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	storageFolder: 'Nutrition',
	proteinColor: '#4caf50',
	fatColor: '#f44336',
	carbsColor: '#2196f3',
	mealTemplates: [],
	// Leave these empty by default so that the plugin uses the built-in credentials.
	fatSecretApiKey: '',
	fatSecretApiSecret: '',
};

export class NutritionalSettingTab extends PluginSettingTab {
	plugin: MacrosPlugin;
	constructor(app: App, plugin: MacrosPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Macros Plugin Settings' });

		// Storage Folder Setting.
		new Setting(containerEl)
			.setName('Storage Folder')
			.setDesc('Where to save food .md files')
			.addText(text => {
				text
					.setPlaceholder('Nutrition')
					.setValue(this.plugin.settings.storageFolder)
					.onChange(async (value) => {
						this.plugin.settings.storageFolder = value;
						await this.plugin.saveSettings();
					});
				const dataListEl = containerEl.createEl('datalist', { attr: { id: 'folderSuggestions' } });
				const folders = getVaultFolders(this.plugin.app);
				folders.forEach(folder => {
					dataListEl.createEl('option', { attr: { value: folder } });
				});
				(text.inputEl as HTMLInputElement).setAttribute('list', 'folderSuggestions');
				return text;
			});

		// Protein Color Setting.
		new Setting(containerEl)
			.setName('Protein Color')
			.setDesc('Color code for Protein slice (e.g., #4caf50)')
			.addText(text => {
				text
					.setPlaceholder('#4caf50')
					.setValue(this.plugin.settings.proteinColor)
					.onChange(async (value) => {
						this.plugin.settings.proteinColor = value;
						await this.plugin.saveSettings();
						updatePreview();
					});
				const proteinColorPicker = containerEl.createEl('input', { 
					type: 'color', 
					value: this.plugin.settings.proteinColor,
					cls: 'macros-color-picker'
				});
				
				proteinColorPicker.addEventListener('change', async () => {
					text.setValue(proteinColorPicker.value);
					this.plugin.settings.proteinColor = proteinColorPicker.value;
					await this.plugin.saveSettings();
					updatePreview();
				});
				return text;
			});

		// Fat Color Setting.
		new Setting(containerEl)
			.setName('Fat Color')
			.setDesc('Color code for Fat slice (e.g., #f44336)')
			.addText(text => {
				text
					.setPlaceholder('#f44336')
					.setValue(this.plugin.settings.fatColor)
					.onChange(async (value) => {
						this.plugin.settings.fatColor = value;
						await this.plugin.saveSettings();
						updatePreview();
					});
				const fatColorPicker = containerEl.createEl('input', { 
					type: 'color', 
					value: this.plugin.settings.fatColor,
					cls: 'macros-color-picker'
				});
				
				fatColorPicker.addEventListener('change', async () => {
					text.setValue(fatColorPicker.value);
					this.plugin.settings.fatColor = fatColorPicker.value;
					await this.plugin.saveSettings();
					updatePreview();
				});
				return text;
			});

		// Carbs Color Setting.
		new Setting(containerEl)
			.setName('Carbs Color')
			.setDesc('Color code for Carbs slice (e.g., #2196f3)')
			.addText(text => {
				text
					.setPlaceholder('#2196f3')
					.setValue(this.plugin.settings.carbsColor)
					.onChange(async (value) => {
						this.plugin.settings.carbsColor = value;
						await this.plugin.saveSettings();
						updatePreview();
					});
				const carbsColorPicker = containerEl.createEl('input', { 
					type: 'color', 
					value: this.plugin.settings.carbsColor,
					cls: 'macros-color-picker'
				});
				
				carbsColorPicker.addEventListener('change', async () => {
					text.setValue(carbsColorPicker.value);
					this.plugin.settings.carbsColor = carbsColorPicker.value;
					await this.plugin.saveSettings();
					updatePreview();
				});
				return text;
			});

		// Render a preview of the nutritional pie chart.
		const previewContainer = containerEl.createDiv({ cls: 'macros-preview-container' });
		previewContainer.createEl('h3', { text: 'Pie Chart Preview' });
		const previewCanvas = previewContainer.createEl('canvas', { 
			cls: 'macros-canvas',
			attr: { width: '300', height: '300' } 
		});

		function updatePreview() {
			const proteinInput = containerEl.querySelector('input[placeholder="#4caf50"]') as HTMLInputElement;
			const fatInput = containerEl.querySelector('input[placeholder="#f44336"]') as HTMLInputElement;
			const carbsInput = containerEl.querySelector('input[placeholder="#2196f3"]') as HTMLInputElement;
			const proteinColor = proteinInput?.value || '#4caf50';
			const fatColor = fatInput?.value || '#f44336';
			const carbsColor = carbsInput?.value || '#2196f3';
			const ctx = previewCanvas.getContext('2d');
			if (!ctx) return;
			
			// Use the shared rendering function with equal distribution for preview
			renderMacronutrientPieChart(ctx, 33, 33, 34, proteinColor, fatColor, carbsColor);
		}
		updatePreview();

		// --- Meal Templates Section ---
		containerEl.createEl('h3', { text: 'Meal Templates' });
		new Setting(containerEl)
			.setName('Create a new Meal Template')
			.setDesc('Click to add a new meal template')
			.addButton(btn => {
				btn.setButtonText('+ Add Meal Template').onClick(() => {
					new AddMealTemplateModal(this.plugin).open();
				});
			});
		this.plugin.settings.mealTemplates.forEach((meal) => {
			new Setting(containerEl)
				.setName(meal.name)
				.setDesc(
					meal.items && meal.items.length > 0
						? meal.items.join(', ')
						: 'No items'
				)
			.addButton(editBtn => {
				editBtn
					.setButtonText('Edit')
					.setCta()
					.onClick(() => {
						new EditMealTemplateModal(this.plugin, meal).open();
					});
			})
			.addButton(removeBtn => {
			removeBtn
				.setButtonText('Remove')
				.setWarning()
				.onClick(async () => {this.plugin.settings.mealTemplates =
						this.plugin.settings.mealTemplates.filter(m => m.name !== meal.name);
					await this.plugin.saveSettings();
					// Use a small timeout to allow any active inputs/modals to clean up before re-rendering
					setTimeout(() => this.display(), 300);
				});
			});
		});

		// --- Advanced Settings ---
		containerEl.createEl('h3', { text: 'Advanced' });

		// Notice about API credentials.
		const advancedNotice = containerEl.createDiv({ cls: 'advanced-notice' });
		advancedNotice.createEl('p', {
			text: "The default FatSecret API credentials are provided by the Macros Plugin for convenience. You are welcome to sign up for your own API credentials to ensure longevity if the default key becomes obsolete. To sign up, please visit "
		});
		// Create a clickable link.
		advancedNotice.createEl('a', {
			text: "https://platform.fatsecret.com/platform-api",
			attr: { href: "https://platform.fatsecret.com/platform-api", target: "_blank" }
		});
		advancedNotice.createEl('p', {
			text: "User-provided API credentials will be stored in plain text."
		});

		// FatSecret API Key Setting.
		new Setting(containerEl)
			.setName('FatSecret API Key')
			.setDesc('Enter your FatSecret API Key. Leave blank to use the default provided by the Macros Plugin.')
			.addText(text => {
				// Leave the text box value empty if no user input exists.
				text
					.setPlaceholder(`Default API`)
					.setValue(this.plugin.settings.fatSecretApiKey)
					.onChange(async (value) => {
						this.plugin.settings.fatSecretApiKey = value; // empty value means default
						await this.plugin.saveSettings();
					});
				return text;
			});

		// FatSecret API Secret Setting.
		new Setting(containerEl)
			.setName('FatSecret API Secret')
			.setDesc('Enter your FatSecret API Secret. Leave blank to use the default provided by the Macros Plugin.')
			.addText(text => {
				text
					.setPlaceholder(`Default API`)
					.setValue(this.plugin.settings.fatSecretApiSecret)
					.onChange(async (value) => {
						this.plugin.settings.fatSecretApiSecret = value;
						await this.plugin.saveSettings();
					});
				return text;
			});
		// Advanced Settings: Test API Connection Button
		new Setting(containerEl)
		  .setName('Test API Connection')
		  .setDesc('Click to test your current FatSecret API credentials.')
		  .addButton(button => {
		    button
		      .setButtonText('Test Connection')
		      .onClick(async () => {
		        const key =
		          this.plugin.settings.fatSecretApiKey && this.plugin.settings.fatSecretApiKey.trim() !== ""
		            ? this.plugin.settings.fatSecretApiKey.trim()
		            : this.plugin.getDefaultApiKey();
		        const secret =
		          this.plugin.settings.fatSecretApiSecret && this.plugin.settings.fatSecretApiSecret.trim() !== ""
		            ? this.plugin.settings.fatSecretApiSecret.trim()
		            : this.plugin.getDefaultApiSecret();

		        new Notice('Testing connection…');

		        try {
		          // Use a common food search term as a test
		          const results = await fetchFoodData(this.plugin.app, "apple", 0, 1, key, secret);
		          // Check if the results array has at least one item.
		          if (results.length > 0) {
		            new Notice('Test connection successful!');
		          } else {
		            new Notice('Test connection failed. No data returned. Please check your API credentials.');
		          }
		        } catch (error) {
		          console.error('Error during test connection:', error);
		          new Notice('Test connection failed. Please check your API credentials.');
		        }
		      });
		  });
	}
}
import { App, PluginSettingTab, Setting, Notice, normalizePath } from 'obsidian';
import { ChartLoader } from '../utils/ChartLoader';
import MacrosPlugin from '../main';
import { AddMealTemplateModal, EditMealTemplateModal } from '../ui';
import { fetchFoodData } from '../core/api';
import { FolderSuggest } from '../utils/FolderSuggest';
import type { Chart } from 'chart.js';
import { DEFAULT_SETTINGS } from './settingsSchema';
export { DEFAULT_SETTINGS };

// Export interfaces and default settings
export interface MealTemplate {
	name: string;
	items: string[];
}

export interface PluginSettings {
	storageFolder: string;
	proteinColor: string;
	fatColor: string;
	carbsColor: string;
	mealTemplates: MealTemplate[];
	fatSecretApiKey: string;
	fatSecretApiSecret: string;
	dailyCaloriesTarget: number;
	dailyProteinTarget: number;
	dailyFatTarget: number;
	dailyCarbsTarget: number;
	showSummaryRows: boolean;
	disableTooltips: boolean;
	showCellPercentages: boolean;
	developerModeEnabled: boolean;
	uiCollapseStates?: Record<string, boolean>;
}

export class NutritionalSettingTab extends PluginSettingTab {
	plugin: MacrosPlugin;
	private previewChart: Chart | null = null;
	private chartId = 'settings-preview-chart'; // Added unique ID for chart tracking

	constructor(app: App, plugin: MacrosPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// =======================================
		// STORAGE
		// =======================================
		new Setting(containerEl).setName('📁 Storage').setHeading();

		// Storage Folder Setting with FolderSuggest
		const folderSetting = new Setting(containerEl)
			.setName('Storage folder')
			.setDesc('Where to save food .md files with nutrition data');

		// Create the input element
		const folderInputEl = folderSetting.controlEl.createEl('input', {
			type: 'text',
			cls: 'folder-input-field',
			value: this.plugin.settings.storageFolder,
		});

		// Initialize FolderSuggest with the input element
		const folderSuggest = new FolderSuggest(this.app, folderInputEl, 'Nutrition');

		// Add change handler
		folderInputEl.addEventListener('change', async () => {
			this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);
			await this.plugin.saveSettings();
		});

		// Add blur handler to ensure the value is saved when focus is lost
		folderInputEl.addEventListener('blur', async () => {
			this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);
			await this.plugin.saveSettings();
		});

		// =======================================
		// NUTRITION TARGETS
		// =======================================
		new Setting(containerEl).setName('🎯 Daily nutrition targets').setHeading();

		new Setting(containerEl)
			.setName('Daily calorie target')
			.setDesc('Your daily calorie goal in kcal')
			.addText((text) => {
				text
					.setValue(this.plugin.settings.dailyCaloriesTarget.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.dailyCaloriesTarget = numValue;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName('Daily protein target')
			.setDesc('Your daily protein goal in grams')
			.addText((text) => {
				text
					.setValue(this.plugin.settings.dailyProteinTarget.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.dailyProteinTarget = numValue;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName('Daily fat target')
			.setDesc('Your daily fat goal in grams')
			.addText((text) => {
				text.setValue(this.plugin.settings.dailyFatTarget.toString()).onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.dailyFatTarget = numValue;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName('Daily carbs target')
			.setDesc('Your daily carbohydrates goal in grams')
			.addText((text) => {
				text.setValue(this.plugin.settings.dailyCarbsTarget.toString()).onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.dailyCarbsTarget = numValue;
						await this.plugin.saveSettings();
					}
				});
			});

		// =======================================
		// DISPLAY
		// =======================================
		new Setting(containerEl).setName('⚙️ Display').setHeading();

		new Setting(containerEl)
			.setName('Show macros summary rows')
			.setDesc(
				'Toggle whether to display the totals, targets, and remaining rows in the macros table.'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showSummaryRows).onChange(async (value) => {
					this.plugin.settings.showSummaryRows = value;
					await this.plugin.saveSettings();
					this.plugin.refreshMacrosTables?.();
				})
			);

		new Setting(containerEl)
			.setName('Disable tooltips')
			.setDesc('Turn off all hover tooltips in macros tables for a cleaner interface.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.disableTooltips).onChange(async (value) => {
					this.plugin.settings.disableTooltips = value;
					await this.plugin.saveSettings();
					this.plugin.refreshMacrosTables?.();
				})
			);

		new Setting(containerEl)
			.setName('Show cell percentages')
			.setDesc('Display percentage values inside macro cells in tables.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showCellPercentages).onChange(async (value) => {
					this.plugin.settings.showCellPercentages = value;
					await this.plugin.saveSettings();
					this.plugin.refreshMacrosTables?.();
				})
			);

		// =======================================
		// PIE CHART CUSTOMIZATION
		// =======================================
		new Setting(containerEl).setName('📊 Pie chart customization').setHeading();

		// Protein Color Setting
		new Setting(containerEl)
			.setName('Protein color')
			.setDesc('Color for protein slice in the pie chart')
			.addColorPicker((colorPicker) => {
				colorPicker.setValue(this.plugin.settings.proteinColor).onChange(async (value) => {
					this.plugin.settings.proteinColor = value;
					await this.plugin.saveSettings();
					this.updateChartPreview();
				});
				return colorPicker;
			});

		// Fat Color Setting
		new Setting(containerEl)
			.setName('Fat color')
			.setDesc('Color for fat slice in the pie chart')
			.addColorPicker((colorPicker) => {
				colorPicker.setValue(this.plugin.settings.fatColor).onChange(async (value) => {
					this.plugin.settings.fatColor = value;
					await this.plugin.saveSettings();
					this.updateChartPreview();
				});
				return colorPicker;
			});

		// Carbs Color Setting
		new Setting(containerEl)
			.setName('Carbs color')
			.setDesc('Color for carbs slice in the pie chart')
			.addColorPicker((colorPicker) => {
				colorPicker.setValue(this.plugin.settings.carbsColor).onChange(async (value) => {
					this.plugin.settings.carbsColor = value;
					await this.plugin.saveSettings();
					this.updateChartPreview();
				});
				return colorPicker;
			});

		const previewContainer = containerEl.createDiv({ cls: 'macrospc-preview-container' });
		new Setting(previewContainer).setName('Pie chart preview').setHeading();

		// Create canvas with explicit dimensions
		const previewCanvas = previewContainer.createEl('canvas');
		previewCanvas.width = 300; // Set native canvas width (not CSS width)
		previewCanvas.height = 300; // Set native canvas height
		previewCanvas.id = this.chartId; // Set ID for Chart.js tracking

		setTimeout(() => {
			// Initialize the chart preview (async)
			this.initChartPreview(previewCanvas);
		}, 50);

		// Initialize the chart preview (async)
		this.initChartPreview(previewCanvas);

		// =======================================
		// MEAL TEMPLATES
		// =======================================
		new Setting(containerEl).setName('🍽️ Meal templates').setHeading();

		// Add brief description of what meal templates are
		containerEl.createEl('p', {
			text: 'Create reusable meal templates that can be quickly added to your macro tracking.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Create a new meal template')
			.setDesc('Create a new set of food items that you often eat together')
			.addButton((btn) => {
				btn.setButtonText('+ Add meal template').onClick(() => {
					new AddMealTemplateModal(this.plugin).open();
				});
			});

		if (this.plugin.settings.mealTemplates.length === 0) {
			containerEl.createEl('div', {
				text: 'No meal templates yet. Create one using the button above.',
				cls: 'no-templates-message',
			});
		} else {
			const templateContainer = containerEl.createDiv({ cls: 'meal-templates-container' });
			this.plugin.settings.mealTemplates.forEach((meal) => {
				new Setting(templateContainer)
					.setName(meal.name)
					.setDesc(meal.items?.length > 0 ? meal.items.join(', ') : 'No items')
					.addButton((editBtn) => {
						editBtn
							.setButtonText('Edit')
							.setCta()
							.onClick(() => {
								new EditMealTemplateModal(this.plugin, meal).open();
							});
					})
					.addButton((removeBtn) => {
						removeBtn
							.setButtonText('Remove')
							.setWarning()
							.onClick(async () => {
								this.plugin.settings.mealTemplates = this.plugin.settings.mealTemplates.filter(
									(m) => m.name !== meal.name
								);
								await this.plugin.saveSettings();
								setTimeout(() => this.display(), 300);
							});
					});
			});
		}

		// =======================================
		// API (REQUIRED)
		// =======================================
		new Setting(containerEl).setName('🔌 API configuration (required)').setHeading();

		const apiNotice = containerEl.createDiv({ cls: 'macrospc-api-notice' });
		apiNotice.createEl('p', {
			text: 'To use the food search functionality, you must sign up for free FatSecret API credentials. This plugin does not include default API keys.',
		});

		apiNotice.createEl('p', {
			text: 'Sign up for free API credentials at:',
		});

		apiNotice.createEl('a', {
			text: 'https://platform.fatsecret.com/platform-api',
			attr: { href: 'https://platform.fatsecret.com/platform-api', target: '_blank' },
		});

		apiNotice.createEl('p', {
			text: 'Your API credentials will be stored securely in your vault settings.',
			cls: 'note-text',
		});

		// Check if credentials are configured
		const hasCredentials = this.plugin.apiService.hasApiCredentials();
		
		if (!hasCredentials) {
			const warningDiv = containerEl.createDiv({ 
				cls: 'setting-item-description api-credentials-warning' 
			});
			warningDiv.createEl('p', {
				text: '⚠️ API credentials not configured. Food search will not work until you add your credentials.',
			});
		} else {
			const successDiv = containerEl.createDiv({ 
				cls: 'setting-item-description api-credentials-success' 
			});
			successDiv.createEl('p', {
				text: '✅ API credentials configured successfully.',
			});
		}

		new Setting(containerEl)
			.setName('FatSecret API key')
			.setDesc('Your fatSecret API key (required for food search functionality)')
			.addText((text) => {
				text
					.setPlaceholder('Enter your API key here')
					.setValue(this.plugin.settings.fatSecretApiKey)
					.onChange(async (value) => {
						this.plugin.settings.fatSecretApiKey = value;
						await this.plugin.saveSettings();
						// Refresh the settings display to update the status
						setTimeout(() => this.display(), 100);
					});
			});

		new Setting(containerEl)
			.setName('FatSecret API secret')
			.setDesc('Your fatsecret API secret (required for food search functionality)')
			.addText((text) => {
				text
					.setPlaceholder('Enter your API secret here')
					.setValue(this.plugin.settings.fatSecretApiSecret)
					.onChange(async (value) => {
						this.plugin.settings.fatSecretApiSecret = value;
						await this.plugin.saveSettings();
						// Refresh the settings display to update the status
						setTimeout(() => this.display(), 100);
					});
			});

		// And update the test connection section to handle missing credentials:
		new Setting(containerEl)
			.setName('Test API connection')
			.setDesc('Click to test your FatSecret API credentials.')
			.addButton((button) => {
				button.setButtonText('Test Connection').onClick(async () => {
					try {
						// Check if credentials are configured
						const credentials = this.plugin.apiService.getCredentialsSafe();
						if (!credentials) {
							new Notice('Please configure your API credentials first.');
							return;
						}

						new Notice('Testing connection…');
						const results = await fetchFoodData(this.plugin.app, 'apple', 0, 1, credentials.key, credentials.secret);
						if (results.length > 0) {
							new Notice('Test connection successful!');
						} else {
							new Notice('Test connection failed. No data returned. Please check your API credentials.');
						}
					} catch (error) {
						this.plugin.logger.error('Error during test connection:', error);
						new Notice('Test connection failed. Please check your API credentials.');
					}
				});
			});

		// =======================================
		// DEVELOPER MODE
		// =======================================
		new Setting(containerEl).setName('🔧 Developer mode').setHeading();

		new Setting(containerEl)
			.setName('Enable developer mode')
			.setDesc(
				'Enables debug logging and developer commands. Only use if you need to troubleshoot the plugin.'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.developerModeEnabled).onChange(async (value) => {
					this.plugin.settings.developerModeEnabled = value;
					await this.plugin.saveSettings();

					// Update logger debug mode instantly
					this.plugin.logger.setDebugMode(value);

					// Show a notice informing the user that they need to restart Obsidian
					// to see the command in the command palette
					new Notice(
						`Developer mode ${value ? 'enabled' : 'disabled'}. Restart Obsidian to apply all changes.`
					);
				})
			);

		// Only show additional developer settings if developer mode is enabled
		if (this.plugin.settings.developerModeEnabled) {
			containerEl.createEl('p', {
				text: 'Developer mode is active. Additional developer commands are available in the command palette.',
				cls: 'setting-item-description',
			});
		}
	}

	/**
	 * Initialize the Chart.js preview chart
	 */
	async initChartPreview(canvas: HTMLCanvasElement): Promise<void> {
		try {
			// Get ChartLoader instance
			const chartLoader = ChartLoader.getInstance();

			// Make sure no chart exists with this ID before creating a new one
			if (this.previewChart) {
				chartLoader.destroyChart(this.chartId);
				this.previewChart = null;
			}

			// Ensure Chart.js is loaded using ChartLoader
			await chartLoader.loadChart();

			// Initialize the chart
			this.updateChartPreview(canvas);
		} catch (error) {
			console.error('Error initializing chart preview:', error);

			// Fallback to simple preview if Chart.js fails to load
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
				ctx.fillRect(0, 0, canvas.width, canvas.height);

				ctx.fillStyle = '#333';
				ctx.font = '14px sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText('Chart preview unavailable', canvas.width / 2, canvas.height / 2);
			}
		}
	}

	/**
	 * Update the Chart.js preview with current settings
	 */
	updateChartPreview(canvas?: HTMLCanvasElement): void {
		// If we already have a canvas reference, use that, otherwise find it in the DOM
		if (!canvas && this.previewChart) {
			canvas = this.previewChart.canvas;
		}

		if (!canvas) {
			const canvasEl = this.containerEl.querySelector('.macrospc-preview-container canvas');
			if (!canvasEl) {
				console.error('Cannot find preview canvas');
				return;
			}
			canvas = canvasEl as HTMLCanvasElement;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Get current colors from settings
		const proteinColor = this.plugin.settings.proteinColor;
		const fatColor = this.plugin.settings.fatColor;
		const carbsColor = this.plugin.settings.carbsColor;

		// If we already have a chart, update its colors
		if (this.previewChart) {
			this.previewChart.data.datasets[0].backgroundColor = [proteinColor, fatColor, carbsColor];
			this.previewChart.update();
			return;
		}

		canvas.addClass('settings-preview-canvas');

		// Use the centralized chart creation method from ChartManager
		try {
			this.previewChart = this.plugin.chartManager.createPieChart(
				ctx,
				this.chartId,
				[33, 33, 34], // Example data (evenly distributed)
				['Protein', 'Fat', 'Carbs'],
				[proteinColor, fatColor, carbsColor]
			);

			// Override some options for the settings preview
			if (this.previewChart.options && this.previewChart.options.plugins) {
				// Enable legend for the preview chart
				if (this.previewChart.options.plugins.legend) {
					this.previewChart.options.plugins.legend.display = true;
					this.previewChart.options.plugins.legend.position = 'bottom';

					if (this.previewChart.options.plugins.legend.labels) {
						this.previewChart.options.plugins.legend.labels.padding = 15;
						this.previewChart.options.plugins.legend.labels.usePointStyle = true;
						// @ts-ignore - pointStyle exists but might not be in your types
						this.previewChart.options.plugins.legend.labels.pointStyle = 'circle';
					}
				}

				// Update tooltip formatting
				if (
					this.previewChart.options.plugins.tooltip &&
					this.previewChart.options.plugins.tooltip.callbacks
				) {
					this.previewChart.options.plugins.tooltip.callbacks.label = function (context) {
						const label = context.label || '';
						const value = (context.raw as number) || 0;
						return `${label}: ${value}%`;
					};
				}
			}

			// Apply the changes
			this.previewChart.update();
		} catch (error) {
			console.error('Error creating preview chart:', error);
		}
	}

	/**
	 * Clean up when the settings tab is hidden
	 */
	hide(): void {
		// Clean up chart instance if it exists
		if (this.previewChart) {
			// Use the ChartLoader to destroy the chart
			const chartLoader = ChartLoader.getInstance();
			chartLoader.destroyChart(this.chartId);
			this.previewChart = null;
		}

		super.hide();
	}
}

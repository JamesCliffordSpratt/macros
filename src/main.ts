import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, MarkdownView, TFolder, TFile } from 'obsidian';
import * as CryptoJS from 'crypto-js';
import { 
	getVaultFolders, 
	mergeMacroLines, 
	extractServingSize, 
	extractNutritionalData, 
	parseGrams, 
	processNutritionalData, 
	renderMacronutrientPieChart, 
	createPieChartLegend,
	normalizeName,
	NutritionData
} from './utils';
import { fetchFoodData, FoodItem } from './api';
import { FoodSearchModal, FoodResultsModal, AddToMacrosModal } from './modals';
import { NutritionalSettingTab, PluginSettings, DEFAULT_SETTINGS, MealTemplate } from './settings';

/*
 * Macros Plugin
 * -------------------------
 * This plugin integrates nutritional data fetching and processing into Obsidian.
 * It handles API communication with FatSecret, file caching, sequential updates, 
 * and custom markdown processing for nutritional calculations.
 *
 * Architecture Overview:
 * - main.ts: Core plugin initialization, event registration, and acting as the central hub.
 * - modals.ts: User interface components (dialogs/modals) for various interactions.
 * - processors.ts: Custom markdown code block processors for rendering nutritional data.
 * - settings.ts: Plugin settings and the settings UI.
 * - utils.ts: Helper functions for data parsing, merging, and extraction.
 * - api.ts: External API integration using OAuth (FatSecret API).
 *
 * NOTE on API Credentials:
 * These API credentials are encoded (using Base64) to obfuscate the plain-text values
 * in the source code. FatSecret has permitted these credentials for open-source usage in
 * this free plugin. While this method adds a minor barrier against casual inspection,
 * it is not equivalent to full encryption.
 */

// @ts-ignore
const OAuth = require('oauth-1.0a');

// Encoded credentials, decoded at runtime.
const ENCODED_API_KEY = 'NDQzMGMzYzgyOGMwNDkwN2JjOGI1NTk0MTg0MzU2NzM=';
const ENCODED_API_SECRET = 'M2MxNjQyZjE5ZjhhNDU2Njg0ZDlmNGQ0Njc0NjYxOTQ=';

function decodeCredential(encoded: string): string {
	return Buffer.from(encoded, 'base64').toString('utf8').trim();
}

const FAT_SECRET_API_KEY = decodeCredential(ENCODED_API_KEY);
const FAT_SECRET_API_SECRET = decodeCredential(ENCODED_API_SECRET);

// Constant used for interactive lines in macros blocks.
const INTERACTIVE_PREFIX = "interactive:";

export default class MacrosPlugin extends Plugin {
	settings!: PluginSettings;
	nutritionalSettingTab!: NutritionalSettingTab;

	// Holds additional interactive macros lines per table id.
	additionalMacros: Map<string, string[]> = new Map();
	// Global map to store macros table data by unique id.
	macroTables: Map<string, string[]> = new Map();
	// Map of macrospc (pie-chart) container elements by macro id.
	macrospcContainers: Map<string, Set<HTMLElement>> = new Map();
	// Set to store macroscalc container elements.
	macrocalcContainers: Set<HTMLElement> = new Set();

	// --- CONCURRENCY LOCK: A simple update mutex to serialize file modifications ---
	private updateMutex: Promise<void> = Promise.resolve();

	// --- FILE CACHE: Cache mapping from folder path to list of files ---
	private fileCache: Map<string, TFile[]> = new Map();

	public getDefaultApiKey(): string {
		return FAT_SECRET_API_KEY;
	}

	public getDefaultApiSecret(): string {
		return FAT_SECRET_API_SECRET;
	}

	/**
	 * Returns the list of files in the given folder, using a cache for performance.
	 */
	getFilesInFolder(folder: string): TFile[] {
		const cached = this.fileCache.get(folder);
		if (cached !== undefined) return cached;
		const allFiles = this.app.vault.getFiles();
		const filtered = allFiles.filter(f => f.path.startsWith(folder));
		this.fileCache.set(folder, filtered);
		return filtered;
	}

	/**
	 * Invalidates the file cache. Call this on file modifications.
	 */
	invalidateFileCache(): void {
		this.fileCache.clear();
	}

	/**
	 * Enqueues an update function to serialize file modifications.
	 * Uses a promise-based mutex (updateMutex) to prevent race conditions.
	 * @param updateFn A function that returns a Promise<void> with the update logic.
	 * @returns A Promise that resolves when the queued update has completed.
	 */
	private queueUpdate(updateFn: () => Promise<void>): Promise<void> {
		const timeoutPromise = new Promise<void>((_resolve, reject) => {
			setTimeout(() => reject(new Error("Update timed out")), 30000);
		});
		this.updateMutex = this.updateMutex.then(() =>
			Promise.race([updateFn(), timeoutPromise]).catch((error) => {
				console.error("Error during queued update (or update timed out):", error);
			})
		);
		return this.updateMutex;
	}

	/**
	 * Creates a reusable callback function for handling selected food items
	 */
	createFoodItemCallback() {
		return async (selectedFood: FoodItem) => {
			const servingSize = extractServingSize(selectedFood.food_description);
			const nutritionalData = extractNutritionalData(selectedFood.food_description);
			const fileName = `${selectedFood.food_name}.md`;
			const frontmatter = `---
calories: ${nutritionalData.calories}
protein: ${nutritionalData.protein}
fat: ${nutritionalData.fat}
carbs: ${nutritionalData.carbs}
serving_size: ${servingSize}
---\n`;
			try {
				await this.app.vault.create(`${this.settings.storageFolder}/${fileName}`, frontmatter);
				new Notice(`Saved ${fileName}`);
			} catch (error) {
				console.error('Error creating food file:', error);
				new Notice(`Error saving ${fileName}`);
			}
		};
	}

	async onload() {
		await this.loadSettings();
		this.nutritionalSettingTab = new NutritionalSettingTab(this.app, this);
		this.addSettingTab(this.nutritionalSettingTab);

		// Invalidate file cache on file modifications.
		this.registerEvent(this.app.vault.on('modify', () => this.invalidateFileCache()));
		this.registerEvent(this.app.vault.on('create', () => this.invalidateFileCache()));
		this.registerEvent(this.app.vault.on('delete', () => this.invalidateFileCache()));
		this.registerEvent(this.app.vault.on('rename', () => this.invalidateFileCache()));

		// Ribbon icon opens the Food Search modal.
		this.addRibbonIcon('apple', 'Search for Food (FatSecret)', () => {
			new FoodSearchModal(this.app, (searchTerm: string) => {
				// Use user provided API credentials if available; otherwise, fallback to defaults.
				const apiKey = this.settings.fatSecretApiKey && this.settings.fatSecretApiKey.trim() !== ""
					? this.settings.fatSecretApiKey.trim()
					: FAT_SECRET_API_KEY;
				const apiSecret = this.settings.fatSecretApiSecret && this.settings.fatSecretApiSecret.trim() !== ""
					? this.settings.fatSecretApiSecret.trim()
					: FAT_SECRET_API_SECRET;

				new FoodResultsModal(
					this.app,
					searchTerm,
					apiKey,
					apiSecret,
					this.createFoodItemCallback()
				).open();
			}).open();
		});

		// Register a command to search for food.
		this.addCommand({
			id: 'search-food',
			name: 'Search for Food (FatSecret)',
			callback: () => {
				new FoodSearchModal(this.app, (searchTerm: string) => {
					// Retrieve API credentials from settings, falling back if necessary.
					const apiKey = this.settings.fatSecretApiKey && this.settings.fatSecretApiKey.trim() !== ""
						? this.settings.fatSecretApiKey.trim()
						: FAT_SECRET_API_KEY;
					const apiSecret = this.settings.fatSecretApiSecret && this.settings.fatSecretApiSecret.trim() !== ""
						? this.settings.fatSecretApiSecret.trim()
						: FAT_SECRET_API_SECRET;

					new FoodResultsModal(
						this.app,
						searchTerm,
						apiKey,
						apiSecret,
						this.createFoodItemCallback()
					).open();
				}).open();
			},
		});

		// REGISTER MARKDOWN CODE-BLOCK PROCESSORS FROM processors.ts
		import('./processors').then(module => {
			module.registerProcessors(this);
		});
	}

	/**
	 * Renders a pie chart representing the macronutrient breakdown for a given macros table.
	 * @param id The table identifier.
	 * @param el The HTML element in which to render the chart.
	 */
	drawMacrospc(id: string, el: HTMLElement) {
		el.empty();
		const canvas = el.createEl('canvas', { attr: { width: '300', height: '300' } });
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			el.createEl('div', { text: 'Error: Unable to get canvas context.' });
			return;
		}
		if (this.macroTables.has(id)) {
			const macroLines = this.macroTables.get(id)!;
			let totalProtein = 0;
			let totalFat = 0;
			let totalCarbs = 0;
			
			// Process each line of the macros table
			macroLines.forEach(line => {
				if (line.toLowerCase().startsWith('meal:')) {
					// Extract meal name and count if present
					const fullMealText = line.substring(5).trim();
					let mealName = fullMealText;
					let count = 1;
					
					// Check if there's a count indicator
					const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
					if (countMatch) {
						mealName = countMatch[1];
						count = parseInt(countMatch[2]);
					}
					
					const meal = this.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
					if (!meal) return;
					
					meal.items.forEach((item: string) => {
						let foodQuery = item;
						let specifiedQuantity: number | null = null;
						
						if (item.includes(':')) {
							const parts = item.split(':').map(s => s.trim());
							foodQuery = parts[0];
							specifiedQuantity = parseGrams(parts[1]);
							
							// Apply multiplier if count > 1
							if (count > 1 && specifiedQuantity !== null) {
								specifiedQuantity = specifiedQuantity * count;
							}
						}
						
						// Process the food item and get its nutritional data
						const matchingFile = this.findFoodFile(foodQuery);
						if (!matchingFile) return;
						
						const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
						if (!nutrition) return;
						
						totalProtein += nutrition.protein;
						totalFat += nutrition.fat;
						totalCarbs += nutrition.carbs;
					});
				} else {
					let foodQuery = line;
					let specifiedQuantity: number | null = null;
					
					if (line.includes(':')) {
						const parts = line.split(':').map(s => s.trim());
						foodQuery = parts[0];
						specifiedQuantity = parseGrams(parts[1]);
					}
					
					// Process the food item and get its nutritional data
					const matchingFile = this.findFoodFile(foodQuery);
					if (!matchingFile) return;
					
					const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
					if (!nutrition) return;
					
					totalProtein += nutrition.protein;
					totalFat += nutrition.fat;
					totalCarbs += nutrition.carbs;
				}
			});
			
			const sumMacros = totalProtein + totalFat + totalCarbs;
			if (sumMacros <= 0) {
				el.createEl('div', { text: `No macros found for ID: ${id}` });
				return;
			}
			
			// Render the pie chart
			const proteinColor = this.settings.proteinColor;
			const fatColor = this.settings.fatColor;
			const carbsColor = this.settings.carbsColor;
			
			const slices = [
				{ label: 'Protein', value: totalProtein, color: proteinColor },
				{ label: 'Fat', value: totalFat, color: fatColor },
				{ label: 'Carbs', value: totalCarbs, color: carbsColor },
			];
			
			const success = renderMacronutrientPieChart(ctx, totalProtein, totalFat, totalCarbs, 
				proteinColor, fatColor, carbsColor);
				
			if (!success) {
				el.createEl('div', { text: `No valid macronutrient data found for ID: ${id}` });
				return;
			}
			
			// Create the legend
			createPieChartLegend(el, slices);
		} else {
			el.createEl('div', { text: 'No macro table found for the given id.' });
		}
	}
	
	/**
	 * Helper method to find a food file in the storage folder
	 */
	private findFoodFile(foodQuery: string): TFile | null {
		const folder = this.settings.storageFolder;
		const files = this.getFilesInFolder(folder);
		const file = files.find(f => normalizeName(f.name.replace(/\.md$/, '')) === normalizeName(foodQuery));
		return file || null; // Convert undefined to null
	}

	/**
	 * Draws a combined pie chart from multiple macro table IDs.
	 * @param ids An array of table IDs.
	 * @param el The HTML element in which to render the chart.
	 */
	drawCombinedMacrospc(ids: string[], el: HTMLElement) {
		el.empty();
		const canvas = el.createEl('canvas', { attr: { width: '300', height: '300' } });
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			el.createEl('div', { text: 'Error: Unable to get canvas context.' });
			return;
		}

		let totalProtein = 0;
		let totalFat = 0;
		let totalCarbs = 0;

		// Process each macro table ID
		ids.forEach(id => {
			const macroLines = this.macroTables.get(id);
			if (!macroLines) return;
			
			macroLines.forEach(line => {
				if (line.toLowerCase().startsWith('meal:')) {
					// Extract meal name and count if present
					const fullMealText = line.substring(5).trim();
					let mealName = fullMealText;
					let count = 1;
					
					// Check if there's a count indicator
					const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
					if (countMatch) {
						mealName = countMatch[1];
						count = parseInt(countMatch[2]);
					}
					
					const meal = this.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
					if (!meal) return;
					
					meal.items.forEach(item => {
						let foodQuery = item;
						let specifiedQuantity: number | null = null;
						
						if (item.includes(':')) {
							const parts = item.split(':').map(s => s.trim());
							foodQuery = parts[0];
							specifiedQuantity = parseGrams(parts[1]);
							
							// Apply multiplier if count > 1
							if (count > 1 && specifiedQuantity !== null) {
								specifiedQuantity = specifiedQuantity * count;
							}
						}
						
						// Process the food item and get its nutritional data
						const matchingFile = this.findFoodFile(foodQuery);
						if (!matchingFile) return;
						
						const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
						if (!nutrition) return;
						
						totalProtein += nutrition.protein;
						totalFat += nutrition.fat;
						totalCarbs += nutrition.carbs;
					});
				} else {
					let foodQuery = line;
					let specifiedQuantity: number | null = null;
					
					if (line.includes(':')) {
						const parts = line.split(':').map(s => s.trim());
						foodQuery = parts[0];
						specifiedQuantity = parseGrams(parts[1]);
					}
					
					// Process the food item and get its nutritional data
					const matchingFile = this.findFoodFile(foodQuery);
					if (!matchingFile) return;
					
					const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
					if (!nutrition) return;
					
					totalProtein += nutrition.protein;
					totalFat += nutrition.fat;
					totalCarbs += nutrition.carbs;
				}
			});
		});

		const sumMacros = totalProtein + totalFat + totalCarbs;
		if (sumMacros <= 0) {
			el.createEl('div', { text: `No macros found for the specified IDs: ${ids.join(", ")}` });
			return;
		}

		// Render the pie chart
		const proteinColor = this.settings.proteinColor;
		const fatColor = this.settings.fatColor;
		const carbsColor = this.settings.carbsColor;
		
		const slices = [
			{ label: 'Protein', value: totalProtein, color: proteinColor },
			{ label: 'Fat', value: totalFat, color: fatColor },
			{ label: 'Carbs', value: totalCarbs, color: carbsColor },
		];

		const success = renderMacronutrientPieChart(ctx, totalProtein, totalFat, totalCarbs, 
			proteinColor, fatColor, carbsColor);
			
		if (!success) {
			el.createEl('div', { text: `No valid macronutrient data found for the specified IDs: ${ids.join(", ")}` });
			return;
		}
		
		// Create the legend
		createPieChartLegend(el, slices);
	}

	/**
	 * Loads the macros table from the vault by searching markdown files.
	 * Filters out bullet points to ensure proper merging.
	 * @param id The macros table identifier.
	 * @returns A Promise resolving to an array of macro line strings or null if not found.
	 */
	async loadMacroTableFromVault(id: string): Promise<string[] | null> {
		const mdFiles = this.app.vault.getFiles().filter(file => file.extension === 'md');
		const regex = new RegExp("```\\s*macros\\s+id:\\s*" + id + "\\s*\\n([\\s\\S]*?)```", "m");
		for (const file of mdFiles) {
			try {
				const content = await this.app.vault.read(file);
				const match = content.match(regex);
				if (match) {
					// Filter out the bullet points
					const tableLines = match[1].split("\n")
						.map(line => line.trim())
						.filter(line => line !== '' && !line.startsWith('-'));
						
					console.log(`Loading macroTable for id ${id}:`, tableLines);
					return tableLines;
				}
			} catch (error) {
				console.error(`Error reading file ${file.path} for macros table:`, error);
			}
		}
		return null;
	}

	/**
	 * Updates the global macro table cache by parsing macros blocks from the provided content.
	 * Only stores non-bullet-point lines to ensure proper merging.
	 * @param content The full file content to search for macros blocks.
	 */
	updateGlobalMacroTableFromContent(content: string) {
		console.log("updateGlobalMacroTableFromContent called");
		try {
			const regex = /```[\t ]*macros[\t ]+id:[\t ]*(\S+)[\t ]*\n([\s\S]*?)```/g;
			let match;
			let updated = false;
			while ((match = regex.exec(content)) !== null) {
				const id = match[1];
				// Filter out the bullet points when storing in the macro tables
				const blockContent = match[2].trim().split("\n")
					.map(l => l.trim())
					.filter(l => l !== '' && !l.startsWith('-'));
					
				console.log(`Updating macroTables for id ${id} with ${blockContent.length} lines:`, blockContent);
				
				this.macroTables.set(id, blockContent);
				updated = true;
			}
			
			// If we updated any tables, log that for debugging
			if (updated) {
				console.log("macroTables updated successfully");
				
				// Debug: log the content of all tables
				for (const [id, lines] of this.macroTables.entries()) {
					console.log(`Current macroTable[${id}]:`, lines);
				}
			}
		} catch (error) {
			console.error("Error updating global macro table from content:", error);
		}
	}

	/**
	 * Updates the macros code block in the active file by merging static and interactive lines.
	 * Also refreshes global macro tables and triggers re-rendering of markdown views.
	 */
	async updateMacrosCodeBlock() {
		console.log("updateMacrosCodeBlock called");
		await this.queueUpdate(async () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) return;
			try {
				let content = await this.app.vault.read(activeFile);
				const regex = /```macros\s+id:\s*(\S+)\s*([\s\S]*?)```/g;
				let newContent = content.replace(regex, (match, id, blockContent) => {
					console.log(`Processing block with id ${id}`);
					
					// First, collect all lines including removing interactive prefix
					let allLines: string[] = [];

					// Process existing content in the block (ignoring bullet points)
					const staticLines = blockContent.split("\n")
						.map((l: string) => l.trim())
						.filter((l: string) => l !== "" && !l.startsWith(INTERACTIVE_PREFIX) && !l.startsWith("-"));
					
					console.log(`Static lines from block (${staticLines.length}):`, staticLines);
					allLines = [...staticLines];

					// Get interactive lines from the map
					const interactiveLines = (this.additionalMacros.get(id) || []).map((line: string) =>
						line.startsWith(INTERACTIVE_PREFIX) ? line.substring(INTERACTIVE_PREFIX.length) : line
					);
					
					console.log(`Interactive lines (${interactiveLines.length}):`, interactiveLines);
					
					// Add them to the collection
					allLines = [...allLines, ...interactiveLines];
					console.log(`Combined lines for merging (${allLines.length}):`, allLines);
					
					// Merge duplicate meal entries and food items
					const mergedLines = mergeMacroLines(allLines);
					console.log(`Merged lines (${mergedLines.length}):`, mergedLines);
					
					// Now expand the meal templates after the merging is complete
					let expandedContent = "";
					mergedLines.forEach((line: string) => {
						if (line.toLowerCase().startsWith("meal:")) {
							// Extract meal name and potential multiplier
							const fullMealText = line.substring(5).trim();
							let mealName = fullMealText;
							let count = 1;
							
							// Check if there's a count indicator
							const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
							if (countMatch) {
								mealName = countMatch[1];
								count = parseInt(countMatch[2]);
								console.log(`Expanding meal ${mealName} with count ${count}`);
							}
							
							const meal = this.settings.mealTemplates.find(m =>
								m.name.toLowerCase() === mealName.toLowerCase()
							);
							
							if (meal && meal.items.length > 0) {
								expandedContent += line + "\n";
								
								// Add meal items with calculated quantities
								meal.items.forEach(item => {
									const parts = item.split(':');
									if (parts.length > 1 && parts[1].includes('g')) {
										// Extract the serving size and multiply by count
										const servingMatch = parts[1].match(/^([\d\.]+)g/);
										if (servingMatch) {
											const serving = parseFloat(servingMatch[1]);
											const multipliedServing = serving * count;
											expandedContent += `- ${parts[0]}:${multipliedServing}g\n`;
											console.log(`Added: - ${parts[0]}:${multipliedServing}g`);
										} else {
											expandedContent += `- ${item}\n`;
										}
									} else {
										expandedContent += `- ${item}\n`;
									}
								});
							} else {
								expandedContent += line + "\n";
							}
						} else {
							expandedContent += line + "\n";
						}
					});
					
					// Clear interactive lines after merging
					this.additionalMacros.set(id, []);
					
					return "```macros\nid: " + id + "\n" + expandedContent + "\n```";
				});
				
				await this.app.vault.modify(activeFile, newContent);
				
				// Update the global macro tables with the latest content
				this.updateGlobalMacroTableFromContent(newContent);
				this.additionalMacros.clear();
				
				// Must trigger metadata changes to force refresh
				this.app.metadataCache.trigger("changed", activeFile);
				
				// Force refresh all views
				this.refreshMarkdownViews();
				await this.redrawAllMacrospc();
				await this.redrawAllMacrocalc();
				
			} catch (error) {
				console.error("Error updating macros code block:", error);
			}
		});
	}

	/**
	 * Iterates over all macrospc container elements and redraws their charts.
	 */
	async redrawAllMacrospc() {
		for (const [id, containerSet] of this.macrospcContainers.entries()) {
			try {
				const loaded = await this.loadMacroTableFromVault(id);
				if (loaded) {
					this.macroTables.set(id, loaded);
				}
			} catch (error) {
				console.error(`Error re-loading macro table for id ${id}:`, error);
			}
			// Remove stale elements (not connected to DOM)
			const aliveElements = new Set<HTMLElement>();
			containerSet.forEach(el => {
				if (el.isConnected) {
					this.drawMacrospc(id, el);
					aliveElements.add(el);
				}
			});
			this.macrospcContainers.set(id, aliveElements);
		}
	}

	/**
	 * Triggers a refresh of all markdown views.
	 */
	async redrawAllMacrocalc() {
		this.refreshMarkdownViews();
	}

	/**
	 * Refreshes all active markdown views, triggering a re-render.
	 */
	refreshMarkdownViews() {
		this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
			const view = leaf.view as MarkdownView;
			if (view.previewMode && typeof view.previewMode.rerender === "function") {
				view.previewMode.rerender(true);
			} else {
				leaf.setViewState(leaf.getViewState());
			}
		});
	}

	/**
	 * Loads plugin settings.
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Saves plugin settings.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
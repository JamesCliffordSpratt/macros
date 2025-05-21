import MacrosPlugin from '../../../main';
import {
	formatCalories,
	formatGrams,
	formatPercentage,
	safeAttachTooltip,
	MacroRow,
	Group,
	MacroTotals,
	DailyTargets,
	CLASS_NAMES,
	MACRO_TYPES,
	ProgressBarFactory,
} from '../../../utils';
import { parseGrams } from '../../../utils/parsingUtils';
import { Notice } from 'obsidian';

export class RowRenderer {
	private plugin: MacrosPlugin;
	private removeCallback: ((macroLine: string) => Promise<void>) | null = null;
	private updateQuantityCallback:
		| ((
				macroLine: string,
				newQuantity: number,
				isMealItem?: boolean,
				mealName?: string,
				originalItemText?: string
		  ) => Promise<void>)
		| null = null;
	private eventListeners: { el: HTMLElement; type: string; handler: EventListener }[] = [];

	constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
	}

	setRemoveCallback(callback: (macroLine: string) => Promise<void>): void {
		this.removeCallback = callback;
	}

	setUpdateQuantityCallback(
		callback: (
			macroLine: string,
			newQuantity: number,
			isMealItem?: boolean,
			mealName?: string,
			originalItemText?: string
		) => Promise<void>
	): void {
		this.updateQuantityCallback = callback;
	}

	private extractFoodName(macroLine: string): string {
		if (macroLine.includes(':')) {
			return macroLine.split(':')[0].trim();
		}
		return macroLine.trim();
	}

	/**
	 * Generates a tooltip showing macro composition in terms of calories and percentages
	 * @param macro The macro type (protein, fat, or carbs)
	 * @param value The amount of the macro in grams
	 * @param row The food item row data
	 * @param macroPercent The percentage of this macro relative to total macros
	 * @returns Formatted tooltip string
	 */
	private generateMacroCompositionTooltip(
		macro: 'protein' | 'fat' | 'carbs',
		value: number,
		row: MacroRow,
		macroPercent: number
	): string {
		return `${this.capitalize(macro)}: ${value}g (${macroPercent}% of total macros)`;
	}

	/**
	 * Helper function to capitalize a string
	 */
	private capitalize(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	async onRemove(macroLine: string): Promise<void> {
		if (this.removeCallback) {
			await this.removeCallback(macroLine);
		}
	}

	async onUpdateQuantity(
		macroLine: string,
		newQuantity: number,
		isMealItem = false,
		mealName = '',
		originalItemText = ''
	): Promise<void> {
		if (this.updateQuantityCallback) {
			await this.updateQuantityCallback(
				macroLine,
				newQuantity,
				isMealItem,
				mealName,
				originalItemText
			);

			await this.plugin.forceCompleteReload();
		}
	}

	/**
	 * Find any IDs that might be affected by the current update
	 */
	private findAffectedIds(): string[] {
		const affectedIds: string[] = [];

		try {
			// Get all active renderers
			if (this.plugin.macroService._activeMacrosCalcRenderers) {
				// For each renderer, get its IDs and add them to our list
				for (const renderer of this.plugin.macroService._activeMacrosCalcRenderers) {
					if (typeof renderer.getIds === 'function') {
						const rendererIds = renderer.getIds();
						affectedIds.push(...rendererIds);
					}
				}
			}
		} catch (error) {
			this.plugin.logger.error('Error finding affected IDs:', error);
		}

		return [...new Set(affectedIds)]; // Deduplicate IDs
	}

	/**
	 * Explicitly refresh any renderers that might be using the affected IDs
	 */
	private async refreshAffectedRenderers(affectedIds: string[]): Promise<void> {
		if (!affectedIds.length) return;

		try {
			// First, force reload of data for all affected IDs
			for (const id of affectedIds) {
				// Load fresh data from vault
				const freshData = await this.plugin.loadMacroTableFromVault(id);
				if (freshData) {
					// Update in the central store
					this.plugin.macroService.macroTables.set(id, freshData);
					this.plugin.logger.debug(`Refreshed data for ID: ${id}`);
				}
			}

			// Now force each renderer to refresh
			if (this.plugin.macroService._activeMacrosCalcRenderers) {
				for (const renderer of this.plugin.macroService._activeMacrosCalcRenderers) {
					// If this renderer uses any of our affected IDs
					if (typeof renderer.getIds === 'function') {
						const rendererIds = renderer.getIds();
						const shouldRefresh = rendererIds.some((id) => affectedIds.includes(id));

						if (shouldRefresh) {
							// Mark it for refresh and re-render
							if (typeof renderer.setNeedsRefresh === 'function') {
								renderer.setNeedsRefresh();
								this.plugin.logger.debug(`Marked renderer for refresh: ${rendererIds.join(',')}`);

								// Re-render with fresh data if possible
								if (typeof renderer.render === 'function') {
									// Get fresh data for this renderer
									const { aggregate, breakdown } =
										this.plugin.processNutritionalDataFromLines(rendererIds);
									await renderer.render(aggregate, breakdown);
									this.plugin.logger.debug(`Re-rendered renderer: ${rendererIds.join(',')}`);
								}
							}
						}
					}
				}
			}
		} catch (error) {
			this.plugin.logger.error('Error refreshing affected renderers:', error);
		}
	}

	/**
	 * Register a DOM event for cleanup when needed
	 */
	private registerDomEvent(el: HTMLElement, type: string, handler: EventListener): void {
		try {
			// If plugin provides registerDomListener, use that
			if (this.plugin && typeof this.plugin.registerDomListener === 'function') {
				this.plugin.registerDomListener(el, type, handler);
			} else {
				// Otherwise, track it ourselves for cleanup
				el.addEventListener(type, handler);
				this.eventListeners.push({ el, type, handler });
			}
		} catch (error) {
			this.plugin.logger.error('Error using registerDomEvent:', error);
		}
	}

	/**
	 * Cleanup method to remove all manually tracked event listeners
	 */
	public cleanup(): void {
		// Clean up any event listeners we've added
		for (const { el, type, handler } of this.eventListeners) {
			try {
				el.removeEventListener(type, handler);
			} catch (error) {
				this.plugin.logger.error(`Error removing event listener of type ${type}:`, error);
			}
		}
		this.eventListeners = [];
	}

	renderFoodRow(
		table: HTMLTableElement,
		row: MacroRow,
		group: Group,
		parentSection: string,
		dailyTargets: DailyTargets
	): void {
		const r = table.insertRow();
		r.dataset.parent = parentSection;
		r.dataset.macroLine = row.macroLine;
		r.dataset.foodName = this.extractFoodName(row.macroLine);

		const isMealItem = !!group.macroLine && group.macroLine.toLowerCase().startsWith('meal:');
		const mealName = isMealItem ? group.name : '';

		const nameCell = r.insertCell();
		const nameContainer = nameCell.createDiv({ cls: 'macro-space-between' });
		nameContainer.createSpan({ text: row.name });

		if (!group.macroLine) {
			const removeBtn = nameContainer.createSpan({
				cls: `${CLASS_NAMES.TABLE.CONTROL_ICON} ${CLASS_NAMES.ICONS.REMOVE}`,
				text: '–',
			});

			safeAttachTooltip(removeBtn, 'Remove this item', this.plugin);

			// Existing event handler code
			this.registerDomEvent(removeBtn, 'click', async (e: MouseEvent) => {
				e.stopPropagation();
				await this.onRemove(row.macroLine);
			});
		}

		const quantityCell = r.insertCell();
		quantityCell.classList.add('editable-quantity');
		safeAttachTooltip(quantityCell, 'Click to edit quantity', this.plugin);
		quantityCell.textContent = row.serving;

		const servingValue = parseGrams(row.serving);

		// Use registerDomEvent for proper cleanup
		const quantityCellClickHandler = (e: MouseEvent) => {
			if (quantityCell.querySelector('input')) return;
			quantityCell.empty();

			const input = createEl('input', {
				type: 'number',
				attr: { min: '0', step: '1', value: servingValue.toString() },
			});
			quantityCell.appendChild(input);
			input.focus();
			input.select();

			let inputProcessed = false;
			const applyQuantityChange = async () => {
				if (inputProcessed) return;
				inputProcessed = true;

				const newValue = parseFloat(input.value);
				if (!isNaN(newValue) && newValue >= 0) {
					try {
						quantityCell.classList.add('quantity-updating');
						quantityCell.textContent = `${newValue}g (updating...)`;
						await this.onUpdateQuantity(
							row.macroLine,
							newValue,
							isMealItem,
							mealName,
							row.macroLine
						);
					} catch (error) {
						this.plugin.logger.error('Error updating quantity:', error);
						quantityCell.classList.remove('quantity-updating');
						quantityCell.classList.add('quantity-error');
						quantityCell.textContent = `${servingValue}g (error)`;
						setTimeout(() => {
							quantityCell.classList.remove('quantity-error');
							quantityCell.textContent = row.serving;
						}, 2000);
						new Notice(`Failed to update quantity: ${(error as Error).message || 'Unknown error'}`);
					}
				} else {
					quantityCell.textContent = row.serving;
				}
			};

			// Use separate event listener registrations with proper cleanup
			const inputBlurHandler = applyQuantityChange;
			const inputKeydownHandler = async (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					await applyQuantityChange();
				} else if (e.key === 'Escape') {
					inputProcessed = true;
					quantityCell.textContent = row.serving;
				}
			};

			// Register event listeners with proper cleanup
			this.registerDomEvent(input, 'blur', inputBlurHandler);
			this.registerDomEvent(input, 'keydown', inputKeydownHandler);

			e.stopPropagation();
		};

		this.registerDomEvent(quantityCell, 'click', quantityCellClickHandler);

		const caloriesCell = r.insertCell();
		caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CALORIES_CELL); // Add CALORIES_CELL class
		caloriesCell.textContent = formatCalories(row.calories);
		safeAttachTooltip(
			caloriesCell,
			`${formatPercentage((row.calories / dailyTargets.calories) * 100)}% of daily calorie target`,
			this.plugin
		);

		this.renderMacroCell(r, row.protein, row, MACRO_TYPES.PROTEIN, dailyTargets);
		this.renderMacroCell(r, row.fat, row, MACRO_TYPES.FAT, dailyTargets);
		this.renderMacroCell(r, row.carbs, row, MACRO_TYPES.CARBS, dailyTargets);
	}

	renderMacroCell(
		tableRow: HTMLTableRowElement,
		value: number,
		row: MacroRow,
		macroType: string,
		dailyTargets: DailyTargets
	): void {
		const cell = tableRow.insertCell();
		cell.classList.add(CLASS_NAMES.MACRO.CELL, `${macroType}-cell`);

		const content = document.createElement('div');

		// Calculate the total macronutrient content in grams
		const total = row.protein + row.fat + row.carbs;

		// Calculate the percentage of this macro as part of total macros (by weight)
		const percentageOfFood = total > 0 ? Math.round((value / total) * 100) : 0;

		content.textContent = formatGrams(value);

		// Only show percentages if the setting is enabled
		if (total > 0 && this.plugin.settings.showCellPercentages) {
			content.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${percentageOfFood}%)`,
			});
		}

		cell.appendChild(content);

		// Use the corrected percentage for the progress bar
		ProgressBarFactory.createMacroProgressBar(cell, percentageOfFood, macroType);

		// Create macro composition tooltip
		let macroLabel = '';
		let target = 0;
		let macroType2: 'protein' | 'fat' | 'carbs' = 'protein'; // Default

		if (macroType === MACRO_TYPES.PROTEIN) {
			macroLabel = 'Protein';
			target = dailyTargets.protein;
			macroType2 = 'protein';
		} else if (macroType === MACRO_TYPES.FAT) {
			macroLabel = 'Fat';
			target = dailyTargets.fat;
			macroType2 = 'fat';
		} else if (macroType === MACRO_TYPES.CARBS) {
			macroLabel = 'Carbs';
			target = dailyTargets.carbs;
			macroType2 = 'carbs';
		}

		// Add the new macro composition tooltip with the correct percentage
		const tooltipText = this.generateMacroCompositionTooltip(
			macroType2,
			value,
			row,
			percentageOfFood
		);
		safeAttachTooltip(cell, tooltipText, this.plugin);
	}

	renderTotalCells(row: HTMLTableRowElement, totals: MacroTotals): void {
		const totalMacrosGrams = totals.protein + totals.fat + totals.carbs;

		// Calories
		const caloriesCell = row.insertCell();
		caloriesCell.textContent = formatCalories(totals.calories);

		// Protein
		const proteinCell = row.insertCell();
		proteinCell.classList.add(CLASS_NAMES.MACRO.PROTEIN_CELL);
		proteinCell.textContent = formatGrams(totals.protein);
		if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
			const proteinPercentage = formatPercentage((totals.protein / totalMacrosGrams) * 100);
			proteinCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${proteinPercentage}%)`,
			});
		}

		// Fat
		const fatCell = row.insertCell();
		fatCell.classList.add(CLASS_NAMES.MACRO.FAT_CELL);
		fatCell.textContent = formatGrams(totals.fat);
		if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
			const fatPercentage = formatPercentage((totals.fat / totalMacrosGrams) * 100);
			fatCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${fatPercentage}%)`,
			});
		}

		// Carbs
		const carbsCell = row.insertCell();
		carbsCell.classList.add(CLASS_NAMES.MACRO.CARBS_CELL);
		carbsCell.textContent = formatGrams(totals.carbs);
		if (totalMacrosGrams > 0 && this.plugin.settings.showCellPercentages) {
			const carbsPercentage = formatPercentage((totals.carbs / totalMacrosGrams) * 100);
			carbsCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${carbsPercentage}%)`,
			});
		}
	}

	renderTargetCells(row: HTMLTableRowElement, totals: MacroTotals, targets: DailyTargets): void {
		// Calories
		const caloriesCell = row.insertCell();
		caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL);
		caloriesCell.textContent = targets.calories.toString();
		if (this.plugin.settings.showCellPercentages) {
			const caloriePercentage = formatPercentage((totals.calories / targets.calories) * 100);
			caloriesCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${caloriePercentage}%)`,
			});
		}
		ProgressBarFactory.createEnhancedTargetBar(
			caloriesCell,
			totals.calories,
			targets.calories,
			MACRO_TYPES.CALORIES
		);

		// Protein
		const proteinCell = row.insertCell();
		proteinCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.PROTEIN_CELL);
		proteinCell.textContent = targets.protein.toString();
		if (this.plugin.settings.showCellPercentages) {
			const proteinPercentage = formatPercentage((totals.protein / targets.protein) * 100);
			proteinCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${proteinPercentage}%)`,
			});
		}
		ProgressBarFactory.createEnhancedTargetBar(
			proteinCell,
			totals.protein,
			targets.protein,
			MACRO_TYPES.PROTEIN
		);

		// Fat
		const fatCell = row.insertCell();
		fatCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.FAT_CELL);
		fatCell.textContent = targets.fat.toString();
		if (this.plugin.settings.showCellPercentages) {
			const fatPercentage = formatPercentage((totals.fat / targets.fat) * 100);
			fatCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${fatPercentage}%)`,
			});
		}
		ProgressBarFactory.createEnhancedTargetBar(fatCell, totals.fat, targets.fat, MACRO_TYPES.FAT);

		// Carbs
		const carbsCell = row.insertCell();
		carbsCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CARBS_CELL);
		carbsCell.textContent = targets.carbs.toString();
		if (this.plugin.settings.showCellPercentages) {
			const carbsPercentage = formatPercentage((totals.carbs / targets.carbs) * 100);
			carbsCell.createSpan({
				cls: CLASS_NAMES.MACRO.PERCENTAGE,
				text: `(${carbsPercentage}%)`,
			});
		}
		ProgressBarFactory.createEnhancedTargetBar(
			carbsCell,
			totals.carbs,
			targets.carbs,
			MACRO_TYPES.CARBS
		);
	}

	renderRemainingCells(row: HTMLTableRowElement, totals: MacroTotals, targets: DailyTargets): void {
		const remainingCalories = targets.calories - totals.calories;
		const remainingProtein = targets.protein - totals.protein;
		const remainingFat = targets.fat - totals.fat;
		const remainingCarbs = targets.carbs - totals.carbs;

		// Calories
		const caloriesCell = row.insertCell();
		caloriesCell.classList.add(CLASS_NAMES.MACRO.CELL);
		if (remainingCalories < 0) {
			caloriesCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
			caloriesCell.textContent = `${formatCalories(remainingCalories)} (over)`;
		} else if (remainingCalories === 0) {
			caloriesCell.textContent = '0';
		} else {
			caloriesCell.textContent = formatCalories(remainingCalories);
		}

		// Protein
		const proteinCell = row.insertCell();
		proteinCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.PROTEIN_CELL);
		if (remainingProtein < 0) {
			proteinCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
			proteinCell.textContent = `${formatGrams(remainingProtein)} (over)`;
		} else if (remainingProtein === 0) {
			proteinCell.textContent = '0.0g';
		} else {
			proteinCell.textContent = formatGrams(remainingProtein);
		}

		// Fat
		const fatCell = row.insertCell();
		fatCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.FAT_CELL);
		if (remainingFat < 0) {
			fatCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
			fatCell.textContent = `${formatGrams(remainingFat)} (over)`;
		} else if (remainingFat === 0) {
			fatCell.textContent = '0.0g';
		} else {
			fatCell.textContent = formatGrams(remainingFat);
		}

		// Carbs
		const carbsCell = row.insertCell();
		carbsCell.classList.add(CLASS_NAMES.MACRO.CELL, CLASS_NAMES.MACRO.CARBS_CELL);
		if (remainingCarbs < 0) {
			carbsCell.classList.add(CLASS_NAMES.TABLE.EXCEEDED);
			carbsCell.textContent = `${formatGrams(remainingCarbs)} (over)`;
		} else if (remainingCarbs === 0) {
			carbsCell.textContent = '0.0g';
		} else {
			carbsCell.textContent = formatGrams(remainingCarbs);
		}
	}
}

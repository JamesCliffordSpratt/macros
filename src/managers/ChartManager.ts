import MacrosPlugin from '../main';
import { Chart, ChartConfiguration, ChartDataset, TooltipItem, registerables } from 'chart.js';
import { ChartLoader, MacrosState, DOMUtils } from '../utils';
import { EventManager } from '../utils/EventManager';

// Define interface for the global Chart extensions we're using
interface ExtendedWindow extends Window {
	Chart?: typeof Chart;
	macroCharts?: Record<string, Chart>;
}

/**
 * ChartManager
 * ------------
 * Manages chart creation, rendering, and cleanup operations
 * for all charts in the Macros plugin.
 */
export class ChartManager {
	private plugin: MacrosPlugin;
	private chartLoader: ChartLoader = ChartLoader.getInstance();
	private eventManager: EventManager;

	constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
		this.eventManager = new EventManager(this.plugin);

		// Make sure Chart.js is pre-registered
		Chart.register(...registerables);

		// Initialize global window.Chart reference for backward compatibility
		(window as ExtendedWindow).Chart = Chart;

		// Initialize window.macroCharts object for legacy support
		if (!(window as ExtendedWindow).macroCharts) {
			(window as ExtendedWindow).macroCharts = {};
		}
	}

	/**
	 * Draws a macros pie chart with nutrition data
	 */
	async drawMacrospc(id: string | string[], el: HTMLElement, width = 300, height = 300) {
		try {
			// Use the ChartLoader instead of the old function
			await this.chartLoader.loadChart();
			el.empty();
			el.addClass('macrospc-container');

			let ids: string[];
			if (Array.isArray(id)) {
				ids = id;
			} else if (typeof id === 'string' && id.includes(',')) {
				// Handle comma-separated IDs in a string
				ids = id
					.split(',')
					.map((i) => i.trim())
					.filter((i) => i.length > 0);
			} else {
				ids = [id as string];
			}

			// Ensure all IDs in the list are valid
			ids = ids.filter((i) => i && i.trim() !== '');
			if (ids.length === 0) {
				this.plugin.logger.error(`No valid IDs found in: ${id}`);
				el.createEl('div', { text: 'Error: No valid IDs provided' });
				return;
			}

			// Create a consistent combinedId format for state management
			const combinedId = ids.join(',');
			const dashboardContainer = el.createDiv({ cls: 'macro-dashboard' });

			// Create a loading indicator while we ensure data is available
			const loadingEl = dashboardContainer.createEl('div', {
				cls: 'macrospc-loading',
				text: 'Loading chart data...',
			});

			// CRITICAL FIX: Always reload all data from vault first to ensure freshness
			// UPDATED: Use centralized DataManager methods
			for (const currentId of ids) {
				try {
					this.plugin.logger.debug(`Explicitly reloading data for ID: ${currentId} from vault`);

					// Use centralized method to get the latest data
					const freshData = await this.plugin.dataManager.getFullMacrosData(currentId);

					if (freshData && freshData.length > 0) {
						// Update the global cache with fresh data
						this.plugin.dataManager.macroTables.set(currentId, freshData);
						this.plugin.logger.debug(`Loaded ${freshData.length} lines for ID: ${currentId}`);
					} else {
						this.plugin.logger.warn(`No data found for ID: ${currentId} in vault`);
					}
				} catch (error) {
					this.plugin.logger.error(`Error loading data for ID: ${currentId}:`, error);
				}
			}

			// Remove loading indicator now that data is verified
			loadingEl.remove();

			const allDates = ids
				.map((id) => {
					const parsed = Date.parse(id);
					return isNaN(parsed) ? null : { id, date: new Date(parsed) };
				})
				.filter((d): d is { id: string; date: Date } => d !== null)
				.sort((a, b) => b.date.getTime() - a.date.getTime());

			// Create the improved header that matches macroscalc style
			const dashboardHeader = dashboardContainer.createDiv({
				cls: 'macroscalc-dashboard-header macro-dashboard-header',
			});

			// Create header content with proper spacing
			const headerContent = dashboardHeader.createDiv({
				cls: 'macroscalc-header-content',
			});

			const dynamicHeaderText =
				allDates.length === ids.length
					? ids.length === 1
						? ((): string => {
								const onlyDate = allDates[0].date;
								const today = new Date();
								const isToday =
									onlyDate.getFullYear() === today.getFullYear() &&
									onlyDate.getMonth() === today.getMonth() &&
									onlyDate.getDate() === today.getDate();

								return isToday
									? "Today's Macros"
									: `Macros for ${onlyDate.toLocaleDateString(undefined, {
											weekday: 'long',
											year: 'numeric',
											month: 'short',
											day: 'numeric',
										})}`;
							})()
						: (() => {
								const newest = allDates[0].date;
								const oldest = allDates[allDates.length - 1].date;
								const diffInMs = newest.getTime() - oldest.getTime();
								const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24)) + 1;
								// Updated format to match macroscalc
								return `Combined Macros (last ${days} days)`;
							})()
					: ids.length === 1
						? `Macros for ${ids[0]}`
						: `Combined Macros: ${ids.join(', ')}`;

			// Add title with proper class
			headerContent.createSpan({
				cls: 'macroscalc-header-title',
				text: dynamicHeaderText,
			});

			// Create toggle button that matches macroscalc style
			const toggleButton = headerContent.createSpan({
				cls: 'macroscalc-toggle-button toggle-icon',
			});

			// Get collapsed state using MacrosState directly
			const isCollapsed = MacrosState.getChartCollapsedState(combinedId, this.plugin);
			this.plugin.logger.debug(`Retrieved collapse state for ${combinedId}: ${isCollapsed}`);

			if (isCollapsed) {
				toggleButton.classList.add('collapsed');
				dashboardHeader.classList.add('collapsed');
			}

			// Create the flex container for chart and summary
			const flexContainer = dashboardContainer.createDiv({ cls: 'macro-dashboard-flex-container' });

			// Apply initial collapsed state if needed
			if (isCollapsed) {
				flexContainer.classList.add('collapsed');
			}

			const chartContainer = flexContainer.createDiv({ cls: 'macro-pie-chart-container' });
			const canvas = chartContainer.createEl('canvas');
			canvas.width = width;
			canvas.height = height;

			const summaryContainer = flexContainer.createDiv({
				cls: 'macro-pie-chart-summary-container',
			});
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				el.createEl('div', { text: 'Error: Unable to get canvas context.' });
				return;
			}

			let totalProtein = 0,
				totalFat = 0,
				totalCarbs = 0,
				totalCalories = 0;

			// Process each macro ID - wait for all calculations to complete
			// NEW: Process each ID individually with a more robust approach
			const allResults: {
				id: string;
				result: { protein: number; fat: number; carbs: number; calories: number };
			}[] = [];

			for (const macroId of ids) {
				try {
					// Always process from COMPLETE data, including bullet points
					// UPDATED: Use centralized DataManager method
					const fullMacrosData = await this.plugin.dataManager.getFullMacrosData(macroId);

					if (fullMacrosData && fullMacrosData.length > 0) {
						const result = await this.plugin.calculateMacrosFromLinesAsync(fullMacrosData);
						// Add with specific rounding to avoid floating point issues
						allResults.push({
							id: macroId,
							result: {
								protein: parseFloat(result.protein.toFixed(1)),
								fat: parseFloat(result.fat.toFixed(1)),
								carbs: parseFloat(result.carbs.toFixed(1)),
								calories: parseFloat(result.calories.toFixed(1)),
							},
						});

						this.plugin.logger.debug(
							`Calculated for ${macroId}: protein=${result.protein.toFixed(1)}g, fat=${result.fat.toFixed(1)}g, carbs=${result.carbs.toFixed(1)}g, calories=${result.calories.toFixed(1)}`
						);
					} else {
						this.plugin.logger.warn(`No data found for ID ${macroId}`);
					}
				} catch (error) {
					this.plugin.logger.error(`Error calculating macros for ID ${macroId}:`, error);
				}
			}

			// Sum up all the results
			// NEW: Use explicit rounded addition to avoid floating point issues
			for (const item of allResults) {
				totalProtein += item.result.protein;
				totalFat += item.result.fat;
				totalCarbs += item.result.carbs;
				totalCalories += item.result.calories;
			}

			// Round final values for display consistency
			totalProtein = parseFloat(totalProtein.toFixed(1));
			totalFat = parseFloat(totalFat.toFixed(1));
			totalCarbs = parseFloat(totalCarbs.toFixed(1));
			totalCalories = parseFloat(totalCalories.toFixed(1));

			this.plugin.logger.debug(
				`Total calculated: protein=${totalProtein}g, fat=${totalFat}g, carbs=${totalCarbs}g, calories=${totalCalories}`
			);

			const totalMacros = totalProtein + totalFat + totalCarbs;

			if (totalMacros <= 0) {
				el.createEl('div', { text: `No macros found for IDs: ${ids.join(', ')}` });
				return;
			}

			// Render calorie total in summary
			const calorieDiv = summaryContainer.createDiv({ cls: 'macro-summary-item' });
			calorieDiv.createSpan({ cls: 'macro-summary-label', text: 'Calories:' });
			calorieDiv.createSpan({ cls: 'macro-summary-value', text: `${totalCalories}` });

			this.createMetricCard(
				summaryContainer,
				'Protein',
				totalProtein,
				totalMacros,
				this.plugin.settings.proteinColor
			);
			this.createMetricCard(
				summaryContainer,
				'Fat',
				totalFat,
				totalMacros,
				this.plugin.settings.fatColor
			);
			this.createMetricCard(
				summaryContainer,
				'Carbs',
				totalCarbs,
				totalMacros,
				this.plugin.settings.carbsColor
			);

			// Create a unique ID for this chart
			const chartId = `macro-pie-${combinedId}`;
			canvas.id = chartId;

			// Draw chart using our common chart creation method
			this.createPieChart(
				ctx,
				chartId,
				[totalProtein, totalFat, totalCarbs],
				['Protein', 'Fat', 'Carbs'],
				[
					this.plugin.settings.proteinColor,
					this.plugin.settings.fatColor,
					this.plugin.settings.carbsColor,
				],
				totalMacros
			);

			// Set up click handler for the header - FIXED HERE
			const headerClickHandler = (e: Event) => {
				// Cast to MouseEvent to access preventDefault and stopPropagation
				const mouseEvent = e as MouseEvent;
				mouseEvent.preventDefault();
				mouseEvent.stopPropagation();

				// Toggle the collapsed state based on current visual state
				const currentCollapsedState = toggleButton.classList.contains('collapsed');
				const newCollapsedState = !currentCollapsedState;

				// Update toggle button visual state
				toggleButton.classList.toggle('collapsed', newCollapsedState);
				dashboardHeader.classList.toggle('collapsed', newCollapsedState);

				// Update the flex container visibility
				flexContainer.classList.toggle('collapsed', newCollapsedState);

				// Save the new state
				MacrosState.saveChartCollapsedState(combinedId, this.plugin, newCollapsedState);

				this.plugin.logger.debug(
					`Toggle header clicked, new state: ${newCollapsedState ? 'collapsed' : 'expanded'}`
				);
			};

			// Use the EventManager for proper cleanup
			dashboardHeader.addEventListener('click', headerClickHandler);

			// Also use EventManager for proper cleanup
			this.eventManager.registerDomEvent(dashboardHeader, 'click', headerClickHandler);

			// Store the container in the macrospcContainers map for future updates
			for (const currentId of ids) {
				if (!this.plugin.dataManager.macrospcContainers.has(currentId)) {
					this.plugin.dataManager.macrospcContainers.set(currentId, new Set());
				}
				const containerSet = this.plugin.dataManager.macrospcContainers.get(currentId);
				if (containerSet) {
					containerSet.add(el);
				}
			}

			// Also store with combined ID for multi-ID charts
			if (!this.plugin.dataManager.macrospcContainers.has(combinedId)) {
				this.plugin.dataManager.macrospcContainers.set(combinedId, new Set());
			}
			const containerSet = this.plugin.dataManager.macrospcContainers.get(combinedId);
			if (containerSet) {
				containerSet.add(el);
			}
		} catch (err) {
			this.plugin.logger.error('drawMacrospc error', err);
			// Display a user-friendly error
			el.empty();
			el.createEl('div', {
				text: 'Unable to render macro chart. Please reload the page.',
				cls: 'macrospc-error',
			});
		}
	}

	/**
	 * Creates a summary item for a macro nutrient with visual representation
	 */
	private createMetricCard(
		container: HTMLElement,
		label: string,
		value: number,
		total: number,
		color: string
	) {
		const itemDiv = container.createDiv({ cls: 'macro-summary-item' });

		// Colored dot - use CSS variable instead of inline style
		const indicator = itemDiv.createSpan({ cls: 'macro-color-indicator' });
		DOMUtils.setCSSProperty(indicator, '--indicator-color', color);

		itemDiv.createSpan({ cls: 'macro-summary-label', text: `${label}:` });

		const progressContainer = itemDiv.createDiv({ cls: 'macro-pie-progress-container' });

		// Create a progress bar with CSS variables for color and width
		const progressBar = progressContainer.createDiv({ cls: 'macro-pie-progress-bar' });
		DOMUtils.setCSSProperty(progressBar, '--progress-color', color);

		// Calculate percentage and use class-based width
		const percentage = Math.round((value / total) * 100);
		// Find the closest pie-progress-width class
		const roundedPercentage = Math.round(percentage / 5) * 5;
		progressBar.classList.add(`pie-progress-width-${roundedPercentage}`);
		// Also add exact width using CSS variable
		DOMUtils.setCSSProperty(progressBar, '--progress-width', `${percentage}%`);

		progressContainer.createDiv({
			cls: 'macro-pie-progress-text',
			text: `${value.toFixed(1)}g (${percentage}%)`,
		});
	}

	/**
	 * Creates and renders a pie chart with the given data
	 * This is the central chart creation method that will be used by all components
	 * @param ctx Canvas context to draw on
	 * @param chartId Unique ID for the chart
	 * @param data Array of data values
	 * @param labels Array of labels corresponding to data
	 * @param colors Array of colors for each data slice
	 * @param totalValue Optional total value for percentage calculations
	 * @returns The created chart instance
	 */
	public createPieChart(
		ctx: CanvasRenderingContext2D,
		chartId: string,
		data: number[],
		labels: string[],
		colors: string[],
		totalValue?: number
	): Chart {
		// Get ChartConstructor
		const ChartConstructor = (window as ExtendedWindow).Chart;
		if (!ChartConstructor) {
			throw new Error('Chart.js not loaded properly');
		}

		// Destroy any existing chart with this ID
		this.chartLoader.destroyChart(chartId);

		// Calculate the total if not provided
		const total = totalValue || data.reduce((sum, val) => sum + val, 0);

		// Define chart configuration with proper types
		const config: ChartConfiguration = {
			type: 'pie',
			data: {
				labels: labels,
				datasets: [
					{
						data: data,
						backgroundColor: colors,
						borderColor: 'rgba(255, 255, 255, 0.4)',
						borderWidth: 1,
						hoverBorderWidth: 2,
						hoverBorderColor: 'rgba(255, 255, 255, 0.9)',
					} as ChartDataset<'pie', number[]>,
				],
			},
			options: {
				responsive: false,
				maintainAspectRatio: false,
				animation: {
					duration: 800,
					easing: 'easeOutQuart',
				},
				layout: {
					padding: 5,
				},
				plugins: {
					legend: {
						display: false,
					},
					tooltip: {
						backgroundColor: 'rgba(0, 0, 0, 0.8)',
						titleFont: { weight: 'bold', size: 14 },
						bodyFont: { size: 12 },
						cornerRadius: 6,
						padding: 8,
						callbacks: {
							label: function (context: TooltipItem<'pie'>) {
								const label = context.label || '';
								const value = context.raw as number;
								const percentage = ((value / total) * 100).toFixed(1) + '%';
								return `${label}: ${value.toFixed(1)}g (${percentage})`;
							},
						},
					},
				},
			},
		};

		// Create the new chart
		const chart = new ChartConstructor(ctx, config);

		// Register the chart with the ChartLoader for proper management
		this.chartLoader.registerChart(chartId, chart);

		// For backward compatibility, also store in window.macroCharts
		if (!(window as ExtendedWindow).macroCharts) {
			(window as ExtendedWindow).macroCharts = {};
		}
		(window as ExtendedWindow).macroCharts[chartId] = chart;

		return chart;
	}

	/**
	 * Creates a line chart for data comparison
	 * @param ctx Canvas context to draw on
	 * @param chartId Unique ID for the chart
	 * @param labels X-axis labels (usually dates)
	 * @param datasets Array of dataset objects
	 * @returns The created chart instance
	 */
	public createLineChart(
		ctx: CanvasRenderingContext2D,
		chartId: string,
		labels: string[],
		datasets: {
			label: string;
			data: number[];
			borderColor: string;
			backgroundColor: string;
		}[]
	): Chart {
		// Get ChartConstructor
		const ChartConstructor = (window as ExtendedWindow).Chart;
		if (!ChartConstructor) {
			throw new Error('Chart.js not loaded properly');
		}

		// Destroy any existing chart with this ID
		this.chartLoader.destroyChart(chartId);

		// Define chart configuration with proper types
		const config: ChartConfiguration = {
			type: 'line',
			data: {
				labels,
				datasets: datasets.map(
					(dataset) =>
						({
							...dataset,
							tension: 0.2,
							fill: false,
							pointRadius: 4,
							pointHoverRadius: 6,
						}) as ChartDataset<'line', number[]>
				),
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: 'top',
					},
					tooltip: {
						callbacks: {
							label: function (context: TooltipItem<'line'>) {
								return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}`;
							},
						},
					},
				},
				scales: {
					x: {
						title: {
							display: true,
							text: 'Table ID (Date)',
						},
					},
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: 'Grams / Calories',
						},
					},
				},
			},
		};

		// Create the new chart
		const chart = new ChartConstructor(ctx, config);

		// Register the chart with the ChartLoader for proper management
		this.chartLoader.registerChart(chartId, chart);

		// For backward compatibility, also store in window.macroCharts
		if (!(window as ExtendedWindow).macroCharts) {
			(window as ExtendedWindow).macroCharts = {};
		}
		(window as ExtendedWindow).macroCharts[chartId] = chart;

		return chart;
	}

	/**
	 * Iterates over all macrospc container elements and redraws their charts.
	 */
	async redrawAllMacrospc() {
		try {
			// First, invalidate and reload ALL macro tables from vault
			const idsToRefresh = new Set([...this.plugin.dataManager.macroTables.keys()]);

			// Also get IDs from containers that might not be in the macroTables yet
			for (const [id, _] of this.plugin.dataManager.macrospcContainers.entries()) {
				if (typeof id === 'string') {
					// Handle comma-separated IDs (for combined charts)
					if (id.includes(',')) {
						id.split(',')
							.map((i) => i.trim())
							.forEach((singleId) => {
								idsToRefresh.add(singleId);
							});
					} else {
						idsToRefresh.add(id);
					}
				}
			}

			// Reload fresh data for all IDs
			// UPDATED: Use centralized DataManager methods
			for (const id of idsToRefresh) {
				try {
					const loaded = await this.plugin.dataManager.getFullMacrosData(id);
					if (loaded && loaded.length > 0) {
						// Update the cache with fresh data
						this.plugin.dataManager.macroTables.set(id, loaded);
					}
				} catch (error) {
					this.plugin.logger.error(`Error reloading macro table ${id}: ${error}`);
				}
			}

			// Now redraw all containers with fresh data
			for (const [id, containerSet] of this.plugin.dataManager.macrospcContainers.entries()) {
				const aliveElements = new Set<HTMLElement>();
				for (const el of containerSet) {
					if (el.isConnected) {
						// Ensure the element is still in the DOM
						await this.drawMacrospc(id, el);
						aliveElements.add(el);
					}
				}
				// Update the container set to only include connected elements
				this.plugin.dataManager.macrospcContainers.set(id, aliveElements);
			}
		} catch (error) {
			this.plugin.logger.error('Error in redrawAllMacrospc:', error);
		}
	}

	/**
	 * Redraw all macroscalc tables
	 */
	async redrawAllMacrocalc(): Promise<void> {
		try {
			this.plugin.logger.debug('Redrawing all macroscalc tables');

			// First, invalidate ALL macros tables
			// UPDATED: Use centralized DataManager methods
			for (const id of this.plugin.dataManager.macroTables.keys()) {
				// Force reload from vault
				const freshData = await this.plugin.dataManager.getFullMacrosData(id);
				if (freshData && freshData.length > 0) {
					this.plugin.dataManager.macroTables.set(id, freshData);
					this.plugin.logger.debug(`Refreshed data for ${id}: ${freshData.length} lines`);
				} else {
					this.plugin.logger.debug(`No data found for ${id} during refresh`);
				}
			}

			// Now update all renderers
			if (
				this.plugin.dataManager._activeMacrosCalcRenderers &&
				this.plugin.dataManager._activeMacrosCalcRenderers.size > 0
			) {
				this.plugin.logger.debug(
					`Updating ${this.plugin.dataManager._activeMacrosCalcRenderers.size} macroscalc renderers`
				);

				// Process each renderer
				for (const renderer of this.plugin.dataManager._activeMacrosCalcRenderers) {
					try {
						// Mark for refresh
						renderer.setNeedsRefresh();

						// Get IDs and recalculate
						const ids = renderer.getIds();
						this.plugin.logger.debug(`Recalculating for IDs: ${ids.join(',')}`);
						const { aggregate, breakdown } = this.plugin.processNutritionalDataFromLines(ids);

						// Render with fresh data
						await renderer.render(aggregate, breakdown);
						this.plugin.logger.debug(`Renderer updated successfully`);
					} catch (error) {
						this.plugin.logger.error('Error updating macroscalc renderer:', error);
					}
				}
			} else {
				this.plugin.logger.debug('No active macroscalc renderers to update');
			}
		} catch (error) {
			this.plugin.logger.error('Error in redrawAllMacrocalc:', error);
		}
	}

	/**
	 * Clean up all resources before plugin unload
	 */
	cleanup(): void {
		try {
			// Clean up event listeners
			this.eventManager.cleanup();

			// Clean up all chart instances
			this.chartLoader.destroyAllCharts();

			// Clean up any legacy charts stored in window.macroCharts
			const windowExt = window as ExtendedWindow;
			if (windowExt.macroCharts) {
				Object.values(windowExt.macroCharts).forEach((chart: Chart) => {
					if (chart && typeof chart.destroy === 'function') {
						try {
							chart.destroy();
						} catch (err) {
							this.plugin.logger.debug(`Error destroying legacy chart: ${err}`);
						}
					}
				});
				windowExt.macroCharts = {};
			}
		} catch (error) {
			this.plugin.logger.error('Error during ChartManager cleanup:', error);
		}
	}
}

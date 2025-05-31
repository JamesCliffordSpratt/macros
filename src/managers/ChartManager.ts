import MacrosPlugin from '../main';
import { Chart, ChartConfiguration, ChartDataset, TooltipItem, registerables } from 'chart.js';
import { ChartLoader, MacrosState, DOMUtils } from '../utils';

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

	constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;

		Chart.register(...registerables);
		(window as ExtendedWindow).Chart = Chart;

		if (!(window as ExtendedWindow).macroCharts) {
			(window as ExtendedWindow).macroCharts = {};
		}
	}

	/**
	 * Draws a macros pie chart with nutrition data
	 */
	async drawMacrospc(id: string | string[], el: HTMLElement, width = 300, height = 300) {
		try {
			// Ensure Chart.js is loaded first - this is critical
			await this.chartLoader.loadChart();
			
			// Clear any existing content and add container class
			el.empty();
			el.addClass('macrospc-container');

			let ids: string[];
			if (Array.isArray(id)) {
				ids = id;
			} else if (typeof id === 'string' && id.includes(',')) {
				ids = id
					.split(',')
					.map((i) => i.trim())
					.filter((i) => i.length > 0);
			} else {
				ids = [id as string];
			}

			ids = ids.filter((i) => i && i.trim() !== '');
			if (ids.length === 0) {
				this.plugin.logger.error(`No valid IDs found in: ${id}`);
				el.createEl('div', { text: 'Error: No valid IDs provided' });
				return;
			}

			const combinedId = ids.join(',');
			
			// Create dashboard container with proper error handling
			const dashboardContainer = el.createDiv({ cls: 'macro-dashboard' });

			// Show loading state
			const loadingEl = dashboardContainer.createEl('div', {
				cls: 'macrospc-loading',
				text: 'Loading chart data...',
			});

			// Data loading phase - with better error handling
			interface DataLoadResult {
				id: string;
				success: boolean;
				data: string[];
			}
			
			const dataLoadResults: DataLoadResult[] = [];
			for (const currentId of ids) {
				try {
					this.plugin.logger.debug(`Loading data for ID: ${currentId}`);

					// Force fresh data load with timeout
					const freshDataPromise = this.plugin.dataManager.getFullMacrosData(currentId);
					const timeoutPromise = new Promise<string[]>((_, reject) => 
						setTimeout(() => reject(new Error('Data load timeout')), 5000)
					);

					const freshData = await Promise.race([freshDataPromise, timeoutPromise]) as string[];

					if (freshData && Array.isArray(freshData) && freshData.length > 0) {
						this.plugin.dataManager.macroTables.set(currentId, freshData);
						this.plugin.logger.debug(`Loaded ${freshData.length} lines for ID: ${currentId}`);
						dataLoadResults.push({ id: currentId, success: true, data: freshData });
					} else {
						this.plugin.logger.warn(`No data found for ID: ${currentId}`);
						dataLoadResults.push({ id: currentId, success: false, data: [] });
					}
				} catch (error) {
					this.plugin.logger.error(`Error loading data for ID: ${currentId}:`, error);
					dataLoadResults.push({ id: currentId, success: false, data: [] });
				}
			}

			// Check if we have any successful data loads
			const successfulLoads = dataLoadResults.filter((result): result is DataLoadResult => result.success);
			if (successfulLoads.length === 0) {
				loadingEl.textContent = `No data found for IDs: ${ids.join(', ')}`;
				return;
			}

			// Remove loading indicator
			loadingEl.remove();

			// Create header with better state management
			const allDates = ids
				.map((id) => {
					const parsed = Date.parse(id);
					return isNaN(parsed) ? null : { id, date: new Date(parsed) };
				})
				.filter((d): d is { id: string; date: Date } => d !== null)
				.sort((a, b) => b.date.getTime() - a.date.getTime());

			const dashboardHeader = dashboardContainer.createDiv({
				cls: 'macroscalc-dashboard-header macro-dashboard-header',
			});

			const headerContent = dashboardHeader.createDiv({
				cls: 'macroscalc-header-content',
			});

			// Dynamic header text with better logic
			const dynamicHeaderText = this.generateHeaderText(allDates, ids);

			headerContent.createSpan({
				cls: 'macroscalc-header-title',
				text: dynamicHeaderText,
			});

			const toggleButton = headerContent.createSpan({
				cls: 'macroscalc-toggle-button toggle-icon',
			});

			// Load collapse state
			const isCollapsed = MacrosState.getChartCollapsedState(combinedId, this.plugin);
			this.plugin.logger.debug(`Retrieved collapse state for ${combinedId}: ${isCollapsed}`);

			if (isCollapsed) {
				toggleButton.classList.add('collapsed');
				dashboardHeader.classList.add('collapsed');
			}

			// Create flex container
			const flexContainer = dashboardContainer.createDiv({ cls: 'macro-dashboard-flex-container' });

			if (isCollapsed) {
				flexContainer.classList.add('collapsed');
			}

			// Chart container with explicit sizing
			const chartContainer = flexContainer.createDiv({ cls: 'macro-pie-chart-container' });
			const canvas = chartContainer.createEl('canvas', {
				attr: {
					'data-width': width.toString(),
					'data-height': height.toString()
				}
			});
			canvas.width = width;
			canvas.height = height;

			// Summary container
			const summaryContainer = flexContainer.createDiv({
				cls: 'macro-pie-chart-summary-container',
			});

			// Get canvas context with error handling
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				el.createEl('div', { text: 'Error: Unable to get canvas context.' });
				return;
			}

			// Calculate totals with better error handling
			let totalProtein = 0, totalFat = 0, totalCarbs = 0, totalCalories = 0;
			const allResults: {
				id: string;
				result: { protein: number; fat: number; carbs: number; calories: number };
			}[] = [];

			// Process each successful data load
			for (const loadResult of successfulLoads) {
				try {
					const result = await this.plugin.calculateMacrosFromLinesAsync(loadResult.data);
					allResults.push({
						id: loadResult.id,
						result: {
							protein: parseFloat(result.protein.toFixed(1)),
							fat: parseFloat(result.fat.toFixed(1)),
							carbs: parseFloat(result.carbs.toFixed(1)),
							calories: parseFloat(result.calories.toFixed(1)),
						},
					});

					this.plugin.logger.debug(
						`Calculated for ${loadResult.id}: protein=${result.protein.toFixed(1)}g, fat=${result.fat.toFixed(1)}g, carbs=${result.carbs.toFixed(1)}g, calories=${result.calories.toFixed(1)}`
					);
				} catch (error) {
					this.plugin.logger.error(`Error calculating macros for ID ${loadResult.id}:`, error);
				}
			}

			// Aggregate totals
			for (const item of allResults) {
				totalProtein += item.result.protein;
				totalFat += item.result.fat;
				totalCarbs += item.result.carbs;
				totalCalories += item.result.calories;
			}

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

			// Create summary
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

			// Create chart with retry logic
			const chartId = `macro-pie-${combinedId}`;
			canvas.id = chartId;

			// Add a small delay to ensure DOM is ready
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify Chart.js is still available
			if (!window.Chart) {
				this.plugin.logger.error('Chart.js not available when creating pie chart');
				el.createEl('div', { text: 'Chart library not available' });
				return;
			}

			// Create the pie chart with error handling
			try {
			const chart = this.createPieChart(
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

			if (!chart) {
				throw new Error('Chart creation failed');
			}

				this.plugin.logger.debug(`Successfully created pie chart with ID: ${chartId}`);
			} catch (chartError) {
				this.plugin.logger.error('Error creating pie chart:', chartError);
				el.createEl('div', { text: 'Error creating chart visualization' });
				return;
			}

			// Setup header click handler
			const headerClickHandler = (e: Event) => {
				const mouseEvent = e as MouseEvent;
				mouseEvent.preventDefault();
				mouseEvent.stopPropagation();

				const currentCollapsedState = toggleButton.classList.contains('collapsed');
				const newCollapsedState = !currentCollapsedState;

				toggleButton.classList.toggle('collapsed', newCollapsedState);
				dashboardHeader.classList.toggle('collapsed', newCollapsedState);
				flexContainer.classList.toggle('collapsed', newCollapsedState);

				MacrosState.saveChartCollapsedState(combinedId, this.plugin, newCollapsedState);

				this.plugin.logger.debug(
					`Toggle header clicked, new state: ${newCollapsedState ? 'collapsed' : 'expanded'}`
				);
			};

			// Use plugin's registerDomListener for proper cleanup
			this.plugin.registerDomListener(dashboardHeader, 'click', headerClickHandler);

			// Register containers for refresh
			for (const currentId of ids) {
				if (!this.plugin.dataManager.macrospcContainers.has(currentId)) {
					this.plugin.dataManager.macrospcContainers.set(currentId, new Set());
				}
				const containerSet = this.plugin.dataManager.macrospcContainers.get(currentId);
				if (containerSet) {
					containerSet.add(el);
				}
			}

			if (!this.plugin.dataManager.macrospcContainers.has(combinedId)) {
				this.plugin.dataManager.macrospcContainers.set(combinedId, new Set());
			}
			const containerSet = this.plugin.dataManager.macrospcContainers.get(combinedId);
			if (containerSet) {
				containerSet.add(el);
			}

		} catch (err) {
			this.plugin.logger.error('drawMacrospc error', err);
			el.empty();
			el.createEl('div', {
				text: 'Unable to render macro chart. Please reload the page.',
				cls: 'macrospc-error',
			});
		}
	}

	// Helper method to generate header text
	private generateHeaderText(allDates: {id: string, date: Date}[], ids: string[]): string {
		if (allDates.length === ids.length) {
			if (ids.length === 1) {
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
			} else {
				const newest = allDates[0].date;
				const oldest = allDates[allDates.length - 1].date;
				const diffInMs = newest.getTime() - oldest.getTime();
				const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24)) + 1;
				return `Combined Macros (last ${days} days)`;
			}
		} else {
			return ids.length === 1
				? `Macros for ${ids[0]}`
				: `Combined Macros: ${ids.join(', ')}`;
		}
	}

	private createMetricCard(
		container: HTMLElement,
		label: string,
		value: number,
		total: number,
		color: string
	) {
		const itemDiv = container.createDiv({ cls: 'macro-summary-item' });

		const indicator = itemDiv.createSpan({ cls: 'macro-color-indicator' });
		DOMUtils.setCSSProperty(indicator, '--indicator-color', color);

		itemDiv.createSpan({ cls: 'macro-summary-label', text: `${label}:` });

		const progressContainer = itemDiv.createDiv({ cls: 'macro-pie-progress-container' });

		const progressBar = progressContainer.createDiv({ cls: 'macro-pie-progress-bar' });
		DOMUtils.setCSSProperty(progressBar, '--progress-color', color);

		const percentage = Math.round((value / total) * 100);
		const roundedPercentage = Math.round(percentage / 5) * 5;
		progressBar.classList.add(`pie-progress-width-${roundedPercentage}`);
		DOMUtils.setCSSProperty(progressBar, '--progress-width', `${percentage}%`);

		progressContainer.createDiv({
			cls: 'macro-pie-progress-text',
			text: `${value.toFixed(1)}g (${percentage}%)`,
		});
	}

public createPieChart(
	ctx: CanvasRenderingContext2D,
	chartId: string,
	data: number[],
	labels: string[],
	colors: string[],
	totalValue?: number
): Chart | null {
	try {
		// Validate inputs
		if (!ctx) {
			this.plugin.logger.error('No canvas context provided to createPieChart');
			return null;
		}

		if (!data || data.length === 0) {
			this.plugin.logger.error('No data provided to createPieChart');
			return null;
		}

		if (!labels || labels.length !== data.length) {
			this.plugin.logger.error('Labels array length does not match data array length');
			return null;
		}

		if (!colors || colors.length !== data.length) {
			this.plugin.logger.error('Colors array length does not match data array length');
			return null;
		}

		// Check if Chart.js is available
		const ChartConstructor = (window as ExtendedWindow).Chart;
		if (!ChartConstructor) {
			this.plugin.logger.error('Chart.js not available in createPieChart');
			return null;
		}

		this.plugin.logger.debug(`Creating pie chart with ID: ${chartId}`);

		// Destroy any existing chart with this ID
		this.chartLoader.destroyChart(chartId);

		const total = totalValue || data.reduce((sum, val) => sum + val, 0);

		if (total <= 0) {
			this.plugin.logger.error('Total value is zero or negative, cannot create pie chart');
			return null;
		}

		// Create chart configuration with better error handling
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

		this.plugin.logger.debug('Chart configuration created, attempting to instantiate chart');

		// Create the chart with try-catch
		let chart;
		try {
			chart = new ChartConstructor(ctx, config);
		} catch (chartCreationError) {
			this.plugin.logger.error('Error during Chart.js instantiation:', chartCreationError);
			return null;
		}

		if (!chart) {
			this.plugin.logger.error('Chart creation returned null/undefined');
			return null;
		}

		this.plugin.logger.debug('Chart instance created successfully');

		// Register the chart for management
		this.chartLoader.registerChart(chartId, chart);

		// Maintain backward compatibility with global charts object
		if (!(window as ExtendedWindow).macroCharts) {
			(window as ExtendedWindow).macroCharts = {};
		}
		(window as ExtendedWindow).macroCharts[chartId] = chart;

		this.plugin.logger.debug(`Pie chart created and registered with ID: ${chartId}`);
		return chart;

	} catch (error) {
		this.plugin.logger.error('Unexpected error in createPieChart:', error);
		return null;
	}
}

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
		const ChartConstructor = (window as ExtendedWindow).Chart;
		if (!ChartConstructor) {
			throw new Error('Chart.js not loaded properly');
		}

		this.chartLoader.destroyChart(chartId);

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

		const chart = new ChartConstructor(ctx, config);

		this.chartLoader.registerChart(chartId, chart);

		if (!(window as ExtendedWindow).macroCharts) {
			(window as ExtendedWindow).macroCharts = {};
		}
		(window as ExtendedWindow).macroCharts[chartId] = chart;

		return chart;
	}

	async redrawAllMacrospc() {
		try {
			const idsToRefresh = new Set([...this.plugin.dataManager.macroTables.keys()]);

			for (const [id, _] of this.plugin.dataManager.macrospcContainers.entries()) {
				if (typeof id === 'string') {
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

			for (const id of idsToRefresh) {
				try {
					const loaded = await this.plugin.dataManager.getFullMacrosData(id);
					if (loaded && loaded.length > 0) {
						this.plugin.dataManager.macroTables.set(id, loaded);
					}
				} catch (error) {
					this.plugin.logger.error(`Error reloading macro table ${id}: ${error}`);
				}
			}

			for (const [id, containerSet] of this.plugin.dataManager.macrospcContainers.entries()) {
				const aliveElements = new Set<HTMLElement>();
				for (const el of containerSet) {
					if (el.isConnected) {
						// Get dimensions from data attributes if available
						const widthAttr = el.getAttribute('data-width');
						const heightAttr = el.getAttribute('data-height');
						const width = widthAttr ? parseInt(widthAttr) : 300;
						const height = heightAttr ? parseInt(heightAttr) : 300;

						await this.drawMacrospc(id, el, width, height);
						aliveElements.add(el);
					}
				}
				this.plugin.dataManager.macrospcContainers.set(id, aliveElements);
			}
		} catch (error) {
			this.plugin.logger.error('Error in redrawAllMacrospc:', error);
		}
	}

	async redrawAllMacrocalc(): Promise<void> {
		try {
			this.plugin.logger.debug('Redrawing all macroscalc tables');

			for (const id of this.plugin.dataManager.macroTables.keys()) {
				const freshData = await this.plugin.dataManager.getFullMacrosData(id);
				if (freshData && freshData.length > 0) {
					this.plugin.dataManager.macroTables.set(id, freshData);
					this.plugin.logger.debug(`Refreshed data for ${id}: ${freshData.length} lines`);
				} else {
					this.plugin.logger.debug(`No data found for ${id} during refresh`);
				}
			}

			if (
				this.plugin.dataManager._activeMacrosCalcRenderers &&
				this.plugin.dataManager._activeMacrosCalcRenderers.size > 0
			) {
				this.plugin.logger.debug(
					`Updating ${this.plugin.dataManager._activeMacrosCalcRenderers.size} macroscalc renderers`
				);

				for (const renderer of this.plugin.dataManager._activeMacrosCalcRenderers) {
					try {
						renderer.setNeedsRefresh();

						const ids = renderer.getIds();
						this.plugin.logger.debug(`Recalculating for IDs: ${ids.join(',')}`);
						const { aggregate, breakdown } = this.plugin.processNutritionalDataFromLines(ids);

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
	 * Cleanup handled by plugin's onunload - no explicit cleanup needed
	 */
	cleanup(): void {
		try {
			this.chartLoader.destroyAllCharts();

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
import MacrosPlugin from './../../main';
import {
	safeAttachTooltip,
	MacroTotals,
	DailyTargets,
	CLASS_NAMES,
	MACRO_TYPES,
	MacrosState,
} from '../../utils';
import {
	formatDashboardTooltip,
	getSummaryHeader,
	formatCalories,
	formatGrams,
} from '../../utils/formatters';
import { EventManager } from '../../utils/EventManager';

export class MacrosDashboard {
	// Explicitly declare class properties
	private container: HTMLElement;
	private id: string;
	private plugin: MacrosPlugin;
	private eventManager: EventManager;
	private dashboardHeader: HTMLElement | null = null;
	private dashboardContent: HTMLElement | null = null;
	private toggleIcon: HTMLElement | null = null;
	private state: MacrosState | null = null;

	// Constructor with proper initialization
	constructor(container: HTMLElement, id: string, plugin: MacrosPlugin) {
		this.container = container;
		this.id = id;
		this.plugin = plugin;
		this.eventManager = new EventManager(this.plugin);

		// Initialize the state for persistence
		if (this.id) {
			this.state = new MacrosState(plugin, id, 'dashboard');
		}
	}

	create(combinedTotals: MacroTotals, dailyTargets: DailyTargets): void {
		try {
			const dashboardContainer = this.container.createDiv({ cls: CLASS_NAMES.DASHBOARD.CONTAINER });

			// Use the new collapsible-header class
			this.dashboardHeader = dashboardContainer.createDiv({
				cls: `${CLASS_NAMES.DASHBOARD.HEADER} collapsible-header`,
			});

			// Add a data attribute for better selection
			this.dashboardHeader.dataset.dashboardId = this.id;

			// Use header-content and header-label
			const headerContent = dashboardContainer.createDiv({ cls: 'header-content' });
			const headerText = getSummaryHeader(this.id);

			// Use the new class for the header label
			headerContent.createSpan({
				cls: 'header-label',
				text: headerText,
			});

			// Add the toggle icon
			this.toggleIcon = headerContent.createSpan({ cls: 'toggle-icon' });
			this.toggleIcon.dataset.dashboardId = this.id;

			// Add the header content to the header
			this.dashboardHeader.appendChild(headerContent);

			this.dashboardContent = dashboardContainer.createDiv({
				cls: `${CLASS_NAMES.DASHBOARD.CONTENT} collapsible-content`,
			});

			// Add data attribute for better selection
			this.dashboardContent.dataset.dashboardId = this.id;

			const caloriePercentage = (combinedTotals.calories / dailyTargets.calories) * 100;
			const proteinPercentage = (combinedTotals.protein / dailyTargets.protein) * 100;
			const fatPercentage = (combinedTotals.fat / dailyTargets.fat) * 100;
			const carbsPercentage = (combinedTotals.carbs / dailyTargets.carbs) * 100;

			this.createMetricCard(
				this.dashboardContent,
				'Calories',
				formatCalories(combinedTotals.calories),
				dailyTargets.calories,
				caloriePercentage,
				MACRO_TYPES.CALORIES
			);
			this.createMetricCard(
				this.dashboardContent,
				'Protein',
				formatGrams(combinedTotals.protein),
				dailyTargets.protein,
				proteinPercentage,
				MACRO_TYPES.PROTEIN
			);
			this.createMetricCard(
				this.dashboardContent,
				'Fat',
				formatGrams(combinedTotals.fat),
				dailyTargets.fat,
				fatPercentage,
				MACRO_TYPES.FAT
			);
			this.createMetricCard(
				this.dashboardContent,
				'Carbs',
				formatGrams(combinedTotals.carbs),
				dailyTargets.carbs,
				carbsPercentage,
				MACRO_TYPES.CARBS
			);

			// Restore saved collapsed state
			const isCollapsed = this.loadCollapsedState();
			if (isCollapsed && this.dashboardHeader && this.dashboardContent && this.toggleIcon) {
				this.dashboardHeader.classList.add('collapsed');
				this.dashboardContent.classList.add('collapsed');
				this.toggleIcon.classList.add('collapsed');
			}

			// Add click handler for collapsing/expanding
			const clickHandler = () => {
				if (this.dashboardHeader && this.dashboardContent && this.toggleIcon) {
					const isCurrentlyCollapsed = this.dashboardHeader.classList.contains('collapsed');
					const newCollapsedState = !isCurrentlyCollapsed;

					// Toggle visual state
					if (newCollapsedState) {
						this.dashboardHeader.classList.add('collapsed');
						this.dashboardContent.classList.add('collapsed');
						this.toggleIcon.classList.add('collapsed');
					} else {
						this.dashboardHeader.classList.remove('collapsed');
						this.dashboardContent.classList.remove('collapsed');
						this.toggleIcon.classList.remove('collapsed');
					}

					// Save the new state
					this.saveCollapsedState(newCollapsedState);
				}
			};

			// Use EventManager for proper cleanup
			if (this.dashboardHeader) {
				this.eventManager.registerDomEvent(this.dashboardHeader, 'click', clickHandler);
			}
		} catch (error) {
			this.plugin.logger.error('Error creating dashboard:', error);
		}
	}

	// Save collapsed state using MacrosState
	private saveCollapsedState(isCollapsed: boolean): void {
		if (this.state) {
			this.state.saveCollapsedState('dashboard', isCollapsed);
			this.plugin.logger.debug(`Saved dashboard collapsed state: ${isCollapsed}`);
		}
	}

	// Load collapsed state from MacrosState
	private loadCollapsedState(): boolean {
		if (this.state) {
			const isCollapsed = this.state.getCollapsedState('dashboard');
			this.plugin.logger.debug(`Loaded dashboard collapsed state: ${isCollapsed}`);
			return isCollapsed;
		}
		return false;
	}

	createMetricCard(
		container: HTMLElement,
		label: string,
		value: string,
		target: number,
		percentage: number,
		macroType: string
	): void {
		try {
			// Use the same class pattern as in MacrosCalcRenderer
			const card = container.createDiv({
				cls: `${CLASS_NAMES.DASHBOARD.METRIC_CARD} macroscalc-metric-card ${macroType}-card`,
			});

			card.createDiv({
				cls: CLASS_NAMES.DASHBOARD.METRIC_LABEL,
				text: label,
			});

			const valueContainer = card.createDiv({ cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE_CONTAINER });

			valueContainer.createDiv({
				cls: CLASS_NAMES.DASHBOARD.METRIC_VALUE,
				text: value,
			});

			// Add tooltip
			const numericValue = parseFloat(value.replace('g', ''));
			const tooltipMessage = formatDashboardTooltip(numericValue, target, label);
			safeAttachTooltip(card, tooltipMessage, this.plugin);

			valueContainer.createDiv({
				cls: CLASS_NAMES.DASHBOARD.METRIC_PERCENTAGE,
				text: `${Math.round(percentage)}%`,
			});

			// Add progress bar with the same styling as macroscalc
			const progressContainer = card.createDiv({
				cls: CLASS_NAMES.DASHBOARD.METRIC_PROGRESS_CONTAINER,
			});

			let statusClass: string = CLASS_NAMES.PROGRESS.UNDER_TARGET;
			if (percentage >= 100) {
				statusClass = CLASS_NAMES.PROGRESS.OVER_TARGET;
			} else if (percentage >= 80) {
				statusClass = CLASS_NAMES.PROGRESS.NEAR_TARGET;
			}

			const progressBar = progressContainer.createDiv({
				cls: `${CLASS_NAMES.DASHBOARD.METRIC_PROGRESS_BAR} ${macroType}-progress ${statusClass} progress-bar-width`,
			});

			const safeWidth = Math.min(100, percentage);
			const roundedWidth = Math.round(safeWidth / 5) * 5;
			progressBar.addClass(`progress-width-${roundedWidth}`);

			if (percentage > 115) {
				progressContainer.createDiv({
					cls: 'overflow-indicator',
					text: `+${Math.round(percentage - 100)}%`,
				});
			}

			const targetIndicator = progressContainer.createDiv({
				cls: `${CLASS_NAMES.DASHBOARD.METRIC_TARGET_INDICATOR} target-indicator-full`,
			});

			safeAttachTooltip(
				targetIndicator,
				`Target: ${target}${label === 'Calories' ? '' : 'g'}`,
				this.plugin
			);
		} catch (error) {
			this.plugin.logger.error(`Error creating metric card for ${label}:`, error);
		}
	}

	/**
	 * Expose method to toggle dashboard from external components
	 */
	public toggleCollapsed(isCollapsed: boolean): void {
		if (this.dashboardHeader && this.dashboardContent && this.toggleIcon) {
			// Update the UI
			if (isCollapsed) {
				this.dashboardHeader.classList.add('collapsed');
				this.dashboardContent.classList.add('collapsed');
				this.toggleIcon.classList.add('collapsed');
			} else {
				this.dashboardHeader.classList.remove('collapsed');
				this.dashboardContent.classList.remove('collapsed');
				this.toggleIcon.classList.remove('collapsed');
			}

			// Save the new state
			this.saveCollapsedState(isCollapsed);
		}
	}

	/**
	 * Clean up resources when no longer needed
	 */
	public cleanup(): void {
		this.eventManager.cleanup();
	}
}

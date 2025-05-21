import { CLASS_NAMES, MacrosState } from '../../utils';
import { AddToMacrosModal } from '../../ui';
import MacrosPlugin from '../../main';
import { EventManager } from '../../utils/EventManager';

export class TableHeader {
	private toggleButton: HTMLElement | null = null;
	private isCollapsed = false;
	private eventManager: EventManager;
	private dashboardElements: HTMLElement[] = [];

	constructor(
		private container: HTMLElement,
		private id: string | null,
		private onToggleClick: (collapse: boolean) => void,
		private plugin: MacrosPlugin
	) {
		this.eventManager = new EventManager(this.plugin);
	}

	render(): void {
		// Use the new collapsible-header class for consistent styling
		const headerContainer = this.container.createDiv({
			cls: `${CLASS_NAMES.TABLE.HEADER} collapsible-header`,
		});

		const infoSection = headerContainer.createDiv({ cls: 'header-left' });
		if (this.id) {
			infoSection.createSpan({
				cls: CLASS_NAMES.TABLE.ID_LABEL,
				text: 'ID:',
			});

			infoSection.createSpan({
				cls: CLASS_NAMES.TABLE.ID,
				text: this.id,
			});
		}

		const controls = headerContainer.createDiv({ cls: CLASS_NAMES.TABLE.CONTROLS });

		// Create the toggle button with the new toggle-icon class
		this.toggleButton = controls.createEl('span', {
			attr: { 'aria-label': 'Collapse all sections' },
			cls: 'toggle-icon',
		});

		// Initialize button classes
		this.toggleButton.addClass(CLASS_NAMES.ICONS.COLLAPSE_ALL);

		// Find the dashboard after rendering using the container's parent elements
		setTimeout(() => {
			// Find the parent macros-container if it exists
			let macrosContainer = this.container;
			// Try to navigate up until we find the macros-container
			let parent = this.container.parentElement;
			while (parent) {
				if (parent.classList && parent.classList.contains('macros-container')) {
					macrosContainer = parent;
					break;
				}
				parent = parent.parentElement;
			}

			// Look for dashboard elements within the macros container
			if (macrosContainer) {
				const dashboardHeader = macrosContainer.querySelector('.macro-dashboard-header');
				const dashboardContent = macrosContainer.querySelector('.macro-dashboard-content');
				const toggleIcon = dashboardHeader?.querySelector('.toggle-icon');

				// Add found elements to our array
				if (dashboardHeader) this.dashboardElements.push(dashboardHeader as HTMLElement);
				if (dashboardContent) this.dashboardElements.push(dashboardContent as HTMLElement);
				if (toggleIcon) this.dashboardElements.push(toggleIcon as HTMLElement);

				this.plugin.logger.debug(`Found ${this.dashboardElements.length} dashboard elements`);
			}
		}, 100);

		// Setup click handler on toggle button
		const toggleClickHandler = (e: MouseEvent) => {
			// Stop propagation to prevent the header click from triggering too
			e.stopPropagation();

			this.isCollapsed = !this.isCollapsed;
			if (this.isCollapsed) {
				this.setCollapseState();
			} else {
				this.setExpandState();
			}
			this.onToggleClick(this.isCollapsed);

			// Also toggle dashboard elements
			this.toggleDashboardElements(this.isCollapsed);
		};

		// Use the EventManager for proper cleanup
		if (this.toggleButton) {
			this.eventManager.registerDomEvent(this.toggleButton, 'click', toggleClickHandler);
		}

		// Add click handler to the entire header container
		const headerClickHandler = (e: MouseEvent) => {
			// Don't handle clicks on control buttons (like add button)
			const target = e.target as HTMLElement;
			if (
				target.classList.contains(CLASS_NAMES.ICONS.ADD) ||
				target.closest(`.${CLASS_NAMES.TABLE.CONTROLS}`)
			) {
				return;
			}

			// Toggle the collapsed state
			this.isCollapsed = !this.isCollapsed;
			if (this.isCollapsed) {
				this.setCollapseState();
			} else {
				this.setExpandState();
			}
			this.onToggleClick(this.isCollapsed);

			// Also toggle dashboard elements
			this.toggleDashboardElements(this.isCollapsed);
		};

		this.eventManager.registerDomEvent(headerContainer, 'click', headerClickHandler);

		const addBtn = controls.createEl('span', {
			cls: `${CLASS_NAMES.TABLE.CONTROL_ICON} ${CLASS_NAMES.ICONS.ADD}`,
			attr: { 'aria-label': 'Add a section' },
			text: '+',
		});

		const addBtnClickHandler = (e: MouseEvent) => {
			// Stop propagation to prevent the header click from triggering
			e.stopPropagation();

			if (this.id) {
				new AddToMacrosModal(this.plugin.app, this.plugin, this.id, async () => {
					await this.plugin.updateMacrosCodeBlock();
				}).open();
			}
		};

		this.eventManager.registerDomEvent(addBtn, 'click', addBtnClickHandler);

		// Initialize correct toggle button state based on table
		// Call this after all elements are rendered
		setTimeout(() => {
			this.initializeButtonState();
		}, 50);
	}

	private toggleDashboardElements(collapse: boolean): void {
		if (this.dashboardElements.length === 0) return;

		// Also save state for dashboard
		if (this.id && this.plugin) {
			// Create a dashboard state instance
			const dashboardState = new MacrosState(this.plugin, this.id, 'dashboard');
			// Save the state
			dashboardState.saveCollapsedState('dashboard', collapse);
			this.plugin.logger.debug(`Saved dashboard state: ${collapse} from table header`);
		}

		this.dashboardElements.forEach((element) => {
			if (element.classList.contains('macro-dashboard-header')) {
				// Toggle the header class
				if (collapse) {
					element.classList.add('collapsed');
				} else {
					element.classList.remove('collapsed');
				}
			} else if (element.classList.contains('macro-dashboard-content')) {
				// Toggle the content area
				if (collapse) {
					element.classList.add('collapsed');
				} else {
					element.classList.remove('collapsed');
				}
			} else if (element.classList.contains('toggle-icon')) {
				// Toggle the icon state
				if (collapse) {
					element.classList.add('collapsed');
				} else {
					element.classList.remove('collapsed');
				}
			}
		});
	}

	public initializeButtonState(): void {
		try {
			// Look for all section headers in the document
			const sections = document.querySelectorAll('.meal-header');

			if (sections.length === 0) {
				this.isCollapsed = false;
				this.setExpandState();
				return;
			}

			// Check if ALL sections are already collapsed
			const allSectionsCollapsed = Array.from(sections).every((section) => {
				const headerCell = section.querySelector('.meal-header-cell');
				return headerCell && headerCell.classList.contains('collapsed');
			});

			// Set button state based on sections state
			if (allSectionsCollapsed) {
				this.isCollapsed = true;
				this.setCollapseState();

				// Also collapse dashboard elements
				this.toggleDashboardElements(true);
			} else {
				this.isCollapsed = false;
				this.setExpandState();

				// Also expand dashboard elements
				this.toggleDashboardElements(false);
			}

			// Log for debugging
			this.plugin.logger.debug(
				`Initialized toggle button state: ${this.isCollapsed ? 'collapsed' : 'expanded'}`
			);
		} catch (error) {
			this.plugin.logger.error('Error initializing button state:', error);
			// Set a default state to avoid UI issues
			this.isCollapsed = false;
			this.setExpandState();
		}
	}

	public setCollapseState(): void {
		if (!this.toggleButton) return;
		try {
			// Let CSS handle the toggle appearance
			this.toggleButton.classList.add('collapsed');
			this.toggleButton.setAttribute('aria-label', 'Expand all sections');
			this.toggleButton.removeClass(CLASS_NAMES.ICONS.COLLAPSE_ALL);
			this.toggleButton.addClass(CLASS_NAMES.ICONS.EXPAND_ALL);
		} catch (error) {
			this.plugin.logger.error('Error setting collapse state:', error);
		}
	}

	public setExpandState(): void {
		if (!this.toggleButton) return;
		try {
			// Let CSS handle the toggle appearance
			this.toggleButton.classList.remove('collapsed');
			this.toggleButton.setAttribute('aria-label', 'Collapse all sections');
			this.toggleButton.removeClass(CLASS_NAMES.ICONS.EXPAND_ALL);
			this.toggleButton.addClass(CLASS_NAMES.ICONS.COLLAPSE_ALL);
		} catch (error) {
			this.plugin.logger.error('Error setting expand state:', error);
		}
	}

	/**
	 * Clean up resources when component is no longer needed
	 */
	public cleanup(): void {
		this.eventManager.cleanup();
	}
}

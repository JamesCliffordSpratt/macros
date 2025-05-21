import { MarkdownView } from 'obsidian';
import MacrosPlugin from '../main';

/**
 * RefreshManager
 * --------------
 * Centralizes all refresh and reloading functionality for the plugin.
 * Provides a unified interface for refreshing different components.
 */
export class RefreshManager {
	private plugin: MacrosPlugin;
	private refreshInProgress = false;

	constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Clean up any resources when plugin is unloaded
	 */
	cleanup(): void {
		// Currently no cleanup needed, but the method is required for consistency
	}

	/**
	 * Force a complete reload of all data and redraw all components
	 * This is the primary method that should be called when data changes
	 */
	async forceCompleteRefresh(): Promise<void> {
		if (this.refreshInProgress) {
			this.plugin.logger.debug('Refresh already in progress, skipping duplicate call');
			return;
		}

		this.refreshInProgress = true;
		this.plugin.logger.debug('Starting complete refresh of all components');

		try {
			// Step 1: Clear all caches
			this.plugin.dataManager.clearAllCaches();

			// Step 2: Find all unique IDs from all containers
			const allIds = new Set<string>();

			// Process macrospc containers
			for (const [id, _] of this.plugin.dataManager.macrospcContainers.entries()) {
				if (typeof id === 'string') {
					// Handle comma in string ID
					if (id.includes(',')) {
						id.split(',')
							.map((i) => i.trim())
							.forEach((singleId) => {
								allIds.add(singleId);
							});
					} else {
						allIds.add(id);
					}
				}
			}

			// Process macroscalc containers
			const macroscalcElements = document.querySelectorAll('[data-macroscalc-ids]');
			macroscalcElements.forEach((el) => {
				const idsAttr = el.getAttribute('data-macroscalc-ids');
				if (idsAttr) {
					idsAttr
						.split(',')
						.map((id) => id.trim())
						.forEach((id) => allIds.add(id));
				}
			});

			// Step 3: Reload fresh data for all IDs
			this.plugin.logger.debug(`Reloading data for ${allIds.size} unique IDs`);

			for (const id of allIds) {
				try {
					const loaded = await this.plugin.dataManager.getFullMacrosData(id);
					if (loaded && loaded.length > 0) {
						this.plugin.dataManager.macroTables.set(id, loaded);
						this.plugin.logger.debug(`Reloaded ${loaded.length} lines for ID ${id}`);
					} else {
						this.plugin.logger.warn(`No data found for ID ${id}`);
					}
				} catch (error) {
					this.plugin.logger.error(`Error reloading ID ${id}: ${error}`);
				}
			}

			// Step 4: Refresh all macrospc containers
			this.plugin.logger.debug('Refreshing macrospc containers');
			await this.refreshAllMacrospc();

			// Step 5: Refresh all macroscalc containers
			this.plugin.logger.debug('Refreshing macroscalc containers');
			await this.refreshAllMacroscalc();

			// Step 6: Refresh Markdown views to ensure all renderers are updated
			this.refreshMarkdownViews();

			this.plugin.logger.debug('Complete refresh finished');
		} catch (error) {
			this.plugin.logger.error('Error during complete refresh:', error);
		} finally {
			this.refreshInProgress = false;
		}
	}

	/**
	 * Refreshes all macrospc containers with fresh data
	 * This replaces the old redrawAllMacrospc method
	 */
	async refreshAllMacrospc(): Promise<void> {
		try {
			// Process each container set
			for (const [id, containerSet] of this.plugin.dataManager.macrospcContainers.entries()) {
				const aliveElements = new Set<HTMLElement>();

				for (const el of containerSet) {
					if (el.isConnected) {
						// Get IDs and dimensions from data attributes
						const idsAttr = el.getAttribute('data-ids') || id;
						const ids = idsAttr.split(',').map((i) => i.trim());

						const widthAttr = el.getAttribute('data-width');
						const heightAttr = el.getAttribute('data-height');

						const width = widthAttr ? parseInt(widthAttr) : 300;
						const height = heightAttr ? parseInt(heightAttr) : 300;

						// Redraw the chart with fresh data
						await this.plugin.chartManager.drawMacrospc(ids, el, width, height);
						aliveElements.add(el);
					}
				}

				// Update container set to only include connected elements
				this.plugin.dataManager.macrospcContainers.set(id, aliveElements);
			}
		} catch (error) {
			this.plugin.logger.error('Error refreshing macrospc containers:', error);
		}
	}

	/**
	 * Refreshes all macroscalc renderers with fresh data
	 * This replaces the old redrawAllMacrocalc method
	 */
	async refreshAllMacroscalc(): Promise<void> {
		try {
			// First, find all macroscalc elements in the DOM
			const macroscalcElements = document.querySelectorAll('[data-macroscalc-ids]');

			if (macroscalcElements.length > 0) {
				this.plugin.logger.debug(
					`Found ${macroscalcElements.length} macroscalc elements to refresh`
				);

				// Get all unique IDs that need refreshing
				const idsToRefresh = new Set<string>();

				// Collect IDs from all elements
				macroscalcElements.forEach((el) => {
					const idsAttr = el.getAttribute('data-macroscalc-ids');
					if (idsAttr) {
						idsAttr
							.split(',')
							.map((id) => id.trim())
							.forEach((id) => idsToRefresh.add(id));
					}
				});

				// Refresh data for all IDs
				for (const id of idsToRefresh) {
					const freshData = await this.plugin.dataManager.getFullMacrosData(id);
					if (freshData && freshData.length > 0) {
						this.plugin.macroService.macroTables.set(id, freshData);
						this.plugin.logger.debug(`Refreshed data for ID ${id}`);
					}
				}

				// Process each active renderer
				if (this.plugin.macroService._activeMacrosCalcRenderers) {
					for (const renderer of this.plugin.macroService._activeMacrosCalcRenderers) {
						try {
							// Mark renderer for refresh
							if (typeof renderer.setNeedsRefresh === 'function') {
								renderer.setNeedsRefresh();
							}

							// Get IDs and recalculate
							if (typeof renderer.getIds === 'function' && typeof renderer.render === 'function') {
								const ids = renderer.getIds();
								const { aggregate, breakdown } = this.plugin.processNutritionalDataFromLines(ids);
								await renderer.render(aggregate, breakdown);
							}
						} catch (error) {
							this.plugin.logger.error('Error updating macroscalc renderer:', error);
						}
					}
				}
			}
		} catch (error) {
			this.plugin.logger.error('Error refreshing macroscalc elements:', error);
		}
	}

	/**
	 * Refreshes all markdown views to trigger re-rendering of code blocks
	 */
	refreshMarkdownViews(): void {
		this.plugin.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
			const view = leaf.view as MarkdownView;
			if (view.previewMode && typeof view.previewMode.rerender === 'function') {
				view.previewMode.rerender(true);
			} else {
				leaf.setViewState(leaf.getViewState());
			}
		});
	}

	/**
	 * Directly refresh macroscalc elements in the DOM
	 * Useful for more targeted refreshes
	 */
	async refreshMacroscalcElements(): Promise<void> {
		try {
			await this.refreshAllMacroscalc();

			// Also force a trigger of the metadataCache changed event
			const activeFile = this.plugin.dataManager.getActiveFile();
			if (activeFile) {
				this.plugin.app.metadataCache.trigger('changed', activeFile);

				// Add a short delay and refresh markdown views
				setTimeout(() => {
					this.refreshMarkdownViews();
				}, 100);
			}
		} catch (error) {
			this.plugin.logger.error(`Error in refreshMacroscalcElements:`, error);
		}
	}
}

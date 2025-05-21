import MacrosPlugin from '../../main';
import { processNutritionalDataFromLines } from './calculator';
import { MacrosCalcRenderer } from './MacrosCalcRenderer';

export function registerMacrosCalcProcessor(plugin: MacrosPlugin): void {
	// Initialize the registry if needed
	if (!plugin.macroService._activeMacrosCalcRenderers) {
		plugin.macroService._activeMacrosCalcRenderers = new Set();
	}

	// Add a global event listener for refresh events
	// This is critical to ensure renderers refresh when data changes
	plugin.registerEvent(
		plugin.app.workspace.on('layout-change', () => {
			// On ANY layout change, trigger refresh of all renderers
			forceRefreshAllRenderers(plugin);
		})
	);

	// Also listen for file modifications
	plugin.registerEvent(
		plugin.app.vault.on('modify', () => {
			// When any file is modified, force refresh
			setTimeout(() => forceRefreshAllRenderers(plugin), 300); // Add delay to allow file ops to complete
		})
	);

	plugin.registerMarkdownCodeBlockProcessor(
		'macroscalc',
		async (source: string, el: HTMLElement) => {
			const lines = source
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l !== '');

			if (lines.length === 0) {
				el.createEl('div', { text: 'Error: No content provided in macroscalc block.' });
				return;
			}

			// Search for id: or ids: - support both formats
			let idsLine = lines.find(
				(line) => line.toLowerCase().startsWith('id:') || line.toLowerCase().startsWith('ids:')
			);

			if (!idsLine) {
				el.createEl('div', { text: 'Error: Please specify table IDs using "id:" or "ids:"' });
				return;
			}

			// Extract IDs from the line, accounting for both formats
			const prefix = idsLine.toLowerCase().startsWith('id:') ? 'id:' : 'ids:';
			idsLine = idsLine.substring(prefix.length).trim();

			const ids = idsLine
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);

			if (ids.length === 0) {
				el.createEl('div', { text: 'Error: No table IDs provided.' });
				return;
			}

			// Force full reload of data for each ID, including bullet points
			for (const id of ids) {
				// UPDATED: Use centralized DataManager method
				const linesWithBullets = await plugin.dataManager.getFullMacrosData(id);

				if (linesWithBullets.length > 0) {
					plugin.logger.debug(`Loaded ${linesWithBullets.length} lines for ${id} with bullets`);

					// Update the cache with these lines
					plugin.macroService.macroTables.set(id, linesWithBullets);
				} else {
					plugin.logger.warn(`Could not load data for ID ${id}`);
				}
			}

			// Now calculate with our newly updated cache that includes bullet points
			const { aggregate, breakdown } = processNutritionalDataFromLines(plugin, ids);

			// Use the enhanced renderer
			const renderer = new MacrosCalcRenderer(plugin, el, ids);

			// Add a data attribute so we can find this element later
			el.setAttribute('data-macroscalc-ids', ids.join(','));

			// Register this renderer
			plugin.macroService._activeMacrosCalcRenderers.add(renderer);

			// Setup cleanup
			plugin.registerEvent(
				plugin.app.workspace.on('layout-change', () => {
					// Check if element is still in DOM
					if (!el.isConnected || !document.contains(el)) {
						plugin.macroService._activeMacrosCalcRenderers.delete(renderer);
					}
				})
			);

			await renderer.render(aggregate, breakdown);
		}
	);

	// CRITICAL: Replace the redrawAllMacrocalc method with a more forceful version
	plugin.redrawAllMacrocalc = async function () {
		await forceRefreshAllRenderers(this);
	};
}

/**
 * Force refresh all renderers with the latest data
 * This bypasses the normal refresh mechanism for a more forceful approach
 */
async function forceRefreshAllRenderers(plugin: MacrosPlugin): Promise<void> {
	try {
		plugin.logger.debug(`Force refreshing all macroscalc renderers`);

		// First, find all macroscalc elements in the DOM
		const macroscalcElements = document.querySelectorAll('[data-macroscalc-ids]');

		if (macroscalcElements.length > 0) {
			plugin.logger.debug(`Found ${macroscalcElements.length} macroscalc elements to refresh`);

			// Process each element
			for (const el of macroscalcElements) {
				try {
					// Get the IDs this element is using
					const idsAttr = el.getAttribute('data-macroscalc-ids');
					if (!idsAttr) continue;

					const ids = idsAttr.split(',').map((id) => id.trim());
					plugin.logger.debug(`Refreshing element with IDs: ${ids.join(',')}`);

					// Force reload of all data for each ID
					for (const id of ids) {
						try {
							// UPDATED: Use centralized DataManager method
							// Get fresh data for this ID directly from the vault
							const allLines = await plugin.dataManager.getFullMacrosData(id);

							if (allLines.length > 0) {
								// Update the cache
								plugin.macroService.macroTables.set(id, allLines);
								plugin.logger.debug(`Refreshed data for ID ${id}`);
							} else {
								plugin.logger.warn(`Could not find data for ID ${id}`);
							}
						} catch (error) {
							plugin.logger.error(`Error refreshing data for ID ${id}:`, error);
						}
					}

					// Calculate fresh data
					const { aggregate, breakdown } = processNutritionalDataFromLines(plugin, ids);

					// Clear the element and create a new renderer
					(el as HTMLElement).empty();
					const renderer = new MacrosCalcRenderer(plugin, el as HTMLElement, ids);

					// Render with fresh data
					await renderer.render(aggregate, breakdown);
					plugin.logger.debug(`Re-rendered macroscalc for IDs: ${ids.join(',')}`);

					// Register the new renderer
					plugin.macroService._activeMacrosCalcRenderers.add(renderer);
				} catch (error) {
					plugin.logger.error(`Error refreshing macroscalc element:`, error);
				}
			}
		} else {
			plugin.logger.debug(`No macroscalc elements found in DOM to refresh`);
		}

		// Also clean up the renderer registry
		if (plugin.macroService._activeMacrosCalcRenderers) {
			// Create a new set with only valid renderers
			const validRenderers = new Set<any>();

			for (const renderer of plugin.macroService._activeMacrosCalcRenderers) {
				// Check if the renderer's element is still in the DOM
				if (renderer.el && renderer.el.isConnected && document.contains(renderer.el)) {
					validRenderers.add(renderer);
				}
			}

			// Replace the old set with the cleaned one
			plugin.macroService._activeMacrosCalcRenderers = validRenderers;
			plugin.logger.debug(
				`Cleaned renderer registry, now tracking ${validRenderers.size} renderers`
			);
		}
	} catch (error) {
		plugin.logger.error(`Error in forceRefreshAllRenderers:`, error);
	}
}

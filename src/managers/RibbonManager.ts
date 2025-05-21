import MacrosPlugin from '../main';
import { LiveFoodSearchModal } from '../ui';

/**
 * RibbonManager
 * ------------
 * Handles the setup of ribbon icons and their functionality.
 */
export function setupRibbon(plugin: MacrosPlugin): void {
	// Add ribbon icon for quick food search
	plugin.addRibbonIcon('apple', 'Search for food (live search)', () => {
		// Use APIService for credentials
		const apiKey = plugin.apiService.getActiveApiKey();
		const apiSecret = plugin.apiService.getActiveApiSecret();

		new LiveFoodSearchModal(
			plugin.app,
			apiKey,
			apiSecret,
			plugin.dataManager.createFoodItemCallback()
		).open();
	});

	plugin.logger.debug('Ribbon icon added');
}

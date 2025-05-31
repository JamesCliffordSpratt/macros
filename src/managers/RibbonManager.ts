import MacrosPlugin from '../main';
import { LiveFoodSearchModal } from '../ui';
import { Notice } from 'obsidian';

/**
 * RibbonManager
 * ------------
 * Handles the setup of ribbon icons and their functionality.
 */
export function setupRibbon(plugin: MacrosPlugin): void {
  // Add ribbon icon for quick food search
  plugin.addRibbonIcon('apple', 'Search for food (live search)', () => {
    try {
      // Check if API credentials are configured
      const credentials = plugin.apiService.getCredentialsSafe();
      if (!credentials) {
        new Notice(
          'API credentials not configured. Please add your FatSecret API credentials in the plugin settings to use food search.'
        );
        return;
      }

      new LiveFoodSearchModal(
        plugin.app,
        credentials.key,
        credentials.secret,
        plugin.dataManager.createFoodItemCallback()
      ).open();
    } catch (error) {
      plugin.logger.error('Error opening food search:', error);
      new Notice('Unable to open food search. Please check your API credentials in settings.');
    }
  });

  plugin.logger.debug('Ribbon icon added');
}

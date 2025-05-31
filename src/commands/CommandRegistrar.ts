import { Notice } from 'obsidian';
import MacrosPlugin from '../main';
import { LiveFoodSearchModal } from '../ui';

/**
 * CommandManager
 * -------------
 * Registers all commands for the Macros plugin.
 */
export function registerCommands(plugin: MacrosPlugin): void {
  // Command: Force reload macros (always available)
  plugin.addCommand({
    id: 'force-reload-macros',
    name: 'Force reload all macros',
    callback: async () => {
      new Notice('Forcing complete reload of all macros data...');
      await plugin.forceCompleteReload();
      new Notice('Reload complete!');
    },
  });

  // Command: Search for food (check for API credentials)
  plugin.addCommand({
    id: 'search-food-live',
    name: 'Search for food (live search)',
    callback: () => {
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
    },
  });

  // Command: Toggle debug mode (only available if developer mode is enabled)
  if (plugin.settings.developerModeEnabled) {
    plugin.addCommand({
      id: 'toggle-debug-mode',
      name: 'Toggle debug mode',
      callback: () => {
        // Toggle the current debug mode state
        const isCurrentlyEnabled = plugin.logger.getDebugMode();
        plugin.logger.setDebugMode(!isCurrentlyEnabled);
        new Notice(`Debug mode ${plugin.logger.getDebugMode() ? 'enabled' : 'disabled'}`);
      },
    });
  }

  plugin.logger.debug('Commands registered');
}

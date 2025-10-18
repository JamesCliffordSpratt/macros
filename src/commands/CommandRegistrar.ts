import { Notice } from 'obsidian';
import MacrosPlugin from '../main';
import { FoodEntrySelectionModal } from '../ui';
import { LiveFoodSearchModal } from '../ui/live-search/LiveSearchModal';
import { ManualFoodEntryModal } from '../ui/modals/ManualFoodEntryModal';

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

  // Command: Add food item (search or manual entry)
  plugin.addCommand({
    id: 'add-food-item',
    name: 'Add food item (search or manual entry)',
    callback: () => {
      try {
        new FoodEntrySelectionModal(
          plugin.app,
          plugin,
          plugin.dataManager.createFoodItemCallback()
        ).open();
      } catch (error) {
        plugin.logger.error('Error opening food entry selection:', error);
        new Notice('Unable to open food entry selection. Please try again.');
      }
    },
  });

  // Command: Direct access to Live Search modal (API search)
  plugin.addCommand({
    id: 'open-live-search',
    name: 'Search food databases (Live Search)',
    callback: () => {
      try {
        // Get API credentials for backward compatibility with LiveFoodSearchModal
        const fallbackKey = plugin.settings.fatSecretApiKey || '';
        const fallbackSecret = plugin.settings.fatSecretApiSecret || '';

        new LiveFoodSearchModal(
          plugin.app,
          fallbackKey,
          fallbackSecret,
          plugin.dataManager.createFoodItemCallback(),
          plugin
        ).open();
      } catch (error) {
        plugin.logger.error('Error opening live search modal:', error);
        new Notice('Unable to open live search. Please try again.');
      }
    },
  });

  // Command: Direct access to Manual Entry modal
  plugin.addCommand({
    id: 'open-manual-entry',
    name: 'Add food item manually (Manual Entry)',
    callback: () => {
      try {
        new ManualFoodEntryModal(
          plugin.app,
          plugin,
          plugin.dataManager.createFoodItemCallback()
        ).open();
      } catch (error) {
        plugin.logger.error('Error opening manual entry modal:', error);
        new Notice('Unable to open manual entry. Please try again.');
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

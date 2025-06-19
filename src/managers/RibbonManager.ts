import MacrosPlugin from '../main';
import { FoodEntrySelectionModal } from '../ui';
import { Notice } from 'obsidian';

/**
 * RibbonManager
 * ------------
 * Handles the setup of ribbon icons and their functionality.
 */
export function setupRibbon(plugin: MacrosPlugin): void {
  // Add ribbon icon for food entry (live search or manual entry)
  plugin.addRibbonIcon('apple', 'Add food item (search or manual entry)', () => {
    try {
      // Open the selection modal that gives users the choice between live search and manual entry
      new FoodEntrySelectionModal(
        plugin.app,
        plugin,
        plugin.dataManager.createFoodItemCallback()
      ).open();
      
    } catch (error) {
      plugin.logger.error('Error opening food entry selection:', error);
      new Notice('Unable to open food entry selection. Please try again.');
    }
  });

  plugin.logger.debug('Ribbon icon added');
}
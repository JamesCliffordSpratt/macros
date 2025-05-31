import MacrosPlugin from '../main';
import { NutritionalSettingTab } from './StorageService';

/**
 * SettingManager
 * --------------
 * Handles settings initialization and registration for the Macros plugin.
 */
export function setupSettings(plugin: MacrosPlugin): void {
  // Create settings tab instance
  plugin.nutritionalSettingTab = new NutritionalSettingTab(plugin.app, plugin);

  // Add tab to Obsidian settings
  plugin.addSettingTab(plugin.nutritionalSettingTab);

  plugin.logger.debug('Settings tab registered');
}

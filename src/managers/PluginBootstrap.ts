import MacrosPlugin from '../main';
import { setupSettings } from '../settings/SettingsManager';
import { registerProcessors } from './ProcessorManager';
import { registerCommands } from '../commands/CommandRegistrar';
import { setupRibbon } from './RibbonManager';
import { ManagerRegistry } from './ManagerRegistry';

/**
 * Handles the complete initialization sequence for the plugin.
 * This centralizes bootstrap logic outside of the main plugin class.
 */
export async function initializePlugin(plugin: MacrosPlugin): Promise<void> {
  // First load settings
  await plugin.loadSettings();

  // Initialize all managers through registry (including I18n)
  await ManagerRegistry.initAll(plugin);

  // Make sure the logger respects the developer mode setting
  plugin.logger.setDebugMode(plugin.settings.developerModeEnabled);

  // Setup components in dependency order
  setupSettings(plugin);
  setupRibbon(plugin);
  registerCommands(plugin);
  registerProcessors(plugin);

  // Log successful initialization
  plugin.logger.debug('Plugin initialized successfully');
}

/**
 * Handles the complete shutdown sequence for the plugin.
 * This centralizes cleanup logic outside of the main plugin class.
 */
export function shutdownPlugin(plugin: MacrosPlugin): void {
  // Clean up all managers through registry
  ManagerRegistry.unloadAll(plugin);

  plugin.logger.debug('Plugin shutdown complete');
}

import MacrosPlugin from '../main';
import { Logger, UIManager } from './';
import { MacroService } from '../macros/MacroService';
import { DataManager } from './DataManager';
import { ChartManager } from './ChartManager';
import { RefreshManager } from './RefreshManager';
import { APIService } from '../core/APIService';
import { I18nManager } from '../lang/I18nManager';

/**
 * ManagerRegistry
 * ---------------
 * Centralizes the initialization and cleanup of all managers.
 * This reduces code in the main plugin class and ensures consistent lifecycle management.
 */
export class ManagerRegistry {
  /**
   * Initialize all managers
   */
  static async initAll(plugin: MacrosPlugin): Promise<void> {
    // Initialize in dependency order
    plugin.logger = Logger.init(plugin);

    // Initialize I18n manager early so other components can use translations
    plugin.i18nManager = I18nManager.init(plugin);
    await plugin.i18nManager.initialize();

    plugin.uiManager = UIManager.init(plugin);
    plugin.macroService = MacroService.init(plugin);
    plugin.apiService = APIService.init(plugin);
    plugin.dataManager = new DataManager(plugin);
    plugin.chartManager = new ChartManager(plugin);
    plugin.refreshManager = new RefreshManager(plugin);

    // Register file system event handlers
    plugin.registerEvent(
      plugin.app.vault.on('modify', () => plugin.dataManager.invalidateFileCache())
    );
    plugin.registerEvent(
      plugin.app.vault.on('create', () => plugin.dataManager.invalidateFileCache())
    );
    plugin.registerEvent(
      plugin.app.vault.on('delete', () => plugin.dataManager.invalidateFileCache())
    );
    plugin.registerEvent(
      plugin.app.vault.on('rename', () => plugin.dataManager.invalidateFileCache())
    );

    plugin.logger.debug('All managers initialized');
  }

  /**
   * Clean up all managers
   */
  static unloadAll(plugin: MacrosPlugin): void {
    // Clean up in reverse dependency order
    plugin.refreshManager?.refreshMarkdownViews();
    plugin.chartManager?.cleanup?.();
    plugin.dataManager?.cleanup?.();
    MacroService.unload();
    APIService.unload();
    I18nManager.unload(); // Clean up I18n manager
    UIManager.unload();
    Logger.unload();

    plugin.logger?.debug?.('All managers unloaded');
  }
}

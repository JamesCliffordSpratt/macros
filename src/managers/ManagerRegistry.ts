import MacrosPlugin from '../main';
import { Logger, UIManager } from './';
import { MacroService } from '../macros/MacroService';
import { DataManager } from './DataManager';
import { ChartManager } from './ChartManager';
import { RefreshManager } from './RefreshManager';
import { APIService } from '../core/APIService';

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
  static initAll(plugin: MacrosPlugin): void {
    // Initialize in dependency order
    plugin.logger = Logger.init(plugin);
    plugin.uiManager = UIManager.init(plugin);
    plugin.macroService = MacroService.init(plugin);
    plugin.apiService = APIService.init(plugin); // Add the APIService
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
    APIService.unload(); // Add APIService cleanup
    UIManager.unload();
    Logger.unload();

    plugin.logger?.debug?.('All managers unloaded');
  }
}

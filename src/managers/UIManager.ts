import MacrosPlugin from '../main';
import { TooltipManager } from '../utils';
import { IDSuggestionManager } from './IDSuggestionManager';
import { Notice } from 'obsidian';

export class UIManager {
  private plugin: MacrosPlugin;
  private static instance: UIManager | null = null;
  private idSuggestionManager: IDSuggestionManager | null = null;

  private constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
  }

  static init(plugin: MacrosPlugin): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager(plugin);

      // Initialize the tooltip system
      TooltipManager.initGlobalTooltipSystem(plugin);

      // Initialize the ID suggestion system
      UIManager.instance.idSuggestionManager = new IDSuggestionManager(plugin);
      UIManager.instance.idSuggestionManager.initialize();

      // Register global event listeners for tooltips using Obsidian's API
      plugin.registerEvent(
        plugin.app.workspace.on('active-leaf-change', () => TooltipManager.forceHide())
      );
      plugin.registerEvent(
        plugin.app.workspace.on('layout-change', () => TooltipManager.forceHide())
      );
    }
    return UIManager.instance;
  }

  static getInstance(): UIManager | null {
    return UIManager.instance;
  }

  static unload(): void {
    if (UIManager.instance) {
      UIManager.instance.cleanup();
      UIManager.instance = null;
    }
  }

  cleanup(): void {
    // Clean up tooltip system
    TooltipManager.cleanup();

    // Clean up ID suggestion system
    if (this.idSuggestionManager) {
      this.idSuggestionManager.cleanup();
      this.idSuggestionManager = null;
    }
  }

  showNotice(message: string, timeout?: number): Notice {
    return new Notice(message, timeout);
  }

  // Helper method to check if UI manager is initialized
  static isInitialized(): boolean {
    return UIManager.instance !== null;
  }
}

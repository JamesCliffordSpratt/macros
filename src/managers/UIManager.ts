import MacrosPlugin from '../main';
import { TooltipManager } from '../utils';
import { Notice } from 'obsidian';

/**
 * UIManager
 * ---------
 * Centralizes UI-related functionality such as tooltips,
 * notifications, and modal management.
 */
export class UIManager {
	private plugin: MacrosPlugin;
	private static instance: UIManager;

	private constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Initialize the UI manager
	 */
	static init(plugin: MacrosPlugin): UIManager {
		if (!this.instance) {
			this.instance = new UIManager(plugin);

			// Initialize the tooltip system
			TooltipManager.initGlobalTooltipSystem(plugin);

			// Register global event listeners for tooltips using Obsidian's API
			plugin.registerEvent(
				plugin.app.workspace.on('active-leaf-change', () => TooltipManager.hide())
			);
			plugin.registerEvent(plugin.app.workspace.on('layout-change', () => TooltipManager.hide()));
		}
		return this.instance;
	}

	/**
	 * Clean up resources when plugin is unloaded
	 */
	static unload(): void {
		if (this.instance) {
			TooltipManager.cleanup();
			this.instance = null;
		}
	}

	/**
	 * Cleanup handled by plugin's onunload - no explicit cleanup needed
	 */
	cleanup(): void {
		TooltipManager.cleanup();
	}

	/**
	 * Show a notification to the user
	 */
	showNotice(message: string, timeout?: number): Notice {
		return new Notice(message, timeout);
	}
}

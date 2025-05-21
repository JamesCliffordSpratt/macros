import MacrosPlugin from '../main';

/**
 * Logger
 * ------
 * A singleton class for managing logging throughout the plugin.
 * Enables debug mode to be toggled centrally.
 */
export class Logger {
	private static instance: Logger;
	private debugMode = false;
	private plugin: MacrosPlugin;

	private constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Initialize the logger
	 */
	static init(plugin: MacrosPlugin): Logger {
		if (!this.instance) {
			this.instance = new Logger(plugin);
			// Initialize debug mode from settings
			this.instance.setDebugMode(plugin.settings.developerModeEnabled);
		}
		return this.instance;
	}

	/**
	 * Clean up resources when plugin is unloaded
	 */
	static unload(): void {
		this.instance = null;
	}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): Logger {
		if (!this.instance) {
			throw new Error('Logger not initialized. Call Logger.init(plugin) first.');
		}
		return this.instance;
	}

	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	getDebugMode(): boolean {
		return this.debugMode;
	}

	debug(message: string, ...args: unknown[]): void {
		if (this.debugMode) {
			console.debug(`[Macros Debug] ${message}`, ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (this.debugMode) {
			console.info(`[Macros Info] ${message}`, ...args);
		}
	}

	error(message: string, ...args: unknown[]): void {
		console.error(`[Macros Error] ${message}`, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		console.warn(`[Macros Warning] ${message}`, ...args);
	}
}

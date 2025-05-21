import MacrosPlugin from '../main';

export class APIService {
	private static instance: APIService;
	private plugin: MacrosPlugin;

	// Default credentials directly in code (no longer encrypted)
	private DEFAULT_FAT_SECRET_API_KEY = '4430c3c828c04907bc8b559418435673';
	private DEFAULT_FAT_SECRET_API_SECRET = '3c1642f19f8a456684d9f4d467466194';

	private constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
	}

	static init(plugin: MacrosPlugin): APIService {
		if (!this.instance) {
			this.instance = new APIService(plugin);
		}
		return this.instance;
	}

	static unload(): void {
		this.instance = null;
	}

	/**
	 * Get the default API key for FatSecret integration
	 */
	getDefaultApiKey(): string {
		return this.DEFAULT_FAT_SECRET_API_KEY;
	}

	/**
	 * Get the default API secret for FatSecret integration
	 */
	getDefaultApiSecret(): string {
		return this.DEFAULT_FAT_SECRET_API_SECRET;
	}

	/**
	 * Get active API key (user-provided or default)
	 */
	getActiveApiKey(): string {
		return this.plugin.settings.fatSecretApiKey?.trim() || this.DEFAULT_FAT_SECRET_API_KEY;
	}

	/**
	 * Get active API secret (user-provided or default)
	 */
	getActiveApiSecret(): string {
		return this.plugin.settings.fatSecretApiSecret?.trim() || this.DEFAULT_FAT_SECRET_API_SECRET;
	}
}

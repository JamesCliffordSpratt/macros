import MacrosPlugin from '../main';

export class APIService {
  private static instance: APIService;
  private plugin: MacrosPlugin;

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
   * Check if API credentials are configured
   */
  hasApiCredentials(): boolean {
    const key = this.plugin.settings.fatSecretApiKey?.trim();
    const secret = this.plugin.settings.fatSecretApiSecret?.trim();
    return !!(key && secret);
  }

  /**
   * Get active API key (user-provided only)
   */
  getActiveApiKey(): string {
    const key = this.plugin.settings.fatSecretApiKey?.trim();
    if (!key) {
      throw new Error(
        'API key not configured. Please add your FatSecret API credentials in settings.'
      );
    }
    return key;
  }

  /**
   * Get active API secret (user-provided only)
   */
  getActiveApiSecret(): string {
    const secret = this.plugin.settings.fatSecretApiSecret?.trim();
    if (!secret) {
      throw new Error(
        'API secret not configured. Please add your FatSecret API credentials in settings.'
      );
    }
    return secret;
  }

  /**
   * Get credentials safely - returns null if not configured
   */
  getCredentialsSafe(): { key: string; secret: string } | null {
    const key = this.plugin.settings.fatSecretApiKey?.trim();
    const secret = this.plugin.settings.fatSecretApiSecret?.trim();

    if (!key || !secret) {
      return null;
    }

    return { key, secret };
  }
}

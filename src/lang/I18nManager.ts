import { App } from 'obsidian';
import MacrosPlugin from '../main';
import { enTranslations } from './translations/en';
import { esTranslations } from './translations/es';
import { zhCNTranslations } from './translations/zh-CN';

export interface LocaleData {
  [key: string]: string | LocaleData;
}

export interface SupportedLocale {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  contributors?: string[];
}

// FIX: Define interfaces for type safety instead of using 'any'
interface ObsidianAppWithConfig {
  vault?: {
    config?: {
      userInterfaceMode?: string;
    };
  };
  locale?: string;
}

interface WindowWithMoment {
  moment?: {
    locale?: () => string;
  };
}

interface GlobalWithMoment {
  moment?: {
    locale?: () => string;
  };
}

/**
 * I18nManager
 * -----------
 * Handles all localization functionality for the Macros plugin.
 * Provides methods for loading locale files, translating strings,
 * and managing locale switching.
 */
export class I18nManager {
  private plugin: MacrosPlugin;
  private app: App;
  private currentLocale = 'en';
  private fallbackLocale = 'en';
  private translations: Map<string, LocaleData> = new Map();
  private supportedLocales: Map<string, SupportedLocale> = new Map();
  private static instance: I18nManager;

  private constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.initializeSupportedLocales();
  }

  /**
   * Initialize the I18n manager
   */
  static init(plugin: MacrosPlugin): I18nManager {
    if (!this.instance) {
      this.instance = new I18nManager(plugin);
    }
    return this.instance;
  }

  /**
   * Clean up resources when plugin is unloaded
   */
  static unload(): void {
    this.instance = null as unknown as I18nManager;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): I18nManager {
    if (!this.instance) {
      throw new Error('I18nManager not initialized. Call I18nManager.init(plugin) first.');
    }
    return this.instance;
  }

  /**
   * Initialize supported locales registry
   */
  private initializeSupportedLocales(): void {
    // English (default)
    this.supportedLocales.set('en', {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      direction: 'ltr',
      contributors: ['Plugin Author'],
    });

    // Spanish
    this.supportedLocales.set('es', {
      code: 'es',
      name: 'Spanish',
      nativeName: 'Español',
      direction: 'ltr',
      contributors: [],
    });

    // French
    this.supportedLocales.set('fr', {
      code: 'fr',
      name: 'French',
      nativeName: 'Français',
      direction: 'ltr',
      contributors: [],
    });

    // German
    this.supportedLocales.set('de', {
      code: 'de',
      name: 'German',
      nativeName: 'Deutsch',
      direction: 'ltr',
      contributors: [],
    });

    // Italian
    this.supportedLocales.set('it', {
      code: 'it',
      name: 'Italian',
      nativeName: 'Italiano',
      direction: 'ltr',
      contributors: [],
    });

    // Portuguese
    this.supportedLocales.set('pt', {
      code: 'pt',
      name: 'Portuguese',
      nativeName: 'Português',
      direction: 'ltr',
      contributors: [],
    });

    // Japanese
    this.supportedLocales.set('ja', {
      code: 'ja',
      name: 'Japanese',
      nativeName: '日本語',
      direction: 'ltr',
      contributors: [],
    });

    // Korean
    this.supportedLocales.set('ko', {
      code: 'ko',
      name: 'Korean',
      nativeName: '한국어',
      direction: 'ltr',
      contributors: [],
    });

    // Chinese Simplified
    this.supportedLocales.set('zh-CN', {
      code: 'zh-CN',
      name: 'Chinese Simplified',
      nativeName: '简体中文',
      direction: 'ltr',
      contributors: [],
    });

    // Chinese Traditional
    this.supportedLocales.set('zh-TW', {
      code: 'zh-TW',
      name: 'Chinese Traditional',
      nativeName: '繁體中文',
      direction: 'ltr',
      contributors: [],
    });

    // Russian
    this.supportedLocales.set('ru', {
      code: 'ru',
      name: 'Russian',
      nativeName: 'Русский',
      direction: 'ltr',
      contributors: [],
    });

    // Arabic
    this.supportedLocales.set('ar', {
      code: 'ar',
      name: 'Arabic',
      nativeName: 'العربية',
      direction: 'rtl',
      contributors: [],
    });

    // Hebrew
    this.supportedLocales.set('he', {
      code: 'he',
      name: 'Hebrew',
      nativeName: 'עברית',
      direction: 'rtl',
      contributors: [],
    });
  }

  /**
   * Initialize the localization system
   */
  async initialize(): Promise<void> {
    try {
      // Detect user's preferred locale from Obsidian settings
      const detectedLocale = this.detectUserLocale();

      // Use detected locale (no user override needed since we follow Obsidian's settings)
      await this.setLocale(detectedLocale);

      this.plugin.logger.debug(`I18n initialized with locale: ${this.currentLocale}`);
    } catch (error) {
      this.plugin.logger.error('Error initializing I18n:', error);
      // Fall back to English if initialization fails
      await this.setLocale('en');
    }
  }

  /**
   * Detect the user's preferred locale from Obsidian settings
   */
  private detectUserLocale(): string {
    try {
      // FIX: Use typed interfaces instead of 'any'
      const obsidianLocale =
        this.getMomentLocale() || // Use existing safe method
        document.documentElement.lang ||
        (this.app as ObsidianAppWithConfig).vault?.config?.userInterfaceMode ||
        (this.app as ObsidianAppWithConfig).locale;

      this.plugin.logger.debug(`Detected Obsidian locale: ${obsidianLocale}`);

      if (obsidianLocale) {
        // Handle Chinese locale variants - map both to zh-CN
        if (obsidianLocale.toLowerCase().startsWith('zh')) {
          this.plugin.logger.debug(`Mapping Chinese variant ${obsidianLocale} to zh-CN`);
          return 'zh-CN';
        }

        // Check if exactly supported
        if (this.isLocaleSupported(obsidianLocale)) {
          return obsidianLocale;
        }

        // Try language code only (e.g., en-GB -> en)
        const languageCode = obsidianLocale.split('-')[0].toLowerCase();
        if (this.isLocaleSupported(languageCode)) {
          this.plugin.logger.debug(`Using language code: ${languageCode}`);
          return languageCode;
        }
      }

      // Fallback to browser locale
      const browserLocale = navigator.language || navigator.languages?.[0];
      if (browserLocale) {
        if (this.isLocaleSupported(browserLocale)) {
          return browserLocale;
        }

        const languageCode = browserLocale.split('-')[0];
        if (this.isLocaleSupported(languageCode)) {
          return languageCode;
        }
      }
    } catch (error) {
      this.plugin.logger.debug('Error detecting user locale:', error);
    }

    this.plugin.logger.debug(`Falling back to default locale: ${this.fallbackLocale}`);
    return this.fallbackLocale;
  }

  /**
   * Safely get moment.js locale if available
   */
  private getMomentLocale(): string | null {
    try {
      // FIX: Use typed interfaces for window and global moment access
      // Check if moment is available on window object
      if (typeof window !== 'undefined' && (window as WindowWithMoment).moment) {
        const momentInstance = (window as WindowWithMoment).moment;
        if (momentInstance?.locale && typeof momentInstance.locale === 'function') {
          return momentInstance.locale();
        }
      }

      // Check global moment
      if (typeof (globalThis as GlobalWithMoment).moment !== 'undefined') {
        const momentInstance = (globalThis as GlobalWithMoment).moment;
        if (momentInstance?.locale && typeof momentInstance.locale === 'function') {
          return momentInstance.locale();
        }
      }

      return null;
    } catch (error) {
      this.plugin.logger.debug('Error getting moment locale:', error);
      return null;
    }
  }

  /**
   * Check if a locale is supported
   */
  private isLocaleSupported(locale: string): boolean {
    return this.supportedLocales.has(locale);
  }

  /**
   * Load locale data from external translation files
   */
  private async loadLocaleData(locale: string): Promise<LocaleData> {
    try {
      // Get translations from external files
      const translations = this.getTranslationsFromFile(locale);

      if (Object.keys(translations).length > 0) {
        this.plugin.logger.debug(`Loaded translations for ${locale}`);
        return translations;
      }

      // If no translations found, log and return empty
      this.plugin.logger.debug(`No translations found for ${locale}`);
      return {};
    } catch (error) {
      this.plugin.logger.error(`Error loading locale data for ${locale}:`, error);
      return {};
    }
  }

  /**
   * Get translations from external language files
   */
  private getTranslationsFromFile(locale: string): LocaleData {
    const translationMap: Record<string, LocaleData> = {
      en: enTranslations,
      es: esTranslations,
      'zh-CN': zhCNTranslations,
      // Add more languages here as they become available
    };

    return translationMap[locale] || {};
  }

  /**
   * Set the current locale and load its translations
   */
  async setLocale(locale: string): Promise<void> {
    try {
      if (!this.isLocaleSupported(locale)) {
        this.plugin.logger.warn(
          `Unsupported locale: ${locale}, falling back to ${this.fallbackLocale}`
        );
        locale = this.fallbackLocale;
      }

      // Load locale data
      const localeData = await this.loadLocaleData(locale);

      // If locale is not English and has no data, fall back to English
      if (locale !== this.fallbackLocale && Object.keys(localeData).length === 0) {
        this.plugin.logger.warn(
          `No translations found for ${locale}, falling back to ${this.fallbackLocale}`
        );
        locale = this.fallbackLocale;
        const fallbackData = await this.loadLocaleData(locale);
        this.translations.set(locale, fallbackData);
      } else {
        this.translations.set(locale, localeData);
      }

      this.currentLocale = locale;

      this.plugin.logger.debug(`Locale set to: ${locale}`);
    } catch (error) {
      this.plugin.logger.error(`Error setting locale to ${locale}:`, error);
      throw error;
    }
  }

  /**
   * Get translated string with interpolation support
   */
  t(key: string, interpolations?: Record<string, string | number>): string {
    try {
      // Debug logging
      this.plugin.logger.debug(`Translating key: ${key} for locale: ${this.currentLocale}`);

      const value = this.getTranslation(key);
      this.plugin.logger.debug(
        `Translation result: ${typeof value === 'string' ? value : 'NOT_STRING'}`
      );

      if (interpolations && typeof value === 'string') {
        return this.interpolate(value, interpolations);
      }

      return typeof value === 'string' ? value : key;
    } catch (error) {
      this.plugin.logger.error(`Translation error for key "${key}":`, error);
      return key;
    }
  }

  /**
   * Get translation value by key path
   */
  private getTranslation(key: string): string | LocaleData {
    const currentTranslations = this.translations.get(this.currentLocale);
    const fallbackTranslations = this.translations.get(this.fallbackLocale);

    // Try current locale first
    let value = this.getNestedValue(currentTranslations, key);

    // Fall back to fallback locale if not found
    if (value === undefined && this.currentLocale !== this.fallbackLocale) {
      value = this.getNestedValue(fallbackTranslations, key);
    }

    return value ?? key;
  }

  /**
   * Get nested value from object using dot notation
   * FIX: Use proper typing for the reducer function
   */
  private getNestedValue(
    obj: LocaleData | undefined,
    path: string
  ): string | LocaleData | undefined {
    if (!obj) return undefined;

    return path.split('.').reduce((current: string | LocaleData | undefined, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return current[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Interpolate variables in translation strings
   */
  private interpolate(template: string, variables: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key]?.toString() ?? match;
    });
  }

  /**
   * Get all supported locales
   */
  getSupportedLocales(): SupportedLocale[] {
    return Array.from(this.supportedLocales.values());
  }

  /**
   * Get current locale code
   */
  getCurrentLocale(): string {
    return this.currentLocale;
  }

  /**
   * Get current locale info
   */
  getCurrentLocaleInfo(): SupportedLocale | undefined {
    return this.supportedLocales.get(this.currentLocale);
  }

  /**
   * Check if current locale uses RTL direction
   */
  isRTL(): boolean {
    const localeInfo = this.getCurrentLocaleInfo();
    return localeInfo?.direction === 'rtl';
  }

  /**
   * Get available locales that have translation data
   */
  getAvailableLocales(): SupportedLocale[] {
    // Return locales that have external translation files
    const availableLocaleCodes = ['en', 'es', 'zh-CN']; // Add more as translations are added

    return availableLocaleCodes
      .map((code) => this.supportedLocales.get(code))
      .filter((locale): locale is SupportedLocale => locale !== undefined);
  }
}

// Convenience function for getting translations
export function t(key: string, interpolations?: Record<string, string | number>): string {
  try {
    return I18nManager.getInstance().t(key, interpolations);
  } catch (error) {
    // If I18nManager is not initialized, return the key
    return key;
  }
}

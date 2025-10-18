/**
 * Enhanced settings schema with Open Food Facts support and food tolerances
 * This updates the existing settingsSchema.ts file
 */
import { PluginSettings } from './StorageService';

export const DEFAULT_SETTINGS: PluginSettings = {
  storageFolder: 'Nutrition',
  proteinColor: '#4caf50',
  fatColor: '#f44336',
  carbsColor: '#2196f3',
  mealTemplates: [],
  fatSecretApiKey: '', // Users must configure their own API credentials
  fatSecretApiSecret: '', // Users must configure their own API credentials
  fatSecretEnabled: true, // Enable FatSecret by default if credentials are present
  usdaEnabled: false, // USDA disabled by default
  usdaApiKey: '', // Users must configure their own USDA API key
  // NEW: Open Food Facts settings
  openFoodFactsEnabled: true, // Enabled by default (no API key required)
  openFoodFactsLanguage: 'auto', // 'auto' uses Obsidian's language, or specific like 'en', 'fr', etc.
  openFoodFactsDataQualityFilter: 'medium', // 'all', 'medium', 'high' - minimum quality threshold
  dailyCaloriesTarget: 2000,
  dailyProteinTarget: 150,
  dailyFatTarget: 65,
  dailyCarbsTarget: 250,
  showSummaryRows: false,
  disableTooltips: false,
  showCellPercentages: false,
  developerModeEnabled: false,
  uiCollapseStates: {},
  energyUnit: 'kcal',
  addToMacrosTabOrder: ['meals', 'foods', 'group'],
  // Rename tracking settings
  followRenamesEnabled: true,
  autoConfirmRenames: false,
  backupOnRename: true,
  caseSensitiveFoodMatch: true,
  includeAliasesOnRename: false,
  // Macroscalc metrics configuration
  macroscalcMetricsConfigs: [],
  // NEW: Food tolerances/intolerances
  foodTolerances: {},
};

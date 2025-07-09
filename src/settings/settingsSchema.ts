/**
 * Default settings schema for the Macros plugin
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
  dailyCaloriesTarget: 2000,
  dailyProteinTarget: 150,
  dailyFatTarget: 65,
  dailyCarbsTarget: 250,
  showSummaryRows: false,
  disableTooltips: false,
  showCellPercentages: false,
  developerModeEnabled: false,
  uiCollapseStates: {},
  energyUnit: 'kcal', // New setting for energy unit
};

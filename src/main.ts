import { Plugin, TFile } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './settings/StorageService';
import { initializePlugin, shutdownPlugin } from './managers/PluginBootstrap';
import { NutritionalSettingTab } from './settings/StorageService';
import { setFormatterPlugin } from './utils/formatters';
import {
  Logger,
  DataManager,
  RefreshManager,
  ChartManager,
  UIManager,
  MacroService,
  APIService,
} from './managers';
import { I18nManager } from './lang/I18nManager';

/**
 * Macros Plugin
 * -------------------------
 * This plugin integrates nutritional data fetching and processing into Obsidian.
 */
export default class MacrosPlugin extends Plugin {
  settings!: PluginSettings;
  nutritionalSettingTab!: NutritionalSettingTab;
  logger!: Logger;

  // Managers
  dataManager!: DataManager;
  chartManager!: ChartManager;
  refreshManager!: RefreshManager;
  uiManager!: UIManager;
  macroService!: MacroService;
  apiService!: APIService;
  i18nManager!: I18nManager;

  // Track DOM event listeners separately
  private domEventListeners: Array<{ unbind: () => void }> = [];

  /**
   * Plugin lifecycle: load
   */
  async onload() {
    // Bootstrap all plugin functionality
    await initializePlugin(this);

    // Set the plugin instance for formatters to access settings
    setFormatterPlugin(this);
  }

  /**
   * Plugin lifecycle: unload
   */
  onunload(): void {
    // Clean up all resources through the ManagerRegistry
    shutdownPlugin(this);

    // Clean up any DOM event listeners we registered directly
    this.cleanupDomEventListeners();

    // Make sure each manager's cleanup method is called
    // This is already done in shutdownPlugin/ManagerRegistry, but let's be explicit here:
    this.refreshManager?.cleanup?.();
    this.chartManager?.cleanup?.();
    this.dataManager?.cleanup?.();
    this.uiManager?.cleanup?.();

    this.logger.debug('Plugin shutdown complete');
  }

  /**
   * Register a DOM event handler with proper cleanup
   */
  registerDomListener(el: HTMLElement, type: string, handler: EventListener): void {
    // Add the event listener
    el.addEventListener(type, handler);

    // Track it for cleanup with an unbind function
    this.domEventListeners.push({
      unbind: () => el.removeEventListener(type, handler),
    });
  }

  /**
   * Clean up all registered DOM event listeners
   */
  private cleanupDomEventListeners(): void {
    for (const listener of this.domEventListeners) {
      try {
        listener.unbind();
      } catch (error) {
        this.logger.error(`Error removing event listener:`, error);
      }
    }
    this.domEventListeners = [];
  }

  /**
   * Loads plugin settings.
   */
  async loadSettings() {
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(await this.loadData()) };

    // Ensure uiCollapseStates exists after loading
    if (!this.settings.uiCollapseStates) {
      this.settings.uiCollapseStates = {};
    }

    // Ensure energyUnit exists and has a default value
    if (!this.settings.energyUnit) {
      this.settings.energyUnit = 'kcal';
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async calculateMacrosFromLinesAsync(
    lines: string[]
  ): Promise<{ protein: number; fat: number; carbs: number; calories: number }> {
    return this.macroService.calculateMacrosFromLinesAsync(lines);
  }

  processNutritionalDataFromLines(ids: string[]): {
    aggregate: { calories: number; protein: number; fat: number; carbs: number };
    breakdown: {
      id: string;
      totals: { calories: number; protein: number; fat: number; carbs: number };
    }[];
  } {
    // CRITICAL FIX: Use the MacroService method which has the merging logic
    return this.macroService.processNutritionalDataFromLines(ids);
  }

  getActualCaloriesFromItems(id: string): number {
    return this.macroService.getActualCaloriesFromItems(id);
  }

  findFoodFile(foodQuery: string): TFile | null {
    return this.macroService.findFoodFile(foodQuery);
  }

  async forceCompleteReload(): Promise<void> {
    return this.refreshManager.forceCompleteRefresh();
  }

  refreshMacrosTables() {
    this.refreshManager.refreshMarkdownViews();
  }

  async updateMacrosCodeBlock() {
    return this.dataManager.updateMacrosCodeBlock();
  }

  async loadMacroTableFromVault(id: string) {
    return this.dataManager.loadMacroTableFromVault(id);
  }

  async getFullMacrosData(id: string) {
    return this.dataManager.getFullMacrosData(id);
  }

  async drawMacrospc(id: string | string[], el: HTMLElement, width = 300, height = 300) {
    return this.chartManager.drawMacrospc(id, el, width, height);
  }

  async redrawAllMacrospc() {
    return this.refreshManager.refreshAllMacrospc();
  }

  async redrawAllMacrocalc() {
    return this.refreshManager.refreshAllMacroscalc();
  }
}

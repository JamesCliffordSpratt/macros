import type MacrosPlugin from '../main';

/**
 * Unified State Manager that stores UI state inside plugin settings (data.json)
 */
export class MacrosState {
  private plugin: MacrosPlugin;
  private pluginId: string;
  private stateType: string;
  private id: string;

  constructor(plugin: MacrosPlugin, id: string, stateType: string) {
    this.plugin = plugin;
    this.id = id;
    this.stateType = stateType;
    this.pluginId = plugin.manifest.id;
  }

  private getKey(sectionName: string): string {
    return `${this.pluginId}:${this.stateType}:${this.id}:${sectionName}`;
  }

  /** Save collapsed/expanded state to plugin settings */
  saveCollapsedState(sectionName: string, isCollapsed: boolean): void {
    const key = this.getKey(sectionName);
    if (!this.plugin.settings.uiCollapseStates) {
      this.plugin.settings.uiCollapseStates = {};
    }
    this.plugin.settings.uiCollapseStates[key] = isCollapsed;
    this.plugin.saveSettings();
  }

  /** Load collapsed/expanded state from plugin settings */
  getCollapsedState(sectionName: string): boolean {
    const key = this.getKey(sectionName);
    return this.plugin.settings.uiCollapseStates?.[key] ?? false;
  }

  /** Clear all states for this component */
  clearState(): void {
    const prefix = `${this.pluginId}:${this.stateType}:${this.id}:`;
    const states = this.plugin.settings.uiCollapseStates ?? {};
    for (const key of Object.keys(states)) {
      if (key.startsWith(prefix)) {
        delete states[key];
      }
    }
    this.plugin.saveSettings();
  }

  /** Clear all states for the entire plugin */
  static clearAllStates(plugin: MacrosPlugin): void {
    const prefix = `${plugin.manifest.id}:`;
    const states = plugin.settings.uiCollapseStates ?? {};
    for (const key of Object.keys(states)) {
      if (key.startsWith(prefix)) {
        delete states[key];
      }
    }
    plugin.saveSettings();
  }

  /**
   * Static convenience methods for chart state management
   * These replace the MacrosPCState functionality
   */

  static getChartCollapsedState(chartId: string, plugin: MacrosPlugin): boolean {
    const stateManager = new MacrosState(plugin, chartId, 'chart');
    return stateManager.getCollapsedState('dashboard');
  }

  static saveChartCollapsedState(
    chartId: string,
    plugin: MacrosPlugin,
    isCollapsed: boolean
  ): void {
    const stateManager = new MacrosState(plugin, chartId, 'chart');
    stateManager.saveCollapsedState('dashboard', isCollapsed);
  }
}

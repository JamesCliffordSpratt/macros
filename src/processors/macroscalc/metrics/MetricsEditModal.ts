import { Modal } from 'obsidian';
import MacrosPlugin from '../../../main';
import { MetricsRegistry, MetricConfig } from './MetricsRegistry';
import { t } from '../../../lang/I18nManager';

export class MetricsEditModal extends Modal {
  private plugin: MacrosPlugin;
  private configs: MetricConfig[];
  private onSave: (configs: MetricConfig[]) => void;
  private registry: MetricsRegistry;
  private workingConfigs: MetricConfig[]; // Working copy for the modal

  constructor(
    plugin: MacrosPlugin,
    configs: MetricConfig[],
    onSave: (configs: MetricConfig[]) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.configs = configs;
    this.onSave = onSave;
    this.registry = MetricsRegistry.getInstance();

    // Create a deep copy of configs to work with
    this.workingConfigs = this.createWorkingConfigs();
  }

  private createWorkingConfigs(): MetricConfig[] {
    // Get all available metrics
    const allMetrics = this.registry.getAll();
    const workingConfigs: MetricConfig[] = [];

    // Create working configs for all metrics, preserving saved states
    allMetrics.forEach((metric) => {
      // Look for existing config in the saved configs
      const existingConfig = this.configs.find((c) => c.id === metric.id);

      if (existingConfig) {
        // Use existing config with deep copy of settings
        const workingConfig = {
          id: metric.id,
          enabled: existingConfig.enabled,
          settings: { ...existingConfig.settings },
        };
        workingConfigs.push(workingConfig);
      } else {
        // Create default config for metrics not yet configured
        // Important: If a metric is not in the saved configs, it should be disabled by default
        // unless it's explicitly marked as defaultEnabled
        const workingConfig = {
          id: metric.id,
          enabled: false, // Default to false for unsaved metrics
          settings: metric.getConfigUI?.()?.getDefaultConfig() || {},
        };
        workingConfigs.push(workingConfig);
      }
    });

    return workingConfigs;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('macroscalc-metrics-edit-modal');

    this.createModalStructure();
  }

  private createModalStructure(): void {
    const { contentEl } = this;

    // Create main container with proper flex structure
    const modalContent = contentEl.createDiv({ cls: 'modal-content' });

    // Header section
    const header = modalContent.createDiv({ cls: 'modal-header' });
    header.createEl('h2', { text: t('metrics.edit.title') });
    header.createEl('p', {
      text: t('metrics.edit.description'),
      cls: 'modal-description',
    });

    // Scrollable body section
    const body = modalContent.createDiv({ cls: 'modal-body' });
    this.renderMetricsCategories(body);

    // Footer section
    const footer = modalContent.createDiv({ cls: 'modal-footer' });
    this.createButtons(footer);
  }

  private renderMetricsCategories(container: HTMLElement): void {
    const categories = this.groupMetricsByCategory();

    // Create container for categories with better spacing
    const categoriesContainer = container.createDiv({ cls: 'metrics-categories-container' });

    Object.entries(categories).forEach(([categoryKey, metrics]) => {
      const categoryContainer = categoriesContainer.createDiv({ cls: 'metrics-category' });

      // Category header
      const categoryHeader = categoryContainer.createDiv({ cls: 'metrics-category-header' });
      categoryHeader.textContent = this.getCategoryDisplayName(categoryKey);

      // Metrics in this category
      const metricsContainer = categoryContainer.createDiv({ cls: 'metrics-list' });

      metrics.forEach((metric) => {
        this.renderMetricSetting(metricsContainer, metric);
      });
    });
  }

  private getCategoryDisplayName(categoryKey: string): string {
    const categoryNames: Record<string, string> = {
      totals: 'Totals & Averages',
      ratios: 'Macro Ratios',
      trends: 'Trends & Moving Averages',
      extremes: 'Extremes',
      adherence: 'Adherence & Streaks',
      display: 'Display Options',
      other: 'Other Metrics',
    };
    return categoryNames[categoryKey] || categoryKey.toUpperCase();
  }

  private groupMetricsByCategory(): Record<string, any[]> {
    const categories: Record<string, any[]> = {};

    this.registry.getAll().forEach((metric) => {
      const category = metric.category || 'other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(metric);
    });

    return categories;
  }

  private renderMetricSetting(container: HTMLElement, metric: any): void {
    // Find the working config for this metric (should always exist now)
    const config = this.workingConfigs.find((c) => c.id === metric.id);
    if (!config) {
      console.error(`No working config found for metric: ${metric.id}`);
      return;
    }

    const settingItem = container.createDiv({ cls: 'metrics-setting-item' });

    // Setting header with toggle
    const settingHeader = settingItem.createDiv({ cls: 'metrics-setting-item-header' });

    const settingInfo = settingHeader.createDiv({ cls: 'metrics-setting-item-info' });
    settingInfo.createDiv({
      text: metric.name,
      cls: 'metrics-setting-item-name',
    });

    // Update description for TrendsMetric to reflect automatic detection
    let description = metric.description;
    if (metric.id === 'trends') {
      description =
        t('metrics.trends.descriptionAuto') ||
        'Automatically calculates rolling averages based on the number of dates provided';
    }

    settingInfo.createDiv({
      text: description,
      cls: 'metrics-setting-item-description',
    });

    const settingControl = settingHeader.createDiv({ cls: 'metrics-setting-item-control' });

    // Create toggle with the correct initial state
    const toggleClasses = ['metric-toggle'];
    if (config.enabled) {
      toggleClasses.push('enabled');
    }

    const toggle = settingControl.createDiv({
      cls: toggleClasses.join(' '),
    });

    // Store reference to the config for this toggle
    toggle.setAttribute('data-metric-id', metric.id);

    // Add toggle click handler
    this.plugin.registerDomListener(toggle, 'click', () => {
      const currentConfig = this.workingConfigs.find((c) => c.id === metric.id);
      if (currentConfig) {
        // Toggle the state
        currentConfig.enabled = !currentConfig.enabled;

        // Update the visual state
        if (currentConfig.enabled) {
          toggle.classList.add('enabled');
        } else {
          toggle.classList.remove('enabled');
        }

        // Show/hide configuration options (only if configurable)
        this.updateConfigVisibility(settingItem, currentConfig.enabled, metric, currentConfig);
      }
    });

    // Configuration options (only if metric is configurable)
    this.updateConfigVisibility(settingItem, config.enabled, metric, config);
  }

  private updateConfigVisibility(
    settingItem: HTMLElement,
    enabled: boolean,
    metric: any,
    config: MetricConfig
  ): void {
    // Remove existing config container
    const existingConfig = settingItem.querySelector('.metric-config-container');
    if (existingConfig) {
      existingConfig.remove();
    }

    // Add config container if enabled and configurable
    if (enabled && metric.configurable && metric.getConfigUI) {
      const configContainer = settingItem.createDiv({ cls: 'metric-config-container' });
      const configUI = metric.getConfigUI();

      if (configUI) {
        // Create change handler for config updates
        const onChange = (newSettings: Record<string, any>) => {
          const workingConfig = this.workingConfigs.find((c) => c.id === metric.id);
          if (workingConfig) {
            workingConfig.settings = { ...workingConfig.settings, ...newSettings };
          }
        };

        configUI.render(configContainer, config.settings || {}, onChange);
      }
    }
  }

  private createButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv({ cls: 'modal-button-container' });

    const cancelButton = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'btn-secondary',
    });

    const saveButton = buttonContainer.createEl('button', {
      text: t('general.save'),
      cls: 'btn-primary',
    });

    this.plugin.registerDomListener(cancelButton, 'click', () => {
      this.close();
    });

    this.plugin.registerDomListener(saveButton, 'click', () => {
      // Filter out disabled metrics and ensure all enabled metrics have proper config
      const enabledConfigs = this.workingConfigs.filter((config) => config.enabled);

      this.onSave(enabledConfigs);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

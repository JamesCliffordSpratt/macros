import { App, PluginSettingTab, Setting, Notice, normalizePath, Component } from 'obsidian';
import { ChartLoader } from '../utils/ChartLoader';
import MacrosPlugin from '../main';
import { AddMealTemplateModal, EditMealTemplateModal } from '../ui';
import { fetchFoodData } from '../core/api';
import { FolderSuggest } from '../utils/FolderSuggest';
import { I18nManager, t } from '../lang/I18nManager';
import { convertEnergyUnit } from '../utils/energyUtils';
import type { Chart } from 'chart.js';
import { DEFAULT_SETTINGS } from './settingsSchema';
export { DEFAULT_SETTINGS };

// Export interfaces and default settings
export interface MealTemplate {
  name: string;
  items: string[];
}

export interface PluginSettings {
  storageFolder: string;
  proteinColor: string;
  fatColor: string;
  carbsColor: string;
  mealTemplates: MealTemplate[];
  fatSecretApiKey: string;
  fatSecretApiSecret: string;
  dailyCaloriesTarget: number;
  dailyProteinTarget: number;
  dailyFatTarget: number;
  dailyCarbsTarget: number;
  showSummaryRows: boolean;
  disableTooltips: boolean;
  showCellPercentages: boolean;
  developerModeEnabled: boolean;
  uiCollapseStates?: Record<string, boolean>;
  energyUnit: 'kcal' | 'kJ';
  addToMacrosTabOrder: ('meals' | 'foods' | 'group')[]; // Updated to array format
  // Note: locale removed since we follow Obsidian's language settings
}

// Sortable component class (embedded in the same file for simplicity)
class SortableTabOrder extends Component {
  private plugin: MacrosPlugin;
  private containerEl: HTMLElement;
  private listEl: HTMLElement;
  private draggedItem: HTMLElement | null = null;
  private draggedIndex = -1;

  constructor(plugin: MacrosPlugin, containerEl: HTMLElement) {
    super();
    this.plugin = plugin;
    this.containerEl = containerEl;
  }

  create(): void {
    const sortableContainer = this.containerEl.createDiv({ cls: 'sortable-tab-order-container' });

    // FIX: Remove unused variable assignment - element is created but doesn't need to be stored
    sortableContainer.createEl('p', {
      text: t('settings.display.tabOrderInstructions'),
      cls: 'sortable-instructions',
    });

    this.listEl = sortableContainer.createEl('ul', {
      cls: 'sortable-tab-list',
    });

    this.render();
    this.setupEventListeners();
  }

  private render(): void {
    this.listEl.empty();

    const tabOrder = this.plugin.settings.addToMacrosTabOrder;

    tabOrder.forEach((tabKey, index) => {
      const listItem = this.listEl.createEl('li', {
        cls: 'sortable-tab-item',
        attr: {
          'data-tab-key': tabKey,
          'data-index': index.toString(),
          draggable: 'true',
        },
      });

      // FIX: Remove unused variable assignment - element is created but doesn't need to be stored
      listItem.createEl('span', {
        cls: 'drag-handle',
        text: '⋮⋮',
        attr: { title: t('settings.display.dragToReorder') },
      });

      const tabContent = listItem.createEl('div', { cls: 'tab-content' });
      const tabLabel = this.getTabLabel(tabKey);

      // Only add the icon once here
      tabContent.createEl('span', { cls: 'tab-label', text: tabLabel });

      // FIX: Remove unused variable assignment - element is created but doesn't need to be stored
      listItem.createEl('span', {
        cls: 'position-indicator',
        text: (index + 1).toString(),
      });
    });
  }

  private getTabLabel(tabKey: string): string {
    switch (tabKey) {
      case 'meals':
        return t('meals.addTo.mealTemplates');
      case 'foods':
        return t('meals.addTo.individualFoods');
      case 'group':
        return t('meals.addTo.createGroup');
      default:
        return tabKey;
    }
  }

  private setupEventListeners(): void {
    this.registerDomEvent(this.listEl, 'dragstart', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const listItem = target.closest('.sortable-tab-item') as HTMLElement;

      if (listItem) {
        this.draggedItem = listItem;
        this.draggedIndex = parseInt(listItem.dataset.index || '0');

        listItem.classList.add('dragging');

        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/html', listItem.outerHTML);
        }
      }
    });

    // FIX: Use underscore prefix for unused parameter
    this.registerDomEvent(this.listEl, 'dragend', (_e: DragEvent) => {
      if (this.draggedItem) {
        this.draggedItem.classList.remove('dragging');
        this.draggedItem = null;
        this.draggedIndex = -1;
      }

      this.listEl.querySelectorAll('.sortable-tab-item').forEach((item) => {
        item.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
      });
    });

    this.registerDomEvent(this.listEl, 'dragover', (e: DragEvent) => {
      e.preventDefault();

      const target = e.target as HTMLElement;
      const listItem = target.closest('.sortable-tab-item') as HTMLElement;

      if (listItem && listItem !== this.draggedItem) {
        this.listEl.querySelectorAll('.sortable-tab-item').forEach((item) => {
          item.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
        });

        const rect = listItem.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint) {
          listItem.classList.add('drag-over-before');
        } else {
          listItem.classList.add('drag-over-after');
        }
      }
    });

    this.registerDomEvent(this.listEl, 'drop', async (e: DragEvent) => {
      e.preventDefault();

      if (!this.draggedItem) return;

      const target = e.target as HTMLElement;
      const dropTarget = target.closest('.sortable-tab-item') as HTMLElement;

      if (dropTarget && dropTarget !== this.draggedItem) {
        const dropIndex = parseInt(dropTarget.dataset.index || '0');
        const rect = dropTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        let newIndex = dropIndex;
        if (e.clientY >= midpoint) {
          newIndex = dropIndex + 1;
        }

        await this.moveTab(this.draggedIndex, newIndex);
      }

      this.listEl.querySelectorAll('.sortable-tab-item').forEach((item) => {
        item.classList.remove('drag-over', 'drag-over-before', 'drag-over-after', 'dragging');
      });
    });
  }

  private async moveTab(fromIndex: number, toIndex: number): Promise<void> {
    const tabOrder = [...this.plugin.settings.addToMacrosTabOrder];

    if (fromIndex < toIndex) {
      toIndex--;
    }

    const [movedItem] = tabOrder.splice(fromIndex, 1);
    tabOrder.splice(toIndex, 0, movedItem);

    this.plugin.settings.addToMacrosTabOrder = tabOrder;
    await this.plugin.saveSettings();

    this.render();
  }

  onunload(): void {
    super.onunload();
  }
}

export class NutritionalSettingTab extends PluginSettingTab {
  plugin: MacrosPlugin;
  private previewChart: Chart | null = null;
  private chartId = 'settings-preview-chart';
  private i18n: I18nManager;
  private sortableTabOrder: SortableTabOrder | null = null;

  constructor(app: App, plugin: MacrosPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.i18n = I18nManager.getInstance();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // =======================================
    // STORAGE
    // =======================================
    new Setting(containerEl).setName(`📁 ${t('settings.storage.title')}`).setHeading();

    // Storage Folder Setting with FolderSuggest
    const folderSetting = new Setting(containerEl)
      .setName(t('settings.storage.folder'))
      .setDesc(t('settings.storage.folderDesc'));

    // Create the input element
    const folderInputEl = folderSetting.controlEl.createEl('input', {
      type: 'text',
      cls: 'folder-input-field',
      value: this.plugin.settings.storageFolder,
    });

    // FIX: Initialize FolderSuggest without storing in unused variable
    // The FolderSuggest instance is created and attached to the input, but we don't need to store the reference
    new FolderSuggest(this.app, folderInputEl, 'Nutrition');

    // Add change handler
    folderInputEl.addEventListener('change', async () => {
      this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);
      await this.plugin.saveSettings();
    });

    // Add blur handler to ensure the value is saved when focus is lost
    folderInputEl.addEventListener('blur', async () => {
      this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);
      await this.plugin.saveSettings();
    });

    // =======================================
    // NUTRITION TARGETS (Enhanced with kJ support)
    // =======================================
    new Setting(containerEl).setName(`🎯 ${t('settings.targets.title')}`).setHeading();

    // Enhanced Calorie/Energy Target with bidirectional conversion
    const energyTargetContainer = containerEl.createDiv({ cls: 'energy-target-container' });

    new Setting(energyTargetContainer)
      .setName(t('settings.targets.calories'))
      .setDesc(t('settings.targets.caloriesDesc'))
      .then((setting) => {
        // Create a custom control element for the dual inputs
        const controlContainer = setting.controlEl.createDiv({ cls: 'dual-energy-inputs' });

        // kcal input
        const kcalContainer = controlContainer.createDiv({ cls: 'energy-input-group' });
        // FIX: Remove unused variable assignment - element is created but doesn't need to be stored
        kcalContainer.createEl('label', {
          text: 'kcal',
          cls: 'energy-input-label',
        });
        const kcalInput = kcalContainer.createEl('input', {
          type: 'number',
          cls: 'energy-input',
          attr: {
            placeholder: '2000',
            min: '0',
            step: '1',
          },
        });
        kcalInput.value = this.plugin.settings.dailyCaloriesTarget.toString();

        // kJ input
        const kjContainer = controlContainer.createDiv({ cls: 'energy-input-group' });
        // FIX: Remove unused variable assignment - element is created but doesn't need to be stored
        kjContainer.createEl('label', {
          text: 'kJ',
          cls: 'energy-input-label',
        });
        const kjInput = kjContainer.createEl('input', {
          type: 'number',
          cls: 'energy-input',
          attr: {
            placeholder: '8368',
            min: '0',
            step: '1',
          },
        });
        // Calculate initial kJ value
        const initialKjValue = convertEnergyUnit(
          this.plugin.settings.dailyCaloriesTarget,
          'kcal',
          'kJ'
        );
        kjInput.value = Math.round(initialKjValue).toString();

        // Set up bidirectional conversion
        const setupEnergyConversion = () => {
          // Convert from kcal to kJ
          kcalInput.addEventListener('input', async () => {
            const kcalValue = parseFloat(kcalInput.value);
            if (!isNaN(kcalValue) && kcalValue >= 0) {
              const kjValue = convertEnergyUnit(kcalValue, 'kcal', 'kJ');
              kjInput.value = Math.round(kjValue).toString();

              // Save the kcal value to settings
              this.plugin.settings.dailyCaloriesTarget = Math.round(kcalValue);
              await this.plugin.saveSettings();
            } else if (kcalInput.value === '') {
              kjInput.value = '';
            }
          });

          // Convert from kJ to kcal
          kjInput.addEventListener('input', async () => {
            const kjValue = parseFloat(kjInput.value);
            if (!isNaN(kjValue) && kjValue >= 0) {
              const kcalValue = convertEnergyUnit(kjValue, 'kJ', 'kcal');
              kcalInput.value = Math.round(kcalValue).toString();

              // Save the kcal value to settings (we always store in kcal internally)
              this.plugin.settings.dailyCaloriesTarget = Math.round(kcalValue);
              await this.plugin.saveSettings();
            } else if (kjInput.value === '') {
              kcalInput.value = '';
            }
          });
        };

        setupEnergyConversion();
      });

    new Setting(containerEl)
      .setName(t('settings.targets.protein'))
      .setDesc(t('settings.targets.proteinDesc'))
      .addText((text) => {
        text
          .setValue(this.plugin.settings.dailyProteinTarget.toString())
          .onChange(async (value) => {
            const numValue = parseInt(value);
            if (!isNaN(numValue) && numValue > 0) {
              this.plugin.settings.dailyProteinTarget = numValue;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName(t('settings.targets.fat'))
      .setDesc(t('settings.targets.fatDesc'))
      .addText((text) => {
        text.setValue(this.plugin.settings.dailyFatTarget.toString()).onChange(async (value) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue) && numValue > 0) {
            this.plugin.settings.dailyFatTarget = numValue;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName(t('settings.targets.carbs'))
      .setDesc(t('settings.targets.carbsDesc'))
      .addText((text) => {
        text.setValue(this.plugin.settings.dailyCarbsTarget.toString()).onChange(async (value) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue) && numValue > 0) {
            this.plugin.settings.dailyCarbsTarget = numValue;
            await this.plugin.saveSettings();
          }
        });
      });

    // =======================================
    // DISPLAY
    // =======================================
    new Setting(containerEl).setName(`⚙️ ${t('settings.display.title')}`).setHeading();

    new Setting(containerEl)
      .setName(t('settings.display.showSummaryRows'))
      .setDesc(t('settings.display.showSummaryRowsDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showSummaryRows).onChange(async (value) => {
          this.plugin.settings.showSummaryRows = value;
          await this.plugin.saveSettings();
          this.plugin.refreshMacrosTables?.();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.display.disableTooltips'))
      .setDesc(t('settings.display.disableTooltipsDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.disableTooltips).onChange(async (value) => {
          this.plugin.settings.disableTooltips = value;
          await this.plugin.saveSettings();
          this.plugin.refreshMacrosTables?.();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.display.showCellPercentages'))
      .setDesc(t('settings.display.showCellPercentagesDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showCellPercentages).onChange(async (value) => {
          this.plugin.settings.showCellPercentages = value;
          await this.plugin.saveSettings();
          this.plugin.refreshMacrosTables?.();
        })
      );

    // Energy Unit Setting
    new Setting(containerEl)
      .setName(t('settings.display.energyUnit'))
      .setDesc(t('settings.display.energyUnitDesc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('kcal', t('settings.display.energyUnitKcal'))
          .addOption('kJ', t('settings.display.energyUnitKj'))
          .setValue(this.plugin.settings.energyUnit)
          .onChange(async (value: string) => {
            if (value === 'kcal' || value === 'kJ') {
              this.plugin.settings.energyUnit = value;
              await this.plugin.saveSettings();
              this.plugin.refreshMacrosTables?.();
            }
          })
      );

    // Updated Add to Macros Tab Order Setting with Sortable Component
    const tabOrderSetting = new Setting(containerEl)
      .setName(t('settings.display.addToMacrosTabOrder'))
      .setDesc(t('settings.display.addToMacrosTabOrderDesc'));

    // Clean up existing sortable component if it exists
    if (this.sortableTabOrder) {
      this.sortableTabOrder.unload();
    }

    // Create and initialize the sortable component
    this.sortableTabOrder = new SortableTabOrder(this.plugin, tabOrderSetting.settingEl);
    this.sortableTabOrder.create();

    // =======================================
    // PIE CHART CUSTOMIZATION
    // =======================================
    new Setting(containerEl).setName(`📊 ${t('settings.charts.title')}`).setHeading();

    // Protein Color Setting
    new Setting(containerEl)
      .setName(t('settings.charts.proteinColor'))
      .setDesc(t('settings.charts.proteinColorDesc'))
      .addColorPicker((colorPicker) => {
        colorPicker.setValue(this.plugin.settings.proteinColor).onChange(async (value) => {
          this.plugin.settings.proteinColor = value;
          await this.plugin.saveSettings();
          this.updateChartPreview();
        });
        return colorPicker;
      });

    // Fat Color Setting
    new Setting(containerEl)
      .setName(t('settings.charts.fatColor'))
      .setDesc(t('settings.charts.fatColorDesc'))
      .addColorPicker((colorPicker) => {
        colorPicker.setValue(this.plugin.settings.fatColor).onChange(async (value) => {
          this.plugin.settings.fatColor = value;
          await this.plugin.saveSettings();
          this.updateChartPreview();
        });
        return colorPicker;
      });

    // Carbs Color Setting
    new Setting(containerEl)
      .setName(t('settings.charts.carbsColor'))
      .setDesc(t('settings.charts.carbsColorDesc'))
      .addColorPicker((colorPicker) => {
        colorPicker.setValue(this.plugin.settings.carbsColor).onChange(async (value) => {
          this.plugin.settings.carbsColor = value;
          await this.plugin.saveSettings();
          this.updateChartPreview();
        });
        return colorPicker;
      });

    const previewContainer = containerEl.createDiv({ cls: 'macrospc-preview-container' });
    new Setting(previewContainer).setName(t('settings.charts.preview')).setHeading();

    // Create canvas with explicit dimensions
    const previewCanvas = previewContainer.createEl('canvas');
    previewCanvas.width = 300;
    previewCanvas.height = 300;
    previewCanvas.id = this.chartId;

    setTimeout(() => {
      this.initChartPreview(previewCanvas);
    }, 50);

    this.initChartPreview(previewCanvas);

    // =======================================
    // MEAL TEMPLATES
    // =======================================
    new Setting(containerEl).setName(`🍽️ ${t('settings.meals.title')}`).setHeading();

    containerEl.createEl('p', {
      text: t('settings.meals.description'),
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName(t('settings.meals.create'))
      .setDesc(t('settings.meals.createDesc'))
      .addButton((btn) => {
        btn.setButtonText(t('settings.meals.addButton')).onClick(() => {
          new AddMealTemplateModal(this.plugin).open();
        });
      });

    if (this.plugin.settings.mealTemplates.length === 0) {
      containerEl.createEl('div', {
        text: t('settings.meals.noTemplates'),
        cls: 'no-templates-message',
      });
    } else {
      const templateContainer = containerEl.createDiv({ cls: 'meal-templates-container' });
      this.plugin.settings.mealTemplates.forEach((meal) => {
        new Setting(templateContainer)
          .setName(meal.name)
          .setDesc(meal.items?.length > 0 ? meal.items.join(', ') : t('settings.meals.noTemplates'))
          .addButton((editBtn) => {
            editBtn
              .setButtonText(t('general.edit'))
              .setCta()
              .onClick(() => {
                new EditMealTemplateModal(this.plugin, meal).open();
              });
          })
          .addButton((removeBtn) => {
            removeBtn
              .setButtonText(t('general.remove'))
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.mealTemplates = this.plugin.settings.mealTemplates.filter(
                  (m) => m.name !== meal.name
                );
                await this.plugin.saveSettings();
                setTimeout(() => this.display(), 300);
              });
          });
      });
    }

    // =======================================
    // API (REQUIRED)
    // =======================================
    new Setting(containerEl).setName(`🔌 ${t('settings.api.title')}`).setHeading();

    const apiNotice = containerEl.createDiv({ cls: 'macrospc-api-notice' });
    apiNotice.createEl('p', {
      text: t('settings.api.description'),
    });

    apiNotice.createEl('p', {
      text: t('settings.api.signupText'),
    });

    apiNotice.createEl('a', {
      text: 'https://platform.fatsecret.com/platform-api',
      attr: { href: 'https://platform.fatsecret.com/platform-api', target: '_blank' },
    });

    apiNotice.createEl('p', {
      text: t('settings.api.securityNote'),
      cls: 'note-text',
    });

    // Check if credentials are configured
    const hasCredentials = this.plugin.apiService.hasApiCredentials();

    if (!hasCredentials) {
      const warningDiv = containerEl.createDiv({
        cls: 'setting-item-description api-credentials-warning',
      });
      warningDiv.createEl('p', {
        text: t('settings.api.notConfigured'),
      });
    } else {
      const successDiv = containerEl.createDiv({
        cls: 'setting-item-description api-credentials-success',
      });
      successDiv.createEl('p', {
        text: t('settings.api.configured'),
      });
    }

    new Setting(containerEl)
      .setName(t('settings.api.key'))
      .setDesc(t('settings.api.keyDesc'))
      .addText((text) => {
        text
          .setPlaceholder('Enter your API key here')
          .setValue(this.plugin.settings.fatSecretApiKey)
          .onChange(async (value) => {
            this.plugin.settings.fatSecretApiKey = value;
            await this.plugin.saveSettings();
            // Refresh the settings display to update the status
            setTimeout(() => this.display(), 100);
          });
      });

    new Setting(containerEl)
      .setName(t('settings.api.secret'))
      .setDesc(t('settings.api.secretDesc'))
      .addText((text) => {
        text
          .setPlaceholder('Enter your API secret here')
          .setValue(this.plugin.settings.fatSecretApiSecret)
          .onChange(async (value) => {
            this.plugin.settings.fatSecretApiSecret = value;
            await this.plugin.saveSettings();
            // Refresh the settings display to update the status
            setTimeout(() => this.display(), 100);
          });
      });

    // Test connection section
    new Setting(containerEl)
      .setName(t('settings.api.testConnection'))
      .setDesc(t('settings.api.testConnectionDesc'))
      .addButton((button) => {
        button.setButtonText(t('settings.api.testConnection')).onClick(async () => {
          try {
            // Check if credentials are configured
            const credentials = this.plugin.apiService.getCredentialsSafe();
            if (!credentials) {
              new Notice(t('notifications.apiCredentialsRequired'));
              return;
            }

            new Notice(t('food.search.searching'));
            const results = await fetchFoodData(
              this.plugin.app,
              'apple',
              0,
              1,
              credentials.key,
              credentials.secret
            );
            if (results.length > 0) {
              new Notice(t('notifications.testConnectionSuccess'));
            } else {
              new Notice(t('notifications.testConnectionFailed'));
            }
          } catch (error) {
            this.plugin.logger.error('Error during test connection:', error);
            new Notice(t('notifications.testConnectionFailed'));
          }
        });
      });

    // =======================================
    // DEVELOPER MODE
    // =======================================
    new Setting(containerEl).setName(`🔧 ${t('settings.developer.title')}`).setHeading();

    new Setting(containerEl)
      .setName(t('settings.developer.enable'))
      .setDesc(t('settings.developer.enableDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.developerModeEnabled).onChange(async (value) => {
          this.plugin.settings.developerModeEnabled = value;
          await this.plugin.saveSettings();

          // Update logger debug mode instantly
          this.plugin.logger.setDebugMode(value);

          // Show a notice informing the user that they need to restart Obsidian
          const status = value ? t('general.success') : t('general.warning');
          new Notice(t('notifications.developerModeChanged', { status }));
        })
      );

    // Only show additional developer settings if developer mode is enabled
    if (this.plugin.settings.developerModeEnabled) {
      containerEl.createEl('p', {
        text: t('settings.developer.active'),
        cls: 'setting-item-description',
      });
    }
  }

  /**
   * Initialize the Chart.js preview chart
   */
  async initChartPreview(canvas: HTMLCanvasElement): Promise<void> {
    try {
      // Get ChartLoader instance
      const chartLoader = ChartLoader.getInstance();

      // Make sure no chart exists with this ID before creating a new one
      if (this.previewChart) {
        chartLoader.destroyChart(this.chartId);
        this.previewChart = null;
      }

      // Ensure Chart.js is loaded using ChartLoader
      await chartLoader.loadChart();

      // Initialize the chart
      this.updateChartPreview(canvas);
    } catch (error) {
      console.error('Error initializing chart preview:', error);

      // Fallback to simple preview if Chart.js fails to load
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#333';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          t('notifications.chartPreviewUnavailable'),
          canvas.width / 2,
          canvas.height / 2
        );
      }
    }
  }

  /**
   * Update the Chart.js preview with current settings
   */
  updateChartPreview(canvas?: HTMLCanvasElement): void {
    // If we already have a canvas reference, use that, otherwise find it in the DOM
    if (!canvas && this.previewChart) {
      canvas = this.previewChart.canvas;
    }

    if (!canvas) {
      const canvasEl = this.containerEl.querySelector('.macrospc-preview-container canvas');
      if (!canvasEl) {
        console.error('Cannot find preview canvas');
        return;
      }
      canvas = canvasEl as HTMLCanvasElement;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get current colors from settings
    const proteinColor = this.plugin.settings.proteinColor;
    const fatColor = this.plugin.settings.fatColor;
    const carbsColor = this.plugin.settings.carbsColor;

    // If we already have a chart, update its colors
    if (this.previewChart) {
      const dataset = this.previewChart.data.datasets[0];
      if (dataset) {
        dataset.backgroundColor = [proteinColor, fatColor, carbsColor];
        this.previewChart.update();
      }
      return;
    }

    canvas.addClass('settings-preview-canvas');

    // Use the centralized chart creation method from ChartManager
    try {
      this.previewChart = this.plugin.chartManager.createPieChart(
        ctx,
        this.chartId,
        [33, 33, 34], // Example data (evenly distributed)
        [t('table.headers.protein'), t('table.headers.fat'), t('table.headers.carbs')],
        [proteinColor, fatColor, carbsColor]
      );

      // Override some options for the settings preview
      if (this.previewChart?.options?.plugins) {
        // Enable legend for the preview chart
        const legend = this.previewChart.options.plugins.legend;
        if (legend) {
          legend.display = true;
          legend.position = 'bottom';

          if (legend.labels) {
            legend.labels.padding = 15;
            legend.labels.usePointStyle = true;
            // Use proper type assertion for Chart.js legend labels
            (legend.labels as { pointStyle?: string }).pointStyle = 'circle';
          }
        }

        // Update tooltip formatting
        const tooltip = this.previewChart.options.plugins.tooltip;
        if (tooltip?.callbacks) {
          tooltip.callbacks.label = function (context) {
            const label = context.label || '';
            const value = (context.raw as number) || 0;
            return `${label}: ${value}%`;
          };
        }
      }

      // Apply the changes
      if (this.previewChart) {
        this.previewChart.update();
      }
    } catch (error) {
      console.error('Error creating preview chart:', error);
    }
  }
}

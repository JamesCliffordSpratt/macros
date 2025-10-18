import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  normalizePath,
  Component,
  setIcon,
} from 'obsidian';
import { ChartLoader } from '../utils/ChartLoader';
import MacrosPlugin from '../main';
import { AddMealTemplateModal, EditMealTemplateModal } from '../ui';
import { fetchFoodData } from '../core/api';
import { FolderSuggest } from '../utils/FolderSuggest';
import { I18nManager, t } from '../lang/I18nManager';
import { convertEnergyUnit } from '../utils/energyUtils';
import type { Chart } from 'chart.js';
import { DEFAULT_SETTINGS } from './settingsSchema';
import { ToleranceData } from '../ui/modals/ToleranceModal';
export { DEFAULT_SETTINGS };

// Export interfaces and default settings
export interface MealTemplate {
  name: string;
  items: string[];
}

export interface MetricConfig {
  id: string;
  enabled: boolean;
  settings?: Record<string, any>;
}

export interface PluginSettings {
  storageFolder: string;
  proteinColor: string;
  fatColor: string;
  carbsColor: string;
  mealTemplates: MealTemplate[];
  fatSecretApiKey: string;
  fatSecretApiSecret: string;
  fatSecretEnabled: boolean;
  usdaEnabled: boolean;
  usdaApiKey: string;
  // NEW: Open Food Facts settings
  openFoodFactsEnabled: boolean;
  openFoodFactsLanguage: string; // 'auto', 'en', 'fr', 'de', 'es', etc.
  openFoodFactsDataQualityFilter: 'all' | 'medium' | 'high';
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
  addToMacrosTabOrder: ('meals' | 'foods' | 'group')[];
  // Rename tracking settings
  followRenamesEnabled: boolean;
  autoConfirmRenames: boolean;
  backupOnRename: boolean;
  caseSensitiveFoodMatch: boolean;
  includeAliasesOnRename: boolean;
  // Macroscalc metrics configuration
  macroscalcMetricsConfigs: MetricConfig[];
  // NEW: Food tolerances/intolerances
  foodTolerances: Record<string, ToleranceData>;
}

// Sortable component class
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

      listItem.createEl('span', {
        cls: 'drag-handle',
        text: '⋮⋮',
        attr: { title: t('settings.display.dragToReorder') },
      });

      const tabContent = listItem.createEl('div', { cls: 'tab-content' });
      const tabLabel = this.getTabLabel(tabKey);

      tabContent.createEl('span', { cls: 'tab-label', text: tabLabel });

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

interface TabDefinition {
  id: string;
  name: string;
  icon: string;
  content: (containerEl: HTMLElement) => void;
}

export class NutritionalSettingTab extends PluginSettingTab {
  plugin: MacrosPlugin;
  private previewChart: Chart | null = null;
  private chartId = 'settings-preview-chart';
  private i18n: I18nManager;
  private sortableTabOrder: SortableTabOrder | null = null;
  private activeTabId = 'general';
  private tabs: TabDefinition[] = [];

  constructor(app: App, plugin: MacrosPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.i18n = I18nManager.getInstance();
    this.initializeTabs();
  }

  private initializeTabs(): void {
    this.tabs = [
      {
        id: 'general',
        name: t('settings.tabs.general'),
        icon: 'folder',
        content: (containerEl) => this.renderGeneralTab(containerEl),
      },
      {
        id: 'display',
        name: t('settings.tabs.display'),
        icon: 'eye',
        content: (containerEl) => this.renderDisplayTab(containerEl),
      },
      {
        id: 'food-sources',
        name: t('settings.tabs.foodSources'),
        icon: 'apple',
        content: (containerEl) => this.renderFoodSourcesTab(containerEl),
      },
      {
        id: 'meal-templates',
        name: t('settings.tabs.mealTemplates'),
        icon: 'utensils',
        content: (containerEl) => this.renderMealTemplatesTab(containerEl),
      },
      {
        id: 'food-tolerances',
        name: t('settings.tabs.foodTolerances'),
        icon: 'alert-triangle',
        content: (containerEl) => this.renderFoodTolerancesTab(containerEl),
      },
      {
        id: 'advanced',
        name: t('settings.tabs.advanced'),
        icon: 'settings-2',
        content: (containerEl) => this.renderAdvancedTab(containerEl),
      },
      {
        id: 'support',
        name: t('settings.tabs.support'),
        icon: 'heart',
        content: (containerEl) => this.renderSupportTab(containerEl),
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Create tab navigation
    const tabNav = containerEl.createDiv({ cls: 'macros-settings-nav' });

    this.tabs.forEach((tab) => {
      const tabButton = tabNav.createDiv({
        cls: `macros-settings-tab ${this.activeTabId === tab.id ? 'active' : ''}`,
        attr: { 'data-tab': tab.id },
      });

      // Add icon using Obsidian's setIcon
      const iconEl = tabButton.createDiv({ cls: 'macros-settings-tab-icon' });
      setIcon(iconEl, tab.icon);

      // Add label
      tabButton.createDiv({
        cls: 'macros-settings-tab-label',
        text: tab.name,
      });

      // Add click handler
      tabButton.addEventListener('click', () => {
        this.switchTab(tab.id);
      });
    });

    // Create tab content area
    const tabContent = containerEl.createDiv({ cls: 'macros-settings-content' });

    // Render active tab content
    this.renderActiveTab(tabContent);
  }

  private switchTab(tabId: string): void {
    this.activeTabId = tabId;

    // Update active tab styling
    this.containerEl.querySelectorAll('.macros-settings-tab').forEach((tab) => {
      tab.classList.remove('active');
    });

    const activeTab = this.containerEl.querySelector(`[data-tab="${tabId}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }

    // Re-render content
    const contentEl = this.containerEl.querySelector('.macros-settings-content') as HTMLElement;
    if (contentEl) {
      this.renderActiveTab(contentEl);
    }
  }

  private renderActiveTab(containerEl: HTMLElement): void {
    containerEl.empty();

    const activeTab = this.tabs.find((tab) => tab.id === this.activeTabId);
    if (activeTab) {
      activeTab.content(containerEl);
    }
  }

  private renderGeneralTab(containerEl: HTMLElement): void {
    // =======================================
    // STORAGE
    // =======================================
    new Setting(containerEl).setName(`📂 ${t('settings.storage.title')}`).setHeading();

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

    // Macro Templates Dropdown
    new Setting(containerEl)
      .setName(t('settings.targets.templates.title'))
      .setDesc(t('settings.targets.templates.description'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('custom', t('settings.targets.templates.custom'))
          .addOption('keto', t('settings.targets.templates.keto'))
          .addOption('low-carb', t('settings.targets.templates.lowCarb'))
          .addOption('mediterranean', t('settings.targets.templates.mediterranean'))
          .addOption('balanced', t('settings.targets.templates.balanced'))
          .addOption('high-protein', t('settings.targets.templates.highProtein'))
          .addOption('plant-based', t('settings.targets.templates.plantBased'))
          .addOption('usda-men', t('settings.targets.templates.usdaMen'))
          .addOption('usda-women', t('settings.targets.templates.usdaWomen'))
          .addOption('athlete', t('settings.targets.templates.athlete'))
          .addOption('cutting', t('settings.targets.templates.cutting'))
          .addOption('bulking', t('settings.targets.templates.bulking'))
          .setValue('custom')
          .onChange(async (value: string) => {
            if (value !== 'custom') {
              await this.applyMacroTemplate(value);
              // Refresh the display to show updated values
              setTimeout(() => this.display(), 100);
            }
          });
      });

    // Add informational note about templates
    const templateInfo = containerEl.createDiv({ cls: 'macro-template-info' });
    templateInfo.createEl('p', {
      text: t('settings.targets.templates.info'),
    });

    // Add visual separator for manual target settings
    const targetsSection = containerEl.createDiv({ cls: 'nutrition-targets-section' });
    new Setting(targetsSection).setName(t('settings.targets.manualTitle')).setHeading();

    // Enhanced Calorie/Energy Target with bidirectional conversion
    const energyTargetContainer = targetsSection.createDiv({ cls: 'energy-target-container' });

    new Setting(energyTargetContainer)
      .setName(t('settings.targets.calories'))
      .setDesc(t('settings.targets.caloriesDesc'))
      .then((setting) => {
        // Create a custom control element for the dual inputs
        const controlContainer = setting.controlEl.createDiv({ cls: 'dual-energy-inputs' });

        // kcal input
        const kcalContainer = controlContainer.createDiv({ cls: 'energy-input-group' });
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

    new Setting(targetsSection)
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

    new Setting(targetsSection)
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

    new Setting(targetsSection)
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

    // Energy Unit Setting
    new Setting(targetsSection)
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
  }

  /**
   * Apply a macro template to update daily nutrition targets
   */
  private async applyMacroTemplate(templateId: string): Promise<void> {
    const templates = this.getMacroTemplates();
    const template = templates[templateId];

    if (!template) {
      new Notice(t('settings.targets.templates.notFound'));
      return;
    }

    // Apply the template values
    this.plugin.settings.dailyCaloriesTarget = template.calories;
    this.plugin.settings.dailyProteinTarget = template.protein;
    this.plugin.settings.dailyFatTarget = template.fat;
    this.plugin.settings.dailyCarbsTarget = template.carbs;

    await this.plugin.saveSettings();

    new Notice(t('settings.targets.templates.applied', { name: template.name }));
  }

  /**
   * Get available macro templates with calculated values
   */
  private getMacroTemplates(): Record<
    string,
    {
      name: string;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
      description: string;
    }
  > {
    return {
      keto: {
        name: t('settings.targets.templates.ketoName'),
        calories: 2000,
        protein: 125, // 25% of 2000 kcal = 500 kcal / 4 = 125g
        fat: 156, // 70% of 2000 kcal = 1400 kcal / 9 = 155.6g
        carbs: 25, // 5% of 2000 kcal = 100 kcal / 4 = 25g
        description: t('settings.targets.templates.ketoDesc'),
      },
      'low-carb': {
        name: t('settings.targets.templates.lowCarbName'),
        calories: 2000,
        protein: 200, // 40% of 2000 kcal = 800 kcal / 4 = 200g
        fat: 89, // 40% of 2000 kcal = 800 kcal / 9 = 88.9g
        carbs: 100, // 20% of 2000 kcal = 400 kcal / 4 = 100g
        description: t('settings.targets.templates.lowCarbDesc'),
      },
      mediterranean: {
        name: t('settings.targets.templates.mediterraneanName'),
        calories: 2000,
        protein: 100, // 20% of 2000 kcal = 400 kcal / 4 = 100g
        fat: 78, // 35% of 2000 kcal = 700 kcal / 9 = 77.8g
        carbs: 225, // 45% of 2000 kcal = 900 kcal / 4 = 225g
        description: t('settings.targets.templates.mediterraneanDesc'),
      },
      balanced: {
        name: t('settings.targets.templates.balancedName'),
        calories: 2000,
        protein: 150, // 30% of 2000 kcal = 600 kcal / 4 = 150g
        fat: 67, // 30% of 2000 kcal = 600 kcal / 9 = 66.7g
        carbs: 200, // 40% of 2000 kcal = 800 kcal / 4 = 200g
        description: t('settings.targets.templates.balancedDesc'),
      },
      'high-protein': {
        name: t('settings.targets.templates.highProteinName'),
        calories: 2000,
        protein: 250, // 50% of 2000 kcal = 1000 kcal / 4 = 250g
        fat: 56, // 25% of 2000 kcal = 500 kcal / 9 = 55.6g
        carbs: 125, // 25% of 2000 kcal = 500 kcal / 4 = 125g
        description: t('settings.targets.templates.highProteinDesc'),
      },
      'plant-based': {
        name: t('settings.targets.templates.plantBasedName'),
        calories: 2000,
        protein: 100, // 20% of 2000 kcal = 400 kcal / 4 = 100g
        fat: 56, // 25% of 2000 kcal = 500 kcal / 9 = 55.6g
        carbs: 275, // 55% of 2000 kcal = 1100 kcal / 4 = 275g
        description: t('settings.targets.templates.plantBasedDesc'),
      },
      'usda-men': {
        name: t('settings.targets.templates.usdaMenName'),
        calories: 2500, // Higher calorie target for men
        protein: 156, // 25% of 2500 kcal = 625 kcal / 4 = 156g
        fat: 83, // 30% of 2500 kcal = 750 kcal / 9 = 83.3g
        carbs: 281, // 45% of 2500 kcal = 1125 kcal / 4 = 281g
        description: t('settings.targets.templates.usdaMenDesc'),
      },
      'usda-women': {
        name: t('settings.targets.templates.usdaWomenName'),
        calories: 2000, // Standard calorie target for women
        protein: 125, // 25% of 2000 kcal = 500 kcal / 4 = 125g
        fat: 67, // 30% of 2000 kcal = 600 kcal / 9 = 66.7g
        carbs: 225, // 45% of 2000 kcal = 900 kcal / 4 = 225g
        description: t('settings.targets.templates.usdaWomenDesc'),
      },
      athlete: {
        name: t('settings.targets.templates.athleteName'),
        calories: 2800, // Higher calories for athletes
        protein: 140, // 20% of 2800 kcal = 560 kcal / 4 = 140g
        fat: 78, // 25% of 2800 kcal = 700 kcal / 9 = 77.8g
        carbs: 385, // 55% of 2800 kcal = 1540 kcal / 4 = 385g
        description: t('settings.targets.templates.athleteDesc'),
      },
      cutting: {
        name: t('settings.targets.templates.cuttingName'),
        calories: 1800, // Lower calories for cutting
        protein: 203, // 45% of 1800 kcal = 810 kcal / 4 = 202.5g
        fat: 50, // 25% of 1800 kcal = 450 kcal / 9 = 50g
        carbs: 135, // 30% of 1800 kcal = 540 kcal / 4 = 135g
        description: t('settings.targets.templates.cuttingDesc'),
      },
      bulking: {
        name: t('settings.targets.templates.bulkingName'),
        calories: 3000, // Higher calories for bulking
        protein: 225, // 30% of 3000 kcal = 900 kcal / 4 = 225g
        fat: 83, // 25% of 3000 kcal = 750 kcal / 9 = 83.3g
        carbs: 338, // 45% of 3000 kcal = 1350 kcal / 4 = 337.5g
        description: t('settings.targets.templates.bulkingDesc'),
      },
    };
  }

  private renderDisplayTab(containerEl: HTMLElement): void {
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
  }

  private renderFoodSourcesTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(`🔌 ${t('settings.api.title')}`).setHeading();

    const apiNotice = containerEl.createDiv({ cls: 'macrospc-api-notice' });
    apiNotice.createEl('p', {
      text: t('settings.api.description'),
    });

    // =======================================
    // FATSECRET API
    // =======================================
    new Setting(containerEl).setName(`${t('settings.api.fatSecretTitle')}`).setHeading();

    const fatSecretNotice = containerEl.createDiv({ cls: 'macrospc-api-notice' });
    fatSecretNotice.createEl('p', {
      text: t('settings.api.fatSecretSignupText'),
    });

    fatSecretNotice.createEl('a', {
      text: 'https://platform.fatsecret.com/platform-api',
      attr: { href: 'https://platform.fatsecret.com/platform-api', target: '_blank' },
    });

    // Check if FatSecret credentials are configured
    const hasFatSecretCredentials =
      this.plugin.settings.fatSecretApiKey && this.plugin.settings.fatSecretApiSecret;

    // FatSecret Enable Toggle
    new Setting(containerEl)
      .setName(t('settings.api.fatSecretEnable'))
      .setDesc(t('settings.api.fatSecretEnableDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.fatSecretEnabled && hasFatSecretCredentials))
          .onChange(async (value) => {
            if (value && !hasFatSecretCredentials) {
              new Notice(t('settings.api.fatSecretCredentialsRequired'));
              toggle.setValue(false);
              return;
            }
            this.plugin.settings.fatSecretEnabled = value;
            await this.plugin.saveSettings();
            setTimeout(() => this.display(), 100);
          })
      );

    if (!hasFatSecretCredentials) {
      const warningDiv = containerEl.createDiv({
        cls: 'setting-item-description api-credentials-warning',
      });
      warningDiv.createEl('p', {
        text: t('settings.api.fatSecretNotConfigured'),
      });
    } else {
      const successDiv = containerEl.createDiv({
        cls: 'setting-item-description api-credentials-success',
      });
      successDiv.createEl('p', {
        text: t('settings.api.fatSecretConfigured'),
      });
    }

    new Setting(containerEl)
      .setName(t('settings.api.key'))
      .setDesc(t('settings.api.keyDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.api.keyPlaceholder'))
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
          .setPlaceholder(t('settings.api.secretPlaceholder'))
          .setValue(this.plugin.settings.fatSecretApiSecret)
          .onChange(async (value) => {
            this.plugin.settings.fatSecretApiSecret = value;
            await this.plugin.saveSettings();
            // Refresh the settings display to update the status
            setTimeout(() => this.display(), 100);
          });
      });

    // FatSecret Test connection section
    new Setting(containerEl)
      .setName(t('settings.api.testFatSecretConnection'))
      .setDesc(t('settings.api.testFatSecretConnectionDesc'))
      .addButton((button) => {
        button.setButtonText(t('settings.api.testConnection')).onClick(async () => {
          try {
            // Check if credentials are configured
            if (!hasFatSecretCredentials) {
              new Notice(t('settings.api.fatSecretCredentialsRequired'));
              return;
            }

            new Notice(t('food.search.searching'));
            const results = await fetchFoodData(
              this.plugin.app,
              'apple',
              0,
              1,
              this.plugin.settings.fatSecretApiKey,
              this.plugin.settings.fatSecretApiSecret
            );
            if (results.length > 0) {
              new Notice(t('notifications.testConnectionSuccess'));
            } else {
              new Notice(t('notifications.testConnectionFailed'));
            }
          } catch (error) {
            this.plugin.logger.error('Error during FatSecret test connection:', error);
            new Notice(t('notifications.testConnectionFailed'));
          }
        });
      });

    // =======================================
    // USDA API
    // =======================================
    new Setting(containerEl).setName(`${t('settings.api.usdaTitle')}`).setHeading();

    const usdaNotice = containerEl.createDiv({ cls: 'macrospc-api-notice' });
    usdaNotice.createEl('p', {
      text: t('settings.api.usdaDescription'),
    });

    usdaNotice.createEl('p', {
      text: t('settings.api.usdaSignupText'),
    });

    usdaNotice.createEl('a', {
      text: 'https://fdc.nal.usda.gov/api-guide.html',
      attr: { href: 'https://fdc.nal.usda.gov/api-guide.html', target: '_blank' },
    });

    // Check if USDA credentials are configured
    const hasUsdaCredentials =
      this.plugin.settings.usdaApiKey && this.plugin.settings.usdaApiKey.length > 0;

    // USDA Enable Toggle
    new Setting(containerEl)
      .setName(t('settings.api.usdaEnable'))
      .setDesc(t('settings.api.usdaEnableDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.usdaEnabled && hasUsdaCredentials))
          .onChange(async (value) => {
            if (value && !hasUsdaCredentials) {
              new Notice(t('settings.api.usdaCredentialsRequired'));
              toggle.setValue(false);
              return;
            }
            this.plugin.settings.usdaEnabled = value;
            await this.plugin.saveSettings();
            setTimeout(() => this.display(), 100);
          })
      );

    if (!hasUsdaCredentials) {
      const warningDiv = containerEl.createDiv({
        cls: 'setting-item-description api-credentials-warning',
      });
      warningDiv.createEl('p', {
        text: t('settings.api.usdaNotConfigured'),
      });
    } else {
      const successDiv = containerEl.createDiv({
        cls: 'setting-item-description api-credentials-success',
      });
      successDiv.createEl('p', {
        text: t('settings.api.usdaConfigured'),
      });
    }

    new Setting(containerEl)
      .setName(t('settings.api.usdaKey'))
      .setDesc(t('settings.api.usdaKeyDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.api.usdaKeyPlaceholder'))
          .setValue(this.plugin.settings.usdaApiKey)
          .onChange(async (value) => {
            this.plugin.settings.usdaApiKey = value;
            await this.plugin.saveSettings();
            // Refresh the settings display to update the status
            setTimeout(() => this.display(), 100);
          });
      });

    // USDA Test connection section
    new Setting(containerEl)
      .setName(t('settings.api.testUsdaConnection'))
      .setDesc(t('settings.api.testUsdaConnectionDesc'))
      .addButton((button) => {
        button.setButtonText(t('settings.api.testConnection')).onClick(async () => {
          try {
            // Check if credentials are configured
            if (!hasUsdaCredentials) {
              new Notice(t('settings.api.usdaCredentialsRequired'));
              return;
            }

            new Notice(t('food.search.searching'));
            // Import USDA search function
            const { searchFoods } = await import('../core/usda');
            const results = await searchFoods(
              this.plugin.app,
              'apple',
              0,
              1,
              this.plugin.settings.usdaApiKey
            );
            if (results.length > 0) {
              new Notice(t('notifications.testConnectionSuccess'));
            } else {
              new Notice(t('notifications.testConnectionFailed'));
            }
          } catch (error) {
            this.plugin.logger.error('Error during USDA test connection:', error);
            new Notice(t('notifications.testConnectionFailed'));
          }
        });
      });

    // =======================================
    // OPEN FOOD FACTS API
    // =======================================
    new Setting(containerEl).setName(`${t('settings.api.openFoodFactsTitle')}`).setHeading();

    const offNotice = containerEl.createDiv({ cls: 'macrospc-api-notice' });
    offNotice.createEl('p', {
      text: t('settings.api.openFoodFactsDescription'),
    });

    offNotice.createEl('p', {
      text: t('settings.api.openFoodFactsInfo'),
    });

    offNotice.createEl('a', {
      text: t('settings.api.openFoodFactsLearnMore'),
      attr: { href: 'https://world.openfoodfacts.org', target: '_blank' },
    });

    // Connection status indicator
    const statusContainer = containerEl.createDiv({ cls: 'off-status-container' });

    if (this.plugin.settings.openFoodFactsEnabled) {
      const successDiv = statusContainer.createDiv({
        cls: 'setting-item-description api-credentials-success',
      });
      successDiv.createEl('p', {
        text: t('settings.api.openFoodFactsEnabled'),
      });
    } else {
      const disabledDiv = statusContainer.createDiv({
        cls: 'setting-item-description api-credentials-warning',
      });
      disabledDiv.createEl('p', {
        text: t('settings.api.openFoodFactsDisabled'),
      });
    }

    // Open Food Facts Enable Toggle with better description
    new Setting(containerEl)
      .setName(t('settings.api.openFoodFactsEnable'))
      .setDesc(t('settings.api.openFoodFactsEnableDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openFoodFactsEnabled).onChange(async (value) => {
          this.plugin.settings.openFoodFactsEnabled = value;
          await this.plugin.saveSettings();
          setTimeout(() => this.display(), 100);
        })
      );

    // Enhanced language preference setting with better descriptions
    new Setting(containerEl)
      .setName(t('settings.api.openFoodFactsLanguage'))
      .setDesc(t('settings.api.openFoodFactsLanguageDesc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('auto', t('settings.api.openFoodFactsLanguageAuto'))
          .addOption('en', t('settings.api.openFoodFactsLanguageEn'))
          .addOption('fr', t('settings.api.openFoodFactsLanguageFr'))
          .addOption('de', t('settings.api.openFoodFactsLanguageDe'))
          .addOption('es', t('settings.api.openFoodFactsLanguageEs'))
          .addOption('it', t('settings.api.openFoodFactsLanguageIt'))
          .addOption('pt', t('settings.api.openFoodFactsLanguagePt'))
          .addOption('zh', t('settings.api.openFoodFactsLanguageZh'))
          .addOption('ja', t('settings.api.openFoodFactsLanguageJa'))
          .addOption('ko', t('settings.api.openFoodFactsLanguageKo'))
          .addOption('ru', t('settings.api.openFoodFactsLanguageRu'))
          .addOption('ar', t('settings.api.openFoodFactsLanguageAr'))
          .setValue(this.plugin.settings.openFoodFactsLanguage)
          .onChange(async (value: string) => {
            this.plugin.settings.openFoodFactsLanguage = value;
            await this.plugin.saveSettings();
          });
      });

    // Enhanced data quality filter with better explanations
    new Setting(containerEl)
      .setName(t('settings.api.openFoodFactsDataQuality'))
      .setDesc(t('settings.api.openFoodFactsDataQualityDesc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('all', t('settings.api.openFoodFactsDataQualityAll'))
          .addOption('medium', t('settings.api.openFoodFactsDataQualityMedium'))
          .addOption('high', t('settings.api.openFoodFactsDataQualityHigh'))
          .setValue(this.plugin.settings.openFoodFactsDataQualityFilter)
          .onChange(async (value: 'all' | 'medium' | 'high') => {
            this.plugin.settings.openFoodFactsDataQualityFilter = value;
            await this.plugin.saveSettings();
          });
      });

    // Test connection
    new Setting(containerEl)
      .setName(t('settings.api.testOpenFoodFactsConnection'))
      .setDesc(t('settings.api.testOpenFoodFactsConnectionDesc'))
      .addButton((button) => {
        button.setButtonText(t('settings.api.testConnection')).onClick(async () => {
          try {
            if (!this.plugin.settings.openFoodFactsEnabled) {
              new Notice(t('settings.api.openFoodFactsNotEnabled'));
              return;
            }

            new Notice(t('food.search.searching'));

            // Import and test Open Food Facts search with better error handling
            const { searchOpenFoodFacts } = await import('../core/openFoodFacts');

            // Get user's locale for testing
            const userLocale = this.plugin.i18nManager?.getCurrentLocale() || 'en';
            const offLanguage =
              this.plugin.settings.openFoodFactsLanguage === 'auto'
                ? userLocale
                : this.plugin.settings.openFoodFactsLanguage;

            console.log('Testing OFF connection with:', {
              query: 'apple',
              language: offLanguage,
              userLocale,
            });

            const results = await searchOpenFoodFacts(
              this.plugin.app,
              'apple',
              0,
              5, // Test with smaller number
              offLanguage
            );

            console.log('OFF test results:', results);

            if (results.length > 0) {
              new Notice(
                t('settings.api.openFoodFactsTestSuccess', { count: results.length.toString() })
              );

              // Show some details about the first result for debugging
              const firstResult = results[0];
              console.log('First result details:', {
                name: firstResult.productName,
                source: firstResult.source,
                quality: firstResult.dataQuality,
                calories: firstResult.calories,
              });
            } else {
              new Notice(t('settings.api.openFoodFactsTestNoResults'));
            }
          } catch (error) {
            console.error('Error during Open Food Facts test connection:', error);
            if (error.message?.includes('CORS')) {
              new Notice(t('settings.api.openFoodFactsTestCORSError'));
            } else if (error.message?.includes('network')) {
              new Notice(t('settings.api.openFoodFactsTestNetworkError'));
            } else if (error.message?.includes('timeout')) {
              new Notice(t('settings.api.openFoodFactsTestTimeoutError'));
            } else {
              new Notice(t('settings.api.openFoodFactsTestError', { error: error.message }));
            }
          }
        });
      });

    // Security note for all APIs
    containerEl.createEl('p', {
      text: t('settings.api.securityNote'),
      cls: 'note-text',
    });
  }

  private renderMealTemplatesTab(containerEl: HTMLElement): void {
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
          .setDesc(meal.items?.length > 0 ? meal.items.join(', ') : t('settings.meals.noItems'))
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
  }

  private renderFoodTolerancesTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(`🚨 ${t('settings.tolerances.title')}`).setHeading();

    containerEl.createEl('p', {
      text: t('settings.tolerances.description'),
      cls: 'setting-item-description',
    });

    // Display existing tolerances
    const tolerancesContainer = containerEl.createDiv({ cls: 'tolerances-container' });

    const tolerances = this.plugin.settings.foodTolerances || {};
    const toleranceEntries = Object.entries(tolerances);

    if (toleranceEntries.length === 0) {
      tolerancesContainer.createEl('div', {
        text: t('settings.tolerances.noTolerances'),
        cls: 'no-tolerances-message',
      });
    } else {
      toleranceEntries.forEach(([foodName, toleranceData]) => {
        const toleranceItem = tolerancesContainer.createDiv({ cls: 'tolerance-item' });

        const toleranceHeader = toleranceItem.createDiv({ cls: 'tolerance-header' });

        const toleranceIcon = toleranceHeader.createSpan({
          cls: 'tolerance-icon',
          text: toleranceData.severity,
        });

        const toleranceName = toleranceHeader.createSpan({
          cls: 'tolerance-name',
          text: foodName.charAt(0).toUpperCase() + foodName.slice(1),
        });

        const toleranceActions = toleranceHeader.createDiv({ cls: 'tolerance-actions' });

        const viewBtn = toleranceActions.createEl('button', {
          text: t('general.view'),
          cls: 'mod-button mod-muted',
        });

        const removeBtn = toleranceActions.createEl('button', {
          text: t('general.remove'),
          cls: 'mod-button mod-warning',
        });

        // Add symptoms display
        if (toleranceData.symptoms) {
          const toleranceSymptoms = toleranceItem.createDiv({
            cls: 'tolerance-symptoms',
            text: toleranceData.symptoms,
          });
        }

        // Add date added
        const toleranceDate = toleranceItem.createDiv({
          cls: 'tolerance-date',
          text: t('settings.tolerances.dateAdded', {
            date: new Date(toleranceData.dateAdded).toLocaleDateString(),
          }),
        });

        // View button handler
        viewBtn.addEventListener('click', () => {
          new Notice(`${toleranceData.severity} ${foodName}: ${toleranceData.symptoms}`);
        });

        // Remove button handler
        removeBtn.addEventListener('click', async () => {
          delete this.plugin.settings.foodTolerances[foodName];
          await this.plugin.saveSettings();
          this.display(); // Refresh the settings page
          new Notice(t('settings.tolerances.toleranceRemoved', { foodName }));
        });
      });
    }

    // Clear all tolerances button (only show if there are tolerances)
    if (toleranceEntries.length > 0) {
      new Setting(containerEl)
        .setName(t('settings.tolerances.clearAll'))
        .setDesc(t('settings.tolerances.clearAllDesc'))
        .addButton((btn) => {
          btn
            .setButtonText(t('settings.tolerances.clearAllButton'))
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.foodTolerances = {};
              await this.plugin.saveSettings();
              this.display(); // Refresh the settings page
              new Notice(t('settings.tolerances.allTolerancesCleared'));
            });
        });
    }
  }

  private renderAdvancedTab(containerEl: HTMLElement): void {
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

    new Setting(containerEl).setName(`🔄 ${t('settings.rename.header')}`).setHeading();

    // Add informational note about using storage folder
    containerEl.createEl('p', {
      text: 'Rename tracking uses the Storage Folder configured in the General tab.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName(t('settings.rename.followRenamesEnabled'))
      .setDesc(t('settings.rename.followRenamesEnabledDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.followRenamesEnabled).onChange(async (value) => {
          this.plugin.settings.followRenamesEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.rename.autoConfirmRenames'))
      .setDesc(t('settings.rename.autoConfirmRenamesDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoConfirmRenames).onChange(async (value) => {
          this.plugin.settings.autoConfirmRenames = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.rename.backupOnRename'))
      .setDesc(t('settings.rename.backupOnRenameDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.backupOnRename).onChange(async (value) => {
          this.plugin.settings.backupOnRename = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.rename.caseSensitiveFoodMatch'))
      .setDesc(t('settings.rename.caseSensitiveFoodMatchDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.caseSensitiveFoodMatch).onChange(async (value) => {
          this.plugin.settings.caseSensitiveFoodMatch = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.rename.includeAliasesOnRename'))
      .setDesc(t('settings.rename.includeAliasesOnRenameDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeAliasesOnRename).onChange(async (value) => {
          this.plugin.settings.includeAliasesOnRename = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderSupportTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t('settings.support.title')).setHeading();

    containerEl.createEl('p', {
      text: t('settings.support.description'),
      cls: 'setting-item-description',
    });

    // Buy me a coffee section
    const coffeeContainer = containerEl.createDiv({ cls: 'buy-me-coffee-container' });

    coffeeContainer.createEl('p', {
      text: t('settings.support.coffeeText'),
    });

    // Create the buy me a coffee button using an iframe
    const coffeeIframe = coffeeContainer.createEl('iframe', {
      attr: {
        src: 'https://www.buymeacoffee.com/widget/page/jamescliffordspratt?description=Support%20the%20Macros%20Plugin&color=%23FFDD00',
        width: '100%',
        height: '400',
        frameborder: '0',
        scrolling: 'no',
      },
    });

    // Documentation and links section
    new Setting(containerEl).setName(t('settings.support.linksTitle')).setHeading();

    const linksContainer = containerEl.createDiv({ cls: 'support-links-container' });

    linksContainer.createEl('p', {
      text: t('settings.support.linksDescription'),
    });

    const linksList = linksContainer.createEl('ul');

    // GitHub repository
    const githubItem = linksList.createEl('li');
    githubItem.createEl('a', {
      text: t('settings.support.githubLink'),
      attr: {
        href: 'https://github.com/JamesCliffordSpratt/macros',
        target: '_blank',
      },
    });

    // Documentation
    const docsItem = linksList.createEl('li');
    docsItem.createEl('a', {
      text: t('settings.support.docsLink'),
      attr: {
        href: 'https://github.com/JamesCliffordSpratt/macros/wiki',
        target: '_blank',
      },
    });

    // Report issues
    const issuesItem = linksList.createEl('li');
    issuesItem.createEl('a', {
      text: t('settings.support.issuesLink'),
      attr: {
        href: 'https://github.com/JamesCliffordSpratt/macros/issues',
        target: '_blank',
      },
    });

    // Plugin info section
    new Setting(containerEl).setName(t('settings.support.pluginInfoTitle')).setHeading();

    const infoContainer = containerEl.createDiv({ cls: 'plugin-info-container' });

    infoContainer.createEl('p', {
      text: t('settings.support.pluginVersion', { version: this.plugin.manifest.version }),
    });

    infoContainer.createEl('p', {
      text: t('settings.support.pluginAuthor', { author: this.plugin.manifest.author }),
    });

    infoContainer.createEl('p', {
      text: t('settings.support.pluginDescription', {
        description: this.plugin.manifest.description,
      }),
    });

    // Thanks section
    const thanksContainer = containerEl.createDiv({ cls: 'thanks-container' });
    thanksContainer.createEl('p', {
      text: t('settings.support.thanksMessage'),
    });
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

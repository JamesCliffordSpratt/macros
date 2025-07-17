import { App, Modal, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { LiveFoodSearchModal } from '../live-search/LiveSearchModal';
import { ManualFoodEntryModal } from './ManualFoodEntryModal';
import { t } from '../../lang/I18nManager';

/**
 * Modal that presents the user with options to either use FatSecret live search
 * or manually enter food data
 */
export class FoodEntrySelectionModal extends Modal {
  private plugin: MacrosPlugin;
  private onFoodSelected: (item: import('../../core/api').FoodItem) => void;
  private component: Component;

  constructor(
    app: App,
    plugin: MacrosPlugin,
    onFoodSelected: (item: import('../../core/api').FoodItem) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.onFoodSelected = onFoodSelected;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('food-entry-selection-modal');

    // Create header
    contentEl.createEl('h2', {
      text: t('food.entry.title'),
      cls: 'modal-title macros-modal-title',
    });

    contentEl.createEl('p', {
      text: t('food.entry.description'),
      cls: 'modal-description macros-modal-description',
    });

    // Create button container
    const buttonContainer = contentEl.createDiv({ cls: 'food-entry-options' });

    // Live Search Option
    const liveSearchOption = buttonContainer.createDiv({
      cls: 'food-entry-option live-search-option',
    });

    const liveSearchIcon = liveSearchOption.createDiv({ cls: 'option-icon' });
    liveSearchIcon.innerHTML = '🔍'; // Search icon

    const liveSearchContent = liveSearchOption.createDiv({ cls: 'option-content' });
    liveSearchContent.createEl('h3', { text: t('food.entry.liveSearch') });
    liveSearchContent.createEl('p', {
      text: t('food.entry.liveSearchDesc'),
    });

    const liveSearchFooter = liveSearchOption.createDiv({ cls: 'option-footer' });

    // Check if API credentials are available
    const hasCredentials = this.plugin.apiService.hasApiCredentials();

    if (hasCredentials) {
      liveSearchFooter.createEl('span', {
        text: t('food.entry.apiConfigured'),
        cls: 'status-indicator macros-status-indicator status-success',
      });
    } else {
      liveSearchFooter.createEl('span', {
        text: t('food.entry.apiNotConfigured'),
        cls: 'status-indicator macros-status-indicator status-warning',
      });
    }

    // Manual Entry Option
    const manualEntryOption = buttonContainer.createDiv({
      cls: 'food-entry-option manual-entry-option',
    });

    const manualEntryIcon = manualEntryOption.createDiv({ cls: 'option-icon' });
    manualEntryIcon.innerHTML = '✏️'; // Edit icon

    const manualEntryContent = manualEntryOption.createDiv({ cls: 'option-content' });
    manualEntryContent.createEl('h3', { text: t('food.entry.manualEntry') });
    manualEntryContent.createEl('p', {
      text: t('food.entry.manualEntryDesc'),
    });

    const manualEntryFooter = manualEntryOption.createDiv({ cls: 'option-footer' });
    manualEntryFooter.createEl('span', {
      text: t('food.entry.alwaysAvailable'),
      cls: 'status-indicator macros-status-indicator status-success',
    });

    // Add click handlers
    this.component.registerDomEvent(liveSearchOption, 'click', () => {
      this.handleLiveSearchClick();
    });

    this.component.registerDomEvent(manualEntryOption, 'click', () => {
      this.handleManualEntryClick();
    });

    // Add hover effects
    this.component.registerDomEvent(liveSearchOption, 'mouseenter', () => {
      liveSearchOption.addClass('option-hover');
    });

    this.component.registerDomEvent(liveSearchOption, 'mouseleave', () => {
      liveSearchOption.removeClass('option-hover');
    });

    this.component.registerDomEvent(manualEntryOption, 'mouseenter', () => {
      manualEntryOption.addClass('option-hover');
    });

    this.component.registerDomEvent(manualEntryOption, 'mouseleave', () => {
      manualEntryOption.removeClass('option-hover');
    });

    // Disable live search option if no credentials
    if (!hasCredentials) {
      liveSearchOption.addClass('option-disabled');
    }

    // Focus on manual entry by default (always available)
    manualEntryOption.focus();
  }

  private handleLiveSearchClick(): void {
    try {
      // Check if API credentials are configured
      const credentials = this.plugin.apiService.getCredentialsSafe();
      if (!credentials) {
        // Show error and keep modal open
        const errorEl = this.contentEl.createDiv({
          cls: 'api-error-message macros-api-error-message',
          text: t('notifications.apiCredentialsRequired'),
        });

        // Remove error message after 5 seconds
        setTimeout(() => {
          if (errorEl.parentNode) {
            errorEl.parentNode.removeChild(errorEl);
          }
        }, 5000);
        return;
      }

      // Close this modal and open live search
      this.close();

      new LiveFoodSearchModal(
        this.app,
        credentials.key,
        credentials.secret,
        this.onFoodSelected,
        this.plugin
      ).open();
    } catch (error) {
      this.plugin.logger.error('Error opening live search:', error);

      const errorEl = this.contentEl.createDiv({
        cls: 'api-error-message macros-api-error-message',
        text: t('errors.apiConnectionFailed'),
      });

      setTimeout(() => {
        if (errorEl.parentNode) {
          errorEl.parentNode.removeChild(errorEl);
        }
      }, 5000);
    }
  }

  private handleManualEntryClick(): void {
    // Close this modal and open manual entry
    this.close();

    new ManualFoodEntryModal(this.app, this.plugin, this.onFoodSelected).open();
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

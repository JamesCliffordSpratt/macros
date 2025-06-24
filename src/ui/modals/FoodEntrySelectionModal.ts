import { App, Modal, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { LiveFoodSearchModal } from '../live-search/LiveSearchModal';
import { ManualFoodEntryModal } from './ManualFoodEntryModal';

/**
 * Modal that presents the user with options to either use FatSecret live search
 * or manually enter food data
 */
export class FoodEntrySelectionModal extends Modal {
  private plugin: MacrosPlugin;
  private onFoodSelected: (item: any) => void;
  private component: Component;

  constructor(app: App, plugin: MacrosPlugin, onFoodSelected: (item: any) => void) {
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
      text: 'Add Food Item',
      cls: 'modal-title',
    });

    contentEl.createEl('p', {
      text: 'Choose how you would like to add your food item:',
      cls: 'modal-description',
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
    liveSearchContent.createEl('h3', { text: 'Live Search' });
    liveSearchContent.createEl('p', {
      text: 'Search FatSecret database for nutritional information',
    });

    const liveSearchFooter = liveSearchOption.createDiv({ cls: 'option-footer' });

    // Check if API credentials are available
    const hasCredentials = this.plugin.apiService.hasApiCredentials();

    if (hasCredentials) {
      liveSearchFooter.createEl('span', {
        text: '✓ API configured',
        cls: 'status-indicator status-success',
      });
    } else {
      liveSearchFooter.createEl('span', {
        text: '⚠ API not configured',
        cls: 'status-indicator status-warning',
      });
    }

    // Manual Entry Option
    const manualEntryOption = buttonContainer.createDiv({
      cls: 'food-entry-option manual-entry-option',
    });

    const manualEntryIcon = manualEntryOption.createDiv({ cls: 'option-icon' });
    manualEntryIcon.innerHTML = '✏️'; // Edit icon

    const manualEntryContent = manualEntryOption.createDiv({ cls: 'option-content' });
    manualEntryContent.createEl('h3', { text: 'Manual Entry' });
    manualEntryContent.createEl('p', {
      text: 'Manually enter nutritional information for your food item',
    });

    const manualEntryFooter = manualEntryOption.createDiv({ cls: 'option-footer' });
    manualEntryFooter.createEl('span', {
      text: '✓ Always available',
      cls: 'status-indicator status-success',
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
          cls: 'api-error-message',
          text: 'API credentials not configured. Please add your FatSecret API credentials in the plugin settings to use live search.',
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
        cls: 'api-error-message',
        text: 'Unable to open live search. Please check your API credentials in settings.',
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

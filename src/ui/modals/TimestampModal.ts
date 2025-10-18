import { App, Modal, Notice, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export class TimestampModal extends Modal {
  private plugin: MacrosPlugin;
  private onSubmit: (timestamp: string) => Promise<void>;
  private component: Component;
  private currentTimestamp: string;
  private isEditing: boolean;
  private targetType: 'meal' | 'food-item';
  private targetName: string;

  constructor(
    app: App,
    plugin: MacrosPlugin,
    currentTimestamp: string,
    targetType: 'meal' | 'food-item',
    targetName: string,
    onSubmit: (timestamp: string) => Promise<void>
  ) {
    super(app);
    this.plugin = plugin;
    this.currentTimestamp = currentTimestamp;
    this.isEditing = currentTimestamp.length > 0;
    this.targetType = targetType;
    this.targetName = targetName;
    this.onSubmit = onSubmit;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('timestamp-modal');

    // Create header
    const header = contentEl.createEl('div', {
      cls: 'modal-header macros-modal-header timestamp-modal-header',
    });
    const title = this.isEditing
      ? this.targetType === 'meal'
        ? t('timestamps.editMealTimestamp')
        : t('timestamps.editItemTimestamp')
      : this.targetType === 'meal'
        ? t('timestamps.addMealTimestamp')
        : t('timestamps.addItemTimestamp');

    header.createEl('h2', {
      text: title,
      cls: 'timestamp-modal-title',
    });

    // Create description
    const description = contentEl.createEl('div', {
      cls: 'modal-description macros-modal-description timestamp-modal-description',
    });
    const descriptionText =
      this.targetType === 'meal'
        ? t('timestamps.mealDescription', { mealName: this.targetName })
        : t('timestamps.itemDescription', { itemName: this.targetName });

    description.createEl('p', {
      text: descriptionText,
      cls: 'timestamp-description-text',
    });

    // Create input container
    const inputContainer = contentEl.createDiv({ cls: 'timestamp-input-container' });

    const inputLabel = inputContainer.createEl('label', {
      text: t('timestamps.timeLabel'),
      cls: 'timestamp-input-label',
    });

    // Create time input with current time as default
    const timeInput = inputContainer.createEl('input', {
      type: 'time',
      cls: 'timestamp-input-time',
    });

    // Set initial value
    if (this.currentTimestamp) {
      timeInput.value = this.currentTimestamp;
    } else {
      // Default to current time
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      timeInput.value = `${hours}:${minutes}`;
    }

    // Add quick time buttons
    const quickTimeContainer = inputContainer.createDiv({ cls: 'quick-time-container' });
    quickTimeContainer.createEl('label', {
      text: t('timestamps.quickTimes'),
      cls: 'quick-time-label',
    });

    const quickTimeButtons = quickTimeContainer.createDiv({ cls: 'quick-time-buttons' });

    // Breakfast, Lunch, Dinner presets
    const presets = [
      { label: t('timestamps.breakfast'), time: '08:00' },
      { label: t('timestamps.lunch'), time: '12:00' },
      { label: t('timestamps.dinner'), time: '18:00' },
      { label: t('timestamps.now'), time: this.getCurrentTime() },
    ];

    presets.forEach(({ label, time }) => {
      const btn = quickTimeButtons.createEl('button', {
        text: label,
        cls: 'quick-time-btn',
        type: 'button',
      });

      this.component.registerDomEvent(btn, 'click', () => {
        timeInput.value = time;
        timeInput.focus();
      });
    });

    // Button container
    const buttonContainer = contentEl.createDiv({
      cls: 'timestamp-button-container macros-button-container',
    });

    const cancelBtn = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'mod-button timestamp-cancel-btn',
    });

    const saveBtn = buttonContainer.createEl('button', {
      text: this.isEditing ? t('timestamps.updateTimestamp') : t('timestamps.addTimestamp'),
      cls: 'mod-button mod-cta timestamp-save-btn',
    });

    // If editing, add a remove button
    if (this.isEditing) {
      const removeBtn = buttonContainer.createEl('button', {
        text: t('timestamps.removeTimestamp'),
        cls: 'mod-button mod-warning timestamp-remove-btn',
      });

      this.component.registerDomEvent(removeBtn, 'click', async () => {
        try {
          await this.onSubmit(''); // Empty string removes the timestamp
          new Notice(t('timestamps.timestampRemoved'));
          this.close();
        } catch (error) {
          this.plugin.logger.error('Error removing timestamp:', error);
          new Notice(t('timestamps.removeError', { error: (error as Error).message }));
        }
      });
    }

    // Event handlers
    this.component.registerDomEvent(cancelBtn, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(saveBtn, 'click', async () => {
      const timestamp = timeInput.value.trim();

      if (!timestamp) {
        new Notice(t('timestamps.invalidTime'));
        return;
      }

      // Validate time format
      if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timestamp)) {
        new Notice(t('timestamps.invalidTime'));
        return;
      }

      try {
        await this.onSubmit(timestamp);
        const successMsg = timestamp
          ? this.isEditing
            ? t('timestamps.timestampUpdated')
            : t('timestamps.timestampAdded')
          : t('timestamps.timestampRemoved');
        new Notice(successMsg);
        this.close();
      } catch (error) {
        this.plugin.logger.error('Error saving timestamp:', error);
        new Notice(t('timestamps.saveError', { error: (error as Error).message }));
      }
    });

    // Handle Enter key (save) and Escape key (cancel)
    this.component.registerDomEvent(timeInput, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    // Focus and select the time input
    setTimeout(() => {
      timeInput.focus();
      timeInput.select();
    }, 100);
  }

  private getCurrentTime(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

import { App, Modal, Notice, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export class CustomServingSizeModal extends Modal {
  foodName: string;
  defaultServing: number;
  onSubmit: (customServing: number) => void;
  private component: Component;

  constructor(
    app: App,
    foodName: string,
    defaultServing: number,
    onSubmit: (customServing: number) => void,
    _plugin?: MacrosPlugin // FIX: Use underscore prefix for unused parameter
  ) {
    super(app);
    this.foodName = foodName;
    this.defaultServing = defaultServing;
    this.onSubmit = onSubmit;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;

    // Add mobile-friendly class to the modal
    contentEl.addClass('custom-serving-modal');

    // FIX: Create header element directly without storing in unused variable
    contentEl.createEl('h2', {
      text: t('food.customServing.title', { foodName: this.foodName }),
      cls: 'custom-serving-modal-title',
    });

    // FIX: Create description element directly without storing in unused variable
    contentEl.createEl('p', {
      text: t('food.customServing.description', { defaultServing: this.defaultServing.toString() }),
      cls: 'custom-serving-modal-description',
    });

    // Create input container for better mobile layout
    const inputContainer = contentEl.createDiv({ cls: 'custom-serving-input-container' });

    const inputEl = inputContainer.createEl('input', {
      type: 'number',
      cls: 'custom-serving-input',
    });
    inputEl.placeholder = `${this.defaultServing}`;
    inputEl.value = `${this.defaultServing}`;

    const handleSubmit = () => {
      const value = parseFloat(inputEl.value);
      if (isNaN(value) || value <= 0) {
        new Notice(t('validation.invalidServing'));
      } else {
        this.onSubmit(value);
        this.close();
      }
    };

    this.component.registerDomEvent(inputEl, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      } else if (event.key === 'Escape') {
        this.close();
      }
    });

    // Create button container for better mobile layout
    const buttonContainer = contentEl.createDiv({ cls: 'custom-serving-button-container' });

    const submitBtn = buttonContainer.createEl('button', {
      text: t('food.customServing.submit'),
      cls: 'custom-serving-submit-btn mod-cta',
    });

    this.component.registerDomEvent(submitBtn, 'click', handleSubmit);

    // Focus input after a small delay to ensure proper rendering
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 100);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

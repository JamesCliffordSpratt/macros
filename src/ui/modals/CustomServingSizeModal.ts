import { App, Modal, Notice, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export class CustomServingSizeModal extends Modal {
  foodName: string;
  defaultServing: number;
  onSubmit: (customServing: number) => void;
  private component: Component;
  private plugin?: MacrosPlugin;

  constructor(
    app: App,
    foodName: string,
    defaultServing: number,
    onSubmit: (customServing: number) => void,
    plugin?: MacrosPlugin
  ) {
    super(app);
    this.foodName = foodName;
    this.defaultServing = defaultServing;
    this.onSubmit = onSubmit;
    this.component = new Component();
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;

    // Add mobile-friendly class to the modal
    contentEl.addClass('custom-serving-modal');

    // Create header element directly without storing in unused variable
    contentEl.createEl('h2', {
      text: t('food.customServing.title', { foodName: this.foodName }),
      cls: 'custom-serving-modal-title',
    });

    // Try to get the default serving size from the food file if plugin is available
    let suggestedServing = this.defaultServing;
    let isUsingCustomDefault = false;

    if (this.plugin) {
      const foodFile = this.plugin.dataManager.findFoodFile(this.foodName);
      if (foodFile) {
        const cache = this.plugin.app.metadataCache.getFileCache(foodFile);
        if (cache?.frontmatter) {
          const defaultServingSize = cache.frontmatter['default_serving_size'];
          if (defaultServingSize) {
            // Parse the default serving size (remove 'g' suffix if present)
            const parsedDefaultServing = parseFloat(
              defaultServingSize.toString().replace(/g$/i, '')
            );
            if (!isNaN(parsedDefaultServing) && parsedDefaultServing > 0) {
              suggestedServing = parsedDefaultServing;
              isUsingCustomDefault = true;
            }
          }
        }
      }
    }

    // Create description with information about the serving size
    let descriptionText = t('food.customServing.description', {
      defaultServing: this.defaultServing.toString(),
    });

    if (isUsingCustomDefault && suggestedServing !== this.defaultServing) {
      descriptionText = `Using your custom default serving size: ${suggestedServing}g (original: ${this.defaultServing}g)`;
    }

    contentEl.createEl('p', {
      text: descriptionText,
      cls: 'custom-serving-modal-description',
    });

    // Create input container for better mobile layout
    const inputContainer = contentEl.createDiv({ cls: 'custom-serving-input-container' });

    const inputEl = inputContainer.createEl('input', {
      type: 'number',
      cls: 'custom-serving-input',
    });
    inputEl.placeholder = `${suggestedServing}`;
    inputEl.value = `${suggestedServing}`;

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

    // If using custom default, add a reset button
    if (isUsingCustomDefault && suggestedServing !== this.defaultServing) {
      const resetBtn = buttonContainer.createEl('button', {
        text: `Reset to Original (${this.defaultServing}g)`,
        cls: 'custom-serving-reset-btn mod-button',
      });

      this.component.registerDomEvent(resetBtn, 'click', () => {
        inputEl.value = this.defaultServing.toString();
        inputEl.focus();
        inputEl.select();
      });
    }

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

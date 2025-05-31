import { App, Modal, Notice, Component } from 'obsidian';
import MacrosPlugin from '../../main';

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
    plugin?: MacrosPlugin
  ) {
    super(app);
    this.foodName = foodName;
    this.defaultServing = defaultServing;
    this.onSubmit = onSubmit;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: `Custom serving size for ${this.foodName}` });
    contentEl.createEl('p', {
      text: `Default serving is ${this.defaultServing}g. Enter a custom serving size in grams:`,
    });

    const inputEl = contentEl.createEl('input', { type: 'number' });
    inputEl.placeholder = `${this.defaultServing}`;
    inputEl.value = `${this.defaultServing}`;

    const handleSubmit = () => {
      const value = parseFloat(inputEl.value);
      if (isNaN(value) || value <= 0) {
        new Notice('Please enter a valid serving size.');
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

    const submitBtn = contentEl.createEl('button', { text: 'Submit' });
    this.component.registerDomEvent(submitBtn, 'click', handleSubmit);

    inputEl.focus();
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

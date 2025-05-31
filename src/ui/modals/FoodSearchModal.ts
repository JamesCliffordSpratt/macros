import { App, Modal, Component } from 'obsidian';
import MacrosPlugin from '../../main';

export class FoodSearchModal extends Modal {
  onSubmit: (searchTerm: string) => void;
  private component: Component;

  constructor(app: App, onSubmit: (searchTerm: string) => void, plugin?: MacrosPlugin) {
    super(app);
    this.onSubmit = onSubmit;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Enter food search term', cls: 'mod-header' });
    const inputEl = contentEl.createEl('input', { type: 'text' });
    inputEl.placeholder = 'e.g. Apple';

    this.component.registerDomEvent(inputEl, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.onSubmit(inputEl.value);
        this.close();
      }
    });

    inputEl.focus();
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

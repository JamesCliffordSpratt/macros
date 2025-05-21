import { App, Modal } from 'obsidian';
import { EventManager } from '../../utils/EventManager';
import MacrosPlugin from '../../main';

/**
 * FoodSearchModal
 * ---------------
 * A modal that prompts the user to enter a food search term.
 *
 * @param app - The Obsidian application instance.
 * @param onSubmit - A callback function to handle the submitted search term.
 */
export class FoodSearchModal extends Modal {
	onSubmit: (searchTerm: string) => void;
	private eventManager: EventManager;
	private plugin: MacrosPlugin;

	constructor(app: App, onSubmit: (searchTerm: string) => void, plugin?: MacrosPlugin) {
		super(app);
		this.onSubmit = onSubmit;
		this.plugin = plugin;
		this.eventManager = new EventManager(plugin);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Enter Food Search Term', cls: 'mod-header' });
		const inputEl = contentEl.createEl('input', { type: 'text' });
		inputEl.placeholder = 'e.g. Apple';

		this.eventManager.registerDomEvent(inputEl, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.onSubmit(inputEl.value);
				this.close();
			}
		});

		inputEl.focus();
	}

	onClose() {
		this.eventManager.cleanup();
		this.contentEl.empty();
	}
}

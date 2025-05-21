import { App, Modal, Notice } from 'obsidian';
import { EventManager } from '../../utils/EventManager';
import MacrosPlugin from '../../main';

/**
 * CustomServingSizeModal
 * ----------------------
 * A modal dialog that allows the user to specify a custom serving size for a selected food item.
 *
 * @param app - The Obsidian application instance.
 * @param foodName - The name of the food item.
 * @param defaultServing - The default serving size value (in grams).
 * @param onSubmit - A callback function that receives the custom serving size.
 */
export class CustomServingSizeModal extends Modal {
	foodName: string;
	defaultServing: number;
	onSubmit: (customServing: number) => void;
	private eventManager: EventManager;
	private plugin: MacrosPlugin;

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
		this.plugin = plugin || null;
		this.eventManager = new EventManager(plugin);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: `Custom Serving Size for ${this.foodName}` });
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

		this.eventManager.registerDomEvent(inputEl, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				handleSubmit();
			} else if (event.key === 'Escape') {
				this.close();
			}
		});

		const submitBtn = contentEl.createEl('button', { text: 'Submit' });
		this.eventManager.registerDomEvent(submitBtn, 'click', handleSubmit);

		inputEl.focus();
	}

	onClose() {
		this.eventManager.cleanup();
		this.contentEl.empty();
	}
}

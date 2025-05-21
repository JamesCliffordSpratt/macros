import { TFolder, App, AbstractInputSuggest } from 'obsidian';

/**
 * FolderSuggest
 *
 * A dropdown-style folder selector component that implements Obsidian's AbstractInputSuggest.
 * This allows users to select folders from a dropdown or by typing in the input field.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private folders: TFolder[] = [];

	constructor(
		public app: App,
		public inputEl: HTMLInputElement,
		private defaultPlaceholder: string = 'Nutrition'
	) {
		super(app, inputEl);
		this.loadFolders();
		inputEl.placeholder = this.defaultPlaceholder;
	}

	/**
	 * Load all folders from the vault
	 */
	private loadFolders(): void {
		// Reset folders array
		this.folders = [];

		// Get all folders recursively from the vault root
		const collectFolders = (folder: TFolder) => {
			this.folders.push(folder);

			// Recursively process subfolders
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					collectFolders(child);
				}
			}
		};

		// Start from the vault root
		collectFolders(this.app.vault.getRoot());
	}

	/**
	 * Called when the input value changes, returns matching folders
	 */
	getSuggestions(inputStr: string): TFolder[] {
		const inputLower = inputStr.toLowerCase();

		// If input is empty, return all folders
		if (!inputLower) {
			return this.folders;
		}

		// Otherwise, filter folders by name
		return this.folders.filter((folder) => folder.path.toLowerCase().contains(inputLower));
	}

	/**
	 * Renders each suggestion item in the dropdown
	 */
	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);

		// Add a CSS class for styling
		el.addClass('folder-suggest-item');
	}

	/**
	 * Called when a suggestion is selected
	 */
	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		this.inputEl.trigger('input');
		this.close();
	}
}

import { App, Modal, Notice, Component } from 'obsidian';
import { extractServingSize } from '../../utils/nutritionUtils';
import { fetchFoodData, FoodItem } from '../../core/api';
import MacrosPlugin from '../../main';

export class LiveFoodSearchModal extends Modal {
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLElement;
	private loadingIndicator: HTMLElement;
	private noResultsMessage: HTMLElement;
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;
	private maxResults = 50;
	private results: FoodItem[] = [];
	private selectedIndex = -1;
	private isSearching = false;
	private component: Component;

	constructor(
		public app: App,
		public apiKey: string,
		public apiSecret: string,
		public onSelect: (item: FoodItem) => void,
		private plugin?: MacrosPlugin
	) {
		super(app);
		this.component = new Component();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('live-food-search-modal');
		contentEl.createEl('h2', { text: 'Search for food', cls: 'mod-header' });

		const searchContainer = contentEl.createDiv({ cls: 'search-container' });
		this.searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Start typing to search (e.g., Apple)',
			cls: 'live-search-input',
		});

		this.loadingIndicator = contentEl.createDiv({
			cls: 'loading-indicator is-hidden',
			text: 'Searching...',
		});

		this.resultsContainer = contentEl.createDiv({ cls: 'results-container' });

		this.noResultsMessage = contentEl.createDiv({
			cls: 'no-results-message is-hidden',
			text: 'No results found. Try a different search term.',
		});

		this.searchInput.focus();

		this.component.registerDomEvent(this.searchInput, 'input', this.handleSearchInput);
		this.component.registerDomEvent(this.searchInput, 'keydown', this.handleKeyboardNavigation);
	}

	onClose() {
		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}
		this.component.unload();
		this.contentEl.empty();
	}

	handleSearchInput = () => {
		const searchTerm = this.searchInput.value.trim();

		if (this.searchTimeout) {
			clearTimeout(this.searchTimeout);
		}

		this.selectedIndex = -1;

		if (!searchTerm) {
			this.resultsContainer.empty();
			this.noResultsMessage.classList.add('is-hidden');
			return;
		}

		this.loadingIndicator.classList.remove('is-hidden');
		this.noResultsMessage.classList.add('is-hidden');

		this.searchTimeout = setTimeout(() => {
			this.performSearch(searchTerm);
		}, 300);
	};

	handleKeyboardNavigation = (event: KeyboardEvent) => {
		if (this.results.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
			this.highlightSelectedResult();
			this.scrollToSelectedResult();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
			this.highlightSelectedResult();
			this.scrollToSelectedResult();
		} else if (event.key === 'Enter' && this.selectedIndex >= 0) {
			event.preventDefault();
			this.onSelect(this.results[this.selectedIndex]);
			this.close();
		}
	};

	highlightSelectedResult() {
		this.resultsContainer.querySelectorAll('.food-result-item').forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass('highlighted-result');
			} else {
				item.removeClass('highlighted-result');
			}
		});
	}

	scrollToSelectedResult() {
		const selectedElement = this.resultsContainer.querySelector('.highlighted-result');
		if (selectedElement) {
			selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	async performSearch(searchTerm: string) {
		if (this.isSearching) return;
		this.isSearching = true;

		try {
			this.results = await fetchFoodData(
				this.app,
				searchTerm,
				0,
				this.maxResults,
				this.apiKey,
				this.apiSecret
			);

			this.loadingIndicator.classList.add('is-hidden');
			this.renderResults(searchTerm);
		} catch (error) {
			if (this.plugin && this.plugin.logger) {
				this.plugin.logger.error('Error fetching food data:', error);
			} else {
				console.error('Error fetching food data:', error);
			}
			this.loadingIndicator.classList.add('is-hidden');
			new Notice('Error searching for food items. Please try again.');
		} finally {
			this.isSearching = false;
		}
	}

	escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	renderResults(searchTerm: string) {
		this.resultsContainer.empty();

		if (this.results.length === 0) {
			this.noResultsMessage.classList.remove('is-hidden');
			return;
		}

		this.noResultsMessage.classList.add('is-hidden');

		const normalizedQuery = searchTerm.toLowerCase();
		const escapedSearchTerm = this.escapeRegExp(searchTerm);

		this.results
			.filter((food) => food.food_name.toLowerCase().includes(normalizedQuery))
			.forEach((food, index) => {
				const foodDiv = this.resultsContainer.createDiv({ cls: 'food-result-item' });

				const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
				const parts = food.food_name.split(regex);

				parts.forEach((part) => {
					if (part.toLowerCase() === searchTerm.toLowerCase()) {
						foodDiv.createEl('strong', { text: part });
					} else if (part) {
						foodDiv.createSpan({ text: part });
					}
				});

				const servingSize = extractServingSize(food.food_description);
				foodDiv.createSpan({ text: ` - ${servingSize}` });

				if (index === this.selectedIndex) {
					foodDiv.addClass('highlighted-result');
				}

				this.component.registerDomEvent(foodDiv, 'click', () => {
					this.onSelect(food);
					this.close();
				});

				this.component.registerDomEvent(foodDiv, 'mouseenter', () => {
					this.selectedIndex = index;
					this.highlightSelectedResult();
				});
			});
	}
}

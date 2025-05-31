import { App, Modal, Component } from 'obsidian';
import { extractServingSize } from '../../utils/nutritionUtils';
import { fetchFoodData, FoodItem } from '../../core/api';
import MacrosPlugin from '../../main';

export class FoodResultsModal extends Modal {
  currentPage = 0;
  maxResults = 25;
  results: FoodItem[] = [];
  selectedIndex = -1;
  private component: Component;
  private plugin: MacrosPlugin;

  constructor(
    public app: App,
    public searchTerm: string,
    public apiKey: string,
    public apiSecret: string,
    public onSelect: (item: FoodItem) => void,
    plugin?: MacrosPlugin
  ) {
    super(app);
    this.plugin = plugin;
    this.component = new Component();
  }

  async loadPage(page: number) {
    this.currentPage = page;
    this.results = await fetchFoodData(
      this.app,
      this.searchTerm,
      page,
      this.maxResults,
      this.apiKey,
      this.apiSecret
    );
    this.renderContent();
  }

  onOpen() {
    this.loadPage(0);

    // Add document-level event handling - register with component for cleanup
    this.component.registerDomEvent(document, 'keydown', this.handleKeyNav);
  }

  onClose() {
    // Component cleanup will handle the document event listener
    this.component.unload();
    this.contentEl.empty();
  }

  handleKeyNav = (event: KeyboardEvent) => {
    if (this.results.length === 0) return;

    if (event.key === 'ArrowDown') {
      this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
      this.renderContent();
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
      this.renderContent();
      event.preventDefault();
    } else if (event.key === 'Enter' && this.selectedIndex >= 0) {
      this.onSelect(this.results[this.selectedIndex]);
      this.close();
    }
  };

  // Helper function to safely escape regex special characters
  escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  renderContent() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', {
      text: `Results for "${this.searchTerm}" (Page ${this.currentPage + 1})`,
    });

    if (this.results.length === 0) {
      contentEl.createEl('p', { text: 'No results found on this page.' });
    } else {
      const normalizedQuery = this.searchTerm.toLowerCase();
      const escapedSearchTerm = this.escapeRegExp(this.searchTerm);

      this.results
        .filter((food) => food.food_name.toLowerCase().includes(normalizedQuery))
        .forEach((food, index) => {
          const foodDiv = contentEl.createDiv({ cls: 'food-result-item' });

          // Split the food name by the search term for highlighting
          const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
          const parts = food.food_name.split(regex);

          parts.forEach((part) => {
            if (part.toLowerCase() === this.searchTerm.toLowerCase()) {
              foodDiv.createEl('strong', { text: part });
            } else if (part) {
              foodDiv.createSpan({ text: part });
            }
          });

          // Add the serving size
          const servingSize = extractServingSize(food.food_description);
          const servingSpan = foodDiv.createSpan();
          servingSpan.textContent = ` - ${servingSize}`;

          if (index === this.selectedIndex) {
            foodDiv.addClass('highlighted-result');
          }

          this.component.registerDomEvent(foodDiv, 'click', () => {
            this.onSelect(food);
            this.close();
          });
        });
    }

    const navDiv = contentEl.createDiv({ cls: 'food-nav' });

    if (this.currentPage > 0) {
      const prevBtn = navDiv.createEl('button', { text: '< Prev' });
      prevBtn.addClass('mod-button');

      this.component.registerDomEvent(prevBtn, 'click', () => this.loadPage(this.currentPage - 1));
    }

    navDiv.createEl('span', { text: ` Page ${this.currentPage + 1} ` });

    if (this.results.length === this.maxResults) {
      const nextBtn = navDiv.createEl('button', { text: 'Next >' });
      nextBtn.addClass('mod-button');

      this.component.registerDomEvent(nextBtn, 'click', () => this.loadPage(this.currentPage + 1));
    }
  }
}

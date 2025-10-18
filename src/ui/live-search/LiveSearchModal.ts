import { App, Modal, Notice, Component, normalizePath, TFile, setIcon } from 'obsidian';
import { searchAllSources, searchFoundationFoodsOnly, UnifiedFoodResult } from '../../core/search';
import { searchByBarcode, validateBarcodeChecksum } from '../../core/barcodeSearch';
import { searchFoods } from '../../core/usda';
import { BarcodeScannerModal } from '../../utils/BarcodeScanner';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';
import {
  buildFuseIndex,
  fuseSearch,
  unifiedResultToFoodDoc,
  generateSearchVariants,
  FoodDoc,
} from '../../core/fuseSearch';

type SearchTab =
  | 'all'
  | 'fatsecret'
  | 'usda-branded'
  | 'usda-foundation'
  | 'usda-legacy'
  | 'openfoodfacts';

export class LiveFoodSearchModal extends Modal {
  private searchInput: HTMLInputElement;
  private searchContainer: HTMLElement;
  private barcodeButton: HTMLElement;
  private tabsContainer: HTMLElement;
  private resultsContainer: HTMLElement;
  private loadingIndicator: HTMLElement;
  private noResultsMessage: HTMLElement;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private maxResults = 50;
  private results: UnifiedFoodResult[] = [];
  private allResults: UnifiedFoodResult[] = []; // Store all results for infinite scroll
  private selectedIndex = -1;
  private isSearching = false;
  private component: Component;
  private currentTab: SearchTab = 'all';
  private availableTabs: SearchTab[] = [];
  private currentPage = 0;
  private hasMoreResults = true;
  private isLoadingMore = false;
  private currentSearchTerm = '';
  private scrollHandler?: (event: Event) => void;
  private currentSearchAbortController: AbortController | null = null;
  private isBarcodeSearch = false; // Track if current search is from barcode

  // Tab elements
  private allTab?: HTMLElement;
  private fatSecretTab?: HTMLElement;
  private usdaBrandedTab?: HTMLElement;
  private usdaFoundationTab?: HTMLElement;
  private usdaLegacyTab?: HTMLElement;
  private openFoodFactsTab?: HTMLElement;

  constructor(
    public app: App,
    public apiKey: string,
    public apiSecret: string,
    public onSelect: (item: UnifiedFoodResult) => void,
    private plugin?: MacrosPlugin
  ) {
    super(app);
    this.component = new Component();
    this.determineAvailableTabs();
  }

  /**
   * Enhanced tab determination with Open Food Facts support
   */
  private determineAvailableTabs(): void {
    if (!this.plugin) {
      // Fallback includes Open Food Facts since it doesn't require API keys
      this.availableTabs = ['openfoodfacts', 'fatsecret'];
      this.currentTab = 'openfoodfacts';
      return;
    }

    const settings = this.plugin.settings;
    const hasFatSecret =
      settings.fatSecretEnabled && settings.fatSecretApiKey && settings.fatSecretApiSecret;
    const hasUsda = settings.usdaEnabled && settings.usdaApiKey;
    const hasOpenFoodFacts = settings.openFoodFactsEnabled !== false; // Default to enabled

    if (hasFatSecret && hasUsda && hasOpenFoodFacts) {
      // All three enabled → show All, Foundation, Legacy, Branded, OpenFoodFacts, FatSecret tabs
      this.availableTabs = [
        'all',
        'usda-foundation',
        'usda-legacy',
        'usda-branded',
        'openfoodfacts',
        'fatsecret',
      ];
      this.currentTab = 'all';
    } else if (hasUsda && hasOpenFoodFacts) {
      // USDA + Open Food Facts → show Foundation, Legacy, Branded, and OpenFoodFacts tabs
      this.availableTabs = ['usda-foundation', 'usda-legacy', 'usda-branded', 'openfoodfacts'];
      this.currentTab = 'usda-foundation';
    } else if (hasFatSecret && hasOpenFoodFacts) {
      // FatSecret + Open Food Facts → show OpenFoodFacts, FatSecret, and All tabs
      this.availableTabs = ['all', 'openfoodfacts', 'fatsecret'];
      this.currentTab = 'openfoodfacts'; // Prefer OFF since it's free
    } else if (hasUsda) {
      // Only USDA → show Foundation, Legacy, and Branded tabs
      this.availableTabs = ['usda-foundation', 'usda-legacy', 'usda-branded'];
      this.currentTab = 'usda-foundation';
    } else if (hasFatSecret) {
      // Only FatSecret → show FatSecret tab and Open Food Facts if enabled
      this.availableTabs = hasOpenFoodFacts ? ['openfoodfacts', 'fatsecret'] : ['fatsecret'];
      this.currentTab = hasOpenFoodFacts ? 'openfoodfacts' : 'fatsecret';
    } else if (hasOpenFoodFacts) {
      // Only Open Food Facts → show just Open Food Facts tab
      this.availableTabs = ['openfoodfacts'];
      this.currentTab = 'openfoodfacts';
    } else {
      // No APIs configured → fallback to Open Food Facts (free)
      this.availableTabs = ['openfoodfacts'];
      this.currentTab = 'openfoodfacts';
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('live-food-search-modal');
    contentEl.createEl('h2', { text: t('food.search.title'), cls: 'mod-header' });

    this.createTabs();
    this.createSearchBarWithBarcode();
    this.createLoadingIndicator();
    this.createResultsContainer();
    this.createNoResultsMessage();

    // Auto-focus search input with a slight delay to ensure proper rendering
    setTimeout(() => {
      this.searchInput.focus();
    }, 50);

    this.component.registerDomEvent(this.searchInput, 'input', this.handleSearchInput);
    this.component.registerDomEvent(this.searchInput, 'keydown', this.handleKeyboardNavigation);
  }

  onClose() {
    // Clean up search timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    // Cancel any ongoing search
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort();
      this.currentSearchAbortController = null;
    }

    // Clean up scroll handler
    if (this.scrollHandler && this.resultsContainer) {
      this.resultsContainer.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = undefined;
    }

    // Component cleanup handles all registered DOM events
    this.component.unload();
    this.contentEl.empty();
  }

  private createTabs(): void {
    // Only create tabs if there are multiple available tabs
    if (this.availableTabs.length <= 1) {
      return;
    }

    this.tabsContainer = this.contentEl.createDiv({
      cls: 'search-tabs-container macros-search-tabs',
    });

    // Fixed: Prefix unused parameter with underscore
    this.availableTabs.forEach((tabKey, _index) => {
      const tabElement = this.tabsContainer.createEl('button', {
        cls: `search-tab macros-search-tab ${tabKey === this.currentTab ? 'active' : ''}`,
        text: this.getTabLabel(tabKey),
      });

      // Store tab references
      switch (tabKey) {
        case 'all':
          this.allTab = tabElement;
          break;
        case 'fatsecret':
          this.fatSecretTab = tabElement;
          break;
        case 'usda-branded':
          this.usdaBrandedTab = tabElement;
          break;
        case 'usda-foundation':
          this.usdaFoundationTab = tabElement;
          break;
        case 'usda-legacy':
          this.usdaLegacyTab = tabElement;
          break;
        case 'openfoodfacts':
          this.openFoodFactsTab = tabElement;
          break;
      }

      this.component.registerDomEvent(tabElement, 'click', () => {
        this.switchTab(tabKey);
      });

      // Prevent tab from stealing focus
      this.component.registerDomEvent(tabElement, 'mousedown', (e: MouseEvent) => {
        e.preventDefault(); // Prevent focus from moving away from search input
      });
    });
  }

  private getTabLabel(tab: SearchTab): string {
    switch (tab) {
      case 'all':
        return t('food.search.tabs.all');
      case 'fatsecret':
        return 'FatSecret';
      case 'usda-branded':
        return 'USDA | Branded';
      case 'usda-foundation':
        return 'USDA | Foundation';
      case 'usda-legacy':
        return 'USDA | Legacy';
      case 'openfoodfacts':
        return 'Open Food Facts';
      default:
        return tab;
    }
  }

  private switchTab(tab: SearchTab): void {
    if (tab === this.currentTab) return;

    this.currentTab = tab;

    // Update tab visual states
    this.availableTabs.forEach((tabKey) => {
      const tabElement = this.getTabElement(tabKey);
      if (tabElement) {
        tabElement.classList.toggle('active', tabKey === tab);
      }
    });

    // Re-run search with current query if there is one
    const currentQuery = this.searchInput.value.trim();
    if (currentQuery) {
      if (this.isBarcodeSearch) {
        this.performBarcodeSearch(currentQuery);
      } else {
        this.performSearch(currentQuery);
      }
    }

    // Maintain focus on search input after tab switch
    setTimeout(() => {
      this.searchInput.focus();
    }, 10);
  }

  private getTabElement(tab: SearchTab): HTMLElement | undefined {
    switch (tab) {
      case 'all':
        return this.allTab;
      case 'fatsecret':
        return this.fatSecretTab;
      case 'usda-branded':
        return this.usdaBrandedTab;
      case 'usda-foundation':
        return this.usdaFoundationTab;
      case 'usda-legacy':
        return this.usdaLegacyTab;
      case 'openfoodfacts':
        return this.openFoodFactsTab;
      default:
        return undefined;
    }
  }

  /**
   * Enhanced search bar with barcode scanner button using Obsidian's setIcon API
   */
  private createSearchBarWithBarcode(): void {
    this.searchContainer = this.contentEl.createDiv({
      cls: 'search-container macros-search-container with-barcode',
    });

    // Search input
    this.searchInput = this.searchContainer.createEl('input', {
      type: 'text',
      placeholder: t('food.search.placeholder'),
      cls: 'live-search-input',
    });

    // Barcode scanner button
    this.barcodeButton = this.searchContainer.createEl('button', {
      cls: 'barcode-scanner-button',
      attr: {
        'aria-label': 'Scan barcode',
      },
    });

    // Use Obsidian's setIcon API to add the barcode icon
    setIcon(this.barcodeButton, 'barcode');

    this.component.registerDomEvent(this.barcodeButton, 'click', () => {
      this.openBarcodeScanner();
    });
  }

  /**
   * Open barcode scanner modal
   */
  private openBarcodeScanner(): void {
    // Fixed: Add null check instead of non-null assertion
    if (!this.plugin) {
      new Notice('Plugin context not available for barcode scanning');
      return;
    }

    const scannerModal = new BarcodeScannerModal(this.app, this.plugin, (barcode: string) =>
      this.handleBarcodeScanned(barcode)
    );

    scannerModal.open();
  }

  /**
   * Handle barcode scan result
   */
  async handleBarcodeScanned(barcode: string): Promise<void> {
    // Validate barcode
    if (!validateBarcodeChecksum(barcode)) {
      new Notice(t('barcode.manual.checksumWarning', { code: barcode }));
    }

    // Set the barcode in search input
    this.searchInput.value = barcode;
    this.isBarcodeSearch = true;

    // Perform barcode-specific search
    await this.performBarcodeSearch(barcode);

    // Focus back on input for potential manual editing
    setTimeout(() => {
      this.searchInput.focus();
      this.searchInput.select();
    }, 100);
  }

  /**
   * Perform barcode-specific search with proper result handling
   */
  private async performBarcodeSearch(barcode: string): Promise<void> {
    if (!this.plugin) {
      new Notice('Plugin context not available for barcode search');
      return;
    }

    this.loadingIndicator.classList.remove('is-hidden');
    this.noResultsMessage.classList.add('is-hidden');
    this.isSearching = true;

    // Clear previous results
    this.resultsContainer.empty();
    this.results = [];
    this.allResults = [];

    try {
      const settings = this.plugin.settings;

      // Configure sources for barcode search
      const sources = {
        openFoodFacts: { enabled: settings.openFoodFactsEnabled !== false },
        usda:
          settings.usdaEnabled && settings.usdaApiKey
            ? { enabled: true, apiKey: settings.usdaApiKey }
            : undefined,
      };

      // Get user's locale
      const userLocale = this.plugin.i18nManager?.getCurrentLocale() || 'en';

      // Search by barcode
      const barcodeResults = await searchByBarcode(this.app, barcode, sources, userLocale);

      // Properly set the results
      this.allResults = barcodeResults;
      this.results = barcodeResults;
      this.hasMoreResults = false; // Barcode search is typically exact match
      this.currentSearchTerm = barcode; // Set current search term

      this.loadingIndicator.classList.add('is-hidden');

      if (barcodeResults.length > 0) {
        // Build Fuse index for barcode results
        const foodDocs: FoodDoc[] = barcodeResults.map(unifiedResultToFoodDoc);
        buildFuseIndex(this.currentTab, foodDocs);

        // Call renderResults with the barcode as search term
        this.renderResults(barcode);
        new Notice(
          t('barcode.scanner.foundResults', { count: barcodeResults.length, code: barcode })
        );
      } else {
        // If no barcode results, show no results message
        this.noResultsMessage.textContent = t('barcode.scanner.noResults', { code: barcode });
        this.noResultsMessage.classList.remove('is-hidden');

        // Clear search input and reset for text search after a delay
        setTimeout(() => {
          this.searchInput.value = '';
          this.isBarcodeSearch = false;
          this.searchInput.placeholder = t('food.search.placeholder');
          this.searchInput.focus();
        }, 2000);
      }
    } catch (error) {
      this.plugin.logger.error('Barcode search error:', error);
      this.loadingIndicator.classList.add('is-hidden');
      new Notice(t('barcode.errors.apiError', { error: (error as Error).message }));

      // Reset for manual search
      this.isBarcodeSearch = false;
      this.noResultsMessage.textContent = `Barcode search failed: ${(error as Error).message}`;
      this.noResultsMessage.classList.remove('is-hidden');
    } finally {
      this.isSearching = false;
    }
  }

  private createLoadingIndicator(): void {
    this.loadingIndicator = this.contentEl.createDiv({
      cls: 'loading-indicator macros-loading-indicator is-hidden',
      text: t('food.search.searching'),
    });
  }

  private createResultsContainer(): void {
    this.resultsContainer = this.contentEl.createDiv({
      cls: 'results-container macros-results-container',
    });
  }

  private createNoResultsMessage(): void {
    this.noResultsMessage = this.contentEl.createDiv({
      cls: 'no-results-message is-hidden',
      text: t('food.search.noResults'),
    });
  }

  handleSearchInput = () => {
    const searchTerm = this.searchInput.value.trim();

    // Reset barcode search flag when user starts typing
    if (!this.isBarcodeSearch || searchTerm !== this.currentSearchTerm) {
      this.isBarcodeSearch = false;
    }

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Cancel any ongoing search
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort();
      this.currentSearchAbortController = null;
    }

    this.selectedIndex = -1;

    if (!searchTerm) {
      this.resultsContainer.empty();
      this.noResultsMessage.classList.add('is-hidden');
      this.loadingIndicator.classList.add('is-hidden');
      return;
    }

    // Use Fuse search if we have results indexed for current tab
    const fuseResults = fuseSearch(this.currentTab, searchTerm);
    if (fuseResults.length > 0) {
      this.results = fuseResults;
      this.renderResults(searchTerm);
      return;
    }

    this.loadingIndicator.classList.remove('is-hidden');
    this.noResultsMessage.classList.add('is-hidden');

    this.searchTimeout = setTimeout(() => {
      const currentSearchTerm = this.searchInput.value.trim();
      if (currentSearchTerm === searchTerm) {
        // Detect if this looks like a barcode (all numbers, 8-14 digits)
        if (/^\d{8,14}$/.test(searchTerm)) {
          this.isBarcodeSearch = true;
          this.performBarcodeSearch(searchTerm);
        } else {
          this.performSearch(searchTerm);
        }
      }
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
      this.handleFoodSelection(this.results[this.selectedIndex]);
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

  /**
   * Enhanced search with Fuse.js integration and fallback variants
   */
  async performSearch(searchTerm: string) {
    // Create new abort controller for this search
    this.currentSearchAbortController = new AbortController();
    const searchAbortSignal = this.currentSearchAbortController.signal;

    // Store the search term at the start of the request
    const requestSearchTerm = searchTerm;

    if (this.isSearching) {
      // If already searching, the abort controller above will cancel the previous request
    }

    this.isSearching = true;

    try {
      if (!this.plugin) {
        throw new Error('Plugin context not available');
      }

      // Check if search was aborted before making the request
      if (searchAbortSignal.aborted) {
        return;
      }

      // Validate that search term still matches current input
      const currentInputValue = this.searchInput.value.trim();
      if (currentInputValue !== requestSearchTerm) {
        this.plugin.logger.debug(
          `Search cancelled: input changed from "${requestSearchTerm}" to "${currentInputValue}"`
        );
        return;
      }

      // Fixed: Use proper typing instead of any
      const settings = this.plugin.settings;

      // Reset for new search
      this.currentPage = 0;
      this.hasMoreResults = true;
      this.allResults = [];

      let newResults: UnifiedFoodResult[] = [];

      // Check if search was aborted before processing results
      if (searchAbortSignal.aborted) {
        return;
      }

      // Try primary search first
      newResults = await this.performApiSearch(requestSearchTerm, settings, searchAbortSignal);

      // If no results, try search variants (singular/plural)
      if (newResults.length === 0) {
        const variants = generateSearchVariants(requestSearchTerm);

        for (const variant of variants) {
          if (searchAbortSignal.aborted) return;

          const variantResults = await this.performApiSearch(variant, settings, searchAbortSignal);

          if (variantResults.length > 0) {
            newResults = variantResults;
            break;
          }
        }
      }

      // Final validation before showing results
      const finalInputValue = this.searchInput.value.trim();
      if (finalInputValue !== requestSearchTerm || searchAbortSignal.aborted) {
        this.plugin.logger.debug(
          `Search results discarded: input changed from "${requestSearchTerm}" to "${finalInputValue}" or search was aborted`
        );
        return;
      }

      this.allResults = newResults;
      this.results = newResults;
      this.hasMoreResults = newResults.length === this.maxResults;

      // Build Fuse index for the results
      if (newResults.length > 0) {
        const foodDocs: FoodDoc[] = newResults.map(unifiedResultToFoodDoc);
        buildFuseIndex(this.currentTab, foodDocs);
      }

      this.loadingIndicator.classList.add('is-hidden');
      this.renderResults(requestSearchTerm);

      // Ensure search input maintains focus after results are rendered
      setTimeout(() => {
        this.searchInput.focus();
      }, 10);
    } catch (error) {
      // Don't show error if search was aborted
      if (searchAbortSignal.aborted) {
        return;
      }

      if (this.plugin && this.plugin.logger) {
        this.plugin.logger.error('Error fetching food data:', error);
      }
      this.loadingIndicator.classList.add('is-hidden');
      new Notice(t('food.search.error.fetchFailed'));
    } finally {
      this.isSearching = false;
      // Clear the abort controller if this search completed normally
      if (
        this.currentSearchAbortController &&
        this.currentSearchAbortController.signal === searchAbortSignal
      ) {
        this.currentSearchAbortController = null;
      }
    }
  }

  /**
   * Perform the actual API search for a given term
   */
  private async performApiSearch(
    searchTerm: string,
    // Fixed: Use proper typing instead of any
    settings: typeof this.plugin.settings,
    searchAbortSignal: AbortSignal
  ): Promise<UnifiedFoodResult[]> {
    let newResults: UnifiedFoodResult[] = [];

    if (this.currentTab === 'openfoodfacts') {
      // Open Food Facts only search
      if (settings.openFoodFactsEnabled !== false) {
        // Check if this is a barcode search first
        const cleanQuery = searchTerm.replace(/\s+/g, '');
        const isBarcodeSearch = /^\d{8,14}$/.test(cleanQuery);

        if (isBarcodeSearch) {
          // Use the barcode search function directly
          const { searchByBarcode } = await import('../../core/barcodeSearch');

          const sources = {
            openFoodFacts: { enabled: true },
            usda: undefined, // Don't search USDA for barcodes when on OFF tab
          };

          const userLocale = this.plugin?.i18nManager?.getCurrentLocale() || 'en';
          newResults = await searchByBarcode(this.app, cleanQuery, sources, userLocale);
        } else {
          // Regular text search
          // Get user's locale for localization
          const userLocale = this.plugin?.i18nManager?.getCurrentLocale() || 'en';
          const offLanguage =
            settings.openFoodFactsLanguage === 'auto' ? userLocale : settings.openFoodFactsLanguage;

          // Import and use Open Food Facts search
          const { searchOpenFoodFacts } = await import('../../core/openFoodFacts');
          const offResults = await searchOpenFoodFacts(
            this.app,
            searchTerm,
            0,
            this.maxResults,
            offLanguage
          );

          // Convert to UnifiedFoodResult format
          newResults = offResults.map((item) => ({
            id: `off_${item.code}`,
            name: item.productName,
            description: item.displayDescription,
            gramsServing: item.gramsServing,
            source: 'openfoodfacts' as const,
            brandName: item.brands,
            nutritionGrade: item.nutritionGrade,
            novaGroup: item.novaGroup,
            dataQuality: item.dataQuality,
            completeness: item.completeness,
            ecoscore: item.ecoscore,
            imageUrl: item.imageUrl,
            categories: item.categories,
            ingredients: item.ingredientsText,
            raw: item,
          }));

          // Apply data quality filter
          if (settings.openFoodFactsDataQualityFilter !== 'all') {
            newResults = newResults.filter((result) => {
              if (settings.openFoodFactsDataQualityFilter === 'high') {
                return result.dataQuality === 'high';
              } else if (settings.openFoodFactsDataQualityFilter === 'medium') {
                return result.dataQuality === 'high' || result.dataQuality === 'medium';
              }
              return true;
            });
          }
        }
      }
    } else if (this.currentTab === 'usda-foundation') {
      // Foundation only search
      if (settings.usdaEnabled && settings.usdaApiKey) {
        newResults = await searchFoundationFoodsOnly(
          this.app,
          searchTerm,
          this.maxResults,
          settings.usdaApiKey
        );
      }
    } else if (this.currentTab === 'usda-branded') {
      // Branded only search
      if (settings.usdaEnabled && settings.usdaApiKey) {
        const usdaResults = await searchFoods(
          this.app,
          searchTerm,
          0,
          this.maxResults,
          settings.usdaApiKey
        );
        newResults = usdaResults
          .filter((item) => item.isBranded)
          .map((item) => ({
            id: `usda_${item.fdcId}`,
            name: item.description,
            description: item.displayDescription,
            gramsServing: item.gramsServing,
            source: 'usda' as const,
            brandName: item.brandName,
            isFoundation: item.isFoundation,
            isBranded: item.isBranded,
            isSrLegacy: item.isSrLegacy,
            dataType: item.dataType,
            raw: item,
          }));
      }
    } else if (this.currentTab === 'usda-legacy') {
      // Legacy only search
      if (settings.usdaEnabled && settings.usdaApiKey) {
        const usdaResults = await searchFoods(
          this.app,
          searchTerm,
          0,
          this.maxResults,
          settings.usdaApiKey
        );
        newResults = usdaResults
          .filter((item) => item.isSrLegacy)
          .map((item) => ({
            id: `usda_${item.fdcId}`,
            name: item.description,
            description: item.displayDescription,
            gramsServing: item.gramsServing,
            source: 'usda' as const,
            brandName: item.brandName,
            isFoundation: item.isFoundation,
            isBranded: item.isBranded,
            isSrLegacy: item.isSrLegacy,
            dataType: item.dataType,
            raw: item,
          }));
      }
    } else if (this.currentTab === 'fatsecret') {
      // Search ONLY FatSecret, completely exclude Open Food Facts and USDA
      if (settings.fatSecretEnabled && settings.fatSecretApiKey && settings.fatSecretApiSecret) {
        // Import FatSecret search function directly
        const { searchFatSecret } = await import('../../core/search');

        newResults = await searchFatSecret(
          this.app,
          searchTerm,
          this.currentPage,
          this.maxResults,
          settings.fatSecretApiKey,
          settings.fatSecretApiSecret
        );
      }
    } else {
      // Determine which sources to search based on current tab
      const sources: {
        fatSecret?: { enabled: boolean; apiKey: string; apiSecret: string };
        usda?: { enabled: boolean; apiKey: string };
        openFoodFacts?: { enabled: boolean };
      } = {};

      if (this.currentTab === 'all') {
        // Search all available sources
        if (settings.fatSecretEnabled && settings.fatSecretApiKey && settings.fatSecretApiSecret) {
          sources.fatSecret = {
            enabled: true,
            apiKey: settings.fatSecretApiKey,
            apiSecret: settings.fatSecretApiSecret,
          };
        }
        if (settings.usdaEnabled && settings.usdaApiKey) {
          sources.usda = {
            enabled: true,
            apiKey: settings.usdaApiKey,
          };
        }
        if (settings.openFoodFactsEnabled !== false) {
          sources.openFoodFacts = {
            enabled: true,
          };
        }
      }

      // Get user's locale for Open Food Facts
      const userLocale = this.plugin?.i18nManager?.getCurrentLocale() || 'en';
      const offLanguage =
        settings.openFoodFactsLanguage === 'auto' ? userLocale : settings.openFoodFactsLanguage;

      newResults = await searchAllSources(
        this.app,
        searchTerm,
        this.currentPage,
        this.maxResults,
        sources,
        offLanguage
      );

      // Apply Open Food Facts data quality filter if applicable
      if (settings.openFoodFactsDataQualityFilter !== 'all') {
        newResults = newResults
          .map((result) => {
            if (result.source === 'openfoodfacts') {
              if (
                settings.openFoodFactsDataQualityFilter === 'high' &&
                result.dataQuality !== 'high'
              ) {
                return null;
              } else if (
                settings.openFoodFactsDataQualityFilter === 'medium' &&
                result.dataQuality === 'low'
              ) {
                return null;
              }
            }
            return result;
          })
          .filter(Boolean) as typeof newResults;
      }
    }

    return newResults;
  }

  escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\');
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

    // For barcode searches, show all results regardless of name matching
    const resultsToShow = this.isBarcodeSearch
      ? this.results
      : this.results.filter((food) => food.name.toLowerCase().includes(normalizedQuery));

    resultsToShow.forEach((food, index) => {
      const foodDiv = this.resultsContainer.createDiv({
        cls: `food-result-item ${this.isBarcodeSearch ? 'barcode-result' : ''}`,
      });

      // Create main content container
      const contentDiv = foodDiv.createDiv({ cls: 'food-result-content' });

      // Food name with highlighting and brand info
      const nameDiv = contentDiv.createDiv({ cls: 'food-result-name' });
      const nameContentDiv = nameDiv.createDiv({ cls: 'food-name-content' });

      // Only highlight text matches for non-barcode searches
      if (this.isBarcodeSearch) {
        // For barcode searches, just show the name without highlighting
        nameContentDiv.createSpan({ text: food.name });
      } else {
        // For text searches, highlight matching text
        const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
        const parts = food.name.split(regex);

        parts.forEach((part) => {
          if (part.toLowerCase() === searchTerm.toLowerCase()) {
            nameContentDiv.createEl('strong', { text: part });
          } else if (part) {
            nameContentDiv.createSpan({ text: part });
          }
        });
      }

      // Add brand name if available
      if (food.brandName) {
        nameContentDiv.createSpan({
          cls: 'food-brand-name',
          text: ` (${food.brandName})`,
        });
      }

      // Create enhanced chips container
      const chipsDiv = nameDiv.createDiv({ cls: 'food-result-chips' });

      // Add enhanced source chip with more specific labeling
      let sourceLabel = '';
      let chipClass = `macros-source-chip macros-source-${food.source}`;

      if (food.source === 'usda') {
        if (food.isFoundation) {
          sourceLabel = 'USDA Foundation';
          chipClass += ' macros-source-foundation';
        } else if (food.isSrLegacy) {
          sourceLabel = 'USDA SR Legacy';
          chipClass += ' macros-source-sr-legacy';
        } else if (food.isBranded) {
          sourceLabel = 'USDA Branded';
          chipClass += ' macros-source-branded';
        } else {
          sourceLabel = 'USDA';
        }
      } else if (food.source === 'openfoodfacts') {
        sourceLabel = 'Open Food Facts';
        chipClass += ' macros-source-openfoodfacts';
      } else {
        sourceLabel = t(`food.search.source.${food.source}`);
      }

      chipsDiv.createSpan({
        cls: chipClass,
        text: sourceLabel,
      });

      // Add quality indicators for different sources
      if (food.isFoundation) {
        chipsDiv.createSpan({
          cls: 'macros-quality-chip macros-foundation-indicator',
          text: 'High Quality',
          attr: { title: 'Foundation data is the most reliable and comprehensive USDA data' },
        });
      } else if (food.source === 'openfoodfacts') {
        // Add data quality indicator for Open Food Facts
        if (food.dataQuality === 'high') {
          chipsDiv.createSpan({
            cls: 'macros-quality-chip macros-off-high-quality',
            text: 'High Quality',
            attr: { title: 'High quality Open Food Facts data' },
          });
        } else if (food.dataQuality === 'medium') {
          chipsDiv.createSpan({
            cls: 'macros-quality-chip macros-off-medium-quality',
            text: 'Medium Quality',
            attr: { title: 'Medium quality Open Food Facts data' },
          });
        }

        // Add nutrition grade if available
        if (
          food.nutritionGrade &&
          ['A', 'B', 'C', 'D', 'E'].includes(food.nutritionGrade.toUpperCase())
        ) {
          chipsDiv.createSpan({
            cls: `macros-nutrition-grade macros-nutrition-grade-${food.nutritionGrade.toLowerCase()}`,
            text: `Grade ${food.nutritionGrade.toUpperCase()}`,
            attr: { title: 'Nutri-Score nutrition grade' },
          });
        }

        // Add NOVA group indicator if available
        if (food.novaGroup && food.novaGroup >= 1 && food.novaGroup <= 4) {
          // Fixed: Removed unused variable assignment
          chipsDiv.createSpan({
            cls: `macros-nova-chip macros-nova-${food.novaGroup}`,
            text: `NOVA ${food.novaGroup}`,
            attr: { title: 'NOVA food processing classification' },
          });
        }
      }

      // Food description
      // Fixed: Prefix unused variable with underscore
      const _descDiv = contentDiv.createDiv({
        cls: 'food-result-description',
        text: food.description,
      });

      // Add product image for Open Food Facts if available
      if (food.source === 'openfoodfacts' && food.imageUrl) {
        const imageDiv = contentDiv.createDiv({ cls: 'food-result-image' });
        const img = imageDiv.createEl('img', {
          attr: {
            src: food.imageUrl,
            alt: food.name,
            loading: 'lazy',
          },
          cls: 'food-product-image',
        });

        // Handle image load errors gracefully
        img.addEventListener('error', () => {
          imageDiv.style.display = 'none';
        });
      }

      if (index === this.selectedIndex) {
        foodDiv.addClass('highlighted-result');
      }

      this.component.registerDomEvent(foodDiv, 'click', () => {
        this.handleFoodSelection(food);
      });

      this.component.registerDomEvent(foodDiv, 'mouseenter', () => {
        this.selectedIndex = index;
        this.highlightSelectedResult();
      });
    });

    // Add infinite scroll functionality
    this.setupInfiniteScroll(searchTerm);
  }

  private async handleFoodSelection(food: UnifiedFoodResult): Promise<void> {
    // Check if this is from API search (not already saved food)
    if (food.source === 'usda' || food.source === 'fatsecret' || food.source === 'openfoodfacts') {
      await this.promptForFileName(food);
    } else {
      // Directly call onSelect for already saved foods
      this.onSelect(food);
      this.close();
    }
  }

  private async promptForFileName(food: UnifiedFoodResult): Promise<void> {
    // Create a simple modal for file name input
    const modal = new FileNameModal(
      this.app,
      food.name,
      food.gramsServing || 100, // Pass the original serving size
      async (fileName: string, defaultServing?: number) => {
        // Use the SAME sanitization logic as DataManager
        const safeFileName = this.sanitizeFileName(fileName);

        // Check if sanitization changed the filename significantly
        if (safeFileName !== fileName.trim()) {
          this.plugin?.logger.debug(`Filename sanitized: "${fileName}" -> "${safeFileName}"`);
        }

        // Check existence using the sanitized filename
        const existsResult = await this.checkFileExists(safeFileName);
        if (existsResult.exists) {
          new Notice(
            `A food item with the name "${safeFileName}" already exists in your Nutrition folder. Please choose a different name to avoid conflicts.`
          );
          return false; // Keep modal open
        }

        // File name is unique, proceed with saving
        try {
          // Pass the ORIGINAL filename and default serving to saveFoodFile
          await this.saveFoodFile(food, fileName, defaultServing);
          // Don't call this.onSelect(food) here - saveFoodFile already shows success notice
          this.close();
          return true; // Close modal
        } catch (error) {
          this.plugin?.logger.error('Error saving food file:', error);
          new Notice(`Error saving food item: ${(error as Error).message}`);
          return false; // Keep modal open
        }
      },
      this.plugin
    );

    modal.open();
  }

  // Proper file existence check with normalization
  private async checkFileExists(fileName: string): Promise<{ exists: boolean; path?: string }> {
    if (!this.plugin) return { exists: false };

    try {
      // Use the SAME sanitization logic as DataManager
      const safeFileName = this.sanitizeFileName(fileName);

      const folder = normalizePath(this.plugin.settings.storageFolder);
      const filePath = normalizePath(`${folder}/${safeFileName}.md`);

      // Use proper Obsidian API to check file existence
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      // Ensure it's actually a file, not a folder
      const exists = existingFile instanceof TFile;

      this.plugin.logger.debug(`File existence check: ${safeFileName}.md -> ${exists}`);

      return { exists, path: filePath };
    } catch (error) {
      this.plugin.logger.error('Error checking file existence:', error);
      return { exists: false };
    }
  }

  // Helper to sanitize filename - MUST match DataManager.createSafeFileName()
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .substring(0, 100) // Limit length
      .replace(/\.$/, ''); // Remove trailing period if present
  }

  private async saveFoodFile(
    food: UnifiedFoodResult,
    fileName: string,
    defaultServing?: number
  ): Promise<void> {
    if (!this.plugin) return;

    // Extract nutrition data from the food result
    let calories = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;
    let fiber = 0;
    let sugars = 0;
    let salt = 0;

    // For Open Food Facts, we have direct access to nutrition data
    // Fixed: Use proper typing instead of any
    if (food.source === 'openfoodfacts' && food.raw && typeof food.raw === 'object') {
      const offData = food.raw as Record<string, unknown>;
      calories = (offData.calories as number) || 0;
      protein = (offData.protein as number) || 0;
      fat = (offData.fat as number) || 0;
      carbs = (offData.carbs as number) || 0;
      fiber = (offData.fiber as number) || 0;
      sugars = (offData.sugars as number) || 0;
      salt = (offData.salt as number) || 0;
    } else {
      // Parse nutrition data from description for other sources
      if (food.description) {
        const caloriesMatch = food.description.match(/Calories:\s*(\d+(?:\.\d+)?)/i);
        const proteinMatch = food.description.match(/Protein:\s*(\d+(?:\.\d+)?)g/i);
        const fatMatch = food.description.match(/Fat:\s*(\d+(?:\.\d+)?)g/i);
        const carbsMatch = food.description.match(/Carbs:\s*(\d+(?:\.\d+)?)g/i);

        calories = caloriesMatch ? parseFloat(caloriesMatch[1]) : 0;
        protein = proteinMatch ? parseFloat(proteinMatch[1]) : 0;
        fat = fatMatch ? parseFloat(fatMatch[1]) : 0;
        carbs = carbsMatch ? parseFloat(carbsMatch[1]) : 0;
      }
    }

    const servingSize = food.gramsServing || 100;

    // Create the markdown content
    const fdcId =
      food.source === 'usda' && food.raw && typeof food.raw === 'object' && 'fdcId' in food.raw
        ? (food.raw as Record<string, unknown>).fdcId
        : '';

    // Sanitize filename for actual file creation
    const safeFileName = this.sanitizeFileName(fileName);

    let frontmatter = `---
calories: ${calories}
protein: ${protein}
fat: ${fat}
carbs: ${carbs}
serving_size: ${servingSize}g${defaultServing ? `\ndefault_serving_size: ${defaultServing}g` : ''}
source: ${food.source}`;

    // Add source-specific metadata
    if (food.source === 'usda') {
      frontmatter += `\nfdc_id: ${fdcId}\ndata_type: ${food.dataType || ''}`;
    } else if (food.source === 'openfoodfacts') {
      const offCode =
        food.raw && typeof food.raw === 'object' && 'code' in food.raw
          ? (food.raw as Record<string, unknown>).code
          : '';
      frontmatter += `\noff_code: ${offCode}`;

      if (fiber) frontmatter += `\nfiber: ${fiber}`;
      if (sugars) frontmatter += `\nsugars: ${sugars}`;
      if (salt) frontmatter += `\nsalt: ${salt}`;
    }

    if (food.brandName) frontmatter += `\nbrand: ${food.brandName}`;
    if (food.nutritionGrade) frontmatter += `\nnutrition_grade: ${food.nutritionGrade}`;
    if (food.novaGroup) frontmatter += `\nnova_group: ${food.novaGroup}`;
    if (food.dataQuality) frontmatter += `\ndata_quality: ${food.dataQuality}`;

    frontmatter += `\ncreated: ${new Date().toISOString()}
---

# ${fileName}

${food.description}

## Nutritional Information (per ${servingSize}g)
- **Calories:** ${calories} kcal
- **Protein:** ${protein}g
- **Fat:** ${fat}g
- **Carbohydrates:** ${carbs}g`;

    if (fiber) frontmatter += `\n- **Fiber:** ${fiber}g`;
    if (sugars) frontmatter += `\n- **Sugars:** ${sugars}g`;
    if (salt) frontmatter += `\n- **Salt:** ${salt}g`;

    let sourceText = '';
    if (food.source === 'usda') {
      sourceText = 'USDA FoodData Central';
    } else if (food.source === 'openfoodfacts') {
      sourceText = 'Open Food Facts (Community Database)';
    } else {
      sourceText = 'FatSecret';
    }

    frontmatter += `\n\n**Source:** ${sourceText}`;
    if (food.brandName) frontmatter += `\n**Brand:** ${food.brandName}`;
    if (food.nutritionGrade)
      frontmatter += `\n**Nutrition Grade:** ${food.nutritionGrade.toUpperCase()} (Nutri-Score)`;
    if (food.novaGroup) {
      const novaLabels = [
        '',
        'Unprocessed or minimally processed',
        'Processed culinary ingredients',
        'Processed foods',
        'Ultra-processed foods',
      ];
      frontmatter += `\n**Processing Level:** NOVA ${food.novaGroup} (${novaLabels[food.novaGroup]})`;
    }
    if (defaultServing && defaultServing !== servingSize) {
      frontmatter += `\n**Default Serving Size:** ${defaultServing}g`;
    }
    if (food.categories) frontmatter += `\n**Categories:** ${food.categories}`;
    if (food.ingredients) frontmatter += `\n\n**Ingredients:** ${food.ingredients}`;

    // Add data quality notice for Open Food Facts
    if (food.source === 'openfoodfacts' && food.dataQuality !== 'high') {
      frontmatter += `\n\n> **Note:** This data comes from the Open Food Facts community database. Please verify nutrition information if accuracy is critical for your needs.`;
    }

    const folderPath = normalizePath(this.plugin.settings.storageFolder);

    // Ensure folder exists
    const folder = this.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    const filePath = normalizePath(`${folderPath}/${safeFileName}.md`);

    try {
      // Use proper Obsidian API for file creation
      await this.app.vault.create(filePath, frontmatter);

      let successMessage = `Food item "${fileName}" saved successfully!`;
      if (defaultServing && defaultServing !== servingSize) {
        successMessage += ` Default serving: ${defaultServing}g`;
      }
      new Notice(successMessage);

      // Update the food object with the saved file name
      food.name = fileName;

      // Invalidate cache to make new file immediately available
      this.plugin.dataManager.invalidateFileCache();
    } catch (error) {
      if ((error as Error).message?.includes('already exists')) {
        throw new Error('File already exists. Please choose a different name.');
      }
      throw error;
    }
  }

  private setupInfiniteScroll(searchTerm: string): void {
    // Store current search term
    this.currentSearchTerm = searchTerm;

    // Remove existing scroll listener if it exists
    if (this.scrollHandler) {
      this.resultsContainer.removeEventListener('scroll', this.scrollHandler);
    }

    // Create new scroll handler
    // Fixed: Prefix unused parameter with underscore
    this.scrollHandler = (_event: Event) => {
      this.handleScroll();
    };

    // Add new scroll listener
    this.component.registerDomEvent(this.resultsContainer, 'scroll', this.scrollHandler);
  }

  private handleScroll = async () => {
    if (this.isLoadingMore || !this.hasMoreResults || this.isBarcodeSearch) return;

    const container = this.resultsContainer;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Load more when user scrolls to within 100px of bottom
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      await this.loadMoreResults(this.currentSearchTerm);
    }
  };

  private async loadMoreResults(searchTerm: string): Promise<void> {
    if (this.isLoadingMore || !this.hasMoreResults || !this.plugin || this.isBarcodeSearch) return;

    this.isLoadingMore = true;
    this.currentPage++;

    try {
      const settings = this.plugin.settings;
      let newResults: UnifiedFoodResult[] = [];

      if (this.currentTab === 'openfoodfacts') {
        // Load more Open Food Facts results
        if (settings.openFoodFactsEnabled !== false) {
          const userLocale = this.plugin.i18nManager?.getCurrentLocale() || 'en';
          const offLanguage =
            settings.openFoodFactsLanguage === 'auto' ? userLocale : settings.openFoodFactsLanguage;

          const { searchOpenFoodFacts } = await import('../../core/openFoodFacts');
          const offResults = await searchOpenFoodFacts(
            this.app,
            searchTerm,
            this.currentPage,
            this.maxResults,
            offLanguage
          );

          newResults = offResults.map((item) => ({
            id: `off_${item.code}`,
            name: item.productName,
            description: item.displayDescription,
            gramsServing: item.gramsServing,
            source: 'openfoodfacts' as const,
            brandName: item.brands,
            nutritionGrade: item.nutritionGrade,
            novaGroup: item.novaGroup,
            dataQuality: item.dataQuality,
            completeness: item.completeness,
            ecoscore: item.ecoscore,
            imageUrl: item.imageUrl,
            categories: item.categories,
            ingredients: item.ingredientsText,
            raw: item,
          }));
        }
      } else if (this.currentTab === 'usda-foundation') {
        // Foundation foods don't typically support pagination well, disable
        this.hasMoreResults = false;
        return;
      } else if (this.currentTab === 'usda-branded') {
        // Load more branded results
        if (settings.usdaEnabled && settings.usdaApiKey) {
          const usdaResults = await searchFoods(
            this.app,
            searchTerm,
            this.currentPage,
            this.maxResults,
            settings.usdaApiKey
          );
          newResults = usdaResults
            .filter((item) => item.isBranded)
            .map((item) => ({
              id: `usda_${item.fdcId}`,
              name: item.description,
              description: item.displayDescription,
              gramsServing: item.gramsServing,
              source: 'usda' as const,
              brandName: item.brandName,
              isFoundation: item.isFoundation,
              isBranded: item.isBranded,
              isSrLegacy: item.isSrLegacy,
              dataType: item.dataType,
              raw: item,
            }));
        }
      } else if (this.currentTab === 'usda-legacy') {
        // Load more legacy results
        if (settings.usdaEnabled && settings.usdaApiKey) {
          const usdaResults = await searchFoods(
            this.app,
            searchTerm,
            this.currentPage,
            this.maxResults,
            settings.usdaApiKey
          );
          newResults = usdaResults
            .filter((item) => item.isSrLegacy)
            .map((item) => ({
              id: `usda_${item.fdcId}`,
              name: item.description,
              description: item.displayDescription,
              gramsServing: item.gramsServing,
              source: 'usda' as const,
              brandName: item.brandName,
              isFoundation: item.isFoundation,
              isBranded: item.isBranded,
              isSrLegacy: item.isSrLegacy,
              dataType: item.dataType,
              raw: item,
            }));
        }
      } else if (this.currentTab === 'fatsecret') {
        // Load more FatSecret results ONLY
        if (settings.fatSecretEnabled && settings.fatSecretApiKey && settings.fatSecretApiSecret) {
          // Import FatSecret search function directly
          const { searchFatSecret } = await import('../../core/search');

          newResults = await searchFatSecret(
            this.app,
            searchTerm,
            this.currentPage,
            this.maxResults,
            settings.fatSecretApiKey,
            settings.fatSecretApiSecret
          );
        }
      } else if (this.currentTab === 'all') {
        // Load more from all sources
        const sources: {
          fatSecret?: { enabled: boolean; apiKey: string; apiSecret: string };
          usda?: { enabled: boolean; apiKey: string };
          openFoodFacts?: { enabled: boolean };
        } = {};

        if (settings.fatSecretEnabled && settings.fatSecretApiKey && settings.fatSecretApiSecret) {
          sources.fatSecret = {
            enabled: true,
            apiKey: settings.fatSecretApiKey,
            apiSecret: settings.fatSecretApiSecret,
          };
        }
        if (settings.usdaEnabled && settings.usdaApiKey) {
          sources.usda = {
            enabled: true,
            apiKey: settings.usdaApiKey,
          };
        }
        if (settings.openFoodFactsEnabled !== false) {
          sources.openFoodFacts = {
            enabled: true,
          };
        }

        const userLocale = this.plugin.i18nManager?.getCurrentLocale() || 'en';
        const offLanguage =
          settings.openFoodFactsLanguage === 'auto' ? userLocale : settings.openFoodFactsLanguage;

        newResults = await searchAllSources(
          this.app,
          searchTerm,
          this.currentPage,
          this.maxResults,
          sources,
          offLanguage
        );
      }

      if (newResults.length > 0) {
        // Filter out duplicates based on ID
        const existingIds = new Set(this.allResults.map((r) => r.id));
        const uniqueNewResults = newResults.filter((r) => !existingIds.has(r.id));

        if (uniqueNewResults.length > 0) {
          this.allResults.push(...uniqueNewResults);
          this.results = this.allResults;
          this.hasMoreResults = newResults.length === this.maxResults;

          // Update Fuse index with new results
          const allFoodDocs: FoodDoc[] = this.allResults.map(unifiedResultToFoodDoc);
          buildFuseIndex(this.currentTab, allFoodDocs);

          // Re-render with new results
          this.renderResults(searchTerm);
        } else {
          // No new unique results, stop pagination
          this.hasMoreResults = false;
        }
      } else {
        this.hasMoreResults = false;
      }
    } catch (error) {
      this.hasMoreResults = false;
    } finally {
      this.isLoadingMore = false;
    }
  }
}

// Enhanced FileNameModal with default serving size option
class FileNameModal extends Modal {
  private fileNameInput: HTMLInputElement;
  private defaultServingInput: HTMLInputElement;
  private submitButton: HTMLElement;
  private component: Component;
  private isSubmitting = false;

  constructor(
    app: App,
    private defaultName: string,
    private originalServingSize: number, // The serving size from the API result
    private onSubmit: (fileName: string, defaultServing?: number) => Promise<boolean>, // Updated signature
    private plugin?: MacrosPlugin
  ) {
    super(app);
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('file-name-modal');

    // Fixed: Prefix unused variables with underscore
    const _header = contentEl.createEl('h2', {
      text: 'Save Food Item',
      cls: 'modal-title',
    });

    const _description = contentEl.createEl('p', {
      text: 'Please enter a name and default serving size for this food item:',
      cls: 'modal-description',
    });

    // Input container
    const inputContainer = contentEl.createDiv({ cls: 'modal-content' });

    // File name input section
    const nameSection = inputContainer.createDiv({ cls: 'setting-item' });
    const nameInfo = nameSection.createDiv({ cls: 'setting-item-info' });
    nameInfo.createDiv({
      text: 'File Name:',
      cls: 'setting-item-name',
    });

    const nameControl = nameSection.createDiv({ cls: 'setting-item-control' });
    this.fileNameInput = nameControl.createEl('input', {
      type: 'text',
      cls: 'mod-text',
      value: this.defaultName,
    });

    // Default serving size input section
    const servingSection = inputContainer.createDiv({ cls: 'setting-item' });
    const servingInfo = servingSection.createDiv({ cls: 'setting-item-info' });
    servingInfo.createDiv({
      text: 'Default Serving Size (grams):',
      cls: 'setting-item-name',
    });
    servingInfo.createDiv({
      text: `Optional: Set a custom default serving size for when you add this food to your macros. If not set, it will use ${this.originalServingSize}g from the API.`,
      cls: 'setting-item-description',
    });

    const servingControl = servingSection.createDiv({ cls: 'setting-item-control' });
    this.defaultServingInput = servingControl.createEl('input', {
      type: 'number',
      cls: 'mod-text',
      value: this.originalServingSize.toString(),
      attr: {
        min: '1',
        step: '0.1',
        placeholder: this.originalServingSize.toString(),
      },
    });

    // Button container
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'mod-button',
    });

    this.submitButton = buttonContainer.createEl('button', {
      text: 'Save',
      cls: 'mod-button mod-cta',
    });

    // Event handlers
    this.component.registerDomEvent(cancelButton, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(this.submitButton, 'click', async () => {
      await this.handleSubmit();
    });

    this.component.registerDomEvent(this.fileNameInput, 'keydown', async (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        // Move to serving size input
        this.defaultServingInput.focus();
      } else if (event.key === 'Escape') {
        this.close();
      }
    });

    this.component.registerDomEvent(
      this.defaultServingInput,
      'keydown',
      async (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          await this.handleSubmit();
        } else if (event.key === 'Escape') {
          this.close();
        }
      }
    );

    // Auto-focus and select text
    setTimeout(() => {
      this.fileNameInput.focus();
      this.fileNameInput.select();
    }, 50);
  }

  private async handleSubmit(): Promise<void> {
    // Prevent double submission
    if (this.isSubmitting) return;

    const fileName = this.fileNameInput.value.trim();
    const defaultServingStr = this.defaultServingInput.value.trim();

    if (!fileName) {
      new Notice('Please enter a file name.');
      this.fileNameInput.focus();
      return;
    }

    // Validate serving size
    const defaultServing = parseFloat(defaultServingStr);
    if (isNaN(defaultServing) || defaultServing <= 0) {
      new Notice('Please enter a valid serving size greater than 0.');
      this.defaultServingInput.focus();
      return;
    }

    // Disable button during submission
    this.isSubmitting = true;
    (this.submitButton as HTMLButtonElement).disabled = true;
    this.submitButton.textContent = 'Saving...';

    try {
      // Pass both filename and default serving size
      const shouldClose = await this.onSubmit(fileName, defaultServing);
      if (shouldClose) {
        this.close();
      }
    } catch (error) {
      new Notice(`Error: ${(error as Error).message}`);
    } finally {
      // Re-enable button
      this.isSubmitting = false;
      (this.submitButton as HTMLButtonElement).disabled = false;
      this.submitButton.textContent = 'Save';
    }
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

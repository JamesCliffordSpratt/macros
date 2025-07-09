import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export function registerMacrosPCProcessor(plugin: MacrosPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor('macrospc', async (source: string, el: HTMLElement) => {
    const lines = source
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');

    let ids: string[] = [];
    let width = 300;
    let height = 300;

    lines.forEach((line) => {
      // Fix the ID parsing to handle comma-separated values
      const idMatch = line.match(/^id[s]?:\s*(.+)$/i);
      if (idMatch) {
        // Split by comma and properly trim each ID
        ids = idMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        plugin.logger.debug(`Parsed IDs: ${ids.join(', ')}`);
      }

      // Handle width and height
      const widthMatch = line.match(/^width:\s*(\d+)/i);
      if (widthMatch) {
        const parsed = parseInt(widthMatch[1]);
        if (!isNaN(parsed)) width = parsed;
      }

      const heightMatch = line.match(/^height:\s*(\d+)/i);
      if (heightMatch) {
        const parsed = parseInt(heightMatch[1]);
        if (!isNaN(parsed)) height = parsed;
      }
    });

    el.empty();

    if (ids.length === 0) {
      el.createEl('div', { text: t('charts.errors.noIdsProvided') });
      return;
    }

    // Store the IDs and dimensions as data attributes for later reference
    el.setAttribute('data-ids', ids.join(','));
    el.setAttribute('data-width', width.toString());
    el.setAttribute('data-height', height.toString());

    // Create a loading indicator while we verify data
    const loadingEl = el.createDiv({
      cls: 'macrospc-loading',
      text: t('charts.loading'),
    });

    try {
      // CRITICAL FIX: Force reload of all IDs from vault with FULL data including bullet points
      const loadPromises = ids.map(async (id) => {
        plugin.logger.debug(`Loading ID: ${id} for macrospc block`);
        try {
          // Get complete data including bullet points using DataManager
          const fullData = await plugin.dataManager.getFullMacrosData(id);

          if (fullData && fullData.length > 0) {
            // Store in the macroTables cache with FULL data
            plugin.dataManager.macroTables.set(id, fullData);
            plugin.logger.debug(
              `Successfully loaded ${fullData.length} lines for ID: ${id} (including bullet points)`
            );
            return true;
          } else {
            plugin.logger.warn(`Could not load data for ID: ${id}`);
            return false;
          }
        } catch (err) {
          plugin.logger.error(`Error loading data for ID: ${id}:`, err);
          return false;
        }
      });

      // Wait for all IDs to load before continuing
      const loadResults = await Promise.all(loadPromises);

      // Check if we have any successful loads
      if (!loadResults.some((result) => result)) {
        el.empty(); // Remove loading indicator
        el.createEl('div', { text: t('charts.noData', { ids: ids.join(', ') }) });
        return;
      }

      // Clear the loading indicator
      loadingEl.remove();

      // Get combined ID for state management
      const combinedId = ids.join(',');

      // Store in multiple formats for better refresh handling
      // 1. Store with each individual ID
      for (const id of ids) {
        if (!plugin.dataManager.macrospcContainers.has(id)) {
          plugin.dataManager.macrospcContainers.set(id, new Set());
        }
        const containerSet = plugin.dataManager.macrospcContainers.get(id);
        if (containerSet) {
          containerSet.add(el);
          plugin.logger.debug(`Registered container with ID: ${id}`);
        }
      }

      // 2. Store with combined ID string (comma-separated)
      if (!plugin.dataManager.macrospcContainers.has(combinedId)) {
        plugin.dataManager.macrospcContainers.set(combinedId, new Set());
      }
      const containerSet = plugin.dataManager.macrospcContainers.get(combinedId);
      if (containerSet) {
        containerSet.add(el);
        plugin.logger.debug(`Registered container with combined ID: ${combinedId}`);
      }

      // Draw with the actual array of IDs - this will create the chart
      await plugin.drawMacrospc(ids, el, width, height);
      plugin.logger.debug(`Drew chart for IDs: ${ids.join(', ')}`);
    } catch (error) {
      // Clear loading and show error
      el.empty();
      console.error(`Error rendering chart:`, error);
      el.createEl('div', {
        text: t('charts.errors.renderError', { error: (error as Error).message }),
        cls: 'macrospc-error',
      });
    }
  });
}

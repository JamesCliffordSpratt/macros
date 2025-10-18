import MacrosPlugin from '../../main';
import { processNutritionalDataFromLines } from './calculator';
import { MacrosCalcRenderer } from './MacrosCalcRenderer';
import { MetricsRegistry, registerBuiltinMetrics } from './metrics';
import { t } from '../../lang/I18nManager';

interface MacrosCalcRenderer_Interface {
  el: HTMLElement;
  getIds: () => string[];
  render: (
    aggregate: { calories: number; protein: number; fat: number; carbs: number },
    breakdown: Array<{
      id: string;
      totals: { calories: number; protein: number; fat: number; carbs: number };
    }>
  ) => Promise<void>;
  setNeedsRefresh?: () => void;
}

export function registerMacrosCalcProcessor(plugin: MacrosPlugin): void {
  // Initialize metrics system
  const registry = MetricsRegistry.getInstance();
  registerBuiltinMetrics(registry);

  // Initialize the registry if needed
  if (!plugin.macroService._activeMacrosCalcRenderers) {
    plugin.macroService._activeMacrosCalcRenderers = new Set();
  }

  // Add a global event listener for refresh events
  plugin.registerEvent(
    plugin.app.workspace.on('layout-change', () => {
      forceRefreshAllRenderers(plugin);
    })
  );

  // Also listen for file modifications
  plugin.registerEvent(
    plugin.app.vault.on('modify', () => {
      setTimeout(() => forceRefreshAllRenderers(plugin), 300);
    })
  );

  plugin.registerMarkdownCodeBlockProcessor(
    'macroscalc',
    async (source: string, el: HTMLElement) => {
      const lines = source
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');

      if (lines.length === 0) {
        el.createEl('div', { text: t('calculator.errors.noContent') });
        return;
      }

      // Search for id: or ids: - support both formats
      let idsLine = lines.find(
        (line) => line.toLowerCase().startsWith('id:') || line.toLowerCase().startsWith('ids:')
      );

      if (!idsLine) {
        el.createEl('div', { text: t('calculator.errors.noIds') });
        return;
      }

      // Extract IDs from the line, accounting for both formats
      const prefix = idsLine.toLowerCase().startsWith('id:') ? 'id:' : 'ids:';
      idsLine = idsLine.substring(prefix.length).trim();

      const ids = idsLine
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (ids.length === 0) {
        el.createEl('div', { text: t('calculator.errors.noTableIds') });
        return;
      }

      // Force full reload of data for each ID, including bullet points
      for (const id of ids) {
        const linesWithBullets = await plugin.dataManager.getFullMacrosData(id);

        if (linesWithBullets.length > 0) {
          plugin.logger.debug(`Loaded ${linesWithBullets.length} lines for ${id} with bullets`);
          plugin.macroService.macroTables.set(id, linesWithBullets);
          plugin.logger.debug(`Stored raw data for ${id} with ${linesWithBullets.length} lines`);
        } else {
          plugin.logger.warn(`Could not load data for ID: ${id}`);
        }
      }

      // Use the calculator's processNutritionalDataFromLines
      plugin.logger.debug('Using calculator.ts processNutritionalDataFromLines for macroscalc');
      const { aggregate, breakdown } = await processNutritionalDataFromLines(plugin, ids);

      // Use the enhanced renderer with metrics support
      const renderer = new MacrosCalcRenderer(plugin, el, ids);

      // Add a data attribute so we can find this element later
      el.setAttribute('data-macroscalc-ids', ids.join(','));

      // Register this renderer
      plugin.macroService._activeMacrosCalcRenderers.add(renderer);

      // Setup cleanup
      plugin.registerEvent(
        plugin.app.workspace.on('layout-change', () => {
          if (!el.isConnected || !document.contains(el)) {
            plugin.macroService._activeMacrosCalcRenderers.delete(renderer);
          }
        })
      );

      await renderer.render(aggregate, breakdown);
    }
  );

  // Replace the redrawAllMacrocalc method with a more forceful version
  plugin.redrawAllMacrocalc = async function () {
    await forceRefreshAllRenderers(this);
  };
}

/**
 * Force refresh all renderers with the latest data
 */
async function forceRefreshAllRenderers(plugin: MacrosPlugin): Promise<void> {
  try {
    plugin.logger.debug(`Force refreshing all macroscalc renderers`);

    // First, find all macroscalc elements in the DOM
    const macroscalcElements = document.querySelectorAll('[data-macroscalc-ids]');

    if (macroscalcElements.length > 0) {
      plugin.logger.debug(`Found ${macroscalcElements.length} macroscalc elements to refresh`);

      // Process each element
      for (const el of Array.from(macroscalcElements)) {
        try {
          // Get the IDs this element is using
          const idsAttr = el.getAttribute('data-macroscalc-ids');
          if (!idsAttr) continue;

          const ids = idsAttr.split(',').map((id) => id.trim());
          plugin.logger.debug(`Refreshing element with IDs: ${ids.join(',')}`);

          // Force reload of all data for each ID with FULL data including bullet points
          for (const id of ids) {
            try {
              // Get fresh data for this ID directly from the vault WITH bullet points
              const allLines = await plugin.dataManager.getFullMacrosData(id);

              if (allLines.length > 0) {
                // Update the cache with FULL data
                plugin.macroService.macroTables.set(id, allLines);
                plugin.logger.debug(`Refreshed data for ID ${id} with ${allLines.length} lines`);
              } else {
                plugin.logger.warn(`Could not find data for ID ${id}`);
              }
            } catch (error) {
              plugin.logger.error(`Error refreshing data for ID ${id}:`, error);
            }
          }

          // Use the calculator's function (which now uses pre-processed data correctly)
          plugin.logger.debug('Using calculator.ts processNutritionalDataFromLines for refresh');
          const { aggregate, breakdown } = await processNutritionalDataFromLines(plugin, ids);

          // Clear the element and create a new renderer
          (el as HTMLElement).empty();
          const renderer = new MacrosCalcRenderer(plugin, el as HTMLElement, ids);

          // Render with fresh data
          await renderer.render(aggregate, breakdown);
          plugin.logger.debug(`Re-rendered macroscalc for IDs: ${ids.join(',')}`);

          // Register the new renderer
          plugin.macroService._activeMacrosCalcRenderers.add(renderer);
        } catch (error) {
          plugin.logger.error(`Error refreshing macroscalc element:`, error);
        }
      }
    } else {
      plugin.logger.debug(`No macroscalc elements found in DOM to refresh`);
    }

    // Also clean up the renderer registry
    if (plugin.macroService._activeMacrosCalcRenderers) {
      // Create a new set with only valid renderers
      const validRenderers = new Set<MacrosCalcRenderer_Interface>();

      for (const renderer of plugin.macroService._activeMacrosCalcRenderers) {
        // Check if the renderer's element is still in the DOM
        if (renderer.el && renderer.el.isConnected && document.contains(renderer.el)) {
          validRenderers.add(renderer);
        }
      }

      // Replace the old set with the cleaned one
      plugin.macroService._activeMacrosCalcRenderers = validRenderers;
      plugin.logger.debug(
        `Cleaned renderer registry, now tracking ${validRenderers.size} renderers`
      );
    }
  } catch (error) {
    plugin.logger.error(`Error in forceRefreshAllRenderers:`, error);
  }
}

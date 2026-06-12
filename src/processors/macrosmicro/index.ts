import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';
import {
  MICRONUTRIENTS,
  MicronutrientCategory,
  getEffectiveTarget,
  formatMicroAmount,
} from '../../utils/nutrition/micronutrients';
import {
  aggregateMicronutrientsForIds,
  MicronutrientAggregateResult,
} from './aggregate';

interface MacrosMicroBlockOptions {
  ids: string[];
  showAll: boolean;
}

/**
 * Parse the code-block source into IDs and display options.
 */
function parseBlockOptions(lines: string[]): MacrosMicroBlockOptions {
  let ids: string[] = [];
  let showAll = false;

  lines.forEach((line) => {
    const idMatch = line.match(/^id[s]?:\s*(.+)$/i);
    if (idMatch) {
      ids = idMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    const showMatch = line.match(/^show:\s*(\w+)/i);
    if (showMatch) {
      showAll = showMatch[1].toLowerCase() === 'all';
    }
  });

  return { ids, showAll };
}

const CATEGORY_ORDER: { id: MicronutrientCategory; labelKey: string }[] = [
  { id: 'vitamin', labelKey: 'settings.micronutrients.categoryVitamins' },
  { id: 'mineral', labelKey: 'settings.micronutrients.categoryMinerals' },
  { id: 'other', labelKey: 'settings.micronutrients.categoryOther' },
];

/**
 * Render the aggregated micronutrient table into the element.
 */
function renderMicronutrientTable(
  plugin: MacrosPlugin,
  el: HTMLElement,
  result: MicronutrientAggregateResult,
  showAll: boolean
): void {
  el.empty();

  const profile = plugin.settings.micronutrientProfile;
  const overrides = plugin.settings.micronutrientTargets || {};

  const container = el.createDiv({ cls: 'macrosmicro-container' });

  // Header
  const header = container.createDiv({ cls: 'macrosmicro-header' });
  header.createSpan({ cls: 'macrosmicro-title', text: t('micronutrients.processor.title') });

  // Determine which nutrients to display
  const visibleDefs = MICRONUTRIENTS.filter((def) => {
    const consumed = result.totals[def.key] || 0;
    if (consumed > 0) return true;
    if (showAll) {
      const target = getEffectiveTarget(def.key, profile, overrides);
      return target != null && target > 0;
    }
    return false;
  });

  if (visibleDefs.length === 0) {
    container.createDiv({
      cls: 'macrosmicro-empty',
      text: result.resolvedCount === 0
        ? t('micronutrients.processor.noFoods')
        : t('micronutrients.processor.noData'),
    });
    return;
  }

  const table = container.createEl('table', {
    cls: ['macros-table', 'macros-table-colored', 'macrosmicro-table'],
  });

  // Column headers
  const thead = table.createEl('thead');
  const headRow = thead.createEl('tr');
  headRow.createEl('th', { text: t('micronutrients.processor.colNutrient') });
  headRow.createEl('th', { text: t('micronutrients.processor.colAmount') });
  headRow.createEl('th', { text: t('micronutrients.processor.colTarget') });
  headRow.createEl('th', { text: t('micronutrients.processor.colPercent') });

  const tbody = table.createEl('tbody');

  for (const category of CATEGORY_ORDER) {
    const defs = visibleDefs.filter((d) => d.category === category.id);
    if (defs.length === 0) continue;

    // Category sub-header row
    const catRow = tbody.createEl('tr', { cls: 'macrosmicro-category-row' });
    const catCell = catRow.createEl('td', { attr: { colspan: '4' } });
    catCell.createSpan({ cls: 'macrosmicro-category-label', text: t(category.labelKey) });

    for (const def of defs) {
      const consumed = result.totals[def.key] || 0;
      const target = getEffectiveTarget(def.key, profile, overrides);

      const row = tbody.createEl('tr', { cls: 'macrosmicro-row' });

      // Nutrient name
      const nameCell = row.createEl('td', { cls: 'macrosmicro-name' });
      nameCell.createSpan({ text: def.label });
      if (def.isLimit) {
        nameCell.createSpan({
          cls: 'macrosmicro-limit-badge',
          text: t('micronutrients.processor.limitBadge'),
        });
      }

      // Amount consumed
      row.createEl('td', {
        cls: 'macrosmicro-amount',
        text: `${formatMicroAmount(consumed)} ${def.unit}`,
      });

      // Target
      row.createEl('td', {
        cls: 'macrosmicro-target',
        text: target != null ? `${formatMicroAmount(target)} ${def.unit}` : '—',
      });

      // Percentage + bar
      const pctCell = row.createEl('td', { cls: 'macrosmicro-percent-cell' });

      if (target != null && target > 0) {
        const pct = (consumed / target) * 100;
        const pctRounded = Math.round(pct);

        const barWrap = pctCell.createDiv({ cls: 'macrosmicro-bar-wrap' });
        const bar = barWrap.createDiv({ cls: 'macrosmicro-bar' });
        bar.style.width = `${Math.min(pct, 100)}%`;

        // Status styling: limits flip the meaning of "over target"
        let statusClass = 'is-low';
        if (def.isLimit) {
          statusClass = pct > 100 ? 'is-over-limit' : 'is-within-limit';
        } else {
          if (pct >= 100) statusClass = 'is-met';
          else if (pct >= 70) statusClass = 'is-near';
          else statusClass = 'is-low';
        }
        bar.classList.add(statusClass);

        pctCell.createSpan({ cls: 'macrosmicro-percent-label', text: `${pctRounded}%` });
      } else {
        pctCell.createSpan({ cls: 'macrosmicro-percent-label', text: '—' });
      }
    }
  }

  // Footnote about basis
  const footnote = container.createDiv({ cls: 'macrosmicro-footnote' });
  footnote.createEl('span', {
    text: t('micronutrients.processor.footnote'),
  });
}

export function registerMacrosMicroProcessor(plugin: MacrosPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(
    'macrosmicro',
    async (source: string, el: HTMLElement) => {
      const lines = source
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');

      const { ids, showAll } = parseBlockOptions(lines);

      el.empty();

      if (ids.length === 0) {
        el.createEl('div', {
          cls: 'macrosmicro-error',
          text: t('charts.errors.noIdsProvided'),
        });
        return;
      }

      // Store ids on the element for potential refresh handling
      el.setAttribute('data-ids', ids.join(','));

      const loadingEl = el.createDiv({
        cls: 'macrosmicro-loading',
        text: t('charts.loading'),
      });

      try {
        const result = await aggregateMicronutrientsForIds(ids, plugin);
        loadingEl.remove();
        renderMicronutrientTable(plugin, el, result, showAll);
      } catch (error) {
        el.empty();
        plugin.logger.error('Error rendering macrosmicro block:', error);
        el.createEl('div', {
          cls: 'macrosmicro-error',
          text: t('charts.errors.renderError', { error: (error as Error).message }),
        });
      }
    }
  );
}

import MacrosPlugin from '../../../main';
import { t } from '../../../lang/I18nManager';
import {
  MICRONUTRIENTS,
  MicronutrientCategory,
  getEffectiveTarget,
  formatMicroAmount,
} from '../../../utils/nutrition/micronutrients';
import {
  aggregateMicronutrientsFromLines,
  MicronutrientAggregateResult,
} from '../utils/micronutrient-aggregate';

const CATEGORY_ORDER: { id: MicronutrientCategory; labelKey: string }[] = [
  { id: 'vitamin', labelKey: 'settings.micronutrients.categoryVitamins' },
  { id: 'mineral', labelKey: 'settings.micronutrients.categoryMinerals' },
  { id: 'other', labelKey: 'settings.micronutrients.categoryOther' },
];

/**
 * Build the micronutrient table element from an aggregate result.
 * Returns null when there is nothing meaningful to show.
 */
function buildMicronutrientTable(
  plugin: MacrosPlugin,
  result: MicronutrientAggregateResult,
  showAll: boolean
): HTMLElement | null {
  const profile = plugin.settings.micronutrientProfile;
  const overrides = plugin.settings.micronutrientTargets || {};

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

  if (visibleDefs.length === 0) return null;

  const container = createDiv({ cls: 'macrosmicro-container' });

  // Collapsible header
  const header = container.createDiv({ cls: 'macrosmicro-header' });
  const toggleIcon = header.createSpan({ cls: 'macrosmicro-toggle', text: '▼' });
  header.createSpan({ cls: 'macrosmicro-title', text: t('micronutrients.processor.title') });

  const body = container.createDiv({ cls: 'macrosmicro-body' });

  header.addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    toggleIcon.textContent = collapsed ? '▼' : '▶';
  });

  const table = body.createEl('table', {
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
  const footnote = body.createDiv({ cls: 'macrosmicro-footnote' });
  footnote.createEl('span', { text: t('micronutrients.processor.footnote') });

  return container;
}

/**
 * Aggregate micronutrients for a macros block's lines and append a
 * micronutrient table to the given container, when tracking is enabled and
 * the foods carry micronutrient data.
 *
 * @returns true if a section was appended, false otherwise.
 */
export function appendMicronutrientSection(
  plugin: MacrosPlugin,
  container: HTMLElement,
  lines: string[]
): boolean {
  // Respect the global enable/disable toggle
  if (!plugin.settings.micronutrientTrackingEnabled) return false;

  try {
    const result = aggregateMicronutrientsFromLines(lines, plugin);

    // Only show the section when at least one food actually carries micro data
    if (!result.hasAnyData) return false;

    const table = buildMicronutrientTable(plugin, result, false);
    if (!table) return false;

    container.appendChild(table);
    return true;
  } catch (error) {
    plugin.logger.error('Error rendering micronutrient section:', error);
    return false;
  }
}

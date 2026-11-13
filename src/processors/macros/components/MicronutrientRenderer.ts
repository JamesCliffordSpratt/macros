import { setIcon } from 'obsidian';
import MacrosPlugin from '../../../main';
import { t } from '../../../lang/I18nManager';
import type { MacrosState } from '../../../utils/MacrosState';
import {
  MICRONUTRIENTS,
  MicronutrientCategory,
  getEffectiveTarget,
  getPinnedMicronutrientKeys,
  formatMicroAmount,
} from '../../../utils/nutrition/micronutrients';
import {
  aggregateMicronutrientsFromLines,
  MicronutrientAggregateResult,
} from '../utils/micronutrient-aggregate';

/** MacrosState keys for the per-table micronutrient UI state. */
const SECTION_STATE_KEY = 'micronutrients';
const EXTRAS_STATE_KEY = 'micronutrients-show-all';

const CATEGORY_ORDER: { id: MicronutrientCategory; labelKey: string }[] = [
  { id: 'vitamin', labelKey: 'settings.micronutrients.categoryVitamins' },
  { id: 'mineral', labelKey: 'settings.micronutrients.categoryMinerals' },
  { id: 'other', labelKey: 'settings.micronutrients.categoryOther' },
];

/**
 * Build the micronutrient table element from an aggregate result.
 * Returns null when there is nothing meaningful to show.
 *
 * When the user has pinned micronutrients, pinned rows are always shown (even
 * at zero, so progress toward the target is visible) and every other nutrient
 * is collapsed behind a "show more" row.
 */
function buildMicronutrientTable(
  plugin: MacrosPlugin,
  result: MicronutrientAggregateResult,
  showAll: boolean,
  state: MacrosState | null
): HTMLElement | null {
  const profile = plugin.settings.micronutrientProfile;
  const overrides = plugin.settings.micronutrientTargets || {};
  const pinned = new Set(getPinnedMicronutrientKeys(plugin.settings.pinnedMicronutrients));
  const hasPins = pinned.size > 0;

  // Determine which nutrients to display
  const visibleDefs = MICRONUTRIENTS.filter((def) => {
    if (pinned.has(def.key)) return true;
    const consumed = result.totals[def.key] || 0;
    if (consumed > 0) return true;
    if (showAll) {
      const target = getEffectiveTarget(def.key, profile, overrides);
      return target != null && target > 0;
    }
    return false;
  });

  if (visibleDefs.length === 0) return null;

  // Rows hidden until the user expands them (only when something is pinned)
  const isExtra = (key: string) => hasPins && !pinned.has(key);
  const extraCount = visibleDefs.filter((def) => isExtra(def.key)).length;

  const container = createDiv({ cls: 'macrosmicro-container' });

  // Collapsible header
  const header = container.createDiv({ cls: 'macrosmicro-header' });
  const toggleIcon = header.createSpan({ cls: 'macrosmicro-toggle', text: '▼' });
  header.createSpan({ cls: 'macrosmicro-title', text: t('micronutrients.processor.title') });

  const body = container.createDiv({ cls: 'macrosmicro-body' });

  // Collapse state is remembered per table, so it survives live refreshes
  const setCollapsed = (collapsed: boolean) => {
    body.toggleClass('macros-u-hidden', collapsed);
    toggleIcon.textContent = collapsed ? '▶' : '▼';
  };
  setCollapsed(state?.getCollapsedState(SECTION_STATE_KEY) ?? false);

  header.addEventListener('click', () => {
    const collapsed = !body.hasClass('macros-u-hidden');
    setCollapsed(collapsed);
    state?.saveCollapsedState(SECTION_STATE_KEY, collapsed);
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

    // Category sub-header row (collapsed with the extras when the category
    // has no pinned nutrient)
    const catRow = tbody.createEl('tr', { cls: 'macrosmicro-category-row' });
    if (defs.every((def) => isExtra(def.key))) {
      catRow.addClass('macrosmicro-extra', 'macros-u-hidden');
    }
    const catCell = catRow.createEl('td', { attr: { colspan: '4' } });
    catCell.createSpan({ cls: 'macrosmicro-category-label', text: t(category.labelKey) });

    for (const def of defs) {
      const consumed = result.totals[def.key] || 0;
      const target = getEffectiveTarget(def.key, profile, overrides);

      const row = tbody.createEl('tr', { cls: 'macrosmicro-row' });
      if (isExtra(def.key)) {
        row.addClass('macrosmicro-extra', 'macros-u-hidden');
      }

      // Nutrient name
      const nameCell = row.createEl('td', { cls: 'macrosmicro-name' });
      if (pinned.has(def.key)) {
        const pinIcon = nameCell.createSpan({
          cls: 'macrosmicro-pin-icon',
          attr: { 'aria-label': t('micronutrients.processor.pinned') },
        });
        setIcon(pinIcon, 'pin');
      }
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

  // "Show N more" toggle for the non-pinned nutrients
  if (extraCount > 0) {
    const moreRow = tbody.createEl('tr', { cls: 'macrosmicro-more-row' });
    const moreCell = moreRow.createEl('td', { attr: { colspan: '4' } });
    const moreBtn = moreCell.createEl('button', { cls: 'macrosmicro-more-btn' });

    const setExpanded = (expanded: boolean) => {
      tbody
        .querySelectorAll('.macrosmicro-extra')
        .forEach((el) => el.toggleClass('macros-u-hidden', !expanded));
      moreBtn.setText(
        expanded
          ? t('micronutrients.processor.showLess')
          : t('micronutrients.processor.showMore', { count: extraCount })
      );
      moreBtn.setAttr('aria-expanded', expanded ? 'true' : 'false');
    };

    // Expanded state is remembered per table, so it survives live refreshes.
    // (MacrosState stores a boolean per key; here `true` means "expanded".)
    let expanded = state?.getCollapsedState(EXTRAS_STATE_KEY) ?? false;
    setExpanded(expanded);

    moreBtn.addEventListener('click', () => {
      expanded = !expanded;
      setExpanded(expanded);
      state?.saveCollapsedState(EXTRAS_STATE_KEY, expanded);
    });
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
  lines: string[],
  state: MacrosState | null = null
): boolean {
  // Respect the global enable/disable toggle
  if (!plugin.settings.micronutrientTrackingEnabled) return false;

  try {
    const result = aggregateMicronutrientsFromLines(lines, plugin);

    // Only show the section when at least one food actually carries micro data
    if (!result.hasAnyData) return false;

    const table = buildMicronutrientTable(plugin, result, false, state);
    if (!table) return false;

    container.appendChild(table);
    return true;
  } catch (error) {
    plugin.logger.error('Error rendering micronutrient section:', error);
    return false;
  }
}

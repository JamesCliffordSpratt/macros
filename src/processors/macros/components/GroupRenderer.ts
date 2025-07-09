import MacrosPlugin from '../../../main';
import {
  MacrosState,
  attachTooltip,
  CLASS_NAMES,
  MacroTotals,
  DailyTargets,
  Group,
} from '../../../utils';
import { RowRenderer } from './RowRenderer';
import { t } from '../../../lang/I18nManager';

export class GroupRenderer {
  private plugin: MacrosPlugin;
  private state: MacrosState | null;
  private rowRenderer: RowRenderer;

  constructor(plugin: MacrosPlugin, state: MacrosState | null) {
    this.plugin = plugin;
    this.state = state;
    this.rowRenderer = new RowRenderer(this.plugin);
  }

  renderGroups(
    table: HTMLTableElement,
    groups: Group[],
    combinedTotals: MacroTotals,
    dailyTargets: DailyTargets,
    onRemoveMacroLine: (macroLine: string) => Promise<void>,
    onUpdateQuantity: (
      macroLine: string,
      newQuantity: number,
      isMealItem?: boolean,
      mealName?: string,
      originalItemText?: string
    ) => Promise<void>
  ): void {
    this.rowRenderer.setRemoveCallback(onRemoveMacroLine);
    this.rowRenderer.setUpdateQuantityCallback(onUpdateQuantity);
    const multipleGroups = groups.length > 1;

    groups.forEach((group) => {
      this.renderGroup(table, group, dailyTargets, !multipleGroups);
    });

    if (multipleGroups && this.plugin.settings.showSummaryRows) {
      this.renderCombinedTotals(table, combinedTotals, dailyTargets);
    }
  }

  renderGroup(
    table: HTMLTableElement,
    group: Group,
    dailyTargets: DailyTargets,
    showTotals: boolean
  ): void {
    const sectionName = group.name.replace(/\\s+/g, '-').toLowerCase();

    const headerRow = table.insertRow();
    headerRow.classList.add(CLASS_NAMES.TABLE.MEAL_HEADER);
    const headerCell = headerRow.insertCell();
    headerCell.colSpan = 6;
    headerCell.classList.add(
      CLASS_NAMES.TABLE.MEAL_HEADER_CELL,
      CLASS_NAMES.TABLE.COLLAPSIBLE,
      'collapsible-header'
    );
    headerRow.dataset.section = sectionName;

    this.createGroupHeader(headerCell, group);
    this.setupCollapsibleHeader(headerCell, headerRow, table);

    this.renderColumnHeaders(table, sectionName);

    group.rows.forEach((row) => {
      this.rowRenderer.renderFoodRow(table, row, group, sectionName, dailyTargets);
    });

    if (showTotals && this.plugin.settings.showSummaryRows) {
      this.renderGroupTotals(table, group, sectionName, dailyTargets);
    }
  }

  private createGroupHeader(headerCell: HTMLTableCellElement, group: Group): void {
    const headerContent = createEl('div', { cls: 'header-content' });

    const leftContent = createEl('div', { cls: 'header-left' });

    // SIMPLIFIED: No multiplier display since we don't use multipliers anymore
    const nameSpan = createEl('span', {
      cls: 'header-label',
      text: group.name, // Just show the meal name, no "× 2" suffix
    });
    leftContent.appendChild(nameSpan);

    const caloriesSpan = createEl('span', {
      cls: 'header-calorie-summary',
      text: `(${group.total.calories.toFixed(1)} ${t('table.headers.calories').toLowerCase()})`,
    });
    leftContent.appendChild(caloriesSpan);

    if (group.macroLine) {
      const removeBtn = createEl('span', {
        cls: `${CLASS_NAMES.TABLE.CONTROL_ICON} ${CLASS_NAMES.ICONS.REMOVE}`,
        text: '–',
      });
      attachTooltip(removeBtn, t('table.actions.removeMeal'));

      const removeBtnHandler = async (e: MouseEvent) => {
        e.stopPropagation();
        const macroLine = group.macroLine;
        if (macroLine) {
          await this.rowRenderer.onRemove(macroLine);
        }
      };

      this.plugin.registerDomListener(removeBtn, 'click', removeBtnHandler);
      leftContent.appendChild(removeBtn);
    }

    const toggleSpan = createEl('span', {
      cls: 'toggle-icon',
    });

    headerContent.appendChild(leftContent);
    headerContent.appendChild(toggleSpan);
    headerCell.appendChild(headerContent);
  }

  private setupCollapsibleHeader(
    headerCell: HTMLTableCellElement,
    headerRow: HTMLTableRowElement,
    table: HTMLTableElement
  ): void {
    const sectionName = headerRow.dataset.section as string;

    let isCollapsed = false;

    if (this.state) {
      isCollapsed = this.state.getCollapsedState(sectionName);

      if (isCollapsed) {
        headerCell.classList.add(CLASS_NAMES.TABLE.COLLAPSED);
        headerCell.classList.add('collapsed');
        this.setRowsVisibility(table, sectionName, false);
      }
    }

    headerCell.dataset.macroState = isCollapsed ? 'collapsed' : 'expanded';

    const headerCellClickHandler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains(CLASS_NAMES.ICONS.REMOVE)) {
        return;
      }

      const currentState = headerCell.dataset.macroState;

      if (currentState === 'collapsed') {
        headerCell.classList.remove(CLASS_NAMES.TABLE.COLLAPSED);
        headerCell.classList.remove('collapsed');
        this.setRowsVisibility(table, sectionName, true);
        headerCell.dataset.macroState = 'expanded';
        if (this.state) {
          this.state.saveCollapsedState(sectionName, false);
        }
      } else {
        headerCell.classList.add(CLASS_NAMES.TABLE.COLLAPSED);
        headerCell.classList.add('collapsed');
        this.setRowsVisibility(table, sectionName, false);
        headerCell.dataset.macroState = 'collapsed';
        if (this.state) {
          this.state.saveCollapsedState(sectionName, true);
        }
      }
    };

    this.plugin.registerDomListener(headerCell, 'click', headerCellClickHandler);
  }

  private setRowsVisibility(table: HTMLTableElement, sectionName: string, visible: boolean): void {
    setTimeout(() => {
      const rows = table.querySelectorAll(`tr[data-parent="${sectionName}"]`);

      rows.forEach((row) => {
        const el = row as HTMLElement;
        if (visible) {
          el.classList.add('table-row-visible');
          el.classList.remove('table-row-hidden');
        } else {
          el.classList.add('table-row-hidden');
          el.classList.remove('table-row-visible');
        }
      });
    }, 0);
  }

  private renderColumnHeaders(table: HTMLTableElement, parentSection: string): void {
    const colHeaderRow = table.insertRow();
    colHeaderRow.dataset.parent = parentSection;

    // Define the headers with their corresponding CSS classes and mobile truncation
    const headers = [
      { text: t('table.headers.food'), class: '', mobileText: t('table.headers.food') },
      {
        text: t('table.headers.serving'),
        class: '',
        mobileText: t('table.headers.servingShort') || 'Qty',
      },
      {
        text: t('table.headers.calories'),
        class: 'calories-cell',
        mobileText: t('table.headers.caloriesShort') || 'Cal',
      },
      {
        text: t('table.headers.protein'),
        class: 'protein-cell',
        mobileText: t('table.headers.proteinShort') || 'Pro',
      },
      {
        text: t('table.headers.fat'),
        class: 'fat-cell',
        mobileText: t('table.headers.fatShort') || 'Fat',
      },
      {
        text: t('table.headers.carbs'),
        class: 'carbs-cell',
        mobileText: t('table.headers.carbsShort') || 'Carb',
      },
    ];

    headers.forEach(({ text, class: cssClass, mobileText }) => {
      const cell = colHeaderRow.insertCell();
      cell.classList.add(CLASS_NAMES.TABLE.COLUMN_HEADER);

      // Add the macro-specific class for colored borders
      if (cssClass) {
        cell.classList.add(cssClass);
      }

      // Create spans for responsive text
      const desktopSpan = createEl('span', {
        cls: 'header-text-desktop',
        text: text,
      });

      const mobileSpan = createEl('span', {
        cls: 'header-text-mobile',
        text: mobileText,
      });

      cell.appendChild(desktopSpan);
      cell.appendChild(mobileSpan);
    });
  }

  renderGroupTotals(
    table: HTMLTableElement,
    group: Group,
    parentSection: string,
    dailyTargets: DailyTargets
  ): void {
    const totalRow = table.insertRow();
    totalRow.classList.add(CLASS_NAMES.TABLE.TOTALS_ROW);
    totalRow.dataset.parent = parentSection;

    const totalLabelCell = totalRow.insertCell();
    totalLabelCell.innerText = t('table.summary.totals');
    totalLabelCell.colSpan = 2;

    this.rowRenderer.renderTotalCells(totalRow, group.total);

    const targetsRow = table.insertRow();
    targetsRow.classList.add(CLASS_NAMES.TABLE.TARGETS_ROW);
    targetsRow.dataset.parent = parentSection;

    const targetsLabelCell = targetsRow.insertCell();
    targetsLabelCell.innerText = t('table.summary.targets');
    targetsLabelCell.colSpan = 2;

    this.rowRenderer.renderTargetCells(targetsRow, group.total, dailyTargets);

    const remainingRow = table.insertRow();
    remainingRow.classList.add(CLASS_NAMES.TABLE.REMAINING_ROW);
    remainingRow.dataset.parent = parentSection;

    const remainingLabelCell = remainingRow.insertCell();
    remainingLabelCell.innerText = t('table.summary.remaining');
    remainingLabelCell.colSpan = 2;

    this.rowRenderer.renderRemainingCells(remainingRow, group.total, dailyTargets);
  }

  renderCombinedTotals(
    table: HTMLTableElement,
    combinedTotals: MacroTotals,
    dailyTargets: DailyTargets
  ): void {
    const combinedHeaderRow = table.insertRow();
    combinedHeaderRow.classList.add('combined-totals-header');
    const combinedHeaderCell = combinedHeaderRow.insertCell();
    combinedHeaderCell.colSpan = 6;
    combinedHeaderCell.classList.add(
      CLASS_NAMES.TABLE.MEAL_HEADER_CELL,
      CLASS_NAMES.TABLE.COLLAPSIBLE,
      'collapsible-header'
    );
    combinedHeaderRow.dataset.section = 'combined-totals';

    const combinedHeaderContent = createEl('div', { cls: 'header-content' });
    const combinedLabel = createEl('span', {
      cls: 'header-label',
      text: t('table.summary.macrosSummary'),
    });

    const combinedToggle = createEl('span', {
      cls: 'toggle-icon',
    });

    combinedHeaderContent.appendChild(combinedLabel);
    combinedHeaderContent.appendChild(combinedToggle);
    combinedHeaderCell.appendChild(combinedHeaderContent);

    let isCollapsed = false;

    if (this.state) {
      isCollapsed = this.state.getCollapsedState('combined-totals');

      if (isCollapsed) {
        combinedHeaderCell.classList.add(CLASS_NAMES.TABLE.COLLAPSED);
        combinedHeaderCell.classList.add('collapsed');
        this.setRowsVisibility(table, 'combined-totals', false);
      }
    }

    combinedHeaderCell.dataset.macroState = isCollapsed ? 'collapsed' : 'expanded';

    const combinedHeaderClickHandler = () => {
      const currentState = combinedHeaderCell.dataset.macroState;

      if (currentState === 'collapsed') {
        combinedHeaderCell.classList.remove(CLASS_NAMES.TABLE.COLLAPSED);
        combinedHeaderCell.classList.remove('collapsed');
        this.setRowsVisibility(table, 'combined-totals', true);
        combinedHeaderCell.dataset.macroState = 'expanded';
        if (this.state) {
          this.state.saveCollapsedState('combined-totals', false);
        }
      } else {
        combinedHeaderCell.classList.add(CLASS_NAMES.TABLE.COLLAPSED);
        combinedHeaderCell.classList.add('collapsed');
        this.setRowsVisibility(table, 'combined-totals', false);
        combinedHeaderCell.dataset.macroState = 'collapsed';
        if (this.state) {
          this.state.saveCollapsedState('combined-totals', true);
        }
      }
    };

    this.plugin.registerDomListener(combinedHeaderCell, 'click', combinedHeaderClickHandler);

    this.renderGroupTotals(
      table,
      {
        name: 'Combined',
        count: 1,
        rows: [],
        total: combinedTotals,
      },
      'combined-totals',
      dailyTargets
    );
  }

  public collapseAllSections(table: HTMLTableElement, id: string | null): void {
    const allHeaders = table.querySelectorAll(
      `.${CLASS_NAMES.TABLE.MEAL_HEADER_CELL}.${CLASS_NAMES.TABLE.COLLAPSIBLE}, ` +
        `.combined-totals-header .${CLASS_NAMES.TABLE.COLLAPSIBLE}`
    );

    allHeaders.forEach((header) => {
      header.classList.add(CLASS_NAMES.TABLE.COLLAPSED);
      header.classList.add('collapsed');

      const headerRow = header.parentElement as HTMLTableRowElement;
      if (!headerRow || !headerRow.dataset.section) return;
      const sectionName = headerRow.dataset.section;

      const rows = table.querySelectorAll(`tr[data-parent="${sectionName}"]`);
      rows.forEach((row) => {
        const el = row as HTMLElement;
        el.classList.add('table-row-hidden');
        el.classList.remove('table-row-visible');
      });

      (header as HTMLElement).dataset.macroState = 'collapsed';

      if (this.state && id) {
        this.state.saveCollapsedState(sectionName, true);
      }
    });
  }

  public expandAllSections(table: HTMLTableElement, id: string | null): void {
    const allHeaders = table.querySelectorAll(
      `.${CLASS_NAMES.TABLE.MEAL_HEADER_CELL}.${CLASS_NAMES.TABLE.COLLAPSIBLE}, ` +
        `.combined-totals-header .${CLASS_NAMES.TABLE.COLLAPSIBLE}`
    );

    allHeaders.forEach((header) => {
      header.classList.remove(CLASS_NAMES.TABLE.COLLAPSED);
      header.classList.remove('collapsed');

      const headerRow = header.parentElement as HTMLTableRowElement;
      if (!headerRow || !headerRow.dataset.section) return;
      const sectionName = headerRow.dataset.section;

      const rows = table.querySelectorAll(`tr[data-parent="${sectionName}"]`);
      rows.forEach((row) => {
        const el = row as HTMLElement;
        el.classList.add('table-row-visible');
        el.classList.remove('table-row-hidden');
      });

      (header as HTMLElement).dataset.macroState = 'expanded';

      if (this.state && id) {
        this.state.saveCollapsedState(sectionName, false);
      }
    });
  }

  public toggleAllSections(table: HTMLTableElement, collapse: boolean, id: string | null): void {
    if (collapse) {
      this.collapseAllSections(table, id);
    } else {
      this.expandAllSections(table, id);
    }
  }
}

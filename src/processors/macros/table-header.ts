import { CLASS_NAMES, MacrosState } from '../../utils';
import { AddToMacrosModal } from '../../ui';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export class TableHeader {
  private toggleButton: HTMLElement | null = null;
  private isCollapsed = false;
  private dashboardElements: HTMLElement[] = [];

  constructor(
    private container: HTMLElement,
    private id: string | null,
    private onToggleClick: (collapse: boolean) => void,
    private plugin: MacrosPlugin
  ) {}

  render(): void {
    const headerContainer = this.container.createDiv({
      cls: `${CLASS_NAMES.TABLE.HEADER} collapsible-header`,
    });

    const infoSection = headerContainer.createDiv({ cls: 'header-left' });
    if (this.id) {
      infoSection.createSpan({
        cls: CLASS_NAMES.TABLE.ID_LABEL,
        text: 'ID:',
      });

      infoSection.createSpan({
        cls: CLASS_NAMES.TABLE.ID,
        text: this.id,
      });
    }

    const controls = headerContainer.createDiv({ cls: CLASS_NAMES.TABLE.CONTROLS });

    this.toggleButton = controls.createEl('span', {
      attr: { 'aria-label': t('table.actions.collapseAll') },
      cls: 'toggle-icon',
    });

    this.toggleButton.addClass(CLASS_NAMES.ICONS.COLLAPSE_ALL);

    // Find dashboard elements after rendering
    setTimeout(() => {
      let macrosContainer = this.container;
      let parent = this.container.parentElement;
      while (parent) {
        if (parent.classList && parent.classList.contains('macros-container')) {
          macrosContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }

      if (macrosContainer) {
        const dashboardHeader = macrosContainer.querySelector('.macro-dashboard-header');
        const dashboardContent = macrosContainer.querySelector('.macro-dashboard-content');
        const toggleIcon = dashboardHeader?.querySelector('.toggle-icon');

        if (dashboardHeader) this.dashboardElements.push(dashboardHeader as HTMLElement);
        if (dashboardContent) this.dashboardElements.push(dashboardContent as HTMLElement);
        if (toggleIcon) this.dashboardElements.push(toggleIcon as HTMLElement);

        this.plugin.logger.debug(`Found ${this.dashboardElements.length} dashboard elements`);
      }
    }, 100);

    const toggleClickHandler = (e: MouseEvent) => {
      e.stopPropagation();

      this.isCollapsed = !this.isCollapsed;
      if (this.isCollapsed) {
        this.setCollapseState();
      } else {
        this.setExpandState();
      }
      this.onToggleClick(this.isCollapsed);
      this.toggleDashboardElements(this.isCollapsed);
    };

    if (this.toggleButton) {
      this.plugin.registerDomListener(this.toggleButton, 'click', toggleClickHandler);
    }

    const headerClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.classList.contains(CLASS_NAMES.ICONS.ADD) ||
        target.closest(`.${CLASS_NAMES.TABLE.CONTROLS}`)
      ) {
        return;
      }

      this.isCollapsed = !this.isCollapsed;
      if (this.isCollapsed) {
        this.setCollapseState();
      } else {
        this.setExpandState();
      }
      this.onToggleClick(this.isCollapsed);
      this.toggleDashboardElements(this.isCollapsed);
    };

    this.plugin.registerDomListener(headerContainer, 'click', headerClickHandler);

    const addBtn = controls.createEl('span', {
      cls: `${CLASS_NAMES.TABLE.CONTROL_ICON} ${CLASS_NAMES.ICONS.ADD}`,
      attr: { 'aria-label': t('table.actions.addItems') },
      text: '+',
    });

    const addBtnClickHandler = (e: MouseEvent) => {
      e.stopPropagation();

      if (this.id) {
        new AddToMacrosModal(this.plugin.app, this.plugin, this.id, async () => {
          await this.plugin.updateMacrosCodeBlock();
        }).open();
      }
    };

    this.plugin.registerDomListener(addBtn, 'click', addBtnClickHandler);

    setTimeout(() => {
      this.initializeButtonState();
    }, 50);
  }

  private toggleDashboardElements(collapse: boolean): void {
    if (this.dashboardElements.length === 0) return;

    if (this.id && this.plugin) {
      const dashboardState = new MacrosState(this.plugin, this.id, 'dashboard');
      dashboardState.saveCollapsedState('dashboard', collapse);
      this.plugin.logger.debug(`Saved dashboard state: ${collapse} from table header`);
    }

    this.dashboardElements.forEach((element) => {
      if (element.classList.contains('macro-dashboard-header')) {
        if (collapse) {
          element.classList.add('collapsed');
        } else {
          element.classList.remove('collapsed');
        }
      } else if (element.classList.contains('macro-dashboard-content')) {
        if (collapse) {
          element.classList.add('collapsed');
        } else {
          element.classList.remove('collapsed');
        }
      } else if (element.classList.contains('toggle-icon')) {
        if (collapse) {
          element.classList.add('collapsed');
        } else {
          element.classList.remove('collapsed');
        }
      }
    });
  }

  public initializeButtonState(): void {
    try {
      const sections = document.querySelectorAll('.meal-header');

      if (sections.length === 0) {
        this.isCollapsed = false;
        this.setExpandState();
        return;
      }

      const allSectionsCollapsed = Array.from(sections).every((section) => {
        const headerCell = section.querySelector('.meal-header-cell');
        return headerCell && headerCell.classList.contains('collapsed');
      });

      if (allSectionsCollapsed) {
        this.isCollapsed = true;
        this.setCollapseState();
        this.toggleDashboardElements(true);
      } else {
        this.isCollapsed = false;
        this.setExpandState();
        this.toggleDashboardElements(false);
      }

      this.plugin.logger.debug(
        `Initialized toggle button state: ${this.isCollapsed ? 'collapsed' : 'expanded'}`
      );
    } catch (error) {
      this.plugin.logger.error('Error initializing button state:', error);
      this.isCollapsed = false;
      this.setExpandState();
    }
  }

  public setCollapseState(): void {
    if (!this.toggleButton) return;
    try {
      this.toggleButton.classList.add('collapsed');
      this.toggleButton.setAttribute('aria-label', t('table.actions.expandAll'));
      this.toggleButton.removeClass(CLASS_NAMES.ICONS.COLLAPSE_ALL);
      this.toggleButton.addClass(CLASS_NAMES.ICONS.EXPAND_ALL);
    } catch (error) {
      this.plugin.logger.error('Error setting collapse state:', error);
    }
  }

  public setExpandState(): void {
    if (!this.toggleButton) return;
    try {
      this.toggleButton.classList.remove('collapsed');
      this.toggleButton.setAttribute('aria-label', t('table.actions.collapseAll'));
      this.toggleButton.removeClass(CLASS_NAMES.ICONS.EXPAND_ALL);
      this.toggleButton.addClass(CLASS_NAMES.ICONS.COLLAPSE_ALL);
    } catch (error) {
      this.plugin.logger.error('Error setting expand state:', error);
    }
  }
}

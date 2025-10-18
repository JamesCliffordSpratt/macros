import { App, Modal, Notice, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export interface ToleranceData {
  severity: '🔴' | '🟠' | '🟡';
  symptoms: string;
  dateAdded: string;
}

export class ToleranceModal extends Modal {
  private plugin: MacrosPlugin;
  private onSubmit: (tolerance: ToleranceData | null) => Promise<void>;
  private component: Component;
  private currentTolerance: ToleranceData | null;
  private isEditing: boolean;
  private targetType: 'meal' | 'food-item';
  private targetName: string;

  constructor(
    app: App,
    plugin: MacrosPlugin,
    currentTolerance: ToleranceData | null,
    targetType: 'meal' | 'food-item',
    targetName: string,
    onSubmit: (tolerance: ToleranceData | null) => Promise<void>
  ) {
    super(app);
    this.plugin = plugin;
    this.currentTolerance = currentTolerance;
    this.isEditing = currentTolerance !== null;
    this.targetType = targetType;
    this.targetName = targetName;
    this.onSubmit = onSubmit;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('tolerance-modal');

    // Create header
    const header = contentEl.createEl('div', {
      cls: 'modal-header macros-modal-header tolerance-modal-header',
    });

    const title = this.isEditing
      ? this.targetType === 'meal'
        ? t('tolerances.editMealTolerance')
        : t('tolerances.editItemTolerance')
      : this.targetType === 'meal'
        ? t('tolerances.addMealTolerance')
        : t('tolerances.addItemTolerance');

    header.createEl('h2', {
      text: title,
      cls: 'tolerance-modal-title',
    });

    // Create description
    const description = contentEl.createEl('div', {
      cls: 'modal-description macros-modal-description tolerance-modal-description',
    });

    const descriptionText =
      this.targetType === 'meal'
        ? t('tolerances.mealDescription', { mealName: this.targetName })
        : t('tolerances.itemDescription', { itemName: this.targetName });

    description.createEl('p', {
      text: descriptionText,
      cls: 'tolerance-description-text',
    });

    // Create severity selection container
    const severityContainer = contentEl.createDiv({ cls: 'tolerance-severity-container' });

    // Fixed: Prefix unused variable with underscore
    const _severityLabel = severityContainer.createEl('label', {
      text: t('tolerances.severityLabel'),
      cls: 'tolerance-severity-label',
    });

    const severityOptions = severityContainer.createDiv({ cls: 'tolerance-severity-options' });

    // Severity options with descriptions
    const severities = [
      {
        value: '🟡' as const,
        label: t('tolerances.severityMild'),
        description: t('tolerances.severityMildDesc'),
      },
      {
        value: '🟠' as const,
        label: t('tolerances.severityModerate'),
        description: t('tolerances.severityModerateDesc'),
      },
      {
        value: '🔴' as const,
        label: t('tolerances.severitySevere'),
        description: t('tolerances.severitySevereDesc'),
      },
    ];

    let selectedSeverity: '🔴' | '🟠' | '🟡' = this.currentTolerance?.severity || null;

    severities.forEach(({ value, label, description }) => {
      const optionContainer = severityOptions.createDiv({ cls: 'tolerance-severity-option' });

      const option = optionContainer.createEl('button', {
        cls: `tolerance-severity-btn ${selectedSeverity === value ? 'selected' : ''}`,
        type: 'button',
      });

      // Fixed: Prefix unused variable with underscore
      const _iconSpan = option.createSpan({ cls: 'severity-icon', text: value });
      const textContainer = option.createDiv({ cls: 'severity-text' });
      textContainer.createSpan({ cls: 'severity-label', text: label });
      textContainer.createSpan({ cls: 'severity-description', text: description });

      this.component.registerDomEvent(option, 'click', () => {
        // Remove selected class from all options
        severityOptions.querySelectorAll('.tolerance-severity-btn').forEach((btn) => {
          btn.classList.remove('selected');
        });

        // Add selected class to clicked option
        option.classList.add('selected');
        selectedSeverity = value;
      });
    });

    // Create symptoms input container
    const symptomsContainer = contentEl.createDiv({ cls: 'tolerance-symptoms-container' });

    // Fixed: Prefix unused variable with underscore
    const _symptomsLabel = symptomsContainer.createEl('label', {
      text: t('tolerances.symptomsLabel'),
      cls: 'tolerance-symptoms-label',
    });

    const textarea = symptomsContainer.createEl('textarea', {
      cls: 'tolerance-symptoms-textarea',
      attr: {
        placeholder: t('tolerances.symptomsPlaceholder'),
        rows: '3',
        maxlength: '200',
      },
    });

    textarea.value = this.currentTolerance?.symptoms || '';

    // Character count
    const charCount = symptomsContainer.createEl('div', {
      cls: 'tolerance-char-count',
      text: `${textarea.value.length}/200`,
    });

    // Update character count on input
    this.component.registerDomEvent(textarea, 'input', () => {
      const length = textarea.value.length;
      charCount.textContent = `${length}/200`;

      if (length > 180) {
        charCount.addClass('char-count-warning');
      } else {
        charCount.removeClass('char-count-warning');
      }
    });

    // Button container
    const buttonContainer = contentEl.createDiv({
      cls: 'tolerance-button-container macros-button-container',
    });

    const cancelBtn = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'mod-button tolerance-cancel-btn',
    });

    const saveBtn = buttonContainer.createEl('button', {
      text: this.isEditing ? t('tolerances.updateTolerance') : t('tolerances.addTolerance'),
      cls: 'mod-button mod-cta tolerance-save-btn',
    });

    // If editing, add a remove button
    if (this.isEditing) {
      const removeBtn = buttonContainer.createEl('button', {
        text: t('tolerances.removeTolerance'),
        cls: 'mod-button mod-warning tolerance-remove-btn',
      });

      this.component.registerDomEvent(removeBtn, 'click', async () => {
        try {
          await this.onSubmit(null); // null removes the tolerance
          new Notice(t('tolerances.toleranceRemoved'));
          this.close();
        } catch (error) {
          this.plugin.logger.error('Error removing tolerance:', error);
          new Notice(t('tolerances.removeError', { error: (error as Error).message }));
        }
      });
    }

    // Event handlers
    this.component.registerDomEvent(cancelBtn, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(saveBtn, 'click', async () => {
      const symptoms = textarea.value.trim();

      if (symptoms.length > 200) {
        new Notice(t('tolerances.symptomsTooLong'));
        return;
      }

      if (symptoms.length === 0) {
        new Notice(t('tolerances.symptomsRequired'));
        return;
      }

      try {
        const toleranceData: ToleranceData = {
          severity: selectedSeverity,
          symptoms: symptoms,
          dateAdded: new Date().toISOString(),
        };

        await this.onSubmit(toleranceData);

        const successMsg = this.isEditing
          ? t('tolerances.toleranceUpdated')
          : t('tolerances.toleranceAdded');

        new Notice(successMsg);
        this.close();
      } catch (error) {
        this.plugin.logger.error('Error saving tolerance:', error);
        new Notice(t('tolerances.saveError', { error: (error as Error).message }));
      }
    });

    // Handle Enter key (Ctrl/Cmd + Enter to save)
    this.component.registerDomEvent(textarea, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    // Focus the textarea
    setTimeout(() => {
      textarea.focus();
      if (this.isEditing) {
        textarea.select();
      }
    }, 100);
  }

  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}

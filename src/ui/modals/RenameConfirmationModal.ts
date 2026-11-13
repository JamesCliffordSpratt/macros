import { Modal, Setting, ButtonComponent } from 'obsidian';
import MacrosPlugin from '../../main';
import { TFile } from 'obsidian';
import { t } from '../../lang/I18nManager';

interface AffectedFile {
  file: TFile;
  matches: Array<{
    line: number;
    content: string;
    preview: string;
  }>;
}

/**
 * RenameConfirmationModal
 * -----------------------
 * Modal for confirming food name rename operations and selecting which files to update.
 */
export class RenameConfirmationModal extends Modal {
  private plugin: MacrosPlugin;
  private oldName: string;
  private newName: string;
  private affectedFiles: AffectedFile[];
  private onConfirm: (selectedFiles: AffectedFile[]) => Promise<void>;
  private onCancel?: () => Promise<void>;
  private selectedFiles: Set<string> = new Set();
  private createBackupCheckbox: HTMLInputElement | null = null;

  constructor(
    plugin: MacrosPlugin,
    oldName: string,
    newName: string,
    affectedFiles: AffectedFile[],
    onConfirm: (selectedFiles: AffectedFile[]) => Promise<void>,
    onCancel?: () => Promise<void>
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.oldName = oldName;
    this.newName = newName;
    this.affectedFiles = affectedFiles;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    // Initially select all files
    this.affectedFiles.forEach(({ file }) => {
      this.selectedFiles.add(file.path);
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass('macros-rename-modal');
    contentEl.empty();

    // Title
    contentEl.createEl('h2', { text: t('rename.title') });

    // Summary section
    const summaryEl = contentEl.createDiv({ cls: 'rename-summary' });

    summaryEl.createEl('p', {
      text: t('rename.summary', {
        oldName: this.oldName,
        newName: this.newName,
      }),
    });

    summaryEl.createEl('p', {
      text: t('rename.filesAffected', { count: this.affectedFiles.length }),
      cls: 'rename-files-count',
    });

    // Files list section
    const filesSection = contentEl.createDiv({ cls: 'rename-files-section' });
    filesSection.createEl('h3', {
      text: t('rename.filesAffected', { count: this.affectedFiles.length }),
    });

    const filesList = filesSection.createDiv({ cls: 'rename-files-list' });

    this.affectedFiles.forEach(({ file, matches }) => {
      const fileItem = filesList.createDiv({ cls: 'rename-file-item' });

      // File checkbox and name
      const fileHeader = fileItem.createDiv({ cls: 'rename-file-header' });

      const checkbox = fileHeader.createEl('input', {
        type: 'checkbox',
        cls: 'rename-file-checkbox',
      });
      checkbox.checked = this.selectedFiles.has(file.path);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedFiles.add(file.path);
        } else {
          this.selectedFiles.delete(file.path);
        }
        this.updateButtonStates();
      });

      fileHeader.createSpan({
        text: file.path,
        cls: 'rename-file-path',
      });

      fileHeader.createSpan({
        text: `(${matches.length} ${matches.length === 1 ? 'match' : 'matches'})`,
        cls: 'rename-match-count',
      });

      // Preview section
      const previewSection = fileItem.createDiv({ cls: 'rename-preview-section' });

      // Fixed: Prefix unused parameter with underscore
      matches.slice(0, 3).forEach((match, _index) => {
        const previewItem = previewSection.createDiv({ cls: 'rename-preview-item' });

        previewItem.createDiv({
          text: `${t('rename.previewBefore')}: ${match.preview}`,
          cls: 'rename-preview-before',
        });

        const afterPreview = match.preview.replace(
          new RegExp(
            this.escapeRegExp(this.oldName),
            this.plugin.settings.caseSensitiveFoodMatch ? 'g' : 'gi'
          ),
          this.newName
        );

        previewItem.createDiv({
          text: `${t('rename.previewAfter')}: ${afterPreview}`,
          cls: 'rename-preview-after',
        });
      });

      if (matches.length > 3) {
        previewSection.createDiv({
          text: `... and ${matches.length - 3} more matches`,
          cls: 'rename-more-matches',
        });
      }
    });

    // Options section
    const optionsSection = contentEl.createDiv({ cls: 'rename-options-section' });

    new Setting(optionsSection)
      .setName(t('rename.backup'))
      .setDesc('Create backup before modifying files')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.backupOnRename);
        this.createBackupCheckbox = toggle.toggleEl.querySelector('input');
        toggle.onChange(async (value) => {
          // Update the setting temporarily for this operation
          this.plugin.settings.backupOnRename = value;
        });
      });

    // Action buttons
    const buttonContainer = contentEl.createDiv({ cls: 'rename-button-container' });

    const replaceButton = new ButtonComponent(buttonContainer)
      .setButtonText(t('rename.replace'))
      .setCta()
      .onClick(() => this.handleReplace());

    // Fixed: Prefix unused variables with underscore
    new ButtonComponent(buttonContainer)
      .setButtonText(t('rename.skip'))
      .onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText(t('rename.cancel'))
      .onClick(() => this.handleCancel());

    // Store button references for state updates
    this.replaceButton = replaceButton;
    this.updateButtonStates();
  }

  private replaceButton: ButtonComponent | null = null;

  private updateButtonStates(): void {
    if (this.replaceButton !== null) {
      const hasSelection = this.selectedFiles.size > 0;
      this.replaceButton.setDisabled(!hasSelection);
    }
  }

  private async handleReplace(): Promise<void> {
    const selectedFileObjects = this.affectedFiles.filter(({ file }) =>
      this.selectedFiles.has(file.path)
    );

    if (selectedFileObjects.length === 0) {
      return;
    }

    this.close();
    await this.onConfirm(selectedFileObjects);
  }

  private async handleCancel(): Promise<void> {
    this.close();
    if (this.onCancel) {
      await this.onCancel();
    }
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

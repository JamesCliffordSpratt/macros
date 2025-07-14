import { App, Modal, Notice, Component } from 'obsidian';
import MacrosPlugin from '../../main';
import { t } from '../../lang/I18nManager';

export class CommentModal extends Modal {
  private plugin: MacrosPlugin;
  private onSubmit: (comment: string) => Promise<void>;
  private component: Component;
  private currentComment: string;
  private isEditing: boolean;
  private targetType: 'meal' | 'food-item';
  private targetName: string;

  constructor(
    app: App,
    plugin: MacrosPlugin,
    currentComment: string,
    targetType: 'meal' | 'food-item',
    targetName: string,
    onSubmit: (comment: string) => Promise<void>
  ) {
    super(app);
    this.plugin = plugin;
    this.currentComment = currentComment;
    this.isEditing = currentComment.length > 0;
    this.targetType = targetType;
    this.targetName = targetName;
    this.onSubmit = onSubmit;
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('comment-modal');

    // Create header
    const header = contentEl.createEl('div', {
      cls: 'modal-header macros-modal-header comment-modal-header',
    });
    const title = this.isEditing
      ? this.targetType === 'meal'
        ? t('comments.editMealComment')
        : t('comments.editItemComment')
      : this.targetType === 'meal'
        ? t('comments.addMealComment')
        : t('comments.addItemComment');

    header.createEl('h2', {
      text: title,
      cls: 'comment-modal-title',
    });

    // Create description
    const description = contentEl.createEl('div', {
      cls: 'modal-description macros-modal-description comment-modal-description',
    });
    const descriptionText =
      this.targetType === 'meal'
        ? t('comments.mealDescription', { mealName: this.targetName })
        : t('comments.itemDescription', { itemName: this.targetName });

    description.createEl('p', {
      text: descriptionText,
      cls: 'comment-description-text',
    });

    // Create input container
    const inputContainer = contentEl.createDiv({ cls: 'comment-input-container' });

    const inputLabel = inputContainer.createEl('label', {
      text: t('comments.commentLabel'),
      cls: 'comment-input-label',
    });

    const textarea = inputContainer.createEl('textarea', {
      cls: 'comment-input-textarea',
      attr: {
        placeholder:
          this.targetType === 'meal'
            ? t('comments.mealPlaceholder')
            : t('comments.itemPlaceholder'),
        rows: '3',
        maxlength: '200',
      },
    });

    textarea.value = this.currentComment;

    // Character count
    const charCount = inputContainer.createEl('div', {
      cls: 'comment-char-count',
      text: `${this.currentComment.length}/200`,
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
      cls: 'comment-button-container macros-button-container',
    });

    const cancelBtn = buttonContainer.createEl('button', {
      text: t('general.cancel'),
      cls: 'mod-button comment-cancel-btn',
    });

    const saveBtn = buttonContainer.createEl('button', {
      text: this.isEditing ? t('comments.updateComment') : t('comments.addComment'),
      cls: 'mod-button mod-cta comment-save-btn',
    });

    // If editing, add a remove button
    if (this.isEditing) {
      const removeBtn = buttonContainer.createEl('button', {
        text: t('comments.removeComment'),
        cls: 'mod-button mod-warning comment-remove-btn',
      });

      this.component.registerDomEvent(removeBtn, 'click', async () => {
        try {
          await this.onSubmit(''); // Empty string removes the comment
          new Notice(t('comments.commentRemoved'));
          this.close();
        } catch (error) {
          this.plugin.logger.error('Error removing comment:', error);
          new Notice(t('comments.removeError', { error: (error as Error).message }));
        }
      });
    }

    // Event handlers
    this.component.registerDomEvent(cancelBtn, 'click', () => {
      this.close();
    });

    this.component.registerDomEvent(saveBtn, 'click', async () => {
      const comment = textarea.value.trim();

      if (comment.length > 200) {
        new Notice(t('comments.tooLong'));
        return;
      }

      try {
        await this.onSubmit(comment);
        const successMsg = comment
          ? this.isEditing
            ? t('comments.commentUpdated')
            : t('comments.commentAdded')
          : t('comments.commentRemoved');
        new Notice(successMsg);
        this.close();
      } catch (error) {
        this.plugin.logger.error('Error saving comment:', error);
        new Notice(t('comments.saveError', { error: (error as Error).message }));
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

    // Focus and select text
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

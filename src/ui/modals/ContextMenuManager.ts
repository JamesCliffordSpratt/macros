import { Menu, MenuItem } from 'obsidian';
import MacrosPlugin from '../../main';
import { CommentModal } from './CommentModal';
import { TimestampModal } from './TimestampModal';
import { ToleranceModal, ToleranceData } from './ToleranceModal';
import { t } from '../../lang/I18nManager';

export interface CommentTarget {
  type: 'meal' | 'food-item';
  name: string;
  macroLine: string;
  macrosId: string;
  currentComment: string;
}

export interface TimestampTarget {
  type: 'meal' | 'food-item';
  name: string;
  macroLine: string;
  macrosId: string;
  currentTimestamp: string;
}

export class ContextMenuManager {
  private plugin: MacrosPlugin;

  constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
  }

  /**
   * Hide all active tooltips before showing context menu
   */
  private hideActiveTooltips(): void {
    const activeTooltips = document.querySelectorAll('.macro-tooltip');
    activeTooltips.forEach((tooltip) => {
      (tooltip as HTMLElement).style.display = 'none';
    });

    document.body.classList.add('context-menu-open');
  }

  /**
   * Re-enable tooltips after context menu closes
   */
  private restoreTooltips(): void {
    document.body.classList.remove('context-menu-open');

    const hiddenTooltips = document.querySelectorAll('.macro-tooltip');
    hiddenTooltips.forEach((tooltip) => {
      (tooltip as HTMLElement).style.display = '';
    });
  }

  /**
   * Apply plugin-specific styling to the menu element
   */
  private applyMenuStyling(): void {
    setTimeout(() => {
      const menuElement = document.querySelector('.menu');
      if (menuElement) {
        menuElement.setAttribute('data-macros-plugin', 'true');
      }
    }, 0);
  }

  /**
   * Parse comment from a macro line
   */
  private parseCommentFromLine(line: string): string {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return '';
    return line.substring(commentIndex + 2).trim();
  }

  /**
   * Parse timestamp from a macro line
   */
  private parseTimestampFromLine(line: string): string {
    const timestampMatch = line.match(/@(\d{2}:\d{2})/);
    return timestampMatch ? timestampMatch[1] : '';
  }

  /**
   * Get tolerance data for a food item
   */
  private getToleranceData(foodName: string): ToleranceData | null {
    return this.plugin.settings.foodTolerances?.[foodName.toLowerCase()] || null;
  }

  /**
   * Remove comment from a macro line
   */
  private removeCommentFromLine(line: string): string {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return line;
    return line.substring(0, commentIndex).trim();
  }

  /**
   * Remove timestamp from a macro line
   */
  private removeTimestampFromLine(line: string): string {
    return line.replace(/@\d{2}:\d{2}/g, '').trim();
  }

  /**
   * Add or update comment in a macro line while preserving timestamp
   */
  private addCommentToLine(line: string, comment: string): string {
    const timestamp = this.parseTimestampFromLine(line);
    let baseContent = this.removeCommentFromLine(line);
    baseContent = this.removeTimestampFromLine(baseContent);

    let newLine = baseContent;

    if (timestamp) {
      newLine += ` @${timestamp}`;
    }

    if (comment && comment.trim() !== '') {
      newLine += ` // ${comment.trim()}`;
    }

    return newLine;
  }

  /**
   * Add or update timestamp in a macro line while preserving comment
   */
  private addTimestampToLine(line: string, timestamp: string): string {
    const comment = this.parseCommentFromLine(line);
    let baseContent = this.removeCommentFromLine(line);
    baseContent = this.removeTimestampFromLine(baseContent);

    let newLine = baseContent;

    if (timestamp && timestamp.trim() !== '') {
      newLine += ` @${timestamp.trim()}`;
    }

    if (comment) {
      newLine += ` // ${comment}`;
    }

    return newLine;
  }

  /**
   * Show context menu for meal headers - UPDATED: Removed tolerance options
   */
  showMealContextMenu(
    event: MouseEvent,
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): void {
    event.preventDefault();
    event.stopPropagation();

    this.hideActiveTooltips();

    const menu = new Menu();
    const hasComment = target.currentComment.length > 0;
    const currentTimestamp = this.parseTimestampFromLine(target.macroLine);
    const hasTimestamp = currentTimestamp.length > 0;

    if (hasComment) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.editComment'))
          .setIcon('edit')
          .onClick(() => {
            this.showCommentModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.removeComment'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeComment(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.addComment'))
          .setIcon('message-square')
          .onClick(() => {
            this.showCommentModal(target, onCommentUpdate);
          })
      );
    }

    menu.addSeparator();

    if (hasTimestamp) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.editTimestamp'))
          .setIcon('clock')
          .onClick(() => {
            this.showTimestampModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.removeTimestamp'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeTimestamp(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.addTimestamp'))
          .setIcon('clock')
          .onClick(() => {
            this.showTimestampModal(target, onCommentUpdate);
          })
      );
    }

    const menuX = Math.min(event.clientX, window.innerWidth - 200);
    const menuY = Math.min(event.clientY, window.innerHeight - 150);

    const adjustedEvent = new MouseEvent('contextmenu', {
      clientX: menuX,
      clientY: menuY,
      bubbles: true,
      cancelable: true,
    });

    menu.showAtMouseEvent(adjustedEvent);
    this.applyMenuStyling();

    const originalHide = menu.hide.bind(menu);
    (menu as Menu & { hide: () => void }).hide = () => {
      this.restoreTooltips();
      return originalHide();
    };

    setTimeout(() => {
      if (!document.querySelector('.menu[data-macros-plugin="true"]')) {
        this.restoreTooltips();
      }
    }, 100);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains('menu') &&
            node.getAttribute('data-macros-plugin') === 'true'
          ) {
            this.restoreTooltips();
            observer.disconnect();
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      this.restoreTooltips();
    }, 5000);
  }

  /**
   * Show context menu for food item rows with improved positioning and tolerance support
   */
  showFoodItemContextMenu(
    event: MouseEvent,
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): void {
    event.preventDefault();
    event.stopPropagation();

    this.hideActiveTooltips();

    const menu = new Menu();
    const hasComment = target.currentComment.length > 0;
    const currentTimestamp = this.parseTimestampFromLine(target.macroLine);
    const hasTimestamp = currentTimestamp.length > 0;
    const currentTolerance = this.getToleranceData(target.name);
    const hasTolerance = currentTolerance !== null;

    if (hasComment) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.editComment'))
          .setIcon('edit')
          .onClick(() => {
            this.showCommentModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.removeComment'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeComment(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.addComment'))
          .setIcon('message-square')
          .onClick(() => {
            this.showCommentModal(target, onCommentUpdate);
          })
      );
    }

    menu.addSeparator();

    if (hasTimestamp) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.editTimestamp'))
          .setIcon('clock')
          .onClick(() => {
            this.showTimestampModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.removeTimestamp'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeTimestamp(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.addTimestamp'))
          .setIcon('clock')
          .onClick(() => {
            this.showTimestampModal(target, onCommentUpdate);
          })
      );
    }

    menu.addSeparator();

    if (hasTolerance) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('tolerances.contextMenu.editTolerance'))
          .setIcon('alert-triangle')
          .onClick(() => {
            this.showToleranceModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('tolerances.contextMenu.removeTolerance'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeTolerance(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('tolerances.contextMenu.addTolerance'))
          .setIcon('alert-triangle')
          .onClick(() => {
            this.showToleranceModal(target, onCommentUpdate);
          })
      );
    }

    const menuX = Math.min(event.clientX, window.innerWidth - 200);
    const menuY = Math.min(event.clientY, window.innerHeight - 250);

    const adjustedEvent = new MouseEvent('contextmenu', {
      clientX: menuX,
      clientY: menuY,
      bubbles: true,
      cancelable: true,
    });

    menu.showAtMouseEvent(adjustedEvent);
    this.applyMenuStyling();

    const originalHide = menu.hide.bind(menu);
    (menu as Menu & { hide: () => void }).hide = () => {
      this.restoreTooltips();
      return originalHide();
    };

    setTimeout(() => {
      if (!document.querySelector('.menu[data-macros-plugin="true"]')) {
        this.restoreTooltips();
      }
    }, 100);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains('menu') &&
            node.getAttribute('data-macros-plugin') === 'true'
          ) {
            this.restoreTooltips();
            observer.disconnect();
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      this.restoreTooltips();
    }, 5000);
  }

  /**
   * Enhanced context menu for food items with remove option and tolerance support
   */
  showEnhancedFoodItemContextMenu(
    event: MouseEvent,
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>,
    onRemoveItem: () => Promise<void>,
    isMealItem = false,
    containerName = ''
  ): void {
    event.preventDefault();
    event.stopPropagation();

    this.hideActiveTooltips();

    const menu = new Menu();
    const hasComment = target.currentComment.length > 0;
    const currentTimestamp = this.parseTimestampFromLine(target.macroLine);
    const hasTimestamp = currentTimestamp.length > 0;
    const currentTolerance = this.getToleranceData(target.name);
    const hasTolerance = currentTolerance !== null;

    if (hasComment) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.editComment'))
          .setIcon('edit')
          .onClick(() => {
            this.showCommentModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.removeComment'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeComment(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('comments.contextMenu.addComment'))
          .setIcon('message-square')
          .onClick(() => {
            this.showCommentModal(target, onCommentUpdate);
          })
      );
    }

    menu.addSeparator();

    if (hasTimestamp) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.editTimestamp'))
          .setIcon('clock')
          .onClick(() => {
            this.showTimestampModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.removeTimestamp'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeTimestamp(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('timestamps.contextMenu.addTimestamp'))
          .setIcon('clock')
          .onClick(() => {
            this.showTimestampModal(target, onCommentUpdate);
          })
      );
    }

    menu.addSeparator();

    if (hasTolerance) {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('tolerances.contextMenu.editTolerance'))
          .setIcon('alert-triangle')
          .onClick(() => {
            this.showToleranceModal(target, onCommentUpdate);
          })
      );

      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('tolerances.contextMenu.removeTolerance'))
          .setIcon('trash-2')
          .onClick(() => {
            this.removeTolerance(target, onCommentUpdate);
          })
      );
    } else {
      menu.addItem((item: MenuItem) =>
        item
          .setTitle(t('tolerances.contextMenu.addTolerance'))
          .setIcon('alert-triangle')
          .onClick(() => {
            this.showToleranceModal(target, onCommentUpdate);
          })
      );
    }

    menu.addSeparator();

    const cleanItemName = this.removeCommentFromLine(this.removeTimestampFromLine(target.name));
    const cleanContainerName = this.removeCommentFromLine(
      this.removeTimestampFromLine(containerName)
    );

    const removeText = isMealItem
      ? t('table.actions.removeFromMeal', { itemName: cleanItemName, mealName: cleanContainerName })
      : t('table.actions.removeItem');

    menu.addItem((item: MenuItem) =>
      item
        .setTitle(removeText)
        .setIcon('trash')
        .onClick(async () => {
          try {
            await onRemoveItem();
          } catch (error) {
            console.error('Error removing item from context menu:', error);
          }
        })
    );

    const menuX = Math.min(event.clientX, window.innerWidth - 200);
    const menuY = Math.min(event.clientY, window.innerHeight - 300);

    const adjustedEvent = new MouseEvent('contextmenu', {
      clientX: menuX,
      clientY: menuY,
      bubbles: true,
      cancelable: true,
    });

    menu.showAtMouseEvent(adjustedEvent);
    this.applyMenuStyling();

    const originalHide = menu.hide.bind(menu);
    (menu as Menu & { hide: () => void }).hide = () => {
      this.restoreTooltips();
      return originalHide();
    };

    setTimeout(() => {
      if (!document.querySelector('.menu[data-macros-plugin="true"]')) {
        this.restoreTooltips();
      }
    }, 100);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains('menu') &&
            node.getAttribute('data-macros-plugin') === 'true'
          ) {
            this.restoreTooltips();
            observer.disconnect();
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      this.restoreTooltips();
    }, 5000);
  }

  private showCommentModal(target: CommentTarget, onCommentUpdate: () => Promise<void>): void {
    const modal = new CommentModal(
      this.plugin.app,
      this.plugin,
      target.currentComment,
      target.type,
      target.name,
      async (newComment: string) => {
        await this.updateComment(target, newComment);
        await onCommentUpdate();
      }
    );

    modal.open();
  }

  private showTimestampModal(target: CommentTarget, onCommentUpdate: () => Promise<void>): void {
    const currentTimestamp = this.parseTimestampFromLine(target.macroLine);

    const modal = new TimestampModal(
      this.plugin.app,
      this.plugin,
      currentTimestamp,
      target.type,
      target.name,
      async (newTimestamp: string) => {
        await this.updateTimestamp(target, newTimestamp);
        await onCommentUpdate();
      }
    );

    modal.open();
  }

  private showToleranceModal(target: CommentTarget, onCommentUpdate: () => Promise<void>): void {
    const currentTolerance = this.getToleranceData(target.name);

    const modal = new ToleranceModal(
      this.plugin.app,
      this.plugin,
      currentTolerance,
      target.type,
      target.name,
      async (newTolerance: ToleranceData | null) => {
        await this.updateTolerance(target, newTolerance);
        await onCommentUpdate();
      }
    );

    modal.open();
  }

  private async removeComment(
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): Promise<void> {
    try {
      await this.updateComment(target, '');
      await onCommentUpdate();
    } catch (error) {
      this.plugin.logger.error('Error removing comment:', error);
      throw error;
    }
  }

  private async removeTimestamp(
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): Promise<void> {
    try {
      await this.updateTimestamp(target, '');
      await onCommentUpdate();
    } catch (error) {
      this.plugin.logger.error('Error removing timestamp:', error);
      throw error;
    }
  }

  private async removeTolerance(
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): Promise<void> {
    try {
      await this.updateTolerance(target, null);
      await onCommentUpdate();
    } catch (error) {
      this.plugin.logger.error('Error removing tolerance:', error);
      throw error;
    }
  }

  private async updateComment(target: CommentTarget, newComment: string): Promise<void> {
    try {
      const context = await this.plugin.dataManager.getDocumentContext(target.macrosId);

      if (!context || context.allLines.length === 0) {
        throw new Error('Could not load macros data');
      }

      const updatedLines = [...context.allLines];
      let lineFound = false;

      if (target.type === 'meal') {
        for (let i = 0; i < updatedLines.length; i++) {
          const line = updatedLines[i];
          if (line.toLowerCase().startsWith('meal:') || line.toLowerCase().startsWith('group:')) {
            const prefix = line.toLowerCase().startsWith('meal:') ? 'meal:' : 'group:';
            const baseName = this.removeCommentFromLine(
              this.removeTimestampFromLine(line.substring(prefix.length).trim())
            );
            const cleanTargetName = this.removeCommentFromLine(
              this.removeTimestampFromLine(target.name)
            );

            if (baseName.toLowerCase() === cleanTargetName.toLowerCase()) {
              const newLine = this.addCommentToLine(line, newComment);
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          }
        }
      } else {
        for (let i = 0; i < updatedLines.length; i++) {
          const line = updatedLines[i];

          if (line.startsWith('-')) {
            const itemText = line.substring(1).trim();
            const baseFoodName = this.extractFoodName(
              this.removeCommentFromLine(this.removeTimestampFromLine(itemText))
            );
            const cleanTargetName = this.removeCommentFromLine(
              this.removeTimestampFromLine(target.name)
            );

            if (baseFoodName.toLowerCase() === cleanTargetName.toLowerCase()) {
              const newItemText = this.addCommentToLine(itemText, newComment);
              const newLine = `- ${newItemText}`;
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          } else if (
            !line.toLowerCase().startsWith('meal:') &&
            !line.toLowerCase().startsWith('group:') &&
            !line.toLowerCase().startsWith('id:')
          ) {
            const baseFoodName = this.extractFoodName(
              this.removeCommentFromLine(this.removeTimestampFromLine(line))
            );
            const cleanTargetName = this.removeCommentFromLine(
              this.removeTimestampFromLine(target.name)
            );

            if (baseFoodName.toLowerCase() === cleanTargetName.toLowerCase()) {
              const newLine = this.addCommentToLine(line, newComment);
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          }
        }
      }

      if (!lineFound) {
        throw new Error(`Could not find ${target.type} "${target.name}" in macros block`);
      }

      const success = await this.plugin.dataManager.updateMacrosBlock(
        target.macrosId,
        updatedLines
      );

      if (!success) {
        throw new Error('Failed to update macros block');
      }
    } catch (error) {
      this.plugin.logger.error('Error updating comment:', error);
      throw error;
    }
  }

  private async updateTimestamp(target: CommentTarget, newTimestamp: string): Promise<void> {
    try {
      const context = await this.plugin.dataManager.getDocumentContext(target.macrosId);

      if (!context || context.allLines.length === 0) {
        throw new Error('Could not load macros data');
      }

      const updatedLines = [...context.allLines];
      let lineFound = false;

      if (target.type === 'meal') {
        for (let i = 0; i < updatedLines.length; i++) {
          const line = updatedLines[i];
          if (line.toLowerCase().startsWith('meal:') || line.toLowerCase().startsWith('group:')) {
            const prefix = line.toLowerCase().startsWith('meal:') ? 'meal:' : 'group:';
            const baseName = this.removeCommentFromLine(
              this.removeTimestampFromLine(line.substring(prefix.length).trim())
            );
            const cleanTargetName = this.removeCommentFromLine(
              this.removeTimestampFromLine(target.name)
            );

            if (baseName.toLowerCase() === cleanTargetName.toLowerCase()) {
              const newLine = this.addTimestampToLine(line, newTimestamp);
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          }
        }
      } else {
        for (let i = 0; i < updatedLines.length; i++) {
          const line = updatedLines[i];

          if (line.startsWith('-')) {
            const itemText = line.substring(1).trim();
            const baseFoodName = this.extractFoodName(
              this.removeCommentFromLine(this.removeTimestampFromLine(itemText))
            );
            const cleanTargetName = this.removeCommentFromLine(
              this.removeTimestampFromLine(target.name)
            );

            if (baseFoodName.toLowerCase() === cleanTargetName.toLowerCase()) {
              const newItemText = this.addTimestampToLine(itemText, newTimestamp);
              const newLine = `- ${newItemText}`;
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          } else if (
            !line.toLowerCase().startsWith('meal:') &&
            !line.toLowerCase().startsWith('group:') &&
            !line.toLowerCase().startsWith('id:')
          ) {
            const baseFoodName = this.extractFoodName(
              this.removeCommentFromLine(this.removeTimestampFromLine(line))
            );
            const cleanTargetName = this.removeCommentFromLine(
              this.removeTimestampFromLine(target.name)
            );

            if (baseFoodName.toLowerCase() === cleanTargetName.toLowerCase()) {
              const newLine = this.addTimestampToLine(line, newTimestamp);
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          }
        }
      }

      if (!lineFound) {
        throw new Error(`Could not find ${target.type} "${target.name}" in macros block`);
      }

      const success = await this.plugin.dataManager.updateMacrosBlock(
        target.macrosId,
        updatedLines
      );

      if (!success) {
        throw new Error('Failed to update macros block');
      }
    } catch (error) {
      this.plugin.logger.error('Error updating timestamp:', error);
      throw error;
    }
  }

  private async updateTolerance(
    target: CommentTarget,
    newTolerance: ToleranceData | null
  ): Promise<void> {
    try {
      if (!this.plugin.settings.foodTolerances) {
        this.plugin.settings.foodTolerances = {};
      }

      const foodKey = target.name.toLowerCase();

      if (newTolerance === null) {
        delete this.plugin.settings.foodTolerances[foodKey];
      } else {
        this.plugin.settings.foodTolerances[foodKey] = newTolerance;
      }

      await this.plugin.saveSettings();
    } catch (error) {
      this.plugin.logger.error('Error updating tolerance:', error);
      throw error;
    }
  }

  private extractFoodName(line: string): string {
    if (line.includes(':')) {
      return line.split(':')[0].trim();
    }
    return line.trim();
  }

  createCommentTarget(
    element: HTMLElement,
    macrosId: string,
    type: 'meal' | 'food-item'
  ): CommentTarget | null {
    try {
      if (type === 'meal') {
        const headerLabel = element.querySelector('.header-label');
        if (!headerLabel) return null;

        const mealName = headerLabel.textContent?.trim() || '';
        const macroLine = element.dataset.macroLine || '';
        const currentComment = this.parseCommentFromLine(macroLine);

        return {
          type: 'meal',
          name: mealName,
          macroLine,
          macrosId,
          currentComment,
        };
      } else {
        const foodName = element.dataset.foodName || '';
        const macroLine = element.dataset.macroLine || '';
        const currentComment = this.parseCommentFromLine(macroLine);

        return {
          type: 'food-item',
          name: foodName,
          macroLine,
          macrosId,
          currentComment,
        };
      }
    } catch (error) {
      this.plugin.logger.error('Error creating comment target:', error);
      return null;
    }
  }
}

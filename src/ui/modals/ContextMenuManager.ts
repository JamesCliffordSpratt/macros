import { Menu, MenuItem } from 'obsidian';
import MacrosPlugin from '../../main';
import { CommentModal } from './CommentModal';
import { t } from '../../lang/I18nManager';

export interface CommentTarget {
  type: 'meal' | 'food-item';
  name: string;
  macroLine: string;
  macrosId: string;
  currentComment: string;
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
    // Hide any active tooltips
    const activeTooltips = document.querySelectorAll('.macro-tooltip');
    activeTooltips.forEach((tooltip) => {
      (tooltip as HTMLElement).style.display = 'none';
    });

    // Add class to body to prevent new tooltips
    document.body.classList.add('context-menu-open');
  }

  /**
   * Re-enable tooltips after context menu closes
   */
  private restoreTooltips(): void {
    // Remove the class that prevents tooltips
    document.body.classList.remove('context-menu-open');

    // Restore hidden tooltips
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
   * @param line The macro line text
   * @returns The comment text (without //) or empty string if no comment
   */
  private parseCommentFromLine(line: string): string {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return '';

    return line.substring(commentIndex + 2).trim();
  }

  /**
   * Remove comment from a macro line
   * @param line The macro line text
   * @returns The line without the comment
   */
  private removeCommentFromLine(line: string): string {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return line;

    return line.substring(0, commentIndex).trim();
  }

  /**
   * Add or update comment in a macro line
   * @param line The macro line text
   * @param comment The comment to add
   * @returns The line with the comment added/updated
   */
  private addCommentToLine(line: string, comment: string): string {
    // Remove existing comment first
    const baseContent = this.removeCommentFromLine(line);

    // If comment is empty, just return the base content
    if (!comment || comment.trim() === '') {
      return baseContent;
    }

    // Add the new comment
    return `${baseContent} // ${comment.trim()}`;
  }

  /**
   * Show context menu for meal headers with improved positioning
   */
  showMealContextMenu(
    event: MouseEvent,
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): void {
    event.preventDefault();
    event.stopPropagation();

    // Hide tooltips before showing context menu
    this.hideActiveTooltips();

    const menu = new Menu();
    const hasComment = target.currentComment.length > 0;

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

    // Calculate better positioning to avoid conflicts
    const menuX = Math.min(event.clientX, window.innerWidth - 200); // Prevent overflow
    const menuY = Math.min(event.clientY, window.innerHeight - 150); // Prevent overflow

    // Create a custom event with adjusted coordinates
    const adjustedEvent = new MouseEvent('contextmenu', {
      clientX: menuX,
      clientY: menuY,
      bubbles: true,
      cancelable: true,
    });

    // Show menu and handle cleanup
    menu.showAtMouseEvent(adjustedEvent);

    // Apply plugin-specific styling
    this.applyMenuStyling();

    // Set up cleanup when menu closes
    const originalHide = menu.hide.bind(menu);
    (menu as Menu & { hide: () => void }).hide = () => {
      this.restoreTooltips();
      return originalHide();
    };

    // Also restore tooltips if menu is cancelled
    setTimeout(() => {
      if (!document.querySelector('.menu[data-macros-plugin="true"]')) {
        this.restoreTooltips();
      }
    }, 100);

    // Alternative approach: Listen for when the menu DOM element is removed
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

    // Start observing
    observer.observe(document.body, { childList: true, subtree: true });

    // Cleanup observer after a reasonable timeout
    setTimeout(() => {
      observer.disconnect();
      this.restoreTooltips();
    }, 5000);
  }

  /**
   * Show context menu for food item rows with improved positioning
   */
  showFoodItemContextMenu(
    event: MouseEvent,
    target: CommentTarget,
    onCommentUpdate: () => Promise<void>
  ): void {
    // Same implementation as meal context menu for consistency
    this.showMealContextMenu(event, target, onCommentUpdate);
  }

  /**
   * NEW: Enhanced context menu for food items with remove option
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

    // Hide tooltips before showing context menu
    this.hideActiveTooltips();

    const menu = new Menu();
    const hasComment = target.currentComment.length > 0;

    // Comment options
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

    // Add separator
    menu.addSeparator();

    // Remove item option - FIX: Clean the names before displaying
    const cleanItemName = this.removeCommentFromLine(target.name);
    const cleanContainerName = this.removeCommentFromLine(containerName);

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

    // Calculate better positioning to avoid conflicts
    const menuX = Math.min(event.clientX, window.innerWidth - 200);
    const menuY = Math.min(event.clientY, window.innerHeight - 200); // More space for larger menu

    // Create a custom event with adjusted coordinates
    const adjustedEvent = new MouseEvent('contextmenu', {
      clientX: menuX,
      clientY: menuY,
      bubbles: true,
      cancelable: true,
    });

    // Show menu and handle cleanup
    menu.showAtMouseEvent(adjustedEvent);

    // Apply plugin-specific styling
    this.applyMenuStyling();

    // Set up cleanup when menu closes
    const originalHide = menu.hide.bind(menu);
    // FIX: Use proper type instead of any - Menu type for proper binding
    (menu as Menu & { hide: () => void }).hide = () => {
      this.restoreTooltips();
      return originalHide();
    };

    // Also restore tooltips if menu is cancelled
    setTimeout(() => {
      if (!document.querySelector('.menu[data-macros-plugin="true"]')) {
        this.restoreTooltips();
      }
    }, 100);

    // Listen for when the menu DOM element is removed
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

    // Start observing
    observer.observe(document.body, { childList: true, subtree: true });

    // Cleanup observer after a reasonable timeout
    setTimeout(() => {
      observer.disconnect();
      this.restoreTooltips();
    }, 5000);
  }

  /**
   * Show the comment modal
   */
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

  /**
   * Remove a comment from a target
   */
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

  /**
   * Update a comment in the macros block
   */
  private async updateComment(target: CommentTarget, newComment: string): Promise<void> {
    try {
      // Get the current document context
      const context = await this.plugin.dataManager.getDocumentContext(target.macrosId);

      if (!context || context.allLines.length === 0) {
        throw new Error('Could not load macros data');
      }

      // Create updated lines
      const updatedLines = [...context.allLines];
      let lineFound = false;

      if (target.type === 'meal') {
        // Find and update the meal line
        for (let i = 0; i < updatedLines.length; i++) {
          const line = updatedLines[i];
          if (line.toLowerCase().startsWith('meal:')) {
            const baseMealName = this.removeCommentFromLine(line.substring(5).trim());
            if (baseMealName.toLowerCase() === target.name.toLowerCase()) {
              const newMealLine = newComment
                ? `meal:${baseMealName} // ${newComment}`
                : `meal:${baseMealName}`;
              updatedLines[i] = newMealLine;
              lineFound = true;
              break;
            }
          }
        }
      } else {
        // Find and update the food item line (either standalone or bullet point)
        for (let i = 0; i < updatedLines.length; i++) {
          const line = updatedLines[i];

          if (line.startsWith('-')) {
            // Bullet point food item
            const itemText = line.substring(1).trim();
            const baseFoodName = this.extractFoodName(this.removeCommentFromLine(itemText));

            if (baseFoodName.toLowerCase() === target.name.toLowerCase()) {
              const baseItemText = this.removeCommentFromLine(itemText);
              const newLine = newComment
                ? `- ${baseItemText} // ${newComment}`
                : `- ${baseItemText}`;
              updatedLines[i] = newLine;
              lineFound = true;
              break;
            }
          } else if (
            !line.toLowerCase().startsWith('meal:') &&
            !line.toLowerCase().startsWith('id:')
          ) {
            // Standalone food item
            const baseFoodName = this.extractFoodName(this.removeCommentFromLine(line));

            if (baseFoodName.toLowerCase() === target.name.toLowerCase()) {
              const baseLine = this.removeCommentFromLine(line);
              const newLine = newComment ? `${baseLine} // ${newComment}` : baseLine;
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

      // Update the macros block
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

  /**
   * Extract the food name from a macro line, handling potential quantities
   */
  private extractFoodName(line: string): string {
    if (line.includes(':')) {
      return line.split(':')[0].trim();
    }
    return line.trim();
  }

  /**
   * Create a CommentTarget from DOM elements and context
   */
  createCommentTarget(
    element: HTMLElement,
    macrosId: string,
    type: 'meal' | 'food-item'
  ): CommentTarget | null {
    try {
      if (type === 'meal') {
        // For meal headers, extract meal name from the header content
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
        // For food items, extract from the row data
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

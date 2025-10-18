import { TFile, EventRef } from 'obsidian';
import MacrosPlugin from '../main';
import { RenameConfirmationModal } from '../ui/modals/RenameConfirmationModal';
import { scanVaultForFoodReferences, createBackup } from '../utils/rename';
import { t } from '../lang/I18nManager';

/**
 * RenameWatcher
 * -------------
 * Listens for file rename events in the vault and handles updating macro references
 * when food files in the nutrition folder are renamed.
 *
 * Updated to use the storage folder setting instead of a separate renameScopeFolder.
 */
export class RenameWatcher {
  private plugin: MacrosPlugin;
  private renameEventRef: EventRef | null = null;

  constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
  }

  /**
   * Initialize the rename watcher
   */
  init(): void {
    // Listen for file rename events
    this.renameEventRef = this.plugin.app.vault.on('rename', this.handleFileRename.bind(this));
    this.plugin.registerEvent(this.renameEventRef);

    this.plugin.logger.debug('RenameWatcher initialized');
  }

  /**
   * Handle file rename events
   */
  private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
    try {
      // Only proceed if rename tracking is enabled
      if (!this.plugin.settings.followRenamesEnabled) {
        return;
      }

      // Only handle markdown files
      if (file.extension !== 'md') {
        return;
      }

      // Get the storage folder from settings (this is the nutrition folder)
      const nutritionFolder = this.plugin.settings.storageFolder;

      // Check if the file is in the nutrition folder
      if (!oldPath.startsWith(nutritionFolder)) {
        return;
      }

      // Extract old and new names (without extension)
      const oldName = this.getBaseName(oldPath);
      const newName = this.getBaseName(file.path);

      // Skip if names are the same (shouldn't happen, but safety check)
      if (oldName === newName) {
        return;
      }

      this.plugin.logger.debug(`Food file renamed: ${oldName} -> ${newName}`);

      // Scan vault for references to the old food name
      // Use the storage folder as the exclude folder to avoid matching the food file itself
      const affectedFiles = await scanVaultForFoodReferences(
        this.plugin.app.vault,
        oldName,
        this.plugin.settings.caseSensitiveFoodMatch,
        nutritionFolder
      );

      if (affectedFiles.length === 0) {
        // No references found, show notice and exit
        this.plugin.app.workspace.trigger('notice', t('rename.noMatches'));
        return;
      }

      // If auto-confirm is enabled, proceed directly
      if (this.plugin.settings.autoConfirmRenames) {
        await this.performRename(oldName, newName, affectedFiles);
      } else {
        // Show confirmation modal
        const modal = new RenameConfirmationModal(
          this.plugin,
          oldName,
          newName,
          affectedFiles,
          (selectedFiles) => this.performRename(oldName, newName, selectedFiles),
          () => this.revertFileRename(file, oldPath) // Add cancel callback
        );
        modal.open();
      }
    } catch (error) {
      this.plugin.logger.error('Error handling file rename:', error);
      this.plugin.app.workspace.trigger('notice', t('rename.error', { error: error.message }));
    }
  }

  /**
   * Perform the actual rename operation
   */
  private async performRename(
    oldName: string,
    newName: string,
    affectedFiles: Array<{
      file: TFile;
      matches: Array<{ line: number; content: string; preview: string }>;
    }>
  ): Promise<void> {
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const { file, matches } of affectedFiles) {
        try {
          // Create backup if enabled
          if (this.plugin.settings.backupOnRename) {
            await createBackup(this.plugin.app.vault, file);
          }

          // Read current file content
          const content = await this.plugin.app.vault.cachedRead(file);
          const lines = content.split('\n');

          // Apply replacements
          let modified = false;
          for (const match of matches) {
            const lineIndex = match.line - 1; // Convert to 0-based index
            if (lineIndex >= 0 && lineIndex < lines.length) {
              const oldLine = lines[lineIndex];
              const newLine = this.replaceFoodNameInLine(
                oldLine,
                oldName,
                newName,
                this.plugin.settings.caseSensitiveFoodMatch
              );

              if (newLine !== oldLine) {
                lines[lineIndex] = newLine;
                modified = true;
              }
            }
          }

          // Write back if modified
          if (modified) {
            const newContent = lines.join('\n');
            await this.plugin.app.vault.process(file, () => newContent);
            successCount++;
          }
        } catch (error) {
          this.plugin.logger.error(`Error updating file ${file.path}:`, error);
          errorCount++;
        }
      }

      // Show success/error summary
      if (successCount > 0) {
        this.plugin.app.workspace.trigger(
          'notice',
          t('rename.success', { count: successCount, oldName, newName })
        );
      }

      if (errorCount > 0) {
        this.plugin.app.workspace.trigger(
          'notice',
          t('rename.error', { error: `${errorCount} files failed to update` })
        );
      }
    } catch (error) {
      this.plugin.logger.error('Error performing rename operation:', error);
      this.plugin.app.workspace.trigger('notice', t('rename.error', { error: error.message }));
    }
  }

  /**
   * Replace food name in a single line, preserving formatting
   */
  private replaceFoodNameInLine(
    line: string,
    oldName: string,
    newName: string,
    caseSensitive: boolean
  ): string {
    // Escape special regex characters in the old name
    const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create regex pattern to match food key before first colon
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = new RegExp(`^(\\s*(?:[-*]\\s*)?)${escapedOldName}(\\s*:\\s*)(.*)$`, flags);

    return line.replace(pattern, `$1${newName}$2$3`);
  }

  /**
   * Extract base name from file path (without extension)
   */
  private getBaseName(path: string): string {
    const fileName = path.split('/').pop() || '';
    return fileName.replace(/\.md$/, '');
  }

  /**
   * Revert a file rename back to its original name
   */
  private async revertFileRename(file: TFile, originalPath: string): Promise<void> {
    try {
      this.plugin.logger.debug(`Reverting file rename: ${file.path} -> ${originalPath}`);

      // Rename the file back to its original path
      await this.plugin.app.vault.rename(file, originalPath);

      this.plugin.app.workspace.trigger(
        'notice',
        t('rename.cancelled', { fileName: this.getBaseName(originalPath) })
      );
    } catch (error) {
      this.plugin.logger.error('Error reverting file rename:', error);
      this.plugin.app.workspace.trigger(
        'notice',
        t('rename.revertError', { error: error.message })
      );
    }
  }

  /**
   * Cleanup when plugin is unloaded
   */
  cleanup(): void {
    if (this.renameEventRef) {
      this.plugin.app.vault.offref(this.renameEventRef);
      this.renameEventRef = null;
    }

    this.plugin.logger.debug('RenameWatcher cleaned up');
  }
}

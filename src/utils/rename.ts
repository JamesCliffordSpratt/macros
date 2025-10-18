import { Vault, TFile, normalizePath } from 'obsidian';

interface MatchResult {
  line: number;
  content: string;
  preview: string;
}

interface AffectedFile {
  file: TFile;
  matches: MatchResult[];
}

/**
 * Scan the vault for files containing references to a food name in macro blocks
 */
export async function scanVaultForFoodReferences(
  vault: Vault,
  foodName: string,
  caseSensitive: boolean,
  excludeFolder: string
): Promise<AffectedFile[]> {
  const affectedFiles: AffectedFile[] = [];
  const markdownFiles = vault.getMarkdownFiles();

  // Escape special regex characters in food name
  const escapedFoodName = escapeRegExp(foodName);

  // Create regex for food key matching (before first colon)
  const flags = caseSensitive ? 'g' : 'gi';
  const foodKeyRegex = new RegExp(`^(\\s*(?:[-*]\\s*)?)${escapedFoodName}(\\s*:\\s*)(.*)$`, flags);

  for (const file of markdownFiles) {
    // Skip files in the exclude folder (the nutrition folder itself)
    if (file.path.startsWith(excludeFolder)) {
      continue;
    }

    try {
      const content = await vault.cachedRead(file);
      const lines = content.split('\n');
      const matches: MatchResult[] = [];

      let inMacroBlock = false;
      let blockType = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        // Check for start of macro block
        const fenceMatch = line.match(/^\s*(```|~~~)\s*(macros|macroscalc)\b.*$/i);
        if (fenceMatch && !inMacroBlock) {
          inMacroBlock = true;
          blockType = fenceMatch[1]; // Store the fence type (``` or ~~~)
          continue;
        }

        // Check for end of macro block
        if (inMacroBlock && line.match(new RegExp(`^\\s*${escapeRegExp(blockType)}\\s*$`))) {
          inMacroBlock = false;
          blockType = '';
          continue;
        }

        // If we're in a macro block, check for food name matches
        if (inMacroBlock) {
          const match = line.match(foodKeyRegex);
          if (match) {
            matches.push({
              line: lineNumber,
              content: line,
              preview: truncatePreview(line, 120),
            });
          }
        }
      }

      if (matches.length > 0) {
        affectedFiles.push({ file, matches });
      }
    } catch (error) {
      console.error(`Error reading file ${file.path}:`, error);
    }
  }

  return affectedFiles;
}

/**
 * Create a backup of a file before modification
 */
export async function createBackup(vault: Vault, file: TFile): Promise<void> {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Create backup path
    const backupDir = '.macros-backups';
    const dateDirPath = normalizePath(`${backupDir}/${dateStr}`);
    const backupPath = normalizePath(`${dateDirPath}/${file.path}`);

    // Ensure backup directory structure exists
    const backupDirParts = backupPath.split('/');
    backupDirParts.pop(); // Remove filename

    let currentPath = '';
    for (const part of backupDirParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const normalizedPath = normalizePath(currentPath);

      if (!(await vault.adapter.exists(normalizedPath))) {
        await vault.adapter.mkdir(normalizedPath);
      }
    }

    // Read original content and write backup
    const content = await vault.cachedRead(file);
    await vault.adapter.write(backupPath, content);
  } catch (error) {
    console.error(`Error creating backup for ${file.path}:`, error);
    throw error;
  }
}

/**
 * Replace food name in macro block lines
 */
export function replaceFoodNameInLine(
  line: string,
  oldName: string,
  newName: string,
  caseSensitive: boolean
): string {
  const escapedOldName = escapeRegExp(oldName);
  const flags = caseSensitive ? 'g' : 'gi';

  // Pattern to match food key before first colon, preserving indentation and bullets
  const pattern = new RegExp(`^(\\s*(?:[-*]\\s*)?)${escapedOldName}(\\s*:\\s*)(.*)$`, flags);

  return line.replace(pattern, `$1${newName}$2$3`);
}

/**
 * Check if a line is within a macro code block
 */
export function isInMacroBlock(
  lines: string[],
  targetLineIndex: number
): { inBlock: boolean; blockType: string } {
  let inBlock = false;
  let blockType = '';

  for (let i = 0; i <= targetLineIndex; i++) {
    const line = lines[i];

    // Check for start of macro block
    const fenceMatch = line.match(/^\s*(```|~~~)\s*(macros|macroscalc)\b.*$/i);
    if (fenceMatch && !inBlock) {
      inBlock = true;
      blockType = fenceMatch[1];
      continue;
    }

    // Check for end of macro block
    if (inBlock && line.match(new RegExp(`^\\s*${escapeRegExp(blockType)}\\s*$`))) {
      inBlock = false;
      blockType = '';
    }
  }

  return { inBlock, blockType };
}

/**
 * Extract food names from macro block content
 */
export function extractFoodNamesFromBlock(blockContent: string[]): string[] {
  const foodNames: string[] = [];

  for (const line of blockContent) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Match food entries (name before first colon)
    const match = line.match(/^\s*(?:[-*]\s*)?([^:]+):/);
    if (match) {
      const foodName = match[1].trim();
      if (foodName && !foodNames.includes(foodName)) {
        foodNames.push(foodName);
      }
    }
  }

  return foodNames;
}

/**
 * Validate that a food name replacement is safe
 */
export function validateFoodNameReplacement(
  oldName: string,
  newName: string,
  existingFoodNames: string[],
  caseSensitive: boolean
): { valid: boolean; reason?: string } {
  // Check if new name is empty
  if (!newName.trim()) {
    return { valid: false, reason: 'New name cannot be empty' };
  }

  // Check if new name already exists
  const compareFunc = caseSensitive
    ? (a: string, b: string) => a === b
    : (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const nameExists = existingFoodNames.some(
    (name) => compareFunc(name, newName) && !compareFunc(name, oldName)
  );

  if (nameExists) {
    return { valid: false, reason: `Food name "${newName}" already exists` };
  }

  // Check for problematic characters
  if (newName.includes(':')) {
    return { valid: false, reason: 'Food name cannot contain colon (:)' };
  }

  return { valid: true };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Truncate text for preview display
 */
function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get all food names from a macro block
 * Fixed: Removed async promise executor anti-pattern
 */
export function getAllFoodNamesFromVault(vault: Vault, nutritionFolder: string): Promise<string[]> {
  // Convert to async function instead of using async promise executor
  return getAllFoodNamesFromVaultAsync(vault, nutritionFolder);
}

/**
 * Helper function to get all food names from vault (async implementation)
 */
async function getAllFoodNamesFromVaultAsync(
  vault: Vault,
  nutritionFolder: string
): Promise<string[]> {
  const foodNames: string[] = [];
  const markdownFiles = vault.getMarkdownFiles();

  for (const file of markdownFiles) {
    if (file.path.startsWith(nutritionFolder)) {
      // Extract food name from filename (without extension)
      const fileName = file.name.replace(/\.md$/, '');
      if (fileName && !foodNames.includes(fileName)) {
        foodNames.push(fileName);
      }
    }
  }

  return foodNames;
}

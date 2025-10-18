import { TFolder, TFile, normalizePath } from 'obsidian';
import MacrosPlugin from '../main';
import { processNutritionalData } from '../utils/nutritionUtils';

// Constant used for interactive lines in macros blocks.
const INTERACTIVE_PREFIX = 'interactive:';

// Type definitions for the structured data
interface MacrosStructure {
  meals: Map<string, Map<string, number>>; // mealName -> (foodName -> quantity)
  individualItems: Map<string, number>; // foodName -> quantity
}

interface NewItemsStructure {
  meals: Map<string, Map<string, number>>;
  individualItems: Map<string, number>;
}

// FIX: Add proper type for active renderers instead of any
interface MacroTotals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface CalcBreakdown {
  id: string;
  totals: MacroTotals;
}

interface MacrosCalcRenderer {
  el: HTMLElement;
  getIds: () => string[];
  render: (aggregate: MacroTotals, breakdown: CalcBreakdown[]) => Promise<void>;
  setNeedsRefresh?: () => void;
}

/**
 * DataManager
 * -----------
 * Manages all data-related operations for the Macros Plugin,
 * including cache management, file operations, and data fetching.
 */
export class DataManager {
  private plugin: MacrosPlugin;

  // Maps and caches moved from main class
  additionalMacros: Map<string, string[]> = new Map();
  macroTables: Map<string, string[]> = new Map();
  macrospcContainers: Map<string, Set<HTMLElement>> = new Map();
  macrocalcContainers: Set<HTMLElement> = new Set();
  // FIX: Use proper type instead of any
  _activeMacrosCalcRenderers: Set<MacrosCalcRenderer> = new Set();
  _registeredDomElements: { el: HTMLElement; type: string; handler: EventListener }[] = [];

  // File cache system
  private fileCache: Map<string, TFile[]> = new Map();
  private contentCache: Map<string, string> = new Map();

  // CONCURRENCY LOCK: A simple update mutex to serialize file modifications
  private updateMutex: Promise<void> = Promise.resolve();

  constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
    this._activeMacrosCalcRenderers = new Set();
    this.additionalMacros = new Map();
  }

  /**
   * Register a DOM event for proper cleanup during plugin unload
   * @param el The HTML element to attach the event to
   * @param type The event type (e.g., 'click')
   * @param handler The event handler function
   */
  public registerDomEvent(el: HTMLElement, type: string, handler: EventListener): void {
    el.addEventListener(type, handler);
    this._registeredDomElements.push({ el, type, handler });
  }

  /**
   * Invalidates the file cache. Call this on file modifications.
   */
  invalidateFileCache(): void {
    this.fileCache.clear();
    this.contentCache.clear();
  }

  /**
   * Clears all caches and data structures. More comprehensive than invalidateFileCache.
   */
  clearAllCaches(): void {
    this.fileCache.clear();
    this.contentCache.clear();
    this.macroTables.clear();
    this.additionalMacros.clear();
  }

  /**
   * Reads the content of a file, with caching for performance
   * @param file The file to read
   * @param forceRefresh Whether to force a fresh read
   * @returns The file content as a string
   */
  async readFileContent(file: TFile, forceRefresh = false): Promise<string> {
    try {
      // Check if we need to bypass the cache
      if (forceRefresh || !this.contentCache.has(file.path)) {
        const content = await this.plugin.app.vault.cachedRead(file);
        this.contentCache.set(file.path, content);
        return content;
      }

      return this.contentCache.get(file.path) || '';
    } catch (error) {
      this.plugin.logger.error(`Error reading file ${file.path}:`, error);
      throw error;
    }
  }

  /**
   * Gets the active file in the editor
   * @returns The active file or null if none
   */
  getActiveFile(): TFile | null {
    return this.plugin.app.workspace.getActiveFile();
  }

  /**
   * Centralizes the logic for finding and extracting macros blocks from files
   * @param id The ID of the macros block
   * @param includeAllLines Whether to include bullet points
   * @returns The extracted lines or null if not found
   */
  async getMacrosBlockContent(id: string, includeAllLines = true): Promise<string[] | null> {
    try {
      const files = this.plugin.app.vault.getMarkdownFiles();

      // Escape special characters in the ID to ensure accurate regex matching
      const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('```\\s*macros\\s+id:\\s*' + safeId + '\\s*\\n([\\s\\S]*?)```', 'm');

      for (const file of files) {
        try {
          // Read the full file content
          const content = await this.readFileContent(file);

          // Look for macros blocks with this ID
          const match = content.match(regex);

          if (match) {
            // Get all lines from the match
            const lines = match[1]
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== '');

            // If we need all lines, return them; otherwise filter out bullet points
            if (includeAllLines) {
              this.plugin.logger.debug(
                `Found ${lines.length} lines for ID: ${id} (including bullets)`
              );
              return lines;
            } else {
              const filteredLines = lines.filter((line) => !line.startsWith('-'));
              this.plugin.logger.debug(
                `Found ${filteredLines.length} lines for ID: ${id} (excluding bullets)`
              );
              return filteredLines;
            }
          }
        } catch (error) {
          this.plugin.logger.error(`Error reading file for ID ${id}:`, error);
        }
      }

      this.plugin.logger.debug(`No macros block found for ID: ${id}`);
      return null;
    } catch (error) {
      this.plugin.logger.error(`Error getting macros block content for ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Modifies a macros block in a file
   * @param id The ID of the macros block
   * @param newLines The new lines to put in the block
   * @returns Whether the update was successful
   */
  async updateMacrosBlock(id: string, newLines: string[]): Promise<boolean> {
    try {
      const files = this.plugin.app.vault.getMarkdownFiles();
      const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('```\\s*macros\\s+id:\\s*' + safeId + '\\s*\\n([\\s\\S]*?)```', 'm');

      for (const file of files) {
        const content = await this.readFileContent(file, true);
        const match = content.match(regex);

        if (match) {
          // Create the updated block
          const newBlock = '```macros\nid: ' + id + '\n' + newLines.join('\n') + '\n```';

          // Replace the old block with the updated one
          const newContent = content.replace(match[0], newBlock);

          // Update the file
          await this.plugin.app.vault.modify(file, newContent);

          // Invalidate caches
          this.invalidateFileCache();

          // Update the macroTables cache
          this.macroTables.set(id, newLines);

          // Trigger a metadata update
          this.plugin.app.metadataCache.trigger('changed', file);

          this.plugin.logger.debug(`Updated macros block for ID: ${id}`);
          return true;
        }
      }

      this.plugin.logger.debug(`Could not find macros block for ID: ${id} to update`);
      return false;
    } catch (error) {
      this.plugin.logger.error(`Error updating macros block for ID ${id}:`, error);
      return false;
    }
  }

  /**
   * Creates a reusable callback function for handling selected food items
   * Updated to work with both FatSecret and USDA (UnifiedFoodResult) formats
   * FIXED: Proper file existence checking and error handling
   */
  createFoodItemCallback() {
    return async (selectedFood: any) => {
      try {
        let foodName: string;
        let servingSize: string;
        let nutritionalData: {
          calories: string;
          protein: string;
          fat: string;
          carbs: string;
          fiber?: string;
          sugars?: string;
          salt?: string;
        };
        let additionalMetadata: {
          source: string;
          brands?: string;
          categories?: string;
          ingredients?: string;
          nutritionGrade?: string;
          novaGroup?: number;
          ecoscore?: string;
          dataQuality?: string;
          completeness?: number;
          imageUrl?: string;
        } = {
          source: 'unknown',
        };

        // Check if this is a UnifiedFoodResult (from the new search system)
        if (selectedFood.source) {
          foodName = selectedFood.name;

          if (selectedFood.source === 'openfoodfacts') {
            // Handle Open Food Facts format
            servingSize = `${selectedFood.gramsServing}g`;

            // Extract nutrition from description or raw data
            if (selectedFood.raw && typeof selectedFood.raw === 'object') {
              const offData = selectedFood.raw as any;
              nutritionalData = {
                calories: offData.calories?.toString() || '0',
                protein: offData.protein?.toString() || '0',
                fat: offData.fat?.toString() || '0',
                carbs: offData.carbs?.toString() || '0',
                fiber: offData.fiber?.toString(),
                sugars: offData.sugars?.toString(),
                salt: offData.salt?.toString(),
              };
            } else {
              // Fallback: parse from description
              nutritionalData = this.extractNutritionalDataFromDescription(
                selectedFood.description
              );
            }

            // Set Open Food Facts specific metadata
            additionalMetadata = {
              source: 'openfoodfacts',
              brands: selectedFood.brandName,
              categories: selectedFood.categories,
              ingredients: selectedFood.ingredients,
              nutritionGrade: selectedFood.nutritionGrade,
              novaGroup: selectedFood.novaGroup,
              ecoscore: selectedFood.ecoscore,
              dataQuality: selectedFood.dataQuality,
              completeness: selectedFood.completeness,
              imageUrl: selectedFood.imageUrl,
            };
          } else if (selectedFood.source === 'usda') {
            // Handle USDA format (existing code)
            servingSize = `${selectedFood.gramsServing}g`;
            const description = selectedFood.description;

            const caloriesMatch = description.match(/Calories:\s*(\d+(?:\.\d+)?)kcal/i);
            const fatMatch = description.match(/Fat:\s*(\d+(?:\.\d+)?)g/i);
            const carbsMatch = description.match(/Carbs:\s*(\d+(?:\.\d+)?)g/i);
            const proteinMatch = description.match(/Protein:\s*(\d+(?:\.\d+)?)g/i);

            nutritionalData = {
              calories: caloriesMatch ? caloriesMatch[1] : '0',
              fat: fatMatch ? fatMatch[1] : '0',
              carbs: carbsMatch ? carbsMatch[1] : '0',
              protein: proteinMatch ? proteinMatch[1] : '0',
            };

            additionalMetadata = {
              source: 'usda',
              ...(selectedFood.brandName && { brands: selectedFood.brandName }),
            };
          } else {
            // Handle FatSecret format (existing code)
            if (selectedFood.raw && selectedFood.raw.food_description) {
              servingSize = this.extractServingSize(selectedFood.raw.food_description);
              nutritionalData = this.extractNutritionalData(selectedFood.raw.food_description);
            } else {
              servingSize = `${selectedFood.gramsServing}g`;
              nutritionalData = this.extractNutritionalDataFromDescription(
                selectedFood.description
              );
            }

            additionalMetadata = {
              source: 'fatsecret',
            };
          }
        } else {
          // Handle legacy FoodItem format (existing code)
          foodName = selectedFood.food_name;
          servingSize = this.extractServingSize(selectedFood.food_description);
          nutritionalData = this.extractNutritionalData(selectedFood.food_description);
          additionalMetadata = {
            source: 'fatsecret',
          };
        }

        // Validate that we have the required data
        if (!foodName) {
          throw new Error('Food name is missing');
        }

        // Create safe filename for file operations
        const safeFileName = this.createSafeFileName(foodName);
        const fileName = `${safeFileName}.md`;

        // Enhanced frontmatter with Open Food Facts support
        let frontmatter = `---
calories: ${nutritionalData.calories}
protein: ${nutritionalData.protein}
fat: ${nutritionalData.fat}
carbs: ${nutritionalData.carbs}
serving_size: ${servingSize}`;

        // Add optional nutrition fields for Open Food Facts
        if (nutritionalData.fiber) {
          frontmatter += `\nfiber: ${nutritionalData.fiber}`;
        }
        if (nutritionalData.sugars) {
          frontmatter += `\nsugars: ${nutritionalData.sugars}`;
        }
        if (nutritionalData.salt) {
          frontmatter += `\nsalt: ${nutritionalData.salt}`;
        }

        // Add source-specific metadata
        frontmatter += `\nsource: ${additionalMetadata.source}`;

        if (additionalMetadata.source === 'openfoodfacts') {
          // Add Open Food Facts specific fields
          if (selectedFood.id) {
            frontmatter += `\noff_code: ${selectedFood.id.replace('off_', '')}`;
          }
          if (additionalMetadata.brands) {
            frontmatter += `\nbrands: "${additionalMetadata.brands}"`;
          }
          if (additionalMetadata.categories) {
            frontmatter += `\ncategories: "${additionalMetadata.categories}"`;
          }
          if (additionalMetadata.nutritionGrade) {
            frontmatter += `\nnutrition_grade: ${additionalMetadata.nutritionGrade}`;
          }
          if (additionalMetadata.novaGroup) {
            frontmatter += `\nnova_group: ${additionalMetadata.novaGroup}`;
          }
          if (additionalMetadata.ecoscore) {
            frontmatter += `\necoScore: ${additionalMetadata.ecoscore}`;
          }
          if (additionalMetadata.dataQuality) {
            frontmatter += `\ndata_quality: ${additionalMetadata.dataQuality}`;
          }
          if (additionalMetadata.completeness) {
            frontmatter += `\ncompleteness: ${additionalMetadata.completeness}`;
          }
          if (additionalMetadata.imageUrl) {
            frontmatter += `\nimage_url: "${additionalMetadata.imageUrl}"`;
          }
        } else if (additionalMetadata.source === 'usda') {
          // Add USDA specific fields (existing code)
          if (selectedFood.id) {
            frontmatter += `\nfdc_id: ${selectedFood.id.replace('usda_', '')}`;
          }
          if (selectedFood.dataType) {
            frontmatter += `\ndata_type: ${selectedFood.dataType}`;
          }
          if (selectedFood.isFoundation) {
            frontmatter += `\nfoundation_food: true`;
          }
          if (selectedFood.brandName) {
            frontmatter += `\nbrand_name: "${selectedFood.brandName}"`;
          }
        }

        frontmatter += `\ncreated: ${new Date().toISOString()}
---

# ${foodName}`;

        // Enhanced content with Open Food Facts information
        if (additionalMetadata.source === 'openfoodfacts') {
          frontmatter += `

## Product Information
`;
          if (additionalMetadata.brands) {
            frontmatter += `**Brands:** ${additionalMetadata.brands}  \n`;
          }
          if (additionalMetadata.categories) {
            frontmatter += `**Categories:** ${additionalMetadata.categories}  \n`;
          }
          if (additionalMetadata.nutritionGrade) {
            frontmatter += `**Nutrition Grade:** ${additionalMetadata.nutritionGrade.toUpperCase()} (Nutri-Score)  \n`;
          }
          if (additionalMetadata.novaGroup) {
            const novaLabels = [
              '',
              'Unprocessed or minimally processed',
              'Processed culinary ingredients',
              'Processed foods',
              'Ultra-processed foods',
            ];
            frontmatter += `**Processing Level:** NOVA ${additionalMetadata.novaGroup} (${novaLabels[additionalMetadata.novaGroup]})  \n`;
          }
          if (additionalMetadata.ecoscore) {
            frontmatter += `**Environmental Impact:** Eco-Score ${additionalMetadata.ecoscore.toUpperCase()}  \n`;
          }
        }

        frontmatter += `

## Nutritional Information (per ${servingSize})
- **Calories:** ${nutritionalData.calories} kcal
- **Protein:** ${nutritionalData.protein}g
- **Fat:** ${nutritionalData.fat}g
- **Carbohydrates:** ${nutritionalData.carbs}g`;

        // Add optional nutrition information
        if (nutritionalData.fiber) {
          frontmatter += `\n- **Fiber:** ${nutritionalData.fiber}g`;
        }
        if (nutritionalData.sugars) {
          frontmatter += `\n- **Sugars:** ${nutritionalData.sugars}g`;
        }
        if (nutritionalData.salt) {
          frontmatter += `\n- **Salt:** ${nutritionalData.salt}g`;
        }

        // Add ingredients if available
        if (additionalMetadata.ingredients) {
          frontmatter += `

## Ingredients
${additionalMetadata.ingredients}`;
        }

        // Add source attribution
        frontmatter += `

**Source:** `;
        if (additionalMetadata.source === 'openfoodfacts') {
          frontmatter += 'Open Food Facts (Community Database)';
          if (additionalMetadata.dataQuality) {
            frontmatter += ` - Data Quality: ${additionalMetadata.dataQuality.charAt(0).toUpperCase() + additionalMetadata.dataQuality.slice(1)}`;
          }
        } else if (additionalMetadata.source === 'usda') {
          frontmatter += 'USDA FoodData Central';
        } else {
          frontmatter += 'FatSecret Platform API';
        }

        // Add data quality notice for Open Food Facts
        if (
          additionalMetadata.source === 'openfoodfacts' &&
          additionalMetadata.dataQuality !== 'high'
        ) {
          frontmatter += `

> **Note:** This data comes from the Open Food Facts community database. Please verify nutrition information if accuracy is critical for your needs.`;
        }

        // File creation logic (existing code)
        const folderPath = normalizePath(this.plugin.settings.storageFolder);
        const filePath = normalizePath(`${folderPath}/${safeFileName}.md`);

        const folder = this.plugin.app.vault.getFolderByPath(folderPath);
        if (!folder) {
          await this.plugin.app.vault.createFolder(folderPath);
        }

        try {
          await this.plugin.app.vault.create(filePath, frontmatter);
          this.invalidateFileCache();
        } catch (createError) {
          if (createError.message?.includes('already exists')) {
            throw new Error(
              'File was created by another process. Please try again with a different name.'
            );
          }
          throw createError;
        }
      } catch (error) {
        this.plugin.logger.error('Error creating food file:', error);
        throw error;
      }
    };
  }
  /**
   * Helper method to extract serving size (keep existing implementation)
   */
  private extractServingSize(description: string): string {
    try {
      const regex = /Per\s*(\d+(\.\d+)?)\s*(g|medium|large|slice|cup|tbsp|oz)/i;
      const match = description.match(regex);
      return match ? `${match[1]}${match[3]}` : '100g';
    } catch (error) {
      console.error('Error extracting serving size:', error);
      return '100g';
    }
  }

  /**
   * Helper method to extract nutritional data (keep existing implementation)
   */
  private extractNutritionalData(description: string): {
    calories: string;
    fat: string;
    carbs: string;
    protein: string;
  } {
    try {
      const caloriesMatch = description.match(/Calories:\s*(\d+(\.\d+)?)kcal/i);
      const fatMatch = description.match(/Fat:\s*(\d+(\.\d+)?)g/i);
      const carbsMatch = description.match(/Carbs:\s*(\d+(\.\d+)?)g/i);
      const proteinMatch = description.match(/Protein:\s*(\d+(\.\d+)?)g/i);
      return {
        calories: caloriesMatch ? caloriesMatch[1] : '0',
        fat: fatMatch ? fatMatch[1] : '0',
        carbs: carbsMatch ? carbsMatch[1] : '0',
        protein: proteinMatch ? proteinMatch[1] : '0',
      };
    } catch (error) {
      console.error('Error extracting nutritional data:', error);
      return { calories: '0', fat: '0', carbs: '0', protein: '0' };
    }
  }

  /**
   * Helper method to extract nutritional data from generic description
   */
  private extractNutritionalDataFromDescription(description: string): {
    calories: string;
    fat: string;
    carbs: string;
    protein: string;
  } {
    // Try multiple patterns for different description formats
    const patterns = [
      // USDA format: "Per 100g - Calories: 52kcal | Fat: 0.2g | Carbs: 13.8g | Protein: 0.3g"
      {
        calories: /Calories:\s*(\d+(?:\.\d+)?)kcal/i,
        fat: /Fat:\s*(\d+(?:\.\d+)?)g/i,
        carbs: /Carbs:\s*(\d+(?:\.\d+)?)g/i,
        protein: /Protein:\s*(\d+(?:\.\d+)?)g/i,
      },
      // Alternative format
      {
        calories: /(\d+(?:\.\d+)?)\s*kcal/i,
        fat: /Fat[:\s]*(\d+(?:\.\d+)?)g/i,
        carbs: /Carb[s]?[:\s]*(\d+(?:\.\d+)?)g/i,
        protein: /Protein[:\s]*(\d+(?:\.\d+)?)g/i,
      },
    ];

    for (const pattern of patterns) {
      const caloriesMatch = description.match(pattern.calories);
      const fatMatch = description.match(pattern.fat);
      const carbsMatch = description.match(pattern.carbs);
      const proteinMatch = description.match(pattern.protein);

      // If we found at least calories, use this pattern
      if (caloriesMatch) {
        return {
          calories: caloriesMatch[1] || '0',
          fat: fatMatch?.[1] || '0',
          carbs: carbsMatch?.[1] || '0',
          protein: proteinMatch?.[1] || '0',
        };
      }
    }

    // Fallback
    return { calories: '0', fat: '0', carbs: '0', protein: '0' };
  }

  /**
   * Helper method to create a safe filename from food name
   * FIXED: More robust filename sanitization
   */
  private createSafeFileName(foodName: string): string {
    return foodName
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .substring(0, 100) // Limit length
      .replace(/\.$/, ''); // Remove trailing period if present
  }

  /**
   * Returns the list of files in the given folder, using a cache for performance.
   */
  getFilesInFolder(folderPath: string): TFile[] {
    try {
      // Check cache first
      const cached = this.fileCache.get(folderPath);
      if (cached !== undefined) return cached;

      // Normalize the path
      const normalizedPath = normalizePath(folderPath);

      // Get the folder
      const folder = this.plugin.app.vault.getFolderByPath(normalizedPath);
      if (!folder) {
        // Folder doesn't exist, return empty array
        return [];
      }

      // Gather files recursively
      const files: TFile[] = [];
      this.getFilesInFolderRecursive(folder, files);

      // Cache and return results
      this.fileCache.set(folderPath, files);
      return files;
    } catch (error) {
      this.plugin.logger.error(`Error getting files in folder ${folderPath}:`, error);
      return [];
    }
  }

  /**
   * Helper method to recursively get files in a folder and its subfolders
   */
  private getFilesInFolderRecursive(folder: TFolder, files: TFile[]): void {
    // Iterate through folder children
    folder.children.forEach((child) => {
      if (child instanceof TFile) {
        files.push(child);
      } else if (child instanceof TFolder) {
        this.getFilesInFolderRecursive(child, files);
      }
    });
  }

  /**
   * Find a matching food file by name or partial name
   * Centralized implementation that replaces duplicated code in other components
   * @param foodQuery The food name to search for
   * @returns The matching file or null if not found
   */
  findFoodFile(foodQuery: string): TFile | null {
    if (!foodQuery || foodQuery.trim() === '') {
      return null;
    }

    // Normalize the folder path
    const folderPath = normalizePath(this.plugin.settings.storageFolder);

    // Get files from the folder
    const files = this.getFilesInFolder(folderPath);

    // Look for exact match first (case insensitive)
    const queryLower = foodQuery.toLowerCase();
    const exactMatches = files.filter(
      (f) => f.name.replace(/.md$/, '').toLowerCase() === queryLower
    );
    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    // If no exact match, look for partial matches
    const partialMatches = files.filter((f) => f.name.toLowerCase().includes(queryLower));
    if (partialMatches.length === 1) {
      return partialMatches[0];
    }

    // If multiple partial matches, log a warning and return null
    if (partialMatches.length > 1) {
      this.plugin.logger.warn(
        `Ambiguous food query "${foodQuery}" matches multiple files: [${partialMatches.map((f) => f.name).join(', ')}]. Please disambiguate.`
      );
      return null;
    }

    // No matches found
    return null;
  }

  /**
   * Find all food files matching a search term
   * @param searchTerm The search term
   * @returns Array of matching files
   */
  findFoodFiles(searchTerm: string): TFile[] {
    if (!searchTerm || searchTerm.trim() === '') {
      return [];
    }

    // Normalize the folder path
    const folderPath = normalizePath(this.plugin.settings.storageFolder);

    // Get files from the folder
    const files = this.getFilesInFolder(folderPath);

    // Return all matches (both exact and partial)
    const searchTermLower = searchTerm.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(searchTermLower));
  }

  /**
   * Gets all food files available in the storage folder
   * @returns Array of all food files
   */
  getAllFoodFiles(): TFile[] {
    // Normalize the folder path
    const folderPath = normalizePath(this.plugin.settings.storageFolder);

    // Get and return all files from the folder
    return this.getFilesInFolder(folderPath);
  }

  /**
   * Gets all food names available in the storage folder
   * @returns Array of food names (without .md extension)
   */
  getAllFoodNames(): string[] {
    return this.getAllFoodFiles().map((file) => file.name.replace(/\.md$/, ''));
  }

  /**
   * Enqueues an update function to serialize file modifications.
   * @param updateFn A function that returns a Promise<void> with the update logic.
   * @returns A Promise that resolves when the queued update has completed.
   */
  private queueUpdate(updateFn: () => Promise<void>): Promise<void> {
    // Capture the prior promise
    const prior = this.updateMutex;

    // Create a new promise that awaits the old one
    return (this.updateMutex = (async () => {
      try {
        // Wait for prior updates to complete
        await prior;

        // Set up a timeout for the update
        const timeoutPromise = new Promise<void>((_resolve, reject) => {
          setTimeout(() => reject(new Error('Update timed out')), 30000);
        });

        // Race the update function against the timeout
        await Promise.race([updateFn(), timeoutPromise]);
      } catch (error) {
        this.plugin.logger.error('Error during queued update (or update timed out):', error);
      }
    })());
  }

  /**
   * Updates the macros code block in the active file by merging static and interactive lines.
   * SIMPLIFIED VERSION: No multipliers, direct quantity merging under meal headers
   */
  async updateMacrosCodeBlock(): Promise<void> {
    await this.queueUpdate(async () => {
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (!activeFile) return;

      try {
        const content = await this.readFileContent(activeFile, true);
        const regex = /```macros\s+id:\s*(\S+)\s*([\s\S]*?)```/g;
        let newContent = content;
        let updatedAny = false;

        const processedIds = new Set<string>();

        // Process each macros block in the file
        let match;
        while ((match = regex.exec(content)) !== null) {
          const id = match[1];
          const blockContent = match[2];
          processedIds.add(id);

          this.plugin.logger.debug(`Found macros block with ID: ${id}`);

          // Check if we have additional macros for this ID
          const additionalMacrosForId = this.additionalMacros.get(id);
          if (
            this.additionalMacros.has(id) &&
            additionalMacrosForId &&
            additionalMacrosForId.length > 0
          ) {
            this.plugin.logger.debug(`Processing additional macros for ID: ${id}`);
            this.plugin.logger.debug(`Additional items: ${additionalMacrosForId.length}`);

            // Parse existing content into structured format
            const existingStructure = this.parseExistingMacrosContent(blockContent);

            // Process new items from additionalMacros
            const newItems = this.processNewInteractiveItems(additionalMacrosForId);

            // Merge new items with existing structure
            const mergedStructure = this.mergeIntoExistingStructure(existingStructure, newItems);

            // Convert back to text format
            const updatedContent = this.generateMacrosBlockContent(mergedStructure);

            // Create the updated block
            const updatedBlock = '```macros\nid: ' + id + '\n' + updatedContent + '\n```';

            // Replace the old block with the updated one
            newContent = newContent.replace(match[0], updatedBlock);
            updatedAny = true;

            // Clear interactive lines after merging
            this.additionalMacros.set(id, []);
          }
        }

        // Only modify the file if changes were made
        if (updatedAny) {
          await this.plugin.app.vault.modify(activeFile, newContent);

          // Update the global macro tables with the latest content
          this.updateGlobalMacroTableFromContent(newContent);

          // Must trigger metadata changes to force refresh
          this.plugin.app.metadataCache.trigger('changed', activeFile);

          // Force refresh all views
          this.plugin.refreshMacrosTables();
          await this.plugin.redrawAllMacrospc();
          await this.plugin.redrawAllMacrocalc();

          this.plugin.logger.debug(
            `Successfully updated macros blocks: ${Array.from(processedIds).join(', ')}`
          );
        } else {
          this.plugin.logger.debug('No macros blocks were updated');
        }
      } catch (error) {
        this.plugin.logger.error('Error updating macros code block:', error);
        throw error;
      }
    });
  }

  /**
   * Parse existing macros block content into a structured format
   */
  private parseExistingMacrosContent(blockContent: string): MacrosStructure {
    const lines = blockContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith(INTERACTIVE_PREFIX));

    const structure: MacrosStructure = {
      meals: new Map(),
      individualItems: new Map(),
    };

    let currentMealName: string | null = null;

    for (const line of lines) {
      if (line.toLowerCase().startsWith('meal:')) {
        // Extract meal name (no more multiplier parsing)
        currentMealName = line.substring(5).trim();

        if (!structure.meals.has(currentMealName)) {
          structure.meals.set(currentMealName, new Map());
        }
      } else if (line.startsWith('-') && currentMealName) {
        // Parse bullet point under a meal
        const itemText = line.substring(1).trim();
        const { foodName, quantity } = this.parseItemText(itemText);

        if (foodName) {
          // FIX: Add null check instead of using non-null assertion
          const mealItems = structure.meals.get(currentMealName);
          if (mealItems) {
            const existingQuantity = mealItems.get(foodName) || 0;
            mealItems.set(foodName, existingQuantity + quantity);
          }
        }
      } else if (!line.startsWith('-') && !line.toLowerCase().startsWith('meal:')) {
        // Individual food item (not under a meal)
        currentMealName = null;
        const { foodName, quantity } = this.parseItemText(line);

        if (foodName) {
          const existingQuantity = structure.individualItems.get(foodName) || 0;
          structure.individualItems.set(foodName, existingQuantity + quantity);
        }
      }
    }

    return structure;
  }

  /**
   * Process new interactive items into structured format
   */
  private processNewInteractiveItems(interactiveItems: string[]): NewItemsStructure {
    const newItems: NewItemsStructure = {
      meals: new Map(),
      individualItems: new Map(),
    };

    let currentGroupName: string | null = null;
    let currentGroupItems = new Map<string, number>();

    for (const item of interactiveItems) {
      const cleanItem = item.startsWith(INTERACTIVE_PREFIX)
        ? item.substring(INTERACTIVE_PREFIX.length)
        : item;

      if (cleanItem.toLowerCase().startsWith('meal:')) {
        // Existing meal handling
        const mealName = cleanItem.substring(5).trim();
        const mealTemplate = this.plugin.settings.mealTemplates.find(
          (m) => m.name.toLowerCase() === mealName.toLowerCase()
        );

        if (mealTemplate) {
          const mealItems = new Map<string, number>();
          for (const templateItem of mealTemplate.items) {
            const { foodName, quantity } = this.parseItemText(templateItem);
            if (foodName) {
              const existingQuantity = mealItems.get(foodName) || 0;
              mealItems.set(foodName, existingQuantity + quantity);
            }
          }
          newItems.meals.set(mealName, mealItems);
        }
      } else if (cleanItem.toLowerCase().startsWith('group:')) {
        // FIXED: Group handling
        currentGroupName = cleanItem.substring(6).trim(); // Remove 'group:' prefix
        currentGroupItems = new Map<string, number>();

        // Don't add to meals yet, wait for the group items
      } else if (cleanItem.startsWith('- ') && currentGroupName) {
        // FIXED: Group item handling
        const itemText = cleanItem.substring(2).trim(); // Remove '- ' prefix
        const { foodName, quantity } = this.parseItemText(itemText);

        if (foodName) {
          const existingQuantity = currentGroupItems.get(foodName) || 0;
          currentGroupItems.set(foodName, existingQuantity + quantity);
        }
      } else if (!cleanItem.startsWith('-')) {
        // If we were building a group and hit a non-bullet item, finalize the group
        if (currentGroupName && currentGroupItems.size > 0) {
          newItems.meals.set(currentGroupName, new Map(currentGroupItems));
          currentGroupName = null;
          currentGroupItems = new Map();
        }

        // Individual food item
        const { foodName, quantity } = this.parseItemText(cleanItem);
        if (foodName) {
          const existingQuantity = newItems.individualItems.get(foodName) || 0;
          newItems.individualItems.set(foodName, existingQuantity + quantity);
        }
      }
    }

    // FIXED: Finalize any remaining group
    if (currentGroupName && currentGroupItems.size > 0) {
      newItems.meals.set(currentGroupName, new Map(currentGroupItems));
    }

    return newItems;
  }

  /**
   * Merge new items into existing structure
   */
  private mergeIntoExistingStructure(
    existing: MacrosStructure,
    newItems: NewItemsStructure
  ): MacrosStructure {
    const merged: MacrosStructure = {
      meals: new Map(existing.meals),
      individualItems: new Map(existing.individualItems),
    };

    // Merge new meals
    for (const [mealName, newMealItems] of newItems.meals) {
      if (!merged.meals.has(mealName)) {
        // New meal - add it directly
        merged.meals.set(mealName, new Map(newMealItems));
      } else {
        // Existing meal - merge quantities
        // FIX: Add null check instead of using non-null assertion
        const existingMealItems = merged.meals.get(mealName);
        if (existingMealItems) {
          for (const [foodName, quantity] of newMealItems) {
            const existingQuantity = existingMealItems.get(foodName) || 0;
            existingMealItems.set(foodName, existingQuantity + quantity);
          }
        }
      }
    }

    // Merge individual items
    for (const [foodName, quantity] of newItems.individualItems) {
      const existingQuantity = merged.individualItems.get(foodName) || 0;
      merged.individualItems.set(foodName, existingQuantity + quantity);
    }

    return merged;
  }

  /**
   * Generate macros block content from structured data
   */
  private generateMacrosBlockContent(structure: MacrosStructure): string {
    const lines: string[] = [];

    // Add meals first
    for (const [mealName, mealItems] of structure.meals) {
      lines.push(`meal:${mealName}`);

      for (const [foodName, quantity] of mealItems) {
        lines.push(`- ${foodName}:${quantity}g`);
      }
    }

    // Add individual items
    for (const [foodName, quantity] of structure.individualItems) {
      lines.push(`${foodName}:${quantity}g`);
    }

    return lines.join('\n');
  }

  /**
   * Parse item text to extract food name and quantity
   */
  private parseItemText(itemText: string): { foodName: string; quantity: number } {
    if (itemText.includes(':')) {
      const parts = itemText.split(':').map((s) => s.trim());
      const foodName = parts[0];
      const quantityStr = parts[1];

      // Parse quantity (remove 'g' suffix if present)
      const quantity = parseFloat(quantityStr.replace(/g$/i, '')) || 0;

      return { foodName, quantity };
    } else {
      // No quantity specified, assume default serving size from food file
      const foodName = itemText.trim();

      // Try to get default serving from food file
      const matchingFile = this.findFoodFile(foodName);
      if (matchingFile) {
        const nutrition = processNutritionalData(this.plugin.app, matchingFile);
        if (nutrition && nutrition.serving) {
          const defaultQuantity = parseFloat(nutrition.serving.replace(/g$/i, '')) || 100;
          return { foodName, quantity: defaultQuantity };
        }
      }

      // Fallback to 100g
      return { foodName, quantity: 100 };
    }
  }

  /**
   * Updates the global macro table cache by parsing macros blocks from the provided content.
   */
  updateGlobalMacroTableFromContent(content: string): void {
    try {
      const regex = /```[\t ]*macros[\t ]+id:[\t ]*(\S+)[\t ]*\n([\s\S]*?)```/g;
      let match;

      while ((match = regex.exec(content)) !== null) {
        const id = match[1];
        // Filter out the bullet points when storing in the macro tables
        const blockContent = match[2]
          .trim()
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l !== '' && !l.startsWith('-'));

        this.macroTables.set(id, blockContent);
      }
    } catch (error) {
      this.plugin.logger.error('Error updating global macro table from content:', error);
    }
  }

  /**
   * Loads the macros table from the vault by searching markdown files.
   */
  async loadMacroTableFromVault(id: string): Promise<string[] | null> {
    // Use the central method, filtering out bullet points
    return await this.getMacrosBlockContent(id, false);
  }

  /**
   * New helper method to get complete macros data including bullet points
   */
  async getFullMacrosData(id: string): Promise<string[]> {
    // Use the central method, keeping all lines
    const lines = await this.getMacrosBlockContent(id, true);
    return lines || [];
  }

  /**
   * A centralized method to load the full document context for a macro block
   * This replaces duplicate code in TableRenderer and MacrosCalcRenderer
   *
   * @param id The ID of the macros block to find
   * @returns An object containing the document context and lines, or null if not found
   */
  async getDocumentContext(id: string): Promise<{
    file: TFile;
    content: string;
    match: RegExpMatchArray;
    allLines: string[];
  } | null> {
    try {
      // Find all markdown files that might contain the block
      const files = this.plugin.app.vault.getMarkdownFiles();

      // Create a safe regex pattern from the ID
      const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('```\\s*macros\\s+id:\\s*' + safeId + '\\s*\\n([\\s\\S]*?)```', 'm');

      for (const file of files) {
        try {
          // Read the full file content - force fresh read
          const content = await this.plugin.app.vault.cachedRead(file);

          // Look for macros blocks with this ID
          const match = content.match(regex);

          if (match) {
            // Get all lines from the match
            const allLines = match[1]
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== '');

            // Return the full context
            return {
              file,
              content,
              match,
              allLines,
            };
          }
        } catch (error) {
          this.plugin.logger.error(`Error reading file for ID ${id}:`, error);
        }
      }

      this.plugin.logger.debug(`No macros block found for ID: ${id}`);
      return null;
    } catch (error) {
      this.plugin.logger.error(`Error getting document context for ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Cleanup resources when plugin is unloaded
   */
  cleanup(): void {
    // Clean up DOM event listeners
    for (const { el, type, handler } of this._registeredDomElements) {
      try {
        el.removeEventListener(type, handler);
      } catch (error) {
        this.plugin.logger.error(`Error removing event listener of type ${type}:`, error);
      }
    }
    this._registeredDomElements = [];

    // Clear internal data structures
    this.additionalMacros.clear();
    this.macroTables.clear();
    this.macrospcContainers.clear();
    this.macrocalcContainers.clear();
    this._activeMacrosCalcRenderers.clear();
    this.fileCache.clear();
    this.contentCache.clear();
  }
}

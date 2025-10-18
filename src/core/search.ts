/**
 * Enhanced Unified Food Search System with Open Food Facts
 * ---------------------------------------------------------
 * Extends the existing search system to include Open Food Facts alongside
 * FatSecret and USDA APIs. Maintains the same unified interface while
 * adding support for the new data source.
 */

import { App } from 'obsidian';
import { fetchFoodData, FoodItem } from './api';
import { searchFoods, searchFoodsWithFallback, UsdaFoodResult } from './usda';
import { searchOpenFoodFacts, OffFoodResult } from './openFoodFacts';

/**
 * Enhanced unified food result with Open Food Facts support
 */
export interface UnifiedFoodResult {
  id: string; // fdcId, fatsecret id, or OFF code
  name: string; // primary display name
  description: string; // nutrition summary or short description
  gramsServing: number; // representative serving in grams (must exist)
  source: 'fatsecret' | 'usda' | 'openfoodfacts';
  brandName?: string; // brand name if available
  isFoundation?: boolean; // true for USDA foundation foods
  isBranded?: boolean; // true for USDA branded foods
  isSrLegacy?: boolean; // true for USDA SR Legacy foods
  dataType?: string; // USDA data type (Foundation, Branded, SR Legacy)
  // Open Food Facts specific fields
  nutritionGrade?: string; // A, B, C, D, E
  novaGroup?: number; // 1-4 processing level
  dataQuality?: 'high' | 'medium' | 'low'; // OFF data quality assessment
  completeness?: number; // OFF completeness score
  ecoscore?: string; // OFF environmental score
  imageUrl?: string; // product image URL
  categories?: string; // food categories
  ingredients?: string; // ingredients list
  raw?: unknown; // optional raw payload for future drilldowns
}

/**
 * Search Open Food Facts and convert to unified format
 * @param app Obsidian App instance
 * @param query Search query
 * @param page Page number
 * @param pageSize Results per page
 * @param userLocale User's locale for localization
 * @returns Promise<UnifiedFoodResult[]>
 */
export async function searchOpenFoodFactsUnified(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  userLocale = 'en'
): Promise<UnifiedFoodResult[]> {
  try {
    const results = await searchOpenFoodFacts(app, query, page, pageSize, userLocale);

    return results.map((item: OffFoodResult) => ({
      id: `off_${item.code}`,
      name: item.productName,
      description: item.displayDescription,
      gramsServing: item.gramsServing,
      source: 'openfoodfacts' as const,
      brandName: item.brands,
      nutritionGrade: item.nutritionGrade,
      novaGroup: item.novaGroup,
      dataQuality: item.dataQuality,
      completeness: item.completeness,
      ecoscore: item.ecoscore,
      imageUrl: item.imageUrl,
      categories: item.categories,
      ingredients: item.ingredientsText,
      raw: item,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Search FatSecret database and convert to unified format
 * @param app Obsidian App instance
 * @param query Search query
 * @param page Page number
 * @param pageSize Results per page
 * @param apiKey FatSecret API key
 * @param apiSecret FatSecret API secret
 * @returns Promise<UnifiedFoodResult[]>
 */
export async function searchFatSecret(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  apiKey: string,
  apiSecret: string
): Promise<UnifiedFoodResult[]> {
  try {
    const results = await fetchFoodData(app, query, page, pageSize, apiKey, apiSecret);

    return results.map((item: FoodItem) => {
      // Extract serving size from description
      const servingMatch = item.food_description.match(/Per\s*(\d+(?:\.\d+)?)\s*g/i);
      const gramsServing = servingMatch ? parseFloat(servingMatch[1]) : 100;

      // Generate a consistent ID for FatSecret items
      const id = `fs_${item.food_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      return {
        id,
        name: item.food_name,
        description: item.food_description,
        gramsServing,
        source: 'fatsecret' as const,
        raw: item,
      };
    });
  } catch (error) {
    return [];
  }
}

/**
 * Enhanced USDA search with better Foundation Food support
 * @param app Obsidian App instance
 * @param query Search query
 * @param page Page number
 * @param pageSize Results per page
 * @param apiKey USDA API key
 * @returns Promise<UnifiedFoodResult[]>
 */
export async function searchUsda(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  apiKey: string
): Promise<UnifiedFoodResult[]> {
  try {
    // Use the enhanced search function with fallback
    const results = await searchFoodsWithFallback(app, query, page, pageSize, apiKey);

    return results.map((item: UsdaFoodResult) => ({
      id: `usda_${item.fdcId}`,
      name: item.description,
      description: item.displayDescription,
      gramsServing: item.gramsServing,
      source: 'usda' as const,
      brandName: item.brandName,
      isFoundation: item.isFoundation,
      isBranded: item.isBranded,
      isSrLegacy: item.isSrLegacy,
      dataType: item.dataType,
      raw: item,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Enhanced merge and deduplication with Open Food Facts prioritization
 * Priority order: USDA Foundation > USDA SR Legacy > Open Food Facts (high quality) > FatSecret > Open Food Facts (medium/low quality) > USDA Branded
 * @param results Array of result arrays to merge
 * @returns UnifiedFoodResult[] Merged and deduplicated results
 */
export function mergeAndDedupeResults(...results: UnifiedFoodResult[][]): UnifiedFoodResult[] {
  // Flatten all results
  const allResults = results.flat();

  if (allResults.length === 0) {
    return [];
  }

  // Group by normalized name for deduplication
  const resultMap = new Map<string, UnifiedFoodResult>();

  for (const result of allResults) {
    const normalizedKey = normalizeNameForDedupe(result.name, result.brandName);

    // If we already have a result with this normalized name, prefer based on enhanced priority
    if (resultMap.has(normalizedKey)) {
      const existing = resultMap.get(normalizedKey)!;

      // Enhanced priority order including Open Food Facts
      const getResultPriority = (r: UnifiedFoodResult): number => {
        if (r.source === 'usda' && r.isFoundation) return 6; // Highest priority
        if (r.source === 'usda' && r.isSrLegacy) return 5;
        if (r.source === 'openfoodfacts' && r.dataQuality === 'high') return 4;
        if (r.source === 'fatsecret') return 3;
        if (r.source === 'openfoodfacts' && r.dataQuality === 'medium') return 2;
        if (r.source === 'usda' && r.isBranded) return 1;
        if (r.source === 'openfoodfacts' && r.dataQuality === 'low') return 0;
        return 0;
      };

      if (getResultPriority(result) > getResultPriority(existing)) {
        resultMap.set(normalizedKey, result);
      }
    } else {
      resultMap.set(normalizedKey, result);
    }
  }

  // Convert back to array and sort by enhanced priority
  const deduped = Array.from(resultMap.values());

  // Enhanced sorting with Open Food Facts considerations
  return deduped.sort((a, b) => {
    // Primary sort: Enhanced source and type priority
    const getPriority = (r: UnifiedFoodResult): number => {
      if (r.source === 'usda' && r.isFoundation) return 6;
      if (r.source === 'usda' && r.isSrLegacy) return 5;
      if (r.source === 'openfoodfacts' && r.dataQuality === 'high') return 4;
      if (r.source === 'fatsecret') return 3;
      if (r.source === 'openfoodfacts' && r.dataQuality === 'medium') return 2;
      if (r.source === 'usda' && r.isBranded) return 1;
      return 0;
    };

    const priorityDiff = getPriority(b) - getPriority(a);
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort for Open Food Facts: nutrition grade and completeness
    if (a.source === 'openfoodfacts' && b.source === 'openfoodfacts') {
      // Prefer better nutrition grades (A > B > C > D > E)
      if (a.nutritionGrade && b.nutritionGrade) {
        const gradeDiff = a.nutritionGrade.localeCompare(b.nutritionGrade);
        if (gradeDiff !== 0) return gradeDiff;
      }

      // Then by completeness
      const aCompleteness = a.completeness || 0;
      const bCompleteness = b.completeness || 0;
      if (bCompleteness !== aCompleteness) return bCompleteness - aCompleteness;
    }

    // Final sort: alphabetical by name
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}

/**
 * Enhanced name normalization for better deduplication
 * @param name Food name
 * @param brand Optional brand name
 * @returns string Normalized key for deduplication
 */
function normalizeNameForDedupe(name: string, brand?: string): string {
  // Convert to lowercase and remove common variations
  let normalized = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Remove common prefixes/suffixes that might cause duplicates
  normalized = normalized
    .replace(/^(organic|natural|fresh|raw|cooked|baked|fried|grilled|dried|frozen)\s+/i, '')
    .replace(/\s+(organic|natural|fresh|raw|cooked|baked|fried|grilled|dried|frozen)$/i, '')
    .replace(/\s+(brand|foods?|products?|company|inc|llc|corp)$/i, '');

  // Remove source-specific descriptors that might cause over-deduplication
  normalized = normalized
    .replace(/\s+(foundation|branded|sr\s*legacy|usda|fdc|open\s*food\s*facts|off)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If we have a brand, include it in the key to avoid over-deduplication
  if (brand) {
    const normalizedBrand = brand.toLowerCase().replace(/[^\w]/g, '');
    normalized = `${normalizedBrand}_${normalized}`;
  }

  return normalized;
}

/**
 * Enhanced search across all sources with Open Food Facts integration
 * @param app Obsidian App instance
 * @param query Search query
 * @param page Page number
 * @param pageSize Results per page
 * @param sources Configuration for enabled sources
 * @param userLocale User's locale for Open Food Facts localization
 * @returns Promise<UnifiedFoodResult[]>
 */
export async function searchAllSources(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  sources: {
    fatSecret?: { enabled: boolean; apiKey: string; apiSecret: string };
    usda?: { enabled: boolean; apiKey: string };
    openFoodFacts?: { enabled: boolean };
  },
  userLocale = 'en'
): Promise<UnifiedFoodResult[]> {
  const searchPromises: Promise<UnifiedFoodResult[]>[] = [];

  // Prioritize USDA search for better Foundation Food discovery
  if (sources.usda?.enabled && sources.usda.apiKey) {
    searchPromises.push(
      searchUsda(app, query, page, Math.ceil(pageSize * 0.4), sources.usda.apiKey) // 40% allocation
    );
  }

  // Add Open Food Facts search if enabled
  if (sources.openFoodFacts?.enabled !== false) {
    // Default to enabled
    searchPromises.push(
      searchOpenFoodFactsUnified(app, query, page, Math.ceil(pageSize * 0.4), userLocale) // 40% allocation
    );
  }

  // Add FatSecret search if enabled
  if (sources.fatSecret?.enabled && sources.fatSecret.apiKey && sources.fatSecret.apiSecret) {
    searchPromises.push(
      searchFatSecret(
        app,
        query,
        page,
        Math.ceil(pageSize * 0.2), // 20% allocation
        sources.fatSecret.apiKey,
        sources.fatSecret.apiSecret
      )
    );
  }

  // Execute searches in parallel
  const results = await Promise.all(searchPromises);

  // Merge and deduplicate with enhanced prioritization
  const merged = mergeAndDedupeResults(...results);

  // Limit to requested page size but ensure we get good variety
  return merged.slice(0, pageSize);
}

/**
 * Specialized search for Foundation Foods only (unchanged)
 * @param app Obsidian App instance
 * @param query Search query
 * @param pageSize Results per page
 * @param apiKey USDA API key
 * @returns Promise<UnifiedFoodResult[]>
 */
export async function searchFoundationFoodsOnly(
  app: App,
  query: string,
  pageSize: number,
  apiKey: string
): Promise<UnifiedFoodResult[]> {
  try {
    const results = await searchFoods(app, query, 0, pageSize, apiKey);

    // Filter to only Foundation Foods
    const foundationResults = results
      .filter((item) => item.isFoundation)
      .map((item: UsdaFoodResult) => ({
        id: `usda_${item.fdcId}`,
        name: item.description,
        description: item.displayDescription,
        gramsServing: item.gramsServing,
        source: 'usda' as const,
        brandName: item.brandName,
        isFoundation: item.isFoundation,
        isBranded: item.isBranded,
        isSrLegacy: item.isSrLegacy,
        dataType: item.dataType,
        raw: item,
      }));

    return foundationResults;
  } catch (error) {
    return [];
  }
}

/**
 * Search Open Food Facts by specific categories
 * @param app Obsidian App instance
 * @param category Category to search (e.g., "beverages", "dairy")
 * @param page Page number
 * @param pageSize Results per page
 * @param userLocale User's locale for localization
 * @returns Promise<UnifiedFoodResult[]>
 */
export async function searchOpenFoodFactsByCategory(
  app: App,
  category: string,
  page: number,
  pageSize: number,
  userLocale = 'en'
): Promise<UnifiedFoodResult[]> {
  try {
    // Import the category search function from openFoodFacts module
    const { searchOffByCategory } = await import('./openFoodFacts');
    const results = await searchOffByCategory(app, category, page, pageSize, userLocale);

    return results.map((item) => ({
      id: `off_${item.code}`,
      name: item.productName,
      description: item.displayDescription,
      gramsServing: item.gramsServing,
      source: 'openfoodfacts' as const,
      brandName: item.brands,
      nutritionGrade: item.nutritionGrade,
      novaGroup: item.novaGroup,
      dataQuality: item.dataQuality,
      completeness: item.completeness,
      ecoscore: item.ecoscore,
      imageUrl: item.imageUrl,
      categories: item.categories,
      ingredients: item.ingredientsText,
      raw: item,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Fuse.js Integration for Enhanced Food Search
 * ------------------------------------------
 * Provides fuzzy search capabilities for food items across different APIs
 * with proper ranking and fallback mechanisms.
 */

import Fuse from 'fuse.js';
import { UnifiedFoodResult } from './search';

/**
 * Normalized food document for Fuse.js indexing
 */
export interface FoodDoc {
  id: string;
  food_name: string;
  brandOwner?: string;
  description: string;
  source: string;
  original: UnifiedFoodResult;
}

/**
 * Fuse.js search configuration optimized for food search
 */
const FUSE_OPTIONS: any = {
  keys: [
    { name: 'food_name', weight: 0.7 },
    { name: 'brandOwner', weight: 0.2 },
    { name: 'description', weight: 0.1 },
  ],
  threshold: 0.4, // Lower = more strict matching
  distance: 100, // Maximum distance for fuzzy matching
  minMatchCharLength: 2,
  includeScore: true,
  includeMatches: true,
  ignoreLocation: true,
  useExtendedSearch: false,
};

/**
 * Storage for Fuse indexes by tab key
 */
const fuseIndexes = new Map<string, { fuse: Fuse<FoodDoc>; docs: FoodDoc[] }>();

/**
 * Convert UnifiedFoodResult to FoodDoc for Fuse.js indexing
 */
export function unifiedResultToFoodDoc(result: UnifiedFoodResult): FoodDoc {
  return {
    id: result.id,
    food_name: result.name,
    brandOwner: result.brandName,
    description: result.description,
    source: result.source,
    original: result,
  };
}

/**
 * Build Fuse.js index for a specific tab's results
 * @param tabKey The tab identifier (e.g., 'all', 'fatsecret', 'usda-foundation')
 * @param docs Array of FoodDoc objects to index
 */
export function buildFuseIndex(tabKey: string, docs: FoodDoc[]): void {
  if (!docs || docs.length === 0) {
    fuseIndexes.delete(tabKey);
    return;
  }

  const fuse = new Fuse(docs, FUSE_OPTIONS);
  fuseIndexes.set(tabKey, { fuse, docs });
}

/**
 * Perform fuzzy search on a specific tab's indexed data
 * @param tabKey The tab identifier
 * @param query Search query string
 * @returns Array of UnifiedFoodResult objects ranked by relevance
 */
export function fuseSearch(tabKey: string, query: string): UnifiedFoodResult[] {
  const trimmedQuery = query.trim();

  // Get the index for this tab
  const indexData = fuseIndexes.get(tabKey);

  if (!indexData) {
    return [];
  }

  // If query is empty or too short, return all documents
  if (!trimmedQuery || trimmedQuery.length < 2) {
    return indexData.docs.map((doc) => doc.original);
  }

  // Perform the fuzzy search
  const fuseResults = indexData.fuse.search(trimmedQuery);

  // Extract and return the original UnifiedFoodResult objects
  const results = fuseResults.map((result) => result.item.original);

  // If no fuzzy search results, try exact substring matching as fallback
  if (results.length === 0) {
    const lowerQuery = trimmedQuery.toLowerCase();
    const substringResults = indexData.docs
      .filter(
        (doc) =>
          doc.food_name.toLowerCase().includes(lowerQuery) ||
          (doc.brandOwner && doc.brandOwner.toLowerCase().includes(lowerQuery)) ||
          doc.description.toLowerCase().includes(lowerQuery)
      )
      .map((doc) => doc.original);

    return substringResults;
  }

  return results;
}

/**
 * Generate singular/plural variants of a search term
 * @param term Original search term
 * @returns Array of term variants to try
 */
export function generateSearchVariants(term: string): string[] {
  const trimmed = term.trim().toLowerCase();
  const variants: string[] = [trimmed];

  // Simple plural/singular logic
  if (trimmed.endsWith('s') && trimmed.length > 3) {
    // Try removing 's' for singular
    variants.push(trimmed.slice(0, -1));
  } else if (trimmed.endsWith('ies') && trimmed.length > 4) {
    // berries -> berry
    variants.push(trimmed.slice(0, -3) + 'y');
  } else if (trimmed.endsWith('es') && trimmed.length > 3) {
    // tomatoes -> tomato
    variants.push(trimmed.slice(0, -2));
  } else {
    // Try adding 's' for plural
    variants.push(trimmed + 's');

    // Try adding 'es' for some words
    if (
      trimmed.endsWith('o') ||
      trimmed.endsWith('s') ||
      trimmed.endsWith('x') ||
      trimmed.endsWith('ch') ||
      trimmed.endsWith('sh')
    ) {
      variants.push(trimmed + 'es');
    }

    // Try changing 'y' to 'ies'
    if (trimmed.endsWith('y') && trimmed.length > 2) {
      variants.push(trimmed.slice(0, -1) + 'ies');
    }
  }

  // Remove duplicates while preserving order
  return Array.from(new Set(variants));
}

/**
 * Clear all Fuse indexes (useful for cleanup)
 */
export function clearAllIndexes(): void {
  fuseIndexes.clear();
}

/**
 * Get information about current indexes (for debugging)
 */
export function getIndexInfo(): Record<string, number> {
  const info: Record<string, number> = {};
  for (const [tabKey, indexData] of fuseIndexes.entries()) {
    info[tabKey] = indexData.docs.length;
  }
  return info;
}

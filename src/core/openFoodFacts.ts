/**
 * Open Food Facts API Integration
 * --------------------------------
 * Handles API calls to the Open Food Facts database with correct endpoints
 * and multi-instance support for comprehensive product coverage.
 */

import { App, requestUrl } from 'obsidian';
import { toCanonicalMicronutrient } from '../utils/nutrition/micronutrients';

/**
 * Mapping of Open Food Facts nutriment base names to the plugin's canonical
 * micronutrient keys. OFF reports every `_100g` value in grams (the SI base
 * unit), so each value is converted from grams into the nutrient's canonical
 * unit. Niacin uses OFF's `vitamin-pp` key; folate maps from both `vitamin-b9`
 * and `folates`.
 */
const OFF_NUTRIMENT_TO_KEY: Record<string, string> = {
  // Vitamins
  'vitamin-a': 'vitamin_a',
  'vitamin-c': 'vitamin_c',
  'vitamin-d': 'vitamin_d',
  'vitamin-e': 'vitamin_e',
  'vitamin-k': 'vitamin_k',
  'vitamin-b1': 'thiamin',
  'vitamin-b2': 'riboflavin',
  'vitamin-pp': 'niacin',
  'vitamin-b6': 'vitamin_b6',
  'vitamin-b9': 'folate',
  folates: 'folate',
  'vitamin-b12': 'vitamin_b12',
  'pantothenic-acid': 'pantothenic_acid',
  biotin: 'biotin',
  choline: 'choline',
  // Minerals
  calcium: 'calcium',
  iron: 'iron',
  magnesium: 'magnesium',
  phosphorus: 'phosphorus',
  potassium: 'potassium',
  sodium: 'sodium',
  zinc: 'zinc',
  copper: 'copper',
  manganese: 'manganese',
  selenium: 'selenium',
  iodine: 'iodine',
  chromium: 'chromium',
  molybdenum: 'molybdenum',
  // Other tracked nutrients
  fiber: 'fiber',
  sugars: 'sugar',
  'added-sugars': 'added_sugar',
  'saturated-fat': 'saturated_fat',
  cholesterol: 'cholesterol',
};

export interface OffProduct {
  code: string; // barcode/product ID
  product_name: string;
  generic_name?: string;
  brands?: string;
  categories?: string;
  ingredients_text?: string;
  nutriments: {
    'energy-kcal_100g'?: number;
    'energy-kj_100g'?: number;
    proteins_100g?: number;
    fat_100g?: number;
    carbohydrates_100g?: number;
    sugars_100g?: number;
    fiber_100g?: number;
    salt_100g?: number;
    sodium_100g?: number;
    // Vitamin / mineral fields (per 100g, reported in grams by OFF).
    [key: string]: number | undefined;
  };
  // Multi-language fields
  product_name_en?: string;
  product_name_fr?: string;
  product_name_de?: string;
  product_name_es?: string;
  product_name_it?: string;
  product_name_pt?: string;
  product_name_zh?: string;
  product_name_ja?: string;
  product_name_ko?: string;
  product_name_ru?: string;
  product_name_ar?: string;
  // Generic names in multiple languages
  generic_name_en?: string;
  generic_name_fr?: string;
  generic_name_de?: string;
  generic_name_es?: string;
  generic_name_it?: string;
  generic_name_pt?: string;
  generic_name_zh?: string;
  generic_name_ja?: string;
  generic_name_ko?: string;
  generic_name_ru?: string;
  generic_name_ar?: string;
  // Ingredients in multiple languages
  ingredients_text_en?: string;
  ingredients_text_fr?: string;
  ingredients_text_de?: string;
  ingredients_text_es?: string;
  ingredients_text_it?: string;
  ingredients_text_pt?: string;
  ingredients_text_zh?: string;
  ingredients_text_ja?: string;
  ingredients_text_ko?: string;
  ingredients_text_ru?: string;
  ingredients_text_ar?: string;
  // Additional metadata
  image_url?: string;
  image_small_url?: string;
  image_thumb_url?: string;
  completeness?: number;
  data_quality_errors_tags?: string[];
  data_quality_warnings_tags?: string[];
  nutrition_grades?: string;
  nova_groups?: string;
  ecoscore_grade?: string;
}

export interface OffSearchResponse {
  count: number;
  page: number;
  page_count: number;
  page_size: number;
  products: OffProduct[];
}

/** Response shape for the OFF single-product lookup endpoint (api/vN/product/CODE). */
export interface OffProductResponse {
  status?: number | string;
  status_verbose?: string;
  product?: OffProduct;
}

export interface OffFoodResult {
  code: string;
  productName: string;
  genericName?: string;
  brands?: string;
  categories?: string;
  ingredientsText?: string;
  gramsServing: number;
  displayDescription: string;
  // Nutrition per 100g
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugars?: number;
  salt?: number;
  // Quality indicators
  completeness?: number;
  nutritionGrade?: string;
  novaGroup?: number;
  ecoscore?: string;
  // Metadata
  imageUrl?: string;
  dataQuality: 'high' | 'medium' | 'low';
  // Canonical micronutrient amounts per 100g (key -> amount in canonical unit).
  micronutrients?: Record<string, number>;
  // Source identifier
  source: 'openfoodfacts';
}

/**
 * Extract canonical micronutrient amounts (per 100g) from an OFF product's
 * nutriments. All OFF `_100g` values are reported in grams.
 */
function extractOffMicronutrients(
  nutriments: OffProduct['nutriments']
): Record<string, number> | undefined {
  if (!nutriments) return undefined;

  const result: Record<string, number> = {};

  for (const [base, key] of Object.entries(OFF_NUTRIMENT_TO_KEY)) {
    // Prefer the *_100g field; OFF normalises these to grams.
    const value = nutriments[`${base}_100g`];
    if (value == null || !Number.isFinite(value)) continue;

    // Don't let a fallback source (e.g. `folates`) overwrite a primary one.
    if (result[key] != null) continue;

    const converted = toCanonicalMicronutrient(key, value, 'g');
    if (converted == null) continue;

    result[key] = converted;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Language mappings for Open Food Facts localization
 */
const LANGUAGE_MAPPINGS: Record<string, string> = {
  en: 'en',
  'en-US': 'en',
  'en-GB': 'en',
  fr: 'fr',
  'fr-FR': 'fr',
  de: 'de',
  'de-DE': 'de',
  es: 'es',
  'es-ES': 'es',
  it: 'it',
  'it-IT': 'it',
  pt: 'pt',
  'pt-PT': 'pt',
  'pt-BR': 'pt',
  zh: 'zh',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  ja: 'ja',
  'ja-JP': 'ja',
  ko: 'ko',
  'ko-KR': 'ko',
  ru: 'ru',
  'ru-RU': 'ru',
  ar: 'ar',
  'ar-SA': 'ar',
};

/**
 * Get the appropriate language code for OFF API based on user locale
 */
function getOffLanguageCode(userLocale: string): string {
  return LANGUAGE_MAPPINGS[userLocale] || LANGUAGE_MAPPINGS[userLocale.split('-')[0]] || 'en';
}

/**
 * Get localized field value with fallback chain
 */
function getLocalizedField(
  product: OffProduct,
  fieldPrefix: string,
  userLocale: string
): string | undefined {
  const primaryLang = getOffLanguageCode(userLocale);

  // Fallback chain: user language -> English -> French -> first available -> base field
  const fallbackChain = [
    `${fieldPrefix}_${primaryLang}`,
    `${fieldPrefix}_en`,
    `${fieldPrefix}_fr`, // French is often well-populated in OFF
    `${fieldPrefix}_de`,
    `${fieldPrefix}_es`,
    fieldPrefix,
  ];

  for (const fieldName of fallbackChain) {
    const value = (product as unknown as Record<string, unknown>)[fieldName];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

/**
 * Assess data quality based on multiple factors
 */
function assessDataQuality(product: OffProduct): 'high' | 'medium' | 'low' {
  let score = 0;

  // Basic nutrition data completeness (40 points max)
  if (product.nutriments?.['energy-kcal_100g']) score += 10;
  if (product.nutriments?.['proteins_100g']) score += 10;
  if (product.nutriments?.['fat_100g']) score += 10;
  if (product.nutriments?.['carbohydrates_100g']) score += 10;

  // Product identification (30 points max)
  if (product.product_name && product.product_name.length > 3) score += 15;
  if (product.brands && product.brands.length > 0) score += 10;
  if (product.generic_name && product.generic_name.length > 3) score += 5;

  // Additional metadata (30 points max)
  if (product.ingredients_text && product.ingredients_text.length > 10) score += 10;
  if (product.categories && product.categories.length > 0) score += 5;
  if (product.nutrition_grades) score += 5;
  if (product.completeness && product.completeness > 50) score += 10;

  // Quality issues (negative points)
  const errorCount = product.data_quality_errors_tags?.length || 0;
  const warningCount = product.data_quality_warnings_tags?.length || 0;
  score -= errorCount * 5 + warningCount * 2;

  // Classify based on score
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Process a raw OFF product into our standardized format
 */
function processOffProduct(product: OffProduct, userLocale = 'en'): OffFoodResult | null {
  try {
    // Get localized product name with fallback
    const productName = getLocalizedField(product, 'product_name', userLocale);
    if (!productName) {
      return null;
    }

    // Get nutrition data (always per 100g in OFF)
    const nutriments = product.nutriments || {};
    const calories = nutriments['energy-kcal_100g'] || 0;
    const protein = nutriments['proteins_100g'] || 0;
    const fat = nutriments['fat_100g'] || 0;
    const carbs = nutriments['carbohydrates_100g'] || 0;

    // Skip products without any nutrition data
    if (calories === 0 && protein === 0 && fat === 0 && carbs === 0) {
      return null;
    }

    // Get additional localized fields
    const genericName = getLocalizedField(product, 'generic_name', userLocale);
    const ingredientsText = getLocalizedField(product, 'ingredients_text', userLocale);

    // Create display description
    const displayDescription = createOffDisplayDescription(
      calories,
      protein,
      fat,
      carbs,
      product.brands,
      product.nutrition_grades
    );

    // Assess data quality
    const dataQuality = assessDataQuality(product);

    // Parse nova group (it's a string in the API)
    const novaGroup = product.nova_groups ? parseInt(product.nova_groups.toString()) : undefined;

    return {
      code: product.code,
      productName,
      genericName,
      brands: product.brands,
      categories: product.categories,
      ingredientsText,
      gramsServing: 100, // Always 100g for consistency
      displayDescription,
      calories,
      protein,
      fat,
      carbs,
      fiber: nutriments['fiber_100g'],
      sugars: nutriments['sugars_100g'],
      salt: nutriments['salt_100g'],
      completeness: product.completeness,
      nutritionGrade: product.nutrition_grades,
      novaGroup,
      ecoscore: product.ecoscore_grade,
      imageUrl: product.image_small_url || product.image_thumb_url,
      dataQuality,
      micronutrients: extractOffMicronutrients(nutriments),
      source: 'openfoodfacts' as const,
    };
  } catch {
    return null;
  }
}

/**
 * Create a standardized display description for OFF products
 */
function createOffDisplayDescription(
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  brands?: string,
  nutritionGrade?: string
): string {
  let description = `Per 100g - Calories: ${Math.round(calories)}kcal | Fat: ${fat.toFixed(1)}g | Carbs: ${carbs.toFixed(1)}g | Protein: ${protein.toFixed(1)}g`;

  // Add brand information
  if (brands && brands.trim().length > 0) {
    // Take first brand if multiple
    const primaryBrand = brands.split(',')[0].trim();
    description += ` [${primaryBrand}]`;
  }

  // Add nutrition grade if available
  if (nutritionGrade && ['a', 'b', 'c', 'd', 'e'].includes(nutritionGrade.toLowerCase())) {
    description += ` (Grade: ${nutritionGrade.toUpperCase()})`;
  }

  description += ' [Open Food Facts]';

  return description;
}

/**
 * Enhanced Open Food Facts search with proper API usage and multiple instances
 */
export async function searchOpenFoodFacts(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  userLocale = 'en'
): Promise<OffFoodResult[]> {
  try {
    // Check if this looks like a barcode (all numbers, 8-14 digits)
    const cleanQuery = query.replace(/[\s-]/g, '');
    const isBarcodeSearch = /^\d{8,14}$/.test(cleanQuery);

    if (isBarcodeSearch) {
      // For barcode searches, try direct product lookup first across multiple instances
      const directProduct = await getOffProductDetails(app, cleanQuery, userLocale);
      if (directProduct) {
        return [directProduct];
      }

      // If direct lookup fails, fall through to text search across instances
    }

    // Use multiple search approaches across different instances for better results
    const languageCode = getOffLanguageCode(userLocale);

    // Try both CGI and v2 APIs across multiple instances
    const [cgiResults, v2Results] = await Promise.all([
      searchOpenFoodFactsCGI(app, query, page, Math.ceil(pageSize * 0.7), languageCode),
      searchOpenFoodFactsV2(app, query, page, Math.ceil(pageSize * 0.3), languageCode),
    ]);

    // Combine and deduplicate results
    const allResults = [...cgiResults, ...v2Results];
    const uniqueResults = new Map<string, OffFoodResult>();

    allResults.forEach((result) => {
      if (!uniqueResults.has(result.code)) {
        uniqueResults.set(result.code, result);
      }
    });

    const mergedResults = Array.from(uniqueResults.values());

    // Sort by data quality and completeness
    mergedResults.sort((a, b) => {
      // First by data quality
      const qualityScore = { high: 3, medium: 2, low: 1 };
      const qualityDiff = qualityScore[b.dataQuality] - qualityScore[a.dataQuality];
      if (qualityDiff !== 0) return qualityDiff;

      // Then by completeness
      const aCompleteness = a.completeness || 0;
      const bCompleteness = b.completeness || 0;
      if (bCompleteness !== aCompleteness) return bCompleteness - aCompleteness;

      // Finally by nutrition grade (A is best)
      if (a.nutritionGrade && b.nutritionGrade) {
        return a.nutritionGrade.localeCompare(b.nutritionGrade);
      }

      return 0;
    });

    return mergedResults.slice(0, pageSize);
  } catch {
    return [];
  }
}

/**
 * Search using the CGI endpoint across multiple OFF instances
 */
async function searchOpenFoodFactsCGI(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  languageCode = 'en'
): Promise<OffFoodResult[]> {
  // Open Food Facts instances, ordered by coverage. The primary (world)
  // instance usually satisfies the request on its own; the regional instances
  // are only used as a parallel fallback when more results are needed, so the
  // common case is a single request rather than a sequential chain.
  const instances = [
    'https://world.openfoodfacts.org',
    'https://us.openfoodfacts.org', // United States
    'https://fr.openfoodfacts.org', // France - many European products
    'https://uk.openfoodfacts.org', // United Kingdom
    'https://ci.openfoodfacts.org', // Côte d'Ivoire - African/Middle Eastern products
  ];

  const fetchInstance = async (baseInstance: string): Promise<OffFoodResult[]> => {
    try {
      const searchParams = new URLSearchParams({
        search_terms: query.trim(),
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: Math.min(pageSize, 24).toString(), // OFF CGI max is 24
        page: (page + 1).toString(), // OFF uses 1-based page numbers
      });
      if (languageCode !== 'en') {
        searchParams.append('lc', languageCode);
      }

      const response = await requestUrl({
        url: `${baseInstance}/cgi/search.pl?${searchParams.toString()}`,
        method: 'GET',
        headers: {
          'User-Agent': 'ObsidianMacrosPlugin/1.0 (Nutrition tracking for Obsidian)',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.json || response.status !== 200) return [];

      const data = response.json as OffSearchResponse | OffProduct[];
      let products: OffProduct[] = [];
      if (Array.isArray(data)) {
        products = data;
      } else if (data.products && Array.isArray(data.products)) {
        products = data.products;
      } else {
        return [];
      }

      const out: OffFoodResult[] = [];
      for (const product of products) {
        const processed = processOffProduct(product, languageCode);
        if (processed) out.push(processed);
      }
      return out;
    } catch {
      return [];
    }
  };

  try {
    const merged = new Map<string, OffFoodResult>();

    // Query the primary instance first - this alone is usually enough.
    for (const result of await fetchInstance(instances[0])) {
      if (!merged.has(result.code)) merged.set(result.code, result);
    }

    // Only fan out to the regional instances (in parallel) if we still need more.
    if (merged.size < pageSize) {
      const fallbackBatches = await Promise.all(instances.slice(1).map(fetchInstance));
      for (const batch of fallbackBatches) {
        for (const result of batch) {
          if (!merged.has(result.code)) merged.set(result.code, result);
        }
        if (merged.size >= pageSize) break;
      }
    }

    return Array.from(merged.values()).slice(0, pageSize);
  } catch {
    return [];
  }
}

/**
 * Search using API v2 endpoint
 */
async function searchOpenFoodFactsV2(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  languageCode = 'en'
): Promise<OffFoodResult[]> {
  try {
    // Use the correct v2 API endpoint
    const baseUrl = 'https://world.openfoodfacts.org/api/v2/search';

    const searchParams = new URLSearchParams({
      q: query.trim(), // Use 'q' parameter for general search
      page: (page + 1).toString(), // OFF uses 1-based page numbers
      page_size: Math.min(pageSize, 25).toString(),
      fields: [
        'code',
        'product_name',
        'generic_name',
        'brands',
        'categories',
        'ingredients_text',
        'nutriments',
        'completeness',
        'nutrition_grades',
        'nova_groups',
        'ecoscore_grade',
        'image_small_url',
        'image_thumb_url',
        'data_quality_errors_tags',
        'data_quality_warnings_tags',
        // Multi-language fields
        'product_name_en',
        'product_name_fr',
        'product_name_de',
        'product_name_es',
        'product_name_it',
        'product_name_pt',
        'ingredients_text_en',
        'ingredients_text_fr',
        'ingredients_text_de',
        'ingredients_text_es',
        'ingredients_text_it',
        'ingredients_text_pt',
      ].join(','),
    });

    // Add language-specific search preferences
    if (languageCode !== 'en') {
      searchParams.append('lc', languageCode);
    }

    const url = `${baseUrl}?${searchParams.toString()}`;

    const response = await requestUrl({
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'ObsidianMacrosPlugin/1.0 (Nutrition tracking for Obsidian)',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.json || response.status !== 200) {
      return [];
    }

    const data = response.json as OffSearchResponse;

    if (!data.products || !Array.isArray(data.products)) {
      return [];
    }

    // Process and filter products
    const results: OffFoodResult[] = [];

    for (const product of data.products) {
      const processed = processOffProduct(product, languageCode);
      if (processed) {
        results.push(processed);
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Get detailed product information by barcode/code from multiple OFF instances
 */
export async function getOffProductDetails(
  app: App,
  productCode: string,
  userLocale = 'en'
): Promise<OffFoodResult | null> {
  try {
    // Try different Open Food Facts instances/endpoints
    const endpoints = [
      // Try world instance first
      `https://world.openfoodfacts.org/api/v0/product/${productCode}.json`,
      // Try country-specific instances that often have regional products
      `https://ci.openfoodfacts.org/api/v0/product/${productCode}.json`, // Côte d'Ivoire
      `https://fr.openfoodfacts.org/api/v0/product/${productCode}.json`, // France
      `https://us.openfoodfacts.org/api/v0/product/${productCode}.json`, // United States
      `https://uk.openfoodfacts.org/api/v0/product/${productCode}.json`, // United Kingdom
      `https://de.openfoodfacts.org/api/v0/product/${productCode}.json`, // Germany
      // Fallback to v2 endpoints
      `https://world.openfoodfacts.org/api/v2/product/${productCode}`,
      `https://ci.openfoodfacts.org/api/v2/product/${productCode}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await requestUrl({
          url: endpoint,
          method: 'GET',
          headers: {
            'User-Agent': 'ObsidianMacrosPlugin/1.0 (Nutrition tracking for Obsidian)',
            Accept: 'application/json',
          },
        });

        if (!response.json || response.status !== 200) {
          continue; // Try next endpoint
        }

        const data = response.json as OffProductResponse;

        // Handle different status formats from OFF API
        let isProductFound = false;

        // Check various status indicators
        if (data.status === 1 || data.status === '1') {
          isProductFound = true;
        } else if (data.status === 'product found') {
          isProductFound = true;
        } else if (
          data.product &&
          Object.keys(data.product).length > 0 &&
          data.product.product_name
        ) {
          // Sometimes status might be missing but product exists with valid data
          isProductFound = true;
        }

        if (!isProductFound || !data.product) {
          continue; // Try next endpoint
        }

        // Process the product data
        const result = processOffProduct(data.product, userLocale);
        if (result) {
          return result;
        } else {
          continue; // Try next endpoint
        }
      } catch {
        continue; // Try next endpoint
      }
    }

    // If we get here, all endpoints failed
    return null;
  } catch {
    return null;
  }
}

/**
 * Search Open Food Facts by category with localization
 */
export async function searchOffByCategory(
  app: App,
  category: string,
  page: number,
  pageSize: number,
  userLocale = 'en'
): Promise<OffFoodResult[]> {
  try {
    // Use v2 API for category search
    const baseUrl = 'https://world.openfoodfacts.org/api/v2/search';
    const languageCode = getOffLanguageCode(userLocale);

    const searchParams = new URLSearchParams({
      categories_tags: category.toLowerCase(),
      page: (page + 1).toString(),
      page_size: Math.min(pageSize, 100).toString(),
      fields: [
        'code',
        'product_name',
        'generic_name',
        'brands',
        'categories',
        'nutriments',
        'completeness',
        'nutrition_grades',
        'nova_groups',
        'image_small_url',
        // Multi-language product names
        'product_name_en',
        'product_name_fr',
        'product_name_de',
        'product_name_es',
        'product_name_it',
        'product_name_pt',
      ].join(','),
    });

    if (languageCode !== 'en') {
      searchParams.append('lc', languageCode);
    }

    const url = `${baseUrl}?${searchParams.toString()}`;

    const response = await requestUrl({
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'ObsidianMacrosPlugin/1.0 (Nutrition tracking for Obsidian)',
        Accept: 'application/json',
      },
    });

    if (!response.json || response.status !== 200) {
      return [];
    }

    const data = response.json as OffSearchResponse;

    if (!data.products || !Array.isArray(data.products)) {
      return [];
    }

    const results: OffFoodResult[] = [];

    for (const product of data.products) {
      const processed = processOffProduct(product, userLocale);
      if (processed && processed.dataQuality !== 'low') {
        results.push(processed);
      }
    }

    return results.slice(0, pageSize);
  } catch {
    return [];
  }
}

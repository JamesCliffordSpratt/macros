import { App, requestUrl } from 'obsidian';
import { toCanonicalMicronutrient } from '../utils/nutrition/micronutrients';

/**
 * Mapping of USDA FoodData Central nutrient numbers to the plugin's canonical
 * micronutrient keys. Values are converted from the unit reported by the API
 * (`unitName`) into each nutrient's canonical unit, so copper (reported in mg
 * by USDA but tracked in µg here) and similar mismatches are handled
 * automatically.
 */
const USDA_NUTRIENT_NUMBER_TO_KEY: Record<string, string> = {
  // Vitamins
  '320': 'vitamin_a', // Vitamin A, RAE (µg)
  '401': 'vitamin_c', // Vitamin C (mg)
  '328': 'vitamin_d', // Vitamin D (D2 + D3) (µg)
  '323': 'vitamin_e', // Vitamin E (alpha-tocopherol) (mg)
  '430': 'vitamin_k', // Vitamin K (phylloquinone) (µg)
  '404': 'thiamin', // Thiamin (mg)
  '405': 'riboflavin', // Riboflavin (mg)
  '406': 'niacin', // Niacin (mg)
  '415': 'vitamin_b6', // Vitamin B-6 (mg)
  '435': 'folate', // Folate, DFE (µg)
  '417': 'folate', // Folate, total (µg) — fallback
  '418': 'vitamin_b12', // Vitamin B-12 (µg)
  '410': 'pantothenic_acid', // Pantothenic acid (mg)
  '416': 'biotin', // Biotin (µg)
  '421': 'choline', // Choline, total (mg)
  // Minerals
  '301': 'calcium', // Calcium (mg)
  '303': 'iron', // Iron (mg)
  '304': 'magnesium', // Magnesium (mg)
  '305': 'phosphorus', // Phosphorus (mg)
  '306': 'potassium', // Potassium (mg)
  '307': 'sodium', // Sodium (mg)
  '309': 'zinc', // Zinc (mg)
  '312': 'copper', // Copper (mg) -> converted to µg
  '315': 'manganese', // Manganese (mg)
  '317': 'selenium', // Selenium (µg)
  '314': 'iodine', // Iodine (µg)
  // Other tracked nutrients
  '291': 'fiber', // Fiber, total dietary (g)
  '269': 'sugar', // Total sugars (g)
  '539': 'added_sugar', // Added sugars (g)
  '606': 'saturated_fat', // Fatty acids, total saturated (g)
  '601': 'cholesterol', // Cholesterol (mg)
};

/**
 * Nutrient numbers for which a more specific source should win when both are
 * present in a single food (e.g. Folate DFE 435 preferred over total 417).
 */
const USDA_KEY_PREFERRED_NUMBER: Record<string, string> = {
  folate: '435',
};

/**
 * USDA FoodData Central API Integration - Enhanced Version
 * -------------------------------------------
 * Handles API calls to the USDA FoodData Central platform.
 * This module:
 *  - Constructs requests to the FDC foods/search endpoint
 *  - Fetches both Foundation Foods and Branded Foods
 *  - Prioritizes Foundation foods over Branded foods
 *  - Standardizes all results to 100g servings for consistency
 *  - Supports brand name searching for branded foods
 */

export interface UsdaFoodResult {
  fdcId: number;
  description: string;
  brandName?: string;
  gramsServing: number;
  displayDescription: string;
  dataType: string;
  ingredients?: string;
  isFoundation: boolean;
  isBranded: boolean;
  isSrLegacy: boolean;
  /** Canonical micronutrient amounts per 100g (key -> amount in canonical unit). */
  micronutrients?: Record<string, number>;
}

interface UsdaApiResponse {
  foods: UsdaFood[];
  totalHits: number;
  currentPage: number;
  totalPages: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients: UsdaNutrient[];
  labelNutrients?: {
    calories?: { value: number };
    protein?: { value: number };
    fat?: { value: number };
    carbohydrates?: { value: number };
  };
  publicationDate?: string;
  scientificName?: string;
  foodCategory?: string;
  ndbNumber?: string;
}

interface UsdaNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

/**
 * Enhanced search function that prioritizes Foundation Foods
 * @param app The Obsidian App instance
 * @param query Search query string
 * @param page Page number (0-based)
 * @param pageSize Number of results per page
 * @param apiKey USDA FDC API key
 * @returns Promise<UsdaFoodResult[]> Array of food results with Foundation Foods first
 */
export async function searchFoods(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  apiKey: string
): Promise<UsdaFoodResult[]> {
  try {
    // USDA FDC API endpoint
    const baseUrl = 'https://api.nal.usda.gov/fdc/v1/foods/search';

    // Strategy: Search Foundation foods first, then supplement with others
    const searchQuery = query.trim();

    const buildBody = (dataType: string, size: number) => ({
      query: searchQuery,
      dataType: [dataType],
      pageSize: Math.min(size, 50),
      pageNumber: page,
      requireAllWords: false,
    });

    const fetchType = async (dataType: string, size: number): Promise<UsdaFoodResult[]> => {
      try {
        const response = await requestUrl({
          url: `${baseUrl}?api_key=${apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody(dataType, size)),
        });
        if (response.json && response.status === 200) {
          const data = response.json as UsdaApiResponse;
          if (data.foods && data.foods.length > 0) {
            return data.foods.map((food) => processFoodItem(food)).filter((food) => food !== null);
          }
        }
      } catch {
        // Ignore individual data-type failures; other types may still succeed.
      }
      return [];
    };

    // Fetch all data types concurrently for speed, then combine in priority
    // order (Foundation > SR Legacy > Branded) and de-duplicate by fdcId.
    const [foundation, srLegacy, branded] = await Promise.all([
      fetchType('Foundation', Math.min(pageSize, 50)),
      fetchType('SR Legacy', Math.min(pageSize, 25)),
      fetchType('Branded', Math.min(pageSize, 25)),
    ]);

    const seen = new Set<number>();
    const allResults: UsdaFoodResult[] = [];
    for (const item of [...foundation, ...srLegacy, ...branded]) {
      if (seen.has(item.fdcId)) continue;
      seen.add(item.fdcId);
      allResults.push(item);
    }

    return allResults.slice(0, pageSize);
  } catch {
    return [];
  }
}

/**
 * Enhanced food item processor with better categorization
 * @param food Raw USDA food item
 * @returns UsdaFoodResult | null
 */
function processFoodItem(food: UsdaFood): UsdaFoodResult | null {
  try {
    // Always use 100g serving for consistency across all results
    const gramsServing = 100;

    // Create display description - always show as 100g
    const displayDescription = createDisplayDescription(food, gramsServing);

    const isFoundation = food.dataType === 'Foundation';
    const isBranded = food.dataType === 'Branded';
    const isSrLegacy = food.dataType === 'SR Legacy';

    return {
      fdcId: food.fdcId,
      description: food.description,
      brandName: food.brandOwner || food.brandName,
      gramsServing,
      displayDescription,
      dataType: food.dataType,
      ingredients: food.ingredients,
      isFoundation,
      isBranded,
      isSrLegacy,
      micronutrients: extractUsdaMicronutrients(food),
    };
  } catch {
    return null;
  }
}

/**
 * Compute the factor needed to express a food's nutrient values per 100g.
 * Foundation and SR Legacy foods are already per 100g; branded foods may use a
 * label serving size and are scaled accordingly. Mirrors the logic used by
 * `createDisplayDescription` so macros and micronutrients stay consistent.
 */
function getUsdaPer100gScaleFactor(food: UsdaFood): number {
  if (food.dataType === 'Branded' && food.servingSize && food.servingSizeUnit) {
    const servingGrams = convertToGrams(food.servingSize, food.servingSizeUnit);
    if (servingGrams && servingGrams > 0 && servingGrams !== 100) {
      return 100 / servingGrams;
    }
  }
  return 1;
}

/**
 * Extract canonical micronutrient amounts (per 100g) from a USDA food's
 * detailed `foodNutrients` list.
 */
function extractUsdaMicronutrients(food: UsdaFood): Record<string, number> | undefined {
  if (!Array.isArray(food.foodNutrients) || food.foodNutrients.length === 0) {
    return undefined;
  }

  const scaleFactor = getUsdaPer100gScaleFactor(food);
  const result: Record<string, number> = {};
  // Track which USDA nutrient number populated each key so a preferred source
  // (e.g. Folate DFE) can override a less specific one (Folate total).
  const sourceNumber: Record<string, string> = {};

  for (const nutrient of food.foodNutrients) {
    const key = USDA_NUTRIENT_NUMBER_TO_KEY[nutrient.nutrientNumber];
    if (!key) continue;
    if (nutrient.value == null || !Number.isFinite(nutrient.value)) continue;

    // Respect preferred-number resolution for keys with multiple sources.
    const preferred = USDA_KEY_PREFERRED_NUMBER[key];
    if (result[key] != null) {
      if (preferred && sourceNumber[key] === preferred && nutrient.nutrientNumber !== preferred) {
        continue; // already have the preferred source
      }
      if (preferred && nutrient.nutrientNumber !== preferred) {
        continue; // keep first / preferred
      }
    }

    const converted = toCanonicalMicronutrient(
      key,
      nutrient.value * scaleFactor,
      nutrient.unitName || ''
    );
    if (converted == null) continue;

    result[key] = converted;
    sourceNumber[key] = nutrient.nutrientNumber;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Enhanced display description creator with better nutrition info extraction
 * @param food USDA food item
 * @param gramsServing Serving size (always 100g)
 * @returns string
 */
function createDisplayDescription(food: UsdaFood, _gramsServing: number): string {
  try {
    // Always display as "Per 100g" since we're standardizing to 100g
    const standardGrams = 100;

    // Get basic nutrition info for display
    let calories = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;

    // Try label nutrients first (more accurate for branded foods)
    if (food.labelNutrients) {
      calories = food.labelNutrients.calories?.value || 0;
      protein = food.labelNutrients.protein?.value || 0;
      fat = food.labelNutrients.fat?.value || 0;
      carbs = food.labelNutrients.carbohydrates?.value || 0;
    } else if (food.foodNutrients) {
      // Fall back to detailed nutrients with enhanced mapping
      for (const nutrient of food.foodNutrients) {
        switch (nutrient.nutrientNumber) {
          case '208': // Energy (kcal)
            if (nutrient.unitName.toLowerCase() === 'kcal') {
              calories = nutrient.value;
            }
            break;
          case '203': // Protein
            if (nutrient.unitName.toLowerCase() === 'g') {
              protein = nutrient.value;
            }
            break;
          case '204': // Total lipid (fat)
            if (nutrient.unitName.toLowerCase() === 'g') {
              fat = nutrient.value;
            }
            break;
          case '205': // Carbohydrate, by difference
            if (nutrient.unitName.toLowerCase() === 'g') {
              carbs = nutrient.value;
            }
            break;
          case '269': // Total sugars - could be useful for carbs if main carbs not available
            if (nutrient.unitName.toLowerCase() === 'g' && carbs === 0) {
              carbs = nutrient.value;
            }
            break;
        }
      }
    }

    // Enhanced scaling logic
    let scaleFactor = 1;

    // For Foundation and SR Legacy foods, data is typically per 100g already
    if (food.dataType === 'Foundation' || food.dataType === 'SR Legacy') {
      scaleFactor = 1; // No scaling needed
    } else if (food.dataType === 'Branded' && food.servingSize && food.servingSizeUnit) {
      // For branded foods, scale to 100g if serving size is different
      const servingGrams = convertToGrams(food.servingSize, food.servingSizeUnit);
      if (servingGrams && servingGrams > 0 && servingGrams !== 100) {
        scaleFactor = 100 / servingGrams;
      }
    }

    const scaledCalories = Math.round(calories * scaleFactor);
    const scaledProtein = Math.round(protein * scaleFactor * 10) / 10;
    const scaledFat = Math.round(fat * scaleFactor * 10) / 10;
    const scaledCarbs = Math.round(carbs * scaleFactor * 10) / 10;

    // Enhanced description format with data type indicator
    let typeIndicator = '';
    if (food.dataType === 'Foundation') {
      typeIndicator = ' [Foundation]';
    } else if (food.dataType === 'SR Legacy') {
      typeIndicator = ' [USDA SR]';
    } else if (food.dataType === 'Branded' && food.brandOwner) {
      typeIndicator = ` [${food.brandOwner}]`;
    }

    return `Per ${standardGrams}g - Calories: ${scaledCalories}kcal | Fat: ${scaledFat}g | Carbs: ${scaledCarbs}g | Protein: ${scaledProtein}g${typeIndicator}`;
  } catch {
    return `Per 100g${food.dataType === 'Foundation' ? ' [Foundation]' : ''}`;
  }
}

/**
 * Enhanced unit conversion with more comprehensive mappings
 * @param value Numeric value
 * @param unit Unit string
 * @returns number | null
 */
function convertToGrams(value: number, unit: string): number | null {
  const unitLower = unit.toLowerCase().trim();

  // Enhanced conversions mapping
  const conversions: Record<string, number> = {
    // Weight units
    g: 1,
    gram: 1,
    grams: 1,
    oz: 28.35,
    ounce: 28.35,
    ounces: 28.35,
    lb: 453.592,
    lbs: 453.592,
    pound: 453.592,
    pounds: 453.592,
    kg: 1000,
    kilogram: 1000,
    kilograms: 1000,

    // Volume units (approximate for water-like density)
    ml: 1,
    milliliter: 1,
    milliliters: 1,
    l: 1000,
    liter: 1000,
    liters: 1000,
    'fl oz': 29.5735, // US fluid ounce
    'fl. oz': 29.5735,
    'fluid ounce': 29.5735,
    'fluid ounces': 29.5735,

    // Common kitchen measurements
    cup: 240,
    cups: 240,
    c: 240,
    tbsp: 15,
    tablespoon: 15,
    tablespoons: 15,
    tsp: 5,
    teaspoon: 5,
    teaspoons: 5,
    t: 5,

    // Common serving sizes
    serving: 100, // Default assumption
    portion: 100,
    piece: 100,
    slice: 30,
    medium: 150,
    large: 200,
    small: 75,

    // Package sizes
    container: 150,
    package: 100,
    can: 200,
    bottle: 300,
  };

  const multiplier = conversions[unitLower];
  return multiplier ? value * multiplier : null;
}

/**
 * Enhanced search with better error handling and fallback strategies
 * @param app The Obsidian App instance
 * @param query Search query string
 * @param page Page number (0-based)
 * @param pageSize Number of results per page
 * @param apiKey USDA FDC API key
 * @returns Promise<UsdaFoodResult[]> Array of food results
 */
export async function searchFoodsWithFallback(
  app: App,
  query: string,
  page: number,
  pageSize: number,
  apiKey: string
): Promise<UsdaFoodResult[]> {
  try {
    // First attempt: Full search with all data types
    const results = await searchFoods(app, query, page, pageSize, apiKey);

    if (results.length > 0) {
      return results;
    }

    // Fallback 1: Try with simplified query (remove special characters)
    const simplifiedQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (simplifiedQuery !== query && simplifiedQuery.length > 0) {
      const fallbackResults = await searchFoods(app, simplifiedQuery, page, pageSize, apiKey);
      if (fallbackResults.length > 0) {
        return fallbackResults;
      }
    }

    // Fallback 2: Try Foundation foods only for common ingredients
    const foundationOnlyBody = {
      query: query.trim(),
      dataType: ['Foundation'],
      pageSize: Math.min(pageSize, 50),
      pageNumber: page,
      requireAllWords: false,
    };

    const foundationResponse = await requestUrl({
      url: `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(foundationOnlyBody),
    });

    const foundationData = foundationResponse.json as UsdaApiResponse;
    if (foundationData && foundationData.foods) {
      const foundationFoods = foundationData.foods
        .map((food) => processFoodItem(food))
        .filter((food): food is UsdaFoodResult => food !== null);

      if (foundationFoods.length > 0) {
        return foundationFoods.slice(0, pageSize);
      }
    }

    return [];
  } catch {
    return [];
  }
}

import { App, requestUrl } from 'obsidian';

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

    const allResults: UsdaFoodResult[] = [];

    // Step 1: Search Foundation foods first
    const foundationBody = {
      query: searchQuery,
      dataType: ['Foundation'],
      pageSize: Math.min(pageSize, 50),
      pageNumber: page,
      requireAllWords: false,
    };

    const foundationResponse = await requestUrl({
      url: `${baseUrl}?api_key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(foundationBody),
    });

    if (foundationResponse.json && foundationResponse.status === 200) {
      const foundationData = foundationResponse.json as UsdaApiResponse;

      if (foundationData.foods && foundationData.foods.length > 0) {
        const foundationResults = foundationData.foods
          .map((food) => processFoodItem(food))
          .filter((food) => food !== null) as UsdaFoodResult[];
        allResults.push(...foundationResults);
      }
    }

    // Step 2: If we don't have enough results, search SR Legacy
    const remainingSpace = pageSize - allResults.length;
    if (remainingSpace > 0) {
      const srLegacyBody = {
        query: searchQuery,
        dataType: ['SR Legacy'],
        pageSize: Math.min(remainingSpace, 25),
        pageNumber: page,
        requireAllWords: false,
      };

      const srResponse = await requestUrl({
        url: `${baseUrl}?api_key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(srLegacyBody),
      });

      if (srResponse.json && srResponse.status === 200) {
        const srData = srResponse.json as UsdaApiResponse;

        if (srData.foods && srData.foods.length > 0) {
          const srResults = srData.foods
            .map((food) => processFoodItem(food))
            .filter((food) => food !== null) as UsdaFoodResult[];
          allResults.push(...srResults);
        }
      }
    }

    // Step 3: If we still don't have enough results, search Branded foods
    const finalRemainingSpace = pageSize - allResults.length;
    if (finalRemainingSpace > 0) {
      const brandedBody = {
        query: searchQuery,
        dataType: ['Branded'],
        pageSize: Math.min(finalRemainingSpace, 25),
        pageNumber: page,
        requireAllWords: false,
      };

      const brandedResponse = await requestUrl({
        url: `${baseUrl}?api_key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(brandedBody),
      });

      if (brandedResponse.json && brandedResponse.status === 200) {
        const brandedData = brandedResponse.json as UsdaApiResponse;

        if (brandedData.foods && brandedData.foods.length > 0) {
          const brandedResults = brandedData.foods
            .map((food) => processFoodItem(food))
            .filter((food) => food !== null) as UsdaFoodResult[];
          allResults.push(...brandedResults);
        }
      }
    }

    return allResults.slice(0, pageSize);
  } catch (error) {
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
    };
  } catch (error) {
    return null;
  }
}

/**
 * Enhanced display description creator with better nutrition info extraction
 * @param food USDA food item
 * @param gramsServing Serving size (always 100g)
 * @returns string
 */
function createDisplayDescription(food: UsdaFood, gramsServing: number): string {
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
  } catch (error) {
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

    if (foundationResponse.json && foundationResponse.json.foods) {
      const foundationFoods = foundationResponse.json.foods
        .map((food: UsdaFood) => processFoodItem(food))
        .filter((food: UsdaFoodResult | null) => food !== null) as UsdaFoodResult[];

      if (foundationFoods.length > 0) {
        return foundationFoods.slice(0, pageSize);
      }
    }

    return [];
  } catch (error) {
    return [];
  }
}

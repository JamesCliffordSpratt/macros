import { App } from 'obsidian';
import { UnifiedFoodResult } from './search';
import { getOffProductDetails } from './openFoodFacts';

export interface BarcodeSearchOptions {
  openFoodFacts?: { enabled: boolean };
  usda?: { enabled: boolean; apiKey: string };
}

/**
 * Enhanced search for a product by barcode across available databases
 * Priority: Open Food Facts (has excellent barcode support) -> USDA (limited)
 */
export async function searchByBarcode(
  app: App,
  barcode: string,
  sources: BarcodeSearchOptions,
  userLocale = 'en'
): Promise<UnifiedFoodResult[]> {
  const results: UnifiedFoodResult[] = [];

  // Validate and clean barcode format
  const cleanedBarcode = cleanBarcode(barcode);
  if (!isValidBarcode(cleanedBarcode)) {
    throw new Error(`Invalid barcode format: ${barcode}`);
  }

  // Try Open Food Facts first (best barcode database)
  if (sources.openFoodFacts?.enabled !== false) {
    try {
      const offResult = await searchOpenFoodFactsByBarcode(app, cleanedBarcode, userLocale);
      if (offResult) {
        results.push(offResult);
      }
    } catch (error) {
      // Silent fallback to next source
    }
  }

  // Try USDA (limited barcode support, mainly for branded foods)
  if (sources.usda?.enabled && sources.usda.apiKey) {
    try {
      const usdaResults = await searchUsdaByBarcode(app, cleanedBarcode, sources.usda.apiKey);
      if (usdaResults.length > 0) {
        results.push(...usdaResults);
      }
    } catch (error) {
      // Silent fallback - USDA barcode support is limited anyway
    }
  }

  return results;
}

/**
 * Search Open Food Facts by barcode with multiple fallback methods
 */
async function searchOpenFoodFactsByBarcode(
  app: App,
  barcode: string,
  userLocale: string
): Promise<UnifiedFoodResult | null> {
  try {
    // Method 1: Direct product lookup by barcode
    const directProduct = await getOffProductDetails(app, barcode, userLocale);

    if (directProduct) {
      return convertToUnifiedResult(directProduct);
    }

    // Method 2: Search by barcode as text using search API
    const { searchOpenFoodFacts } = await import('./openFoodFacts');
    const searchResults = await searchOpenFoodFacts(app, barcode, 0, 5, userLocale);

    if (searchResults.length > 0) {
      // Look for exact barcode match
      const exactMatch = searchResults.find((result) => result.code === barcode);
      if (exactMatch) {
        return convertToUnifiedResult(exactMatch);
      }

      // If no exact match, return the first result
      return convertToUnifiedResult(searchResults[0]);
    }

    // Method 3: Try alternative barcode formats
    const alternativeFormats = generateBarcodeAlternatives(barcode);

    for (const altBarcode of alternativeFormats) {
      const altProduct = await getOffProductDetails(app, altBarcode, userLocale);
      if (altProduct) {
        return convertToUnifiedResult(altProduct);
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Convert OffFoodResult to UnifiedFoodResult
 */
function convertToUnifiedResult(product: any): UnifiedFoodResult {
  return {
    id: `off_${product.code}`,
    name: product.productName,
    description: product.displayDescription,
    gramsServing: product.gramsServing,
    source: 'openfoodfacts' as const,
    brandName: product.brands,
    nutritionGrade: product.nutritionGrade,
    novaGroup: product.novaGroup,
    dataQuality: product.dataQuality,
    completeness: product.completeness,
    ecoscore: product.ecoscore,
    imageUrl: product.imageUrl,
    categories: product.categories,
    ingredients: product.ingredientsText,
    raw: product,
  };
}

/**
 * Generate alternative barcode formats to try
 */
function generateBarcodeAlternatives(barcode: string): string[] {
  const alternatives: string[] = [];

  // Remove leading zeros
  if (barcode.startsWith('0')) {
    alternatives.push(barcode.substring(1));
  }

  // Add leading zero if not present
  if (!barcode.startsWith('0') && barcode.length === 12) {
    alternatives.push('0' + barcode);
  }

  // Try with different lengths for UPC/EAN conversion
  if (barcode.length === 13 && barcode.startsWith('0')) {
    // EAN-13 to UPC-A conversion
    alternatives.push(barcode.substring(1));
  } else if (barcode.length === 12) {
    // UPC-A to EAN-13 conversion
    alternatives.push('0' + barcode);
  }

  return alternatives.filter((alt) => alt !== barcode); // Remove duplicates
}

/**
 * Search USDA by barcode (limited support)
 * USDA doesn't have direct barcode search, but we can try UPC field matching
 */
async function searchUsdaByBarcode(
  app: App,
  barcode: string,
  apiKey: string
): Promise<UnifiedFoodResult[]> {
  try {
    // Import USDA search function
    const { searchFoods } = await import('./usda');

    // Try searching by UPC number (convert barcode to UPC format)
    const upcQuery = formatBarcodeForUsda(barcode);

    const results = await searchFoods(app, upcQuery, 0, 10, apiKey);

    // Filter results that might match the barcode
    const matchingResults = results.filter((result) => {
      // Look for UPC/barcode in the description or ingredients
      const searchText = `${result.description} ${result.ingredients || ''}`.toLowerCase();
      const hasBarcode =
        searchText.includes(barcode.toLowerCase()) || searchText.includes(upcQuery.toLowerCase());

      return hasBarcode;
    });

    // Convert to UnifiedFoodResult format
    return matchingResults.map((item) => ({
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
 * Clean and normalize barcode
 */
function cleanBarcode(barcode: string): string {
  // Remove any spaces, dashes, or other non-digit characters
  return barcode.replace(/[^\d]/g, '');
}

/**
 * Validate barcode format
 */
function isValidBarcode(barcode: string): boolean {
  // Check if it's all digits and has valid length
  if (!/^\d+$/.test(barcode)) {
    return false;
  }

  // Common barcode lengths:
  // EAN-8: 8 digits
  // EAN-13: 13 digits
  // UPC-A: 12 digits
  // UPC-E: 8 digits (can be expanded to 12)
  // Code 128: variable length
  // ITF-14: 14 digits
  const validLengths = [8, 12, 13, 14]; // Most common formats

  return validLengths.includes(barcode.length) || (barcode.length >= 6 && barcode.length <= 18);
}

/**
 * Format barcode for USDA search
 */
function formatBarcodeForUsda(barcode: string): string {
  // Clean the barcode
  const cleaned = barcode;

  // For USDA, try searching with and without leading zeros
  if (cleaned.length === 12) {
    // UPC-A, try with leading zero for EAN-13
    return `0${cleaned}`;
  }

  if (cleaned.length === 13 && cleaned.startsWith('0')) {
    // EAN-13 starting with 0, try without leading zero for UPC-A
    return cleaned.substring(1);
  }

  return cleaned;
}

/**
 * Enhanced barcode validation with checksum verification
 */
export function validateBarcodeChecksum(barcode: string): boolean {
  const cleaned = cleanBarcode(barcode);

  if (cleaned.length === 13) {
    // EAN-13 checksum validation
    return validateEan13Checksum(cleaned);
  } else if (cleaned.length === 12) {
    // UPC-A checksum validation
    return validateUpcAChecksum(cleaned);
  } else if (cleaned.length === 8) {
    // EAN-8 checksum validation
    return validateEan8Checksum(cleaned);
  }

  // For other formats, just check if it's all digits
  return /^\d+$/.test(cleaned);
}

function validateEan13Checksum(ean: string): boolean {
  if (ean.length !== 13 || !/^\d+$/.test(ean)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(ean[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum === parseInt(ean[12]);
}

function validateUpcAChecksum(upc: string): boolean {
  if (upc.length !== 12 || !/^\d+$/.test(upc)) return false;

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(upc[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum === parseInt(upc[11]);
}

function validateEan8Checksum(ean: string): boolean {
  if (ean.length !== 8 || !/^\d+$/.test(ean)) return false;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(ean[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum === parseInt(ean[7]);
}

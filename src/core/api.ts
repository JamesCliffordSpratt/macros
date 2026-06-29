import { App, requestUrl } from 'obsidian';
import { extractServingSize } from '../utils';
import { toCanonicalMicronutrient } from '../utils/nutrition/micronutrients';
/*
 * API Integration for Macros Plugin
 * -------------------------------------------
 * Handles API calls to the FatSecret platform.
 * This module:
 *  - Constructs OAuth-signed requests using direct requestUrl method.
 *  - Fetches food data using user-provided search terms.
 *  - Filters and processes API responses to ensure valid serving sizes (in grams).
 *  - Fetches detailed per-serving micronutrient data via food.get.v4.
 */

export interface FoodItem {
  food_id?: string;
  food_name: string;
  food_description: string;
}

/** Shape of the FatSecret error object returned on failed requests. */
interface FatSecretError {
  code?: string;
  message?: string;
}

/** Response shape for the `foods.search` endpoint. */
interface FatSecretFoodsSearchResponse {
  error?: FatSecretError;
  foods?: {
    food?: FoodItem | FoodItem[];
  };
}

/**
 * A single FatSecret serving node. Known fields are typed explicitly; the
 * index signature covers the per-serving micronutrient fields (all reported as
 * strings) listed in FATSECRET_FIELD_TO_KEY.
 */
interface FatSecretServing {
  metric_serving_unit?: string;
  metric_serving_amount?: string;
  [field: string]: string | undefined;
}

/** Response shape for the `food.get.v4` endpoint. */
interface FatSecretFoodGetResponse {
  error?: FatSecretError;
  food?: {
    servings?: {
      serving?: FatSecretServing | FatSecretServing[];
    };
  };
}

/**
 * Mapping of FatSecret serving micronutrient fields to canonical keys, with the
 * unit FatSecret reports each field in. Values are converted into each
 * nutrient's canonical unit (most already match).
 */
const FATSECRET_FIELD_TO_KEY: Record<string, { key: string; unit: string }> = {
  vitamin_a: { key: 'vitamin_a', unit: 'µg' },
  vitamin_c: { key: 'vitamin_c', unit: 'mg' },
  vitamin_d: { key: 'vitamin_d', unit: 'µg' },
  calcium: { key: 'calcium', unit: 'mg' },
  iron: { key: 'iron', unit: 'mg' },
  potassium: { key: 'potassium', unit: 'mg' },
  sodium: { key: 'sodium', unit: 'mg' },
  fiber: { key: 'fiber', unit: 'g' },
  sugar: { key: 'sugar', unit: 'g' },
  added_sugars: { key: 'added_sugar', unit: 'g' },
  saturated_fat: { key: 'saturated_fat', unit: 'g' },
  cholesterol: { key: 'cholesterol', unit: 'mg' },
};

/**
 * Compute an HMAC-SHA1 signature of `message` keyed by `key` and return it
 * Base64-encoded, using the built-in Web Crypto API (replaces crypto-js).
 */
async function hmacSha1Base64(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sigBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function fetchFoodData(
  app: App,
  foodName: string,
  pageNumber: number,
  maxResults: number,
  apiKey: string,
  apiSecret: string
): Promise<FoodItem[]> {
  try {
    // Create timestamp for the request
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce();

    // Base parameters for the request
    const params: Record<string, string> = {
      method: 'foods.search',
      format: 'json',
      search_expression: foodName,
      measurement_grams: '100',
      page_number: pageNumber.toString(),
      max_results: maxResults.toString(),
      oauth_consumer_key: apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_version: '1.0',
    };

    // Create the signature base string
    const method = 'GET';
    const baseUrl = 'https://platform.fatsecret.com/rest/server.api';

    // Sort parameters alphabetically
    const sortedParamKeys = Object.keys(params).sort();
    const paramString = sortedParamKeys
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Create signature base string
    const signatureBaseString = [
      method,
      encodeURIComponent(baseUrl),
      encodeURIComponent(paramString),
    ].join('&');

    // Create signing key
    const signingKey = `${encodeURIComponent(apiSecret)}&`;

    // Generate signature using the Web Crypto API
    const signature = await hmacSha1Base64(signatureBaseString, signingKey);

    // Add signature to parameters
    const requestParams = {
      ...params,
      oauth_signature: signature,
    };

    // Convert to URL parameters
    const urlParams = new URLSearchParams();
    Object.entries(requestParams).forEach(([key, value]) => {
      urlParams.append(key, String(value));
    });

    // Make the request
    const fullUrl = `${baseUrl}?${urlParams.toString()}`;
    const response = await requestUrl({ url: fullUrl, method: 'GET' });
    const json = response.json as FatSecretFoodsSearchResponse;

    if (json?.error) return [];

    const foods = json?.foods?.food;
    if (foods) {
      if (Array.isArray(foods)) {
        return foods.filter((food) => {
          const s = extractServingSize(food.food_description);
          return s.toLowerCase().endsWith('g');
        });
      } else {
        const s = extractServingSize(foods.food_description);
        return s.toLowerCase().endsWith('g') ? [foods] : [];
      }
    }
    return [];
  } catch (error) {
    console.error('Error fetching food data:', error);
    return [];
  }
}

// Generate a random nonce string
function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Build an OAuth 1.0 (HMAC-SHA1) signed FatSecret REST URL for the given
 * method-specific parameters.
 */
async function buildSignedFatSecretUrl(
  methodParams: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const baseUrl = 'https://platform.fatsecret.com/rest/server.api';
  const params: Record<string, string> = {
    format: 'json',
    ...methodParams,
    oauth_consumer_key: apiKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };

  const sortedParamKeys = Object.keys(params).sort();
  const paramString = sortedParamKeys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const signatureBaseString = [
    'GET',
    encodeURIComponent(baseUrl),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = `${encodeURIComponent(apiSecret)}&`;
  const signature = await hmacSha1Base64(signatureBaseString, signingKey);

  const urlParams = new URLSearchParams();
  Object.entries({ ...params, oauth_signature: signature }).forEach(([key, value]) => {
    urlParams.append(key, String(value));
  });

  return `${baseUrl}?${urlParams.toString()}`;
}

/**
 * Result of a FatSecret detail lookup: canonical micronutrient amounts plus the
 * grams the amounts correspond to (so callers can normalise to their own
 * serving size).
 */
export interface FatSecretMicronutrients {
  /** Grams of food the amounts below represent (e.g. 100). */
  servingGrams: number;
  /** Canonical micronutrient key -> amount in canonical unit. */
  micronutrients: Record<string, number>;
}

/** Pick the most suitable gram-based serving for nutrient extraction. */
function pickGramServing(servings: FatSecretServing[]): FatSecretServing | null {
  const gramServings = servings.filter(
    (s) => typeof s?.metric_serving_unit === 'string' && s.metric_serving_unit.toLowerCase() === 'g'
  );
  if (gramServings.length === 0) return null;

  // Prefer an exact 100g serving for the cleanest per-100g values.
  const hundred = gramServings.find((s) => parseFloat(s.metric_serving_amount ?? '') === 100);
  return hundred || gramServings[0];
}

/**
 * Fetch detailed micronutrient data for a single FatSecret food via
 * `food.get.v4`, normalised to a 100g serving when possible.
 *
 * Returns `null` when the food has no gram-based serving or no recognised
 * micronutrient fields (e.g. when the account tier does not expose them).
 */
export async function fetchFatSecretMicronutrients(
  app: App,
  foodId: string,
  apiKey: string,
  apiSecret: string
): Promise<FatSecretMicronutrients | null> {
  try {
    const url = await buildSignedFatSecretUrl(
      { method: 'food.get.v4', food_id: foodId },
      apiKey,
      apiSecret
    );

    const response = await requestUrl({ url, method: 'GET' });
    const json = response.json as FatSecretFoodGetResponse;
    if (!json || json.error) return null;

    const servingsNode = json.food?.servings?.serving;
    if (!servingsNode) return null;

    const servings: FatSecretServing[] = Array.isArray(servingsNode)
      ? servingsNode
      : [servingsNode];
    const serving = pickGramServing(servings);
    if (!serving) return null;

    const metricAmount = parseFloat(serving.metric_serving_amount ?? '');
    if (isNaN(metricAmount) || metricAmount <= 0) return null;

    // Scale from the serving's metric amount to a 100g basis.
    const scaleTo100g = 100 / metricAmount;

    const micronutrients: Record<string, number> = {};
    for (const [field, { key, unit }] of Object.entries(FATSECRET_FIELD_TO_KEY)) {
      const raw = serving[field];
      if (raw == null || raw === '') continue;
      const value = parseFloat(raw);
      if (isNaN(value)) continue;

      const converted = toCanonicalMicronutrient(key, value * scaleTo100g, unit);
      if (converted == null) continue;
      micronutrients[key] = converted;
    }

    if (Object.keys(micronutrients).length === 0) return null;

    return { servingGrams: 100, micronutrients };
  } catch (error) {
    console.error('Error fetching FatSecret micronutrients:', error);
    return null;
  }
}

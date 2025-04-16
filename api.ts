import { App, requestUrl } from 'obsidian';
import * as CryptoJS from 'crypto-js';
import { extractServingSize } from './utils';

/*
 * API Integration for Macros Plugin
 * -------------------------------------------
 * Handles API calls to the FatSecret platform.
 * This module:
 *  - Constructs OAuth-signed requests.
 *  - Fetches food data using user-provided search terms.
 *  - Filters and processes API responses to ensure valid serving sizes (in grams).
 *
 * NOTE: Hard-coded API credentials are used during development.
 */

// @ts-ignore
const OAuth = require('oauth-1.0a');

/**
 * Interface representing a food item returned from FatSecret.
 */
export interface FoodItem {
	food_name: string;
	food_description: string;
	// Additional fields as required.
}

/**
 * Fetches food data from the FatSecret API.
 * @returns A Promise that resolves to an array of FoodItem objects.
 */
export async function fetchFoodData(
	app: App,
	foodName: string,
	pageNumber: number,
	maxResults: number,
	apiKey: string,
	apiSecret: string
): Promise<FoodItem[]> {
	// Initialize OAuth with HMAC-SHA1 signature method.
	const oauth = new OAuth({
		consumer: { key: apiKey, secret: apiSecret },
		signature_method: 'HMAC-SHA1',
		hash_function(baseString: string, key: string) {
			return CryptoJS.HmacSHA1(baseString, key).toString(CryptoJS.enc.Base64);
		},
	});
	// Prepare request parameters.
	const requestData = {
		url: 'https://platform.fatsecret.com/rest/server.api',
		method: 'GET',
		data: {
			method: 'foods.search',
			format: 'json',
			search_expression: foodName,
			measurement_grams: '100',
			page_number: pageNumber.toString(),
			max_results: maxResults.toString(),
		},
	};
	// Append OAuth authorization parameters.
	const fullUrl = requestData.url + '?' + new URLSearchParams({
		...requestData.data,
		...oauth.authorize(requestData),
	}).toString();
	console.log('FatSecret request URL:', fullUrl);
	try {
		const response = await requestUrl({ url: fullUrl, method: 'GET' });
		console.log('FatSecret API Response:', response.json);
		
		// Check if the response contains an error property.
		if (response.json && response.json.error) {
			const errorText = String(response.json.error);
			console.error('FatSecret API error:', errorText);
			// Log a special message if the error suggests invalid credentials.
			if (errorText.toLowerCase().includes('invalid')) {
				console.error('Invalid API credentials detected. Please check your FatSecret API credentials.');
			}
			return [];
		}

		if (response.json.foods?.food) {
			const foods = response.json.foods.food;
			if (Array.isArray(foods)) {
				// Filter only items with a valid serving size.
				return foods.filter(food => {
					const s = extractServingSize(food.food_description);
					return s.toLowerCase().endsWith('g');
				});
			} else {
				const s = extractServingSize(foods.food_description);
				return s.toLowerCase().endsWith('g') ? [foods] : [];
			}
		} else {
			console.warn('No "food" field in response:', response.json);
			return [];
		}
	} catch (error) {
		console.error('Error fetching food data:', error);
		return [];
	}
}
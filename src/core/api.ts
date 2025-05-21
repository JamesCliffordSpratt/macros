import { App, requestUrl } from 'obsidian';
import * as CryptoJS from 'crypto-js';
import { extractServingSize } from '../utils';
/*
 * API Integration for Macros Plugin
 * -------------------------------------------
 * Handles API calls to the FatSecret platform.
 * This module:
 *  - Constructs OAuth-signed requests using direct requestUrl method.
 *  - Fetches food data using user-provided search terms.
 *  - Filters and processes API responses to ensure valid serving sizes (in grams).
 */

export interface FoodItem {
	food_name: string;
	food_description: string;
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
		const params = {
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

		// Generate signature using CryptoJS
		const signature = CryptoJS.HmacSHA1(signatureBaseString, signingKey).toString(
			CryptoJS.enc.Base64
		);

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

		if (response.json && response.json.error) return [];

		if (response.json.foods?.food) {
			const foods = response.json.foods.food;
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

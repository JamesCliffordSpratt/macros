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
 */

// @ts-ignore
const OAuth = require('oauth-1.0a');

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
	const oauth = new OAuth({
		consumer: { key: apiKey, secret: apiSecret },
		signature_method: 'HMAC-SHA1',
		hash_function(baseString: string, key: string) {
			return CryptoJS.HmacSHA1(baseString, key).toString(CryptoJS.enc.Base64);
		},
	});
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
	const fullUrl = requestData.url + '?' + new URLSearchParams({
		...requestData.data,
		...oauth.authorize(requestData),
	}).toString();
	try {
		const response = await requestUrl({ url: fullUrl, method: 'GET' });
		if (response.json && response.json.error) return [];
		if (response.json.foods?.food) {
			const foods = response.json.foods.food;
			if (Array.isArray(foods)) {
				return foods.filter(food => {
					const s = extractServingSize(food.food_description);
					return s.toLowerCase().endsWith('g');
				});
			} else {
				const s = extractServingSize(foods.food_description);
				return s.toLowerCase().endsWith('g') ? [foods] : [];
			}
		}
		return [];
	} catch {
		return [];
	}
}

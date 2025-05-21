/**
 * Parses a string to extract a gram value
 * @param value String potentially containing a gram measurement
 * @returns Parsed number or NaN if not found
 */
export function parseGrams(value: string): number {
	const match = value.match(/(\d+(\.\d+)?)/);
	return match ? parseFloat(match[0]) : NaN;
}

/**
 * Normalizes a name by removing special characters
 * @param name The name to normalize
 * @returns Normalized string
 */
export function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts the serving size from a food description
 * @param description The food description text
 * @returns The extracted serving size or "Unknown" if not found
 */
export function extractServingSize(description: string): string {
	try {
		const regex = /Per\s*(\d+(\.\d+)?)\s*(g|medium|large|slice|cup|tbsp|oz)/i;
		const match = description.match(regex);
		return match ? `${match[1]}${match[3]}` : 'Unknown';
	} catch (error) {
		console.error('Error extracting serving size:', error);
		return 'Unknown';
	}
}

/**
 * Extracts nutritional data from a food description
 * @param description The food description text
 * @returns Object containing extracted nutritional values
 */
export function extractNutritionalData(description: string): {
	calories: string;
	fat: string;
	carbs: string;
	protein: string;
} {
	try {
		const caloriesMatch = description.match(/Calories:\s*(\d+(\.\d+)?)kcal/i);
		const fatMatch = description.match(/Fat:\s*(\d+(\.\d+)?)g/i);
		const carbsMatch = description.match(/Carbs:\s*(\d+(\.\d+)?)g/i);
		const proteinMatch = description.match(/Protein:\s*(\d+(\.\d+)?)g/i);
		return {
			calories: caloriesMatch ? caloriesMatch[1] : 'N/A',
			fat: fatMatch ? fatMatch[1] : 'N/A',
			carbs: carbsMatch ? carbsMatch[1] : 'N/A',
			protein: proteinMatch ? proteinMatch[1] : 'N/A',
		};
	} catch (error) {
		console.error('Error extracting nutritional data:', error);
		return { calories: 'N/A', fat: 'N/A', carbs: 'N/A', protein: 'N/A' };
	}
}

/**
 * Helper function to escape special characters in regular expressions
 * @param str The string to escape
 * @returns Escaped string safe for regex usage
 */
export function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

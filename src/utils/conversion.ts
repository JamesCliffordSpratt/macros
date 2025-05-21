/**
 * Conversion Utilities
 * -------------------
 * Functions for converting between different formats and units.
 */

/**
 * Parses a string containing a number with a 'g' (grams) suffix
 * @param value The string value to parse (e.g., "150g")
 * @returns The extracted number or NaN if parsing fails
 */
export function parseGrams(value: string): number {
	const match = value.match(/(\d+(\.\d+)?)/);
	return match ? parseFloat(match[0]) : NaN;
}

/**
 * Normalizes a name by removing special characters and spaces
 * @param name The name to normalize
 * @returns A normalized version of the name
 */
export function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

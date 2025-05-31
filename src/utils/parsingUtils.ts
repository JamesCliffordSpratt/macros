/**
 * Parsing Utilities
 * ----------------
 * Functions for parsing and processing strings and data.
 */

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

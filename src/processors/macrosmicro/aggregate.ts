import MacrosPlugin from '../../main';
import { extractMicronutrients, parseGrams } from '../../utils';

export interface MicronutrientAggregateResult {
  /** Map of micronutrient key -> total scaled amount across all foods. */
  totals: Record<string, number>;
  /** Number of food items successfully resolved and processed. */
  resolvedCount: number;
  /** Food queries that could not be resolved to a file (for diagnostics). */
  unresolved: string[];
  /** Whether any food provided at least one micronutrient value. */
  hasAnyData: boolean;
}

/**
 * Parse a single food item reference ("Food Name" or "Food Name:120g")
 * into a query and optional quantity.
 */
function parseFoodReference(text: string): { query: string; quantity: number | null } {
  const trimmed = text.trim();
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((s) => s.trim());
    const quantity = parseGrams(parts[1]);
    return { query: parts[0], quantity: isNaN(quantity) ? null : quantity };
  }
  return { query: trimmed, quantity: null };
}

/**
 * Accumulate one food item's micronutrients into the running totals.
 */
function accumulateFood(
  plugin: MacrosPlugin,
  result: MicronutrientAggregateResult,
  query: string,
  quantity: number | null
): void {
  if (!query || query.trim() === '') return;

  const file = plugin.findFoodFile(query);
  if (!file) {
    result.unresolved.push(query);
    return;
  }

  const micros = extractMicronutrients(plugin.app, file, quantity);
  result.resolvedCount += 1;

  const keys = Object.keys(micros);
  if (keys.length > 0) {
    result.hasAnyData = true;
  }

  for (const key of keys) {
    result.totals[key] = (result.totals[key] || 0) + micros[key];
  }
}

/**
 * Walk the lines of a macros block (foods, meals, groups and their bullet
 * items) and aggregate every food's micronutrient contribution.
 *
 * Mirrors the traversal used by the macros table's group processing so the
 * micronutrient totals stay consistent with the macro totals.
 */
export function aggregateMicronutrientsFromLines(
  lines: string[],
  plugin: MacrosPlugin
): MicronutrientAggregateResult {
  const result: MicronutrientAggregateResult = {
    totals: {},
    resolvedCount: 0,
    unresolved: [],
    hasAnyData: false,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;

    const lower = line.toLowerCase();

    // Skip a stray id line if present
    if (lower.startsWith('id:')) continue;

    if (lower.startsWith('meal:') || lower.startsWith('group:')) {
      // Consume bullet items belonging to this meal/group
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('-')) {
        const itemText = lines[j].trim().substring(1).trim();
        const { query, quantity } = parseFoodReference(itemText);
        accumulateFood(plugin, result, query, quantity);
        j++;
      }
      i = j - 1;
    } else if (!line.startsWith('-')) {
      // Standalone food item
      const { query, quantity } = parseFoodReference(line);
      accumulateFood(plugin, result, query, quantity);
    }
    // Orphan bullet lines (not under a meal/group) are ignored, matching the
    // macros table behaviour.
  }

  return result;
}

/**
 * Aggregate micronutrients across multiple macros block IDs.
 */
export async function aggregateMicronutrientsForIds(
  ids: string[],
  plugin: MacrosPlugin
): Promise<MicronutrientAggregateResult> {
  const combined: MicronutrientAggregateResult = {
    totals: {},
    resolvedCount: 0,
    unresolved: [],
    hasAnyData: false,
  };

  for (const id of ids) {
    const lines = await plugin.getFullMacrosData(id);
    if (!lines || lines.length === 0) continue;

    const partial = aggregateMicronutrientsFromLines(lines, plugin);
    combined.resolvedCount += partial.resolvedCount;
    combined.unresolved.push(...partial.unresolved);
    if (partial.hasAnyData) combined.hasAnyData = true;
    for (const key of Object.keys(partial.totals)) {
      combined.totals[key] = (combined.totals[key] || 0) + partial.totals[key];
    }
  }

  return combined;
}

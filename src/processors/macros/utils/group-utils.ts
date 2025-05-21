import MacrosPlugin from '../../../main';
import { Group, MacroRow } from '../../../utils';
import { parseGrams } from '../../../utils';
import { processFoodItem } from '../macrosUtils';

/**
 * Process lines from the macros code block into structured group data
 * @param lines Array of text lines from the macros block
 * @param plugin Reference to the macros plugin
 * @returns Array of Group objects
 */
export function processLinesIntoGroups(lines: string[], plugin: MacrosPlugin): Group[] {
	const groups: Group[] = [];
	const otherGroup: Group = {
		name: 'Other Items',
		count: 1,
		rows: [],
		total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Skip empty lines or invalid content
		if (!line || line.trim() === '') {
			continue;
		}

		if (line.toLowerCase().startsWith('meal:')) {
			// Start of a new meal section
			const group = processMealLineWithBullets(lines, i, plugin);
			if (group) {
				groups.push(group);

				// Skip over the bullet points for this meal
				while (i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
					i++;
				}
			}
		} else if (!line.startsWith('-')) {
			// Regular food item not part of a meal
			// Only process if this actually has content (not empty)
			if (line.trim().length > 0) {
				const foodName = extractFoodName(line);

				// Skip processing if the food name is empty
				if (foodName.trim() === '') {
					plugin.logger.debug(`Skipping empty food line: "${line}"`);
					continue;
				}

				const row = processItemLine(line, plugin);
				if (row) {
					otherGroup.rows.push(row);
					otherGroup.total.calories += row.calories;
					otherGroup.total.protein += row.protein;
					otherGroup.total.fat += row.fat;
					otherGroup.total.carbs += row.carbs;
				}
			}
		}
	}

	if (otherGroup.rows.length > 0) {
		groups.push(otherGroup);
	}

	return groups;
}

/**
 * Extract the food name from a macro line, handling potential empty lines
 */
function extractFoodName(line: string): string {
	if (!line || line.trim() === '') {
		return '';
	}

	if (line.includes(':')) {
		const parts = line.split(':');
		if (parts.length > 0) {
			return parts[0].trim();
		}
	}
	return line.trim();
}

/**
 * Process a meal line and its bullet points into a group
 * @param lines All lines from the macros block
 * @param mealLineIndex Index of the meal line
 * @param plugin Reference to the macros plugin
 * @returns Group object or null if meal not found
 */
export function processMealLineWithBullets(
	lines: string[],
	mealLineIndex: number,
	plugin: MacrosPlugin
): Group | null {
	const mealLine = lines[mealLineIndex];
	const fullMealText = mealLine.substring(5).trim();
	let mealName = fullMealText;
	let count = 1;

	// Check for meal multipliers
	const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
	if (countMatch) {
		mealName = countMatch[1];
		count = parseInt(countMatch[2]);
	}

	// Lookup the meal template to get default items
	const mealTemplate = plugin.settings.mealTemplates.find(
		(m) => m.name.toLowerCase() === mealName.toLowerCase()
	);

	if (!mealTemplate) {
		return null;
	}

	const group: Group = {
		name: mealName,
		count: count,
		rows: [],
		total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
		macroLine: mealLine,
	};

	// Process the bullet point items directly from the code block
	let currentIndex = mealLineIndex + 1;
	while (currentIndex < lines.length && lines[currentIndex].trim().startsWith('-')) {
		const bulletLine = lines[currentIndex].trim();
		const itemText = bulletLine.substring(1).trim(); // Remove the bullet

		let foodQuery = itemText;
		let specifiedQuantity: number | null = null;

		if (itemText.includes(':')) {
			const parts = itemText.split(':').map((s) => s.trim());
			foodQuery = parts[0];
			specifiedQuantity = parseGrams(parts[1]);
		}

		const row = processFoodItem(plugin, foodQuery, specifiedQuantity);
		if (row) {
			row.macroLine = itemText;
			group.rows.push(row);
			group.total.calories += parseFloat(row.calories.toFixed(1));
			group.total.protein += parseFloat(row.protein.toFixed(1));
			group.total.fat += parseFloat(row.fat.toFixed(1));
			group.total.carbs += parseFloat(row.carbs.toFixed(1));
		}

		currentIndex++;
	}

	return group;
}

/**
 * Process a single food item line
 * @param line The food item line text
 * @param plugin Reference to the macros plugin
 * @returns MacroRow object or null if food not found
 */
export function processItemLine(line: string, plugin: MacrosPlugin): MacroRow | null {
	let foodQuery = line;
	let specifiedQuantity: number | null = null;

	if (line.includes(':')) {
		const parts = line.split(':').map((s) => s.trim());
		foodQuery = parts[0];
		specifiedQuantity = parseGrams(parts[1]);
	}

	const row = processFoodItem(plugin, foodQuery, specifiedQuantity);
	if (row) {
		row.macroLine = line;
	}
	return row;
}

/**
 * Process a meal line into a group with all its food items
 * This is the original function kept for compatibility
 * @param line The meal line text
 * @param plugin Reference to the macros plugin
 * @returns Group object or null if meal not found
 */
export function processMealLine(line: string, plugin: MacrosPlugin): Group | null {
	const fullMealText = line.substring(5).trim();
	let mealName = fullMealText;
	let count = 1;

	const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
	if (countMatch) {
		mealName = countMatch[1];
		count = parseInt(countMatch[2]);
	}

	const meal = plugin.settings.mealTemplates.find(
		(m) => m.name.toLowerCase() === mealName.toLowerCase()
	);
	if (!meal) return null;

	const group: Group = {
		name: mealName,
		count: count,
		rows: [],
		total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
		macroLine: line,
	};

	meal.items.forEach((item: string) => {
		let foodQuery = item;
		let specifiedQuantity: number | null = null;

		if (item.includes(':')) {
			const parts = item.split(':').map((s) => s.trim());
			foodQuery = parts[0];
			specifiedQuantity = parseGrams(parts[1]);
		}

		const row = processFoodItem(plugin, foodQuery, specifiedQuantity);
		if (row) {
			row.macroLine = item;
			group.rows.push(row);
			group.total.calories += parseFloat(row.calories.toFixed(1));
			group.total.protein += parseFloat(row.protein.toFixed(1));
			group.total.fat += parseFloat(row.fat.toFixed(1));
			group.total.carbs += parseFloat(row.carbs.toFixed(1));
		}
	});

	return group;
}

import { App, TFolder, TFile } from 'obsidian';

/*
 * Utility Functions for Macros Plugin
 * -----------------------------------------------
 * Includes helper functions used across the plugin:
 *  - getVaultFolders: Retrieves all folder paths in the vault.
 *  - mergeMacroLines: Merges duplicate food lines by summing their serving sizes.
 *  - extractServingSize: Extracts a serving size from a food description.
 *  - extractNutritionalData: Parses calories, protein, fat, and carbs from food descriptions.
 *  - parseGrams: Extracts a numeric value (in grams) from a text string.
 *  - findMatchingFoodFile: Find food file based on query.
 *  - processNutritionalData: Process nutritional data for a food item.
 */

export function getVaultFolders(app: App): string[] {
	const folders: string[] = [];
	const traverse = (folder: TFolder) => {
		folders.push(folder.path);
		folder.children.forEach(child => {
			if (child instanceof TFolder) {
				traverse(child);
			}
		});
	};
	traverse(app.vault.getRoot());
	return folders.sort();
}

/**
 * Merges multiple macro lines that reference the same food item by summing their serving sizes.
 * Also merges multiple instances of the same meal template with a count.
 * Example: Two entries "Apple: 100g" become "Apple:200g".
 * Example: Two entries "meal:Breakfast" become "meal:Breakfast × 2".
 * @param lines An array of macro line strings.
 * @returns An array of merged macro line strings.
 */
export function mergeMacroLines(lines: string[]): string[] {
	
	const mergedFood: Record<string, { foodName: string, totalServing: number, firstIndex: number }> = {};
	const mergedMeals: Record<string, { mealName: string, count: number, firstIndex: number }> = {};
	
	lines.forEach((line, index) => {
		if (line.toLowerCase().startsWith("meal:")) {
			// Extract the meal name (ignore any existing count marker)
			const fullMealText = line.substring(5).trim();
			let mealName = fullMealText;
			let existingCount = 1;
			
			// Check if there's already a count indicator
			const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
			if (countMatch) {
				mealName = countMatch[1];
				existingCount = parseInt(countMatch[2]);
			}
			
			const key = mealName.toLowerCase();
			
			// Check if we've seen this meal before
			if (!mergedMeals[key]) {
				mergedMeals[key] = { mealName, count: existingCount, firstIndex: index };
			} else {
				mergedMeals[key].count += existingCount;
			}
		} else if (!line.toLowerCase().startsWith("-") && line.includes(':')) {
			const match = line.match(/^([^:]+):\s*([\d\.]+)g$/i);
			if (match) {
				const foodName = match[1].trim();
				const serving = parseFloat(match[2]);
				const key = foodName.toLowerCase();
				if (isNaN(serving)) return;
				if (!mergedFood[key]) {
					mergedFood[key] = { foodName, totalServing: serving, firstIndex: index };
				} else {
					mergedFood[key].totalServing += serving;
				}
			}
		}
	});
	
	const output: string[] = [];
	lines.forEach((line, index) => {
		if (line.toLowerCase().startsWith("meal:")) {
			const fullMealText = line.substring(5).trim();
			let mealName = fullMealText;
			
			// Check if there's already a count indicator
			const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
			if (countMatch) {
				mealName = countMatch[1];
			}
			
			const key = mealName.toLowerCase();
			
			if (mergedMeals[key] && mergedMeals[key].firstIndex === index) {
				// Add the meal with a count indicator if count > 1
				if (mergedMeals[key].count > 1) {
					output.push(`meal:${mealName} × ${mergedMeals[key].count}`);
				} else {
					output.push(`meal:${mealName}`);
				}
			}
			// Skip this meal if it's not the first instance
		} else if (!line.toLowerCase().startsWith("-") && line.includes(':')) {
			const match = line.match(/^([^:]+):\s*([\d\.]+)g$/i);
			if (match) {
				const key = match[1].trim().toLowerCase();
				if (mergedFood[key] && mergedFood[key].firstIndex === index) {
					output.push(`${mergedFood[key].foodName}:${mergedFood[key].totalServing}g`);
				}
				return;
			}
			output.push(line);
		} else if (!line.toLowerCase().startsWith("-")) {
			output.push(line);
		}
	});
	
	return output;
}

/**
 * extractServingSize
 * ------------------
 * Extracts the serving size from a food description.
 * Returns the concatenated number and unit if found, otherwise "Unknown".
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
 * extractNutritionalData
 * ----------------------
 * Extracts nutritional information (calories, fat, carbs, and protein) from a food description.
 * Returns the numeric value if found; otherwise "N/A".
 */
export function extractNutritionalData(description: string): { calories: string, fat: string, carbs: string, protein: string } {
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
 * parseGrams
 * ----------
 * Extracts a numeric value (in grams) from a text string.
 */
export function parseGrams(value: string): number {
	const match = value.match(/(\d+(\.\d+)?)/);
	return match ? parseFloat(match[0]) : NaN;
}

/**
 * normalizeName
 * -------------
 * Normalizes a food name for case-insensitive comparison.
 */
export function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * findMatchingFoodFile
 * --------------------
 * Finds a matching food file based on a query.
 */
export function findMatchingFoodFile(files: TFile[], foodQuery: string): TFile | null {
	const queryLower = foodQuery.toLowerCase();

	// Try to find an exact match ignoring the .md extension.
	const exactMatches = files.filter(f => f.name.replace(/\.md$/, '').toLowerCase() === queryLower);
	if (exactMatches.length === 1) return exactMatches[0];

	// If no exact match, try partial match.
	const partialMatches = files.filter(f => f.name.toLowerCase().includes(queryLower));
	if (partialMatches.length === 1) return partialMatches[0];

	if (partialMatches.length > 1) {
		console.warn(`Ambiguous food query "${foodQuery}" matches multiple files. Please disambiguate.`);
		return null;
	}
	return null;
}

/**
 * Nutrition interface for standardizing nutritional data
 */
export interface NutritionData {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    serving?: string;
    name?: string;
    macroLine?: string;
}

/**
 * processNutritionalData
 * ----------------------
 * Process nutritional data for a food item, scaling by quantity if provided.
 */
export function processNutritionalData(app: any, foodFile: TFile, specifiedQuantity: number | null = null): NutritionData | null {
    const cache = app.metadataCache.getFileCache(foodFile);
    if (!cache || !cache.frontmatter) return null;
    
    const fm = cache.frontmatter;
    const storedServing = fm['serving_size'] as string || '';
    
    if (!storedServing.toLowerCase().includes('g')) return null;
    
    const storedServingGrams = parseGrams(storedServing);
    if (isNaN(storedServingGrams)) return null;
    
    const quantity = (specifiedQuantity != null && !isNaN(specifiedQuantity))
        ? specifiedQuantity
        : storedServingGrams;
    
    const scale = quantity / storedServingGrams;
    
    const cal = parseFloat(fm['calories']) || 0;
    const prot = parseFloat(fm['protein']) || 0;
    const fat = parseFloat(fm['fat']) || 0;
    const carbs = parseFloat(fm['carbs']) || 0;
    
    return {
        name: foodFile.name.replace(/\.md$/, ''),
        serving: `${quantity}g`,
        calories: cal * scale,
        protein: prot * scale,
        fat: fat * scale,
        carbs: carbs * scale
    };
}

/**
 * Calculates the pie chart angles for a set of slices
 */
export function calculatePieChartAngles(slices: { value: number }[]) {
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    if (total <= 0) return [];
    
    let angles = slices.map(slice => (slice.value / total) * 2 * Math.PI);
    const sumAngles = angles.reduce((acc, val) => acc + val, 0);
    const angleDiff = 2 * Math.PI - sumAngles;
    
    if (angles.length > 0) angles[angles.length - 1] += angleDiff;
    return angles;
}

/**
 * Renders a pie chart for macronutrients
 */
export function renderMacronutrientPieChart(
    ctx: CanvasRenderingContext2D, 
    protein: number, 
    fat: number, 
    carbs: number, 
    proteinColor: string, 
    fatColor: string, 
    carbsColor: string
) {
    const centerX = 150;
    const centerY = 150;
    const radius = 150;
    
    const slices = [
        { label: 'Protein', value: protein, color: proteinColor },
        { label: 'Fat', value: fat, color: fatColor },
        { label: 'Carbs', value: carbs, color: carbsColor },
    ];
    
    const sumMacros = protein + fat + carbs;
    if (sumMacros <= 0) {
        return false;
    }
    
    let startAngle = 0;
    slices.forEach(slice => {
        const fraction = slice.value / sumMacros;
        const sliceAngle = fraction * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();
        startAngle += sliceAngle;
    });
    
    return true;
}

/**
 * Creates a legend for a pie chart
 */
export function createPieChartLegend(
    el: HTMLElement, 
    slices: { label: string; value: number; color: string }[]
) {
    const legendDiv = el.createEl('div', { cls: 'macrospc-legend' });
    
    slices.forEach(slice => {
        const legendItem = legendDiv.createEl('div', { cls: 'macrospc-legend-item' });
        
        const colorBox = legendItem.createEl('span', { cls: 'macrospc-legend-color' });
        // This is the only place in utils.ts where we need to set style directly because 
        // the color is dynamic and cannot be specified ahead of time in CSS
        colorBox.style.backgroundColor = slice.color;
        
        legendItem.createEl('span', { text: `${slice.label}: ${slice.value.toFixed(2)} g` });
    });
    
    return legendDiv;
}
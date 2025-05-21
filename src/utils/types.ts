/**
 * Common type definitions used across the Macros Plugin
 */

export interface MacroRow {
	name: string;
	serving: string;
	calories: number;
	protein: number;
	fat: number;
	carbs: number;
	macroLine: string;
}

export interface Group {
	name: string;
	count: number;
	rows: MacroRow[];
	total: {
		calories: number;
		protein: number;
		fat: number;
		carbs: number;
	};
	macroLine?: string;
}

export interface MacroTotals {
	calories: number;
	protein: number;
	fat: number;
	carbs: number;
}

export interface DailyTargets {
	calories: number;
	protein: number;
	fat: number;
	carbs: number;
}

export interface NutritionData {
	calories: number;
	protein: number;
	fat: number;
	carbs: number;
	name?: string;
	serving?: string;
	macroLine?: string;
}

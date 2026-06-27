import { App, TFile } from 'obsidian';
import { parseGrams } from '../parsing';

/**
 * Micronutrient support
 * ---------------------
 * Canonical definitions for vitamins, minerals and other commonly tracked
 * nutrients, plus a Dietary Reference Intake (DRI) database used to derive
 * sensible default targets from a user's age / sex / life stage.
 *
 * Values are RDA (Recommended Dietary Allowance) where one exists, otherwise
 * AI (Adequate Intake). For nutrients that are usually treated as a ceiling
 * (e.g. saturated fat, added sugar) the value is a commonly cited guideline
 * limit and the definition is flagged with `isLimit: true`.
 *
 * These are public reference values published by the U.S. National Academies /
 * NIH Office of Dietary Supplements and are used here only to pre-populate
 * editable defaults — users can override every value in settings.
 */

export type MicronutrientCategory = 'vitamin' | 'mineral' | 'other';

export type Sex = 'male' | 'female';
export type LifeStage = 'none' | 'pregnancy' | 'lactation';

/**
 * Standardised DRI life-stage grouping (matches the National Academies tables).
 */
export type LifeStageGroup =
  | 'infant_0_6'
  | 'infant_7_12'
  | 'child_1_3'
  | 'child_4_8'
  | 'male_9_13'
  | 'male_14_18'
  | 'male_19_30'
  | 'male_31_50'
  | 'male_51_70'
  | 'male_71'
  | 'female_9_13'
  | 'female_14_18'
  | 'female_19_30'
  | 'female_31_50'
  | 'female_51_70'
  | 'female_71'
  | 'preg_14_18'
  | 'preg_19_30'
  | 'preg_31_50'
  | 'lact_14_18'
  | 'lact_19_30'
  | 'lact_31_50';

export interface MicronutrientProfile {
  sex: Sex;
  age: number;
  lifeStage: LifeStage;
}

export const DEFAULT_MICRONUTRIENT_PROFILE: MicronutrientProfile = {
  sex: 'male',
  age: 30,
  lifeStage: 'none',
};

export interface MicronutrientDef {
  /** Stable key used in frontmatter and settings (e.g. `vitamin_c`). */
  key: string;
  /** Human readable name. */
  label: string;
  /** Unit the amount is expressed in. */
  unit: string;
  /** Grouping used for display. */
  category: MicronutrientCategory;
  /** Per life-stage-group DRI (RDA or AI) values. */
  dri: Partial<Record<LifeStageGroup, number>>;
  /** When true the target represents an upper guideline rather than a goal to reach. */
  isLimit?: boolean;
}

/**
 * Helper to build the common adult/teen male & female brackets succinctly.
 */
function symmetric(
  male: number,
  female: number,
  opts?: { teen?: [number, number]; older?: [number, number] }
): Partial<Record<LifeStageGroup, number>> {
  const teenMale = opts?.teen ? opts.teen[0] : male;
  const teenFemale = opts?.teen ? opts.teen[1] : female;
  const olderMale = opts?.older ? opts.older[0] : male;
  const olderFemale = opts?.older ? opts.older[1] : female;
  return {
    male_14_18: teenMale,
    male_19_30: male,
    male_31_50: male,
    male_51_70: olderMale,
    male_71: olderMale,
    female_14_18: teenFemale,
    female_19_30: female,
    female_31_50: female,
    female_51_70: olderFemale,
    female_71: olderFemale,
  };
}

/**
 * The canonical micronutrient catalogue. Order here controls display order.
 */
export const MICRONUTRIENTS: MicronutrientDef[] = [
  // ----- Vitamins -----
  {
    key: 'vitamin_a',
    label: 'Vitamin A',
    unit: 'µg',
    category: 'vitamin',
    dri: {
      child_1_3: 300,
      child_4_8: 400,
      male_9_13: 600,
      female_9_13: 600,
      ...symmetric(900, 700, { teen: [900, 700] }),
      preg_14_18: 750,
      preg_19_30: 770,
      preg_31_50: 770,
      lact_14_18: 1200,
      lact_19_30: 1300,
      lact_31_50: 1300,
    },
  },
  {
    key: 'vitamin_c',
    label: 'Vitamin C',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 15,
      child_4_8: 25,
      male_9_13: 45,
      female_9_13: 45,
      male_14_18: 75,
      female_14_18: 65,
      male_19_30: 90,
      male_31_50: 90,
      male_51_70: 90,
      male_71: 90,
      female_19_30: 75,
      female_31_50: 75,
      female_51_70: 75,
      female_71: 75,
      preg_14_18: 80,
      preg_19_30: 85,
      preg_31_50: 85,
      lact_14_18: 115,
      lact_19_30: 120,
      lact_31_50: 120,
    },
  },
  {
    key: 'vitamin_d',
    label: 'Vitamin D',
    unit: 'µg',
    category: 'vitamin',
    dri: {
      child_1_3: 15,
      child_4_8: 15,
      male_9_13: 15,
      female_9_13: 15,
      male_14_18: 15,
      female_14_18: 15,
      male_19_30: 15,
      male_31_50: 15,
      male_51_70: 15,
      male_71: 20,
      female_19_30: 15,
      female_31_50: 15,
      female_51_70: 15,
      female_71: 20,
      preg_14_18: 15,
      preg_19_30: 15,
      preg_31_50: 15,
      lact_14_18: 15,
      lact_19_30: 15,
      lact_31_50: 15,
    },
  },
  {
    key: 'vitamin_e',
    label: 'Vitamin E',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 6,
      child_4_8: 7,
      male_9_13: 11,
      female_9_13: 11,
      ...symmetric(15, 15, { teen: [15, 15] }),
      preg_14_18: 15,
      preg_19_30: 15,
      preg_31_50: 15,
      lact_14_18: 19,
      lact_19_30: 19,
      lact_31_50: 19,
    },
  },
  {
    key: 'vitamin_k',
    label: 'Vitamin K',
    unit: 'µg',
    category: 'vitamin',
    dri: {
      child_1_3: 30,
      child_4_8: 55,
      male_9_13: 60,
      female_9_13: 60,
      male_14_18: 75,
      female_14_18: 75,
      male_19_30: 120,
      male_31_50: 120,
      male_51_70: 120,
      male_71: 120,
      female_19_30: 90,
      female_31_50: 90,
      female_51_70: 90,
      female_71: 90,
      preg_14_18: 75,
      preg_19_30: 90,
      preg_31_50: 90,
      lact_14_18: 75,
      lact_19_30: 90,
      lact_31_50: 90,
    },
  },
  {
    key: 'thiamin',
    label: 'Thiamin (B1)',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 0.5,
      child_4_8: 0.6,
      male_9_13: 0.9,
      female_9_13: 0.9,
      male_14_18: 1.2,
      female_14_18: 1.0,
      ...symmetric(1.2, 1.1),
      preg_14_18: 1.4,
      preg_19_30: 1.4,
      preg_31_50: 1.4,
      lact_14_18: 1.4,
      lact_19_30: 1.4,
      lact_31_50: 1.4,
    },
  },
  {
    key: 'riboflavin',
    label: 'Riboflavin (B2)',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 0.5,
      child_4_8: 0.6,
      male_9_13: 0.9,
      female_9_13: 0.9,
      male_14_18: 1.3,
      female_14_18: 1.0,
      ...symmetric(1.3, 1.1),
      preg_14_18: 1.4,
      preg_19_30: 1.4,
      preg_31_50: 1.4,
      lact_14_18: 1.6,
      lact_19_30: 1.6,
      lact_31_50: 1.6,
    },
  },
  {
    key: 'niacin',
    label: 'Niacin (B3)',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 6,
      child_4_8: 8,
      male_9_13: 12,
      female_9_13: 12,
      male_14_18: 16,
      female_14_18: 14,
      ...symmetric(16, 14),
      preg_14_18: 18,
      preg_19_30: 18,
      preg_31_50: 18,
      lact_14_18: 17,
      lact_19_30: 17,
      lact_31_50: 17,
    },
  },
  {
    key: 'vitamin_b6',
    label: 'Vitamin B6',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 0.5,
      child_4_8: 0.6,
      male_9_13: 1.0,
      female_9_13: 1.0,
      male_14_18: 1.3,
      female_14_18: 1.2,
      male_19_30: 1.3,
      male_31_50: 1.3,
      male_51_70: 1.7,
      male_71: 1.7,
      female_19_30: 1.3,
      female_31_50: 1.3,
      female_51_70: 1.5,
      female_71: 1.5,
      preg_14_18: 1.9,
      preg_19_30: 1.9,
      preg_31_50: 1.9,
      lact_14_18: 2.0,
      lact_19_30: 2.0,
      lact_31_50: 2.0,
    },
  },
  {
    key: 'folate',
    label: 'Folate',
    unit: 'µg',
    category: 'vitamin',
    dri: {
      child_1_3: 150,
      child_4_8: 200,
      male_9_13: 300,
      female_9_13: 300,
      ...symmetric(400, 400, { teen: [400, 400] }),
      preg_14_18: 600,
      preg_19_30: 600,
      preg_31_50: 600,
      lact_14_18: 500,
      lact_19_30: 500,
      lact_31_50: 500,
    },
  },
  {
    key: 'vitamin_b12',
    label: 'Vitamin B12',
    unit: 'µg',
    category: 'vitamin',
    dri: {
      child_1_3: 0.9,
      child_4_8: 1.2,
      male_9_13: 1.8,
      female_9_13: 1.8,
      ...symmetric(2.4, 2.4, { teen: [2.4, 2.4] }),
      preg_14_18: 2.6,
      preg_19_30: 2.6,
      preg_31_50: 2.6,
      lact_14_18: 2.8,
      lact_19_30: 2.8,
      lact_31_50: 2.8,
    },
  },
  {
    key: 'pantothenic_acid',
    label: 'Pantothenic Acid (B5)',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 2,
      child_4_8: 3,
      male_9_13: 4,
      female_9_13: 4,
      ...symmetric(5, 5, { teen: [5, 5] }),
      preg_14_18: 6,
      preg_19_30: 6,
      preg_31_50: 6,
      lact_14_18: 7,
      lact_19_30: 7,
      lact_31_50: 7,
    },
  },
  {
    key: 'biotin',
    label: 'Biotin (B7)',
    unit: 'µg',
    category: 'vitamin',
    dri: {
      child_1_3: 8,
      child_4_8: 12,
      male_9_13: 20,
      female_9_13: 20,
      male_14_18: 25,
      female_14_18: 25,
      ...symmetric(30, 30),
      preg_14_18: 30,
      preg_19_30: 30,
      preg_31_50: 30,
      lact_14_18: 35,
      lact_19_30: 35,
      lact_31_50: 35,
    },
  },
  {
    key: 'choline',
    label: 'Choline',
    unit: 'mg',
    category: 'vitamin',
    dri: {
      child_1_3: 200,
      child_4_8: 250,
      male_9_13: 375,
      female_9_13: 375,
      male_14_18: 550,
      female_14_18: 400,
      ...symmetric(550, 425),
      preg_14_18: 450,
      preg_19_30: 450,
      preg_31_50: 450,
      lact_14_18: 550,
      lact_19_30: 550,
      lact_31_50: 550,
    },
  },
  // ----- Minerals -----
  {
    key: 'calcium',
    label: 'Calcium',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 700,
      child_4_8: 1000,
      male_9_13: 1300,
      female_9_13: 1300,
      male_14_18: 1300,
      female_14_18: 1300,
      male_19_30: 1000,
      male_31_50: 1000,
      male_51_70: 1000,
      male_71: 1200,
      female_19_30: 1000,
      female_31_50: 1000,
      female_51_70: 1200,
      female_71: 1200,
      preg_14_18: 1300,
      preg_19_30: 1000,
      preg_31_50: 1000,
      lact_14_18: 1300,
      lact_19_30: 1000,
      lact_31_50: 1000,
    },
  },
  {
    key: 'iron',
    label: 'Iron',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 7,
      child_4_8: 10,
      male_9_13: 8,
      female_9_13: 8,
      male_14_18: 11,
      female_14_18: 15,
      male_19_30: 8,
      male_31_50: 8,
      male_51_70: 8,
      male_71: 8,
      female_19_30: 18,
      female_31_50: 18,
      female_51_70: 8,
      female_71: 8,
      preg_14_18: 27,
      preg_19_30: 27,
      preg_31_50: 27,
      lact_14_18: 10,
      lact_19_30: 9,
      lact_31_50: 9,
    },
  },
  {
    key: 'magnesium',
    label: 'Magnesium',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 80,
      child_4_8: 130,
      male_9_13: 240,
      female_9_13: 240,
      male_14_18: 410,
      female_14_18: 360,
      male_19_30: 400,
      male_31_50: 420,
      male_51_70: 420,
      male_71: 420,
      female_19_30: 310,
      female_31_50: 320,
      female_51_70: 320,
      female_71: 320,
      preg_14_18: 400,
      preg_19_30: 350,
      preg_31_50: 360,
      lact_14_18: 360,
      lact_19_30: 310,
      lact_31_50: 320,
    },
  },
  {
    key: 'phosphorus',
    label: 'Phosphorus',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 460,
      child_4_8: 500,
      male_9_13: 1250,
      female_9_13: 1250,
      male_14_18: 1250,
      female_14_18: 1250,
      ...symmetric(700, 700),
      preg_14_18: 1250,
      preg_19_30: 700,
      preg_31_50: 700,
      lact_14_18: 1250,
      lact_19_30: 700,
      lact_31_50: 700,
    },
  },
  {
    key: 'potassium',
    label: 'Potassium',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 2000,
      child_4_8: 2300,
      male_9_13: 2500,
      female_9_13: 2300,
      male_14_18: 3000,
      female_14_18: 2300,
      male_19_30: 3400,
      male_31_50: 3400,
      male_51_70: 3400,
      male_71: 3400,
      female_19_30: 2600,
      female_31_50: 2600,
      female_51_70: 2600,
      female_71: 2600,
      preg_14_18: 2600,
      preg_19_30: 2900,
      preg_31_50: 2900,
      lact_14_18: 2500,
      lact_19_30: 2800,
      lact_31_50: 2800,
    },
  },
  {
    key: 'sodium',
    label: 'Sodium',
    unit: 'mg',
    category: 'mineral',
    isLimit: true,
    dri: {
      child_1_3: 800,
      child_4_8: 1000,
      male_9_13: 1200,
      female_9_13: 1200,
      male_14_18: 1500,
      female_14_18: 1500,
      male_19_30: 1500,
      male_31_50: 1500,
      male_51_70: 1300,
      male_71: 1200,
      female_19_30: 1500,
      female_31_50: 1500,
      female_51_70: 1300,
      female_71: 1200,
      preg_14_18: 1500,
      preg_19_30: 1500,
      preg_31_50: 1500,
      lact_14_18: 1500,
      lact_19_30: 1500,
      lact_31_50: 1500,
    },
  },
  {
    key: 'zinc',
    label: 'Zinc',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 3,
      child_4_8: 5,
      male_9_13: 8,
      female_9_13: 8,
      male_14_18: 11,
      female_14_18: 9,
      ...symmetric(11, 8),
      preg_14_18: 12,
      preg_19_30: 11,
      preg_31_50: 11,
      lact_14_18: 13,
      lact_19_30: 12,
      lact_31_50: 12,
    },
  },
  {
    key: 'copper',
    label: 'Copper',
    unit: 'µg',
    category: 'mineral',
    dri: {
      child_1_3: 340,
      child_4_8: 440,
      male_9_13: 700,
      female_9_13: 700,
      male_14_18: 890,
      female_14_18: 890,
      ...symmetric(900, 900),
      preg_14_18: 1000,
      preg_19_30: 1000,
      preg_31_50: 1000,
      lact_14_18: 1300,
      lact_19_30: 1300,
      lact_31_50: 1300,
    },
  },
  {
    key: 'manganese',
    label: 'Manganese',
    unit: 'mg',
    category: 'mineral',
    dri: {
      child_1_3: 1.2,
      child_4_8: 1.5,
      male_9_13: 1.9,
      female_9_13: 1.6,
      male_14_18: 2.2,
      female_14_18: 1.6,
      ...symmetric(2.3, 1.8),
      preg_14_18: 2.0,
      preg_19_30: 2.0,
      preg_31_50: 2.0,
      lact_14_18: 2.6,
      lact_19_30: 2.6,
      lact_31_50: 2.6,
    },
  },
  {
    key: 'selenium',
    label: 'Selenium',
    unit: 'µg',
    category: 'mineral',
    dri: {
      child_1_3: 20,
      child_4_8: 30,
      male_9_13: 40,
      female_9_13: 40,
      ...symmetric(55, 55, { teen: [55, 55] }),
      preg_14_18: 60,
      preg_19_30: 60,
      preg_31_50: 60,
      lact_14_18: 70,
      lact_19_30: 70,
      lact_31_50: 70,
    },
  },
  {
    key: 'iodine',
    label: 'Iodine',
    unit: 'µg',
    category: 'mineral',
    dri: {
      child_1_3: 90,
      child_4_8: 90,
      male_9_13: 120,
      female_9_13: 120,
      ...symmetric(150, 150, { teen: [150, 150] }),
      preg_14_18: 220,
      preg_19_30: 220,
      preg_31_50: 220,
      lact_14_18: 290,
      lact_19_30: 290,
      lact_31_50: 290,
    },
  },
  {
    key: 'chromium',
    label: 'Chromium',
    unit: 'µg',
    category: 'mineral',
    dri: {
      child_1_3: 11,
      child_4_8: 15,
      male_9_13: 25,
      female_9_13: 21,
      male_14_18: 35,
      female_14_18: 24,
      male_19_30: 35,
      male_31_50: 35,
      male_51_70: 30,
      male_71: 30,
      female_19_30: 25,
      female_31_50: 25,
      female_51_70: 20,
      female_71: 20,
      preg_14_18: 29,
      preg_19_30: 30,
      preg_31_50: 30,
      lact_14_18: 44,
      lact_19_30: 45,
      lact_31_50: 45,
    },
  },
  {
    key: 'molybdenum',
    label: 'Molybdenum',
    unit: 'µg',
    category: 'mineral',
    dri: {
      child_1_3: 17,
      child_4_8: 22,
      male_9_13: 34,
      female_9_13: 34,
      male_14_18: 43,
      female_14_18: 43,
      ...symmetric(45, 45),
      preg_14_18: 50,
      preg_19_30: 50,
      preg_31_50: 50,
      lact_14_18: 50,
      lact_19_30: 50,
      lact_31_50: 50,
    },
  },
  // ----- Other commonly tracked nutrients -----
  {
    key: 'fiber',
    label: 'Fiber',
    unit: 'g',
    category: 'other',
    dri: {
      child_1_3: 19,
      child_4_8: 25,
      male_9_13: 31,
      female_9_13: 26,
      male_14_18: 38,
      female_14_18: 26,
      male_19_30: 38,
      male_31_50: 38,
      male_51_70: 30,
      male_71: 30,
      female_19_30: 25,
      female_31_50: 25,
      female_51_70: 21,
      female_71: 21,
      preg_14_18: 28,
      preg_19_30: 28,
      preg_31_50: 28,
      lact_14_18: 29,
      lact_19_30: 29,
      lact_31_50: 29,
    },
  },
  {
    key: 'sugar',
    label: 'Sugar',
    unit: 'g',
    category: 'other',
    isLimit: true,
    dri: {},
  },
  {
    key: 'added_sugar',
    label: 'Added Sugar',
    unit: 'g',
    category: 'other',
    isLimit: true,
    dri: {
      ...symmetric(50, 50, { teen: [50, 50] }),
    },
  },
  {
    key: 'saturated_fat',
    label: 'Saturated Fat',
    unit: 'g',
    category: 'other',
    isLimit: true,
    dri: {
      ...symmetric(22, 20, { teen: [22, 20] }),
    },
  },
  {
    key: 'cholesterol',
    label: 'Cholesterol',
    unit: 'mg',
    category: 'other',
    isLimit: true,
    dri: {
      ...symmetric(300, 300, { teen: [300, 300] }),
    },
  },
];

/** Fast lookup by key. */
export const MICRONUTRIENT_MAP: Record<string, MicronutrientDef> = MICRONUTRIENTS.reduce(
  (acc, def) => {
    acc[def.key] = def;
    return acc;
  },
  {} as Record<string, MicronutrientDef>
);

/** All known frontmatter keys for micronutrients. */
export const MICRONUTRIENT_KEYS: string[] = MICRONUTRIENTS.map((m) => m.key);

/**
 * Resolve a user profile to the standardised DRI life-stage group.
 */
export function resolveLifeStageGroup(profile: MicronutrientProfile): LifeStageGroup {
  const age = Number.isFinite(profile.age) ? profile.age : 30;

  if (profile.sex === 'female' && profile.lifeStage === 'pregnancy') {
    if (age <= 18) return 'preg_14_18';
    if (age <= 30) return 'preg_19_30';
    return 'preg_31_50';
  }
  if (profile.sex === 'female' && profile.lifeStage === 'lactation') {
    if (age <= 18) return 'lact_14_18';
    if (age <= 30) return 'lact_19_30';
    return 'lact_31_50';
  }

  if (age < 0.5) return 'infant_0_6';
  if (age < 1) return 'infant_7_12';
  if (age < 4) return 'child_1_3';
  if (age < 9) return 'child_4_8';

  if (profile.sex === 'female') {
    if (age < 14) return 'female_9_13';
    if (age < 19) return 'female_14_18';
    if (age < 31) return 'female_19_30';
    if (age < 51) return 'female_31_50';
    if (age < 71) return 'female_51_70';
    return 'female_71';
  }

  if (age < 14) return 'male_9_13';
  if (age < 19) return 'male_14_18';
  if (age < 31) return 'male_19_30';
  if (age < 51) return 'male_31_50';
  if (age < 71) return 'male_51_70';
  return 'male_71';
}

/**
 * Get the recommended (default) target for a single nutrient given a profile.
 * Falls back through related groups if the exact one is missing so we always
 * return a usable number when any DRI data exists.
 */
export function getRecommendedValue(
  def: MicronutrientDef,
  profile: MicronutrientProfile
): number | null {
  const group = resolveLifeStageGroup(profile);
  if (def.dri[group] != null) return def.dri[group];

  // Fallback chain: same-sex adult brackets, then any value.
  const fallbackOrder: LifeStageGroup[] =
    profile.sex === 'female'
      ? ['female_31_50', 'female_19_30', 'female_51_70', 'female_14_18']
      : ['male_31_50', 'male_19_30', 'male_51_70', 'male_14_18'];

  for (const g of fallbackOrder) {
    if (def.dri[g] != null) return def.dri[g];
  }

  const anyValue = Object.values(def.dri).find((v) => v != null);
  return anyValue != null ? (anyValue) : null;
}

/**
 * Build the full set of recommended targets for a profile.
 */
export function getRecommendedTargets(profile: MicronutrientProfile): Record<string, number> {
  const result: Record<string, number> = {};
  for (const def of MICRONUTRIENTS) {
    const value = getRecommendedValue(def, profile);
    if (value != null) result[def.key] = value;
  }
  return result;
}

/**
 * Resolve the effective target for a nutrient: a user override if present,
 * otherwise the profile-derived recommendation.
 */
export function getEffectiveTarget(
  key: string,
  profile: MicronutrientProfile,
  overrides: Record<string, number> | undefined
): number | null {
  if (overrides && overrides[key] != null && Number.isFinite(overrides[key])) {
    return overrides[key];
  }
  const def = MICRONUTRIENT_MAP[key];
  if (!def) return null;
  return getRecommendedValue(def, profile);
}

/**
 * Extract and scale micronutrient values from a food file's frontmatter.
 * Mirrors the scaling logic used for macros: amounts are stored per the food's
 * `serving_size` and scaled to the requested quantity.
 *
 * @returns A map of micronutrient key -> scaled amount (only keys present in the file).
 */
export function extractMicronutrients(
  app: App,
  foodFile: TFile,
  specifiedQuantity: number | null = null
): Record<string, number> {
  const result: Record<string, number> = {};
  const metadataCache = app.metadataCache;
  if (!metadataCache) return result;

  const cache = metadataCache.getFileCache(foodFile);
  if (!cache || !cache.frontmatter) return result;

  const fm = cache.frontmatter as Record<string, unknown>;

  const storedServing = fm['serving_size'] != null ? String(fm['serving_size']) : '';
  const storedServingGrams = parseGrams(storedServing);
  if (isNaN(storedServingGrams) || storedServingGrams <= 0) return result;

  const quantity =
    specifiedQuantity != null && !isNaN(specifiedQuantity) ? specifiedQuantity : storedServingGrams;
  const scale = quantity / storedServingGrams;

  for (const key of MICRONUTRIENT_KEYS) {
    if (fm[key] == null) continue;
    const raw = parseFloat(String(fm[key]));
    if (isNaN(raw)) continue;
    result[key] = raw * scale;
  }

  return result;
}

/**
 * Mass-unit conversion factors expressed in grams.
 * Used to normalise micronutrient amounts returned by the various food APIs
 * (which report in g / mg / µg) into the canonical unit each nutrient is
 * tracked in (see `MicronutrientDef.unit`).
 */
const MASS_UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  mg: 1e-3,
  milligram: 1e-3,
  milligrams: 1e-3,
  // Micrograms: both the MICRO SIGN (U+00B5) and GREEK MU (U+03BC) spellings,
  // plus the ASCII fallbacks used by various APIs (USDA reports "UG").
  µg: 1e-6,
  μg: 1e-6,
  ug: 1e-6,
  mcg: 1e-6,
  microgram: 1e-6,
  micrograms: 1e-6,
};

/**
 * Normalise a unit string for table lookup (trim + lower-case).
 */
function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

/**
 * Convert a nutrient amount between mass units (g / mg / µg).
 *
 * Returns `null` when either unit is not a recognised mass unit (e.g. `IU`),
 * so callers can skip values they cannot safely normalise.
 */
export function convertNutrientAmount(
  value: number,
  fromUnit: string,
  toUnit: string
): number | null {
  if (!Number.isFinite(value)) return null;

  const from = MASS_UNIT_TO_GRAMS[normalizeUnit(fromUnit)];
  const to = MASS_UNIT_TO_GRAMS[normalizeUnit(toUnit)];
  if (from == null || to == null) return null;

  return (value * from) / to;
}

/**
 * Convert a single source value (in `fromUnit`) into the canonical unit for the
 * micronutrient identified by `key`. Returns `null` if the key is unknown or
 * the units are not compatible.
 */
export function toCanonicalMicronutrient(
  key: string,
  value: number,
  fromUnit: string
): number | null {
  const def = MICRONUTRIENT_MAP[key];
  if (!def) return null;
  return convertNutrientAmount(value, fromUnit, def.unit);
}

/**
 * Format a micronutrient amount for display with a sensible number of decimals.
 */
export function formatMicroAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value === 0) return '0';
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

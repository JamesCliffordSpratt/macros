import { DataManager } from './DataManager';
import { UnifiedFoodResult } from '../core/search';

/**
 * Tests for food creation frontmatter — specifically that `fiber` is written
 * exactly once (not duplicated) when adding a new food item.
 */

function createMockPlugin() {
  const createdFiles: Array<{ path: string; content: string }> = [];
  const plugin = {
    app: {
      vault: {
        create: jest.fn(async (_path, content) => {
          createdFiles.push({ path: _path as string, content: content as string });
          return {} as never;
        }),
        getFolderByPath: jest.fn().mockReturnValue({}),
      },
      metadataCache: {
        getFileCache: jest.fn().mockReturnValue(null),
      },
    },
    settings: {
      storageFolder: 'Foods',
    },
    logger: {
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  };
  return { plugin, createdFiles };
}

function baseOpenFoodFactsFood(overrides: Record<string, unknown> = {}): UnifiedFoodResult {
  return {
    id: 'off_123456',
    name: 'Test Cereal',
    description: 'A test breakfast cereal',
    gramsServing: 100,
    source: 'openfoodfacts',
    brandName: 'TestBrand',
    nutritionGrade: 'a',
    novaGroup: 4,
    dataQuality: 'high',
    completeness: 95,
    micronutrients: { fiber: 3.2, calcium: 50 },
    raw: {
      nutriments: { fiber_100g: 3.2 },
    },
    ...overrides,
  };
}

describe('DataManager.createFoodItemCallback — fiber frontmatter deduplication', () => {
  it('writes fiber exactly once for Open Food Facts food with micronutrients', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = baseOpenFoodFactsFood();
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;

    // fiber must appear exactly once as a frontmatter key
    const fiberMatches = content.match(/^fiber:/m);
    expect(fiberMatches).toHaveLength(1);
    expect(content).toContain('fiber: 3.2');

    // No duplicate fiber key anywhere in frontmatter
    // One frontmatter key + one display line is OK; but the bug produced two keys.
    // After the fix there is exactly one frontmatter key line.
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';
    expect(frontmatter.match(/^fiber:/m)).toHaveLength(1);
  });

  it('writes fiber exactly once when Open Food Facts food gets fiber from micronutrients loop (not raw.fiber)', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    // Realistic OFF shape: fiber lives in nutriments.fiber_100g → micronutrients.fiber,
    // NOT as a direct `fiber` field on the raw product.
    const food = baseOpenFoodFactsFood({
      micronutrients: { fiber: 4.1 },
      raw: { nutriments: { fiber_100g: 4.1 } },
    });
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    // Exactly one fiber frontmatter key (from MICRONUTRIENT_KEYS loop)
    expect(frontmatter.match(/^fiber:/m)).toHaveLength(1);
    expect(content).toContain('fiber: 4.1');
  });

  it('does not write fiber at all when fiber is 0 or missing', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = baseOpenFoodFactsFood({
      micronutrients: { fiber: 0 },
      raw: { nutriments: {} },
    });
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    // No fiber key in frontmatter when value is 0/missing
    expect(frontmatter.match(/^fiber:/m)).toBeNull();
  });

  it('writes fiber exactly once for USDA food with fiber micronutrient', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = {
      id: 'fdc_123',
      name: 'USDA Test Food',
      description: 'Per 100g - Calories: 100kcal | Fat: 1g | Carbs: 20g | Protein: 5g',
      gramsServing: 100,
      source: 'usda',
      dataType: 'Foundation',
      micronutrients: { fiber: 2.8 },
    } as UnifiedFoodResult;

    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    expect(frontmatter.match(/^fiber:/m)).toHaveLength(1);
    expect(content).toContain('fiber: 2.8');
  });

  it('writes fiber exactly once for FatSecret food with fiber micronutrient', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = {
      id: 'fs_123',
      name: 'FatSecret Test Food',
      description: 'Per 100g - Calories: 200kcal | Fat: 5g | Carbs: 30g | Protein: 10g',
      gramsServing: 100,
      source: 'fatsecret',
      micronutrients: { fiber: 1.5 },
      raw: { food_id: 'fs_123', food_description: 'desc' },
    } as UnifiedFoodResult;

    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    expect(frontmatter.match(/^fiber:/m)).toHaveLength(1);
    expect(content).toContain('fiber: 1.5');
  });

  it('writes sugar exactly once for Open Food Facts food (single canonical key)', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = baseOpenFoodFactsFood({
      micronutrients: { sugar: 12.5 },
      raw: { nutriments: { sugars_100g: 12.5 } },
    });
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    // Exactly one sugar frontmatter key (from MICRONUTRIENT_KEYS loop)
    expect(frontmatter.match(/^sugar:/m)).toHaveLength(1);
    expect(content).toContain('sugar: 12.5');

    // No legacy 'sugars' key anywhere
    expect(frontmatter.match(/^sugars:/m)).toBeNull();
  });

  it('does not write sugar key when sugar is 0 or missing', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = baseOpenFoodFactsFood({
      micronutrients: { sugar: 0 },
      raw: { nutriments: {} },
    });
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    expect(frontmatter.match(/^sugar:/m)).toBeNull();
    expect(frontmatter.match(/^sugars:/m)).toBeNull();
  });

  it('writes salt exactly once for Open Food Facts food (single canonical key)', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = baseOpenFoodFactsFood({
      micronutrients: { salt: 1.2 },
      raw: { nutriments: { salt_100g: 1.2 } },
    });
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    // Exactly one salt frontmatter key (from MICRONUTRIENT_KEYS loop)
    expect(frontmatter.match(/^salt:/m)).toHaveLength(1);
    expect(content).toContain('salt: 1.2');
  });

  it('does not write salt key when salt is 0 or missing', async () => {
    const { plugin, createdFiles } = createMockPlugin();
    const dataManager = new DataManager(plugin as never);

    const food = baseOpenFoodFactsFood({
      micronutrients: { salt: 0 },
      raw: { nutriments: {} },
    });
    const callback = dataManager.createFoodItemCallback();
    await callback(food);

    expect(createdFiles).toHaveLength(1);
    const content = createdFiles[0].content;
    const frontmatter = content.split('---\n')[1]?.split('\n---')[0] ?? '';

    expect(frontmatter.match(/^salt:/m)).toBeNull();
  });
});

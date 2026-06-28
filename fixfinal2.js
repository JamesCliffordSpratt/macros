// Round 2: explicit fixes for the per-site large-file issues.
// Run from repo root:  node fixfinal2.js
const fs = require('fs');

const edits = {
  'src/processors/macros/components/RowRenderer.ts': [
    // Typing the regex match clears all 13 unsafe findings in this file.
    [
      `        let match;\n\n        const cleanContainerName = this.extractCleanName(containerName);`,
      `        let match: RegExpExecArray | null = null;\n\n        const cleanContainerName = this.extractCleanName(containerName);`,
    ],
  ],
  'src/settings/StorageService.ts': [
    // unnecessary-assertion -> typed generic queries
    [
      `target.closest('.sortable-tab-item') as HTMLElement | null`,
      `target.closest<HTMLElement>('.sortable-tab-item')`,
    ],
    [
      `this.containerEl.querySelector('.macros-settings-content') as HTMLElement | null`,
      `this.containerEl.querySelector<HTMLElement>('.macros-settings-content')`,
    ],
    // misused-promises: the two short folder-input handlers
    [
      `folderInputEl.addEventListener('change', async () => {\n      this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);\n      await this.plugin.saveSettings();\n    });`,
      `folderInputEl.addEventListener('change', () => {\n      this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);\n      void this.plugin.saveSettings();\n    });`,
    ],
    [
      `folderInputEl.addEventListener('blur', async () => {\n      this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);\n      await this.plugin.saveSettings();\n    });`,
      `folderInputEl.addEventListener('blur', () => {\n      this.plugin.settings.storageFolder = normalizePath(folderInputEl.value);\n      void this.plugin.saveSettings();\n    });`,
    ],
    // console.log -> logger.debug (console.error stays)
    [`console.log('Testing OFF connection with:', {`, `this.plugin.logger.debug('Testing OFF connection with:', {`],
    [`console.log('OFF test results:', results);`, `this.plugin.logger.debug('OFF test results:', results);`],
    [`console.log('First result details:', {`, `this.plugin.logger.debug('First result details:', {`],
    // error.message on unknown catch var
    [`error.message?.includes('CORS')`, `(error as Error).message?.includes('CORS')`],
    [`error.message?.includes('network')`, `(error as Error).message?.includes('network')`],
    [`error.message?.includes('timeout')`, `(error as Error).message?.includes('timeout')`],
    [
      `new Notice(t('settings.api.openFoodFactsTestError', { error: error.message }));`,
      `new Notice(t('settings.api.openFoodFactsTestError', { error: error instanceof Error ? error.message : String(error) }));`,
    ],
    // intentional lowercase units / URL -> disable the (false-positive) rule
    [`          text: 'kcal',`, `          // eslint-disable-next-line obsidianmd/ui/sentence-case\n          text: 'kcal',`],
    [`          text: 'kJ',`, `          // eslint-disable-next-line obsidianmd/ui/sentence-case\n          text: 'kJ',`],
    [
      `      text: 'https://platform.fatsecret.com/platform-api',`,
      `      // eslint-disable-next-line obsidianmd/ui/sentence-case\n      text: 'https://platform.fatsecret.com/platform-api',`,
    ],
  ],
  'src/ui/live-search/LiveSearchModal.ts': [
    // misused-promises on scanner callback
    [`      this.handleBarcodeScanned(barcode)`, `      void this.handleBarcodeScanned(barcode)`],
    // base-to-string / restrict-template: wrap unknown raw values in String()
    [`        ? (food.raw as Record<string, unknown>).fdcId`, `        ? String((food.raw as Record<string, unknown>).fdcId)`],
    [`          ? (food.raw as Record<string, unknown>).code`, `          ? String((food.raw as Record<string, unknown>).code)`],
  ],
  'src/utils/BarcodeScanner.ts': [
    // base-to-string fallback
    [`result.text || result.code || String(result)`, `result.text || result.code || ''`],
    // prefer-promise-reject-errors
    [`reject(error);`, `reject(error instanceof Error ? error : new Error('Image scanning failed'));`],
    // EAN/UPC acronyms are intentional -> disable rule
    [
      `      text: 'Enter the numbers from the barcode (EAN/UPC codes are typically 8-13 digits):',`,
      `      // eslint-disable-next-line obsidianmd/ui/sentence-case\n      text: 'Enter the numbers from the barcode (EAN/UPC codes are typically 8-13 digits):',`,
    ],
  ],
  'src/utils/nutrition/micronutrients.ts': [
    [
      `  const storedServing = fm['serving_size'] != null ? String(fm['serving_size']) : '';`,
      `  const sv = fm['serving_size'];\n  const storedServing = typeof sv === 'string' || typeof sv === 'number' ? String(sv) : '';`,
    ],
    [
      `    if (fm[key] == null) continue;\n    const raw = parseFloat(String(fm[key]));`,
      `    const rawVal = fm[key];\n    if (rawVal == null) continue;\n    const raw =\n      typeof rawVal === 'number' || typeof rawVal === 'string' ? parseFloat(String(rawVal)) : NaN;`,
    ],
  ],
};

let applied = 0;
const missing = [];
for (const [rel, pairs] of Object.entries(edits)) {
  let s = fs.readFileSync(rel, 'utf8');
  for (const [find, repl] of pairs) {
    if (s.includes(find)) {
      const count = s.split(find).length - 1;
      s = s.split(find).join(repl);
      applied += count;
    } else {
      missing.push(`${rel}: ${find.slice(0, 55)}`);
    }
  }
  fs.writeFileSync(rel, s);
}
console.log('applied', applied, 'replacements');
if (missing.length) console.log('NOT FOUND:\n' + missing.join('\n'));

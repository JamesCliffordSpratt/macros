// Round 3 (final): the last 9 issues in the large files.
// Run from repo root:  node fixfinal3.js
const fs = require('fs');

const edits = {
  'src/managers/DataManager.ts': [
    // unused var
    ['        const fileName = `${safeFileName}.md`;\n', ''],
  ],
  'src/processors/macros/components/RowRenderer.ts': [
    ['        let foundId = null;', '        let foundId: string | null = null;'],
  ],
  'src/settings/StorageService.ts': [
    [`kcalInput.addEventListener('input', async () => {`, `kcalInput.addEventListener('input', () => {`],
    [`kjInput.addEventListener('input', async () => {`, `kjInput.addEventListener('input', () => {`],
    [
      `              this.plugin.settings.dailyCaloriesTarget = Math.round(kcalValue);\n              await this.plugin.saveSettings();`,
      `              this.plugin.settings.dailyCaloriesTarget = Math.round(kcalValue);\n              void this.plugin.saveSettings();`,
    ],
    [`removeBtn.addEventListener('click', async () => {`, `removeBtn.addEventListener('click', () => {`],
    [
      `          delete this.plugin.settings.foodTolerances[foodName];\n          await this.plugin.saveSettings();`,
      `          delete this.plugin.settings.foodTolerances[foodName];\n          void this.plugin.saveSettings();`,
    ],
  ],
  'src/ui/live-search/LiveSearchModal.ts': [
    [
      `const foodId = (food.raw as Record<string, unknown>).food_id;`,
      `const foodId = (food.raw as Record<string, string>).food_id;`,
    ],
    [`? String((food.raw as Record<string, unknown>).fdcId)`, `? String((food.raw as Record<string, string>).fdcId)`],
    [`? String((food.raw as Record<string, unknown>).code)`, `? String((food.raw as Record<string, string>).code)`],
  ],
  'src/utils/BarcodeScanner.ts': [
    // wrap the async interval body in a void IIFE
    [
      `    this.scanInterval = window.setInterval(async () => {`,
      `    this.scanInterval = window.setInterval(() => {\n      void (async () => {`,
    ],
    [`    }, 300);`, `      })();\n    }, 300);`],
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

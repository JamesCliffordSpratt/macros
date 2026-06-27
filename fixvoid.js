// One-off: prefix `void` to no-floating-promises in the 4 large files
// that couldn't be edited remotely. Reads locations from lintreport.json.
// Run from the repo root:  node fixvoid.js
const fs = require('fs');

const targets = [
  'MacrosCalcRenderer.ts',
  'StorageService.ts',
  'LiveSearchModal.ts',
  'ContextMenuManager.ts',
];

const report = JSON.parse(fs.readFileSync('lintreport.json', 'utf8'));
let n = 0;

for (const file of report) {
  if (!targets.some((t) => file.filePath.endsWith(t))) continue;

  const lineNos = new Set(
    file.messages
      .filter((m) => m.ruleId === '@typescript-eslint/no-floating-promises')
      .map((m) => m.line)
  );
  if (lineNos.size === 0) continue;

  const lines = fs.readFileSync(file.filePath, 'utf8').split('\n');
  for (const ln of lineNos) {
    const i = ln - 1;
    const s = lines[i];
    const stripped = s.replace(/^[ \t]*/, '');
    if (stripped.startsWith('void ')) continue; // idempotent
    const lead = s.slice(0, s.length - stripped.length);
    lines[i] = lead + 'void ' + stripped;
    n++;
  }
  fs.writeFileSync(file.filePath, lines.join('\n'));
  console.log('updated', file.filePath.split(/[\\/]/).pop());
}

console.log('prefixed', n, 'statements');

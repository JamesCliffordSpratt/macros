// Removes `!important` ONLY from plugin-specific selectors (e.g. .macros-*),
// where themes don't compete for specificity. Keeps it on selectors that
// override Obsidian's own classes or bare elements, which legitimately need it.
//
// Make a backup first, then run from the repo root:  node fix-important.js
const fs = require('fs');
const FILE = 'styles.css';

// Selectors that override Obsidian's own UI / theme — keep !important here.
const OBSIDIAN = /\.(modal|setting-|workspace|nav-|suggestion|menu|titlebar|view-|markdown|cm-|cm6|theme-|is-mobile|tooltip|mod-|clickable|tree-item|prompt|callout|table-view|HyperMD)/;
// Bare element targets (input/td/svg/...) — themes style these, so keep !important.
const BARE = /(^|[\s,>+~])(table|td|th|tr|thead|tbody|input|button|select|textarea|a|ul|li|div|span|h[1-6]|p|body|svg)([\s.,:{>+~]|$)/;

const lines = fs.readFileSync(FILE, 'utf8').split('\n');
let currentSelector = '';
let removed = 0;
const kept = [];

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();

  // Track the selector for the current rule block.
  if (trimmed.includes('{') && !trimmed.includes('}')) {
    currentSelector = trimmed.slice(0, trimmed.indexOf('{')).trim();
  }

  if (lines[i].includes('!important')) {
    const sel = currentSelector;
    const isObsidianOverride = OBSIDIAN.test(sel);
    const isBareElement = BARE.test(sel) && !sel.includes('macros') && !sel.includes('macro-');

    if (!isObsidianOverride && !isBareElement) {
      // Plugin-specific selector: remove the !important (and the space before it).
      lines[i] = lines[i].replace(/\s*!important/g, '');
      removed++;
    } else {
      kept.push(sel.slice(0, 70));
    }
  }
}

fs.writeFileSync(FILE, lines.join('\n'));
console.log(`Removed !important from ${removed} plugin-specific declarations.`);
console.log(`Kept ${kept.length} (Obsidian/theme/element overrides):`);
[...new Set(kept)].forEach((s) => console.log('   ', s));

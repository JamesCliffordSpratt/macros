// Conservative auto-fixer for @typescript-eslint/no-unused-vars.
// Handles only safe patterns; reports everything else for manual review.
// Run from repo root:  node cleanup-unused.js
const fs = require('fs');

let txt = fs.readFileSync('lintreport.json', 'utf8').replace(/^﻿/, '');
const report = JSON.parse(txt.slice(txt.indexOf('[')));

let done = 0;
const skipped = [];

for (const f of report) {
  const msgs = f.messages.filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars');
  if (!msgs.length) continue;

  const lines = fs.readFileSync(f.filePath, 'utf8').split('\n');
  const short = f.filePath.split(/[\\/]/).pop();

  for (const m of msgs) {
    const i = m.line - 1;
    const s = lines[i];
    const nameMatch = m.message.match(/'([^']+)'/);
    const name = nameMatch ? nameMatch[1] : null;
    const esc = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

    // 1) unused catch binding:  } catch (x) {  ->  } catch {
    if (/catch\s*\(/.test(s)) {
      lines[i] = s.replace(/catch\s*\([^)]*\)/, 'catch');
      done++;
      continue;
    }
    // 2) unused element var:  const x = parent.createEl(...)  ->  parent.createEl(...)
    if (name && /\.(createEl|createDiv|createSpan|createSvg)\(/.test(s)) {
      const re = new RegExp('(const|let)\\s+' + esc + '\\s*=\\s*');
      if (re.test(s)) {
        lines[i] = s.replace(re, '');
        done++;
        continue;
      }
    }
    // 3) unused destructure element:  for (const [id, _] of ...) -> [id]
    if (name && /for\s*\(\s*const\s*\[/.test(s)) {
      const t = s
        .replace(new RegExp(',\\s*' + esc + '\\s*\\]'), ']')
        .replace(new RegExp('\\[\\s*' + esc + '\\s*,'), '[');
      if (t !== s) {
        lines[i] = t;
        done++;
        continue;
      }
    }
    skipped.push(`${short}:${m.line}  ${name || ''}  | ${s.trim().slice(0, 70)}`);
  }

  fs.writeFileSync(f.filePath, lines.join('\n'));
}

console.log('auto-fixed', done, 'unused vars');
if (skipped.length) console.log('\nSKIPPED (handle manually):\n' + skipped.join('\n'));

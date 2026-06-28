// Explicit, bulletproof replacements for the mechanical lint issues in the
// large files (sentence-case button labels, display->class, inner-html, redundant type).
// Run from repo root:  node fixfinal.js
const fs = require('fs');

const edits = {
  'src/settings/StorageService.ts': [
    [
      `text: 'Rename tracking uses the Storage Folder configured in the General tab.'`,
      `text: 'Rename tracking uses the storage folder configured in the general tab.'`,
    ],
  ],
  'src/ui/live-search/LiveSearchModal.ts': [
    [`text: 'Save Food Item'`, `text: 'Save food item'`],
    [`imageDiv.style.display = 'none';`, `imageDiv.addClass('macros-u-hidden');`],
  ],
  'src/utils/BarcodeScanner.ts': [
    [`'Scan Barcode'`, `'Scan barcode'`],
    [`'⚠️ No camera detected'`, `'⚠️ no camera detected'`],
    [`'⚠️ Camera access issue detected'`, `'⚠️ camera access issue detected'`],
    [
      `'Check Windows Privacy Settings (Camera permissions)'`,
      `'Check Windows privacy settings (camera permissions)'`,
    ],
    [`'Try using "Upload Image" instead'`, `'Try using "upload image" instead'`],
    [`'🖼️ Upload Image'`, `'🖼️ upload image'`],
    [`'✏️ Enter Manually'`, `'✏️ enter manually'`],
    [`'📷 Start Camera Scan'`, `'📷 Start camera scan'`],
    [`'⏹️ Stop Scanning'`, `'⏹️ stop scanning'`],
    [`'Enter Barcode Manually'`, `'Enter barcode manually'`],
    [
      `decode?(target: HTMLCanvasElement | ImageData | unknown): Promise<ZXingResult>;`,
      `decode?(target: unknown): Promise<ZXingResult>;`,
    ],
    [`this.uploadInput.style.display = 'none';`, `this.uploadInput.addClass('macros-u-hidden');`],
  ],
  'src/ui/modals/AddToMacrosModal.ts': [
    [`this.searchClearButton.innerHTML = '✕';`, `this.searchClearButton.setText('✕');`],
    [
      `this.searchClearButton.style.display = 'none';`,
      `this.searchClearButton.addClass('macros-u-hidden');`,
    ],
    [
      `this.searchClearButton.style.display = 'flex';`,
      `this.searchClearButton.removeClass('macros-u-hidden');`,
    ],
  ],
  'src/ui/modals/ContextMenuManager.ts': [
    [
      `(tooltip as HTMLElement).style.display = 'none';`,
      `(tooltip as HTMLElement).addClass('macros-u-hidden');`,
    ],
    [
      `(tooltip as HTMLElement).style.display = '';`,
      `(tooltip as HTMLElement).removeClass('macros-u-hidden');`,
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
      missing.push(`${rel}: ${find.slice(0, 50)}`);
    }
  }
  fs.writeFileSync(rel, s);
}
console.log('applied', applied, 'replacements');
if (missing.length) console.log('NOT FOUND (check manually):\n' + missing.join('\n'));

# Macros v2.6.1

A maintenance and reliability release: faster food search, two notable bug fixes, and a full code-quality pass to meet Obsidian's new plugin review standards.

## 🐛 Bug fixes

- **Manual food entry — micronutrient section:** Fixed the collapsible micronutrient dropdown not opening when clicked. It now expands and collapses correctly.
- **Live search — "All" tab:** Results no longer vanish when one food database is slow or unavailable. Previously, if Open Food Facts errored, the entire "All" tab returned nothing even though FatSecret and USDA had results; a failing source is now skipped instead of blanking the whole tab.
- Fixed an edge-case error in search-result highlighting for queries containing special characters.

## ⚡ Performance

- **Much faster Open Food Facts search.** Searches now query the main (world) database directly instead of fanning out to several slow regional mirror endpoints — cutting each search from up to ~6 network requests down to 2. This speeds up both the Open Food Facts tab and the combined "All" tab.
- The "All" tab now gives each food source a time budget, so a slow or unresponsive API can no longer stall the whole search.

## 🔧 Under the hood

- **Full type-safety pass:** added proper TypeScript types for every food-database API response (FatSecret, USDA, Open Food Facts) and the internal data flow, removing unsafe `any` usage throughout.
- Brought the codebase fully in line with Obsidian's official plugin guidelines (now passes `eslint-plugin-obsidianmd` with zero issues) and updated the build toolchain (TypeScript 5, latest typescript-eslint).
- Improved popout-window and cross-platform compatibility (`activeDocument` and the Obsidian `Platform` API).
- Moved inline styles into CSS classes for better theme and snippet compatibility.
- Set the minimum Obsidian version to **1.4.10** to match the APIs the plugin actually uses.

> No changes to your data or note format — this release is fully backward compatible.

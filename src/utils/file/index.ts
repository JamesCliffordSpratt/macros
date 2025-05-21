import { App, TFile, TFolder, normalizePath } from 'obsidian';

/**
 * Gets all folders in the vault
 * @param app The Obsidian App instance
 * @returns Array of folder paths
 */
export function getVaultFolders(app: App): string[] {
	const folders: string[] = [];
	const traverse = (folder: TFolder) => {
		// Make sure to normalize all folder paths
		folders.push(normalizePath(folder.path));
		folder.children.forEach((child) => {
			if (child instanceof TFolder) {
				traverse(child);
			}
		});
	};
	traverse(app.vault.getRoot());
	return folders.sort();
}

/**
 * Find a matching food file in the list of files
 * @param files List of files to search through
 * @param foodQuery Query to search for
 * @returns Matching file or null if not found
 */
export function findMatchingFoodFile(files: TFile[], foodQuery: string): TFile | null {
	if (!foodQuery || foodQuery.trim() === '') {
		return null;
	}

	const queryLower = foodQuery.toLowerCase();
	const exactMatches = files.filter((f) => f.name.replace(/.md$/, '').toLowerCase() === queryLower);
	if (exactMatches.length === 1) return exactMatches[0];

	const partialMatches = files.filter((f) => f.name.toLowerCase().includes(queryLower));
	if (partialMatches.length === 1) return partialMatches[0];

	if (partialMatches.length > 1) {
		console.warn(
			`Ambiguous food query "${foodQuery}" matches multiple files. Please disambiguate.`
		);
		return null;
	}
	return null;
}

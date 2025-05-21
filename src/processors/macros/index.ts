import MacrosPlugin from '../../main';
import { MacrosTableRenderer } from './table';
import { extractIdFromSource } from './macrosUtils';

export function registerMacrosProcessor(plugin: MacrosPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('macros', async (source: string, el: HTMLElement) => {
		const lines = source
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l !== '');

		const id = extractIdFromSource(lines);

		if (id) {
			// Store only non-bullet point lines in the global macro tables
			const nonBulletLines = lines.filter((l) => !l.startsWith('-'));
			plugin.macroService.macroTables.set(id, nonBulletLines);
		}

		const renderer = new MacrosTableRenderer(plugin, el, id);
		await renderer.render(lines);
	});
}

import MacrosPlugin from '../main';
import { registerMacrosProcessor } from '../processors/macros';
import { registerMacrosPCProcessor } from '../processors/macrospc';
import { registerMacrosCalcProcessor } from '../processors/macroscalc';

/**
 * ProcessorManager
 * ----------------
 * Centralizes the registration of all markdown code block processors
 * for the Macros plugin. This helps keep the main plugin class clean.
 */
export function registerProcessors(plugin: MacrosPlugin): void {
  // Register all processors
  registerMacrosProcessor(plugin);
  registerMacrosPCProcessor(plugin);
  registerMacrosCalcProcessor(plugin);

  // Deprecated: the standalone `macrosmicro` block was merged into the `macros`
  // table. Register a no-op handler so any leftover blocks render nothing
  // instead of falling back to showing their raw source.
  plugin.registerMarkdownCodeBlockProcessor('macrosmicro', (_source, el) => {
    el.empty();
    el.style.display = 'none';
  });

  plugin.logger.debug('All processors registered');
}

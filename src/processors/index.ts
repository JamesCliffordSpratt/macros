import { registerMacrosProcessor } from './macros';
import { registerMacrosPCProcessor } from './macrospc';
import { registerMacrosCalcProcessor } from './macroscalc';
import MacrosPlugin from '../main';

export function registerProcessors(plugin: MacrosPlugin): void {
  registerMacrosProcessor(plugin);
  registerMacrosPCProcessor(plugin);
  registerMacrosCalcProcessor(plugin);
}

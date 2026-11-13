import { MarkdownRenderChild } from 'obsidian';
import MacrosPlugin from '../../main';
import { MacrosTableRenderer } from './table';
import { extractIdFromSource } from './macrosUtils';
import type { LiveMacrosBlock } from '../../managers/RefreshManager';

/**
 * One rendered `macros` code block. Its lifecycle is managed by Obsidian
 * (via `ctx.addChild`), so the block is registered for in-place refreshes
 * while it is on screen and its event listeners are released when Obsidian
 * removes it.
 */
class MacrosBlockChild extends MarkdownRenderChild implements LiveMacrosBlock {
  private plugin: MacrosPlugin;
  private id: string | null;
  private lines: string[];
  private renderer: MacrosTableRenderer;

  constructor(plugin: MacrosPlugin, containerEl: HTMLElement, id: string | null, lines: string[]) {
    super(containerEl);
    this.plugin = plugin;
    this.id = id;
    this.lines = lines;
    this.renderer = new MacrosTableRenderer(plugin, containerEl, id, this);
  }

  onload(): void {
    this.plugin.refreshManager.registerMacrosBlock(this);
  }

  onunload(): void {
    this.plugin.refreshManager.unregisterMacrosBlock(this);
  }

  async render(): Promise<void> {
    if (this.id) {
      // Store only non-bullet point lines in the global macro tables
      const nonBulletLines = this.lines.filter((l) => !l.startsWith('-'));
      this.plugin.macroService.macroTables.set(this.id, nonBulletLines);
    }
    await this.renderer.render(this.lines);
  }

  /** Redraw with current settings and food data (block source unchanged). */
  async rerender(): Promise<void> {
    this.renderer.invalidateCache();
    await this.render();
  }
}

export function registerMacrosProcessor(plugin: MacrosPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor('macros', async (source, el, ctx) => {
    const lines = source
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');

    const id = extractIdFromSource(lines);

    const block = new MacrosBlockChild(plugin, el, id, lines);
    ctx.addChild(block);
    await block.render();
  });
}

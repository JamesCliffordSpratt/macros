/**
 * ID Suggestion System
 * -------------------
 * Provides intelligent ID suggestions for macros code blocks with context menus
 */

import {
  EditorSuggest,
  Editor,
  TFile,
  EditorPosition,
  EditorSuggestTriggerInfo,
  EditorSuggestContext,
} from 'obsidian';
import MacrosPlugin from '../main';
import { t } from '../lang/I18nManager';

interface IDSuggestion {
  displayText: string;
  insertText: string;
  description: string;
  icon?: string;
}

/**
 * EditorSuggest extension for ID autocomplete in macros code blocks
 */
export class MacrosIDSuggest extends EditorSuggest<IDSuggestion> {
  private plugin: MacrosPlugin;

  constructor(plugin: MacrosPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    // Get the current line
    const line = editor.getLine(cursor.line);

    // Check if we're in a macros code block
    const codeBlockType = this.getCodeBlockType(editor, cursor);
    if (!codeBlockType) {
      return null;
    }

    // Check if the line matches "id: " or "ids: " pattern
    const idMatch = line.match(/^(\s*)(ids?:\s*)(.*)$/);
    if (!idMatch) {
      return null;
    }

    const [, indent, prefix, afterPrefix] = idMatch;
    const prefixEnd = indent.length + prefix.length;

    // Only trigger if cursor is at or after the prefix
    if (cursor.ch >= prefixEnd) {
      return {
        start: { line: cursor.line, ch: prefixEnd },
        end: { line: cursor.line, ch: line.length },
        query: afterPrefix.trim(),
      };
    }

    return null;
  }

  getSuggestions(context: EditorSuggestContext): IDSuggestion[] {
    const { editor } = context;
    const codeBlockType = this.getCodeBlockType(editor, context.start);

    if (!codeBlockType) {
      return [];
    }

    const suggestions: IDSuggestion[] = [];
    const today = new Date();

    // Always include "today" for all code block types
    suggestions.push({
      displayText: t('suggestions.today'),
      insertText: this.formatDate(today),
      description: t('suggestions.todayDesc'),
      icon: '📅',
    });

    // For macrospc and macroscalc, add week and month options
    if (codeBlockType === 'macrospc' || codeBlockType === 'macroscalc') {
      // Yesterday
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      suggestions.push({
        displayText: t('suggestions.yesterday'),
        insertText: this.formatDate(yesterday),
        description: t('suggestions.yesterdayDesc'),
        icon: '📅',
      });

      // This week (last 7 days including today)
      const weekDates = this.getWeekDates(today);
      suggestions.push({
        displayText: t('suggestions.thisWeek'),
        insertText: weekDates.join(', '),
        description: t('suggestions.thisWeekDesc'),
        icon: '📊',
      });

      // Last week (7 days before this week)
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - 13); // 13 days ago to start of last week
      const lastWeekDates = this.getWeekDates(lastWeekStart, 7);
      suggestions.push({
        displayText: t('suggestions.lastWeek'),
        insertText: lastWeekDates.join(', '),
        description: t('suggestions.lastWeekDesc'),
        icon: '📊',
      });

      // This month (all days from start of month to today)
      const monthDates = this.getMonthDates(today);
      suggestions.push({
        displayText: t('suggestions.thisMonth'),
        insertText: monthDates.join(', '),
        description: t('suggestions.thisMonthDesc'),
        icon: '📈',
      });

      // Last month
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthDates = this.getFullMonthDates(lastMonth);
      suggestions.push({
        displayText: t('suggestions.lastMonth'),
        insertText: lastMonthDates.join(', '),
        description: t('suggestions.lastMonthDesc'),
        icon: '📈',
      });
    }

    // Filter suggestions based on query if there is one
    const query = context.query.toLowerCase();
    if (query) {
      return suggestions.filter(
        (suggestion) =>
          suggestion.displayText.toLowerCase().includes(query) ||
          suggestion.description.toLowerCase().includes(query)
      );
    }

    return suggestions;
  }

  renderSuggestion(suggestion: IDSuggestion, el: HTMLElement): void {
    el.empty();

    const container = el.createDiv({ cls: 'macros-id-suggestion' });

    // Icon and main text
    const mainLine = container.createDiv({ cls: 'macros-id-suggestion-main' });

    if (suggestion.icon) {
      mainLine.createSpan({
        cls: 'macros-id-suggestion-icon',
        text: suggestion.icon,
      });
    }

    mainLine.createSpan({
      cls: 'macros-id-suggestion-title',
      text: suggestion.displayText,
    });

    // Description
    container.createDiv({
      cls: 'macros-id-suggestion-desc',
      text: suggestion.description,
    });

    // Preview of what will be inserted (truncated if too long)
    const previewText =
      suggestion.insertText.length > 60
        ? suggestion.insertText.substring(0, 60) + '...'
        : suggestion.insertText;

    container.createDiv({
      cls: 'macros-id-suggestion-preview',
      text: previewText,
    });
  }

  selectSuggestion(suggestion: IDSuggestion, evt: MouseEvent | KeyboardEvent): void {
    const { editor, start, end } = this.context!;

    // Replace the text after "id: " or "ids: " with the suggestion
    editor.replaceRange(suggestion.insertText, start, end);

    // Position cursor at the end of the inserted text
    const newCursor = {
      line: start.line,
      ch: start.ch + suggestion.insertText.length,
    };
    editor.setCursor(newCursor);
  }

  /**
   * Determines the type of code block the cursor is currently in
   */
  private getCodeBlockType(editor: Editor, cursor: EditorPosition): string | null {
    const lineCount = editor.lineCount();

    // Look backwards from cursor to find the opening ```
    let codeBlockStart = -1;
    let codeBlockType = '';

    for (let i = cursor.line; i >= 0; i--) {
      const line = editor.getLine(i).trim();

      // If we hit a closing ```, we're not in a code block
      if (line === '```' && i < cursor.line) {
        break;
      }

      // Check for opening code block
      const match = line.match(/^```\s*(macros|macrospc|macroscalc)\s*$/);
      if (match) {
        codeBlockStart = i;
        codeBlockType = match[1];
        break;
      }
    }

    if (codeBlockStart === -1) {
      return null;
    }

    // Look forwards to find the closing ```
    for (let i = cursor.line + 1; i < lineCount; i++) {
      const line = editor.getLine(i).trim();
      if (line === '```') {
        // We're inside a valid code block
        return codeBlockType;
      }
    }

    // If we reach here, we're in an unclosed code block, which is still valid
    return codeBlockType;
  }

  /**
   * Formats a date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Gets an array of date strings for the week ending on the given date
   */
  private getWeekDates(endDate: Date, daysBack: number = 6): string[] {
    const dates: string[] = [];

    for (let i = daysBack; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(endDate.getDate() - i);
      dates.push(this.formatDate(date));
    }

    return dates;
  }

  /**
   * Gets an array of date strings for the month up to the given date
   */
  private getMonthDates(endDate: Date): string[] {
    const dates: string[] = [];
    const firstDay = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    const currentDate = new Date(firstDay);
    while (currentDate <= endDate) {
      dates.push(this.formatDate(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  /**
   * Gets an array of date strings for the entire month
   */
  private getFullMonthDates(monthStart: Date): string[] {
    const dates: string[] = [];
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

    const currentDate = new Date(monthStart);
    while (currentDate <= lastDay) {
      dates.push(this.formatDate(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }
}

/**
 * Manager class for the ID suggestion system
 */
export class IDSuggestionManager {
  private plugin: MacrosPlugin;
  private idSuggest: MacrosIDSuggest | null = null;

  constructor(plugin: MacrosPlugin) {
    this.plugin = plugin;
  }

  /**
   * Initialize the ID suggestion system
   */
  initialize(): void {
    this.idSuggest = new MacrosIDSuggest(this.plugin);
    this.plugin.registerEditorSuggest(this.idSuggest);

    this.plugin.logger.debug('ID suggestion system initialized');
  }

  /**
   * Clean up the ID suggestion system
   */
  cleanup(): void {
    // The EditorSuggest is automatically cleaned up by Obsidian when the plugin unloads
    this.idSuggest = null;
    this.plugin.logger.debug('ID suggestion system cleaned up');
  }
}

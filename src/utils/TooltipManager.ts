import { DOMUtils } from './DOMUtils';
import MacrosPlugin from '@/main';

// Global tooltip element and tracking variables
let tooltipEl: HTMLDivElement | null = null;
let mutationObserver: MutationObserver | null = null;
let pluginInstance: MacrosPlugin | null = null;

function ensureTooltipEl(): HTMLDivElement {
	if (!tooltipEl) {
		tooltipEl = document.createElement('div');
		tooltipEl.className = 'macro-tooltip macro-tooltip-hidden';
		tooltipEl.setAttribute('style', '--x: -9999px; --y: -9999px;');
		document.body.appendChild(tooltipEl);
	}
	return tooltipEl;
}

export class TooltipManager {
	// Simple state tracking
	private static isActive = false;
	private static activeTarget: HTMLElement | null = null;
	private static activeContent = '';

	// Single timer for delayed operations
	private static timer: ReturnType<typeof setTimeout> | null = null;

	// Constants
	private static readonly SHOW_DELAY = 50;
	private static readonly HIDE_DELAY = 150;

	static initGlobalTooltipSystem(plugin: MacrosPlugin): void {
		// Store plugin instance for later use
		pluginInstance = plugin;

		const tooltip = ensureTooltipEl();

		// Mouse enter/leave handlers for the tooltip itself - using registerDomEvent
		plugin.registerDomEvent(tooltip, 'mouseenter', () => {
			tooltip.classList.add('tooltip-visible');
		});

		plugin.registerDomEvent(tooltip, 'mouseleave', () => {
			TooltipManager.hide();
		});

		// Global event listeners - using registerDomEvent
		plugin.registerDomEvent(document, 'visibilitychange', () => {
			if (document.hidden) TooltipManager.forceHide();
		});

		plugin.registerDomEvent(window, 'resize', () => {
			TooltipManager.forceHide();
		});

		plugin.registerDomEvent(window, 'beforeunload', () => {
			TooltipManager.forceHide();
		});

		// DOM mutation observer to hide tooltip when DOM changes
		if (mutationObserver) {
			mutationObserver.disconnect();
		}

		mutationObserver = new MutationObserver(() => {
			TooltipManager.forceHide();
		});

		const root = document.querySelector('.workspace') || document.body;
		mutationObserver.observe(root, { childList: true, subtree: true });
	}

	/**
	 * Cleanup all resources used by the tooltip system
	 */
	static cleanup(): void {
		// Clean up the mutation observer
		if (mutationObserver) {
			mutationObserver.disconnect();
			mutationObserver = null;
		}

		// Clear any pending timers
		if (TooltipManager.timer !== null) {
			clearTimeout(TooltipManager.timer);
			TooltipManager.timer = null;
		}

		// Remove tooltip element from the DOM
		if (tooltipEl && tooltipEl.parentNode) {
			tooltipEl.parentNode.removeChild(tooltipEl);
			tooltipEl = null;
		}

		// Reset state
		TooltipManager.isActive = false;
		TooltipManager.activeTarget = null;
		TooltipManager.activeContent = '';

		// Clear plugin reference
		pluginInstance = null;
	}

	/**
	 * Request to show a tooltip on a target element
	 */
	static show(targetEl: HTMLElement, text: string): void {
		// Always clear any pending timer first
		if (TooltipManager.timer !== null) {
			clearTimeout(TooltipManager.timer);
			TooltipManager.timer = null;
		}

		// Update current state
		TooltipManager.activeTarget = targetEl;
		TooltipManager.activeContent = text;

		// Set timer to show tooltip after delay
		TooltipManager.timer = setTimeout(() => {
			TooltipManager.displayTooltip();
			TooltipManager.timer = null;
		}, TooltipManager.SHOW_DELAY);
	}

	/**
	 * Actually display the tooltip at the target position
	 */
	private static displayTooltip(): void {
		if (!TooltipManager.activeTarget || !TooltipManager.activeContent) return;

		const el = ensureTooltipEl();
		const targetEl = TooltipManager.activeTarget;

		// First reset all classes
		el.classList.remove('tooltip-visible');
		el.classList.add('macro-tooltip-hidden');

		// Set content
		el.textContent = TooltipManager.activeContent;

		// Position the tooltip
		const rect = targetEl.getBoundingClientRect();
		const x = rect.left + rect.width / 2 + window.scrollX;
		const y = rect.bottom + 8 + window.scrollY;

		// Set position
		DOMUtils.setCSSProperty(el, '--x', `${x}px`);
		DOMUtils.setCSSProperty(el, '--y', `${y}px`);

		// Show tooltip (force reflow between class changes)
		el.classList.remove('macro-tooltip-hidden');
		el.classList.add('macro-tooltip-positioned');

		// Force reflow
		void el.offsetWidth;

		// Make visible
		el.classList.add('tooltip-visible');
		TooltipManager.isActive = true;
	}

	/**
	 * Request to hide the tooltip
	 */
	static hide(): void {
		// Clear any pending show timer
		if (TooltipManager.timer !== null) {
			clearTimeout(TooltipManager.timer);
			TooltipManager.timer = null;
		}

		// Only proceed if tooltip is currently active
		if (!TooltipManager.isActive) return;

		// Set timer to hide tooltip after delay
		TooltipManager.timer = setTimeout(() => {
			TooltipManager.hideTooltip();
			TooltipManager.timer = null;
		}, TooltipManager.HIDE_DELAY);
	}

	/**
	 * Actually hide the tooltip
	 */
	private static hideTooltip(): void {
		const el = ensureTooltipEl();

		// Remove visible class first (starts CSS transition)
		el.classList.remove('tooltip-visible');

		// Wait for transition to complete before hiding completely
		setTimeout(() => {
			if (!el.classList.contains('tooltip-visible')) {
				el.classList.add('macro-tooltip-hidden');
				el.classList.remove('macro-tooltip-positioned');
				DOMUtils.setCSSProperty(el, '--x', `-9999px`);
				DOMUtils.setCSSProperty(el, '--y', `-9999px`);
				el.textContent = '';

				// Reset state
				TooltipManager.isActive = false;
				TooltipManager.activeTarget = null;
				TooltipManager.activeContent = '';
			}
		}, 150); // Match transition duration in CSS
	}

	/**
	 * Immediately hide tooltip without delay or animation
	 */
	static forceHide(): void {
		// Clear any pending timers
		if (TooltipManager.timer !== null) {
			clearTimeout(TooltipManager.timer);
			TooltipManager.timer = null;
		}

		const el = tooltipEl;
		if (el) {
			// Reset all classes immediately
			el.classList.remove('tooltip-visible');
			el.classList.add('macro-tooltip-hidden');
			el.classList.remove('macro-tooltip-positioned');

			// Move offscreen
			DOMUtils.setCSSProperty(el, '--x', `-9999px`);
			DOMUtils.setCSSProperty(el, '--y', `-9999px`);
			el.textContent = '';
		}

		// Reset state
		TooltipManager.isActive = false;
		TooltipManager.activeTarget = null;
		TooltipManager.activeContent = '';
	}
}

export function attachTooltip(targetEl: HTMLElement, tooltipContent: string): void {
	// Skip if no plugin instance available
	if (!pluginInstance) return;

	// Use registerDomEvent for pointerenter/leave events
	pluginInstance.registerDomEvent(targetEl, 'pointerenter', () => {
		TooltipManager.show(targetEl, tooltipContent);
	});

	pluginInstance.registerDomEvent(targetEl, 'pointerleave', () => {
		TooltipManager.hide();
	});
}

export function attachLazyTooltip(targetEl: HTMLElement, tooltipContent: string): void {
	attachTooltip(targetEl, tooltipContent);
}

export function safeAttachTooltip(
	targetEl: HTMLElement,
	tooltipContent: string,
	plugin: MacrosPlugin
): void {
	// Store plugin instance if not already stored
	if (!pluginInstance) {
		pluginInstance = plugin;
	}

	if (plugin.settings.disableTooltips) {
		return;
	}
	attachTooltip(targetEl, tooltipContent);
}

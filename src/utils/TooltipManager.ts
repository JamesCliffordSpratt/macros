import { DOMUtils } from './DOMUtils';
import MacrosPlugin from '@/main';

// Global tooltip element and tracking variables
let tooltipEl: HTMLDivElement | null = null;
let mutationObserver: MutationObserver | null = null;
let pluginInstance: MacrosPlugin | null = null;
let isMobileDevice = false;

// Simplified mobile detection
function detectMobileDevice(): boolean {
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

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
  private static mobileHideTimer: ReturnType<typeof setTimeout> | null = null;

  // Simplified constants
  private static readonly SHOW_DELAY = 100;
  private static readonly HIDE_DELAY = 200;

  static initGlobalTooltipSystem(plugin: MacrosPlugin): void {
    // Store plugin instance for later use
    pluginInstance = plugin;

    // Update mobile detection on resize
    isMobileDevice = detectMobileDevice();

    const tooltip = ensureTooltipEl();

    // Desktop hover behavior
    plugin.registerDomEvent(tooltip, 'mouseenter', () => {
      if (!isMobileDevice) {
        tooltip.classList.add('tooltip-visible');
      }
    });

    plugin.registerDomEvent(tooltip, 'mouseleave', () => {
      if (!isMobileDevice) {
        TooltipManager.hide();
      }
    });

    // Global event listeners
    plugin.registerDomEvent(document, 'visibilitychange', () => {
      if (document.hidden) TooltipManager.forceHide();
    });

    plugin.registerDomEvent(window, 'resize', () => {
      TooltipManager.forceHide();
      isMobileDevice = detectMobileDevice();
    });

    plugin.registerDomEvent(window, 'beforeunload', () => {
      TooltipManager.forceHide();
    });

    // Mobile: Hide tooltip when scrolling
    plugin.registerDomEvent(
      window,
      'scroll',
      () => {
        if (isMobileDevice) {
          TooltipManager.forceHide();
        }
      },
      { passive: true }
    );

    // DOM mutation observer
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = new MutationObserver(() => {
      TooltipManager.forceHide();
    });

    const root = document.querySelector('.workspace') || document.body;
    mutationObserver.observe(root, { childList: true, subtree: true });
  }

  static cleanup(): void {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    if (TooltipManager.timer !== null) {
      clearTimeout(TooltipManager.timer);
      TooltipManager.timer = null;
    }

    if (TooltipManager.mobileHideTimer !== null) {
      clearTimeout(TooltipManager.mobileHideTimer);
      TooltipManager.mobileHideTimer = null;
    }

    if (tooltipEl && tooltipEl.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl);
      tooltipEl = null;
    }

    TooltipManager.isActive = false;
    TooltipManager.activeTarget = null;
    TooltipManager.activeContent = '';
    pluginInstance = null;
  }

  static show(targetEl: HTMLElement, text: string): void {
    // Clear any existing timers
    if (TooltipManager.timer !== null) {
      clearTimeout(TooltipManager.timer);
      TooltipManager.timer = null;
    }

    if (TooltipManager.mobileHideTimer !== null) {
      clearTimeout(TooltipManager.mobileHideTimer);
      TooltipManager.mobileHideTimer = null;
    }

    TooltipManager.activeTarget = targetEl;
    TooltipManager.activeContent = text;

    // Show immediately on mobile, with delay on desktop
    const delay = isMobileDevice ? 0 : TooltipManager.SHOW_DELAY;

    TooltipManager.timer = setTimeout(() => {
      TooltipManager.displayTooltip();
      TooltipManager.timer = null;
    }, delay);
  }

  private static displayTooltip(): void {
    if (!TooltipManager.activeTarget || !TooltipManager.activeContent) return;

    const el = ensureTooltipEl();
    const targetEl = TooltipManager.activeTarget;

    // Reset classes
    el.classList.remove('tooltip-visible');
    el.classList.add('macro-tooltip-hidden');

    // Set content
    el.textContent = TooltipManager.activeContent;

    // Position tooltip
    const rect = targetEl.getBoundingClientRect();
    let x = rect.left + rect.width / 2 + window.scrollX;
    let y = rect.bottom + 12 + window.scrollY;

    // Mobile positioning adjustments
    if (isMobileDevice) {
      el.classList.add('macro-tooltip-mobile');

      // Position near the bottom of the Obsidian app, but above the toolbar
      const obsidianApp = document.querySelector('.app-container') || document.body;
      const appRect = obsidianApp.getBoundingClientRect();

      // Set Y position to be above the bottom toolbar (more clearance)
      const bottomOffset = 120; // Increased distance from bottom to avoid toolbar
      y = appRect.bottom - bottomOffset + window.scrollY;

      // Center horizontally in the app
      x = appRect.left + appRect.width / 2 + window.scrollX;

      // Keep within viewport horizontally
      const tooltipWidth = 240;
      if (x + tooltipWidth / 2 > window.innerWidth - 10) {
        x = window.innerWidth - tooltipWidth / 2 - 10;
      }
      if (x - tooltipWidth / 2 < 10) {
        x = tooltipWidth / 2 + 10;
      }

      // Ensure it doesn't go below the viewport
      if (y + 40 > window.innerHeight + window.scrollY) {
        y = window.innerHeight + window.scrollY - 50;
      }
    } else {
      el.classList.remove('macro-tooltip-mobile');
    }

    // Set position
    DOMUtils.setCSSProperty(el, '--x', `${x}px`);
    DOMUtils.setCSSProperty(el, '--y', `${y}px`);

    // Show tooltip
    el.classList.remove('macro-tooltip-hidden');
    el.classList.add('macro-tooltip-positioned');

    // Force reflow
    void el.offsetWidth;

    el.classList.add('tooltip-visible');
    TooltipManager.isActive = true;

    // Auto-hide on mobile after 3 seconds
    if (isMobileDevice) {
      TooltipManager.mobileHideTimer = setTimeout(() => {
        TooltipManager.forceHide();
      }, 3000);
    }
  }

  static hide(): void {
    if (TooltipManager.timer !== null) {
      clearTimeout(TooltipManager.timer);
      TooltipManager.timer = null;
    }

    if (!TooltipManager.isActive) return;

    // Hide immediately on mobile
    const hideDelay = isMobileDevice ? 0 : TooltipManager.HIDE_DELAY;

    TooltipManager.timer = setTimeout(() => {
      TooltipManager.hideTooltip();
      TooltipManager.timer = null;
    }, hideDelay);
  }

  private static hideTooltip(): void {
    const el = ensureTooltipEl();

    el.classList.remove('tooltip-visible');

    setTimeout(() => {
      if (!el.classList.contains('tooltip-visible')) {
        el.classList.add('macro-tooltip-hidden');
        el.classList.remove('macro-tooltip-positioned');
        el.classList.remove('macro-tooltip-mobile');
        DOMUtils.setCSSProperty(el, '--x', `-9999px`);
        DOMUtils.setCSSProperty(el, '--y', `-9999px`);
        el.textContent = '';

        TooltipManager.isActive = false;
        TooltipManager.activeTarget = null;
        TooltipManager.activeContent = '';
      }
    }, 150);
  }

  static forceHide(): void {
    if (TooltipManager.timer !== null) {
      clearTimeout(TooltipManager.timer);
      TooltipManager.timer = null;
    }

    if (TooltipManager.mobileHideTimer !== null) {
      clearTimeout(TooltipManager.mobileHideTimer);
      TooltipManager.mobileHideTimer = null;
    }

    const el = tooltipEl;
    if (el) {
      el.classList.remove('tooltip-visible');
      el.classList.remove('macro-tooltip-mobile');
      el.classList.add('macro-tooltip-hidden');
      el.classList.remove('macro-tooltip-positioned');

      DOMUtils.setCSSProperty(el, '--x', `-9999px`);
      DOMUtils.setCSSProperty(el, '--y', `-9999px`);
      el.textContent = '';
    }

    TooltipManager.isActive = false;
    TooltipManager.activeTarget = null;
    TooltipManager.activeContent = '';
  }
}

// Simplified attachment functions
export function attachTooltip(targetEl: HTMLElement, tooltipContent: string): void {
  if (!pluginInstance) return;

  if (isMobileDevice) {
    // Simple tap to show on mobile
    pluginInstance.registerDomEvent(targetEl, 'click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      TooltipManager.show(targetEl, tooltipContent);
    });
  } else {
    // Hover on desktop
    pluginInstance.registerDomEvent(targetEl, 'pointerenter', () => {
      TooltipManager.show(targetEl, tooltipContent);
    });

    pluginInstance.registerDomEvent(targetEl, 'pointerleave', () => {
      TooltipManager.hide();
    });
  }
}

export function attachLazyTooltip(targetEl: HTMLElement, tooltipContent: string): void {
  attachTooltip(targetEl, tooltipContent);
}

export function safeAttachTooltip(
  targetEl: HTMLElement,
  tooltipContent: string,
  plugin: MacrosPlugin
): void {
  if (!pluginInstance) {
    pluginInstance = plugin;
    isMobileDevice = detectMobileDevice();
  }

  if (plugin.settings.disableTooltips) {
    return;
  }
  attachTooltip(targetEl, tooltipContent);
}

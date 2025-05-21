/**
 * EventManager
 * ------------
 * A unified approach to event listener management throughout the Macros plugin.
 * This utility helps register and properly clean up event listeners across components.
 */
import MacrosPlugin from '../main';

export class EventManager {
	private plugin: MacrosPlugin;
	private eventListeners: { el: HTMLElement; type: string; handler: EventListener }[] = [];

	constructor(plugin: MacrosPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Register a DOM event for an element with automatic cleanup tracking
	 *
	 * @param el The HTML element to attach the event to
	 * @param type The event type (e.g., 'click', 'mouseenter')
	 * @param handler The event handler function
	 */
	registerDomEvent(el: HTMLElement, type: string, handler: EventListener): void {
		try {
			// If plugin provides registerDomListener, use that for global cleanup
			if (this.plugin && typeof this.plugin.registerDomListener === 'function') {
				this.plugin.registerDomListener(el, type, handler);
			} else {
				// Otherwise, add the event listener directly and track it
				el.addEventListener(type, handler);
				this.eventListeners.push({ el, type, handler });
			}
		} catch (error) {
			this.plugin.logger.error(`Error registering ${type} event:`, error);
		}
	}

	/**
	 * Clean up all tracked event listeners
	 * This should be called when the component is no longer needed
	 */
	cleanup(): void {
		// Clean up any event listeners we've manually tracked
		for (const { el, type, handler } of this.eventListeners) {
			try {
				el.removeEventListener(type, handler);
			} catch (error) {
				this.plugin.logger.error(`Error removing ${type} event listener:`, error);
			}
		}

		// Clear the tracking array
		this.eventListeners = [];
	}
}

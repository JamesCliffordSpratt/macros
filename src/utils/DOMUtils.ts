/**
 * DOM utility functions for CSS property manipulation
 * and other DOM-related operations
 */
export class DOMUtils {
  /**
   * @param element The HTML element to modify
   * @param property The CSS property name (without -- prefix)
   * @param value The value to set
   */
  static setCSSProperty(element: HTMLElement, property: string, value: string): void {
    // Ensure property is prefixed with --
    const cssVar = property.startsWith('--') ? property : `--${property}`;

    // Get current inline styles
    const currentStyle = element.getAttribute('style') || '';

    // Remove existing property if present
    const styleProps = currentStyle
      .split(';')
      .filter((prop) => prop.trim() !== '')
      .filter((prop) => !prop.trim().startsWith(`${cssVar}:`));

    // Add the new property
    styleProps.push(`${cssVar}: ${value}`);

    // Set the updated style attribute
    element.setAttribute('style', styleProps.join('; '));
  }

  /**
   * @param element The HTML element to modify
   * @param property The CSS property name (without -- prefix)
   */
  static removeCSSProperty(element: HTMLElement, property: string): void {
    // Ensure property is prefixed with --
    const cssVar = property.startsWith('--') ? property : `--${property}`;

    // Get current inline styles
    const currentStyle = element.getAttribute('style') || '';

    if (!currentStyle) return;

    // Filter out the property to remove
    const styleProps = currentStyle
      .split(';')
      .filter((prop) => prop.trim() !== '')
      .filter((prop) => !prop.trim().startsWith(`${cssVar}:`));

    // If there are remaining properties, set the style attribute
    // Otherwise, remove the style attribute entirely
    if (styleProps.length > 0) {
      element.setAttribute('style', styleProps.join('; '));
    } else {
      element.removeAttribute('style');
    }
  }
}

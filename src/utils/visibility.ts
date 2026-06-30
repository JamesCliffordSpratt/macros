/**
 * Run `draw` once `el` is actually visible on screen.
 *
 * Why this exists: on a cold start, Obsidian restores the last open note and
 * runs markdown code-block processors while the leaf is still deferred/hidden.
 * In that state `requestAnimationFrame` is paused, so Chart.js creates the chart
 * but never paints it, and responsive charts measure a 0x0 container. The chart
 * only appears once the user navigates away and back (which re-runs the
 * processor while the view is visible).
 *
 * By waiting for the element to be genuinely visible before drawing, the chart
 * paints correctly on first load. If the element is already visible, `draw`
 * runs synchronously.
 *
 * Returns a disposer that cancels a pending observation.
 */
export function drawWhenVisible(el: HTMLElement, draw: () => void): () => void {
  const visibleNow = () =>
    el.isConnected && el.offsetParent !== null && el.getBoundingClientRect().width > 0;

  if (visibleNow()) {
    draw();
    return () => {};
  }

  let disposed = false;
  const observer = new IntersectionObserver((entries) => {
    if (disposed) return;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        disposed = true;
        observer.disconnect();
        draw();
        return;
      }
    }
  });
  observer.observe(el);

  return () => {
    disposed = true;
    observer.disconnect();
  };
}

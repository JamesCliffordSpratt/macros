import { ChartLoader } from '../ChartLoader';

// Make Chart.js available on the window object in a type-safe way
declare global {
  interface Window {
    Chart?: typeof import('chart.js').Chart;
    macroCharts?: Record<string, import('chart.js').Chart>; // Keeping for backward compatibility
  }
}

/**
 * Calculate angles for pie chart slices
 * @param slices Array of slice values
 * @returns Array of angles in radians
 */
export function calculatePieChartAngles(slices: { value: number }[]): number[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return [];

  const angles = slices.map((slice) => (slice.value / total) * 2 * Math.PI);
  const sumAngles = angles.reduce((acc, val) => acc + val, 0);
  const angleDiff = 2 * Math.PI - sumAngles;

  if (angles.length > 0) angles[angles.length - 1] += angleDiff;
  return angles;
}

/**
 * Creates a legend for a pie chart
 * @param el Parent element to add the legend to
 * @param slices Array of slices with labels, values, and colors
 * @returns The created legend element
 */
export function createPieChartLegend(
  el: HTMLElement,
  slices: { label: string; value: number; color: string }[]
): HTMLElement {
  const legendDiv = el.createEl('div', {
    cls: 'macrospc-legend',
  });

  slices.forEach((slice) => {
    const legendItem = legendDiv.createEl('div', {
      cls: 'macrospc-legend-item',
    });

    const colorBox = legendItem.createEl('span');
    colorBox.addClass('macrospc-legend-color-box');
    colorBox.setAttribute('data-color', slice.color);

    legendItem.createEl('span', { text: `${slice.label}: ${slice.value.toFixed(2)} g` });
  });

  return legendDiv;
}

/**
 * Renders a pie chart using Chart.js
 * @returns Boolean indicating if rendering was successful
 */
export function renderMacronutrientPieChart(
  ctx: CanvasRenderingContext2D,
  protein: number,
  fat: number,
  carbs: number,
  proteinColor: string,
  fatColor: string,
  carbsColor: string
): boolean {
  const sumMacros = protein + fat + carbs;
  if (sumMacros <= 0) return false;

  // Get the ChartLoader instance
  const chartLoader = ChartLoader.getInstance();

  // Ensure Chart.js is loaded
  if (!window.Chart) {
    // We'll load Chart.js through the ChartLoader
    console.warn('Chart.js not loaded, attempting to load via ChartLoader');
    return false;
  }

  const canvas = ctx.canvas;
  const chartId = canvas.id || `macro-chart-${Math.random().toString(36).substring(2, 15)}`;
  canvas.id = chartId;

  // Destroy any existing chart with this ID using ChartLoader
  chartLoader.destroyChart(chartId);

  // Create the new chart
  const chart = new window.Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Protein', 'Fat', 'Carbs'],
      datasets: [
        {
          data: [protein, fat, carbs],
          backgroundColor: [proteinColor, fatColor, carbsColor],
          borderColor: 'rgba(255, 255, 255, 0.4)',
          borderWidth: 1,
          hoverBorderWidth: 2,
          hoverBorderColor: 'rgba(255, 255, 255, 0.9)',
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart',
      },
      layout: {
        padding: 5,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { weight: 'bold', size: 14 },
          bodyFont: { size: 12 },
          cornerRadius: 6,
          padding: 8,
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = (context.raw as number) || 0;
              const percentage = ((value / sumMacros) * 100).toFixed(1);
              return `${label}: ${value.toFixed(1)}g (${percentage}%)`;
            },
          },
        },
      },
    },
  });

  // Register with ChartLoader for proper management
  chartLoader.registerChart(chartId, chart);

  // For backward compatibility, also store in window.macroCharts
  if (!window.macroCharts) {
    window.macroCharts = {};
  }
  window.macroCharts[chartId] = chart;

  return true;
}

/**
 * Cleans up any legacy chart instances
 * This should be called during plugin unload to prevent memory leaks
 */
export function cleanupMacroCharts(): void {
  if (window.macroCharts) {
    Object.entries(window.macroCharts).forEach(([id, chart]) => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    window.macroCharts = {};
  }
}

/**
 * Ensures Chart.js is loaded (wrapper for ChartLoader)
 */
export async function ensureChartJsLoaded(): Promise<void> {
  await ChartLoader.getInstance().loadChart();
}

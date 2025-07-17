/**
 * ChartLoader Utility
 * Handles bundled Chart.js library management
 */
import type { Chart } from 'chart.js';
import { Chart as ChartJS, registerables } from 'chart.js';

export class ChartLoader {
  private static instance: ChartLoader;
  private loadPromise: Promise<typeof Chart> | null = null;
  private chartInstances: Map<string, Chart> = new Map();
  private initialized = false;

  public static getInstance(): ChartLoader {
    if (!ChartLoader.instance) {
      ChartLoader.instance = new ChartLoader();
    }
    return ChartLoader.instance;
  }

  public async loadChart(): Promise<typeof Chart> {
    // If we have a cached promise, return it
    if (this.loadPromise) return this.loadPromise;

    // Create a new promise for loading
    this.loadPromise = new Promise<typeof Chart>((resolve) => {
      // Initialize Chart.js if not already done
      if (!this.initialized) {
        // Register all Chart.js components
        ChartJS.register(...registerables);

        // Make ChartJS available on window for backward compatibility
        (window as Window & { Chart: typeof ChartJS }).Chart = ChartJS;

        this.initialized = true;
      }

      // Resolve with the imported Chart
      resolve(ChartJS);
    });

    return this.loadPromise;
  }

  public registerChart(id: string, chart: Chart): void {
    this.destroyChart(id);
    this.chartInstances.set(id, chart);
  }

  public destroyChart(id: string): void {
    const chart = this.chartInstances.get(id);
    if (chart) {
      chart.destroy();
      this.chartInstances.delete(id);
    }
  }

  public destroyAllCharts(): void {
    this.chartInstances.forEach((chart) => chart.destroy());
    this.chartInstances.clear();
  }
}

// ensureChartJsLoaded function is now solely in charts/index.ts
export async function ensureChartJsLoaded(): Promise<void> {
  await ChartLoader.getInstance().loadChart();
}

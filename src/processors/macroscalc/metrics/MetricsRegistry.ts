export type MetricCategory = 'totals' | 'ratios' | 'trends' | 'extremes' | 'adherence' | 'display';

export interface MetricValue {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  color?: string;
  tooltip?: string;
}

export interface MetricData {
  id: string;
  totals: { calories: number; protein: number; fat: number; carbs: number };
  aggregate?: { calories: number; protein: number; fat: number; carbs: number }; // Add for backward compatibility
  breakdown: Array<{
    id: string;
    totals: { calories: number; protein: number; fat: number; carbs: number };
  }>;
  dateIds: string[];
  targets: { calories: number; protein: number; fat: number; carbs: number };
}

export interface MetricConfig {
  id: string;
  enabled: boolean;
  settings?: Record<string, any>;
}

export interface MacroscalcMetric {
  id: string;
  name: string;
  description: string;
  category: MetricCategory;
  defaultEnabled: boolean;
  configurable: boolean;

  calculate(data: MetricData): MetricValue[];

  getConfigUI?(): {
    render(
      container: HTMLElement,
      config: Record<string, any>,
      onChange: (config: Record<string, any>) => void
    ): void;
    getDefaultConfig(): Record<string, any>;
  };
}

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  private metrics: Map<string, MacroscalcMetric> = new Map();

  public static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  register(metric: MacroscalcMetric): void {
    this.metrics.set(metric.id, metric);
  }

  unregister(metricId: string): void {
    this.metrics.delete(metricId);
  }

  get(metricId: string): MacroscalcMetric | undefined {
    return this.metrics.get(metricId);
  }

  getAll(): MacroscalcMetric[] {
    return Array.from(this.metrics.values());
  }

  getByCategory(category: MetricCategory): MacroscalcMetric[] {
    return this.getAll().filter((metric) => metric.category === category);
  }

  calculateMetrics(data: MetricData, enabledMetrics: MetricConfig[]): Map<string, MetricValue[]> {
    const results = new Map<string, MetricValue[]>();

    enabledMetrics.forEach((config) => {
      const metric = this.get(config.id);
      if (metric && config.enabled) {
        try {
          const values = metric.calculate(data);
          results.set(config.id, values);
        } catch (error) {
          console.error(`Error calculating metric ${config.id}:`, error);
        }
      }
    });

    return results;
  }
}

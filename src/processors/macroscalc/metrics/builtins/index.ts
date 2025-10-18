import { MetricsRegistry } from '../MetricsRegistry';
import { TotalsAndAveragesMetric } from './TotalsAndAveragesMetric';
import { RatiosMetric } from './RatiosMetric';
import { TrendsMetric } from './TrendsMetric';
import { ExtremesMetric } from './ExtremesMetric';
import { AdherenceMetric } from './AdherenceMetric';
import { DisplayOptionsMetric } from './DisplayOptionsMetric';

export function registerBuiltinMetrics(registry: MetricsRegistry): void {
  // Register all built-in metrics
  registry.register(new TotalsAndAveragesMetric());
  registry.register(new RatiosMetric());
  registry.register(new TrendsMetric());
  registry.register(new ExtremesMetric());
  registry.register(new AdherenceMetric());
  registry.register(new DisplayOptionsMetric());
}

import { MacroscalcMetric, MetricValue, MetricData } from '../MetricsRegistry';
import { Setting } from 'obsidian';
import { t } from '../../../../lang/I18nManager';

export class DisplayOptionsMetric implements MacroscalcMetric {
  id = 'display-options';
  name = t('metrics.display.name');
  description = t('metrics.display.description');
  category = 'display' as const;
  defaultEnabled = true;
  configurable = true;

  getConfigUI() {
    return {
      render: (
        container: HTMLElement,
        config: Record<string, any>,
        onChange: (config: Record<string, any>) => void
      ) => {
        new Setting(container)
          .setName(t('metrics.display.showTable'))
          .setDesc(t('metrics.display.showTableDesc'))
          .addToggle((toggle) => {
            toggle
              .setValue(config.showTable !== false) // Default to true
              .onChange((value) => {
                config.showTable = value;
                onChange(config);
              });
          });

        new Setting(container)
          .setName(t('metrics.display.showChart'))
          .setDesc(t('metrics.display.showChartDesc'))
          .addToggle((toggle) => {
            toggle
              .setValue(config.showChart !== false) // Default to true
              .onChange((value) => {
                config.showChart = value;
                onChange(config);
              });
          });
      },
      getDefaultConfig: () => ({
        showTable: true,
        showChart: true,
      }),
    };
  }

  calculate(data: MetricData): MetricValue[] {
    // This metric doesn't calculate values, it just provides display configuration
    // Return empty array since it's purely for configuration
    return [];
  }
}

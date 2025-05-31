/**
 * Progress bar utility for creating consistent progress visualizations
 */
import { CLASS_NAMES } from './constants';

export const PROGRESS_BAR_CONFIG = {
  MINIMUM_WIDTH_PX: 5,
  THRESHOLDS: {
    NEAR_TARGET: 80,
    OVER_TARGET: 100,
    OVERFLOW_INDICATOR: 15,
  },
};

export class ProgressBarFactory {
  static createMacroProgressBar(container: HTMLElement, value: number, macroType: string): void {
    const progressContainer = container.createDiv({ cls: CLASS_NAMES.PROGRESS.CONTAINER });

    const safeValue = Math.max(0, Math.min(100, value));
    const widthClass =
      value < 5 ? 'progress-width-5px' : `progress-width-${Math.round(safeValue / 5) * 5}`;

    const _progressBar = progressContainer.createDiv({
      cls: `${CLASS_NAMES.PROGRESS.BAR} ${macroType}-progress ${widthClass}`,
    });

    if (value < 5) {
      _progressBar.classList.add(CLASS_NAMES.PROGRESS.MICRO_VALUE);
    }
  }

  static createEnhancedTargetBar(
    container: HTMLElement,
    value: number,
    target: number,
    macroType?: string
  ): void {
    if (target <= 0) {
      console.warn(`Invalid target value: ${target}. Using fallback.`);
      target = 1;
    }

    const percentage = (value / target) * 100;
    const progressContainer = container.createDiv({ cls: CLASS_NAMES.PROGRESS.TARGET_CONTAINER });

    let statusClass: string = CLASS_NAMES.PROGRESS.UNDER_TARGET;
    if (percentage >= PROGRESS_BAR_CONFIG.THRESHOLDS.OVER_TARGET) {
      statusClass = CLASS_NAMES.PROGRESS.OVER_TARGET;
    } else if (percentage >= PROGRESS_BAR_CONFIG.THRESHOLDS.NEAR_TARGET) {
      statusClass = CLASS_NAMES.PROGRESS.NEAR_TARGET;
    }

    const macroClass = macroType ? `${macroType}-target` : '';

    const displayWidth = Math.max(0, Math.min(100, percentage));
    const roundedWidth = Math.round(displayWidth / 5) * 5;
    const widthClass = `progress-width-${roundedWidth}`;

    const _progressBar = progressContainer.createDiv({
      cls: `${CLASS_NAMES.PROGRESS.TARGET_BAR} ${statusClass} ${macroClass} ${widthClass}`,
    });

    if (
      percentage >
      PROGRESS_BAR_CONFIG.THRESHOLDS.OVER_TARGET + PROGRESS_BAR_CONFIG.THRESHOLDS.OVERFLOW_INDICATOR
    ) {
      let overflowIndicator = progressContainer.querySelector('.overflow-indicator');
      if (!overflowIndicator) {
        overflowIndicator = progressContainer.createDiv({
          cls: 'overflow-indicator',
          text: `+${Math.round(percentage - 100)}%`,
        });
      } else {
        (overflowIndicator as HTMLElement).textContent = `+${Math.round(percentage - 100)}%`;
      }
    }
  }
}

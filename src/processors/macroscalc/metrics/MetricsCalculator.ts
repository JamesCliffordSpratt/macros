import { t } from '../../../lang/I18nManager';

export class MetricsCalculator {
  static calculateDateRange(
    dateIds: string[]
  ): { start: Date; end: Date; dayCount: number } | null {
    const validDates = dateIds
      .map((id) => {
        const match = id.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        }
        return null;
      })
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (validDates.length === 0) return null;

    return {
      start: validDates[0],
      end: validDates[validDates.length - 1],
      dayCount: validDates.length,
    };
  }

  static calculateRollingAverage(
    data: { date: Date; value: number }[],
    windowSize: number
  ): { date: Date; value: number }[] {
    if (data.length < windowSize) return [];

    const result: { date: Date; value: number }[] = [];

    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      const average = window.reduce((sum, item) => sum + item.value, 0) / windowSize;
      result.push({
        date: data[i].date,
        value: average,
      });
    }

    return result;
  }

  static findExtreme(
    data: { id: string; value: number }[],
    type: 'min' | 'max'
  ): { id: string; value: number } | null {
    if (data.length === 0) return null;

    return data.reduce((extreme, current) => {
      if (type === 'max') {
        return current.value > extreme.value ? current : extreme;
      } else {
        return current.value < extreme.value ? current : extreme;
      }
    });
  }

  static calculateAdherencePercentage(
    data: { value: number }[],
    target: number,
    tolerancePercent: number
  ): number {
    if (data.length === 0) return 0;

    const tolerance = target * (tolerancePercent / 100);
    const withinTarget = data.filter((item) => Math.abs(item.value - target) <= tolerance).length;

    return (withinTarget / data.length) * 100;
  }

  static calculateStreak(data: { value: number }[], target: number, tolerancePercent = 0): number {
    if (data.length === 0) return 0;

    // Calculate the tolerance range based on the percentage
    const tolerance = target * (tolerancePercent / 100);
    const minAcceptable = target - tolerance;
    const maxAcceptable = target + tolerance;

    let streak = 0;

    // Count from the end (most recent) backwards
    for (let i = data.length - 1; i >= 0; i--) {
      // Check if the value is within the tolerance range
      if (data[i].value >= minAcceptable && data[i].value <= maxAcceptable) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Calculate the longest streak within the provided data
   * @param data Array of values with dates
   * @param target Target value to meet
   * @param tolerancePercent Tolerance percentage (default 0)
   * @returns Object with streak length, start date, and end date
   */
  static calculateLongestStreak(
    data: { date: Date; value: number }[],
    target: number,
    tolerancePercent = 0
  ): { length: number; startDate: Date | null; endDate: Date | null } {
    if (data.length === 0) {
      return { length: 0, startDate: null, endDate: null };
    }

    // Sort data by date to ensure chronological order
    const sortedData = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate the tolerance range
    const tolerance = target * (tolerancePercent / 100);
    const minAcceptable = target - tolerance;
    const maxAcceptable = target + tolerance;

    let longestStreak = 0;
    let longestStartDate: Date | null = null;
    let longestEndDate: Date | null = null;

    let currentStreak = 0;
    let currentStartDate: Date | null = null;

    for (let i = 0; i < sortedData.length; i++) {
      const item = sortedData[i];
      const isWithinTarget = item.value >= minAcceptable && item.value <= maxAcceptable;

      if (isWithinTarget) {
        if (currentStreak === 0) {
          // Start a new streak
          currentStartDate = item.date;
        }
        currentStreak++;

        // Update longest streak if current is longer
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
          longestStartDate = currentStartDate;
          longestEndDate = item.date;
        }
      } else {
        // Streak broken, reset current streak
        currentStreak = 0;
        currentStartDate = null;
      }
    }

    return {
      length: longestStreak,
      startDate: longestStartDate,
      endDate: longestEndDate,
    };
  }

  static formatValue(value: number, decimals = 1): string {
    return value.toFixed(decimals);
  }

  static formatDate(date: Date): string {
    const monthKey = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ][date.getMonth()];

    const monthShort = t(`dates.monthsShort.${monthKey}`);
    const day = date.getDate();

    return `${monthShort} ${day}`;
  }

  static formatDateRange(start: Date, end: Date): string {
    if (start.getTime() === end.getTime()) {
      return this.formatDate(start);
    }
    return `${this.formatDate(start)} - ${this.formatDate(end)}`;
  }
}

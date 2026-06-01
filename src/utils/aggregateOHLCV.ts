import type { OHLCVData } from '../api/borsaApi';
import type { Interval } from '../components/Chart/types';
import { isIntraday } from '../components/Chart/types';

/**
 * Aggregate daily OHLCV bars into weekly/monthly/quarterly bars.
 * Returns data unchanged for intraday intervals and '1d'.
 */
export function aggregateOHLCV(dailyData: OHLCVData[], interval: Interval): OHLCVData[] {
  if (isIntraday(interval) || interval === '1d' || dailyData.length === 0) return dailyData;

  const groups = new Map<string, OHLCVData[]>();

  for (const bar of dailyData) {
    const key = getGroupKey(bar.date, interval);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(bar);
  }

  const result: OHLCVData[] = [];
  for (const [, bars] of groups) {
    result.push({
      date: bars[0].date,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, b) => sum + b.volume, 0),
    });
  }

  return result;
}

function getGroupKey(dateStr: string, interval: Interval): string {
  const [year, month, day] = dateStr.split('-').map(Number);

  switch (interval) {
    case '1wk': {
      // ISO week: group by year + ISO week number
      const d = new Date(year, month - 1, day);
      const dayOfWeek = d.getDay() || 7; // Mon=1 .. Sun=7
      const thursday = new Date(d);
      thursday.setDate(d.getDate() + 4 - dayOfWeek);
      const yearStart = new Date(thursday.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${thursday.getFullYear()}-W${weekNum}`;
    }
    case '1mo':
      return `${year}-${String(month).padStart(2, '0')}`;
    case '3mo': {
      const quarter = Math.ceil(month / 3);
      return `${year}-Q${quarter}`;
    }
    default:
      return dateStr;
  }
}

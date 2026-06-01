/**
 * Data derivation functions for backtest charts.
 */

import type { BacktestStatRow } from '../../api/borsaApi';

// ── Win Rate Chart Data ──

export interface WinRateChartData {
  indicators: string[];
  periods: number[];
  bullish: Record<number, number[]>;
  bearish: Record<number, number[]>;
}

export function deriveWinRateData(stats: BacktestStatRow[]): WinRateChartData {
  const indicatorSet = new Set<string>();
  const periodSet = new Set<number>();
  for (const s of stats) {
    indicatorSet.add(s.label);
    periodSet.add(s.holding_period);
  }
  const indicators = [...indicatorSet];
  const periods = [...periodSet].sort((a, b) => a - b);

  const bullish: Record<number, number[]> = {};
  const bearish: Record<number, number[]> = {};

  for (const p of periods) {
    bullish[p] = indicators.map((label) => {
      const row = stats.find((s) => s.label === label && s.holding_period === p && s.signal_type === 'bullish');
      return row ? row.win_rate * 100 : 0;
    });
    bearish[p] = indicators.map((label) => {
      const row = stats.find((s) => s.label === label && s.holding_period === p && s.signal_type === 'bearish');
      return row ? row.win_rate * 100 : 0;
    });
  }

  return { indicators, periods, bullish, bearish };
}

// ── Avg Return Chart Data ──

export interface AvgReturnChartData {
  indicators: string[];
  periods: number[];
  bullish: Record<number, number[]>;
  bearish: Record<number, number[]>;
}

export function deriveAvgReturnData(stats: BacktestStatRow[]): AvgReturnChartData {
  const indicatorSet = new Set<string>();
  const periodSet = new Set<number>();
  for (const s of stats) {
    indicatorSet.add(s.label);
    periodSet.add(s.holding_period);
  }
  const indicators = [...indicatorSet];
  const periods = [...periodSet].sort((a, b) => a - b);

  const bullish: Record<number, number[]> = {};
  const bearish: Record<number, number[]> = {};

  for (const p of periods) {
    bullish[p] = indicators.map((label) => {
      const row = stats.find((s) => s.label === label && s.holding_period === p && s.signal_type === 'bullish');
      return row ? row.avg_return * 100 : 0;
    });
    bearish[p] = indicators.map((label) => {
      const row = stats.find((s) => s.label === label && s.holding_period === p && s.signal_type === 'bearish');
      return row ? row.avg_return * 100 : 0;
    });
  }

  return { indicators, periods, bullish, bearish };
}

// ── Signal Count Data ──

export interface SignalCountData {
  items: Array<{ label: string; bullish: number; bearish: number }>;
}

export function deriveSignalCountData(periodStats: BacktestStatRow[]): SignalCountData {
  const labelSet = new Set<string>();
  for (const s of periodStats) labelSet.add(s.label);

  const items = [...labelSet].map((label) => {
    const bull = periodStats.find((s) => s.label === label && s.signal_type === 'bullish');
    const bear = periodStats.find((s) => s.label === label && s.signal_type === 'bearish');
    return {
      label,
      bullish: bull?.total_signals ?? 0,
      bearish: bear?.total_signals ?? 0,
    };
  });

  return { items };
}

// ── Profit Factor Data ──

export interface ProfitFactorData {
  items: Array<{ label: string; signalType: string; profitFactor: number }>;
}

export function deriveProfitFactorData(periodStats: BacktestStatRow[]): ProfitFactorData {
  const items: ProfitFactorData['items'] = [];

  for (const s of periodStats) {
    if (s.total_signals > 0) {
      items.push({
        label: `${s.label} (${s.signal_type === 'bullish' ? 'Al' : 'Sat'})`,
        signalType: s.signal_type,
        profitFactor: Math.min(s.profit_factor, 10), // cap display
      });
    }
  }

  items.sort((a, b) => b.profitFactor - a.profitFactor);
  return { items };
}

/**
 * Data derivation functions for charts and tables.
 * These transform raw ScanRow[] into chart-specific datasets.
 */

import type { ScanRow } from '../../api/borsaApi';
import INDICATOR_META from './indicatorConfig';

// ── RSI Scatter (replaces Pearson Scatter) ──

export interface RSIScatterPoint {
  symbol: string;
  rsi: number;
  score: number;
  signal: string;
  indicator: string;
}

/**
 * Pick the indicator with the highest absolute score for each symbol.
 * Returns RSI value and best indicator score.
 */
export function deriveRSIScatterData(data: ScanRow[]): RSIScatterPoint[] {
  const points: RSIScatterPoint[] = [];

  for (const row of data) {
    const rsi = row['rsi_rsi'];
    if (typeof rsi !== 'number') continue;

    let bestScore = 0;
    let bestIndicator = '';

    for (const meta of INDICATOR_META) {
      const score = row[meta.scoreKey];
      if (typeof score !== 'number') continue;
      if (Math.abs(score) > Math.abs(bestScore)) {
        bestScore = score;
        bestIndicator = meta.label;
      }
    }

    const signal = row['rsi_signal'];
    points.push({
      symbol: row.symbol,
      rsi,
      score: bestScore,
      signal: String(signal ?? 'neutral'),
      indicator: bestIndicator,
    });
  }

  return points;
}

// ── Top Indicator Scores (replaces Top Pearson) ──

export interface TopIndicatorRow {
  symbol: string;
  close: number;
  totalScore: number;
  bullCount: number;
  bearCount: number;
}

export function deriveTopIndicators(data: ScanRow[], count = 10): TopIndicatorRow[] {
  const rows: TopIndicatorRow[] = [];

  for (const row of data) {
    let totalScore = 0;
    let bullCount = 0;
    let bearCount = 0;

    for (const meta of INDICATOR_META) {
      const score = row[meta.scoreKey];
      const signal = row[meta.signalKey];
      if (typeof score === 'number') totalScore += score;
      if (signal === 'bullish') bullCount++;
      if (signal === 'bearish') bearCount++;
    }

    rows.push({
      symbol: row.symbol,
      close: row.close,
      totalScore,
      bullCount,
      bearCount,
    });
  }

  rows.sort((a, b) => b.totalScore - a.totalScore);
  return rows.slice(0, count);
}

// ── Signal Distribution (replaces EMA Distribution) ──

export interface SignalDistribution {
  allBullish: number; // majority bullish (5+ of 9)
  bullish: number; // some bullish (3-4)
  neutral: number; // balanced (2 or fewer either way)
  bearish: number; // some bearish (3-4)
  allBearish: number; // majority bearish (5+ of 9)
}

export function deriveSignalDistribution(data: ScanRow[]): SignalDistribution {
  const dist: SignalDistribution = { allBullish: 0, bullish: 0, neutral: 0, bearish: 0, allBearish: 0 };

  for (const row of data) {
    let bull = 0;
    let bear = 0;

    for (const meta of INDICATOR_META) {
      const signal = row[meta.signalKey];
      if (signal === 'bullish') bull++;
      if (signal === 'bearish') bear++;
    }

    if (bull >= 5) dist.allBullish++;
    else if (bull >= 3 && bull > bear) dist.bullish++;
    else if (bear >= 5) dist.allBearish++;
    else if (bear >= 3 && bear > bull) dist.bearish++;
    else dist.neutral++;
  }

  return dist;
}

// ── Momentum Scatter ──

export interface MomentumPoint {
  symbol: string;
  score: number;
  signal: string;
}

/**
 * Derive momentum scatter data from SuperTrend direction + ADX strength.
 */
export function deriveMomentumScatterData(data: ScanRow[]): MomentumPoint[] {
  const points: MomentumPoint[] = [];

  for (const row of data) {
    const stScore = row['supertrend_score'];
    const adxScore = row['adx_score'];
    const signal = row['supertrend_signal'];
    if (typeof stScore !== 'number') continue;

    // Combine SuperTrend and ADX scores for momentum
    const adx = typeof adxScore === 'number' ? adxScore : 0;
    const score = (stScore + adx) / 2;

    points.push({
      symbol: row.symbol,
      score,
      signal: String(signal ?? 'neutral'),
    });
  }

  // Sort by score descending
  points.sort((a, b) => b.score - a.score);
  return points;
}

// ── Backward-compatible re-exports ──
// Old components still import these names; alias to new implementations.
export type PearsonPoint = RSIScatterPoint;
export type TopPearsonRow = TopIndicatorRow;
export type EMADistribution = SignalDistribution;

export const derivePearsonScatterData = deriveRSIScatterData;
export const deriveTopPearson = deriveTopIndicators;
export const deriveEMADistribution = deriveSignalDistribution;

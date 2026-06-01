/**
 * Advanced trade statistics computation.
 *
 * Computes enhanced metrics (drawdown, Sharpe, Sortino, equity curve, etc.)
 * from a raw PairedTrade[] array.  Pure functions, no side-effects.
 */

import type { PairedTrade, PairedTradeStats } from './signalDetection';
import type { EnhancedTradeStats } from './optimizerTypes';

// ── Helpers ───────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - avg;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

function downsideDev(arr: number[], target: number): number {
  if (arr.length < 2) return 0;
  let s = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < target) {
      const d = arr[i] - target;
      s += d * d;
      n++;
    }
  }
  return n > 0 ? Math.sqrt(s / arr.length) : 0;
}

// ── Core stats (mirrors existing PairedTradeStats computation) ──

function computeCoreStats(
  trades: PairedTrade[],
  costPct: number,
): {
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  profitFactor: number;
  maxWin: number;
  maxLoss: number;
  totalReturn: number;
  adjustedReturns: number[];
} {
  const n = trades.length;
  if (n === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      avgReturn: 0,
      profitFactor: 0,
      maxWin: 0,
      maxLoss: 0,
      totalReturn: 0,
      adjustedReturns: [],
    };
  }

  const roundTripCost = (costPct / 100) * 2; // buy + sell
  const adjusted: number[] = new Array(n);
  for (let i = 0; i < n; i++) adjusted[i] = trades[i].returnPct - roundTripCost;

  let wins = 0,
    totalWin = 0,
    totalLoss = 0;
  let maxW = -Infinity,
    maxL = Infinity;
  let cumReturn = 1;

  for (let i = 0; i < n; i++) {
    const r = adjusted[i];
    cumReturn *= 1 + r;
    if (r > 0) {
      wins++;
      totalWin += r;
    } else {
      totalLoss += Math.abs(r);
    }
    if (r > maxW) maxW = r;
    if (r < maxL) maxL = r;
  }

  return {
    totalTrades: n,
    winRate: wins / n,
    avgReturn: mean(adjusted),
    profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
    maxWin: maxW === -Infinity ? 0 : maxW,
    maxLoss: maxL === Infinity ? 0 : maxL,
    totalReturn: cumReturn - 1,
    adjustedReturns: adjusted,
  };
}

// ── Drawdown ──────────────────────────────────

function computeDrawdown(adjustedReturns: number[]): {
  maxDrawdown: number;
  maxDrawdownDuration: number;
  equityCurve: number[];
} {
  const n = adjustedReturns.length;
  const equityCurve: number[] = [1];
  let equity = 1,
    peak = 1;
  let maxDD = 0,
    maxDDDur = 0,
    curDDDur = 0;

  for (let i = 0; i < n; i++) {
    equity *= 1 + adjustedReturns[i];
    equityCurve.push(equity);
    if (equity > peak) {
      peak = equity;
      curDDDur = 0;
    } else {
      curDDDur++;
      if (curDDDur > maxDDDur) maxDDDur = curDDDur;
    }
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return { maxDrawdown: maxDD, maxDrawdownDuration: maxDDDur, equityCurve };
}

// ── Sharpe & Sortino ──────────────────────────

function computeSharpe(adjustedReturns: number[], avgBarsHeld: number): number {
  if (adjustedReturns.length < 2 || avgBarsHeld <= 0) return 0;
  const avg = mean(adjustedReturns);
  const sd = stdDev(adjustedReturns, avg);
  if (sd === 0) return avg > 0 ? 10 : 0; // cap at 10 if zero vol
  const tradesPerYear = 252 / avgBarsHeld;
  return (avg * tradesPerYear) / (sd * Math.sqrt(tradesPerYear));
}

function computeSortino(adjustedReturns: number[], avgBarsHeld: number): number {
  if (adjustedReturns.length < 2 || avgBarsHeld <= 0) return 0;
  const avg = mean(adjustedReturns);
  const dd = downsideDev(adjustedReturns, 0);
  if (dd === 0) return avg > 0 ? 10 : 0;
  const tradesPerYear = 252 / avgBarsHeld;
  return (avg * tradesPerYear) / (dd * Math.sqrt(tradesPerYear));
}

// ── Calmar ────────────────────────────────────

function computeCalmar(totalReturn: number, maxDrawdown: number, totalBars: number): number {
  if (maxDrawdown >= 0 || totalBars <= 0) return totalReturn > 0 ? 10 : 0;
  const years = totalBars / 252;
  const annReturn = Math.pow(1 + totalReturn, 1 / Math.max(years, 0.1)) - 1;
  return annReturn / Math.abs(maxDrawdown);
}

// ── Consecutive wins/losses ───────────────────

function computeStreaks(adjustedReturns: number[]): {
  consecutiveWins: number;
  consecutiveLosses: number;
} {
  let maxW = 0,
    maxL = 0,
    curW = 0,
    curL = 0;
  for (let i = 0; i < adjustedReturns.length; i++) {
    if (adjustedReturns[i] > 0) {
      curW++;
      curL = 0;
      if (curW > maxW) maxW = curW;
    } else {
      curL++;
      curW = 0;
      if (curL > maxL) maxL = curL;
    }
  }
  return { consecutiveWins: maxW, consecutiveLosses: maxL };
}

// ── Kelly Criterion ──────────────────────────

function computeKelly(winRate: number, avgWin: number, avgLoss: number): number {
  // Kelly fraction = W - (1-W)/R  where R = avgWin/avgLoss
  if (avgLoss <= 0 || avgWin <= 0) return 0;
  const r = avgWin / avgLoss;
  const kelly = winRate - (1 - winRate) / r;
  return Math.max(0, Math.min(kelly, 1)); // clamp 0-1
}

// ── Recovery Factor ─────────────────────────

function computeRecoveryFactor(totalReturn: number, maxDrawdown: number): number {
  if (maxDrawdown >= 0) return totalReturn > 0 ? 10 : 0;
  return Math.min(totalReturn / Math.abs(maxDrawdown), 20); // cap at 20
}

// ── Ulcer Index ─────────────────────────────

function computeUlcerIndex(equityCurve: number[]): number {
  // RMS of percentage drawdowns from peak
  const n = equityCurve.length;
  if (n < 2) return 0;
  let peak = equityCurve[0];
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    if (equityCurve[i] > peak) peak = equityCurve[i];
    const ddPct = peak > 0 ? ((equityCurve[i] - peak) / peak) * 100 : 0;
    sumSq += ddPct * ddPct;
  }
  return Math.sqrt(sumSq / n);
}

// ── Equity curve smoothness (R²) ──────────────

export function equityCurveSmoothness(curve: number[]): number {
  const n = curve.length;
  if (n < 3) return 0;

  // Linear regression: y = a + b*x
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += curve[i];
    sumXY += i * curve[i];
    sumX2 += i * i;
  }
  const xMean = sumX / n;
  const yMean = sumY / n;
  const b = (sumXY - n * xMean * yMean) / (sumX2 - n * xMean * xMean || 1);

  let ssTot = 0,
    ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = yMean + b * (i - xMean);
    ssTot += (curve[i] - yMean) ** 2;
    ssRes += (curve[i] - predicted) ** 2;
  }

  if (ssTot === 0) return 0;
  const r2 = 1 - ssRes / ssTot;
  // Only reward upward slopes
  return b > 0 ? Math.max(0, r2) : 0;
}

// ── Main export ───────────────────────────────

export function computeEnhancedStats(trades: PairedTrade[], transactionCostPct: number): EnhancedTradeStats {
  const core = computeCoreStats(trades, transactionCostPct);
  const { adjustedReturns, ...coreFields } = core;

  if (core.totalTrades === 0) {
    return {
      trades,
      ...coreFields,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      avgBarsHeld: 0,
      expectancy: 0,
      kellyFraction: 0,
      recoveryFactor: 0,
      ulcerIndex: 0,
      equityCurve: [1],
    };
  }

  const avgBarsHeld = mean(trades.map((t) => t.barsHeld));
  const totalBars = trades.length > 0 ? trades[trades.length - 1].sellBarIndex - trades[0].buyBarIndex : 0;

  const dd = computeDrawdown(adjustedReturns);
  const streaks = computeStreaks(adjustedReturns);

  const avgWin =
    core.winRate > 0
      ? adjustedReturns.filter((r) => r > 0).reduce((s, r) => s + r, 0) / adjustedReturns.filter((r) => r > 0).length
      : 0;
  const avgLoss =
    core.winRate < 1
      ? Math.abs(
          adjustedReturns.filter((r) => r <= 0).reduce((s, r) => s + r, 0) /
            Math.max(adjustedReturns.filter((r) => r <= 0).length, 1),
        )
      : 0;

  return {
    trades,
    ...coreFields,
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownDuration: dd.maxDrawdownDuration,
    sharpeRatio: computeSharpe(adjustedReturns, avgBarsHeld),
    sortinoRatio: computeSortino(adjustedReturns, avgBarsHeld),
    calmarRatio: computeCalmar(core.totalReturn, dd.maxDrawdown, totalBars),
    consecutiveWins: streaks.consecutiveWins,
    consecutiveLosses: streaks.consecutiveLosses,
    avgBarsHeld,
    expectancy: avgWin * core.winRate - avgLoss * (1 - core.winRate),
    kellyFraction: computeKelly(core.winRate, avgWin, avgLoss),
    recoveryFactor: computeRecoveryFactor(core.totalReturn, dd.maxDrawdown),
    ulcerIndex: computeUlcerIndex(dd.equityCurve),
    equityCurve: dd.equityCurve,
  };
}

/**
 * Lightweight version – computes only the basic PairedTradeStats fields
 * with transaction costs applied.  Used for fast Phase 1 screening
 * where full enhanced stats are not yet needed.
 */
export function computeBasicStatsWithCost(trades: PairedTrade[], transactionCostPct: number): PairedTradeStats {
  const core = computeCoreStats(trades, transactionCostPct);
  const { adjustedReturns: _, ...fields } = core;
  return { ...fields, trades };
}

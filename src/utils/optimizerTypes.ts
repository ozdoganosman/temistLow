/**
 * Advanced Signal Optimizer — Type definitions.
 *
 * Centralises all interfaces for the upgraded optimizer engine:
 * enhanced trade statistics, optimizer settings, results, and progress.
 */

import type { SignalConfig, PairedTrade } from './signalDetection';

// ── Enhanced trade statistics ──────────────────

export interface EnhancedTradeStats {
  // Core (same as PairedTradeStats)
  trades: PairedTrade[];
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  profitFactor: number;
  maxWin: number;
  maxLoss: number;
  totalReturn: number;

  // Drawdown
  maxDrawdown: number; // Peak-to-trough decline (0 to -1 range)
  maxDrawdownDuration: number; // Bars from peak to recovery

  // Risk-adjusted
  sharpeRatio: number; // Annualised (252 trading days)
  sortinoRatio: number; // Downside-only deviation
  calmarRatio: number; // Annualised return / |maxDrawdown|

  // Consistency
  consecutiveWins: number;
  consecutiveLosses: number;
  avgBarsHeld: number;
  expectancy: number; // avgWin*winRate - avgLoss*lossRate

  // Advanced metrics
  kellyFraction: number; // Kelly criterion optimal bet size (0-1)
  recoveryFactor: number; // totalReturn / |maxDrawdown|
  ulcerIndex: number; // RMS of drawdown — average stress level

  // Equity curve (cumulative equity at each trade close)
  equityCurve: number[];
}

// ── Optimizer configuration ───────────────────

export interface OptimizerSettings {
  walkForward: boolean; // Enable train/test split
  trainRatio: number; // 0.7 = 70% training
  populationSize: number; // GA population
  generations: number; // GA iterations
  eliteCount: number; // Top survivors per generation
  mutationRate: number; // Parameter mutation chance (0-1)
  minTrades: number; // Minimum trade count for fitness > 0
  transactionCostPct: number; // Per-trade cost in % (one side)
}

export const DEFAULT_OPTIMIZER_SETTINGS: OptimizerSettings = {
  walkForward: true,
  trainRatio: 0.7,
  populationSize: 40,
  generations: 20,
  eliteCount: 8,
  mutationRate: 0.15,
  minTrades: 5,
  transactionCostPct: 0.15,
};

// ── Enhanced optimizer result ─────────────────

export type RobustnessGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface EnhancedOptimizerResult {
  config: SignalConfig;
  label: string;
  fitness: number;

  inSample: EnhancedTradeStats;
  outOfSample: EnhancedTradeStats | null;

  robustnessScore: number; // 0-1
  robustnessGrade: RobustnessGrade;

  monteCarloScore: number | null; // 0-1, null if not computed

  source: 'grid' | 'genetic' | 'combination' | 'ml-guided';
}

// ── Multi-phase progress ──────────────────────

export interface EnhancedOptimizerProgress {
  phase: 1 | 2 | 3 | 4 | 5;
  phaseName: string;
  current: number;
  total: number;
  bestSoFar: EnhancedOptimizerResult | null;
  estimatedSecondsLeft: number;
  startTime: number;
}

/**
 * Advanced fitness scoring, robustness evaluation, and Monte Carlo validation.
 *
 * Weighted composite fitness (8 components):
 *   Sharpe 25%, Drawdown 15%, PF 15%, WinRate 15%,
 *   Trade frequency 10%, Recovery 10%, Ulcer penalty 5%, Smoothness 5%.
 *
 * Monte Carlo: shuffles trade returns N times to estimate confidence.
 */

import type { EnhancedTradeStats, OptimizerSettings, RobustnessGrade } from './optimizerTypes';
import { equityCurveSmoothness } from './optimizerMetrics';

// ── Main fitness function ─────────────────────

export function advancedFitness(stats: EnhancedTradeStats, settings: OptimizerSettings): number {
  if (stats.totalTrades < settings.minTrades) return 0;

  // Component 1: Sharpe ratio — weight 25%
  const sharpeScore = Math.max(0, Math.min(stats.sharpeRatio / 3, 1));

  // Component 2: Drawdown penalty — weight 15%
  const ddScore = Math.max(0, 1 + stats.maxDrawdown * 2);

  // Component 3: Profit factor — weight 15%
  const pfCapped = Math.min(isFinite(stats.profitFactor) ? stats.profitFactor : 10, 10);
  const pfScore = Math.max(0, Math.min(1, (pfCapped - 1) / 4));

  // Component 4: Win rate — weight 15%
  const wrScore = Math.max(0, Math.min(1, (stats.winRate - 0.3) / 0.4));

  // Component 5: Trade frequency — weight 10%
  const tradePenalty = Math.min(1, stats.totalTrades / (settings.minTrades * 2));

  // Component 6: Recovery Factor — weight 10%
  // RF 5+ = full marks, RF 0 = 0
  const rfScore = Math.max(0, Math.min(1, stats.recoveryFactor / 5));

  // Component 7: Ulcer Index penalty — weight 5%
  // UI 0 = full marks, UI 20+ = 0
  const ulcerScore = Math.max(0, 1 - stats.ulcerIndex / 20);

  // Component 8: Equity curve smoothness — weight 5%
  const smoothness = equityCurveSmoothness(stats.equityCurve);

  const raw =
    sharpeScore * 0.25 +
    ddScore * 0.15 +
    pfScore * 0.15 +
    wrScore * 0.15 +
    tradePenalty * 0.1 +
    rfScore * 0.1 +
    ulcerScore * 0.05 +
    smoothness * 0.05;

  return raw * 100;
}

// ── Robustness scoring ────────────────────────

export function computeRobustnessScore(
  inSampleFitness: number,
  outOfSampleFitness: number,
): { score: number; grade: RobustnessGrade } {
  if (inSampleFitness <= 0) return { score: 0, grade: 'F' };

  const ratio = outOfSampleFitness / inSampleFitness;
  const score = Math.max(0, Math.min(1, ratio));

  const grade: RobustnessGrade =
    ratio >= 0.8 ? 'A' : ratio >= 0.6 ? 'B' : ratio >= 0.4 ? 'C' : ratio >= 0.2 ? 'D' : 'F';

  return { score, grade };
}

// ── Monte Carlo shuffle validation ────────────

/**
 * Shuffles trade returns N times and computes the fraction of shuffled
 * total returns that are worse than the original.
 * Returns a score between 0-1 (1 = strategy is clearly non-random).
 */
export function monteCarloValidation(adjustedReturns: number[], originalTotalReturn: number, iterations = 500): number {
  if (adjustedReturns.length < 5) return 0;

  let worseThanOriginal = 0;
  const arr = [...adjustedReturns];

  for (let iter = 0; iter < iterations; iter++) {
    // Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }

    // Compute cumulative return of shuffled sequence
    let cum = 1;
    for (let i = 0; i < arr.length; i++) cum *= 1 + arr[i];
    const shuffledReturn = cum - 1;

    if (shuffledReturn <= originalTotalReturn) worseThanOriginal++;
  }

  return worseThanOriginal / iterations;
}

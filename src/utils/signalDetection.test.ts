import { describe, it, expect } from 'vitest';
import {
  rsiSignals,
  macdSignals,
  bollingerSignals,
  computeCombinedSignals,
  pairTrades,
  DEFAULT_SIGNAL_CONFIG,
} from './signalDetection';
import type { OHLCVData } from '../api/borsaApi';

function generateOHLCV(n: number, trend: 'up' | 'down' | 'flat' = 'flat'): OHLCVData[] {
  return Array.from({ length: n }, (_, i) => {
    const base = trend === 'up' ? 100 + i * 0.5 : trend === 'down' ? 200 - i * 0.5 : 150;
    const noise = Math.sin(i * 0.3) * 5;
    const close = base + noise;
    return {
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000000,
    };
  });
}

describe('rsiSignals', () => {
  it('returns array of same length as input', () => {
    const data = generateOHLCV(100);
    const signals = rsiSignals(data.map((d) => d.close));
    expect(signals).toHaveLength(100);
  });

  it('returns only -1, 0, or 1 values', () => {
    const data = generateOHLCV(100);
    const signals = rsiSignals(data.map((d) => d.close));
    for (const s of signals) {
      expect([-1, 0, 1]).toContain(s);
    }
  });

  it('returns all zeros when no conditions enabled', () => {
    const data = generateOHLCV(100);
    const signals = rsiSignals(
      data.map((d) => d.close),
      { conditions: { threshold: false, midLine: false } },
    );
    expect(signals.every((s) => s === 0)).toBe(true);
  });
});

describe('macdSignals', () => {
  it('returns array of same length as input', () => {
    const data = generateOHLCV(100);
    const signals = macdSignals(data.map((d) => d.close));
    expect(signals).toHaveLength(100);
  });
});

describe('bollingerSignals', () => {
  it('returns array of same length as input', () => {
    const data = generateOHLCV(100);
    const signals = bollingerSignals(data.map((d) => d.close));
    expect(signals).toHaveLength(100);
  });
});

describe('computeCombinedSignals', () => {
  it('returns array of same length as data', () => {
    const data = generateOHLCV(100);
    const signals = computeCombinedSignals(data, DEFAULT_SIGNAL_CONFIG);
    expect(signals).toHaveLength(100);
  });

  it('AND mode requires all indicators to agree', () => {
    const data = generateOHLCV(100);
    const config = { ...DEFAULT_SIGNAL_CONFIG, mode: 'AND' as const };
    const signals = computeCombinedSignals(data, config);
    const orSignals = computeCombinedSignals(data, { ...config, mode: 'OR' });
    const andNonZero = signals.filter((s) => s !== 0).length;
    const orNonZero = orSignals.filter((s) => s !== 0).length;
    expect(andNonZero).toBeLessThanOrEqual(orNonZero);
  });
});

describe('pairTrades', () => {
  it('pairs buy/sell correctly', () => {
    const data = generateOHLCV(100);
    const signals = computeCombinedSignals(data, DEFAULT_SIGNAL_CONFIG);
    const stats = pairTrades(signals, data);
    for (const t of stats.trades) {
      expect(t.buyBarIndex).toBeLessThan(t.sellBarIndex);
      expect(t.barsHeld).toBeGreaterThan(0);
    }
  });

  it('winRate is between 0 and 1', () => {
    const data = generateOHLCV(100);
    const signals = computeCombinedSignals(data, DEFAULT_SIGNAL_CONFIG);
    const stats = pairTrades(signals, data);
    if (stats.totalTrades > 0) {
      expect(stats.winRate).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeLessThanOrEqual(1);
    }
  });
});

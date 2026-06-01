/**
 * Multi-symbol scanner — evaluates a saved SignalConfig across many symbols.
 */

import type { OHLCVData } from '../api/borsaApi';
import { fetchHistoryLive, fetchSymbols } from '../api/borsaApi';
import { fetchCryptoKlines, fetchCrypto24hrTickers } from '../api/cryptoApi';
import type { SignalConfig } from './signalDetection';
import { DEFAULT_OPTIMIZER_SETTINGS } from './optimizerTypes';
import { evaluate } from './signalOptimizer';
import { getFromMemory, saveToMemory } from './historyCache';

// ── Types ─────────────────────────────────────

export interface ScanProgress {
  phase: 'fetching' | 'evaluating';
  current: number;
  total: number;
  currentSymbol: string;
}

export interface ScanResult {
  symbol: string;
  fitness: number;
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  error?: string;
}

// ── Helpers ───────────────────────────────────

export function isCryptoSymbol(symbol: string): boolean {
  return symbol.endsWith('USDT') || symbol.endsWith('BUSD') || symbol.endsWith('BTC');
}

/** Min 100K USDT daily volume to filter out dead pairs */
const MIN_QUOTE_VOLUME = 100_000;

export async function getScanSymbols(isCrypto: boolean): Promise<string[]> {
  if (isCrypto) {
    try {
      const tickers = await fetchCrypto24hrTickers();
      return tickers
        .filter((t) => t.symbol.endsWith('USDT') && t.quoteVolume >= MIN_QUOTE_VOLUME)
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .map((t) => t.symbol);
    } catch {
      return [];
    }
  }
  try {
    const { stocks, indices } = await fetchSymbols();
    return [...stocks.map((s) => s.name), ...indices.map((s) => s.name)];
  } catch {
    return [];
  }
}

async function fetchWithCache(symbol: string, isCrypto: boolean): Promise<OHLCVData[]> {
  const interval = '1d';
  const cached = getFromMemory(symbol, interval);
  if (cached && cached.data.length > 0) return cached.data;

  let data: OHLCVData[];
  if (isCrypto) {
    data = await fetchCryptoKlines(symbol, '1d', 500);
  } else {
    data = await fetchHistoryLive(symbol, '1y', '1d');
  }

  if (data.length > 0) {
    saveToMemory(symbol, interval, data);
  }
  return data;
}

// ── Scanner ───────────────────────────────────

export async function scanMultiSymbol(
  config: SignalConfig,
  symbols: string[],
  isCrypto: boolean,
  onProgress: (p: ScanProgress) => void,
  signal: AbortSignal,
): Promise<ScanResult[]> {
  const settings = { ...DEFAULT_OPTIMIZER_SETTINGS };
  const dateRange = {};
  const dataMap = new Map<string, OHLCVData[]>();

  // Phase 1: Fetch data in batches of 6
  const BATCH = 6;
  for (let i = 0; i < symbols.length; i += BATCH) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = symbols.slice(i, i + BATCH);
    const fetched = await Promise.allSettled(batch.map((sym) => fetchWithCache(sym, isCrypto)));
    batch.forEach((sym, j) => {
      if (fetched[j].status === 'fulfilled') {
        dataMap.set(sym, (fetched[j] as PromiseFulfilledResult<OHLCVData[]>).value);
      }
    });
    onProgress({
      phase: 'fetching',
      current: Math.min(i + BATCH, symbols.length),
      total: symbols.length,
      currentSymbol: batch[batch.length - 1],
    });
  }

  // Phase 2: Evaluate each symbol
  const results: ScanResult[] = [];
  for (let i = 0; i < symbols.length; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const sym = symbols[i];
    const data = dataMap.get(sym);

    if (!data || data.length < 30) {
      results.push({
        symbol: sym,
        fitness: 0,
        totalTrades: 0,
        winRate: 0,
        totalReturn: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        error: 'Yetersiz veri',
      });
    } else {
      const ev = evaluate(data, config, dateRange, settings);
      if (ev) {
        results.push({
          symbol: sym,
          fitness: ev.fitness,
          totalTrades: ev.enhanced.totalTrades,
          winRate: ev.enhanced.winRate,
          totalReturn: ev.enhanced.totalReturn,
          profitFactor: ev.enhanced.profitFactor,
          sharpeRatio: ev.enhanced.sharpeRatio,
          maxDrawdown: ev.enhanced.maxDrawdown,
        });
      } else {
        results.push({
          symbol: sym,
          fitness: 0,
          totalTrades: 0,
          winRate: 0,
          totalReturn: 0,
          profitFactor: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          error: 'Sinyal yok',
        });
      }
    }
    onProgress({
      phase: 'evaluating',
      current: i + 1,
      total: symbols.length,
      currentSymbol: sym,
    });
  }

  return results.sort((a, b) => b.fitness - a.fitness);
}

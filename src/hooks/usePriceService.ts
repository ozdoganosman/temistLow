import { useEffect, useState } from 'react';
import type { QuoteData } from '../api/borsaApi';
import { fetchScanResults, fetchHistory } from '../api/borsaApi';

/**
 * Price service that returns last known prices from pre-built scan data.
 * Computes daily change from the last two history data points.
 */
export function usePriceService(symbols: string[]): Map<string, QuoteData> {
  const [prices, setPrices] = useState<Map<string, QuoteData>>(new Map());
  const symbolsKey = symbols.slice().sort().join(',');

  useEffect(() => {
    if (symbols.length === 0) return;

    let cancelled = false;

    (async () => {
      // 1. Get current prices from scan.json
      const scan = await fetchScanResults();
      if (cancelled || !scan?.results) return;

      const wanted = new Set(symbols);
      const map = new Map<string, QuoteData>();

      for (const row of scan.results) {
        if (!wanted.has(row.symbol)) continue;
        map.set(row.symbol, {
          price: row.close,
          open: 0,
          high: 0,
          low: 0,
          change: 0,
          changePercent: 0,
          volume: row.volume,
          time: '',
        });
      }

      // 2. Fetch history for each symbol to compute daily change
      const historyPromises = symbols.map(async (sym) => {
        try {
          const history = await fetchHistory(sym);
          if (cancelled || history.length < 2) return;

          const last = history[history.length - 1];
          const prev = history[history.length - 2];
          const change = last.close - prev.close;
          const changePercent = prev.close !== 0 ? (change / prev.close) * 100 : 0;

          const existing = map.get(sym);
          if (existing) {
            existing.change = change;
            existing.changePercent = changePercent;
            existing.open = last.open;
            existing.high = last.high;
            existing.low = last.low;
          }
        } catch {
          // ignore individual fetch failures
        }
      });

      await Promise.all(historyPromises);
      if (!cancelled) setPrices(new Map(map));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return prices;
}

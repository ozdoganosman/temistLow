import { useState, useEffect, useRef, useCallback } from 'react';
import type { CryptoTicker } from '../api/cryptoApi';
import { fetchCrypto24hrTickers, subscribeMiniTickers } from '../api/cryptoApi';

/**
 * Real-time crypto tickers via Binance WebSocket.
 * 1. Initial fetch via REST for accurate 24hr stats
 * 2. WebSocket miniTicker stream for ~1s price updates
 * 3. REST poll every 60s to keep 24hr change % accurate
 */
export function useCryptoTickers(symbols: string[]) {
  const [tickers, setTickers] = useState<CryptoTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const tickersRef = useRef<Map<string, CryptoTicker>>(new Map());
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const symbolSet = useRef(new Set(symbols));
  symbolSet.current = new Set(symbols);

  const pushState = useCallback(() => {
    const syms = symbolsRef.current;
    const arr: CryptoTicker[] = [];
    for (const s of syms) {
      const t = tickersRef.current.get(s);
      if (t) arr.push(t);
    }
    setTickers(arr);
  }, []);

  // Stable key that changes when the symbol list changes
  const symbolsKey = symbols.join(',');

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setTimeout>;

    // 1. Initial REST fetch
    async function init() {
      try {
        const data = await fetchCrypto24hrTickers(symbolsRef.current);
        if (cancelled) return;
        for (const t of data) tickersRef.current.set(t.symbol, t);
        pushState();
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    // 2. WebSocket for real-time price
    function startWs() {
      unsubscribe = subscribeMiniTickers((map) => {
        if (cancelled) return;
        let changed = false;
        for (const [sym, t] of map) {
          if (symbolSet.current.has(sym)) {
            const existing = tickersRef.current.get(sym);
            // Merge: keep quoteVolume from WS, rest from WS
            tickersRef.current.set(sym, {
              ...t,
              // Preserve more accurate 24hr change from REST if we have it
              priceChangePercent: existing
                ? // Recalculate from WS open price for real-time accuracy
                  t.priceChangePercent
                : t.priceChangePercent,
            });
            changed = true;
          }
        }
        if (changed) pushState();
      });
    }

    // 3. Periodic REST refresh for accurate 24hr stats
    function startPoll() {
      pollTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const data = await fetchCrypto24hrTickers(symbolsRef.current);
          if (cancelled) return;
          for (const t of data) tickersRef.current.set(t.symbol, t);
          pushState();
        } catch {
          /* ignore */
        }
        if (!cancelled) startPoll();
      }, 60_000);
    }

    init().then(() => {
      if (!cancelled) {
        startWs();
        startPoll();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushState, symbolsKey]);

  return { tickers, loading };
}

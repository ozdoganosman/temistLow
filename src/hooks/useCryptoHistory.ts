import { useState, useEffect, useRef, useCallback } from 'react';
import type { OHLCVData } from '../api/borsaApi';
import type { CryptoInterval } from '../api/cryptoApi';
import { fetchCryptoKlines, subscribeKline } from '../api/cryptoApi';

/**
 * Fetches crypto OHLCV data from Binance, then subscribes to
 * the kline WebSocket stream for real-time candle updates.
 */
export function useCryptoHistory(symbol: string, interval: CryptoInterval) {
  const [data, setData] = useState<OHLCVData[]>([]);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<OHLCVData[]>([]);

  // Stable setter that updates both state and ref
  const updateData = useCallback((records: OHLCVData[]) => {
    dataRef.current = records;
    setData(records);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function load() {
      setLoading(true);
      try {
        const records = await fetchCryptoKlines(symbol, interval);
        if (cancelled) return;
        updateData(records);
        setLoading(false);

        // Subscribe to live kline updates
        unsubscribe = subscribeKline(symbol, interval, (bar, closed) => {
          if (cancelled) return;
          const current = dataRef.current;
          if (current.length === 0) return;

          const lastBar = current[current.length - 1];

          if (bar.date === lastBar.date) {
            // Same candle — update in place
            const updated = [...current];
            updated[updated.length - 1] = bar;
            updateData(updated);
          } else if (closed || bar.date > lastBar.date) {
            // New candle — append
            updateData([...current, bar]);
          }
        });
      } catch {
        if (!cancelled) {
          updateData([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [symbol, interval, updateData]);

  return { data, loading };
}

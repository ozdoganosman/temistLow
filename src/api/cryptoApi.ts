/**
 * Binance public API layer for crypto data.
 * No authentication required.
 */

import type { OHLCVData } from './borsaApi';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

// ── Types ─────────────────────────────────────

export type CryptoInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export interface CryptoSymbol {
  symbol: string; // e.g. "BTCUSDT"
  baseAsset: string; // e.g. "BTC"
  quoteAsset: string; // e.g. "USDT"
}

export interface CryptoTicker {
  symbol: string;
  price: number;
  priceChangePercent: number;
  volume: number;
  high: number;
  low: number;
  quoteVolume: number;
}

// ── Popular pairs ─────────────────────────────

export const POPULAR_PAIRS: CryptoSymbol[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT' },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT' },
  { symbol: 'LTCUSDT', baseAsset: 'LTC', quoteAsset: 'USDT' },
  { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT' },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', quoteAsset: 'USDT' },
  { symbol: 'ATOMUSDT', baseAsset: 'ATOM', quoteAsset: 'USDT' },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', quoteAsset: 'USDT' },
  { symbol: 'APTUSDT', baseAsset: 'APT', quoteAsset: 'USDT' },
  { symbol: 'ARBUSDT', baseAsset: 'ARB', quoteAsset: 'USDT' },
  { symbol: 'OPUSDT', baseAsset: 'OP', quoteAsset: 'USDT' },
  { symbol: 'PEPEUSDT', baseAsset: 'PEPE', quoteAsset: 'USDT' },
  { symbol: 'SHIBUSDT', baseAsset: 'SHIB', quoteAsset: 'USDT' },
];

// ── Helpers ───────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const INTRADAY_CRYPTO: ReadonlySet<string> = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);

export function isCryptoIntraday(interval: CryptoInterval): boolean {
  return INTRADAY_CRYPTO.has(interval);
}

function klineToOHLCV(kline: unknown[], interval: CryptoInterval): OHLCVData {
  const ts = new Date(kline[0] as number);
  const intra = isCryptoIntraday(interval);
  const y = ts.getFullYear();
  const m = pad2(ts.getMonth() + 1);
  const d = pad2(ts.getDate());
  const date = intra ? `${y}-${m}-${d} ${pad2(ts.getHours())}:${pad2(ts.getMinutes())}` : `${y}-${m}-${d}`;
  return {
    date,
    open: parseFloat(kline[1] as string),
    high: parseFloat(kline[2] as string),
    low: parseFloat(kline[3] as string),
    close: parseFloat(kline[4] as string),
    volume: parseFloat(kline[5] as string),
  };
}

// ── Klines (OHLCV) ───────────────────────────

/** Target bar counts per interval for deep history */
const TARGET_BARS: Record<CryptoInterval, number> = {
  '1m': 10000, // ~7 gun
  '5m': 5000, // ~17 gun
  '15m': 4000, // ~42 gun
  '30m': 4000, // ~83 gun
  '1h': 4000, // ~167 gun
  '4h': 4000, // ~667 gun (~1.8 yil)
  '1d': 2000, // ~5.5 yil
  '1w': 1000, // ~19 yil
  '1M': 500, // ~41 yil
};

const BINANCE_MAX_LIMIT = 1000;

/**
 * Fetch klines with automatic pagination for deep history.
 * Binance returns max 1000 per request, so we paginate backwards.
 */
export async function fetchCryptoKlines(
  symbol: string,
  interval: CryptoInterval,
  totalBars?: number,
): Promise<OHLCVData[]> {
  const target = totalBars ?? TARGET_BARS[interval] ?? 1000;
  const allKlines: unknown[][] = [];
  let endTime: number | undefined = undefined;
  let remaining = target;

  while (remaining > 0) {
    const batchLimit = Math.min(remaining, BINANCE_MAX_LIMIT);
    let url = `${BINANCE_BASE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${batchLimit}`;
    if (endTime !== undefined) {
      url += `&endTime=${endTime}`;
    }

    const res = await fetch(url);
    if (!res.ok) break;
    const batch: unknown[][] = await res.json();
    if (batch.length === 0) break;

    allKlines.unshift(...batch);
    remaining -= batch.length;

    // Next batch ends just before the earliest bar in this batch
    endTime = (batch[0][0] as number) - 1;

    // If we got fewer than requested, there's no more data
    if (batch.length < batchLimit) break;
  }

  // Deduplicate by openTime (in case of overlap)
  const seen = new Set<number>();
  const unique: unknown[][] = [];
  for (const k of allKlines) {
    const openTime = k[0] as number;
    if (!seen.has(openTime)) {
      seen.add(openTime);
      unique.push(k);
    }
  }

  // Sort by openTime ascending
  unique.sort((a, b) => (a[0] as number) - (b[0] as number));

  return unique.map((k) => klineToOHLCV(k, interval));
}

// ── 24hr Tickers ──────────────────────────────

export async function fetchCrypto24hrTickers(symbols?: string[]): Promise<CryptoTicker[]> {
  let url: string;
  if (symbols && symbols.length > 0) {
    const encoded = encodeURIComponent(JSON.stringify(symbols));
    url = `${BINANCE_BASE}/ticker/24hr?symbols=${encoded}`;
  } else {
    url = `${BINANCE_BASE}/ticker/24hr`;
  }
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: any[] = await res.json();
  return data.map((t) => ({
    symbol: t.symbol,
    price: parseFloat(t.lastPrice),
    priceChangePercent: parseFloat(t.priceChangePercent),
    volume: parseFloat(t.volume),
    high: parseFloat(t.highPrice),
    low: parseFloat(t.lowPrice),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

// ── WebSocket Streams ─────────────────────────

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

/**
 * Binance kline WS event payload.
 * Stream: <symbol>@kline_<interval>
 */
export interface BinanceKlineEvent {
  e: string; // "kline"
  s: string; // symbol
  k: {
    t: number; // kline start time (openTime)
    o: string; // open
    h: string; // high
    l: string; // low
    c: string; // close
    v: string; // volume
    x: boolean; // is this kline closed?
    i: string; // interval
  };
}

/**
 * Connect to Binance kline WebSocket stream with auto-reconnect.
 * Calls `onUpdate` with the latest bar data on each tick.
 * Returns a cleanup function.
 */
export function subscribeKline(
  symbol: string,
  interval: CryptoInterval,
  onUpdate: (bar: OHLCVData, closed: boolean) => void,
): () => void {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  let disposed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  function connect() {
    if (disposed) return;
    try {
      ws = new WebSocket(`${BINANCE_WS}/${stream}`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = 1000; // reset on successful connection
    };

    ws.onmessage = (event) => {
      if (disposed) return;
      try {
        const msg: BinanceKlineEvent = JSON.parse(event.data);
        if (msg.e !== 'kline') return;
        const k = msg.k;
        const ts = new Date(k.t);
        const intra = isCryptoIntraday(interval);
        const y = ts.getFullYear();
        const m = pad2(ts.getMonth() + 1);
        const d = pad2(ts.getDate());
        const date = intra ? `${y}-${m}-${d} ${pad2(ts.getHours())}:${pad2(ts.getMinutes())}` : `${y}-${m}-${d}`;

        const bar: OHLCVData = {
          date,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };
        onUpdate(bar, k.x);
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onerror = () => {
      /* handled by onclose */
    };

    ws.onclose = () => {
      if (!disposed) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (disposed) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  }

  connect();

  return () => {
    disposed = true;
    clearTimeout(reconnectTimer);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}

/**
 * Binance miniTicker WS event payload.
 * Stream: !miniTicker@arr (all symbols)
 */
export interface BinanceMiniTickerEvent {
  e: string; // "24hrMiniTicker"
  s: string; // symbol
  c: string; // close price
  o: string; // open price
  h: string; // high
  l: string; // low
  v: string; // total traded base asset volume
  q: string; // total traded quote asset volume
}

/**
 * Connect to Binance all-market miniTicker stream with auto-reconnect.
 * Calls `onUpdate` with a map of symbol → ticker on each batch (~1s).
 * Returns a cleanup function.
 */
export function subscribeMiniTickers(onUpdate: (tickers: Map<string, CryptoTicker>) => void): () => void {
  let disposed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  function connect() {
    if (disposed) return;
    try {
      ws = new WebSocket(`${BINANCE_WS}/!miniTicker@arr`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      if (disposed) return;
      try {
        const arr: BinanceMiniTickerEvent[] = JSON.parse(event.data);
        const map = new Map<string, CryptoTicker>();
        for (const t of arr) {
          const close = parseFloat(t.c);
          const open = parseFloat(t.o);
          const pct = open > 0 ? ((close - open) / open) * 100 : 0;
          map.set(t.s, {
            symbol: t.s,
            price: close,
            priceChangePercent: pct,
            volume: parseFloat(t.v),
            high: parseFloat(t.h),
            low: parseFloat(t.l),
            quoteVolume: parseFloat(t.q),
          });
        }
        onUpdate(map);
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => {
      /* handled by onclose */
    };

    ws.onclose = () => {
      if (!disposed) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (disposed) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  }

  connect();

  return () => {
    disposed = true;
    clearTimeout(reconnectTimer);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}

// ── Map CryptoInterval → Interval (for ChartContainer) ──

import type { Interval } from '../components/Chart/types';

export function cryptoIntervalToChartInterval(ci: CryptoInterval): Interval {
  switch (ci) {
    case '1w':
      return '1wk';
    case '1M':
      return '1mo';
    case '4h':
      return '1h'; // closest match
    default:
      return ci as Interval;
  }
}

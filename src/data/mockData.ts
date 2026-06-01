export interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  name: string;
  displayName: string;
  startPrice: number;
}

export const SYMBOLS: SymbolInfo[] = [
  { name: 'AAPL', displayName: 'Apple Inc.', startPrice: 185 },
  { name: 'MSFT', displayName: 'Microsoft Corp.', startPrice: 420 },
  { name: 'GOOGL', displayName: 'Alphabet Inc.', startPrice: 175 },
  { name: 'AMZN', displayName: 'Amazon.com Inc.', startPrice: 200 },
  { name: 'TSLA', displayName: 'Tesla Inc.', startPrice: 245 },
  { name: 'BTC/USD', displayName: 'Bitcoin', startPrice: 95000 },
  { name: 'ETH/USD', displayName: 'Ethereum', startPrice: 3200 },
];

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateDailyData(symbol: string, days: number, startPrice: number): OHLCVData[] {
  const data: OHLCVData[] = [];
  let price = startPrice;
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);

    if (!symbol.includes('/') && (date.getDay() === 0 || date.getDay() === 6)) continue;

    const vol = price * 0.02;
    const change = (Math.random() - 0.48) * vol;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * vol * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * 0.5;
    const volume = Math.floor(1_000_000 + Math.random() * 5_000_000);
    price = close;

    data.push({
      date: formatDate(date),
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume,
    });
  }
  return data;
}

const dataCache = new Map<string, OHLCVData[]>();

export function getSymbolData(symbol: string): OHLCVData[] {
  if (dataCache.has(symbol)) return dataCache.get(symbol)!;
  const info = SYMBOLS.find((s) => s.name === symbol);
  const data = generateDailyData(symbol, 2000, info?.startPrice ?? 100);
  dataCache.set(symbol, data);
  return data;
}

export function prependOlderData(symbol: string, count: number): OHLCVData[] {
  const existing = dataCache.get(symbol);
  if (!existing || existing.length === 0) return [];

  const firstDate = new Date(existing[0].date);
  const newBars: OHLCVData[] = [];
  let price = existing[0].open;

  for (let i = count; i >= 1; i--) {
    const date = new Date(firstDate);
    date.setDate(date.getDate() - i);
    if (!symbol.includes('/') && (date.getDay() === 0 || date.getDay() === 6)) continue;

    const vol = price * 0.02;
    const change = (Math.random() - 0.52) * vol;
    const close = price;
    const open = close - change;
    price = open;

    newBars.push({
      date: formatDate(date),
      open: +open.toFixed(2),
      high: +(Math.max(open, close) + Math.random() * vol * 0.5).toFixed(2),
      low: +(Math.min(open, close) - Math.random() * vol * 0.5).toFixed(2),
      close: +close.toFixed(2),
      volume: Math.floor(1_000_000 + Math.random() * 5_000_000),
    });
  }

  const merged = [...newBars, ...existing];
  dataCache.set(symbol, merged);
  return merged;
}

export function generateRealtimeUpdate(bar: OHLCVData): OHLCVData {
  const v = bar.close * 0.001;
  const change = (Math.random() - 0.48) * v;
  const newClose = +(bar.close + change).toFixed(2);
  return {
    ...bar,
    high: +Math.max(bar.high, newClose).toFixed(2),
    low: +Math.min(bar.low, newClose).toFixed(2),
    close: newClose,
    volume: bar.volume + Math.floor(Math.random() * 50000),
  };
}

export function generateNewBar(lastBar: OHLCVData): OHLCVData {
  const d = new Date(lastBar.date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);

  const vol = lastBar.close * 0.015;
  const change = (Math.random() - 0.48) * vol;
  const open = lastBar.close;
  const close = +(open + change).toFixed(2);

  return {
    date: formatDate(d),
    open,
    high: +(Math.max(open, close) + Math.random() * vol * 0.3).toFixed(2),
    low: +(Math.min(open, close) - Math.random() * vol * 0.3).toFixed(2),
    close,
    volume: Math.floor(1_000_000 + Math.random() * 5_000_000),
  };
}

import * as XLSX from 'xlsx';
import type { OHLCVData } from '../api/borsaApi';
import { computeRSI, computeMACD, computeBollingerBands, computeADX, computeSuperTrend } from './indicators';

interface ExportRow {
  Tarih: string;
  Acilis: number;
  Yuksek: number;
  Dusuk: number;
  Kapanis: number;
  Hacim: number;
  [key: string]: string | number | null;
}

function buildRows(data: OHLCVData[], includeIndicators: boolean): ExportRow[] {
  const rows: ExportRow[] = data.map((d) => ({
    Tarih: d.date,
    Acilis: d.open,
    Yuksek: d.high,
    Dusuk: d.low,
    Kapanis: d.close,
    Hacim: d.volume,
  }));

  if (!includeIndicators || data.length < 30) return rows;

  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);
  const closes = data.map((d) => d.close);

  // RSI
  const rsi = computeRSI(closes);
  for (let i = 0; i < rows.length; i++) {
    rows[i]['RSI'] = rsi.rsi[i] ?? null;
  }

  // MACD
  const macd = computeMACD(closes);
  for (let i = 0; i < rows.length; i++) {
    rows[i]['MACD'] = macd.macd[i] ?? null;
    rows[i]['MACD_Signal'] = macd.signal[i] ?? null;
    rows[i]['MACD_Histogram'] = macd.histogram[i] ?? null;
  }

  // Bollinger Bands
  const bb = computeBollingerBands(closes);
  for (let i = 0; i < rows.length; i++) {
    rows[i]['BB_Upper'] = bb.upper[i] ?? null;
    rows[i]['BB_Middle'] = bb.middle[i] ?? null;
    rows[i]['BB_Lower'] = bb.lower[i] ?? null;
  }

  // ADX
  const adx = computeADX(highs, lows, closes);
  for (let i = 0; i < rows.length; i++) {
    rows[i]['ADX'] = adx.adx[i] ?? null;
    rows[i]['+DI'] = adx.plusDI[i] ?? null;
    rows[i]['-DI'] = adx.minusDI[i] ?? null;
  }

  // SuperTrend
  const st = computeSuperTrend(highs, lows, closes);
  for (let i = 0; i < rows.length; i++) {
    rows[i]['SuperTrend'] = st.supertrend[i] ?? null;
    rows[i]['ST_Direction'] = st.direction[i] ?? null;
  }

  return rows;
}

export function exportCSV(data: OHLCVData[], symbol: string, includeIndicators: boolean): void {
  const rows = buildRows(data, includeIndicators);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const bom = '\uFEFF';
  const lines = [
    headers.join(';'),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'number') return val.toString().replace('.', ',');
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(';'),
    ),
  ];

  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = includeIndicators ? '-indikatorler' : '';
  a.download = `${symbol}${suffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportXLSX(data: OHLCVData[], symbol: string, includeIndicators: boolean): void {
  const rows = buildRows(data, includeIndicators);
  if (rows.length === 0) return;

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, symbol);
  const suffix = includeIndicators ? '-indikatorler' : '';
  XLSX.writeFile(wb, `${symbol}${suffix}.xlsx`);
}

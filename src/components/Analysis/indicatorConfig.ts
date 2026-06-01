/**
 * Frontend metadata registry for backend indicators.
 * Must match indicator names in backend/indicators.py INDICATOR_REGISTRY.
 *
 * To add a new indicator:
 *   1. Add the class in backend/indicators.py
 *   2. Add a meta entry here
 *   → Table + charts auto-update.
 */

export interface IndicatorMeta {
  name: string; // backend key prefix: "rsi"
  label: string; // display label: "RSI"
  scoreKey: string; // "rsi_score"
  signalKey: string; // "rsi_signal"
  detailKeys: string[]; // extra columns to show
}

const INDICATOR_META: IndicatorMeta[] = [
  {
    name: 'rsi',
    label: 'RSI',
    scoreKey: 'rsi_score',
    signalKey: 'rsi_signal',
    detailKeys: ['rsi_rsi'],
  },
  {
    name: 'macd',
    label: 'MACD',
    scoreKey: 'macd_score',
    signalKey: 'macd_signal',
    detailKeys: ['macd_macd', 'macd_histogram', 'macd_signal_line'],
  },
  {
    name: 'bollinger',
    label: 'Bollinger',
    scoreKey: 'bollinger_score',
    signalKey: 'bollinger_signal',
    detailKeys: ['bollinger_pct_b', 'bollinger_bandwidth'],
  },
  {
    name: 'stoch_rsi',
    label: 'Stoch RSI',
    scoreKey: 'stoch_rsi_score',
    signalKey: 'stoch_rsi_signal',
    detailKeys: ['stoch_rsi_k', 'stoch_rsi_d'],
  },
  {
    name: 'adx',
    label: 'ADX',
    scoreKey: 'adx_score',
    signalKey: 'adx_signal',
    detailKeys: ['adx_adx', 'adx_plus_di', 'adx_minus_di'],
  },
  {
    name: 'supertrend',
    label: 'SuperTrend',
    scoreKey: 'supertrend_score',
    signalKey: 'supertrend_signal',
    detailKeys: ['supertrend_supertrend', 'supertrend_direction'],
  },
  {
    name: 'ichimoku',
    label: 'Ichimoku',
    scoreKey: 'ichimoku_score',
    signalKey: 'ichimoku_signal',
    detailKeys: ['ichimoku_tenkan', 'ichimoku_kijun'],
  },
  {
    name: 'obv',
    label: 'OBV',
    scoreKey: 'obv_score',
    signalKey: 'obv_signal',
    detailKeys: ['obv_obv', 'obv_obv_ema'],
  },
  {
    name: 'atr',
    label: 'ATR',
    scoreKey: 'atr_score',
    signalKey: 'atr_signal',
    detailKeys: ['atr_atr', 'atr_atr_pct'],
  },
];

export default INDICATOR_META;

/** Map a backend detail key to a human-readable label */
export function detailLabel(key: string): string {
  const map: Record<string, string> = {
    rsi_rsi: 'RSI',
    macd_macd: 'MACD',
    macd_histogram: 'Histogram',
    macd_signal_line: 'Sinyal',
    bollinger_pct_b: '%B',
    bollinger_bandwidth: 'Bant Gen.',
    stoch_rsi_k: '%K',
    stoch_rsi_d: '%D',
    adx_adx: 'ADX',
    adx_plus_di: '+DI',
    adx_minus_di: '-DI',
    supertrend_supertrend: 'ST',
    supertrend_direction: 'Yon',
    ichimoku_tenkan: 'Tenkan',
    ichimoku_kijun: 'Kijun',
    obv_obv: 'OBV',
    obv_obv_ema: 'OBV EMA',
    atr_atr: 'ATR',
    atr_atr_pct: 'ATR %',
  };
  return map[key] ?? key;
}

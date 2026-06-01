/**
 * Bollinger Bands configuration for chart overlay display.
 * Replaces the old Pearson Regression Channels.
 *
 * Bollinger Bands = SMA(period) ± mult * StdDev(period)
 */

export interface BollingerConfig {
  id: string;
  label: string;
  period: number;
  mult: number;
  color: string;
  bandColor: string;
  width: number;
}

export const DEFAULT_BOLLINGER_CONFIGS: BollingerConfig[] = [
  {
    id: 'bb20',
    label: 'Bollinger (20, 2)',
    period: 20,
    mult: 2.0,
    color: 'rgba(33,150,243,0.8)',
    bandColor: 'rgba(33,150,243,0.5)',
    width: 2,
  },
];

/**
 * Compute Bollinger Bands overlay data for ECharts.
 * Returns arrays of upper, middle, lower values.
 */
export interface BollingerOverlayResult {
  id: string;
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

export function computeBollingerOverlay(closes: number[], config: BollingerConfig): BollingerOverlayResult {
  const n = closes.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const middle: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);

  for (let i = config.period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - config.period + 1; j <= i; j++) {
      sum += closes[j];
    }
    const mean = sum / config.period;

    let sumSq = 0;
    for (let j = i - config.period + 1; j <= i; j++) {
      sumSq += (closes[j] - mean) ** 2;
    }
    const sd = Math.sqrt(sumSq / config.period);

    middle[i] = mean;
    upper[i] = mean + config.mult * sd;
    lower[i] = mean - config.mult * sd;
  }

  return { id: config.id, upper, middle, lower };
}

export function computeAllBollingerOverlays(
  closes: number[],
  configs: BollingerConfig[] = DEFAULT_BOLLINGER_CONFIGS,
): BollingerOverlayResult[] {
  return configs.map((cfg) => computeBollingerOverlay(closes, cfg));
}

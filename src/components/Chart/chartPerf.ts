export interface ChartPerfProfile {
  lowEnd: boolean;
  largeModeThreshold: number;
  skipEmaRegimeAreas: boolean;
  /** null = all default EMA periods */
  emaOverlayPeriods: number[] | null;
  lineSampling: 'lttb' | 'average';
  legendThrottleMs: number;
  skipPanelTitlesOnHover: boolean;
}

export interface ChartIndicatorLoadInput {
  showBollinger?: boolean;
  showRSI?: boolean;
  showMACD?: boolean;
  showStochRSI?: boolean;
  showSuperTrend?: boolean;
  showIchimoku?: boolean;
  showOBV?: boolean;
  showWilliamsPasa?: boolean;
  showNizamiCedid?: boolean;
  showEMAOverlay?: boolean;
  showPearsonChannels?: boolean;
  showCMF?: boolean;
}

let cached: ChartPerfProfile | null = null;

function detectLowEndDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (memory !== undefined && memory <= 2) return true;
  if (cores <= 4 && (memory === undefined || memory <= 4)) return true;
  return false;
}

export function getChartPerfProfile(): ChartPerfProfile {
  if (cached) return cached;
  const lowEnd = detectLowEndDevice();
  cached = {
    lowEnd,
    largeModeThreshold: lowEnd ? 64 : 150,
    skipEmaRegimeAreas: lowEnd,
    emaOverlayPeriods: lowEnd ? [21, 55, 144] : null,
    lineSampling: lowEnd ? 'lttb' : 'average',
    legendThrottleMs: lowEnd ? 100 : 0,
    skipPanelTitlesOnHover: lowEnd,
  };
  return cached;
}

/** Rough series count estimate — used to tune zoom/pan performance. */
export function countChartIndicatorLoad(flags: ChartIndicatorLoadInput): number {
  let n = 0;
  if (flags.showBollinger) n += 3;
  if (flags.showEMAOverlay) n += 8;
  if (flags.showSuperTrend) n += 2;
  if (flags.showIchimoku) n += 4;
  if (flags.showPearsonChannels) n += 4;
  if (flags.showRSI) n += 2;
  if (flags.showMACD) n += 3;
  if (flags.showStochRSI) n += 2;
  if (flags.showOBV) n += 2;
  if (flags.showWilliamsPasa) n += 2;
  if (flags.showNizamiCedid) n += 3;
  if (flags.showCMF) n += 4;
  return n;
}

export function getEffectiveLargeModeThreshold(indicatorLoad: number, base: number): number {
  if (indicatorLoad >= 10) return Math.min(base, 36);
  if (indicatorLoad >= 6) return Math.min(base, 56);
  if (indicatorLoad >= 3) return Math.min(base, 80);
  return base;
}

/** Extra line-series options when zoomed out with many overlays. */
export function getHeavyLineSeriesExtras(enabled: boolean): Record<string, unknown> {
  if (!enabled) return {};
  return {
    large: true,
    largeThreshold: 500,
    progressive: 256,
    progressiveThreshold: 400,
  };
}

/** Test hook */
export function resetChartPerfProfileCache(): void {
  cached = null;
}

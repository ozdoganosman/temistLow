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

/** Test hook */
export function resetChartPerfProfileCache(): void {
  cached = null;
}

import { useDeferredValue } from 'react';

export interface ChartIndicatorFlags {
  showBollinger: boolean;
  showRSI: boolean;
  showMACD: boolean;
  showStochRSI: boolean;
  showSuperTrend: boolean;
  showIchimoku: boolean;
  showOBV: boolean;
  showWilliamsPasa: boolean;
  showNizamiCedid: boolean;
  showEMAOverlay: boolean;
  showPearsonChannels: boolean;
  showCMF: boolean;
  showSignals: boolean;
  logScale: boolean;
}

/** Defer chart rebuilds so toolbar / overlay toggles can paint first (lower INP). */
export function useDeferredChartFlags(flags: ChartIndicatorFlags): ChartIndicatorFlags {
  return {
    showBollinger: useDeferredValue(flags.showBollinger),
    showRSI: useDeferredValue(flags.showRSI),
    showMACD: useDeferredValue(flags.showMACD),
    showStochRSI: useDeferredValue(flags.showStochRSI),
    showSuperTrend: useDeferredValue(flags.showSuperTrend),
    showIchimoku: useDeferredValue(flags.showIchimoku),
    showOBV: useDeferredValue(flags.showOBV),
    showWilliamsPasa: useDeferredValue(flags.showWilliamsPasa),
    showNizamiCedid: useDeferredValue(flags.showNizamiCedid),
    showEMAOverlay: useDeferredValue(flags.showEMAOverlay),
    showPearsonChannels: useDeferredValue(flags.showPearsonChannels),
    showCMF: useDeferredValue(flags.showCMF),
    showSignals: useDeferredValue(flags.showSignals),
    logScale: useDeferredValue(flags.logScale),
  };
}

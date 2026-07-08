import { DRAWINGS_SERIES_ID } from './chartBuilder';

/** Sub-panel + overlay count at which pan switches to a lighter render path. */
export const PAN_LITE_LOAD_THRESHOLD = 4;

/** Minimum vertical drag (px) before y-axis is patched during horizontal pan. */
export const PAN_Y_DRAG_THRESHOLD_PX = 10;

export function shouldUsePanLite(indicatorLoad: number): boolean {
  return indicatorLoad >= PAN_LITE_LOAD_THRESHOLD;
}

function isEssentialDuringPan(series: Record<string, unknown>): boolean {
  if (series.type === 'candlestick') return true;
  if (series.id === DRAWINGS_SERIES_ID) return true;
  if (series.name === 'Volume') return true;
  return false;
}

/**
 * While panning with many indicators, hide overlays and sub-panels so ECharts
 * only repaints candle + volume + drawings each frame.
 */
export function buildPanLitePatch(
  opt: Record<string, unknown>,
  mode: 'enter' | 'exit',
): Record<string, unknown> {
  const series = opt.series;
  if (!Array.isArray(series)) {
    return mode === 'exit' ? { axisPointer: { show: true } } : { axisPointer: { show: false } };
  }

  if (mode === 'exit') {
    return {
      series: series.map(() => ({ show: true })),
      axisPointer: { show: true },
    };
  }

  return {
    axisPointer: { show: false },
    graphic: [],
    series: series.map((s) => {
      const row = s as Record<string, unknown>;
      return { show: isEssentialDuringPan(row) };
    }),
  };
}

/** Sync the bottom slider after pan ends (inside zoom already moved during drag). */
export function buildSliderSyncPatch(
  opt: Record<string, unknown>,
): Record<string, unknown> | null {
  const dz = (opt.dataZoom as Array<Record<string, unknown>> | undefined)?.[0];
  if (!dz) return null;
  const start = dz.start;
  const end = dz.end;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  return {
    dataZoom: [{ start, end }, { start, end }],
  };
}

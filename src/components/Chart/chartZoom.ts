/** Helpers for reading/updating ECharts dataZoom. */

export interface DataZoomWindow {
  start: number;
  end: number;
  startValue: number;
  endValue: number;
  xLen: number;
}

export function readDataZoomWindow(opt: {
  dataZoom?: Array<{
    start?: number;
    end?: number;
    startValue?: number;
    endValue?: number;
  }>;
  xAxis?: Array<{ data?: unknown[] }>;
}): DataZoomWindow {
  const dz = opt?.dataZoom?.[0];
  const xLen = opt?.xAxis?.[0]?.data?.length ?? 0;
  const maxIdx = Math.max(0, xLen - 1);

  let start = dz?.start;
  let end = dz?.end;
  let startValue = dz?.startValue;
  let endValue = dz?.endValue;

  if (start == null || end == null) {
    if (startValue != null && endValue != null && maxIdx > 0) {
      start = (startValue / maxIdx) * 100;
      end = (endValue / maxIdx) * 100;
    } else {
      start = 0;
      end = 100;
    }
  }

  if (startValue == null || endValue == null) {
    startValue = Math.floor((start / 100) * maxIdx);
    endValue = Math.ceil((end / 100) * maxIdx);
  }

  return {
    start,
    end,
    startValue: Math.max(0, Math.min(maxIdx, Math.round(startValue))),
    endValue: Math.max(0, Math.min(maxIdx, Math.round(endValue))),
    xLen,
  };
}

/** Percent patch — reliable for live pan (ECharts always respects start/end). */
export function buildDataZoomPercentPatch(start: number, end: number) {
  const s = Math.max(0, Math.min(100, start));
  const e = Math.max(0, Math.min(100, end));
  return [{ start: s, end: e }, { start: s, end: e }];
}

/** @deprecated Prefer buildDataZoomPercentPatch for pan */
export function buildDataZoomValuePatch(startValue: number, endValue: number) {
  return [{ startValue, endValue }, { startValue, endValue }];
}

export function shiftDataZoomPercent(
  window: DataZoomWindow,
  dxPx: number,
  chartWidthPx: number,
): { start: number; end: number } {
  const span = Math.max(0.001, window.end - window.start);
  const shift = -(dxPx / Math.max(1, chartWidthPx)) * span;
  let start = window.start + shift;
  let end = window.end + shift;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > 100) {
    start -= end - 100;
    end = 100;
  }
  return { start: Math.max(0, start), end: Math.min(100, end) };
}

/** Helpers for reading/updating ECharts dataZoom by bar index (smoother pan than %). */

export interface DataZoomWindow {
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

  let startValue = dz?.startValue;
  let endValue = dz?.endValue;

  if (startValue == null || endValue == null) {
    const startPct = dz?.start ?? 0;
    const endPct = dz?.end ?? 100;
    startValue = Math.floor((startPct / 100) * maxIdx);
    endValue = Math.ceil((endPct / 100) * maxIdx);
  }

  return {
    startValue: Math.max(0, Math.min(maxIdx, Math.round(startValue))),
    endValue: Math.max(0, Math.min(maxIdx, Math.round(endValue))),
    xLen,
  };
}

export function buildDataZoomValuePatch(startValue: number, endValue: number) {
  return [{ startValue, endValue }, { startValue, endValue }];
}

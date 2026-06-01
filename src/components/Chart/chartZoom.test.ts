import { describe, expect, it } from 'vitest';
import { buildDataZoomValuePatch, readDataZoomWindow } from './chartZoom';

describe('chartZoom', () => {
  it('reads bar-index window from percent dataZoom', () => {
    const win = readDataZoomWindow({
      dataZoom: [{ start: 0, end: 50 }],
      xAxis: [{ data: new Array(100).fill(0) }],
    });
    expect(win.startValue).toBe(0);
    expect(win.endValue).toBe(50);
    expect(win.xLen).toBe(100);
  });

  it('builds paired value patches for inside + slider', () => {
    const patch = buildDataZoomValuePatch(10, 90);
    expect(patch).toHaveLength(2);
    expect(patch[0]).toEqual({ startValue: 10, endValue: 90 });
  });
});

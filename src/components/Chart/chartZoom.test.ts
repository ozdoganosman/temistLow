import { describe, expect, it } from 'vitest';
import {
  buildDataZoomPercentPatch,
  readDataZoomWindow,
  shiftDataZoomPercent,
} from './chartZoom';

describe('chartZoom', () => {
  it('reads percent window from dataZoom', () => {
    const win = readDataZoomWindow({
      dataZoom: [{ start: 10, end: 60 }],
      xAxis: [{ data: new Array(200).fill(0) }],
    });
    expect(win.start).toBe(10);
    expect(win.end).toBe(60);
    expect(win.xLen).toBe(200);
  });

  it('shifts percent window on pan', () => {
    const win = readDataZoomWindow({
      dataZoom: [{ start: 20, end: 40 }],
      xAxis: [{ data: new Array(100).fill(0) }],
    });
    const next = shiftDataZoomPercent(win, 50, 500);
    expect(next.start).toBeLessThan(20);
    expect(next.end).toBeLessThan(40);
  });

  it('builds paired percent patches', () => {
    const patch = buildDataZoomPercentPatch(5, 55);
    expect(patch).toHaveLength(2);
    expect(patch[0]).toEqual({ start: 5, end: 55 });
  });
});

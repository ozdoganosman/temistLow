import { describe, expect, it } from 'vitest';
import {
  buildPanLitePatch,
  buildSliderSyncPatch,
  shouldUsePanLite,
  PAN_LITE_LOAD_THRESHOLD,
} from './chartInteraction';
import { DRAWINGS_SERIES_ID } from './chartBuilder';

describe('chartInteraction', () => {
  it('enables pan lite at threshold', () => {
    expect(shouldUsePanLite(PAN_LITE_LOAD_THRESHOLD - 1)).toBe(false);
    expect(shouldUsePanLite(PAN_LITE_LOAD_THRESHOLD)).toBe(true);
  });

  it('hides non-essential series on enter and restores on exit', () => {
    const opt = {
      series: [
        { type: 'candlestick' },
        { name: 'Volume' },
        { id: DRAWINGS_SERIES_ID },
        { type: 'line', xAxisIndex: 1 },
        { type: 'line', name: 'EMA 21' },
      ],
    };
    const enter = buildPanLitePatch(opt, 'enter');
    expect((enter.series as { show: boolean }[])[0].show).toBe(true);
    expect((enter.series as { show: boolean }[])[3].show).toBe(false);
    expect((enter.series as { show: boolean }[])[4].show).toBe(false);

    const exit = buildPanLitePatch(opt, 'exit');
    expect((exit.series as { show: boolean }[]).every((s) => s.show)).toBe(true);
  });

  it('builds slider sync from inside dataZoom', () => {
    const patch = buildSliderSyncPatch({
      dataZoom: [{ start: 12, end: 88 }, { start: 0, end: 100 }],
    });
    expect(patch).toEqual({ dataZoom: [{ start: 12, end: 88 }, { start: 12, end: 88 }] });
  });
});

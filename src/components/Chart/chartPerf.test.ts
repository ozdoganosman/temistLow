import { describe, expect, it, afterEach } from 'vitest';
import { getChartPerfProfile, resetChartPerfProfileCache } from './chartPerf';

describe('chartPerf', () => {
  afterEach(() => {
    resetChartPerfProfileCache();
  });

  it('returns a stable profile shape', () => {
    const profile = getChartPerfProfile();
    expect(profile.largeModeThreshold).toBeGreaterThan(0);
    expect(['lttb', 'average']).toContain(profile.lineSampling);
  });
});

import { countChartIndicatorLoad, getEffectiveLargeModeThreshold } from './chartPerf';

it('weights indicator load for large-mode threshold', () => {
  const load = countChartIndicatorLoad({ showEMAOverlay: true, showRSI: true, showMACD: true });
  expect(load).toBeGreaterThan(5);
  expect(getEffectiveLargeModeThreshold(load, 150)).toBeLessThan(150);
});

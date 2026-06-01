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

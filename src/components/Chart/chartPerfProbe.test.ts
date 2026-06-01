import { describe, expect, it, beforeEach } from 'vitest';
import { isChartPerfProbeEnabled, resetChartPerfProbeForTests } from './chartPerfProbe';

describe('chartPerfProbe', () => {
  beforeEach(() => {
    resetChartPerfProbeForTests();
    localStorage.removeItem('temist_chart_profile');
  });

  it('is disabled by default', () => {
    expect(isChartPerfProbeEnabled()).toBe(false);
  });

  it('enables via localStorage flag', () => {
    localStorage.setItem('temist_chart_profile', '1');
    expect(isChartPerfProbeEnabled()).toBe(true);
  });
});

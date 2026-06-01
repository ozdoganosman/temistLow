/**
 * Optional chart interaction profiler — enable in the browser console:
 *   localStorage.setItem('temist_chart_profile', '1'); location.reload();
 * Or open the app with ?chartProfile=1
 *
 * While dragging the chart, logs estimated pan FPS and slow setOption timings.
 * For deep analysis use Chrome DevTools → Performance (record while panning).
 */

const STORAGE_KEY = 'temist_chart_profile';

let enabled: boolean | null = null;

export function isChartPerfProbeEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (typeof window === 'undefined') {
    enabled = false;
    return false;
  }
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      enabled = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams(window.location.search);
  enabled = params.get('chartProfile') === '1';
  return enabled;
}

export function resetChartPerfProbeForTests(): void {
  enabled = null;
}

export class ChartPanProbe {
  private dragActive = false;
  private frameCount = 0;
  private lastLog = 0;
  private panSetOptionMs = 0;
  private panSetOptionCalls = 0;

  beginDrag(): void {
    if (!isChartPerfProbeEnabled()) return;
    this.dragActive = true;
    this.frameCount = 0;
    this.lastLog = performance.now();
    this.panSetOptionMs = 0;
    this.panSetOptionCalls = 0;
    console.info('[temist chart] profiling ON — pan the chart; open Performance tab for flame charts');
  }

  endDrag(): void {
    if (!this.dragActive) return;
    this.dragActive = false;
    this.flush('drag-end');
  }

  recordPanSetOption(durationMs: number): void {
    if (!this.dragActive) return;
    this.panSetOptionCalls += 1;
    this.panSetOptionMs += durationMs;
    this.frameCount += 1;
    const now = performance.now();
    if (now - this.lastLog >= 1000) {
      this.flush('interval');
      this.lastLog = now;
    }
  }

  private flush(reason: string): void {
    if (this.frameCount === 0 && this.panSetOptionCalls === 0) return;
    const avg =
      this.panSetOptionCalls > 0
        ? (this.panSetOptionMs / this.panSetOptionCalls).toFixed(2)
        : '—';
    console.info(
      `[temist chart] pan (${reason}): ~${this.frameCount} setOption/s, avg setOption ${avg}ms (${this.panSetOptionCalls} calls in window)`,
    );
    this.frameCount = 0;
    this.panSetOptionMs = 0;
    this.panSetOptionCalls = 0;
  }
}

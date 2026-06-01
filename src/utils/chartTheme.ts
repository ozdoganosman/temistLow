/**
 * Shared ECharts theme colors derived from CSS variables.
 * Call getChartTheme() inside useEffect (after DOM mount) to get current theme values.
 */
export interface ChartTheme {
  titleColor: string;
  textColor: string;
  textMuted: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  axisLineColor: string;
  splitLineColor: string;
}

export function getChartTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    titleColor: v('--text-secondary', '#8a8e96'),
    textColor: v('--text-muted', '#6a6e7e'),
    textMuted: v('--text-muted', '#6a6e7e'),
    tooltipBg: v('--border-primary', '#1a1e2e'),
    tooltipBorder: v('--border-secondary', '#2a2e3e'),
    tooltipText: v('--text-primary', '#e0e3eb'),
    axisLineColor: v('--border-secondary', '#2a2e3e'),
    splitLineColor: v('--border-primary', '#1a1e2e'),
  };
}

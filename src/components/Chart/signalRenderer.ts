/**
 * Signal scatter marker builder for ECharts.
 * Extracts buy/sell signal visualization from ChartContainer.
 */
import type * as echarts from 'echarts';
import type { SignalEvent } from '../../utils/signalDetection';

const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';

export interface ScatterPoint {
  value: [number, number];
}

export function buildSignalScatterSeries(
  signalEvents: SignalEvent[],
  paddingOffset: number,
  totalLen: number,
): echarts.SeriesOption[] {
  if (!signalEvents || signalEvents.length === 0) return [];

  const buyPoints: ScatterPoint[] = [];
  const sellPoints: ScatterPoint[] = [];

  for (const ev of signalEvents) {
    const catIdx = paddingOffset + ev.barIndex;
    if (catIdx >= 0 && catIdx < totalLen) {
      const pt: ScatterPoint = { value: [catIdx, ev.entryPrice] };
      if (ev.signalType === 'bullish') buyPoints.push(pt);
      else sellPoints.push(pt);
    }
  }

  return [
    {
      name: 'AL Sinyal',
      type: 'scatter' as const,
      data: buyPoints,
      xAxisIndex: 0,
      yAxisIndex: 0,
      symbol: 'triangle',
      symbolSize: 14,
      symbolOffset: [0, 10],
      itemStyle: { color: UP_COLOR, borderColor: '#fff', borderWidth: 1 },
      z: 20,
      silent: true,
      tooltip: { show: false },
    },
    {
      name: 'SAT Sinyal',
      type: 'scatter' as const,
      data: sellPoints,
      xAxisIndex: 0,
      yAxisIndex: 0,
      symbol: 'path://M0,0 L10,0 L5,10 Z',
      symbolSize: 14,
      symbolOffset: [0, -10],
      itemStyle: { color: DOWN_COLOR, borderColor: '#fff', borderWidth: 1 },
      z: 20,
      silent: true,
      tooltip: { show: false },
    },
  ];
}

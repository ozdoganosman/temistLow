import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { WinRateChartData } from './deriveBacktestData';
import { getChartTheme } from '../../utils/chartTheme';

const PERIOD_COLORS: Record<number, string> = {
  5: '#42a5f5',
  10: '#ab47bc',
  20: '#ffa726',
  60: '#26a69a',
};

interface Props {
  data: WinRateChartData;
  signalType: 'bullish' | 'bearish';
}

export default function WinRateChart({ data, signalType }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    instanceRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    const t = getChartTheme();
    const source = signalType === 'bullish' ? data.bullish : data.bearish;
    const title = signalType === 'bullish' ? 'KAZANMA ORANI — AL' : 'KAZANMA ORANI — SAT';

    const series = data.periods.map((p) => ({
      name: `${p}G`,
      type: 'bar' as const,
      data: source[p] ?? [],
      itemStyle: { color: PERIOD_COLORS[p] ?? '#6a6e7e' },
      barGap: '10%',
    }));

    chart.setOption(
      {
        title: {
          text: title,
          left: 12,
          top: 8,
          textStyle: { color: t.titleColor, fontSize: 12, fontWeight: 600 },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: t.tooltipBg,
          borderColor: t.tooltipBorder,
          textStyle: { color: t.tooltipText, fontSize: 11 },
          axisPointer: { type: 'shadow' },
          formatter: (params: any) => {
            const lines = params.map((p: any) => `${p.marker} ${p.seriesName}: <b>${p.value.toFixed(1)}%</b>`);
            return `<b>${params[0].axisValue}</b><br/>${lines.join('<br/>')}`;
          },
        },
        legend: {
          top: 8,
          right: 12,
          textStyle: { color: t.titleColor, fontSize: 10 },
          itemWidth: 12,
          itemHeight: 10,
        },
        grid: { left: 45, right: 12, top: 40, bottom: 28 },
        xAxis: {
          type: 'category',
          data: data.indicators,
          axisLine: { lineStyle: { color: t.axisLineColor } },
          axisLabel: { color: t.textColor, fontSize: 9 },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          name: '%',
          max: 100,
          nameTextStyle: { color: t.textColor, fontSize: 9 },
          splitLine: { lineStyle: { color: t.splitLineColor } },
          axisLine: { lineStyle: { color: t.axisLineColor } },
          axisLabel: { color: t.textColor, fontSize: 9 },
        },
        series,
      },
      true,
    );
  }, [data, signalType]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}

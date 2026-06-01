import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { SignalCountData } from './deriveBacktestData';
import { getChartTheme } from '../../utils/chartTheme';

interface Props {
  data: SignalCountData;
}

export default function SignalCountChart({ data }: Props) {
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
    const labels = data.items.map((d) => d.label);

    chart.setOption(
      {
        title: {
          text: 'SINYAL SAYISI',
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
        },
        legend: {
          top: 8,
          right: 12,
          textStyle: { color: t.titleColor, fontSize: 10 },
          itemWidth: 12,
          itemHeight: 10,
        },
        grid: { left: 50, right: 12, top: 40, bottom: 28 },
        xAxis: {
          type: 'category',
          data: labels,
          axisLine: { lineStyle: { color: t.axisLineColor } },
          axisLabel: { color: t.textColor, fontSize: 9 },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          name: 'Adet',
          nameTextStyle: { color: t.textColor, fontSize: 9 },
          splitLine: { lineStyle: { color: t.splitLineColor } },
          axisLine: { lineStyle: { color: t.axisLineColor } },
          axisLabel: { color: t.textColor, fontSize: 9 },
        },
        series: [
          {
            name: 'Al Sinyali',
            type: 'bar',
            stack: 'total',
            data: data.items.map((d) => d.bullish),
            itemStyle: { color: '#26a69a' },
            barWidth: '50%',
          },
          {
            name: 'Sat Sinyali',
            type: 'bar',
            stack: 'total',
            data: data.items.map((d) => d.bearish),
            itemStyle: { color: '#ef5350' },
            barWidth: '50%',
          },
        ],
      },
      true,
    );
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}

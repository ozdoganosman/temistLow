import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ProfitFactorData } from './deriveBacktestData';
import { getChartTheme } from '../../utils/chartTheme';

interface Props {
  data: ProfitFactorData;
}

export default function ProfitFactorChart({ data }: Props) {
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
    const values = data.items.map((d) => d.profitFactor);
    const colors = data.items.map((d) => (d.profitFactor >= 1 ? '#26a69a' : '#ef5350'));

    chart.setOption(
      {
        title: {
          text: 'PROFIT FACTOR',
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
            const p = params[0];
            return `<b>${p.axisValue}</b><br/>PF: <b>${p.value.toFixed(2)}</b>`;
          },
        },
        grid: { left: 100, right: 30, top: 36, bottom: 12 },
        xAxis: {
          type: 'value',
          name: 'PF',
          nameTextStyle: { color: t.textColor, fontSize: 9 },
          splitLine: { lineStyle: { color: t.splitLineColor } },
          axisLine: { lineStyle: { color: t.axisLineColor } },
          axisLabel: { color: t.textColor, fontSize: 9 },
        },
        yAxis: {
          type: 'category',
          data: labels,
          axisLine: { lineStyle: { color: t.axisLineColor } },
          axisLabel: { color: t.textColor, fontSize: 9 },
          axisTick: { show: false },
          inverse: true,
        },
        series: [
          {
            type: 'bar',
            data: values.map((v, i) => ({
              value: v,
              itemStyle: { color: colors[i] },
            })),
            barWidth: '60%',
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: '#ffa726', type: 'dashed', width: 1 },
              data: [{ xAxis: 1 }],
              label: { show: true, formatter: 'PF=1', color: '#ffa726', fontSize: 9 },
            },
          },
        ],
      },
      true,
    );
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}

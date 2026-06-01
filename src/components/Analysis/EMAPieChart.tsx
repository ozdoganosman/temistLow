import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { SignalDistribution } from './deriveData';
import { getChartTheme } from '../../utils/chartTheme';

interface Props {
  data: SignalDistribution;
}

export default function EMAPieChart({ data }: Props) {
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
    const total = data.allBullish + data.bullish + data.neutral + data.bearish + data.allBearish;

    chart.setOption({
      title: {
        text: 'PIYASA SINYAL DAGILIMI',
        left: 12,
        top: 8,
        textStyle: { color: t.titleColor, fontSize: 12, fontWeight: 600 },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        formatter: (p: any) => `${p.name}: ${p.value} (%${((p.value / total) * 100).toFixed(1)})`,
      },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        textStyle: { color: t.titleColor, fontSize: 10 },
        itemWidth: 10,
        itemHeight: 10,
      },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['40%', '55%'],
          avoidLabelOverlap: false,
          label: {
            show: true,
            position: 'center',
            formatter: 'Sinyal',
            fontSize: 14,
            fontWeight: 700,
            color: t.textMuted,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 700,
            },
          },
          labelLine: { show: false },
          data: [
            { value: data.allBullish, name: 'Guclu Al', itemStyle: { color: '#26a69a' } },
            { value: data.bullish, name: 'Al', itemStyle: { color: '#66bb6a' } },
            { value: data.neutral, name: 'Notr', itemStyle: { color: '#6a6e7e' } },
            { value: data.bearish, name: 'Sat', itemStyle: { color: '#ffa726' } },
            { value: data.allBearish, name: 'Guclu Sat', itemStyle: { color: '#ef5350' } },
          ],
        },
      ],
    });
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}

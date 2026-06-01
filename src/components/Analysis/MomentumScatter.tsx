import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { MomentumPoint } from './deriveData';
import { getChartTheme } from '../../utils/chartTheme';

interface Props {
  data: MomentumPoint[];
  onSymbolClick?: (symbol: string) => void;
}

export default function MomentumScatter({ data, onSymbolClick }: Props) {
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

    const seriesData = data.map((d, i) => ({
      value: [i, d.score],
      symbol_name: d.symbol,
      signal: d.signal,
      itemStyle: {
        color: d.score > 0 ? '#26a69a' : '#ef5350',
      },
    }));

    chart.setOption({
      title: {
        text: 'MOMENTUM DAGILIMI (SKOR)',
        left: 12,
        top: 8,
        textStyle: { color: t.titleColor, fontSize: 12, fontWeight: 600 },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
        formatter: (p: any) => {
          const d = p.data;
          return `<b>${d.symbol_name}</b><br/>Skor: ${Number(d.value[1]).toFixed(2)}`;
        },
      },
      grid: { left: 55, right: 20, top: 40, bottom: 32 },
      xAxis: {
        name: 'Hisse',
        nameLocation: 'center',
        nameGap: 20,
        nameTextStyle: { color: t.textColor, fontSize: 10 },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: t.axisLineColor } },
        axisLabel: { show: false },
      },
      yAxis: {
        name: 'Momentum Skor',
        nameLocation: 'center',
        nameGap: 42,
        nameTextStyle: { color: t.textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: t.splitLineColor } },
        axisLine: { lineStyle: { color: t.axisLineColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
      },
      series: [
        {
          type: 'scatter',
          data: seriesData,
          symbolSize: 5,
        },
      ],
    });

    chart.off('click');
    chart.on('click', (params: any) => {
      if (params.data?.symbol_name && onSymbolClick) {
        onSymbolClick(params.data.symbol_name);
      }
    });
  }, [data, onSymbolClick]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}

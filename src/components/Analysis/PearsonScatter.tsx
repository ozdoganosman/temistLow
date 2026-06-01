import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { RSIScatterPoint } from './deriveData';
import { getChartTheme } from '../../utils/chartTheme';

interface Props {
  data: RSIScatterPoint[];
  onSymbolClick?: (symbol: string) => void;
}

export default function PearsonScatter({ data, onSymbolClick }: Props) {
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

    const toRow = (d: RSIScatterPoint) => [d.rsi, d.score, d.symbol, d.indicator];

    const bullish = data.filter((d) => d.signal === 'bullish').map(toRow);
    const bearish = data.filter((d) => d.signal === 'bearish').map(toRow);
    const neutral = data.filter((d) => d.signal !== 'bullish' && d.signal !== 'bearish').map(toRow);

    chart.setOption({
      title: {
        text: 'RSI & SKOR DAGILIMI',
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
          return `<b>${d[2]}</b><br/>RSI: ${Number(d[0]).toFixed(2)}<br/>Skor: ${Number(d[1]).toFixed(2)}<br/>En Iyi: ${d[3]}`;
        },
      },
      grid: { left: 50, right: 20, top: 40, bottom: 32 },
      xAxis: {
        name: 'RSI',
        nameLocation: 'center',
        nameGap: 20,
        nameTextStyle: { color: t.textColor, fontSize: 10 },
        min: 0,
        max: 100,
        splitLine: {
          lineStyle: { color: t.splitLineColor },
        },
        axisLine: { lineStyle: { color: t.axisLineColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
      },
      yAxis: {
        name: 'Toplam Skor',
        nameLocation: 'center',
        nameGap: 38,
        nameTextStyle: { color: t.textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: t.splitLineColor } },
        axisLine: { lineStyle: { color: t.axisLineColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
      },
      visualMap: [
        {
          show: false,
          dimension: 0,
          min: 0,
          max: 100,
          inRange: {},
        },
      ],
      series: [
        {
          name: 'Bullish',
          type: 'scatter',
          data: bullish,
          symbolSize: 6,
          itemStyle: { color: '#26a69a' },
        },
        {
          name: 'Bearish',
          type: 'scatter',
          data: bearish,
          symbolSize: 6,
          itemStyle: { color: '#ef5350' },
        },
        {
          name: 'Notr',
          type: 'scatter',
          data: neutral,
          symbolSize: 5,
          itemStyle: { color: '#6a6e7e' },
        },
      ],
    });

    chart.off('click');
    chart.on('click', (params: any) => {
      if (params.data && params.data[2] && onSymbolClick) {
        onSymbolClick(params.data[2]);
      }
    });
  }, [data, onSymbolClick]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}

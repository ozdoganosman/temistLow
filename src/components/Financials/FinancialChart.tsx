import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { FinancialsResponse } from '../../api/borsaApi';

interface FinancialChartProps {
  data: FinancialsResponse;
}

function formatPeriodLabel(p: string): string {
  const parts = p.split('/');
  if (parts.length === 2) {
    const month = parseInt(parts[1]);
    if (month === 12) return parts[0];
    const qMap: Record<number, string> = { 3: 'Q1', 6: 'Q2', 9: 'Q3' };
    return parts[0] + '/' + (qMap[month] || `M${month}`);
  }
  return p;
}

export default function FinancialChart({ data }: FinancialChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.data.length || !data.periods.length) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current);
    }
    const chart = chartRef.current;

    // Find revenue and net income rows (Turkish names from isyatirimhisse)
    // Normalize: strip accents for comparison (e.g. ş→s, ö→o, ç→c, ı→i, ü→u, â→a)
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .toLowerCase();

    const revenueRow = data.data.find((r) => {
      const n = norm(r.item);
      return (
        n.includes('hasılat') ||
        n.includes('hasilat') ||
        n === 'satis gelirleri' ||
        n === 'satıs gelirleri' ||
        n === 'satis gelirleri' ||
        r.item === 'Satış Gelirleri' ||
        n.includes('revenue')
      );
    });
    const profitRow = data.data.find((r) => {
      const n = norm(r.item);
      return (
        r.item === 'DÖNEM KARI (ZARARI)' ||
        r.item === 'Dönem Net Kar/Zararı' ||
        n.includes('donem kari') ||
        n.includes('donem net kar') ||
        r.item.includes('Ana Ortaklık Payları') ||
        n.includes('ana ortaklik paylari') ||
        n.includes('net income')
      );
    });

    if (!revenueRow && !profitRow) {
      chart.clear();
      return;
    }

    const periods = data.periods;
    const revenueValues = periods.map((p) => (revenueRow?.[p] as number) ?? 0);
    const profitValues = periods.map((p) => (profitRow?.[p] as number) ?? 0);
    const labels = periods.map(formatPeriodLabel);

    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--text-muted').trim() || '#8a8e96';
    const bgColor = style.getPropertyValue('--bg-secondary').trim() || '#131722';

    chart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: bgColor,
          borderColor: bgColor,
          textStyle: { color: textColor, fontSize: 11 },
          formatter: (params: any) => {
            const items = params.map((p: any) => {
              const val = p.value as number;
              const abs = Math.abs(val);
              let formatted: string;
              if (abs >= 1e9) formatted = (val / 1e9).toFixed(1) + ' Mlr';
              else if (abs >= 1e6) formatted = (val / 1e6).toFixed(1) + ' Mln';
              else formatted = val.toLocaleString('tr-TR');
              return `${p.marker} ${p.seriesName}: ${formatted}`;
            });
            return `${params[0].axisValue}<br/>${items.join('<br/>')}`;
          },
        },
        legend: {
          data: revenueRow ? (profitRow ? ['Hasilat', 'Net Kar'] : ['Hasilat']) : ['Net Kar'],
          textStyle: { color: textColor, fontSize: 10 },
          top: 0,
        },
        grid: { left: 55, right: 15, top: 28, bottom: 22 },
        xAxis: {
          type: 'category',
          data: labels,
          axisLabel: { fontSize: 9, color: textColor },
          axisLine: { lineStyle: { color: textColor } },
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            fontSize: 9,
            color: textColor,
            formatter: (v: number) => {
              const abs = Math.abs(v);
              if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B';
              if (abs >= 1e6) return (v / 1e6).toFixed(0) + 'M';
              return v.toString();
            },
          },
          splitLine: { lineStyle: { color: 'rgba(128,128,128,0.15)' } },
        },
        series: [
          ...(revenueRow
            ? [
                {
                  name: 'Hasilat',
                  type: 'bar' as const,
                  data: revenueValues,
                  itemStyle: { color: '#2962FF' },
                  barMaxWidth: 24,
                },
              ]
            : []),
          ...(profitRow
            ? [
                {
                  name: 'Net Kar',
                  type: 'line' as const,
                  data: profitValues,
                  itemStyle: { color: '#26a69a' },
                  lineStyle: { width: 2 },
                  symbolSize: 4,
                },
              ]
            : []),
        ],
      },
      true,
    );

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
    };
  }, [data]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
    };
  }, []);

  if (!data.data.length || !data.periods.length) return null;

  return <div ref={containerRef} style={{ width: '100%', height: 160, flexShrink: 0 }} />;
}

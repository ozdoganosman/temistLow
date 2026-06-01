import { useState, useMemo } from 'react';
import type { BacktestStatRow } from '../../api/borsaApi';

type SortDir = 'asc' | 'desc';

interface Props {
  data: BacktestStatRow[];
}

const COLS: { key: keyof BacktestStatRow; label: string; fmt: (v: number) => string }[] = [
  { key: 'label', label: 'Indikator', fmt: () => '' },
  { key: 'signal_type', label: 'Sinyal', fmt: () => '' },
  { key: 'holding_period', label: 'Gun', fmt: (v) => String(v) },
  { key: 'total_signals', label: 'Adet', fmt: (v) => String(v) },
  { key: 'win_rate', label: 'Win %', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'avg_return', label: 'Ort. Get.', fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: 'avg_win', label: 'Ort. Kar', fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: 'avg_loss', label: 'Ort. Zarar', fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: 'profit_factor', label: 'PF', fmt: (v) => (v >= 9999 ? '∞' : v.toFixed(2)) },
  { key: 'max_win', label: 'Max Kar', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'max_loss', label: 'Max Zarar', fmt: (v) => `${(v * 100).toFixed(1)}%` },
];

function signalLabel(s: string): string {
  return s === 'bullish' ? 'Al' : 'Sat';
}

export default function BacktestTable({ data }: Props) {
  const [sortCol, setSortCol] = useState<string>('profit_factor');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const va = a[sortCol as keyof BacktestStatRow];
      const vb = b[sortCol as keyof BacktestStatRow];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'tr');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return col;
      }
      setSortDir('desc');
      return col;
    });
  };

  return (
    <div className="scan-results-container">
      <div className="scan-results-header">
        <div className="scan-results-info">{sorted.length} satir</div>
      </div>
      <div className="scan-table-wrap">
        <table className="scan-table">
          <thead>
            <tr>
              {COLS.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="sortable-th">
                  <span>{col.label}</span>
                  {sortCol === col.key && <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const pfClass = row.profit_factor >= 1.5 ? 'row-bullish' : row.profit_factor < 1 ? 'row-bearish' : '';
              return (
                <tr key={i} className={pfClass}>
                  {COLS.map((col) => {
                    if (col.key === 'label') return <td key={col.key}>{row.label}</td>;
                    if (col.key === 'signal_type') {
                      const cls = row.signal_type === 'bullish' ? 'sig-bull' : 'sig-bear';
                      return (
                        <td key={col.key} className={cls}>
                          {signalLabel(row.signal_type)}
                        </td>
                      );
                    }
                    const val = row[col.key];
                    return <td key={col.key}>{typeof val === 'number' ? col.fmt(val) : String(val ?? '-')}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

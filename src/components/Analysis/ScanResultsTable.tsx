import { useState, useMemo, useCallback } from 'react';
import type { ScanRow } from '../../api/borsaApi';
import INDICATOR_META, { detailLabel } from './indicatorConfig';
import { exportToCSV } from './csvExport';
import './ScanResultsTable.css';

interface Props {
  data: ScanRow[];
  onSymbolClick?: (symbol: string) => void;
}

type SortDir = 'asc' | 'desc';
interface SortState {
  col: string;
  dir: SortDir;
}

interface ColumnDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'signal';
}

// Build columns from indicator meta
function buildColumns(): ColumnDef[] {
  const cols: ColumnDef[] = [
    { key: 'symbol', label: 'Hisse', type: 'string' },
    { key: 'close', label: 'Kapanis', type: 'number' },
    { key: 'volume', label: 'Hacim', type: 'number' },
  ];

  for (const meta of INDICATOR_META) {
    cols.push({ key: meta.scoreKey, label: `${meta.label} Skor`, type: 'number' });
    cols.push({ key: meta.signalKey, label: `${meta.label} Sinyal`, type: 'signal' });
    for (const dk of meta.detailKeys) {
      const isNum = !dk.includes('kondisyon');
      cols.push({ key: dk, label: `${meta.label} ${detailLabel(dk)}`, type: isNum ? 'number' : 'string' });
    }
  }

  return cols;
}

function matchFilter(val: any, filter: string, type: string): boolean {
  if (!filter) return true;
  if (val === null || val === undefined) return false;

  if (type === 'signal') {
    return String(val).toLowerCase().includes(filter.toLowerCase());
  }

  if (type === 'number') {
    const num = Number(val);
    if (isNaN(num)) return false;

    // Range: "0.5..0.9"
    if (filter.includes('..')) {
      const [a, b] = filter.split('..');
      const lo = parseFloat(a);
      const hi = parseFloat(b);
      if (!isNaN(lo) && !isNaN(hi)) return num >= lo && num <= hi;
    }
    // Greater: ">0.5"
    if (filter.startsWith('>')) {
      const th = parseFloat(filter.slice(1));
      return !isNaN(th) && num > th;
    }
    // Less: "<-0.3"
    if (filter.startsWith('<')) {
      const th = parseFloat(filter.slice(1));
      return !isNaN(th) && num < th;
    }
    // Exact prefix match
    return String(num).includes(filter);
  }

  // string
  return String(val).toLowerCase().includes(filter.toLowerCase());
}

function signalClass(signal: string): string {
  switch (signal) {
    case 'bullish':
    case 'ideal_up':
      return 'sig-bull';
    case 'bearish':
    case 'ideal_down':
      return 'sig-bear';
    case 'up':
      return 'sig-up';
    case 'down':
      return 'sig-down';
    default:
      return 'sig-neut';
  }
}

function signalLabel(signal: string): string {
  const map: Record<string, string> = {
    bullish: 'Yukselis',
    bearish: 'Dusus',
    neutral: 'Notr',
    ideal_up: 'Ideal Yukselis',
    ideal_down: 'Ideal Dusus',
    up: 'Yukselis',
    down: 'Dusus',
  };
  return map[signal] ?? signal;
}

export default function ScanResultsTable({ data, onSymbolClick }: Props) {
  const columns = useMemo(() => buildColumns(), []);
  const [sort, setSort] = useState<SortState>({ col: 'symbol', dir: 'asc' });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    // Default: show symbol, close, volume + score + signal columns
    const defaults = new Set<string>();
    defaults.add('symbol');
    defaults.add('close');
    defaults.add('volume');
    for (const meta of INDICATOR_META) {
      defaults.add(meta.scoreKey);
      defaults.add(meta.signalKey);
    }
    return defaults;
  });
  const [showColPicker, setShowColPicker] = useState(false);

  const activeColumns = useMemo(() => columns.filter((c) => visibleCols.has(c.key)), [columns, visibleCols]);

  // Filter data
  const filtered = useMemo(() => {
    return data.filter((row) =>
      activeColumns.every((col) => matchFilter(row[col.key], filters[col.key] ?? '', col.type)),
    );
  }, [data, activeColumns, filters]);

  // Sort data
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { col, dir } = sort;
    arr.sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'tr');
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const toggleSort = useCallback((col: string) => {
    setSort((prev) => (prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  }, []);

  const setFilter = useCallback((col: string, val: string) => {
    setFilters((prev) => ({ ...prev, [col]: val }));
  }, []);

  // Count bullish / bearish signals per row for row highlighting
  const countSignals = (row: ScanRow): { bull: number; bear: number } => {
    let bull = 0;
    let bear = 0;
    for (const meta of INDICATOR_META) {
      const sig = row[meta.signalKey];
      if (sig === 'bullish' || sig === 'ideal_up') bull++;
      if (sig === 'bearish' || sig === 'ideal_down') bear++;
    }
    return { bull, bear };
  };

  const handleExport = () => {
    exportToCSV(
      sorted,
      activeColumns.map((c) => c.key),
    );
  };

  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatCell = (val: any, col: ColumnDef): string => {
    if (val === null || val === undefined) return '-';
    if (col.type === 'number') {
      const n = Number(val);
      if (isNaN(n)) return String(val);
      if (col.key === 'volume') return n.toLocaleString('tr-TR');
      if (Math.abs(n) < 0.01) return n.toFixed(6);
      return n.toFixed(4);
    }
    if (col.type === 'signal') return signalLabel(String(val));
    return String(val);
  };

  return (
    <div className="scan-results-container">
      <div className="scan-results-header">
        <div className="scan-results-info">
          <span className="scan-count">{sorted.length}</span> / {data.length} hisse
        </div>
        <div className="scan-results-actions">
          <button className="scan-btn" onClick={() => setShowColPicker((v) => !v)}>
            Sutunlar
          </button>
          <button className="scan-btn" onClick={handleExport}>
            CSV Indir
          </button>
        </div>
      </div>

      {showColPicker && (
        <div className="col-picker">
          {columns.map((col) => (
            <label key={col.key} className="col-pick-item">
              <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="scan-table-wrap">
        <table className="scan-table">
          <thead>
            <tr>
              {activeColumns.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="sortable-th">
                  <span>{col.label}</span>
                  {sort.col === col.key && (
                    <span className="sort-arrow">{sort.dir === 'asc' ? ' \u25B2' : ' \u25BC'}</span>
                  )}
                </th>
              ))}
            </tr>
            <tr className="filter-row">
              {activeColumns.map((col) => (
                <th key={col.key}>
                  <input
                    className="filter-input"
                    type="text"
                    placeholder={col.type === 'number' ? '>0.5' : '...'}
                    value={filters[col.key] ?? ''}
                    onChange={(e) => setFilter(col.key, e.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const { bull, bear } = countSignals(row);
              const rowClass = bull >= 5 ? 'row-bullish' : bear >= 5 ? 'row-bearish' : '';
              return (
                <tr key={row.symbol} className={rowClass}>
                  {activeColumns.map((col) => {
                    if (col.key === 'symbol') {
                      return (
                        <td key={col.key}>
                          <button className="symbol-link" onClick={() => onSymbolClick?.(row.symbol)}>
                            {row.symbol}
                          </button>
                        </td>
                      );
                    }
                    if (col.type === 'signal') {
                      const sig = String(row[col.key] ?? '');
                      return (
                        <td key={col.key} className={signalClass(sig)}>
                          {signalLabel(sig)}
                        </td>
                      );
                    }
                    return <td key={col.key}>{formatCell(row[col.key], col)}</td>;
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

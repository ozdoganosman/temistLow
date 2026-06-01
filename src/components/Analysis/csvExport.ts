/**
 * Export scan results to CSV file.
 * Includes BOM for Excel-compatible Turkish character support.
 */

import type { ScanRow } from '../../api/borsaApi';

export function exportToCSV(data: ScanRow[], columns: string[], filename = 'piyasa-analizi.csv'): void {
  if (data.length === 0) return;

  const BOM = '\ufeff';

  // Header
  const header = columns.join(';');

  // Rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return val ? 'Evet' : 'Hayir';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(';'),
  );

  const csv = BOM + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

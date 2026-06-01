import type { TopIndicatorRow } from './deriveData';

interface Props {
  data: TopIndicatorRow[];
  onSymbolClick?: (symbol: string) => void;
}

export default function TopPearsonTable({ data, onSymbolClick }: Props) {
  return (
    <div className="top-pearson-table">
      <div className="analysis-card-title">TOP 10 INDIKATOR SKORU</div>
      <table className="top-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Hisse</th>
            <th>Kapanis</th>
            <th>Skor</th>
            <th>Al/Sat</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.symbol}>
              <td className="rank">{i + 1}</td>
              <td>
                <button className="symbol-link" onClick={() => onSymbolClick?.(row.symbol)}>
                  {row.symbol}
                </button>
              </td>
              <td>{row.close.toFixed(2)}</td>
              <td className={row.totalScore > 2 ? 'val-green' : row.totalScore < -2 ? 'val-red' : ''}>
                {row.totalScore.toFixed(1)}
              </td>
              <td className="channel-name">
                <span style={{ color: '#26a69a' }}>{row.bullCount}</span>
                {' / '}
                <span style={{ color: '#ef5350' }}>{row.bearCount}</span>
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-row">
                Veri yok
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

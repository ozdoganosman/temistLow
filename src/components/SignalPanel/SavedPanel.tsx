import { useState, useRef, useCallback } from 'react';
import type { SignalConfig } from '../../utils/signalDetection';
import type { SavedConfig } from '../../hooks/useSavedConfigs';
import type { ScanProgress, ScanResult } from '../../utils/multiSymbolScan';
import { scanMultiSymbol, getScanSymbols, isCryptoSymbol } from '../../utils/multiSymbolScan';
import './SavedPanel.css';

interface Props {
  configs: SavedConfig[];
  currentSymbol: string;
  onRemoveConfig: (id: string) => void;
  onApplyConfig: (config: SignalConfig) => void;
  hidden?: boolean;
}

function pct(v: number): string {
  return (v * 100).toFixed(1) + '%';
}
function pf(v: number): string {
  return isFinite(v) ? v.toFixed(2) : '\u221e';
}

export default function SavedPanel({ configs, currentSymbol, onRemoveConfig, onApplyConfig, hidden }: Props) {
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanLabel, setScanLabel] = useState('');
  const [scanConfig, setScanConfig] = useState<SignalConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleScan = useCallback(
    async (saved: SavedConfig) => {
      if (scanningId === saved.id) {
        abortRef.current?.abort();
        setScanningId(null);
        setProgress(null);
        return;
      }

      setScanningId(saved.id);
      setResults([]);
      setProgress(null);
      setError(null);
      setScanLabel(saved.label);
      setScanConfig(saved.config);

      const ac = new AbortController();
      abortRef.current = ac;
      const isCrypto = isCryptoSymbol(currentSymbol);

      try {
        const symbols = await getScanSymbols(isCrypto);
        if (symbols.length === 0) {
          setError('Sembol listesi alinamadi.');
          setScanningId(null);
          return;
        }
        const res = await scanMultiSymbol(saved.config, symbols, isCrypto, setProgress, ac.signal);
        setResults(res);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Tarama hatasi.');
        }
      }
      setScanningId(null);
    },
    [scanningId, currentSymbol],
  );

  if (hidden) return null;

  const progressPct = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;
  const posCount = results.filter((r) => !r.error && r.totalReturn > 0).length;
  const negCount = results.filter((r) => !r.error && r.totalReturn <= 0).length;
  const errCount = results.filter((r) => r.error).length;

  return (
    <div className="saved-panel">
      {/* Config list */}
      {configs.length === 0 ? (
        <div className="saved-empty">
          Kayitli yapilandirma yok.
          <br />
          Islemler sekmesinde ayar olusturup &ldquo;Kaydet&rdquo; butonuna basin.
        </div>
      ) : (
        <div className="saved-list">
          {configs.map((c) => (
            <div key={c.id} className={`saved-card ${scanningId === c.id ? 'scanning' : ''}`}>
              <div className="saved-card-top">
                <span className="saved-label" title={c.label}>
                  {c.label}
                </span>
                <button className="saved-del" onClick={() => onRemoveConfig(c.id)} title="Sil">
                  &times;
                </button>
              </div>
              <div className="saved-card-meta">
                {c.sourceSymbol} &middot; {new Date(c.savedAt).toLocaleDateString('tr-TR')}
              </div>
              <div className="saved-card-actions">
                <button className="saved-btn apply" onClick={() => onApplyConfig(c.config)}>
                  Uygula
                </button>
                <button
                  className="saved-btn scan"
                  onClick={() => handleScan(c)}
                  disabled={!!scanningId && scanningId !== c.id}
                >
                  {scanningId === c.id ? 'Iptal' : 'Tara'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      {scanningId && progress && (
        <div className="scan-prog">
          <div className="scan-prog-bar-bg">
            <div className="scan-prog-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="scan-prog-text">
            {progress.phase === 'fetching' ? 'Veri cekilyor' : 'Degerlendiriliyor'} {progress.currentSymbol} —{' '}
            {progress.current}/{progress.total}
          </span>
        </div>
      )}

      {/* Error */}
      {error && <div className="scan-error">{error}</div>}

      {/* Results */}
      {results.length > 0 && !scanningId && (
        <div className="scan-results">
          <div className="scan-hdr">{scanLabel}</div>
          <div className="scan-table-wrap">
            <table className="scan-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sembol</th>
                  <th>Islem</th>
                  <th>Kazanma</th>
                  <th>Getiri</th>
                  <th>KF</th>
                  <th>Sharpe</th>
                  <th>MaksDD</th>
                  <th>Skor</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.symbol} className={r.error ? 'row-err' : r.totalReturn >= 0 ? 'row-pos' : 'row-neg'}>
                    <td className="scan-rank">{i + 1}</td>
                    <td className="scan-sym">{r.symbol}</td>
                    <td>{r.error ? '-' : r.totalTrades}</td>
                    <td style={{ color: !r.error && r.winRate >= 0.5 ? '#26a69a' : '#ef5350' }}>
                      {r.error ? '-' : pct(r.winRate)}
                    </td>
                    <td style={{ color: !r.error && r.totalReturn >= 0 ? '#26a69a' : '#ef5350' }}>
                      {r.error ? '-' : pct(r.totalReturn)}
                    </td>
                    <td style={{ color: !r.error && r.profitFactor >= 1 ? '#26a69a' : '#ef5350' }}>
                      {r.error ? '-' : pf(r.profitFactor)}
                    </td>
                    <td style={{ color: !r.error && r.sharpeRatio >= 0 ? '#26a69a' : '#ef5350' }}>
                      {r.error ? '-' : pf(r.sharpeRatio)}
                    </td>
                    <td style={{ color: '#ef5350' }}>{r.error ? '-' : pct(r.maxDrawdown)}</td>
                    <td className="scan-score">
                      {r.error ? <span className="scan-err-tag">{r.error}</span> : r.fitness.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="scan-summary">
            <span className="scan-sum-pos">Pozitif: {posCount}</span>
            <span className="scan-sum-neg">Negatif: {negCount}</span>
            {errCount > 0 && <span className="scan-sum-err">Hata: {errCount}</span>}
            {scanConfig && (
              <button className="saved-btn apply" onClick={() => onApplyConfig(scanConfig)}>
                Uygula
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { BacktestStatRow } from '../../api/borsaApi';
import { startBacktest, fetchBacktestResults, clearBacktestCache } from '../../api/borsaApi';
import WinRateChart from './WinRateChart';
import AvgReturnChart from './AvgReturnChart';
import SignalCountChart from './SignalCountChart';
import ProfitFactorChart from './ProfitFactorChart';
import BacktestTable from './BacktestTable';
import {
  deriveWinRateData,
  deriveAvgReturnData,
  deriveSignalCountData,
  deriveProfitFactorData,
} from './deriveBacktestData';
import '../Analysis/MarketAnalysis.css';
import './BacktestView.css';

export default function BacktestView() {
  const [stats, setStats] = useState<BacktestStatRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; analyzed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(20);
  const [signalType, setSignalType] = useState<'bullish' | 'bearish'>('bullish');
  const abortRef = useRef<AbortController | null>(null);

  const doBacktest = useCallback(() => {
    abortRef.current?.abort();
    setRunning(true);
    setError(null);
    setProgress(null);
    setStats([]);

    const ctrl = startBacktest(
      (p) => setProgress(p),
      (c) => {
        setStats(c.stats);
        setRunning(false);
        setCacheAge(0);
      },
      (err) => {
        setError(err);
        setRunning(false);
      },
    );
    abortRef.current = ctrl;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBacktestResults()
      .then((res) => {
        if (cancelled) return;
        if (res.stats && res.stats.length > 0) {
          setStats(res.stats);
          setCacheAge(res.cache_age_seconds ?? null);
        } else {
          doBacktest();
        }
      })
      .catch(() => {
        if (!cancelled) doBacktest();
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [doBacktest]);

  const handleRerun = useCallback(() => {
    setRunning(true);
    setProgress(null);
    setStats([]);
    setError(null);
    clearBacktestCache()
      .then(() => doBacktest())
      .catch(() => {
        setError('Cache temizlenemedi');
        setRunning(false);
      });
  }, [doBacktest]);

  // Filter stats for selected holding period (for signal count + profit factor)
  const periodStats = useMemo(() => stats.filter((s) => s.holding_period === selectedPeriod), [stats, selectedPeriod]);

  const winRateData = useMemo(() => deriveWinRateData(stats), [stats]);
  const avgReturnData = useMemo(() => deriveAvgReturnData(stats), [stats]);
  const signalCountData = useMemo(() => deriveSignalCountData(periodStats), [periodStats]);
  const profitFactorData = useMemo(() => deriveProfitFactorData(periodStats), [periodStats]);

  return (
    <div className="market-analysis">
      {/* Header */}
      <div className="analysis-header">
        <div className="analysis-header-left">
          <h2 className="analysis-title">Backtest Analizi</h2>
          {stats.length > 0 && (
            <span className="analysis-subtitle">
              {new Set(stats.map((s) => s.indicator)).size} indikator test edildi
              {cacheAge != null && cacheAge > 0 && (
                <span className="cache-age"> (cache: {Math.round(cacheAge / 60)} dk)</span>
              )}
            </span>
          )}
        </div>
        <div className="analysis-header-right">
          {/* Signal type toggle */}
          <div className="signal-toggle">
            <button
              className={`toolbar-btn ${signalType === 'bullish' ? 'bull-active' : ''}`}
              onClick={() => setSignalType('bullish')}
            >
              Al
            </button>
            <button
              className={`toolbar-btn ${signalType === 'bearish' ? 'bear-active' : ''}`}
              onClick={() => setSignalType('bearish')}
            >
              Sat
            </button>
          </div>

          {/* Holding period selector */}
          <div className="period-selector">
            {[5, 10, 20, 60].map((p) => (
              <button
                key={p}
                className={`toolbar-btn ${selectedPeriod === p ? 'active' : ''}`}
                onClick={() => setSelectedPeriod(p)}
              >
                {p}G
              </button>
            ))}
          </div>

          <button className="rescan-btn" onClick={handleRerun} disabled={running}>
            {running ? 'Hesaplaniyor...' : 'Yeniden Hesapla'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {running && (
        <div className="scan-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: progress ? `${(progress.completed / progress.total) * 100}%` : '2%',
              }}
            />
          </div>
          <div className="progress-text">
            {progress
              ? `${progress.completed} / ${progress.total} hisse islendi (${progress.analyzed} analiz edildi)`
              : 'Backtest baslatiliyor...'}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="scan-error">Hata: {error}</div>}

      {/* Charts 2x2 grid */}
      {stats.length > 0 && (
        <>
          <div className="analysis-grid">
            <div className="analysis-card">
              <WinRateChart data={winRateData} signalType={signalType} />
            </div>
            <div className="analysis-card">
              <AvgReturnChart data={avgReturnData} signalType={signalType} />
            </div>
            <div className="analysis-card">
              <SignalCountChart data={signalCountData} />
            </div>
            <div className="analysis-card">
              <ProfitFactorChart data={profitFactorData} />
            </div>
          </div>

          {/* Full table */}
          <div className="analysis-table-section">
            <BacktestTable data={stats} />
          </div>
        </>
      )}

      {/* Loading placeholder */}
      {running && stats.length === 0 && !error && (
        <div className="scan-loading">
          <div className="scan-loading-spinner" />
          <div className="scan-loading-text">Tum hisseler icin backtest hesaplaniyor, ~3-5 dakika surebilir...</div>
        </div>
      )}
    </div>
  );
}

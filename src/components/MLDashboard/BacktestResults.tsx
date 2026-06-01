import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MLTrainResponse, MLTrade, MLWalkForwardResult } from '../../api/borsaApi';
import './MLDashboard.css';

// ── Props ──────────────────────────────────────────────

interface BacktestResultsProps {
  stats: MLTrainResponse['stats'] | null;
  equityCurve: number[];
  trades: MLTrade[];
  walkForwardResults: MLWalkForwardResult[];
}

// ── Helpers ────────────────────────────────────────────

function pct(v: number | undefined): string {
  return v != null ? (v * 100).toFixed(1) + '%' : '-';
}

function num(v: number | undefined): string {
  return v != null && isFinite(v) ? v.toFixed(2) : '-';
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  // Show only YYYY-MM-DD
  return iso.slice(0, 10);
}

// ── Component ──────────────────────────────────────────

export function BacktestResults({
  stats,
  equityCurve,
  trades,
  walkForwardResults,
}: BacktestResultsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tradesExpanded, setTradesExpanded] = useState(false);

  // Build equity curve data for recharts
  const curveData = useMemo(() => {
    if (equityCurve.length < 2) return [];
    return equityCurve.map((v, i) => ({
      idx: i,
      value: +(v * 100 - 100).toFixed(2), // as percentage change from 1.0
    }));
  }, [equityCurve]);

  const totalReturn = equityCurve.length > 1
    ? equityCurve[equityCurve.length - 1] - equityCurve[0]
    : 0;
  const isPositive = totalReturn >= 0;
  const curveColor = isPositive ? '#26a69a' : '#ef5350';

  // Reversed trades (most recent first)
  const sortedTrades = useMemo(
    () => [...trades].reverse(),
    [trades],
  );

  return (
    <div className={`mld-section ${collapsed ? 'mld-section--collapsed' : ''}`}>
      <div className="mld-section__header" onClick={() => setCollapsed(!collapsed)}>
        <span className="mld-section__chevron">{'\u25BC'}</span>
        <span className="mld-section__title">Backtest Sonuclari</span>
      </div>

      <div className="mld-section__body">
        {/* Empty state */}
        {!stats ? (
          <div className="mld-bt-empty">Henuz backtest sonucu yok</div>
        ) : (
          <>
            {/* ── Equity Curve ── */}
            {curveData.length > 2 && (
              <div className="mld-bt-equity">
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={curveData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="mld-eq-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={curveColor} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={curveColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="idx" hide />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--tooltip-bg)',
                        border: '1px solid var(--border-secondary)',
                        borderRadius: 4,
                        fontSize: 10,
                        color: 'var(--text-primary)',
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((value: any) => [`${Number(value ?? 0).toFixed(2)}%`, 'K/Z']) as any}
                      labelFormatter={() => ''}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={curveColor}
                      strokeWidth={1.5}
                      fill="url(#mld-eq-grad)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Stats KPI Strip ── */}
            <div className="mld-bt-kpi-strip">
              <KpiBox label="Sharpe" value={num(stats.sharpe)} color={(stats.sharpe ?? 0) >= 1 ? '#26a69a' : (stats.sharpe ?? 0) >= 0 ? '#ff9800' : '#ef5350'} />
              <KpiBox label="Win Rate" value={pct(stats.winRate)} color={(stats.winRate ?? 0) >= 0.5 ? '#26a69a' : '#ef5350'} />
              <KpiBox label="PF" value={num(stats.profitFactor)} color={(stats.profitFactor ?? 0) >= 1 ? '#26a69a' : '#ef5350'} />
              <KpiBox label="Max DD" value={pct(stats.maxDrawdown)} color="#ef5350" />
              <KpiBox label="Sortino" value={num(stats.sortino)} color={(stats.sortino ?? 0) >= 1 ? '#26a69a' : (stats.sortino ?? 0) >= 0 ? '#ff9800' : '#ef5350'} />
              <KpiBox label="Calmar" value={num(stats.calmar)} color={(stats.calmar ?? 0) >= 1 ? '#26a69a' : (stats.calmar ?? 0) >= 0 ? '#ff9800' : '#ef5350'} />
              <KpiBox label="Toplam" value={pct(stats.totalReturn)} color={(stats.totalReturn ?? 0) >= 0 ? '#26a69a' : '#ef5350'} />
              <KpiBox label="Islem" value={String(stats.totalTrades ?? 0)} color="var(--text-primary)" />
            </div>

            {/* ── Trade Table (collapsible) ── */}
            {trades.length > 0 && (
              <div className="mld-bt-trades-wrap">
                <button
                  className="mld-bt-trades-toggle"
                  onClick={() => setTradesExpanded(!tradesExpanded)}
                >
                  {tradesExpanded ? '\u25BE Islemleri Gizle' : '\u25B8 Islemleri Goster'}
                  <span className="mld-bt-trades-count">({trades.length})</span>
                </button>
                {tradesExpanded && (
                  <div className="mld-bt-trades-scroll">
                    <table className="mld-bt-trades-table">
                      <thead>
                        <tr>
                          <th>Yon</th>
                          <th>Giris</th>
                          <th>Fiyat</th>
                          <th>Cikis</th>
                          <th>Fiyat</th>
                          <th>K/Z %</th>
                          <th>Bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTrades.map((t, i) => {
                          const isLong = t.positionType === 'long';
                          return (
                            <tr key={i}>
                              <td>
                                <span className={`mld-bt-direction-badge mld-bt-direction-badge--${isLong ? 'long' : 'short'}`}>
                                  {isLong ? 'L' : 'S'}
                                </span>
                              </td>
                              <td className="mld-bt-date">{fmtDate(t.entryDate)}</td>
                              <td>{(t.entryPrice ?? 0).toFixed(2)}</td>
                              <td className="mld-bt-date">{fmtDate(t.exitDate)}</td>
                              <td>{(t.exitPrice ?? 0).toFixed(2)}</td>
                              <td style={{ color: (t.returnPct ?? 0) >= 0 ? '#26a69a' : '#ef5350', fontWeight: 600 }}>
                                {((t.returnPct ?? 0) * 100).toFixed(2)}%
                              </td>
                              <td>{t.barsHeld ?? '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Walk-Forward Results ── */}
            {walkForwardResults.length > 1 && (
              <div className="mld-bt-wf-wrap">
                <div className="mld-bt-wf-title">Walk-Forward Sonuclari</div>
                <table className="mld-bt-wf-table">
                  <thead>
                    <tr>
                      <th>Pencere</th>
                      <th>IS Acc</th>
                      <th>OOS Acc</th>
                      <th>OOS Sharpe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {walkForwardResults.map((wf, i) => {
                      const isAcc = wf.is_accuracy ?? 0;
                      const oosAcc = wf.oos_accuracy ?? 0;
                      const gap = (isAcc - oosAcc) * 100;
                      const isOverfit = gap > 20;
                      return (
                        <tr key={i} className={isOverfit ? 'mld-bt-wf-overfit' : ''}>
                          <td>{wf.window ?? i + 1}</td>
                          <td>{(isAcc * 100).toFixed(1)}%</td>
                          <td style={{ color: isOverfit ? '#ef5350' : undefined }}>
                            {(oosAcc * 100).toFixed(1)}%
                            {isOverfit && <span className="mld-bt-wf-warn" title="IS-OOS farki >20% — asiri uyum riski"> !</span>}
                          </td>
                          <td>{(wf.oos_sharpe ?? 0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── KpiBox sub-component ────────────────────────────────

function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mld-bt-kpi">
      <span className="mld-bt-kpi__label">{label}</span>
      <span className="mld-bt-kpi__value" style={{ color }}>{value}</span>
    </div>
  );
}

import { useState, useMemo, Fragment } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { MLTrainResponse, MLClassMetrics } from '../../api/borsaApi';
import './MLDashboard.css';

// ── Props ──────────────────────────────────────────────

interface ModelDetailsProps {
  layers: MLTrainResponse['layers'] | null;
  trainingMeta: MLTrainResponse['training_meta'] | null;
}

// ── Feature category colors ────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  momentum: '#2962ff',  // blue
  trend: '#26a69a',     // green
  volatility: '#ff9800',// orange
  volume: '#9c27b0',    // purple
};

const DEFAULT_FEATURE_COLOR = '#616161'; // gray

function featureCategory(name: string): string {
  const n = name.toLowerCase();
  // Momentum indicators
  if (/rsi|stoch|macd|cci|williams|mom|roc|mfi|ao|uo/.test(n)) return 'momentum';
  // Trend indicators
  if (/ema|sma|wma|adx|di_|supertrend|ichimoku|trend|aroon|psar|vwap/.test(n)) return 'trend';
  // Volatility indicators
  if (/bb_|atr|bollinger|bandwidth|keltner|donchian|stddev|volatil/.test(n)) return 'volatility';
  // Volume indicators
  if (/volume|obv|vwap|ad_|cmf|force_idx|eom|volume_sma|vol_/.test(n)) return 'volume';
  return 'other';
}

function featureColor(name: string): string {
  const cat = featureCategory(name);
  return CATEGORY_COLORS[cat] ?? DEFAULT_FEATURE_COLOR;
}

// ── Class label maps ───────────────────────────────────

const CLASS_LABEL_MAP: Record<string, string> = {
  buy: 'AL',
  neutral: 'NOTR',
  short: 'SAT',
};

const CM_LABELS = ['SAT', 'NOTR', 'AL'];

// ── Component ──────────────────────────────────────────

export function ModelDetails({ layers, trainingMeta }: ModelDetailsProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Feature importance data (top 20 from short_term layer)
  const featureData = useMemo(() => {
    if (!layers) return [];
    const importance = layers.short_term.feature_importance;
    if (!importance) return [];
    return Object.entries(importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .reverse() // recharts vertical layout: bottom = first, so reverse for top-down
      .map(([name, value]) => ({
        name: name.length > 22 ? name.slice(0, 20) + '..' : name,
        fullName: name,
        value: +value.toFixed(4),
        color: featureColor(name),
      }));
  }, [layers]);

  // Class metrics from short_term layer
  const classMetrics: MLClassMetrics | null = layers?.short_term?.class_metrics ?? null;

  // Confusion matrix from short_term layer
  const confusionMatrix: number[][] | null = layers?.short_term?.confusion_matrix ?? null;

  return (
    <div className={`mld-section ${collapsed ? 'mld-section--collapsed' : ''}`}>
      <div className="mld-section__header" onClick={() => setCollapsed(!collapsed)}>
        <span className="mld-section__chevron">{'\u25BC'}</span>
        <span className="mld-section__title">Model Detaylari</span>
      </div>

      <div className="mld-section__body">
        {/* Empty state */}
        {!layers ? (
          <div className="mld-md-empty">Henuz model egitilmedi</div>
        ) : (
          <>
            {/* ── Feature Importance Bar Chart ── */}
            {featureData.length > 0 && (
              <div className="mld-md-fi-wrap">
                <div className="mld-md-subtitle">Ozellik Onemliligi (Top 20)</div>
                <div className="mld-md-fi-legend">
                  <span className="mld-md-fi-legend-item"><span className="mld-md-fi-swatch" style={{ background: CATEGORY_COLORS.momentum }} />Momentum</span>
                  <span className="mld-md-fi-legend-item"><span className="mld-md-fi-swatch" style={{ background: CATEGORY_COLORS.trend }} />Trend</span>
                  <span className="mld-md-fi-legend-item"><span className="mld-md-fi-swatch" style={{ background: CATEGORY_COLORS.volatility }} />Volatilite</span>
                  <span className="mld-md-fi-legend-item"><span className="mld-md-fi-swatch" style={{ background: CATEGORY_COLORS.volume }} />Hacim</span>
                  <span className="mld-md-fi-legend-item"><span className="mld-md-fi-swatch" style={{ background: DEFAULT_FEATURE_COLOR }} />Diger</span>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(featureData.length * 20, 120)}>
                  <BarChart
                    data={featureData}
                    layout="vertical"
                    margin={{ top: 2, right: 8, bottom: 2, left: 4 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fontSize: 9, fill: '#8a8e96' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--tooltip-bg)',
                        border: '1px solid var(--border-secondary)',
                        borderRadius: 4,
                        fontSize: 10,
                        color: 'var(--text-primary)',
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((value: any, _name: any, entry: any) => [
                        Number(value ?? 0).toFixed(4),
                        entry?.payload?.fullName ?? '',
                      ]) as any}
                      labelFormatter={() => ''}
                    />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                      {featureData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Confusion Matrix ── */}
            {confusionMatrix && confusionMatrix.length === 3 && (
              <ConfusionMatrixGrid matrix={confusionMatrix} />
            )}

            {/* ── Class Metrics Table ── */}
            {classMetrics && (
              <ClassMetricsTable metrics={classMetrics} />
            )}

            {/* ── Training Meta Summary ── */}
            {trainingMeta && (
              <div className="mld-md-meta-summary">
                {trainingMeta.total_features} ozellik &rarr; {trainingMeta.selected_features} secildi
                {' | '}
                {trainingMeta.training_bars} bar egitim
                {' | '}
                Optuna: {trainingMeta.optuna_trials} deneme
                {trainingMeta.best_trial_score > 0 && (
                  <span className="mld-md-meta-score">
                    {' '}(en iyi: {(trainingMeta.best_trial_score * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Confusion Matrix Sub-component ──────────────────────

function ConfusionMatrixGrid({ matrix }: { matrix: number[][] }) {
  const maxVal = Math.max(...matrix.flat(), 1);

  return (
    <div className="mld-md-cm-wrap">
      <div className="mld-md-subtitle">Konfuzyon Matrisi</div>
      <div className="mld-md-cm-grid">
        {/* Header row: corner + column labels */}
        <div className="mld-md-cm-cell mld-md-cm-corner" />
        {CM_LABELS.map((label) => (
          <div key={`h-${label}`} className="mld-md-cm-cell mld-md-cm-header">
            {label}
          </div>
        ))}

        {/* Data rows */}
        {matrix.map((row, ri) => (
          <Fragment key={ri}>
            <div className="mld-md-cm-cell mld-md-cm-header">{CM_LABELS[ri]}</div>
            {row.map((val, ci) => {
              const intensity = val / maxVal;
              const isDiag = ri === ci;
              const bg = isDiag
                ? `rgba(38, 166, 154, ${0.1 + intensity * 0.5})`
                : val > 0
                  ? `rgba(239, 83, 80, ${0.05 + intensity * 0.35})`
                  : 'transparent';
              return (
                <div
                  key={`${ri}-${ci}`}
                  className="mld-md-cm-cell mld-md-cm-value"
                  style={{ background: bg }}
                >
                  {val}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mld-md-cm-axis">
        <span className="mld-md-cm-axis-y">Gercek</span>
        <span className="mld-md-cm-axis-x">Tahmin</span>
      </div>
    </div>
  );
}

// ── Class Metrics Table Sub-component ───────────────────

function ClassMetricsTable({ metrics }: { metrics: MLClassMetrics }) {
  const classes = ['buy', 'neutral', 'short'] as const;

  return (
    <div className="mld-md-cls-wrap">
      <div className="mld-md-subtitle">Sinif Metrikleri</div>
      <table className="mld-md-cls-table">
        <thead>
          <tr>
            <th></th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cls) => {
            const p = metrics.precision[cls] ?? 0;
            const r = metrics.recall[cls] ?? 0;
            const f = metrics.f1[cls] ?? 0;
            return (
              <tr key={cls}>
                <td className="mld-md-cls-label">{CLASS_LABEL_MAP[cls]}</td>
                <td style={{ color: p >= 0.5 ? '#26a69a' : '#ef5350' }}>
                  {(p * 100).toFixed(0)}%
                </td>
                <td style={{ color: r >= 0.5 ? '#26a69a' : '#ef5350' }}>
                  {(r * 100).toFixed(0)}%
                </td>
                <td style={{ color: f >= 0.5 ? '#26a69a' : '#ef5350' }}>
                  {(f * 100).toFixed(0)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import type { MLTrainResponse, MetaDecision } from '../../api/borsaApi';
import './MLDashboard.css';

// ── Props ──────────────────────────────────────────────

interface StatusCardProps {
  layers: MLTrainResponse['layers'] | null;
  metaDecision: MetaDecision | null;
}

// ── Label maps (Turkish) ───────────────────────────────

const SIGNAL_LABELS: Record<number, string> = {
  1: 'AL',
  [-1]: 'SAT',
  0: 'NOTR',
};

const TREND_LABELS: Record<string, string> = {
  uptrend: 'YUKARI',
  downtrend: 'ASAGI',
  sideways: 'YATAY',
};

const META_LABELS: Record<MetaDecision, string> = {
  strong_buy: 'GUCLU AL',
  buy: 'AL',
  cautious_buy: 'DIKKATLI AL',
  neutral: 'NOTR',
  wait: 'BEKLE',
  cautious_sell: 'DIKKATLI SAT',
  sell: 'SAT',
  strong_sell: 'GUCLU SAT',
};

// ── Helpers ────────────────────────────────────────────

function signalType(signal: number | undefined): 'buy' | 'sell' | 'neutral' {
  if (signal === 1) return 'buy';
  if (signal === -1) return 'sell';
  return 'neutral';
}

function trendType(trend: string | undefined): 'buy' | 'sell' | 'neutral' {
  if (trend === 'uptrend') return 'buy';
  if (trend === 'downtrend') return 'sell';
  return 'neutral';
}

function riskColor(score: number): string {
  if (score <= 30) return '#26a69a';
  if (score <= 60) return '#ff9800';
  return '#ef5350';
}

// ── Component ──────────────────────────────────────────

export function StatusCard({ layers, metaDecision }: StatusCardProps) {
  // Empty state
  if (!layers) {
    return (
      <div className="mld-status-card mld-status-card--empty">
        <span className="mld-status-card__empty-text">
          Henuz model egitilmedi
        </span>
      </div>
    );
  }

  const { short_term, medium_term, risk_score } = layers;

  const shortSignal = short_term.signal;
  const shortType = signalType(shortSignal);
  const shortLabel = SIGNAL_LABELS[shortSignal ?? 0] ?? 'NOTR';
  const shortConf = (short_term.confidence * 100).toFixed(0);

  const medTrend = medium_term.trend;
  const medType = trendType(medTrend);
  const medLabel = TREND_LABELS[medTrend ?? 'sideways'] ?? 'YATAY';

  const riskVal = risk_score.score;

  return (
    <div className="mld-status-card">
      {/* Layer signals */}
      <div className="mld-status-card__layers">
        {/* Short term */}
        <div className="mld-status-card__layer">
          <span className="mld-status-card__layer-label">Kisa Vade:</span>
          <span className={`mld-status-card__signal-dot mld-status-card__signal-dot--${shortType}`} />
          <span className={`mld-status-card__signal-text mld-status-card__signal-text--${shortType}`}>
            {shortLabel}
          </span>
          <span className="mld-status-card__confidence">
            %{shortConf}
          </span>
        </div>

        {/* Medium term */}
        <div className="mld-status-card__layer">
          <span className="mld-status-card__layer-label">Orta Vade:</span>
          <span className={`mld-status-card__signal-dot mld-status-card__signal-dot--${medType}`} />
          <span className={`mld-status-card__signal-text mld-status-card__signal-text--${medType}`}>
            {medLabel}
          </span>
        </div>
      </div>

      {/* Risk gauge */}
      <div className="mld-status-card__risk">
        <div className="mld-status-card__risk-header">
          <span className="mld-status-card__risk-label">Risk:</span>
          <span
            className="mld-status-card__risk-value"
            style={{ color: riskColor(riskVal) }}
          >
            {riskVal.toFixed(0)}
          </span>
        </div>
        <div className="mld-risk-gauge">
          <div
            className="mld-risk-gauge__indicator"
            style={{ left: `${Math.min(Math.max(riskVal, 0), 100)}%` }}
          />
        </div>
      </div>

      {/* Meta decision */}
      {metaDecision && (
        <div className="mld-status-card__meta">
          <span className="mld-status-card__meta-arrow">&rarr;</span>
          <span className={`mld-meta-badge mld-meta-badge--${metaDecision}`}>
            {META_LABELS[metaDecision]}
          </span>
        </div>
      )}
    </div>
  );
}

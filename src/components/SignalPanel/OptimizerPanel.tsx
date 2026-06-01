import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from 'react';
import * as echarts from 'echarts';
import type { OHLCVData } from '../../api/borsaApi';
import type { SignalConfig } from '../../utils/signalDetection';
import type {
  EnhancedOptimizerResult,
  EnhancedOptimizerProgress,
  OptimizerSettings,
  RobustnessGrade,
} from '../../utils/optimizerTypes';
import { DEFAULT_OPTIMIZER_SETTINGS } from '../../utils/optimizerTypes';
import { optimizeSignals } from '../../utils/signalOptimizer';
import Tip from './Tip';
import './OptimizerPanel.css';

interface Props {
  data: OHLCVData[];
  dateRange: { start?: string; end?: string };
  onApplyConfig: (config: SignalConfig) => void;
  hidden?: boolean;
}

function pct(v: number): string {
  return (v * 100).toFixed(1) + '%';
}
function pf(v: number): string {
  return isFinite(v) ? v.toFixed(2) : '\u221e';
}
function num(v: number, d = 2): string {
  return v.toFixed(d);
}

type SortKey =
  | 'fitness'
  | 'totalTrades'
  | 'winRate'
  | 'sharpeRatio'
  | 'maxDrawdown'
  | 'profitFactor'
  | 'totalReturn'
  | 'robustnessGrade'
  | 'monteCarloScore';
type SourceFilter = 'all' | 'grid' | 'genetic' | 'combination';
type GradeFilter = 'all' | 'A' | 'B' | 'C' | 'D' | 'F';

const PHASE_NAMES = ['', 'Tekli Tarama', 'Genetik Arama', 'Kombinasyonlar', 'Walk-Forward', 'Monte Carlo'];

const SOURCE_LABELS: Record<string, string> = {
  grid: 'Grid',
  genetic: 'GA',
  combination: 'Kombo',
};

const SOURCE_COLORS: Record<string, string> = {
  grid: '#42a5f5',
  genetic: '#ab47bc',
  combination: '#ffa726',
};

// ── Settings persistence ──────────────────────

const SETTINGS_KEY = 'optimizer-settings';

function loadSettings(): OptimizerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_OPTIMIZER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_OPTIMIZER_SETTINGS };
}

function saveSettings(s: OptimizerSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── CSV Export ────────────────────────────────

function exportResultsCSV(results: EnhancedOptimizerResult[]) {
  const bom = '\uFEFF';
  const headers = [
    'Sira',
    'Strateji',
    'Kaynak',
    'Islem',
    'Kazanma',
    'Sharpe',
    'MaksDD',
    'KarFakt',
    'Toplam',
    'Kelly',
    'Recovery',
    'Ulcer',
    'Saglam',
    'MC',
    'Skor',
  ];
  const rows = results.map((r, i) =>
    [
      i + 1,
      `"${r.label}"`,
      r.source,
      r.inSample.totalTrades,
      (r.inSample.winRate * 100).toFixed(1),
      r.inSample.sharpeRatio.toFixed(2),
      (r.inSample.maxDrawdown * 100).toFixed(1),
      isFinite(r.inSample.profitFactor) ? r.inSample.profitFactor.toFixed(2) : 'Inf',
      (r.inSample.totalReturn * 100).toFixed(1),
      (r.inSample.kellyFraction * 100).toFixed(1),
      r.inSample.recoveryFactor.toFixed(2),
      r.inSample.ulcerIndex.toFixed(2),
      r.robustnessGrade,
      r.monteCarloScore !== null ? (r.monteCarloScore * 100).toFixed(0) : '-',
      r.fitness.toFixed(1),
    ].join(';'),
  );

  const csv = bom + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'optimizer-sonuclar.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Source Badge ─────────────────────────────

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="opt-source-badge" style={{ background: SOURCE_COLORS[source] ?? '#666' }}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

// ── Robustness Badge ──────────────────────────

function RobustnessBadge({ grade }: { grade: RobustnessGrade | null }) {
  if (!grade) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
  return <span className={`opt-robustness grade-${grade}`}>{grade}</span>;
}

// ── MC Score Badge ────────────────────────────

function MCBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
  const pctVal = Math.round(score * 100);
  const color = score >= 0.8 ? '#26a69a' : score >= 0.6 ? '#66bb6a' : score >= 0.4 ? '#ffa726' : '#ef5350';
  return (
    <span className="opt-mc-badge" style={{ background: color }}>
      {pctVal}%
    </span>
  );
}

// ── Equity Curve Mini Chart ───────────────────

function EquityCurveMiniChart({ equityCurve, oosEquityCurve }: { equityCurve: number[]; oosEquityCurve?: number[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    const allData = oosEquityCurve ? [...equityCurve, ...oosEquityCurve.slice(1)] : equityCurve;

    const series: echarts.EChartsOption['series'] = [
      {
        type: 'line',
        data: equityCurve,
        lineStyle: { color: '#26a69a', width: 1.5 },
        areaStyle: { color: 'rgba(38,166,154,0.08)' },
        symbol: 'none',
        silent: true,
      },
    ];

    if (oosEquityCurve && oosEquityCurve.length > 1) {
      const padding = new Array(equityCurve.length - 1).fill(null);
      series.push({
        type: 'line',
        data: [...padding, equityCurve[equityCurve.length - 1], ...oosEquityCurve.slice(1)],
        lineStyle: { color: '#42a5f5', width: 1.5 },
        areaStyle: { color: 'rgba(66,165,245,0.08)' },
        symbol: 'none',
        silent: true,
      });
    }

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { left: 0, right: 0, top: 4, bottom: 4 },
      xAxis: { type: 'category', show: false, data: allData.map((_, i) => i) },
      yAxis: { type: 'value', show: false, scale: true },
      series,
      ...(oosEquityCurve ? { visualMap: undefined } : {}),
    };

    if (oosEquityCurve && Array.isArray(series) && series[0]) {
      (series[0] as Record<string, unknown>).markLine = {
        silent: true,
        symbol: 'none',
        data: [{ xAxis: equityCurve.length - 1 }],
        lineStyle: { color: '#ffa726', type: 'dashed' as const, width: 1 },
        label: { show: false },
      };
    }

    chart.setOption(option);
    return () => chart.dispose();
  }, [equityCurve, oosEquityCurve]);

  return <div ref={ref} className="opt-equity-chart" />;
}

// ── Compare Modal ─────────────────────────────

function CompareView({
  a,
  b,
  onClose,
}: {
  a: EnhancedOptimizerResult;
  b: EnhancedOptimizerResult;
  onClose: () => void;
}) {
  const metrics: { label: string; getA: string; getB: string; better: 'higher' | 'lower' }[] = [
    { label: 'Skor', getA: a.fitness.toFixed(1), getB: b.fitness.toFixed(1), better: 'higher' },
    { label: 'Islem', getA: String(a.inSample.totalTrades), getB: String(b.inSample.totalTrades), better: 'higher' },
    { label: 'Kazanma', getA: pct(a.inSample.winRate), getB: pct(b.inSample.winRate), better: 'higher' },
    { label: 'Sharpe', getA: num(a.inSample.sharpeRatio), getB: num(b.inSample.sharpeRatio), better: 'higher' },
    { label: 'Sortino', getA: num(a.inSample.sortinoRatio), getB: num(b.inSample.sortinoRatio), better: 'higher' },
    { label: 'Maks DD', getA: pct(a.inSample.maxDrawdown), getB: pct(b.inSample.maxDrawdown), better: 'lower' },
    { label: 'Kar Fakt', getA: pf(a.inSample.profitFactor), getB: pf(b.inSample.profitFactor), better: 'higher' },
    { label: 'Toplam', getA: pct(a.inSample.totalReturn), getB: pct(b.inSample.totalReturn), better: 'higher' },
    { label: 'Kelly', getA: pct(a.inSample.kellyFraction), getB: pct(b.inSample.kellyFraction), better: 'higher' },
    { label: 'Recovery', getA: num(a.inSample.recoveryFactor), getB: num(b.inSample.recoveryFactor), better: 'higher' },
    { label: 'Ulcer', getA: num(a.inSample.ulcerIndex), getB: num(b.inSample.ulcerIndex), better: 'lower' },
    {
      label: 'MC Guven',
      getA: a.monteCarloScore !== null ? pct(a.monteCarloScore) : '-',
      getB: b.monteCarloScore !== null ? pct(b.monteCarloScore) : '-',
      better: 'higher',
    },
    { label: 'Saglam', getA: a.robustnessGrade, getB: b.robustnessGrade, better: 'higher' },
  ];

  return (
    <div className="opt-compare-overlay">
      <div className="opt-compare-panel">
        <div className="opt-compare-header">
          <span>Strateji Karsilastirma</span>
          <button className="opt-compare-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <table className="opt-compare-table">
          <thead>
            <tr>
              <th>Metrik</th>
              <th title={a.label}>
                A: <SourceBadge source={a.source} />
              </th>
              <th title={b.label}>
                B: <SourceBadge source={b.source} />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="opt-compare-label-row">
              <td>Strateji</td>
              <td title={a.label}>{a.label.length > 30 ? a.label.slice(0, 30) + '...' : a.label}</td>
              <td title={b.label}>{b.label.length > 30 ? b.label.slice(0, 30) + '...' : b.label}</td>
            </tr>
            {metrics.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td>{m.getA}</td>
                <td>{m.getB}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────

export default function OptimizerPanel({ data, dateRange, onApplyConfig, hidden }: Props) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [results, setResults] = useState<EnhancedOptimizerResult[]>([]);
  const [progress, setProgress] = useState<EnhancedOptimizerProgress | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('fitness');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<OptimizerSettings>(loadSettings);
  const abortRef = useRef<AbortController | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [minScore, setMinScore] = useState(0);

  // Compare
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  const updateSetting = <K extends keyof OptimizerSettings>(key: K, value: OptimizerSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  const handleStart = useCallback(async () => {
    if (state === 'running') {
      abortRef.current?.abort();
      return;
    }
    setState('running');
    setResults([]);
    setProgress(null);
    setExpandedRow(null);
    setCompareA(null);
    setCompareB(null);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await optimizeSignals(data, dateRange, settings, setProgress, ac.signal);
      setResults(res);
      setState('done');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState('idle');
      } else {
        console.error('Optimizer error:', err);
        setState('idle');
      }
    }
  }, [data, dateRange, state, settings]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const getSortValue = (r: EnhancedOptimizerResult, key: SortKey): number => {
    switch (key) {
      case 'fitness':
        return r.fitness;
      case 'totalTrades':
        return r.inSample.totalTrades;
      case 'winRate':
        return r.inSample.winRate;
      case 'sharpeRatio':
        return r.inSample.sharpeRatio;
      case 'maxDrawdown':
        return r.inSample.maxDrawdown;
      case 'profitFactor':
        return r.inSample.profitFactor;
      case 'totalReturn':
        return r.inSample.totalReturn;
      case 'monteCarloScore':
        return r.monteCarloScore ?? -1;
      case 'robustnessGrade': {
        const gradeMap: Record<RobustnessGrade, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
        return gradeMap[r.robustnessGrade] ?? 0;
      }
      default:
        return r.fitness;
    }
  };

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (gradeFilter !== 'all' && r.robustnessGrade !== gradeFilter) return false;
      if (r.fitness < minScore) return false;
      return true;
    });
  }, [results, sourceFilter, gradeFilter, minScore]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      return sortAsc ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortAsc]);

  const handleCompareToggle = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (compareA === idx) {
      setCompareA(null);
      return;
    }
    if (compareB === idx) {
      setCompareB(null);
      return;
    }
    if (compareA === null) setCompareA(idx);
    else if (compareB === null) setCompareB(idx);
    else {
      setCompareA(idx);
      setCompareB(null);
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? <span className="sort-arrow">{sortAsc ? '\u25B2' : '\u25BC'}</span> : null;

  const progressPct = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;

  const renderMetricCard = (label: string, value: string, color?: string, tip?: string) => (
    <div className="opt-metric">
      {tip ? (
        <Tip text={tip}>
          <span className="opt-metric-label">{label}</span>
        </Tip>
      ) : (
        <span className="opt-metric-label">{label}</span>
      )}
      <span className="opt-metric-value" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );

  const renderWFRow = (label: string, isVal: string, oosVal: string) => (
    <tr>
      <td>{label}</td>
      <td>{isVal}</td>
      <td>{oosVal}</td>
    </tr>
  );

  const colorFor = (v: number, threshold = 0) => (v >= threshold ? '#26a69a' : '#ef5350');

  const renderDetailPanel = (r: EnhancedOptimizerResult) => {
    const is = r.inSample;
    const oos = r.outOfSample;

    return (
      <div className="opt-detail">
        <Tip text="Sermaye egrisi: Stratejinin zaman icindeki kumulatif performansi. Yesil cizgi egitim donemi, mavi cizgi test donemi. Turuncu kesikli cizgi egitim/test ayrim noktasi.">
          <EquityCurveMiniChart equityCurve={is.equityCurve} oosEquityCurve={oos?.equityCurve} />
        </Tip>

        <div className="opt-detail-metrics">
          {renderMetricCard(
            'Sharpe',
            num(is.sharpeRatio),
            colorFor(is.sharpeRatio),
            'Sharpe orani: Getirinin riskine bolunmesiyle bulunur. 1 ustu iyi, 2 ustu cok iyi.',
          )}
          {renderMetricCard(
            'Sortino',
            num(is.sortinoRatio),
            colorFor(is.sortinoRatio),
            'Sortino orani: Sadece asagi yonlu riski hesaba katar. 1 ustu iyi, 2 ustu cok iyi.',
          )}
          {renderMetricCard(
            'Calmar',
            num(is.calmarRatio),
            colorFor(is.calmarRatio),
            'Calmar orani: Yillik getiri / maks dusus. 1 ustu iyi, 3 ustu mukemmel.',
          )}
          {renderMetricCard(
            'Kelly',
            pct(is.kellyFraction),
            colorFor(is.kellyFraction),
            'Kelly Kriteri: Her islemde sermayenizin yuzde kacini yatirmaniz gerektigini gosterir. %20-30 arasi makul, %50 ustu cok agresif.',
          )}
          {renderMetricCard(
            'Recovery',
            num(is.recoveryFactor),
            colorFor(is.recoveryFactor, 1),
            'Recovery Factor: Toplam getiri / maks dusus. Kayiptan ne kadar hizli toparlanabildigi. 3 ustu iyi, 5 ustu mukemmel.',
          )}
          {renderMetricCard(
            'Ulcer',
            num(is.ulcerIndex),
            is.ulcerIndex <= 5 ? '#26a69a' : '#ef5350',
            'Ulcer Index: Ortalama drawdown stresi (RMS). Dusuk deger az stres demektir. 5 alti iyi, 10 ustu yuksek stres.',
          )}
          {renderMetricCard(
            'Beklenti',
            pct(is.expectancy),
            colorFor(is.expectancy),
            'Her islemden ortalama beklenen kazanc/kayip. Pozitif deger karli strateji.',
          )}
          {renderMetricCard(
            'Ort. Bekleme',
            `${is.avgBarsHeld.toFixed(0)} gun`,
            undefined,
            'Bir pozisyonun ortalama kac gun acik tutuldugu.',
          )}
          {renderMetricCard(
            'Ard. K/K',
            `${is.consecutiveWins}/${is.consecutiveLosses}`,
            undefined,
            'En uzun ust uste kazanma/kaybetme serisi.',
          )}
          {renderMetricCard('Maks Kazanc', pct(is.maxWin), '#26a69a', 'Tek islemde en yuksek kazanc.')}
          {renderMetricCard('Maks Kayip', pct(is.maxLoss), '#ef5350', 'Tek islemde en buyuk kayip.')}
          {r.monteCarloScore !== null &&
            renderMetricCard(
              'MC Guven',
              pct(r.monteCarloScore),
              r.monteCarloScore >= 0.7 ? '#26a69a' : r.monteCarloScore >= 0.4 ? '#ffa726' : '#ef5350',
              'Monte Carlo guven skoru: Trade sirasini 500 kez karistirarak stratejinin sans eseri olup olmadigini test eder. %70+ ise strateji gercek, altiysa sans eseri olabilir.',
            )}
        </div>

        {oos && (
          <div className="opt-wf-comparison">
            <Tip text="Walk-forward dogrulama: Egitim ve test sonuclari birbirine yakinsa strateji saglamdir.">
              <div className="opt-wf-header">Walk-Forward Karsilastirma</div>
            </Tip>
            <table className="opt-wf-table">
              <thead>
                <tr>
                  <th></th>
                  <Tip text="Stratejinin optimize edildigi veri dilimi.">
                    <th>Egitim</th>
                  </Tip>
                  <Tip text="Stratejinin hic gormedigi veri dilimi.">
                    <th>Test</th>
                  </Tip>
                </tr>
              </thead>
              <tbody>
                {renderWFRow('Islem', String(is.totalTrades), String(oos.totalTrades))}
                {renderWFRow('Kazanma', pct(is.winRate), pct(oos.winRate))}
                {renderWFRow('Sharpe', num(is.sharpeRatio), num(oos.sharpeRatio))}
                {renderWFRow('Maks DD', pct(is.maxDrawdown), pct(oos.maxDrawdown))}
                {renderWFRow('KarFakt', pf(is.profitFactor), pf(oos.profitFactor))}
                {renderWFRow('Toplam', pct(is.totalReturn), pct(oos.totalReturn))}
              </tbody>
            </table>
          </div>
        )}

        <div className="opt-detail-actions">
          <Tip text="Bu stratejiyi sinyal paneline uygular.">
            <button className="opt-apply-btn" onClick={() => onApplyConfig(r.config)}>
              Uygula
            </button>
          </Tip>
        </div>
      </div>
    );
  };

  return (
    <div className="opt-panel" style={hidden ? { display: 'none' } : undefined}>
      {/* Compare overlay */}
      {compareA !== null && compareB !== null && sorted[compareA] && sorted[compareB] && (
        <CompareView
          a={sorted[compareA]}
          b={sorted[compareB]}
          onClose={() => {
            setCompareA(null);
            setCompareB(null);
          }}
        />
      )}

      {/* Settings */}
      <div className="opt-settings">
        <button className="opt-settings-toggle" onClick={() => setSettingsOpen(!settingsOpen)}>
          Ayarlar {settingsOpen ? '\u25BE' : '\u25B8'}
        </button>
        {settingsOpen && (
          <div className="opt-settings-body">
            <div className="opt-setting-row">
              <Tip text="Veriyi egitim ve test olarak ikiye boler. Strateji egitim verisinde optimize edilir, sonra test verisinde denenir. Kapaliysa tum veri kullanilir ama overfitting riski artar.">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.walkForward}
                    onChange={(e) => updateSetting('walkForward', e.target.checked)}
                  />
                  Walk-Forward + Monte Carlo
                </label>
              </Tip>
            </div>
            {settings.walkForward && (
              <div className="opt-setting-row">
                <Tip text="Verinin yuzde kaci egitim icin kullanilsin?">
                  <span>Egitim Orani:</span>
                </Tip>
                <input
                  type="range"
                  min={50}
                  max={90}
                  step={5}
                  value={settings.trainRatio * 100}
                  onChange={(e) => updateSetting('trainRatio', Number(e.target.value) / 100)}
                />
                <span>{Math.round(settings.trainRatio * 100)}%</span>
              </div>
            )}
            <div className="opt-setting-row">
              <Tip text="Her alis veya satis isleminde odenen komisyon yuzdesi.">
                <span>Islem Maliyeti:</span>
              </Tip>
              <input
                type="number"
                step={0.01}
                min={0}
                max={2}
                value={settings.transactionCostPct}
                onChange={(e) => updateSetting('transactionCostPct', Number(e.target.value))}
              />
              <span>% (tek yon)</span>
            </div>
            <div className="opt-setting-row">
              <Tip text="Stratejinin gecerli sayilmasi icin en az kac islem yapmasi gerekir.">
                <span>Min. Islem:</span>
              </Tip>
              <input
                type="number"
                min={3}
                max={50}
                value={settings.minTrades}
                onChange={(e) => updateSetting('minTrades', Number(e.target.value))}
              />
            </div>
            <details>
              <summary>Gelismis Ayarlar</summary>
              <div>
                <div className="opt-setting-row">
                  <Tip text="Genetik algoritmadaki birey sayisi. 30-60 arasi cogu durum icin yeterlidir.">
                    <span>Populasyon:</span>
                  </Tip>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={settings.populationSize}
                    onChange={(e) => updateSetting('populationSize', Number(e.target.value))}
                  />
                </div>
                <div className="opt-setting-row">
                  <Tip text="Genetik algoritmanin kac nesil boyunca calisacagi. 15-30 arasi yeterlidir.">
                    <span>Jenerasyon:</span>
                  </Tip>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={settings.generations}
                    onChange={(e) => updateSetting('generations', Number(e.target.value))}
                  />
                </div>
                <div className="opt-setting-row">
                  <Tip text="Mutasyon orani: Baslangic orani. Adaptive olarak nesiller ilerledikce azalir.">
                    <span>Mutasyon:</span>
                  </Tip>
                  <input
                    type="range"
                    min={5}
                    max={40}
                    value={settings.mutationRate * 100}
                    onChange={(e) => updateSetting('mutationRate', Number(e.target.value) / 100)}
                  />
                  <span>{Math.round(settings.mutationRate * 100)}%</span>
                </div>
                <div className="opt-setting-row">
                  <Tip text="Her nesilde hayatta kalan en iyi birey sayisi.">
                    <span>Elit Sayisi:</span>
                  </Tip>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={settings.eliteCount}
                    onChange={(e) => updateSetting('eliteCount', Number(e.target.value))}
                  />
                </div>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="opt-actions">
        <Tip text="5 fazli optimizasyon: Grid arama, genetik algoritma (adaptive mutation + tournament selection), kombinasyonlar, walk-forward dogrulama ve Monte Carlo guven testi.">
          <button
            className={`opt-start-btn ${state === 'running' ? 'cancel' : ''}`}
            onClick={handleStart}
            disabled={data.length < 100 && state !== 'running'}
          >
            {state === 'running' ? 'Iptal' : 'Optimize Et'}
          </button>
        </Tip>
        {state === 'running' && progress && (
          <span className="opt-status">
            Faz {progress.phase}/5: {progress.current}/{progress.total}
          </span>
        )}
        {state === 'done' && (
          <span className="opt-status">
            {filtered.length}/{results.length} sonuc
            {compareA !== null && <span> | Karsilastirma: {compareB !== null ? '2/2' : '1/2 sec'}</span>}
          </span>
        )}
        {state === 'done' && results.length > 0 && (
          <Tip text="Sonuclari CSV olarak indir.">
            <button className="opt-export-btn" onClick={() => exportResultsCSV(sorted)}>
              CSV
            </button>
          </Tip>
        )}
      </div>

      {/* Filters */}
      {state === 'done' && results.length > 0 && (
        <div className="opt-filters">
          <div className="opt-filter-group">
            <span className="opt-filter-label">Kaynak:</span>
            {(['all', 'grid', 'genetic', 'combination'] as const).map((s) => (
              <button
                key={s}
                className={`opt-filter-btn ${sourceFilter === s ? 'active' : ''}`}
                onClick={() => setSourceFilter(s)}
              >
                {s === 'all' ? 'Tumu' : SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="opt-filter-group">
            <span className="opt-filter-label">Not:</span>
            {(['all', 'A', 'B', 'C', 'D', 'F'] as const).map((g) => (
              <button
                key={g}
                className={`opt-filter-btn ${gradeFilter === g ? 'active' : ''}`}
                onClick={() => setGradeFilter(g)}
              >
                {g === 'all' ? 'Tumu' : g}
              </button>
            ))}
          </div>
          <div className="opt-filter-group">
            <span className="opt-filter-label">Min Skor:</span>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
            <span>{minScore}</span>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {state === 'running' && progress && (
        <div className="opt-progress">
          <div className="opt-phase-indicators">
            {([1, 2, 3, 4, 5] as const).map((phase, idx) => {
              const phaseTips: Record<number, string> = {
                1: 'Faz 1 - Tekli Tarama: Her indikatorun tum parametre kombinasyonlari taranir.',
                2: 'Faz 2 - Genetik Arama: Adaptive mutation + tournament selection ile evrimsel optimizasyon.',
                3: 'Faz 3 - Kombinasyonlar: Coklu indikator stratejileri olusturulur ve test edilir.',
                4: 'Faz 4 - Walk-Forward: Egitim/test bolunmesiyle overfitting kontrolu yapilir.',
                5: 'Faz 5 - Monte Carlo: Trade siralamasi karistirilarak stratejinin sans eseri olup olmadigi test edilir.',
              };
              return (
                <span key={phase} style={{ display: 'contents' }}>
                  {idx > 0 && <span className={`opt-phase-connector ${progress.phase > phase ? 'done' : ''}`} />}
                  <Tip text={phaseTips[phase]}>
                    <span
                      className={`opt-phase-dot ${
                        progress.phase > phase ? 'done' : progress.phase === phase ? 'active' : ''
                      }`}
                    >
                      {phase}
                    </span>
                  </Tip>
                </span>
              );
            })}
          </div>
          <div className="opt-progress-track">
            <div className="opt-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="opt-progress-text">
            {PHASE_NAMES[progress.phase]} — {progressPct}%
            {progress.estimatedSecondsLeft > 0 && ` | ~${Math.ceil(progress.estimatedSecondsLeft)}s kaldi`}
            {progress.bestSoFar && ` | En iyi: ${progress.bestSoFar.fitness.toFixed(1)}`}
          </div>
        </div>
      )}

      {/* Results table */}
      {sorted.length > 0 ? (
        <div className="opt-results">
          <table className="opt-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Strateji</th>
                <th className={sortKey === 'totalTrades' ? 'sorted' : ''} onClick={() => handleSort('totalTrades')}>
                  <Tip text="Toplam alis-satis islemi sayisi.">Islem{arrow('totalTrades')}</Tip>
                </th>
                <th className={sortKey === 'winRate' ? 'sorted' : ''} onClick={() => handleSort('winRate')}>
                  <Tip text="Karla kapanan islemlerin orani.">Kazanma{arrow('winRate')}</Tip>
                </th>
                <th className={sortKey === 'sharpeRatio' ? 'sorted' : ''} onClick={() => handleSort('sharpeRatio')}>
                  <Tip text="Risk-ayarli getiri olcusu. 1+ iyi, 2+ cok iyi.">Sharpe{arrow('sharpeRatio')}</Tip>
                </th>
                <th className={sortKey === 'maxDrawdown' ? 'sorted' : ''} onClick={() => handleSort('maxDrawdown')}>
                  <Tip text="En buyuk kayip yuzdesi.">MaksDD{arrow('maxDrawdown')}</Tip>
                </th>
                <th className={sortKey === 'profitFactor' ? 'sorted' : ''} onClick={() => handleSort('profitFactor')}>
                  <Tip text="Toplam kazanc / toplam kayip.">KarFakt{arrow('profitFactor')}</Tip>
                </th>
                <th className={sortKey === 'totalReturn' ? 'sorted' : ''} onClick={() => handleSort('totalReturn')}>
                  <Tip text="Birikimli toplam getiri.">Toplam{arrow('totalReturn')}</Tip>
                </th>
                <th
                  className={sortKey === 'robustnessGrade' ? 'sorted' : ''}
                  onClick={() => handleSort('robustnessGrade')}
                >
                  <Tip text="Walk-Forward saglammlik notu (A-F).">Saglam{arrow('robustnessGrade')}</Tip>
                </th>
                <th
                  className={sortKey === 'monteCarloScore' ? 'sorted' : ''}
                  onClick={() => handleSort('monteCarloScore')}
                >
                  <Tip text="Monte Carlo guven skoru. %70+ strateji gercek, altiysa sans eseri olabilir.">
                    MC{arrow('monteCarloScore')}
                  </Tip>
                </th>
                <th className={sortKey === 'fitness' ? 'sorted' : ''} onClick={() => handleSort('fitness')}>
                  <Tip text="Genel performans skoru (0-100). 8 metrigin agirlikli bilesimi.">
                    Skor{arrow('fitness')}
                  </Tip>
                </th>
                <th>
                  <Tip text="2 strateji secerek yan yana karsilastirin. Once bir satirdaki VS butonuna, sonra ikinci satirdakine tiklayin.">
                    VS
                  </Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const rank = i + 1;
                const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                const isExpanded = expandedRow === i;
                const isComparing = compareA === i || compareB === i;
                return (
                  <Fragment key={i}>
                    <tr
                      className={`${isExpanded ? 'expanded' : ''} ${isComparing ? 'comparing' : ''}`}
                      onClick={() => setExpandedRow(isExpanded ? null : i)}
                      title="Tiklayarak detaylari gor"
                    >
                      <td>
                        <span className={`opt-rank ${rankClass}`}>{rank}</span>
                      </td>
                      <td className="strategy-label" title={r.label}>
                        <SourceBadge source={r.source} /> {r.label}
                      </td>
                      <td>{r.inSample.totalTrades}</td>
                      <td style={{ color: colorFor(r.inSample.winRate, 0.5) }}>{pct(r.inSample.winRate)}</td>
                      <td style={{ color: colorFor(r.inSample.sharpeRatio) }}>{num(r.inSample.sharpeRatio)}</td>
                      <td style={{ color: '#ef5350' }}>{pct(r.inSample.maxDrawdown)}</td>
                      <td style={{ color: colorFor(r.inSample.profitFactor, 1) }}>{pf(r.inSample.profitFactor)}</td>
                      <td style={{ color: colorFor(r.inSample.totalReturn) }}>{pct(r.inSample.totalReturn)}</td>
                      <td>
                        {r.outOfSample ? (
                          <span className="opt-robustness-wrap">
                            <RobustnessBadge grade={r.robustnessGrade} />
                          </span>
                        ) : (
                          <RobustnessBadge grade={null} />
                        )}
                      </td>
                      <td>
                        <MCBadge score={r.monteCarloScore} />
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.fitness.toFixed(1)}</td>
                      <td>
                        <button
                          className={`opt-vs-btn ${isComparing ? 'active' : ''}`}
                          onClick={(e) => handleCompareToggle(i, e)}
                          title="Karsilastirmaya ekle"
                        >
                          VS
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="opt-detail-row">
                        <td colSpan={12}>{renderDetailPanel(r)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : state === 'idle' ? (
        <div className="opt-empty">
          <div className="opt-empty-icon">{'\u{1F50D}'}</div>
          <div className="opt-empty-text">Gelismis Sinyal Optimizatoru</div>
          <div className="opt-empty-hint">
            5 fazli optimizasyon: Grid arama, genetik algoritma (adaptive mutation + tournament selection),
            kombinasyonlar, walk-forward dogrulama ve Monte Carlo guven testi. Kelly, Recovery Factor, Ulcer Index ve
            Sharpe ile overfitting riski dusuk stratejiler bulur.
          </div>
        </div>
      ) : null}
    </div>
  );
}

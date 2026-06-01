import { useMemo, useState, lazy, Suspense } from 'react';
import type { OHLCVData } from '../../api/borsaApi';
import type {
  SignalConfig,
  PositionMode,
  RSISignalConfig,
  MACDSignalConfig,
  BollingerSignalConfig,
  StochRSISignalConfig,
  ADXSignalConfig,
  SuperTrendSignalConfig,
  IchimokuSignalConfig,
  OBVSignalConfig,
} from '../../utils/signalDetection';
import { computeCombinedSignals, pairTrades } from '../../utils/signalDetection';
import type { EnhancedTradeStats } from '../../utils/optimizerTypes';
import { computeEnhancedStats } from '../../utils/optimizerMetrics';
import Tip from './Tip';
import OptimizerPanel from './OptimizerPanel';
import { SignalCombinator } from './SignalCombinator';
import { useSavedConfigs } from '../../hooks/useSavedConfigs';
import './SignalPanel.css';

const MLDashboard = lazy(() => import('../MLDashboard/MLDashboard'));
const SavedPanel = lazy(() => import('./SavedPanel'));

interface Props {
  data: OHLCVData[];
  symbol: string;
  config: SignalConfig;
  onConfigChange: (config: SignalConfig) => void;
  dateRange: { start?: string; end?: string };
  onDateRangeChange: (range: { start?: string; end?: string }) => void;
}

function pct(v: number): string {
  return (v * 100).toFixed(2) + '%';
}
function pf(v: number): string {
  return isFinite(v) ? v.toFixed(2) : '\u221e';
}

/* helpers */
function updateRSI(config: SignalConfig, patch: Partial<RSISignalConfig>): SignalConfig {
  return { ...config, rsi: { ...config.rsi, ...patch } };
}
function updateMACD(config: SignalConfig, patch: Partial<MACDSignalConfig>): SignalConfig {
  return { ...config, macd: { ...config.macd, ...patch } };
}
function updateBB(config: SignalConfig, patch: Partial<BollingerSignalConfig>): SignalConfig {
  return { ...config, bollinger: { ...config.bollinger, ...patch } };
}
function updateSR(config: SignalConfig, patch: Partial<StochRSISignalConfig>): SignalConfig {
  return { ...config, stochRsi: { ...config.stochRsi, ...patch } };
}
function updateADX(config: SignalConfig, patch: Partial<ADXSignalConfig>): SignalConfig {
  return { ...config, adx: { ...config.adx, ...patch } };
}
function updateST(config: SignalConfig, patch: Partial<SuperTrendSignalConfig>): SignalConfig {
  return { ...config, supertrend: { ...config.supertrend, ...patch } };
}
function updateICH(config: SignalConfig, patch: Partial<IchimokuSignalConfig>): SignalConfig {
  return { ...config, ichimoku: { ...config.ichimoku, ...patch } };
}
function updateOBV(config: SignalConfig, patch: Partial<OBVSignalConfig>): SignalConfig {
  return { ...config, obv: { ...config.obv, ...patch } };
}

function Num({
  value,
  onChange,
  min,
  max,
  width,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  width?: number;
}) {
  return (
    <input
      type="number"
      className="sp-num"
      value={value}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
    />
  );
}

function Tag({ label, children, desc }: { label: string; children: React.ReactNode; desc?: string }) {
  const inner = (
    <span className="sp-tag">
      <span className="sp-tag-label">{label}</span>
      {children}
    </span>
  );
  return desc ? <Tip text={desc}>{inner}</Tip> : inner;
}

function Cond({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  desc?: string;
}) {
  const inner = (
    <label className={`sp-cond ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
  return desc ? <Tip text={desc}>{inner}</Tip> : inner;
}

const POSITION_MODE_OPTIONS: { value: PositionMode; label: string }[] = [
  { value: 'long-only', label: 'UZUN' },
  { value: 'short-only', label: 'KISA' },
  { value: 'both', label: 'IKI YON' },
];

export default function SignalPanel({ data, symbol, config, onConfigChange, dateRange, onDateRangeChange }: Props) {
  const [activeTab, setActiveTab] = useState<'signals' | 'optimizer' | 'ml' | 'saved'>('signals');
  const { configs: savedConfigs, saveConfig, removeConfig } = useSavedConfigs();

  const stats = useMemo<EnhancedTradeStats>(() => {
    const empty: EnhancedTradeStats = {
      trades: [],
      totalTrades: 0,
      winRate: 0,
      avgReturn: 0,
      profitFactor: 0,
      maxWin: 0,
      maxLoss: 0,
      totalReturn: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      avgBarsHeld: 0,
      expectancy: 0,
      kellyFraction: 0,
      recoveryFactor: 0,
      ulcerIndex: 0,
      equityCurve: [1],
    };
    if (data.length < 30) return empty;
    const combined = computeCombinedSignals(data, config);
    const basic = pairTrades(combined, data, dateRange.start, dateRange.end, config.positionMode);
    if (basic.totalTrades === 0) return empty;
    return computeEnhancedStats(basic.trades, 0);
  }, [data, config, dateRange]);

  const { rsi, macd, bollinger, stochRsi, adx, supertrend, ichimoku, obv } = config;

  return (
    <div className="signal-panel">
      {/* Top bar */}
      <div className="sp-top-bar">
        <div className="sp-position-mode">
          {POSITION_MODE_OPTIONS.map((opt) => (
            <Tip
              key={opt.value}
              text={
                opt.value === 'long-only'
                  ? 'Sadece uzun pozisyon (AL-SAT)'
                  : opt.value === 'short-only'
                    ? 'Sadece kisa pozisyon (aciga satis)'
                    : 'Hem uzun hem kisa pozisyon'
              }
            >
              <button
                className={`sp-mode-btn ${config.positionMode === opt.value ? 'active' : ''}`}
                onClick={() => onConfigChange({ ...config, positionMode: opt.value })}
              >
                {opt.label}
              </button>
            </Tip>
          ))}
        </div>
        <Tip text="Tarih araligi filtresi.">
          <div className="sp-date-range">
            <input
              type="date"
              value={dateRange.start ?? ''}
              onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value || undefined })}
            />
            <span className="sp-date-sep">-</span>
            <input
              type="date"
              value={dateRange.end ?? ''}
              onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value || undefined })}
            />
            {(dateRange.start || dateRange.end) && (
              <button className="sp-clear-dates" onClick={() => onDateRangeChange({})}>
                &#10005;
              </button>
            )}
          </div>
        </Tip>
        <div className="sp-symbol">{symbol}</div>
        <Tip text="Mevcut indikator ayarini kaydet.">
          <button className="sp-save-btn" onClick={() => saveConfig(config, symbol)}>
            Kaydet
          </button>
        </Tip>
      </div>

      {/* Tab bar */}
      <div className="sp-tab-bar">
        <button className={`sp-tab ${activeTab === 'signals' ? 'active' : ''}`} onClick={() => setActiveTab('signals')}>
          Islemler
        </button>
        <button
          className={`sp-tab ${activeTab === 'optimizer' ? 'active' : ''}`}
          onClick={() => setActiveTab('optimizer')}
        >
          Optimizator
        </button>
        <button className={`sp-tab ${activeTab === 'ml' ? 'active' : ''}`} onClick={() => setActiveTab('ml')}>
          ML Tahmin
        </button>
        <button className={`sp-tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>
          Kayitli{savedConfigs.length > 0 && <span className="sp-tab-badge">{savedConfigs.length}</span>}
        </button>
      </div>

      <OptimizerPanel
        data={data}
        dateRange={dateRange}
        onApplyConfig={(cfg) => {
          onConfigChange(cfg);
          setActiveTab('signals');
        }}
        hidden={activeTab !== 'optimizer'}
      />

      <Suspense fallback={<div className="sp-no-trades">ML paneli yukleniyor...</div>}>
        <MLDashboard
          data={data}
          dateRange={dateRange}
          hidden={activeTab !== 'ml'}
        />
      </Suspense>

      <Suspense fallback={<div className="sp-no-trades">Kayitli panel yukleniyor...</div>}>
        <SavedPanel
          configs={savedConfigs}
          currentSymbol={symbol}
          onRemoveConfig={removeConfig}
          onApplyConfig={(cfg) => {
            onConfigChange(cfg);
            setActiveTab('signals');
          }}
          hidden={activeTab !== 'saved'}
        />
      </Suspense>

      <div className="sp-body" style={activeTab !== 'signals' ? { display: 'none' } : undefined}>
        <SignalCombinator
          featureImportance={null}
          onApplyConfig={onConfigChange}
          data={data}
          dateRange={dateRange}
        />
        <div className="sp-indicators">
          {/* RSI */}
          <div className={`sp-ind ${rsi.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="RSI (Relative Strength Index): Momentum osilatoru. 0-100 arasi. 30 alti asiri satim, 70 ustu asiri alim.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={rsi.enabled}
                    onChange={() => onConfigChange(updateRSI(config, { enabled: !rsi.enabled }))}
                  />
                  RSI
                </label>
              </Tip>
              {rsi.enabled && (
                <div className="sp-ind-params">
                  <Tag label="P" desc="RSI periyodu">
                    <Num
                      value={rsi.period}
                      onChange={(v) => onConfigChange(updateRSI(config, { period: v }))}
                      min={2}
                      max={100}
                      width={36}
                    />
                  </Tag>
                  <Tag label="AS" desc="Asiri satim seviyesi">
                    <Num
                      value={rsi.oversold}
                      onChange={(v) => onConfigChange(updateRSI(config, { oversold: v }))}
                      min={0}
                      max={50}
                      width={36}
                    />
                  </Tag>
                  <Tag label="AA" desc="Asiri alim seviyesi">
                    <Num
                      value={rsi.overbought}
                      onChange={(v) => onConfigChange(updateRSI(config, { overbought: v }))}
                      min={50}
                      max={100}
                      width={36}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {rsi.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={rsi.conditions.threshold}
                  onChange={() =>
                    onConfigChange(
                      updateRSI(config, { conditions: { ...rsi.conditions, threshold: !rsi.conditions.threshold } }),
                    )
                  }
                  label="Esik"
                  desc="RSI < asiri satim = AL, RSI > asiri alim = SAT"
                />
                <Cond
                  checked={rsi.conditions.midLine}
                  onChange={() =>
                    onConfigChange(
                      updateRSI(config, { conditions: { ...rsi.conditions, midLine: !rsi.conditions.midLine } }),
                    )
                  }
                  label="Orta Cizgi"
                  desc="RSI > 50 = AL, < 50 = SAT"
                />
              </div>
            )}
          </div>

          {/* MACD */}
          <div className={`sp-ind ${macd.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="MACD: Trend ve momentum gostergesi. Histogram + sinyal kesisimi.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={macd.enabled}
                    onChange={() => onConfigChange(updateMACD(config, { enabled: !macd.enabled }))}
                  />
                  MACD
                </label>
              </Tip>
              {macd.enabled && (
                <div className="sp-ind-params">
                  <Tag label="H" desc="Hizli EMA">
                    <Num
                      value={macd.fast}
                      onChange={(v) => onConfigChange(updateMACD(config, { fast: v }))}
                      min={2}
                      max={100}
                      width={36}
                    />
                  </Tag>
                  <Tag label="Y" desc="Yavas EMA">
                    <Num
                      value={macd.slow}
                      onChange={(v) => onConfigChange(updateMACD(config, { slow: v }))}
                      min={5}
                      max={200}
                      width={36}
                    />
                  </Tag>
                  <Tag label="S" desc="Sinyal periyodu">
                    <Num
                      value={macd.signalPeriod}
                      onChange={(v) => onConfigChange(updateMACD(config, { signalPeriod: v }))}
                      min={2}
                      max={50}
                      width={36}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {macd.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={macd.conditions.histogram}
                  onChange={() =>
                    onConfigChange(
                      updateMACD(config, { conditions: { ...macd.conditions, histogram: !macd.conditions.histogram } }),
                    )
                  }
                  label="Histogram"
                  desc="Histogram > 0 = AL, < 0 = SAT"
                />
                <Cond
                  checked={macd.conditions.macdVsSignal}
                  onChange={() =>
                    onConfigChange(
                      updateMACD(config, {
                        conditions: { ...macd.conditions, macdVsSignal: !macd.conditions.macdVsSignal },
                      }),
                    )
                  }
                  label="MACD/Sinyal"
                  desc="MACD > Sinyal = AL, < Sinyal = SAT"
                />
                <Cond
                  checked={macd.conditions.macdVsZero}
                  onChange={() =>
                    onConfigChange(
                      updateMACD(config, {
                        conditions: { ...macd.conditions, macdVsZero: !macd.conditions.macdVsZero },
                      }),
                    )
                  }
                  label="Sifir Gecisi"
                  desc="MACD > 0 = AL, < 0 = SAT"
                />
              </div>
            )}
          </div>

          {/* Bollinger Bands */}
          <div className={`sp-ind ${bollinger.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="Bollinger Bands: SMA +/- standart sapma. Bant kirilimi ve squeeze tespiti.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={bollinger.enabled}
                    onChange={() => onConfigChange(updateBB(config, { enabled: !bollinger.enabled }))}
                  />
                  Bollinger
                </label>
              </Tip>
              {bollinger.enabled && (
                <div className="sp-ind-params">
                  <Tag label="P" desc="SMA periyodu">
                    <Num
                      value={bollinger.period}
                      onChange={(v) => onConfigChange(updateBB(config, { period: v }))}
                      min={5}
                      max={100}
                      width={36}
                    />
                  </Tag>
                  <Tag label="M" desc="Carpan (standart sapma)">
                    <Num
                      value={bollinger.mult}
                      onChange={(v) => onConfigChange(updateBB(config, { mult: v }))}
                      min={0.5}
                      max={5}
                      width={36}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {bollinger.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={bollinger.conditions.bandBreak}
                  onChange={() =>
                    onConfigChange(
                      updateBB(config, {
                        conditions: { ...bollinger.conditions, bandBreak: !bollinger.conditions.bandBreak },
                      }),
                    )
                  }
                  label="Bant Kirilimi"
                  desc="Fiyat alt bant altinda = AL, ust bant ustunde = SAT"
                />
                <Cond
                  checked={bollinger.conditions.pctB}
                  onChange={() =>
                    onConfigChange(
                      updateBB(config, { conditions: { ...bollinger.conditions, pctB: !bollinger.conditions.pctB } }),
                    )
                  }
                  label="%B"
                  desc="%B < 0.2 = AL, > 0.8 = SAT"
                />
              </div>
            )}
          </div>

          {/* Stochastic RSI */}
          <div className={`sp-ind ${stochRsi.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="Stochastic RSI: RSI'nin stokastigi. Daha hassas momentum osilatoru.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={stochRsi.enabled}
                    onChange={() => onConfigChange(updateSR(config, { enabled: !stochRsi.enabled }))}
                  />
                  Stoch RSI
                </label>
              </Tip>
              {stochRsi.enabled && (
                <div className="sp-ind-params">
                  <Tag label="R" desc="RSI periyodu">
                    <Num
                      value={stochRsi.rsiPeriod}
                      onChange={(v) => onConfigChange(updateSR(config, { rsiPeriod: v }))}
                      min={2}
                      max={50}
                      width={36}
                    />
                  </Tag>
                  <Tag label="S" desc="Stochastic periyodu">
                    <Num
                      value={stochRsi.stochPeriod}
                      onChange={(v) => onConfigChange(updateSR(config, { stochPeriod: v }))}
                      min={2}
                      max={50}
                      width={36}
                    />
                  </Tag>
                  <Tag label="K" desc="K yumusatma">
                    <Num
                      value={stochRsi.kSmooth}
                      onChange={(v) => onConfigChange(updateSR(config, { kSmooth: v }))}
                      min={1}
                      max={10}
                      width={28}
                    />
                  </Tag>
                  <Tag label="D" desc="D yumusatma">
                    <Num
                      value={stochRsi.dSmooth}
                      onChange={(v) => onConfigChange(updateSR(config, { dSmooth: v }))}
                      min={1}
                      max={10}
                      width={28}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {stochRsi.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={stochRsi.conditions.threshold}
                  onChange={() =>
                    onConfigChange(
                      updateSR(config, {
                        conditions: { ...stochRsi.conditions, threshold: !stochRsi.conditions.threshold },
                      }),
                    )
                  }
                  label="Esik"
                  desc="K < 20 = AL, K > 80 = SAT"
                />
                <Cond
                  checked={stochRsi.conditions.crossover}
                  onChange={() =>
                    onConfigChange(
                      updateSR(config, {
                        conditions: { ...stochRsi.conditions, crossover: !stochRsi.conditions.crossover },
                      }),
                    )
                  }
                  label="K/D Kesisimi"
                  desc="K > D = AL, K < D = SAT"
                />
              </div>
            )}
          </div>

          {/* ADX */}
          <div className={`sp-ind ${adx.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="ADX: Trend gucu gostergesi. 25+ guclu trend. +DI/-DI ile yon belirleme.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={adx.enabled}
                    onChange={() => onConfigChange(updateADX(config, { enabled: !adx.enabled }))}
                  />
                  ADX
                </label>
              </Tip>
              {adx.enabled && (
                <div className="sp-ind-params">
                  <Tag label="P" desc="ADX periyodu">
                    <Num
                      value={adx.period}
                      onChange={(v) => onConfigChange(updateADX(config, { period: v }))}
                      min={5}
                      max={50}
                      width={36}
                    />
                  </Tag>
                  <Tag label="E" desc="Trend esigi">
                    <Num
                      value={adx.trendThreshold}
                      onChange={(v) => onConfigChange(updateADX(config, { trendThreshold: v }))}
                      min={10}
                      max={50}
                      width={36}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {adx.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={adx.conditions.diCross}
                  onChange={() =>
                    onConfigChange(
                      updateADX(config, { conditions: { ...adx.conditions, diCross: !adx.conditions.diCross } }),
                    )
                  }
                  label="DI Kesisimi"
                  desc="+DI > -DI = AL, -DI > +DI = SAT"
                />
                <Cond
                  checked={adx.conditions.strongTrend}
                  onChange={() =>
                    onConfigChange(
                      updateADX(config, {
                        conditions: { ...adx.conditions, strongTrend: !adx.conditions.strongTrend },
                      }),
                    )
                  }
                  label="Guclu Trend"
                  desc="ADX > esik oldugunda sinyal uret"
                />
              </div>
            )}
          </div>

          {/* SuperTrend */}
          <div className={`sp-ind ${supertrend.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="SuperTrend: ATR tabanli trend takip. Yesil = AL, Kirmizi = SAT.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={supertrend.enabled}
                    onChange={() => onConfigChange(updateST(config, { enabled: !supertrend.enabled }))}
                  />
                  SuperTrend
                </label>
              </Tip>
              {supertrend.enabled && (
                <div className="sp-ind-params">
                  <Tag label="ATR" desc="ATR periyodu">
                    <Num
                      value={supertrend.atrPeriod}
                      onChange={(v) => onConfigChange(updateST(config, { atrPeriod: v }))}
                      min={5}
                      max={50}
                      width={36}
                    />
                  </Tag>
                  <Tag label="M" desc="Carpan">
                    <Num
                      value={supertrend.multiplier}
                      onChange={(v) => onConfigChange(updateST(config, { multiplier: v }))}
                      min={1}
                      max={10}
                      width={36}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {supertrend.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={supertrend.conditions.direction}
                  onChange={() =>
                    onConfigChange(updateST(config, { conditions: { direction: !supertrend.conditions.direction } }))
                  }
                  label="Yon"
                  desc="SuperTrend yonu: Yesil = AL, Kirmizi = SAT"
                />
              </div>
            )}
          </div>

          {/* Ichimoku */}
          <div className={`sp-ind ${ichimoku.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="Ichimoku Cloud: Coklu sinyal sistemi. Tenkan/Kijun kesisimi + Bulut konumu.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={ichimoku.enabled}
                    onChange={() => onConfigChange(updateICH(config, { enabled: !ichimoku.enabled }))}
                  />
                  Ichimoku
                </label>
              </Tip>
              {ichimoku.enabled && (
                <div className="sp-ind-params">
                  <Tag label="T" desc="Tenkan-sen periyodu">
                    <Num
                      value={ichimoku.tenkan}
                      onChange={(v) => onConfigChange(updateICH(config, { tenkan: v }))}
                      min={5}
                      max={50}
                      width={36}
                    />
                  </Tag>
                  <Tag label="K" desc="Kijun-sen periyodu">
                    <Num
                      value={ichimoku.kijun}
                      onChange={(v) => onConfigChange(updateICH(config, { kijun: v }))}
                      min={10}
                      max={100}
                      width={36}
                    />
                  </Tag>
                  <Tag label="S" desc="Senkou Span B periyodu">
                    <Num
                      value={ichimoku.senkouB}
                      onChange={(v) => onConfigChange(updateICH(config, { senkouB: v }))}
                      min={20}
                      max={200}
                      width={42}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {ichimoku.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={ichimoku.conditions.tkCross}
                  onChange={() =>
                    onConfigChange(
                      updateICH(config, {
                        conditions: { ...ichimoku.conditions, tkCross: !ichimoku.conditions.tkCross },
                      }),
                    )
                  }
                  label="TK Kesisimi"
                  desc="Tenkan > Kijun = AL, < = SAT"
                />
                <Cond
                  checked={ichimoku.conditions.priceVsCloud}
                  onChange={() =>
                    onConfigChange(
                      updateICH(config, {
                        conditions: { ...ichimoku.conditions, priceVsCloud: !ichimoku.conditions.priceVsCloud },
                      }),
                    )
                  }
                  label="Fiyat/Bulut"
                  desc="Fiyat bulut ustunde = AL, altinda = SAT"
                />
                <Cond
                  checked={ichimoku.conditions.cloudColor}
                  onChange={() =>
                    onConfigChange(
                      updateICH(config, {
                        conditions: { ...ichimoku.conditions, cloudColor: !ichimoku.conditions.cloudColor },
                      }),
                    )
                  }
                  label="Bulut Rengi"
                  desc="Span A > Span B = AL (yesil bulut)"
                />
              </div>
            )}
          </div>

          {/* OBV */}
          <div className={`sp-ind ${obv.enabled ? '' : 'off'}`}>
            <div className="sp-ind-row">
              <Tip text="OBV (On Balance Volume): Kumulatif hacim gostergesi. Hacim ile fiyat teyidi.">
                <label className="sp-ind-name">
                  <input
                    type="checkbox"
                    checked={obv.enabled}
                    onChange={() => onConfigChange(updateOBV(config, { enabled: !obv.enabled }))}
                  />
                  OBV
                </label>
              </Tip>
              {obv.enabled && (
                <div className="sp-ind-params">
                  <Tag label="EMA" desc="OBV EMA periyodu">
                    <Num
                      value={obv.emaPeriod}
                      onChange={(v) => onConfigChange(updateOBV(config, { emaPeriod: v }))}
                      min={5}
                      max={100}
                      width={36}
                    />
                  </Tag>
                </div>
              )}
            </div>
            {obv.enabled && (
              <div className="sp-cond-row">
                <Cond
                  checked={obv.conditions.obvVsEma}
                  onChange={() =>
                    onConfigChange(updateOBV(config, { conditions: { obvVsEma: !obv.conditions.obvVsEma } }))
                  }
                  label="OBV/EMA"
                  desc="OBV > EMA = AL, < EMA = SAT"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── KPIs ── */}
        {stats.totalTrades === 0 ? (
          <div className="sp-no-trades">Islem bulunamadi. En az bir indikator ve bir kosul secin.</div>
        ) : (
          <>
            <div className="sp-kpi-strip">
              <Tip text="Toplam AL-SAT islem cifti sayisi.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Islem</span>
                  <span className="sp-kpi-value">{stats.totalTrades}</span>
                </div>
              </Tip>
              <Tip text="Karla kapanan islemlerin orani.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Kazanma</span>
                  <span className="sp-kpi-value" style={{ color: stats.winRate >= 0.5 ? '#26a69a' : '#ef5350' }}>
                    {pct(stats.winRate)}
                  </span>
                </div>
              </Tip>
              <Tip text="Kumulatif toplam getiri.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Toplam</span>
                  <span className="sp-kpi-value" style={{ color: stats.totalReturn >= 0 ? '#26a69a' : '#ef5350' }}>
                    {pct(stats.totalReturn)}
                  </span>
                </div>
              </Tip>
              <Tip text="Toplam kar / Toplam zarar orani. 1'in ustu karli.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Kar Fakt.</span>
                  <span className="sp-kpi-value" style={{ color: stats.profitFactor >= 1 ? '#26a69a' : '#ef5350' }}>
                    {pf(stats.profitFactor)}
                  </span>
                </div>
              </Tip>
              <Tip text="Yillik risk-ayarli getiri. 1+ iyi, 2+ cok iyi.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Sharpe</span>
                  <span className="sp-kpi-value" style={{ color: stats.sharpeRatio >= 1 ? '#26a69a' : '#ef5350' }}>
                    {pf(stats.sharpeRatio)}
                  </span>
                </div>
              </Tip>
              <Tip text="Sadece negatif volatiliteye gore ayarlanmis getiri. Sharpe'den daha iyi asagi risk olcumu.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Sortino</span>
                  <span className="sp-kpi-value" style={{ color: stats.sortinoRatio >= 1 ? '#26a69a' : '#ef5350' }}>
                    {pf(stats.sortinoRatio)}
                  </span>
                </div>
              </Tip>
              <Tip text="Yillik getiri / Maksimum dususu orani.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Calmar</span>
                  <span className="sp-kpi-value" style={{ color: stats.calmarRatio >= 1 ? '#26a69a' : '#ef5350' }}>
                    {pf(stats.calmarRatio)}
                  </span>
                </div>
              </Tip>
              <Tip text="En buyuk tepe-dip dususu. Portfoy riski.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Maks DD</span>
                  <span className="sp-kpi-value" style={{ color: '#ef5350' }}>
                    {pct(stats.maxDrawdown)}
                  </span>
                </div>
              </Tip>
              <Tip text="Beklenen getiri = ortKar*kazanma - ortZarar*kaybetme.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Beklenti</span>
                  <span className="sp-kpi-value" style={{ color: stats.expectancy >= 0 ? '#26a69a' : '#ef5350' }}>
                    {pct(stats.expectancy)}
                  </span>
                </div>
              </Tip>
              <Tip text="Kelly kriteri: optimal pozisyon buyuklugu (0-1).">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Kelly</span>
                  <span className="sp-kpi-value">{pct(stats.kellyFraction)}</span>
                </div>
              </Tip>
              <Tip text="Toplam getiri / Maks dusus. Toparlanma gucu.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Toparl.</span>
                  <span className="sp-kpi-value" style={{ color: stats.recoveryFactor >= 1 ? '#26a69a' : '#ef5350' }}>
                    {pf(stats.recoveryFactor)}
                  </span>
                </div>
              </Tip>
              <Tip text="Ust uste kazanc / kayip serisi.">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Seri K/Z</span>
                  <span className="sp-kpi-value">
                    <span style={{ color: '#26a69a' }}>{stats.consecutiveWins}</span>/
                    <span style={{ color: '#ef5350' }}>{stats.consecutiveLosses}</span>
                  </span>
                </div>
              </Tip>
              <Tip text="Ortalama islem suresi (bar sayisi).">
                <div className="sp-kpi">
                  <span className="sp-kpi-label">Ort. Sure</span>
                  <span className="sp-kpi-value">{stats.avgBarsHeld.toFixed(0)}</span>
                </div>
              </Tip>
            </div>

            <div className="sp-trade-table-wrap">
              <table className="sp-trade-table">
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
                  {[...stats.trades].reverse().map((t, i) => (
                    <tr key={i}>
                      <td>
                        <span className={`sp-pos-badge ${t.positionType}`}>
                          {t.positionType === 'long' ? 'U' : 'K'}
                        </span>
                      </td>
                      <td>{t.entryDate}</td>
                      <td>{t.entryPrice.toFixed(2)}</td>
                      <td>{t.exitDate}</td>
                      <td>{t.exitPrice.toFixed(2)}</td>
                      <td style={{ color: t.returnPct >= 0 ? '#26a69a' : '#ef5350', fontWeight: 600 }}>
                        {pct(t.returnPct)}
                      </td>
                      <td>{t.barsHeld}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

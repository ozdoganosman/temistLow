import { useState, useCallback } from 'react';
import type { OHLCVData, MLTrainResponse } from '../../api/borsaApi';
import { trainMLModel, clearMLCache } from '../../api/borsaApi';
import { StatusCard } from './StatusCard';
import { TrainControls } from './TrainControls';
import { BacktestResults } from './BacktestResults';
import { ModelDetails } from './ModelDetails';
import { SettingsDrawer, DEFAULT_SETTINGS } from './SettingsDrawer';
import type { MLSettings } from './SettingsDrawer';
import './MLDashboard.css';

interface Props {
  data: OHLCVData[];
  dateRange: { start?: string; end?: string };
  hidden?: boolean;
}

export default function MLDashboard({ data, dateRange, hidden }: Props) {
  const [mlResult, setMlResult] = useState<MLTrainResponse | null>(null);
  const [training, setTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<MLSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [positionMode, setPositionMode] = useState<string>('both');

  const handleTrain = useCallback(async (preset: 'fast' | 'balanced' | 'deep') => {
    if (data.length < 100) {
      setError('En az 100 bar veri gerekli.');
      return;
    }
    setTraining(true);
    setProgress(0);
    setEta('');
    setError(null);
    const startTime = Date.now();

    const presetMap = { fast: 10, balanced: 30, deep: 50 };
    const walksMap = { fast: 1, balanced: 2, deep: 3 };
    const etaMap = { fast: 30, balanced: 120, deep: 300 };

    const estimatedMs = etaMap[preset] * 1000;
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(Math.round((elapsed / estimatedMs) * 95), 95);
      setProgress(pct);
      const remaining = Math.max(0, estimatedMs - elapsed);
      const secs = Math.ceil(remaining / 1000);
      setEta(secs >= 60 ? `~${Math.ceil(secs / 60)}dk` : `~${secs}sn`);
    }, 500);

    try {
      let filtered = data;
      if (dateRange.start || dateRange.end) {
        filtered = data.filter((d) => {
          if (dateRange.start && d.date < dateRange.start) return false;
          if (dateRange.end && d.date > dateRange.end) return false;
          return true;
        });
      }

      const result = await trainMLModel({
        ohlcv: filtered,
        layers: {
          short_term: {
            forward_period: settings.shortForwardPeriod,
            threshold: settings.shortThreshold,
            threshold_short: settings.shortThresholdShort,
          },
          medium_term: {
            forward_period: settings.mediumForwardPeriod,
            threshold: settings.mediumThreshold,
          },
          risk: { enabled: settings.riskEnabled },
        },
        models: {
          short_term_model: settings.shortTermModel,
          medium_term_model: settings.mediumTermModel,
          ensemble: settings.ensemble,
          mlp_weight: settings.mlpWeight,
        },
        training: {
          preset,
          train_ratio: settings.trainRatio,
          n_walks: walksMap[preset],
          optuna_trials: presetMap[preset],
          feature_select_k: settings.featureSelectK,
          drop_corr_threshold: settings.dropCorrThreshold,
        },
        position_mode: positionMode,
        confidence_threshold: settings.confidenceThreshold,
      });
      setMlResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(timer);
      setTraining(false);
      setProgress(100);
      setEta('');
    }
  }, [data, dateRange, settings, positionMode]);

  const handleClearCache = useCallback(async () => {
    await clearMLCache();
    setMlResult(null);
    setError(null);
  }, []);

  if (hidden) return null;

  return (
    <div className="ml-dashboard">
      <div className="ml-dashboard-header">
        <h3>ML Analiz</h3>
        <div className="ml-dashboard-header-actions">
          {mlResult && (
            <button
              className="mld-clear-btn"
              onClick={handleClearCache}
              title="Model onbellegi temizle"
            >
              Temizle
            </button>
          )}
          <button
            className="mld-settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="ML Ayarlari"
          >
            &#9881;
          </button>
        </div>
      </div>

      <StatusCard
        layers={mlResult?.layers ?? null}
        metaDecision={mlResult?.meta_decision ?? null}
      />

      <TrainControls
        onTrain={handleTrain}
        training={training}
        progress={progress}
        eta={eta}
        error={error}
        warnings={mlResult?.warnings ?? []}
        positionMode={positionMode}
        onPositionModeChange={setPositionMode}
      />

      <BacktestResults
        stats={mlResult?.stats ?? null}
        equityCurve={mlResult?.layers?.short_term?.equity_curve ?? []}
        trades={mlResult?.trades ?? []}
        walkForwardResults={mlResult?.walk_forward_results ?? []}
      />

      <ModelDetails
        layers={mlResult?.layers ?? null}
        trainingMeta={mlResult?.training_meta ?? null}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}

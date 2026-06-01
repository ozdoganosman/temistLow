import './MLDashboard.css';

// ── Props ──────────────────────────────────────────────

interface TrainControlsProps {
  onTrain: (preset: 'fast' | 'balanced' | 'deep') => void;
  training: boolean;
  progress: number;          // 0-100
  eta: string;               // e.g. "45sn" or ""
  error: string | null;
  warnings: string[];
  positionMode: string;
  onPositionModeChange: (mode: string) => void;
}

// ── Constants (Turkish) ────────────────────────────────

type PresetKey = 'fast' | 'balanced' | 'deep';

interface PresetDef {
  key: PresetKey;
  label: string;
}

const PRESETS: PresetDef[] = [
  { key: 'fast', label: 'Hizli' },
  { key: 'balanced', label: 'Dengeli' },
  { key: 'deep', label: 'Derin' },
];

const POSITION_MODES: { value: string; label: string }[] = [
  { value: 'long-only', label: 'Long' },
  { value: 'short-only', label: 'Short' },
  { value: 'both', label: '2 Yon' },
];

// ── Component ──────────────────────────────────────────

export function TrainControls({
  onTrain,
  training,
  progress,
  eta,
  error,
  warnings,
  positionMode,
  onPositionModeChange,
}: TrainControlsProps) {
  // Track active preset for visual highlight
  // Since preset selection triggers onTrain immediately,
  // we use an internal ref-like state just for button highlight
  const handlePreset = (key: PresetKey) => {
    onTrain(key);
  };

  return (
    <div className="mld-train-controls">
      {/* Top row: presets + position dropdown */}
      <div className="mld-train-controls__top-row">
        <div className="mld-train-controls__presets">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`mld-preset-btn`}
              onClick={() => handlePreset(p.key)}
              disabled={training}
              title={p.label}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mld-train-controls__position">
          <span className="mld-train-controls__position-label">
            Pozisyon:
          </span>
          <select
            className="mld-train-controls__position-select"
            value={positionMode}
            onChange={(e) => onPositionModeChange(e.target.value)}
            disabled={training}
          >
            {POSITION_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bottom row: progress bar + train button */}
      <div className="mld-train-controls__bottom-row">
        {training && (
          <div className="mld-progress-bar">
            <div className="mld-progress-bar__track">
              <div
                className="mld-progress-bar__fill mld-progress-bar__fill--active"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
            <div className="mld-progress-bar__info">
              <span className="mld-progress-bar__pct">
                %{progress.toFixed(0)}
              </span>
              {eta && (
                <span className="mld-progress-bar__eta">
                  Kalan: {eta}
                </span>
              )}
            </div>
          </div>
        )}

        <button
          className={`mld-train-btn ${training ? 'mld-train-btn--training' : ''}`}
          onClick={() => onTrain('balanced')}
          disabled={training}
        >
          {training ? 'Egitiliyor...' : 'Egit'}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mld-error">
          <span className="mld-error__icon">!</span>
          <span className="mld-error__text">{error}</span>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mld-warnings-list">
          {warnings.map((w, i) => (
            <div key={i} className="mld-warning">
              <span className="mld-warning__icon">!</span>
              <span className="mld-warning__text">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef } from 'react';

// ── Types ────────────────────────────────────

export interface MLSettings {
  shortTermModel: 'lightgbm' | 'xgboost';
  mediumTermModel: 'xgboost+mlp' | 'xgboost' | 'lightgbm';
  ensemble: boolean;
  mlpWeight: number;
  shortForwardPeriod: number;
  mediumForwardPeriod: number;
  shortThreshold: number;
  shortThresholdShort: number;
  mediumThreshold: number;
  nWalks: number;
  trainRatio: number;
  featureSelectK: number;
  dropCorrThreshold: number;
  confidenceThreshold: number;
  riskEnabled: boolean;
}

export const DEFAULT_SETTINGS: MLSettings = {
  shortTermModel: 'lightgbm',
  mediumTermModel: 'xgboost+mlp',
  ensemble: true,
  mlpWeight: 0.4,
  shortForwardPeriod: 5,
  mediumForwardPeriod: 20,
  shortThreshold: 0.02,
  shortThresholdShort: 0.02,
  mediumThreshold: 0.03,
  nWalks: 2,
  trainRatio: 0.7,
  featureSelectK: 30,
  dropCorrThreshold: 0.90,
  confidenceThreshold: 0.55,
  riskEnabled: true,
};

// ── Props ────────────────────────────────────

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: MLSettings;
  onSettingsChange: (settings: MLSettings) => void;
}

// ── Styles ───────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    zIndex: 9998,
    transition: 'opacity 0.25s ease',
  },
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 360,
    maxWidth: '100vw',
    background: 'var(--bg-primary, #0a0e17)',
    borderLeft: '1px solid var(--border-primary, #1a1e2e)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-primary, #1a1e2e)',
    background: 'var(--bg-secondary, #0f1320)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary, #e0e3eb)',
    letterSpacing: '0.02em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #6a6e7e)',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    padding: '4px 6px',
    borderRadius: 4,
    transition: 'color 0.15s, background 0.15s',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0 16px 0',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px 6px',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-secondary, #8a8e96)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border-primary, #1a1e2e)',
    background: 'var(--bg-tertiary, #141824)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    minHeight: 36,
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary, #8a8e96)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    minWidth: 100,
  },
  btnGroup: {
    display: 'flex',
    gap: 0,
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid var(--border-primary, #1a1e2e)',
  },
  btnGroupItem: {
    background: 'var(--bg-tertiary, #141824)',
    color: 'var(--text-secondary, #8a8e96)',
    border: 'none',
    borderRight: '1px solid var(--border-primary, #1a1e2e)',
    padding: '4px 10px',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  btnGroupItemActive: {
    background: 'var(--accent, #2962ff)',
    color: '#fff',
    borderColor: 'var(--accent, #2962ff)',
  },
  btnGroupItemLast: {
    borderRight: 'none',
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s ease',
    flexShrink: 0,
    border: 'none',
    padding: 0,
  },
  toggleThumb: {
    position: 'absolute' as const,
    top: 3,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  slider: {
    flex: 1,
    height: 4,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    background: 'var(--bg-tertiary, #141824)',
    borderRadius: 2,
    outline: 'none',
    cursor: 'pointer',
  },
  sliderValue: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--accent, #2962ff)',
    minWidth: 36,
    textAlign: 'right' as const,
  },
  numberInput: {
    width: 52,
    background: 'var(--bg-tertiary, #141824)',
    color: 'var(--text-primary, #e0e3eb)',
    border: '1px solid var(--border-primary, #1a1e2e)',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    textAlign: 'center' as const,
    outline: 'none',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--border-primary, #1a1e2e)',
    background: 'var(--bg-secondary, #0f1320)',
    flexShrink: 0,
  },
  footerBtnDefault: {
    background: 'transparent',
    color: 'var(--text-secondary, #8a8e96)',
    border: '1px solid var(--border-primary, #1a1e2e)',
    borderRadius: 4,
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  footerBtnClose: {
    background: 'var(--accent, #2962ff)',
    color: '#fff',
    border: '1px solid var(--accent, #2962ff)',
    borderRadius: 4,
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
};

// ── Sub-components ───────────────────────────

function ButtonGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={styles.btnGroup}>
      {options.map((opt, i) => {
        const isActive = opt.value === value;
        const isLast = i === options.length - 1;
        return (
          <button
            key={String(opt.value)}
            className="mld-settings-btn-group-item"
            style={{
              ...styles.btnGroupItem,
              ...(isActive ? styles.btnGroupItemActive : {}),
              ...(isLast ? styles.btnGroupItemLast : {}),
            }}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="mld-settings-toggle"
      style={{
        ...styles.toggleTrack,
        background: checked
          ? 'var(--accent, #2962ff)'
          : 'var(--border-secondary, #2a2e3e)',
      }}
      onClick={() => onChange(!checked)}
      type="button"
      aria-checked={checked}
      role="switch"
    >
      <span
        style={{
          ...styles.toggleThumb,
          left: checked ? 19 : 3,
        }}
      />
    </button>
  );
}

function SettingsSlider({
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div style={styles.sliderRow}>
      <input
        className="mld-settings-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.slider}
      />
      <span style={styles.sliderValue}>{format(value)}</span>
    </div>
  );
}

// ── Main Component ───────────────────────────

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onSettingsChange,
}: SettingsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const update = useCallback(
    <K extends keyof MLSettings>(key: K, value: MLSettings[K]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange],
  );

  const handleReset = useCallback(() => {
    onSettingsChange({ ...DEFAULT_SETTINGS });
  }, [onSettingsChange]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const showMlpWeight =
    settings.ensemble && settings.mediumTermModel === 'xgboost+mlp';

  return (
    <>
      {/* Backdrop */}
      <div
        className="mld-settings-backdrop"
        style={styles.backdrop}
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="mld-settings-drawer"
        style={{
          ...styles.drawer,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>ML Ayarları</span>
          <button
            className="mld-settings-close-btn"
            style={styles.closeBtn}
            onClick={onClose}
            title="Kapat"
          >
            {'\u00D7'}
          </button>
        </div>

        {/* Body */}
        <div className="mld-settings-body" style={styles.body}>
          {/* ── Section 1: Model Ayarları ── */}
          <div style={styles.sectionHeader}>Model Ayarları</div>

          <div style={styles.row}>
            <span style={styles.label}>Kısa Vade Modeli</span>
            <ButtonGroup
              options={[
                { value: 'lightgbm' as const, label: 'LightGBM' },
                { value: 'xgboost' as const, label: 'XGBoost' },
              ]}
              value={settings.shortTermModel}
              onChange={(v) => update('shortTermModel', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Orta Vade Modeli</span>
            <ButtonGroup
              options={[
                { value: 'xgboost+mlp' as const, label: 'XGBoost+MLP' },
                { value: 'xgboost' as const, label: 'XGBoost' },
                { value: 'lightgbm' as const, label: 'LightGBM' },
              ]}
              value={settings.mediumTermModel}
              onChange={(v) => update('mediumTermModel', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Ensemble</span>
            <Toggle
              checked={settings.ensemble}
              onChange={(v) => update('ensemble', v)}
            />
          </div>

          {showMlpWeight && (
            <div style={styles.row}>
              <span style={styles.label}>MLP Ağırlığı</span>
              <SettingsSlider
                min={0.1}
                max={0.9}
                step={0.1}
                value={settings.mlpWeight}
                onChange={(v) => update('mlpWeight', parseFloat(v.toFixed(1)))}
                format={(v) => v.toFixed(1)}
              />
            </div>
          )}

          {/* ── Section 2: Eğitim Ayarları ── */}
          <div style={styles.sectionHeader}>Eğitim Ayarları</div>

          <div style={styles.row}>
            <span style={styles.label}>Kısa Vade Periyodu</span>
            <ButtonGroup
              options={[
                { value: 3, label: '3' },
                { value: 5, label: '5' },
                { value: 10, label: '10' },
              ]}
              value={settings.shortForwardPeriod}
              onChange={(v) => update('shortForwardPeriod', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Orta Vade Periyodu</span>
            <ButtonGroup
              options={[
                { value: 10, label: '10' },
                { value: 20, label: '20' },
                { value: 40, label: '40' },
              ]}
              value={settings.mediumForwardPeriod}
              onChange={(v) => update('mediumForwardPeriod', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Kısa Eşik (AL)</span>
            <ButtonGroup
              options={[
                { value: 0.01, label: '1%' },
                { value: 0.02, label: '2%' },
                { value: 0.03, label: '3%' },
              ]}
              value={settings.shortThreshold}
              onChange={(v) => update('shortThreshold', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Kısa Eşik (SAT)</span>
            <ButtonGroup
              options={[
                { value: 0.01, label: '1%' },
                { value: 0.02, label: '2%' },
                { value: 0.03, label: '3%' },
              ]}
              value={settings.shortThresholdShort}
              onChange={(v) => update('shortThresholdShort', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Orta Eşik</span>
            <ButtonGroup
              options={[
                { value: 0.02, label: '2%' },
                { value: 0.03, label: '3%' },
                { value: 0.05, label: '5%' },
              ]}
              value={settings.mediumThreshold}
              onChange={(v) => update('mediumThreshold', v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Walk-Forward Pencere</span>
            <input
              className="mld-settings-number-input"
              type="number"
              min={1}
              max={5}
              step={1}
              value={settings.nWalks}
              onChange={(e) => {
                const v = Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1));
                update('nWalks', v);
              }}
              style={styles.numberInput}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Eğitim Oranı</span>
            <SettingsSlider
              min={50}
              max={90}
              step={5}
              value={Math.round(settings.trainRatio * 100)}
              onChange={(v) => update('trainRatio', v / 100)}
              format={(v) => `${v}%`}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Güven Eşiği</span>
            <SettingsSlider
              min={40}
              max={70}
              step={1}
              value={Math.round(settings.confidenceThreshold * 100)}
              onChange={(v) => update('confidenceThreshold', v / 100)}
              format={(v) => `${v}%`}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Risk Katmanı</span>
            <Toggle
              checked={settings.riskEnabled}
              onChange={(v) => update('riskEnabled', v)}
            />
          </div>

          {/* ── Section 3: Özellik Ayarları ── */}
          <div style={styles.sectionHeader}>Özellik Ayarları</div>

          <div style={styles.row}>
            <span style={styles.label}>Özellik Seçimi (K)</span>
            <SettingsSlider
              min={15}
              max={50}
              step={1}
              value={settings.featureSelectK}
              onChange={(v) => update('featureSelectK', v)}
              format={(v) => String(v)}
            />
          </div>

          <div style={styles.row}>
            <span style={styles.label}>Korelasyon Eşiği</span>
            <SettingsSlider
              min={80}
              max={99}
              step={1}
              value={Math.round(settings.dropCorrThreshold * 100)}
              onChange={(v) => update('dropCorrThreshold', v / 100)}
              format={(v) => `0.${v < 100 ? v : '99'}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            className="mld-settings-reset-btn"
            style={styles.footerBtnDefault}
            onClick={handleReset}
          >
            Varsayılan
          </button>
          <button
            className="mld-settings-close-footer-btn"
            style={styles.footerBtnClose}
            onClick={onClose}
          >
            Kapat
          </button>
        </div>
      </div>

      {/* Scoped CSS for slider thumb, hover effects, scrollbar */}
      <style>{`
        .mld-settings-backdrop {
          animation: mld-fade-in 0.25s ease forwards;
        }
        @keyframes mld-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .mld-settings-drawer {
          animation: mld-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes mld-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .mld-settings-close-btn:hover {
          color: var(--text-primary, #e0e3eb) !important;
          background: var(--highlight-bg, #1e222d) !important;
        }
        .mld-settings-btn-group-item:hover {
          background: var(--highlight-bg, #1e222d);
          color: var(--text-primary, #e0e3eb);
        }
        .mld-settings-reset-btn:hover {
          border-color: var(--border-secondary, #2a2e3e) !important;
          background: var(--bg-tertiary, #141824) !important;
          color: var(--text-primary, #e0e3eb) !important;
        }
        .mld-settings-close-footer-btn:hover {
          opacity: 0.88;
        }
        .mld-settings-number-input:focus {
          border-color: var(--accent, #2962ff) !important;
        }
        .mld-settings-slider {
          -webkit-appearance: none;
          appearance: none;
          background: var(--bg-tertiary, #141824);
          border-radius: 2px;
          height: 4px;
        }
        .mld-settings-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent, #2962ff);
          cursor: pointer;
          border: 2px solid var(--bg-primary, #0a0e17);
          box-shadow: 0 0 4px rgba(41, 98, 255, 0.4);
        }
        .mld-settings-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent, #2962ff);
          cursor: pointer;
          border: 2px solid var(--bg-primary, #0a0e17);
          box-shadow: 0 0 4px rgba(41, 98, 255, 0.4);
        }
        .mld-settings-body::-webkit-scrollbar {
          width: 4px;
        }
        .mld-settings-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .mld-settings-body::-webkit-scrollbar-thumb {
          background: var(--border-secondary, #2a2e3e);
          border-radius: 2px;
        }
        .mld-settings-body {
          scrollbar-width: thin;
          scrollbar-color: var(--border-secondary, #2a2e3e) transparent;
        }
        .mld-settings-toggle:hover {
          filter: brightness(1.15);
        }
      `}</style>
    </>
  );
}

export default SettingsDrawer;

# ML System Redesign — Design Document

**Date**: 2026-03-04
**Status**: Approved

## Problem

The current ML system has low prediction accuracy, limited features (38), weak model architecture (single LightGBM/XGBoost), and a rigid indicator combination system (AND/OR only). The entire pipeline needs to be rebuilt from scratch.

## Approach

**Clean Slate**: Delete existing `ml_predictor.py`, `ml_features.py`, and `MLPanel.tsx`. Build a new 3-layer ensemble ML system with ~80+ features, 5 combination modes, and a single-page dashboard UI.

## Scope

### Files to Delete
- `backend/ml_predictor.py`
- `backend/ml_features.py`
- `src/components/SignalPanel/MLPanel.tsx`

### Files to Create

**Backend:**
- `backend/ml/__init__.py`
- `backend/ml/features.py` — ~80+ feature computation
- `backend/ml/labels.py` — Label generation (3-class + trend + risk target)
- `backend/ml/models.py` — LightGBM, XGBoost, MLP wrappers
- `backend/ml/ensemble.py` — 3-layer ensemble + meta-model
- `backend/ml/backtest.py` — Trade pairing + statistics
- `backend/ml/pipeline.py` — Orchestration (train endpoint logic)
- `backend/routers/ml.py` — Updated API endpoints

**Frontend:**
- `src/components/MLDashboard/MLDashboard.tsx` — Main single-page dashboard
- `src/components/MLDashboard/StatusCard.tsx` — 3-layer status + meta decision
- `src/components/MLDashboard/TrainControls.tsx` — Presets + train button + progress
- `src/components/MLDashboard/SignalCombinator.tsx` — 5 combination modes + rule builder
- `src/components/MLDashboard/BacktestResults.tsx` — Equity curve + stats + trades
- `src/components/MLDashboard/ModelDetails.tsx` — Feature importance + confusion matrix
- `src/components/MLDashboard/SettingsDrawer.tsx` — Model config modal/drawer

### Files to Modify
- `src/components/SignalPanel/SignalPanel.tsx` — Replace MLPanel import with MLDashboard
- `backend/requirements.txt` — Add optuna, scikit-learn (for MLPClassifier)

---

## 1. Feature Pipeline (Backend)

### A. Improved Existing Indicators (~25 features)

| Indicator | Current | New |
|-----------|---------|-----|
| RSI | Single period (14) | Multi-period (7, 14, 21) + divergence detection |
| MACD | Histogram + signal dist | + histogram acceleration (2nd derivative) |
| Bollinger | %B + bandwidth | + squeeze duration (bars in squeeze) |
| StochRSI | K, D | + crossover lag |
| ADX/DMI | ADX + DI diff | + ADX slope + DI crossover freshness |
| SuperTrend | Direction | + flip recency (bars since last flip) |
| Ichimoku | TK diff + price vs cloud | + cloud thickness + chikou confirmation |
| OBV | OBV vs EMA | + OBV slope + divergence |

### B. New Feature Groups (~35 features)

**Momentum (6):**
- ROC multi-period (5, 10, 20, 60)
- Williams %R (14)
- CCI (20)

**Volatility (5):**
- ATR ratio (short/long period)
- Keltner Channel position
- Chaikin Volatility
- Historical volatility ratio (10/30)
- Bollinger squeeze duration

**Trend (7):**
- EMA ribbon slope (8, 13, 21, 34, 55) — measured as count of aligned EMAs
- Aroon oscillator (25)
- TRIX (15)
- Linear regression slope (20) + R² value
- Price vs EMA distance (normalized)

**Market Microstructure (4):**
- VWAP deviation (proxy: typical price * volume based)
- Relative volume anomaly (current vs 20-bar avg)
- High-low spread (intraday range proxy)
- Body-to-range ratio (candle analysis)

**Statistical (5):**
- Rolling z-score of close vs SMA(50)
- Hurst exponent proxy (R/S analysis, 100-bar window)
- Autocorrelation of returns (lag-1)
- Return distribution entropy (20-bar window)
- Variance ratio (5/20)

### C. Feature Engineering (~20 features)

**Interaction Features (6):**
- RSI × ADX (momentum in strong trends)
- MACD_hist × volume_anomaly (volume-confirmed momentum)
- BB_%B × ATR_pct (volatility-adjusted band position)
- SuperTrend_dir × ADX (trend direction with strength)
- Stoch_K × RSI (double oscillator confirmation)
- OBV_slope × price_return (volume-price divergence)

**Regime Features (3):**
- Volatility regime: Low / Medium / High (one-hot, rolling ATR percentile)
- Trend regime: Strong Up / Weak Up / Range / Weak Down / Strong Down (ADX + DI based)
- Volume regime: Dry / Normal / Spike (relative volume percentile)

**Lag Features (8):**
- RSI(14) at lags 1, 3, 5
- MACD_hist at lags 1, 3
- Return(1) at lags 1, 5, 10

**Rolling Normalization:**
- All features z-score normalized using rolling 100-bar window
- Prevents scale bias across different instruments

---

## 2. Model Architecture (Backend)

### Layer 1: Short-Term Signals (1-5 days)
- **Model**: LightGBM classifier
- **Label**: Forward return over `forward_period` bars (default: 5)
  - +1 if return > threshold (BUY)
  - -1 if return < -threshold_short (SHORT)
  - 0 otherwise (NEUTRAL)
- **Feature emphasis**: Momentum + oscillator features weighted higher
- **Output**: signal (-1/0/+1) + confidence probability

### Layer 2: Medium-Term Trend (1-4 weeks)
- **Model**: XGBoost + MLPClassifier ensemble
- **Label**: Forward return over 20 bars
  - UPTREND if return > 3%
  - DOWNTREND if return < -3%
  - SIDEWAYS otherwise
- **MLP spec**: 2 hidden layers (64→32), ReLU, dropout 0.3, max_iter 500
- **Ensemble**: XGBoost 60% + MLP 40% averaged probabilities
- **Feature emphasis**: Trend + volatility features weighted higher
- **Output**: trend direction + confidence

### Layer 3: Risk/Strength Score (Continuous)
- **Model**: LightGBM regressor
- **Target**: Composite score 0-100 computed from:
  - Volatility component (30%): ATR percentile, volatility regime
  - Momentum component (30%): Multi-timeframe momentum alignment
  - Volume component (20%): Volume anomaly score, OBV trend
  - Technical strength (20%): Count of bullish indicators / total
- **Output**: risk score 0-100 + component breakdown

### Meta-Model (Rule-Based Combiner)

| Short-Term | Medium-Term | Risk | → Decision |
|-----------|-------------|------|------------|
| BUY | UPTREND | < 40 | **GÜÇLÜ AL** (Strong Buy) |
| BUY | UPTREND | 40-70 | **AL** (Buy) |
| BUY | SIDEWAYS | < 50 | **DİKKATLİ AL** (Cautious Buy) |
| BUY | DOWNTREND | any | **BEKLE** (Wait — conflicting) |
| SHORT | DOWNTREND | < 40 | **GÜÇLÜ SAT** (Strong Sell) |
| SHORT | DOWNTREND | 40-70 | **SAT** (Sell) |
| SHORT | SIDEWAYS | < 50 | **DİKKATLİ SAT** (Cautious Sell) |
| SHORT | UPTREND | any | **BEKLE** (Wait — conflicting) |
| NEUTRAL | any | any | **NÖTR** (Neutral) |
| any | any | > 70 | downgrade one level (high risk dampens signals) |

---

## 3. Indicator Combination System (Frontend + Backend)

5 modes replacing the current AND/OR system:

### Mode 1: Weighted Voting (Ağırlıklı Oylama)
Each indicator gets 0-100 weight (auto-assigned from ML feature importance, or manual).
Total score = weighted sum of indicator signals. Threshold crossing → signal.

### Mode 2: Conditional Chains (Koşullu Zincirler)
If-then rules: "IF RSI < 30 AND MACD crossover THEN BUY"
User builds chains via dropdowns. Max 5 conditions per chain.

### Mode 3: Confirmation Mode (Onay Modu)
"Indicator A signals first, then indicator B must confirm within N bars."
Temporal confirmation — reduces false signals.

### Mode 4: Regime-Adaptive (Rejim Bazlı)
Different indicator configs for different market regimes:
- Low volatility → momentum indicators weighted higher
- High volatility → trend indicators weighted higher
- Range → oscillators weighted higher
Regime detected automatically from volatility/ADX features.

### Mode 5: Continuous Scoring (Sürekli Skor)
Each indicator produces -100 to +100 continuous score (not binary).
Weighted sum → composite score:
- +70 to +100: Strong BUY
- +30 to +70: Weak BUY
- -30 to +30: NEUTRAL
- -70 to -30: Weak SELL
- -100 to -70: Strong SELL

---

## 4. Training & Validation Pipeline

### Walk-Forward Validation
- Expanding windows: 1-5 (configurable)
- Purge gap: Layer-specific (short-term: 5 bars, medium-term: 20 bars)
- Stratified split within each window

### Hyperparameter Tuning (Optuna)
- Trials per preset: Hızlı=10, Dengeli=30, Derin=50
- Pruning: MedianPruner (early stopping for bad trials)
- Search space:
  - LightGBM: n_estimators [50-500], max_depth [3-8], learning_rate [0.01-0.3], min_child_samples [5-50]
  - XGBoost: same + reg_alpha [0-1], reg_lambda [0-1]
  - MLP: hidden_layer_sizes [(32,), (64,32), (128,64,32)], alpha [1e-4, 1e-2], learning_rate_init [1e-4, 1e-2]

### Feature Selection
1. Correlation filter (>0.90 threshold — more aggressive than current 0.95)
2. Boruta selection (shadow features comparison, LightGBM-based) — only in "Derin" preset
3. Top-K by importance (layer-specific K values)

### Training Presets

| Preset | Duration | Optuna Trials | Walk Windows | Feature Selection |
|--------|----------|---------------|-------------|-------------------|
| Hızlı (Fast) | ~30s | 10 | 1 | Top-K only |
| Dengeli (Balanced) | ~2min | 30 | 2 | Correlation + Top-K |
| Derin (Deep) | ~5min | 50 | 3 | Boruta + Correlation + Top-K |

### Anti-Overfitting Checks
- Minimum class samples: 10 (raised from 5)
- OOS accuracy < 40% → warning displayed
- IS vs OOS accuracy gap > 20% → overfitting warning
- Monte Carlo: 1000 shuffles (raised from 500)

---

## 5. Frontend — Single-Page ML Dashboard

### Layout (top-to-bottom scroll)

**Section 1 — Status Card:**
- Short-term signal badge: BUY/SELL/NEUTRAL + confidence %
- Medium-term trend badge: UP/SIDEWAYS/DOWN + confidence %
- Risk score: gauge meter 0-100 (green-yellow-red gradient)
- Meta decision: large badge (GÜÇLÜ AL / AL / DİKKATLİ AL / BEKLE / SAT / GÜÇLÜ SAT)

**Section 2 — Train Controls:**
- 3 preset buttons: Hızlı, Dengeli, Derin
- Position mode: Long / Short / Both
- Train button with progress bar + ETA
- Error/warning messages

**Section 3 — Signals + Combinator:**
- Combination mode selector (5 modes via dropdown)
- Rule builder UI (dynamic based on selected mode)
- Signal history table (last 20 signals)
- Apply button to overlay signals on chart

**Section 4 — Backtest Results:**
- Equity curve (mini chart, IS=blue, OOS=orange)
- Key stats row: Sharpe, Win Rate, Profit Factor, Max DD
- Collapsible trade table

**Section 5 — Model Details:**
- Feature importance bar chart (grouped by indicator)
- Confusion matrix (3×3 heatmap)
- Class metrics table (precision/recall/F1)
- Walk-forward window results (if >1 window)

**Settings Drawer (⚙ icon, top-right):**
- Model type per layer
- Ensemble toggle
- Forward period per layer
- Threshold values
- Walk-forward windows
- Feature selection parameters
- Train/test ratio

---

## 6. API Endpoints

```
POST   /api/ml/train           → Full 3-layer training pipeline
GET    /api/ml/predict/{sym}   → Prediction from cached model
GET    /api/ml/status/{sym}    → Status card data (3 layers + meta)
DELETE /api/ml/cache            → Clear model cache
```

### POST /api/ml/train — Request
```json
{
  "ohlcv": [...],
  "layers": {
    "short_term": { "forward_period": 5, "threshold": 0.02, "threshold_short": 0.02 },
    "medium_term": { "forward_period": 20, "threshold": 0.03 },
    "risk": { "enabled": true }
  },
  "model_config": {
    "short_term_model": "lightgbm",
    "medium_term_model": "xgboost+mlp",
    "ensemble": true,
    "mlp_weight": 0.4
  },
  "training": {
    "preset": "balanced",
    "train_ratio": 0.7,
    "n_walks": 2,
    "optuna_trials": 30,
    "feature_select_k": 30,
    "drop_corr_threshold": 0.90,
    "use_boruta": false
  },
  "position_mode": "both",
  "confidence_threshold": 0.55
}
```

### POST /api/ml/train — Response
```json
{
  "layers": {
    "short_term": {
      "signal": 1,
      "confidence": 0.72,
      "model_type": "lightgbm",
      "oos_accuracy": 0.58,
      "class_metrics": { "precision": {...}, "recall": {...}, "f1": {...} },
      "confusion_matrix": [[...], [...], [...]],
      "feature_importance": { "rsi_14": 0.08, ... },
      "selected_features": ["rsi_14", "macd_hist", ...],
      "equity_curve": [...]
    },
    "medium_term": {
      "trend": "uptrend",
      "confidence": 0.65,
      "model_type": "xgboost+mlp",
      "oos_accuracy": 0.54,
      "class_metrics": {...},
      "confusion_matrix": [[...], [...], [...]],
      "feature_importance": {...},
      "selected_features": [...],
      "equity_curve": [...]
    },
    "risk_score": {
      "score": 62,
      "components": {
        "volatility": 55,
        "momentum": 78,
        "volume": 48,
        "technical": 67
      }
    }
  },
  "meta_decision": "strong_buy",
  "signals": [
    { "barIndex": 200, "signal": 1, "confidence": 0.72, "layer": "short_term" }
  ],
  "trades": [
    {
      "entryDate": "2025-01-15", "entryPrice": 45.2, "entryBarIndex": 200,
      "exitDate": "2025-01-22", "exitPrice": 47.8, "exitBarIndex": 205,
      "returnPct": 5.75, "barsHeld": 5, "positionType": "long"
    }
  ],
  "stats": {
    "totalTrades": 42, "winRate": 0.62, "avgReturn": 1.8,
    "profitFactor": 2.1, "maxWin": 12.3, "maxLoss": -5.1,
    "totalReturn": 34.5, "sharpe": 1.85, "sortino": 2.3,
    "maxDrawdown": -8.2, "calmar": 4.2
  },
  "walk_forward_results": [
    { "window": 1, "is_accuracy": 0.62, "oos_accuracy": 0.55, "oos_sharpe": 1.2 },
    { "window": 2, "is_accuracy": 0.65, "oos_accuracy": 0.58, "oos_sharpe": 1.8 }
  ],
  "warnings": [],
  "training_meta": {
    "total_features": 83,
    "selected_features": 30,
    "total_bars": 500,
    "training_bars": 350,
    "optuna_trials": 30,
    "best_trial_score": 0.61
  }
}
```

---

## 7. New Dependencies

**Backend (requirements.txt):**
- `optuna` — hyperparameter tuning
- `scikit-learn` — MLPClassifier, preprocessing (already partially used)
- `boruta` — feature selection (Derin preset only)

**Frontend (package.json):**
- No new dependencies (uses existing recharts for charts)

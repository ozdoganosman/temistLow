# ML System Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the entire ML prediction system with a 3-layer ensemble (short-term signals + medium-term trend + risk score), ~80+ features, Optuna hyperparameter tuning, 5 indicator combination modes, and a new single-page ML Dashboard UI.

**Architecture:** Backend `ml/` package (7 modules) replaces `ml_features.py` + `ml_predictor.py`. Frontend `MLDashboard/` directory (7 components) replaces `MLPanel.tsx`. The 3-layer ensemble uses LightGBM (Layer 1), XGBoost+MLP (Layer 2), and LightGBM regressor (Layer 3), combined by a rule-based meta-model.

**Tech Stack:** Python (LightGBM, XGBoost, scikit-learn MLPClassifier, Optuna, NumPy, Pandas), React/TypeScript (Recharts for charts), FastAPI

**Design Doc:** `docs/plans/2026-03-04-ml-system-redesign-design.md`

---

## Task 1: Feature Pipeline — `backend/ml/features.py`

**Files:**
- Create: `backend/ml/__init__.py`
- Create: `backend/ml/features.py`
- Create: `backend/tests/test_ml_features.py`

**Context:** The current `backend/ml_features.py` computes 38 features. We're replacing it with ~80+ features. The module imports helper functions from `backend/indicators.py` which exports: `ema()`, `sma()`, `wilder_smooth()`, `true_range()`, `stdev()`, `rolling_highest()`, `rolling_lowest()`.

**Step 1: Create the `ml` package**

```python
# backend/ml/__init__.py
"""ML prediction package — 3-layer ensemble system."""
```

**Step 2: Write tests for the feature matrix**

```python
# backend/tests/test_ml_features.py
import numpy as np
import pytest

def _make_ohlcv(n=300):
    """Generate synthetic OHLCV data for testing."""
    np.random.seed(42)
    closes = 100 + np.cumsum(np.random.randn(n) * 0.5)
    highs = closes + np.abs(np.random.randn(n)) * 0.5
    lows = closes - np.abs(np.random.randn(n)) * 0.5
    opens = closes + np.random.randn(n) * 0.2
    volumes = np.abs(np.random.randn(n) * 1000) + 500
    return opens, highs, lows, closes, volumes

def test_feature_matrix_shape():
    from ml.features import compute_feature_matrix
    o, h, l, c, v = _make_ohlcv(300)
    df = compute_feature_matrix(o, h, l, c, v)
    # Should have ~80+ columns
    assert df.shape[0] == 300
    assert df.shape[1] >= 75, f"Expected >=75 features, got {df.shape[1]}"

def test_feature_matrix_no_inf():
    from ml.features import compute_feature_matrix
    o, h, l, c, v = _make_ohlcv(300)
    df = compute_feature_matrix(o, h, l, c, v)
    import pandas as pd
    # Drop NaN rows (expected for warmup), but no Inf should remain
    clean = df.replace([np.inf, -np.inf], np.nan).dropna()
    assert len(clean) > 100, "Too many NaN rows after cleanup"
    assert not clean.isin([np.inf, -np.inf]).any().any()

def test_feature_groups_present():
    from ml.features import compute_feature_matrix
    o, h, l, c, v = _make_ohlcv(300)
    df = compute_feature_matrix(o, h, l, c, v)
    cols = set(df.columns)
    # Check key features from each group exist
    assert 'rsi_7' in cols, "Missing multi-period RSI"
    assert 'rsi_14' in cols
    assert 'rsi_21' in cols
    assert 'macd_hist_accel' in cols, "Missing MACD acceleration"
    assert 'bb_squeeze_dur' in cols, "Missing BB squeeze duration"
    assert 'adx_slope' in cols, "Missing ADX slope"
    assert 'supertrend_flip_bars' in cols, "Missing SuperTrend flip recency"
    assert 'ichi_cloud_thickness' in cols, "Missing Ichimoku cloud thickness"
    assert 'obv_slope' in cols, "Missing OBV slope"
    assert 'roc_5' in cols, "Missing ROC"
    assert 'williams_r' in cols, "Missing Williams %R"
    assert 'cci_20' in cols, "Missing CCI"
    assert 'aroon_osc' in cols, "Missing Aroon"
    assert 'ema_ribbon_aligned' in cols, "Missing EMA ribbon"
    assert 'linreg_slope' in cols, "Missing linear regression"
    assert 'hurst_proxy' in cols, "Missing Hurst exponent"
    assert 'vol_regime' in cols, "Missing volatility regime"
    assert 'rsi_x_adx' in cols, "Missing interaction feature"

def test_drop_correlated_features():
    from ml.features import drop_correlated_features
    import pandas as pd
    # Create perfectly correlated columns
    df = pd.DataFrame({
        'a': [1, 2, 3, 4, 5],
        'b': [2, 4, 6, 8, 10],  # perfectly correlated with a
        'c': [5, 3, 1, 2, 4],   # independent
    })
    result = drop_correlated_features(df, threshold=0.90)
    assert 'a' in result.columns
    assert 'b' not in result.columns
    assert 'c' in result.columns

def test_z_score_normalization():
    from ml.features import compute_feature_matrix
    o, h, l, c, v = _make_ohlcv(300)
    df = compute_feature_matrix(o, h, l, c, v, normalize=True)
    # After normalization, features should have roughly zero mean
    clean = df.dropna()
    means = clean.mean().abs()
    # Most features should be reasonably centered (within ±2 of zero)
    assert (means < 5).sum() > len(means) * 0.8, "Normalization not working"
```

Run: `cd backend && python -m pytest tests/test_ml_features.py -v`
Expected: FAIL (module does not exist yet)

**Step 3: Implement `backend/ml/features.py`**

The file should implement `compute_feature_matrix()` with these feature groups:

**A. Improved Existing Indicators (~25 features):**
- `rsi_7`, `rsi_14`, `rsi_21`: Multi-period RSI using `_compute_rsi(closes, period)`
- `rsi_slope_5`: Slope of RSI(14) over 5 bars
- `rsi_divergence`: Price making new high but RSI not — sign(close_slope) != sign(rsi_slope)
- `macd_hist`, `macd_signal_dist`: Standard MACD features (reuse from old code)
- `macd_hist_accel`: 2nd derivative of histogram (histogram[i] - histogram[i-1])
- `bb_pct_b`, `bb_bandwidth`: Standard Bollinger (reuse from old code)
- `bb_squeeze_dur`: Count consecutive bars where bandwidth < 20th percentile of last 100 bars
- `stoch_rsi_k`, `stoch_rsi_d`: Standard (reuse)
- `stoch_cross_lag`: Bars since last K>D crossover (positive) or K<D crossover (negative)
- `adx`, `di_diff`: Standard (reuse)
- `adx_slope`: Slope of ADX over 5 bars (is trend strengthening?)
- `di_cross_freshness`: Bars since last DI+>DI- or DI->DI+ crossover
- `supertrend_dir`: Standard (reuse)
- `supertrend_flip_bars`: Bars since last direction flip
- `ichimoku_tk_diff`, `ichimoku_price_vs_cloud`: Standard (reuse, normalized)
- `ichi_cloud_thickness`: abs(senkou_a - senkou_b) / close
- `ichi_chikou_confirm`: +1 if chikou (close shifted 26 back) > cloud, -1 if below
- `obv_vs_ema`: Standard (reuse)
- `obv_slope`: Slope of OBV over 10 bars (normalized)
- `obv_divergence`: Sign mismatch between OBV slope and price slope

**B. New Momentum Features (6):**
- `roc_5`, `roc_10`, `roc_20`, `roc_60`: Rate of change = (close[i] - close[i-p]) / close[i-p]
- `williams_r`: Williams %R(14) = (highest_high - close) / (highest_high - lowest_low) * -100
- `cci_20`: CCI = (typical_price - SMA(typical, 20)) / (0.015 * mean_deviation)

**C. New Volatility Features (5):**
- `atr_ratio`: ATR(7) / ATR(21) — short vs long term volatility
- `keltner_pos`: (close - keltner_mid) / (keltner_upper - keltner_lower). Keltner = EMA(20) ± 2*ATR(10)
- `chaikin_vol`: EMA(10) of (high-low) / EMA(10, shift=10) of (high-low) - 1
- `hist_vol_ratio`: stdev(returns, 10) / stdev(returns, 30)
- `bb_squeeze_dur` (already counted above in improved indicators)

**D. New Trend Features (7):**
- `ema_ribbon_aligned`: Count of EMA pairs in correct order (8<13<21<34<55 for uptrend, reverse for down). Range: -5 to +5
- `aroon_osc`: Aroon Up(25) - Aroon Down(25). Aroon Up = ((25 - bars_since_highest) / 25) * 100
- `trix`: EMA(EMA(EMA(close, 15), 15), 15) percentage change
- `linreg_slope`: Linear regression slope of close over 20 bars (normalized by price)
- `linreg_r2`: R² of the linear regression (how well price follows a straight line)
- `price_vs_ema_dist`: (close - EMA(50)) / close — normalized distance from trend

**E. New Market Microstructure Features (4):**
- `vwap_deviation`: (close - VWAP_proxy) / close. VWAP_proxy = cumsum(typical_price * volume) / cumsum(volume) rolling 20 bars
- `rel_volume_anomaly`: volume / SMA(volume, 20) — how unusual is current volume
- `hl_spread`: (high - low) / close — normalized intraday range
- `body_ratio`: abs(close - open) / (high - low + 1e-10) — candle body vs total range

**F. New Statistical Features (5):**
- `zscore_50`: (close - SMA(50)) / stdev(close, 50)
- `hurst_proxy`: Simplified R/S analysis over 100 bars: log(R/S) / log(n). >0.5=trending, <0.5=mean-reverting
- `autocorr_1`: Autocorrelation of 1-bar returns over 20-bar window
- `return_entropy`: Entropy of discretized returns (5 bins) over 20-bar window
- `variance_ratio`: var(returns, 5) / (5 * var(returns, 1)) — random walk test

**G. Interaction Features (6):**
- `rsi_x_adx`: rsi_14 * adx / 10000 (both 0-100 range)
- `macd_x_vol`: macd_hist * rel_volume_anomaly
- `bb_x_atr`: bb_pct_b * atr_pct
- `st_x_adx`: supertrend_dir * adx / 100
- `stoch_x_rsi`: stoch_rsi_k * rsi_14 / 10000
- `obv_x_ret`: obv_slope * return_1

**H. Regime Features (3):**
- `vol_regime`: ATR percentile in rolling 100-bar window. 0=low (<25th), 1=medium, 2=high (>75th)
- `trend_regime`: Based on ADX + DI: 2=strong up, 1=weak up, 0=range, -1=weak down, -2=strong down
- `volume_regime`: Volume percentile. 0=dry (<20th), 1=normal, 2=spike (>80th)

**I. Lag Features (8):**
- `rsi_lag_1`, `rsi_lag_3`, `rsi_lag_5`: RSI(14) shifted
- `macd_hist_lag_1`, `macd_hist_lag_3`: MACD histogram shifted
- `return_1_lag_1`, `return_1_lag_5`, `return_1_lag_10`: 1-bar return shifted

**Also implement:**
- `drop_correlated_features(df, threshold=0.90)` — same as current but with lower default threshold
- Optional `normalize=True` parameter: rolling z-score normalization (100-bar window) on all features

Import helpers from `indicators.py`: `ema`, `sma`, `wilder_smooth`, `true_range`, `stdev`, `rolling_highest`, `rolling_lowest`.

Run: `cd backend && python -m pytest tests/test_ml_features.py -v`
Expected: ALL PASS

---

## Task 2: Label Generation — `backend/ml/labels.py`

**Files:**
- Create: `backend/ml/labels.py`
- Create: `backend/tests/test_ml_labels.py`

**Context:** This module generates targets for each of the 3 layers. Currently labels are inside `ml_features.py`. Now they go into their own module with 3 separate functions.

**Step 1: Write tests**

```python
# backend/tests/test_ml_labels.py
import numpy as np
import pytest

def test_short_term_labels_three_classes():
    from ml.labels import compute_short_term_labels
    closes = np.array([100, 102, 104, 98, 96, 100, 105, 95, 100, 103,
                       101, 99, 102, 104, 106, 108, 110, 100, 98, 97])
    labels = compute_short_term_labels(closes, forward_period=5, threshold=0.02)
    # Should have +1, 0, -1 and NaN at the end
    assert np.isnan(labels[-1]), "Last bars should be NaN"
    valid = labels[~np.isnan(labels)]
    unique = set(valid.astype(int))
    assert unique.issubset({-1, 0, 1}), f"Unexpected labels: {unique}"

def test_short_term_labels_asymmetric():
    from ml.labels import compute_short_term_labels
    closes = np.linspace(100, 150, 100)  # steady uptrend
    labels = compute_short_term_labels(closes, forward_period=5, threshold=0.01, threshold_short=0.05)
    valid = labels[~np.isnan(labels)]
    # With low buy threshold and high short threshold, should see lots of buys, few shorts
    buy_count = (valid == 1).sum()
    short_count = (valid == -1).sum()
    assert buy_count > short_count

def test_medium_term_labels():
    from ml.labels import compute_medium_term_labels
    closes = np.linspace(100, 120, 50)  # 20% uptrend
    labels = compute_medium_term_labels(closes, forward_period=20, threshold=0.03)
    valid = labels[~np.isnan(labels)]
    # Most should be UPTREND (1)
    assert (valid == 1).sum() > len(valid) * 0.5

def test_risk_target():
    from ml.labels import compute_risk_target
    import numpy as np
    np.random.seed(42)
    n = 300
    closes = 100 + np.cumsum(np.random.randn(n) * 0.5)
    highs = closes + np.abs(np.random.randn(n)) * 0.5
    lows = closes - np.abs(np.random.randn(n)) * 0.5
    volumes = np.abs(np.random.randn(n) * 1000) + 500
    scores = compute_risk_target(highs, lows, closes, volumes)
    valid = scores[~np.isnan(scores)]
    assert len(valid) > 100
    assert valid.min() >= 0
    assert valid.max() <= 100

def test_min_class_validation():
    from ml.labels import validate_class_distribution
    import numpy as np
    # Severely imbalanced
    labels = np.array([1]*100 + [0]*5 + [-1]*2)
    with pytest.raises(ValueError, match="SAT"):
        validate_class_distribution(labels, min_samples=5)
```

Run: `cd backend && python -m pytest tests/test_ml_labels.py -v`
Expected: FAIL

**Step 2: Implement `backend/ml/labels.py`**

```python
"""Label generation for the 3-layer ML system."""
import numpy as np
from collections import Counter
from indicators import true_range, wilder_smooth, sma, ema

def compute_short_term_labels(
    closes: np.ndarray,
    forward_period: int = 5,
    threshold: float = 0.02,
    threshold_short: float | None = None,
) -> np.ndarray:
    """
    3-class labels for short-term signal prediction.
    +1=BUY, 0=NEUTRAL, -1=SHORT. NaN where future unknown.
    """
    if threshold_short is None:
        threshold_short = threshold
    n = len(closes)
    labels = np.full(n, np.nan)
    for i in range(n - forward_period):
        if closes[i] == 0:
            continue
        ret = (closes[i + forward_period] - closes[i]) / closes[i]
        if ret > threshold:
            labels[i] = 1.0
        elif ret < -threshold_short:
            labels[i] = -1.0
        else:
            labels[i] = 0.0
    return labels

def compute_medium_term_labels(
    closes: np.ndarray,
    forward_period: int = 20,
    threshold: float = 0.03,
) -> np.ndarray:
    """
    3-class labels for medium-term trend prediction.
    +1=UPTREND, 0=SIDEWAYS, -1=DOWNTREND.
    """
    n = len(closes)
    labels = np.full(n, np.nan)
    for i in range(n - forward_period):
        if closes[i] == 0:
            continue
        ret = (closes[i + forward_period] - closes[i]) / closes[i]
        if ret > threshold:
            labels[i] = 1.0
        elif ret < -threshold:
            labels[i] = -1.0
        else:
            labels[i] = 0.0
    return labels

def compute_risk_target(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    volumes: np.ndarray,
    lookback: int = 20,
) -> np.ndarray:
    """
    Composite risk score 0-100 for regression target.
    Components: volatility(30%), momentum(30%), volume(20%), technical(20%).
    """
    n = len(closes)
    scores = np.full(n, np.nan)
    tr = true_range(highs, lows, closes)
    atr = wilder_smooth(tr, 14)
    vol_sma = sma(volumes, 20)

    for i in range(max(lookback, 60), n):
        # Volatility component (0-100): ATR percentile in window
        atr_window = atr[max(0, i-100):i+1]
        valid_atr = atr_window[~np.isnan(atr_window)]
        if len(valid_atr) < 10:
            continue
        vol_pctl = np.searchsorted(np.sort(valid_atr), atr[i]) / len(valid_atr) * 100

        # Momentum component: multi-timeframe return alignment
        rets = []
        for p in [5, 10, 20]:
            if closes[i-p] != 0:
                rets.append((closes[i] - closes[i-p]) / closes[i-p])
        mom_score = sum(1 for r in rets if r > 0) / max(len(rets), 1) * 100

        # Volume component: relative volume
        if vol_sma[i] > 0 and not np.isnan(vol_sma[i]):
            rel_vol = volumes[i] / vol_sma[i]
            vol_score = min(rel_vol * 50, 100)  # 2x avg = 100
        else:
            vol_score = 50

        # Technical strength: simplified count of bullish signals
        tech_signals = 0
        tech_total = 3
        # Close > SMA(20)
        sma20 = np.mean(closes[max(0,i-19):i+1])
        if closes[i] > sma20:
            tech_signals += 1
        # Close > SMA(50)
        if i >= 49:
            sma50 = np.mean(closes[i-49:i+1])
            if closes[i] > sma50:
                tech_signals += 1
        # Positive short-term return
        if closes[i] > closes[i-5]:
            tech_signals += 1
        tech_score = tech_signals / tech_total * 100

        # Weighted composite
        scores[i] = (
            vol_pctl * 0.30 +
            mom_score * 0.30 +
            vol_score * 0.20 +
            tech_score * 0.20
        )
    return scores

def validate_class_distribution(labels: np.ndarray, min_samples: int = 10):
    """Raise ValueError if any class has fewer than min_samples."""
    valid = labels[~np.isnan(labels)].astype(int)
    counts = Counter(valid)
    cls_names = {-1: 'SAT', 0: 'NÖTR', 1: 'AL'}
    for cls in [-1, 0, 1]:
        if counts.get(cls, 0) < min_samples:
            raise ValueError(
                f"{cls_names.get(cls, str(cls))} sınıfı yalnızca {counts.get(cls, 0)} örneğe sahip "
                f"(en az {min_samples} gerekli). Eşik değerini ayarlayın. "
                f"Dağılım: AL={counts.get(1,0)}, NÖTR={counts.get(0,0)}, SAT={counts.get(-1,0)}"
            )
```

Run: `cd backend && python -m pytest tests/test_ml_labels.py -v`
Expected: ALL PASS

---

## Task 3: Model Wrappers + Optuna — `backend/ml/models.py`

**Files:**
- Create: `backend/ml/models.py`
- Create: `backend/tests/test_ml_models.py`
- Modify: `backend/requirements.txt` — add `optuna` and `boruta` (if not present, add `Boruta`)

**Context:** Wraps LightGBM, XGBoost, and scikit-learn MLPClassifier. Provides Optuna-based hyperparameter tuning. Also provides Boruta feature selection. The LABEL_MAP converts -1/0/+1 labels to 0-indexed 0/1/2 for training.

**Step 1: Update requirements.txt**

Add `optuna` to `backend/requirements.txt`. Do NOT add boruta as a pip package — we'll implement a simplified version inline (the `boruta` pip package has compatibility issues with newer scikit-learn).

**Step 2: Write tests**

```python
# backend/tests/test_ml_models.py
import numpy as np
import pytest

def _make_classification_data(n=200, n_features=10):
    np.random.seed(42)
    X = np.random.randn(n, n_features)
    # Simple linear boundary
    y = (X[:, 0] + X[:, 1] > 0).astype(int)  # 2 classes: 0, 1
    # Make it 3-class
    y[X[:, 0] > 1] = 2
    return X, y

def test_lightgbm_wrapper():
    from ml.models import create_model, train_model, predict_proba
    X, y = _make_classification_data()
    model = create_model('lightgbm')
    train_model(model, X[:150], y[:150], model_type='lightgbm')
    proba = predict_proba(model, X[150:])
    assert proba.shape == (50, 3)
    assert np.allclose(proba.sum(axis=1), 1.0, atol=0.01)

def test_xgboost_wrapper():
    from ml.models import create_model, train_model, predict_proba
    X, y = _make_classification_data()
    model = create_model('xgboost')
    train_model(model, X[:150], y[:150], model_type='xgboost')
    proba = predict_proba(model, X[150:])
    assert proba.shape == (50, 3)

def test_mlp_wrapper():
    from ml.models import create_model, train_model, predict_proba
    X, y = _make_classification_data()
    model = create_model('mlp')
    train_model(model, X[:150], y[:150], model_type='mlp')
    proba = predict_proba(model, X[150:])
    assert proba.shape == (50, 3)

def test_optuna_tuning():
    from ml.models import tune_hyperparameters
    X, y = _make_classification_data()
    best_params = tune_hyperparameters(X[:150], y[:150], model_type='lightgbm', n_trials=5)
    assert 'n_estimators' in best_params
    assert 'max_depth' in best_params

def test_feature_selection_by_importance():
    from ml.models import select_features_by_importance
    X, y = _make_classification_data(n=200, n_features=20)
    indices, names = select_features_by_importance(X, y, [f'f{i}' for i in range(20)], top_k=10)
    assert len(indices) == 10
    assert len(names) == 10
```

Run: `cd backend && python -m pytest tests/test_ml_models.py -v`
Expected: FAIL

**Step 3: Implement `backend/ml/models.py`**

The module should provide:

1. `create_model(model_type, params=None)` → returns a model instance
   - `'lightgbm'`: LGBMClassifier with class_weight='balanced'
   - `'xgboost'`: XGBClassifier
   - `'mlp'`: MLPClassifier(hidden_layer_sizes=(64,32), activation='relu', max_iter=500, early_stopping=True)
   - `'lightgbm_regressor'`: LGBMRegressor for risk score

2. `train_model(model, X_train, y_train, model_type, sample_weight=None)` → trains in-place
   - For XGBoost: compute balanced sample weights automatically if not provided

3. `predict_proba(model, X)` → np.ndarray of shape (n, n_classes)

4. `tune_hyperparameters(X, y, model_type, n_trials, timeout=None)` → dict of best params
   - Uses Optuna with MedianPruner
   - Search spaces per design doc
   - Uses 3-fold stratified CV internally
   - Suppresses Optuna logging (set verbosity to WARNING)

5. `select_features_by_importance(X, y, feature_names, top_k)` → (indices, names)
   - Quick LightGBM fit, sort by importance, return top-k

6. `compute_sample_weights(y)` → balanced sample weights array

7. LABEL_MAP = {-1: 0, 0: 1, 1: 2} and INV_LABEL_MAP = {0: -1, 1: 0, 2: 1}

Run: `cd backend && python -m pytest tests/test_ml_models.py -v`
Expected: ALL PASS

---

## Task 4: Trade Pairing + Statistics — `backend/ml/backtest.py`

**Files:**
- Create: `backend/ml/backtest.py`
- Create: `backend/tests/test_ml_backtest.py`

**Context:** Extracts `pair_trades_python()` and `compute_stats_python()` from current `ml_predictor.py`. Adds Sortino, max drawdown, and Calmar to stats. This is mostly a port with enhancements.

**Step 1: Write tests**

```python
# backend/tests/test_ml_backtest.py
import pytest

def test_pair_trades_long_only():
    from ml.backtest import pair_trades
    signals = [
        {'barIndex': 5, 'signal': 1, 'confidence': 0.7},
        {'barIndex': 10, 'signal': -1, 'confidence': 0.6},
    ]
    dates = [f'2025-01-{i+1:02d}' for i in range(20)]
    closes = [100 + i for i in range(20)]
    trades = pair_trades(signals, dates, closes, position_mode='long-only')
    assert len(trades) == 1
    assert trades[0]['positionType'] == 'long'
    assert trades[0]['entryBarIndex'] == 5
    assert trades[0]['exitBarIndex'] == 10

def test_pair_trades_both_directions():
    from ml.backtest import pair_trades
    signals = [
        {'barIndex': 5, 'signal': 1, 'confidence': 0.7},
        {'barIndex': 10, 'signal': -1, 'confidence': 0.6},
        {'barIndex': 15, 'signal': 1, 'confidence': 0.65},
    ]
    dates = [f'2025-01-{i+1:02d}' for i in range(20)]
    closes = [100 + i * 0.5 for i in range(20)]
    trades = pair_trades(signals, dates, closes, position_mode='both')
    # Should have long trade 5→10, short trade 10→15
    assert len(trades) == 2
    assert trades[0]['positionType'] == 'long'
    assert trades[1]['positionType'] == 'short'

def test_force_close_at_end():
    from ml.backtest import pair_trades
    signals = [{'barIndex': 5, 'signal': 1, 'confidence': 0.7}]
    dates = [f'2025-01-{i+1:02d}' for i in range(20)]
    closes = [100 + i for i in range(20)]
    trades = pair_trades(signals, dates, closes, position_mode='long-only')
    assert len(trades) == 1
    # Should force-close at last signal bar range
    assert trades[0]['exitBarIndex'] > trades[0]['entryBarIndex']

def test_compute_stats_basic():
    from ml.backtest import compute_stats
    trades = [
        {'returnPct': 0.05, 'barsHeld': 5},
        {'returnPct': -0.02, 'barsHeld': 3},
        {'returnPct': 0.08, 'barsHeld': 7},
    ]
    stats = compute_stats(trades)
    assert stats['totalTrades'] == 3
    assert stats['winRate'] == pytest.approx(2/3, abs=0.01)
    assert stats['sharpe'] != 0
    assert 'sortino' in stats
    assert 'maxDrawdown' in stats
    assert 'calmar' in stats

def test_compute_stats_empty():
    from ml.backtest import compute_stats
    stats = compute_stats([])
    assert stats['totalTrades'] == 0
    assert stats['sharpe'] == 0
```

Run: `cd backend && python -m pytest tests/test_ml_backtest.py -v`
Expected: FAIL

**Step 2: Implement `backend/ml/backtest.py`**

Port `pair_trades_python()` → `pair_trades()` and `compute_stats_python()` → `compute_stats()` from `ml_predictor.py`. Enhance `compute_stats()` to also return:
- `sortino`: Like Sharpe but only downside deviation
- `maxDrawdown`: Maximum peak-to-trough decline in equity curve
- `calmar`: Annualized return / maxDrawdown
- `totalReturn`: Compounded return

Run: `cd backend && python -m pytest tests/test_ml_backtest.py -v`
Expected: ALL PASS

---

## Task 5: 3-Layer Ensemble — `backend/ml/ensemble.py`

**Files:**
- Create: `backend/ml/ensemble.py`
- Create: `backend/tests/test_ml_ensemble.py`

**Context:** This is the core of the new system. It orchestrates 3 layers with walk-forward validation per layer and combines via meta-model. Depends on `ml.features`, `ml.labels`, `ml.models`, `ml.backtest`.

**Step 1: Write tests**

```python
# backend/tests/test_ml_ensemble.py
import numpy as np
import pytest

def _make_ohlcv(n=400):
    np.random.seed(42)
    closes = 100 + np.cumsum(np.random.randn(n) * 0.5)
    highs = closes + np.abs(np.random.randn(n)) * 0.5
    lows = closes - np.abs(np.random.randn(n)) * 0.5
    opens = closes + np.random.randn(n) * 0.2
    volumes = np.abs(np.random.randn(n) * 1000) + 500
    dates = [f'2024-{(i//30)+1:02d}-{(i%30)+1:02d}' for i in range(n)]
    return opens, highs, lows, closes, volumes, dates

def test_train_layer1():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    predictor = EnsemblePredictor()
    result = predictor.train_layer(
        'short_term', o, h, l, c, v,
        forward_period=5, threshold=0.02,
        train_ratio=0.7, n_walks=1, optuna_trials=0,
    )
    assert 'signal' in result
    assert result['signal'] in [-1, 0, 1]
    assert 0 <= result['confidence'] <= 1
    assert 'oos_accuracy' in result

def test_train_layer2():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    predictor = EnsemblePredictor()
    result = predictor.train_layer(
        'medium_term', o, h, l, c, v,
        forward_period=20, threshold=0.03,
        train_ratio=0.7, n_walks=1, optuna_trials=0,
    )
    assert 'trend' in result
    assert result['trend'] in ['uptrend', 'sideways', 'downtrend']

def test_train_layer3():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    predictor = EnsemblePredictor()
    result = predictor.train_risk_layer(o, h, l, c, v, train_ratio=0.7)
    assert 'score' in result
    assert 0 <= result['score'] <= 100
    assert 'components' in result

def test_meta_decision():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(1, 'uptrend', 30) == 'strong_buy'
    assert compute_meta_decision(1, 'uptrend', 55) == 'buy'
    assert compute_meta_decision(1, 'sideways', 40) == 'cautious_buy'
    assert compute_meta_decision(1, 'downtrend', 50) == 'wait'
    assert compute_meta_decision(-1, 'downtrend', 30) == 'strong_sell'
    assert compute_meta_decision(0, 'uptrend', 20) == 'neutral'
    # High risk dampens
    assert compute_meta_decision(1, 'uptrend', 80) != 'strong_buy'

def test_full_pipeline():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    predictor = EnsemblePredictor()
    result = predictor.train_all(
        o, h, l, c, v, d,
        layers_config={
            'short_term': {'forward_period': 5, 'threshold': 0.02},
            'medium_term': {'forward_period': 20, 'threshold': 0.03},
            'risk': {'enabled': True},
        },
        train_ratio=0.7, n_walks=1, optuna_trials=0,
        confidence_threshold=0.5, position_mode='both',
    )
    assert 'layers' in result
    assert 'meta_decision' in result
    assert 'signals' in result
    assert 'trades' in result
    assert 'stats' in result
```

Run: `cd backend && python -m pytest tests/test_ml_ensemble.py -v`
Expected: FAIL

**Step 2: Implement `backend/ml/ensemble.py`**

Key class: `EnsemblePredictor`

```python
class EnsemblePredictor:
    def train_layer(self, layer_name, opens, highs, lows, closes, volumes, **kwargs) -> dict:
        """Train a single classification layer (short_term or medium_term)."""
        # 1. Compute features using ml.features.compute_feature_matrix()
        # 2. Generate labels using ml.labels (short_term_labels or medium_term_labels)
        # 3. Drop correlated features
        # 4. Validate class distribution
        # 5. Map labels to 0-indexed (LABEL_MAP)
        # 6. Feature selection (if top_k specified)
        # 7. Optional Optuna tuning (if optuna_trials > 0)
        # 8. Walk-forward training
        # 9. Aggregate OOS predictions
        # 10. Compute class metrics, feature importance, equity curve
        # Returns layer result dict

    def train_risk_layer(self, opens, highs, lows, closes, volumes, **kwargs) -> dict:
        """Train Layer 3 risk regressor."""
        # 1. Compute features
        # 2. Generate risk targets using ml.labels.compute_risk_target()
        # 3. Train LightGBM regressor (walk-forward)
        # 4. Return score + components for last bar

    def train_all(self, opens, highs, lows, closes, volumes, dates, **kwargs) -> dict:
        """Train all 3 layers + compute meta decision + trades."""
        # 1. Train layer 1 (short-term)
        # 2. Train layer 2 (medium-term)
        # 3. Train layer 3 (risk)
        # 4. Compute meta_decision from 3 layer outputs
        # 5. Generate signals from layer 1 predictions
        # 6. Pair trades using ml.backtest.pair_trades()
        # 7. Compute stats using ml.backtest.compute_stats()
        # 8. Return full response dict
```

Also implement standalone function:
```python
def compute_meta_decision(short_signal: int, medium_trend: str, risk_score: float) -> str:
    """Rule-based meta-model combining 3 layers."""
    # Implementation per design doc meta-model table
```

Run: `cd backend && python -m pytest tests/test_ml_ensemble.py -v`
Expected: ALL PASS

---

## Task 6: Pipeline + Router — `backend/ml/pipeline.py` + `backend/routers/ml.py`

**Files:**
- Create: `backend/ml/pipeline.py`
- Modify: `backend/routers/ml.py` (replace entire content)
- Delete: `backend/ml_features.py`
- Delete: `backend/ml_predictor.py`

**Context:** The pipeline module handles caching and orchestration. The router provides the HTTP endpoints. The old `ml_features.py` and `ml_predictor.py` are deleted. The router currently imports from `ml_predictor` — it must import from `ml.pipeline` instead.

**Step 1: Implement `backend/ml/pipeline.py`**

```python
"""ML training pipeline — caching, orchestration, and cache management."""
import hashlib
import numpy as np
from ml.ensemble import EnsemblePredictor

_model_cache: dict[str, dict] = {}
_MAX_CACHE = 20

def _hash_data(*arrays: np.ndarray) -> str:
    h = hashlib.md5()
    for a in arrays:
        h.update(a.tobytes())
    return h.hexdigest()[:16]

def _cache_key(data_hash: str, config: dict) -> str:
    """Create a deterministic cache key from data hash + training config."""
    # Serialize relevant config fields into key string
    ...

def train(ohlcv: list[dict], config: dict) -> dict:
    """
    Main training entry point. Called by router.
    1. Parse OHLCV arrays from dicts
    2. Check cache
    3. Instantiate EnsemblePredictor
    4. Call train_all()
    5. Cache result
    6. Return result
    """
    ...

def clear_cache():
    """Clear the model cache."""
    _model_cache.clear()
```

**Step 2: Rewrite `backend/routers/ml.py`**

Replace the entire file. New content:

```python
"""ML training API endpoints."""
from typing import Optional
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from log import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["ml"])

class LayerConfig(BaseModel):
    forward_period: int = 5
    threshold: float = 0.02
    threshold_short: Optional[float] = None

class RiskConfig(BaseModel):
    enabled: bool = True

class ModelConfig(BaseModel):
    short_term_model: str = "lightgbm"
    medium_term_model: str = "xgboost+mlp"
    ensemble: bool = True
    mlp_weight: float = 0.4

class TrainingConfig(BaseModel):
    preset: str = "balanced"
    train_ratio: float = 0.7
    n_walks: int = 2
    optuna_trials: int = 30
    feature_select_k: int = 30
    drop_corr_threshold: float = 0.90
    use_boruta: bool = False

class MLTrainRequest(BaseModel):
    ohlcv: list[dict]
    layers: Optional[dict] = None
    model_config: Optional[ModelConfig] = None
    training: Optional[TrainingConfig] = None
    position_mode: str = "both"
    confidence_threshold: float = 0.55

@router.post("/api/ml/train")
def ml_train(req: MLTrainRequest):
    if len(req.ohlcv) < 100:
        raise HTTPException(status_code=422, detail="En az 100 bar veri gerekli")
    try:
        from ml.pipeline import train
        result = train(
            ohlcv=req.ohlcv,
            config={
                'layers': req.layers or {
                    'short_term': {'forward_period': 5, 'threshold': 0.02},
                    'medium_term': {'forward_period': 20, 'threshold': 0.03},
                    'risk': {'enabled': True},
                },
                'model_config': (req.model_config or ModelConfig()).model_dump(),
                'training': (req.training or TrainingConfig()).model_dump(),
                'position_mode': req.position_mode,
                'confidence_threshold': req.confidence_threshold,
            },
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("ML training error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/ml/cache")
def clear_ml_cache():
    from ml.pipeline import clear_cache
    clear_cache()
    return {"cleared": True}
```

**Step 3: Delete old files**

Delete `backend/ml_features.py` and `backend/ml_predictor.py`.

**Step 4: Run all backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL PASS (existing tests in test_symbols.py, test_validation.py should still pass; new ML tests should pass)

---

## Task 7: Frontend API Types — `src/api/borsaApi.ts`

**Files:**
- Modify: `src/api/borsaApi.ts:374-467` — Replace ML types and function

**Context:** The frontend API types must match the new backend response format. The existing `MLSignal`, `MLTrade`, `MLTrainRequest`, `MLClassMetrics`, `MLTrainResponse` interfaces and `trainMLModel()` function (lines 374-467) must be replaced with new types matching the 3-layer response.

**Step 1: Replace ML types in borsaApi.ts**

Replace everything from the `// ── ML Training API ──` comment (line 374) to end of file with:

```typescript
// ── ML Training API (v2 — 3-Layer Ensemble) ─────────

export interface MLSignal {
  barIndex: number;
  signal: number;      // -1, 0, 1
  confidence: number;
  layer?: string;      // 'short_term'
}

export interface MLTrade {
  entryDate: string;
  entryPrice: number;
  entryBarIndex: number;
  exitDate: string;
  exitPrice: number;
  exitBarIndex: number;
  returnPct: number;
  barsHeld: number;
  positionType: 'long' | 'short';
}

export interface MLClassMetrics {
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1: Record<string, number>;
  confusion_matrix: number[][];
  class_labels: string[];
  class_distribution: {
    train: Record<string, number>;
    test: Record<string, number>;
  };
}

export interface MLLayerResult {
  signal?: number;             // Layer 1: -1/0/1
  confidence: number;
  trend?: string;              // Layer 2: 'uptrend'/'sideways'/'downtrend'
  model_type: string;
  oos_accuracy: number;
  class_metrics: MLClassMetrics;
  confusion_matrix: number[][];
  feature_importance: Record<string, number>;
  selected_features: string[];
  equity_curve: number[];
}

export interface MLRiskResult {
  score: number;               // 0-100
  components: {
    volatility: number;
    momentum: number;
    volume: number;
    technical: number;
  };
}

export interface MLWalkForwardResult {
  window: number;
  is_accuracy: number;
  oos_accuracy: number;
  oos_sharpe: number;
}

export interface MLTrainRequest {
  ohlcv: OHLCVData[];
  layers?: {
    short_term?: { forward_period?: number; threshold?: number; threshold_short?: number };
    medium_term?: { forward_period?: number; threshold?: number };
    risk?: { enabled?: boolean };
  };
  model_config?: {
    short_term_model?: string;
    medium_term_model?: string;
    ensemble?: boolean;
    mlp_weight?: number;
  };
  training?: {
    preset?: string;
    train_ratio?: number;
    n_walks?: number;
    optuna_trials?: number;
    feature_select_k?: number;
    drop_corr_threshold?: number;
    use_boruta?: boolean;
  };
  position_mode?: string;
  confidence_threshold?: number;
}

export type MetaDecision =
  | 'strong_buy' | 'buy' | 'cautious_buy'
  | 'neutral' | 'wait'
  | 'cautious_sell' | 'sell' | 'strong_sell';

export interface MLTrainResponse {
  layers: {
    short_term: MLLayerResult;
    medium_term: MLLayerResult;
    risk_score: MLRiskResult;
  };
  meta_decision: MetaDecision;
  signals: MLSignal[];
  trades: MLTrade[];
  stats: {
    totalTrades: number;
    winRate: number;
    avgReturn: number;
    profitFactor: number;
    maxWin: number;
    maxLoss: number;
    totalReturn: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
    calmar: number;
  };
  walk_forward_results: MLWalkForwardResult[];
  warnings: string[];
  training_meta: {
    total_features: number;
    selected_features: number;
    total_bars: number;
    training_bars: number;
    optuna_trials: number;
    best_trial_score: number;
  };
}

export async function trainMLModel(req: MLTrainRequest): Promise<MLTrainResponse> {
  const res = await fetch(`${BACKEND_URL}/api/ml/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return res.json();
}

export async function clearMLCache(): Promise<void> {
  await fetch(`${BACKEND_URL}/api/ml/cache`, { method: 'DELETE' });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build may show errors from MLPanel.tsx which still imports old types — that's expected and will be fixed when MLPanel is replaced.

---

## Task 8: StatusCard + TrainControls Components

**Files:**
- Create: `src/components/MLDashboard/StatusCard.tsx`
- Create: `src/components/MLDashboard/TrainControls.tsx`
- Create: `src/components/MLDashboard/MLDashboard.css`

**Context:** These are the top 2 sections of the ML Dashboard. StatusCard shows the 3-layer status with meta-decision badge. TrainControls has presets, position mode, and train button with progress. The CSS file styles all MLDashboard components.

**StatusCard layout:**
```
┌─────────────────────────────────────────┐
│ Kısa Vade: 🟢 AL %72   │ Risk: ██ 62  │
│ Orta Vade: 🟢 YUKARI    │              │
│          → GÜÇLÜ AL                     │
└─────────────────────────────────────────┘
```

**TrainControls layout:**
```
[Hızlı] [Dengeli] [Derin]    Pozisyon: [2 Yön ▾]
[████████████░░░░ %78  Kalan: 45sn]    [Eğit 🚀]
```

**StatusCard Props:**
```typescript
interface StatusCardProps {
  layers: MLTrainResponse['layers'] | null;
  metaDecision: MetaDecision | null;
}
```

**TrainControls Props:**
```typescript
interface TrainControlsProps {
  onTrain: (preset: 'fast' | 'balanced' | 'deep') => void;
  training: boolean;
  progress: number;          // 0-100
  eta: string;               // "45sn" or ""
  error: string | null;
  warnings: string[];
  positionMode: string;
  onPositionModeChange: (mode: string) => void;
}
```

Use CSS custom properties from `variables.css` for theming. Badge colors:
- strong_buy / buy: `var(--bullish-color)` or green
- cautious_buy: yellow-green
- neutral / wait: `var(--neutral-text)` or gray
- cautious_sell: orange
- sell / strong_sell: `var(--bearish-color)` or red

Risk gauge: CSS gradient bar from green (0) → yellow (50) → red (100).

All text in Turkish. Use existing `getThemeColors()` pattern from the codebase if needed.

---

## Task 9: BacktestResults + ModelDetails Components

**Files:**
- Create: `src/components/MLDashboard/BacktestResults.tsx`
- Create: `src/components/MLDashboard/ModelDetails.tsx`

**Context:** These are sections 4 and 5 of the dashboard. BacktestResults shows equity curve + stats + trade table. ModelDetails shows feature importance + confusion matrix.

**BacktestResults Props:**
```typescript
interface BacktestResultsProps {
  stats: MLTrainResponse['stats'] | null;
  equityCurve: number[];          // From layer 1
  trades: MLTrade[];
  walkForwardResults: MLWalkForwardResult[];
}
```

**BacktestResults layout:**
- Mini equity curve chart using Recharts `<AreaChart>` (in-sample blue, OOS orange)
- Stats row: Sharpe | Win Rate | PF | Max DD | Sortino | Calmar
- Collapsible trade table (default collapsed, click to expand)

**ModelDetails Props:**
```typescript
interface ModelDetailsProps {
  layers: MLTrainResponse['layers'] | null;
  trainingMeta: MLTrainResponse['training_meta'] | null;
}
```

**ModelDetails layout:**
- Feature importance horizontal bar chart using Recharts `<BarChart>` (top 20 features, grouped by indicator category)
- Confusion matrix: 3×3 grid with color intensity (darker = more counts)
- Class metrics table: Precision/Recall/F1 for Buy/Neutral/Sell
- Walk-forward window results (if >1 window): small table with IS/OOS accuracy per window
- Training meta: "83 feature → 30 seçildi | 350 bar eğitim | Optuna: 30 trial"

Both components should be collapsible sections (start expanded). Use `<details>/<summary>` or a simple toggle state.

---

## Task 10: SignalCombinator Component (5 Modes)

**Files:**
- Create: `src/components/MLDashboard/SignalCombinator.tsx`

**Context:** This is section 3 of the dashboard — the most complex component. It replaces the simple AND/OR toggle with 5 combination modes. Each mode has its own configuration UI.

**Props:**
```typescript
interface SignalCombinatorProps {
  featureImportance: Record<string, number> | null;  // From ML for auto-weights
  onApplyConfig: (config: SignalConfig) => void;
  data: OHLCVData[];
  dateRange: { start?: string; end?: string };
}
```

**5 Modes UI:**

1. **Ağırlıklı Oylama (Weighted Voting):**
   - 8 indicator sliders (0-100) — auto-populated from ML feature importance
   - Threshold slider (30-70 for buy/sell trigger)
   - "ML'den Yükle" button to reset weights from feature importance

2. **Koşullu Zincirler (Conditional Chains):**
   - Rule builder: dropdown (indicator) + dropdown (condition) + value input
   - "Kural Ekle" button, max 5 rules
   - Each rule has delete (×) button
   - All rules must match for signal

3. **Onay Modu (Confirmation):**
   - Primary indicator dropdown
   - Confirmation indicator dropdown
   - "N bar içinde onay" number input (1-10)
   - Simple two-step configuration

4. **Rejim Bazlı (Regime-Adaptive):**
   - 3 regime sections: Düşük Volatilite | Yüksek Volatilite | Yatay Piyasa
   - Each section: checkboxes for which indicators are active
   - Regime detection is automatic (using ATR percentile + ADX)

5. **Sürekli Skor (Continuous Scoring):**
   - Same 8 indicator weight sliders as Mode 1
   - 5 threshold levels displayed (Strong Buy > 70, Buy > 30, etc.)
   - Score display showing current composite score for last bar

**Signal history table** (below mode selector):
- Last 20 signals with date, direction, confidence
- Uses existing `computeCombinedSignals()` and `pairTrades()` from `signalDetection.ts`

All text in Turkish.

---

## Task 11: SettingsDrawer Component

**Files:**
- Create: `src/components/MLDashboard/SettingsDrawer.tsx`

**Context:** Modal/drawer opened by ⚙ icon in the dashboard header. Contains all advanced ML training settings.

**Props:**
```typescript
interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: MLSettings;
  onSettingsChange: (settings: MLSettings) => void;
}

interface MLSettings {
  shortTermModel: 'lightgbm' | 'xgboost';
  mediumTermModel: 'xgboost+mlp' | 'xgboost' | 'lightgbm';
  ensemble: boolean;
  mlpWeight: number;          // 0.1-0.9
  shortForwardPeriod: number; // 3, 5, 10
  mediumForwardPeriod: number;// 10, 20, 40
  shortThreshold: number;     // 0.01, 0.02, 0.03
  shortThresholdShort: number;
  mediumThreshold: number;
  nWalks: number;             // 1-5
  trainRatio: number;         // 0.5-0.9
  featureSelectK: number;     // 15-50
  dropCorrThreshold: number;  // 0.80-0.99
  confidenceThreshold: number;// 0.40-0.70
  riskEnabled: boolean;
}
```

**Layout:**
- Overlay/drawer from right side (common pattern in the app)
- Grouped sections: "Model Ayarları", "Eğitim Ayarları", "Feature Ayarları"
- Each setting: label + input control (dropdown/slider/toggle)
- "Varsayılan" (Default) button to reset
- "Kapat" button

---

## Task 12: MLDashboard Main + Integration

**Files:**
- Create: `src/components/MLDashboard/MLDashboard.tsx`
- Modify: `src/components/SignalPanel/SignalPanel.tsx` — Replace MLPanel with MLDashboard
- Delete: `src/components/SignalPanel/MLPanel.tsx`

**Context:** MLDashboard is the container that combines all 5 sections + settings drawer. It manages state for training, API calls, and settings. Then it replaces MLPanel in SignalPanel.tsx.

**MLDashboard Props (same as old MLPanel):**
```typescript
interface Props {
  data: OHLCVData[];
  dateRange: { start?: string; end?: string };
  onApplyConfig: (config: SignalConfig) => void;
  hidden?: boolean;
}
```

**State management inside MLDashboard:**
```typescript
const [mlResult, setMlResult] = useState<MLTrainResponse | null>(null);
const [training, setTraining] = useState(false);
const [progress, setProgress] = useState(0);
const [eta, setEta] = useState('');
const [error, setError] = useState<string | null>(null);
const [settings, setSettings] = useState<MLSettings>(DEFAULT_SETTINGS);
const [settingsOpen, setSettingsOpen] = useState(false);
const [positionMode, setPositionMode] = useState<string>('both');
```

**Train handler:**
```typescript
const handleTrain = async (preset: 'fast' | 'balanced' | 'deep') => {
  setTraining(true);
  setProgress(0);
  setError(null);
  const startTime = Date.now();

  // Map preset to optuna trials
  const presetMap = { fast: 10, balanced: 30, deep: 50 };
  const walksMap = { fast: 1, balanced: 2, deep: 3 };

  try {
    const result = await trainMLModel({
      ohlcv: data,
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
      model_config: {
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
    if (result.warnings?.length) {
      // Show warnings
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setTraining(false);
    setProgress(100);
  }
};
```

**Render:**
```tsx
if (hidden) return null;
return (
  <div className="ml-dashboard">
    <div className="ml-dashboard-header">
      <h3>ML Analiz</h3>
      <button onClick={() => setSettingsOpen(true)}>⚙</button>
    </div>

    <StatusCard layers={mlResult?.layers} metaDecision={mlResult?.meta_decision} />

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

    <SignalCombinator
      featureImportance={mlResult?.layers.short_term.feature_importance ?? null}
      onApplyConfig={onApplyConfig}
      data={data}
      dateRange={dateRange}
    />

    <BacktestResults
      stats={mlResult?.stats ?? null}
      equityCurve={mlResult?.layers.short_term.equity_curve ?? []}
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
```

**Integration in SignalPanel.tsx:**

Replace:
```tsx
const MLPanel = lazy(() => import('./MLPanel'));
```
With:
```tsx
const MLDashboard = lazy(() => import('../MLDashboard/MLDashboard'));
```

Replace the MLPanel Suspense block:
```tsx
<Suspense fallback={<div className="sp-no-trades">ML paneli yukleniyor...</div>}>
  <MLPanel data={data} dateRange={dateRange} onApplyConfig={...} hidden={activeTab !== 'ml'} />
</Suspense>
```
With:
```tsx
<Suspense fallback={<div className="sp-no-trades">ML paneli yukleniyor...</div>}>
  <MLDashboard data={data} dateRange={dateRange} onApplyConfig={...} hidden={activeTab !== 'ml'} />
</Suspense>
```

Delete `src/components/SignalPanel/MLPanel.tsx`.

**Step: Verify build**

Run: `npm run build`
Expected: SUCCESS

Run: `npx vitest run`
Expected: ALL existing tests pass (51 tests)

---

## Task 13: Final Verification + Cleanup

**Files:**
- Verify all tests pass
- Clean up any unused imports

**Step 1: Run all backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL PASS

**Step 2: Run frontend build**

Run: `npm run build`
Expected: SUCCESS with code splitting (MLDashboard should appear as separate chunk)

**Step 3: Run frontend tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Verify no imports of deleted files**

Run grep for old imports:
- `ml_features` should not appear in any Python file
- `ml_predictor` should not appear in any Python file
- `MLPanel` should not appear in any TypeScript file (except maybe type re-exports)

**Step 5: Start both servers and verify**

```bash
# Terminal 1:
cd backend && uvicorn main:app --port 8001

# Terminal 2:
npm run dev
```

Open the app, navigate to ML tab, verify:
1. Dashboard loads without errors
2. Preset buttons are visible
3. Train button triggers API call
4. Results display correctly after training

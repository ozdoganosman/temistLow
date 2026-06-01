"""3-Layer Ensemble Predictor with Meta-Model."""
from __future__ import annotations

import numpy as np
import pandas as pd
from collections import Counter

from ml.features import compute_feature_matrix, drop_correlated_features
from ml.labels import (compute_short_term_labels, compute_medium_term_labels,
                        compute_risk_target, validate_class_distribution)
from ml.models import (create_model, train_model, predict_proba, tune_hyperparameters,
                        select_features_by_importance, compute_sample_weights, LABEL_MAP, INV_LABEL_MAP)
from ml.backtest import pair_trades, compute_stats
from log import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Trend name mapping for medium-term layer
# ---------------------------------------------------------------------------
TREND_MAP = {1: 'uptrend', 0: 'sideways', -1: 'downtrend'}

# Downgrade table for high risk
_DOWNGRADE = {
    'strong_buy': 'buy',
    'buy': 'cautious_buy',
    'cautious_buy': 'wait',
    'strong_sell': 'sell',
    'sell': 'cautious_sell',
    'cautious_sell': 'wait',
}


def compute_meta_decision(short_signal: int, medium_trend: str, risk_score: float) -> str:
    """Rule-based combiner for the 3-layer ensemble.

    Parameters
    ----------
    short_signal : int
        +1 (BUY), 0 (NEUTRAL), or -1 (SHORT) from Layer 1.
    medium_trend : str
        'uptrend', 'sideways', or 'downtrend' from Layer 2.
    risk_score : float
        0-100 risk/opportunity score from Layer 3.

    Returns
    -------
    str
        One of: 'strong_buy', 'buy', 'cautious_buy', 'neutral', 'wait',
        'cautious_sell', 'sell', 'strong_sell'.
    """
    if short_signal == 0:
        return 'neutral'

    decision = 'wait'

    if short_signal == 1:
        if medium_trend == 'uptrend':
            if risk_score < 40:
                decision = 'strong_buy'
            elif risk_score <= 70:
                decision = 'buy'
            else:
                decision = 'buy'  # will be downgraded below
        elif medium_trend == 'sideways':
            if risk_score < 50:
                decision = 'cautious_buy'
            else:
                decision = 'wait'
        elif medium_trend == 'downtrend':
            decision = 'wait'

    elif short_signal == -1:
        if medium_trend == 'downtrend':
            if risk_score < 40:
                decision = 'strong_sell'
            elif risk_score <= 70:
                decision = 'sell'
            else:
                decision = 'sell'  # will be downgraded below
        elif medium_trend == 'sideways':
            if risk_score < 50:
                decision = 'cautious_sell'
            else:
                decision = 'wait'
        elif medium_trend == 'uptrend':
            decision = 'wait'

    # High risk downgrade: if risk_score > 70, downgrade one level
    if risk_score > 70 and decision in _DOWNGRADE:
        decision = _DOWNGRADE[decision]

    return decision


class EnsemblePredictor:
    """3-layer ensemble predictor with walk-forward training."""

    def __init__(self):
        self.layer_results = {}
        self.models = {}

    # ------------------------------------------------------------------
    # Walk-forward training engine
    # ------------------------------------------------------------------

    def _walk_forward_train(self, X, y_mapped, model_types, train_ratio,
                            n_walks, purge_gap, optuna_trials, feature_names):
        """Walk-forward training for classification layers.

        Parameters
        ----------
        X : np.ndarray
            Feature matrix (n_samples, n_features).
        y_mapped : np.ndarray
            0-indexed labels (0, 1, 2).
        model_types : list[str]
            Model type strings, e.g. ['lightgbm'] or ['xgboost', 'mlp'].
        train_ratio : float
            Fraction of data for training.
        n_walks : int
            Number of walk-forward windows (1-5).
        purge_gap : int
            Bars to skip between train and test sets.
        optuna_trials : int
            Number of Optuna trials (0 = skip tuning).
        feature_names : list[str]
            Feature column names.

        Returns
        -------
        dict with keys:
            'oos_predictions', 'oos_proba', 'oos_indices', 'oos_accuracy',
            'class_metrics', 'feature_importance', 'equity_curve', 'models'
        """
        n = len(X)
        min_train = 50
        min_test = 10

        all_oos_preds = []
        all_oos_proba = []
        all_oos_indices = []
        all_oos_true = []
        all_models = []

        if n_walks <= 1:
            # Simple single train/test split
            split = int(n * train_ratio)
            if split < min_train:
                raise ValueError(
                    f"Yetersiz eğitim verisi: {split} bar (en az {min_train} gerekli)"
                )
            test_start = min(split + purge_gap, n)
            test_end = n
            if (test_end - test_start) < min_test:
                raise ValueError(
                    f"Yetersiz test verisi: {test_end - test_start} bar "
                    f"(en az {min_test} gerekli)"
                )

            windows = [(0, split, test_start, test_end)]
        else:
            # Expanding window walk-forward
            split = int(n * train_ratio)
            if split < min_train:
                raise ValueError(
                    f"Yetersiz eğitim verisi: {split} bar (en az {min_train} gerekli)"
                )
            test_region_size = n - split - purge_gap
            if test_region_size < min_test:
                raise ValueError(
                    f"Yetersiz test bölgesi: {test_region_size} bar"
                )
            window_size = max(min_test, test_region_size // n_walks)
            windows = []
            for w in range(n_walks):
                test_s = split + purge_gap + w * window_size
                test_e = min(test_s + window_size, n)
                if test_e <= test_s:
                    break
                if (test_e - test_s) < min_test and w > 0:
                    break
                # Expanding: train uses all data up to the purge boundary
                train_end = test_s - purge_gap
                if train_end < min_train:
                    train_end = min_train
                windows.append((0, train_end, test_s, test_e))

        if not windows:
            raise ValueError("Walk-forward pencereleri oluşturulamadı")

        for train_start, train_end, test_start, test_end in windows:
            X_train = X[train_start:train_end]
            y_train = y_mapped[train_start:train_end]
            X_test = X[test_start:test_end]
            y_test = y_mapped[test_start:test_end]

            if len(X_test) == 0:
                continue

            # Train each model type and collect probabilities
            window_models = []
            proba_list = []

            for mt in model_types:
                # Optional Optuna tuning
                best_params = None
                if optuna_trials > 0:
                    try:
                        best_params = tune_hyperparameters(
                            X_train, y_train, mt, n_trials=optuna_trials
                        )
                        logger.info("Optuna %s: en iyi parametreler = %s", mt, best_params)
                    except Exception as e:
                        logger.warning("Optuna tuning hatasi (%s): %s", mt, e)

                model = create_model(mt, best_params)
                train_model(model, X_train, y_train, model_type=mt)
                window_models.append(model)

                proba = predict_proba(model, X_test)
                proba_list.append(proba)

            all_models.extend(window_models)

            # Average probabilities across model types (ensemble)
            if len(proba_list) == 1:
                avg_proba = proba_list[0]
            else:
                avg_proba = np.mean(proba_list, axis=0)

            # Predictions from averaged probabilities
            preds_mapped = np.argmax(avg_proba, axis=1)

            # Map back to original labels
            preds_original = np.array([INV_LABEL_MAP[p] for p in preds_mapped])

            all_oos_preds.extend(preds_original)
            all_oos_proba.extend(avg_proba)
            all_oos_indices.extend(range(test_start, test_start + len(preds_original)))
            all_oos_true.extend(y_test)

        all_oos_preds = np.array(all_oos_preds)
        all_oos_proba = np.array(all_oos_proba)
        all_oos_true = np.array(all_oos_true)

        # Accuracy (compare 0-indexed predictions with 0-indexed true)
        preds_0idx = np.array([LABEL_MAP[p] for p in all_oos_preds])
        oos_accuracy = float(np.mean(preds_0idx == all_oos_true)) if len(all_oos_true) > 0 else 0.0

        # Class metrics (precision, recall, F1, confusion matrix)
        class_metrics = self._compute_class_metrics(all_oos_true, preds_0idx)

        # Feature importance from last trained model (first model type)
        feature_importance = {}
        if all_models:
            last_model = all_models[-1]
            if hasattr(last_model, 'feature_importances_'):
                importances = last_model.feature_importances_
                for i, imp in enumerate(importances):
                    if i < len(feature_names):
                        feature_importance[feature_names[i]] = float(imp)

        # Equity curve: not computed here (needs forward returns from closes)
        # The caller (train_layer / train_all) will build it from oos_predictions + closes
        equity_curve = [1.0]

        return {
            'oos_predictions': all_oos_preds,
            'oos_proba': all_oos_proba,
            'oos_indices': list(all_oos_indices),
            'oos_accuracy': oos_accuracy,
            'class_metrics': class_metrics,
            'feature_importance': feature_importance,
            'equity_curve': equity_curve,
            'models': all_models,
        }

    @staticmethod
    def _compute_class_metrics(y_true, y_pred):
        """Compute per-class precision/recall/F1 and confusion matrix."""
        classes = sorted(set(y_true) | set(y_pred))
        n_classes = len(classes)
        class_to_idx = {c: i for i, c in enumerate(classes)}

        # Confusion matrix
        cm = [[0] * n_classes for _ in range(n_classes)]
        for t, p in zip(y_true, y_pred):
            cm[class_to_idx[t]][class_to_idx[p]] += 1

        # Per-class precision, recall, F1
        precision = {}
        recall = {}
        f1 = {}
        for c in classes:
            ci = class_to_idx[c]
            tp = cm[ci][ci]
            fp = sum(cm[r][ci] for r in range(n_classes)) - tp
            fn = sum(cm[ci]) - tp

            p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f = 2 * p * r / (p + r) if (p + r) > 0 else 0.0

            precision[int(c)] = round(p, 4)
            recall[int(c)] = round(r, 4)
            f1[int(c)] = round(f, 4)

        return {
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'confusion_matrix': cm,
        }

    # ------------------------------------------------------------------
    # Equity curve builder
    # ------------------------------------------------------------------

    @staticmethod
    def _build_equity_curve(oos_preds, oos_indices, closes, forward_period):
        """Build equity curve from OOS predictions and actual forward returns.

        Start at 1.0. For each OOS prediction:
        - BUY (+1): multiply by (1 + actual_forward_return)
        - SHORT (-1): multiply by (1 - actual_forward_return)
        - NEUTRAL (0): no change
        """
        equity = [1.0]
        n = len(closes)
        for pred, idx in zip(oos_preds, oos_indices):
            if idx + forward_period >= n:
                continue
            fwd_ret = (closes[idx + forward_period] - closes[idx]) / closes[idx] if closes[idx] != 0 else 0.0
            if pred == 1:
                equity.append(equity[-1] * (1 + fwd_ret))
            elif pred == -1:
                equity.append(equity[-1] * (1 - fwd_ret))
            else:
                equity.append(equity[-1])
        return equity

    # ------------------------------------------------------------------
    # Layer 1 & 2: Classification layers
    # ------------------------------------------------------------------

    def train_layer(self, layer_name, opens, highs, lows, closes, volumes,
                    forward_period=5, threshold=0.02, threshold_short=None,
                    train_ratio=0.7, n_walks=1, optuna_trials=0,
                    feature_select_k=30, drop_corr_threshold=0.90,
                    model_types=None) -> dict:
        """Train Layer 1 (short_term) or Layer 2 (medium_term).

        Parameters
        ----------
        layer_name : str
            'short_term' or 'medium_term'.
        opens, highs, lows, closes, volumes : array-like
            OHLCV data.
        forward_period : int
            Label look-ahead period.
        threshold : float
            Label classification threshold.
        threshold_short : float or None
            Short threshold (Layer 1 only).
        train_ratio : float
            Training data fraction.
        n_walks : int
            Number of walk-forward windows.
        optuna_trials : int
            Optuna trial count (0 = skip).
        feature_select_k : int
            Number of top features to select.
        drop_corr_threshold : float
            Correlation threshold for dropping features.
        model_types : list[str] or None
            Override model types.

        Returns
        -------
        dict matching MLLayerResult schema.
        """
        opens = np.asarray(opens, dtype=float)
        highs = np.asarray(highs, dtype=float)
        lows = np.asarray(lows, dtype=float)
        closes = np.asarray(closes, dtype=float)
        volumes = np.asarray(volumes, dtype=float)

        # Default model types per layer
        if model_types is None:
            if layer_name == 'short_term':
                model_types = ['lightgbm']
            else:
                model_types = ['xgboost', 'mlp']

        logger.info("Katman %s egitimi basliyor: model_types=%s, forward=%d, threshold=%.3f",
                     layer_name, model_types, forward_period, threshold)

        # 1. Compute features
        feat_df = compute_feature_matrix(opens, highs, lows, closes, volumes)

        # 2. Drop correlated features
        feat_df = drop_correlated_features(feat_df, threshold=drop_corr_threshold)

        # 3. Compute labels
        if layer_name == 'short_term':
            labels = compute_short_term_labels(
                closes, forward_period=forward_period,
                threshold=threshold, threshold_short=threshold_short
            )
        else:
            labels = compute_medium_term_labels(
                closes, forward_period=forward_period,
                threshold=threshold
            )

        # 4. Join features + labels, dropna
        feat_df = feat_df.copy()
        feat_df['_label'] = labels
        clean = feat_df.dropna().reset_index(drop=False)
        clean = clean.rename(columns={'index': '_orig_idx'})

        if len(clean) < 60:
            raise ValueError(
                f"Yetersiz temiz veri: {len(clean)} bar (en az 60 gerekli)"
            )

        # 5. Validate class distribution
        clean_labels = clean['_label'].values
        validate_class_distribution(clean_labels)

        # 6. Map labels to 0-indexed
        y_mapped = np.array([LABEL_MAP[int(lbl)] for lbl in clean_labels])

        # Extract feature columns
        feature_cols = [c for c in clean.columns if c not in ('_label', '_orig_idx')]
        X_all = clean[feature_cols].values
        orig_indices = clean['_orig_idx'].values.astype(int)

        # 7. Feature selection by importance
        actual_k = min(feature_select_k, len(feature_cols))
        sel_indices, sel_names = select_features_by_importance(
            X_all, y_mapped, feature_cols, top_k=actual_k
        )
        X_selected = X_all[:, sel_indices]

        # 8. Walk-forward train
        purge_gap = max(forward_period, 5)
        wf_result = self._walk_forward_train(
            X_selected, y_mapped, model_types,
            train_ratio=train_ratio, n_walks=n_walks,
            purge_gap=purge_gap, optuna_trials=optuna_trials,
            feature_names=sel_names
        )

        # Build equity curve using original indices
        oos_orig_indices = [int(orig_indices[i]) for i in wf_result['oos_indices']]
        equity_curve = self._build_equity_curve(
            wf_result['oos_predictions'], oos_orig_indices,
            closes, forward_period
        )

        # 9. Determine signal and confidence from last OOS prediction
        if len(wf_result['oos_predictions']) > 0:
            signal = int(wf_result['oos_predictions'][-1])
            last_proba = wf_result['oos_proba'][-1]
            pred_class = LABEL_MAP[signal]
            confidence = float(last_proba[pred_class])
        else:
            signal = 0
            confidence = 0.0

        # 10. For medium_term: map signal to trend name
        trend = None
        if layer_name == 'medium_term':
            trend = TREND_MAP.get(signal, 'sideways')

        # Store models
        self.models[layer_name] = wf_result['models']

        # Build and return result dict
        result = {
            'signal': signal,
            'confidence': round(confidence, 4),
            'model_type': '+'.join(model_types),
            'oos_accuracy': round(wf_result['oos_accuracy'], 4),
            'class_metrics': wf_result['class_metrics'],
            'confusion_matrix': wf_result['class_metrics'].get('confusion_matrix', []),
            'feature_importance': wf_result['feature_importance'],
            'selected_features': sel_names,
            'equity_curve': equity_curve,
        }

        if trend is not None:
            result['trend'] = trend

        # Store for later use
        self.layer_results[layer_name] = result
        self.layer_results[f'{layer_name}_wf'] = wf_result
        self.layer_results[f'{layer_name}_orig_indices'] = oos_orig_indices

        logger.info("Katman %s egitimi tamamlandi: sinyal=%d, guven=%.2f, oos_acc=%.2f%%",
                     layer_name, signal, confidence, wf_result['oos_accuracy'] * 100)

        return result

    # ------------------------------------------------------------------
    # Layer 3: Risk/Strength regressor
    # ------------------------------------------------------------------

    def train_risk_layer(self, opens, highs, lows, closes, volumes,
                          train_ratio=0.7, optuna_trials=0,
                          feature_select_k=30, drop_corr_threshold=0.90) -> dict:
        """Train Layer 3: Risk/Strength regressor.

        Returns
        -------
        dict with 'score' (0-100) and 'components' dict.
        """
        opens = np.asarray(opens, dtype=float)
        highs = np.asarray(highs, dtype=float)
        lows = np.asarray(lows, dtype=float)
        closes = np.asarray(closes, dtype=float)
        volumes = np.asarray(volumes, dtype=float)

        logger.info("Risk katmani egitimi basliyor")

        # 1. Compute features
        feat_df = compute_feature_matrix(opens, highs, lows, closes, volumes)

        # 2. Compute risk targets
        risk_targets = compute_risk_target(highs, lows, closes, volumes)

        # 3. Join and dropna
        feat_df = feat_df.copy()
        feat_df['_target'] = risk_targets
        clean = feat_df.dropna().reset_index(drop=False)
        clean = clean.rename(columns={'index': '_orig_idx'})

        if len(clean) < 60:
            raise ValueError(
                f"Yetersiz temiz veri: {len(clean)} bar (en az 60 gerekli)"
            )

        feature_cols = [c for c in clean.columns if c not in ('_target', '_orig_idx')]
        X_all = clean[feature_cols].values
        y_target = clean['_target'].values
        orig_indices = clean['_orig_idx'].values.astype(int)

        # Drop correlated
        feat_sub = pd.DataFrame(X_all, columns=feature_cols)
        feat_sub = drop_correlated_features(feat_sub, threshold=drop_corr_threshold)
        feature_cols = list(feat_sub.columns)
        X_all = feat_sub.values

        # Feature selection (use a quick classification proxy for importance)
        actual_k = min(feature_select_k, len(feature_cols))
        # Create a pseudo-classification target for feature selection
        y_pseudo = np.digitize(y_target, bins=[33.3, 66.6]).astype(int)
        sel_indices, sel_names = select_features_by_importance(
            X_all, y_pseudo, feature_cols, top_k=actual_k
        )
        X_selected = X_all[:, sel_indices]

        # 4. Train/test split
        split = int(len(X_selected) * train_ratio)
        X_train = X_selected[:split]
        y_train = y_target[:split]
        X_test = X_selected[split:]

        # Train LightGBM regressor
        model = create_model('lightgbm_regressor')
        model.fit(X_train, y_train)

        # 5. Get predictions
        if len(X_test) > 0:
            preds = model.predict(X_test)
            last_pred = float(np.clip(preds[-1], 0, 100))
        else:
            last_pred = 50.0

        # Also predict on last available bar
        if len(X_selected) > 0:
            raw_pred = model.predict(X_selected[-1:])[0]
            last_bar_pred = float(np.clip(raw_pred, 0, 100))
        else:
            last_bar_pred = last_pred

        score = last_bar_pred

        # 6. Component breakdown (heuristic from features)
        components = self._compute_risk_components(
            closes, highs, lows, volumes
        )

        self.models['risk'] = model

        result = {
            'score': round(score, 2),
            'components': components,
        }

        self.layer_results['risk_score'] = result

        logger.info("Risk katmani egitimi tamamlandi: skor=%.1f", score)

        return result

    @staticmethod
    def _compute_risk_components(closes, highs, lows, volumes):
        """Compute component breakdown for the risk layer.

        Uses simple heuristics from the last 20 bars of data.
        """
        n = len(closes)
        lookback = min(20, n - 1)

        # Volatility: recent ATR as fraction of price
        if lookback >= 2:
            recent_ranges = highs[-lookback:] - lows[-lookback:]
            avg_range = float(np.mean(recent_ranges))
            volatility = min(100.0, (avg_range / closes[-1]) * 1000) if closes[-1] > 0 else 50.0
        else:
            volatility = 50.0

        # Momentum: fraction of positive returns in recent bars
        if lookback >= 2:
            recent_returns = np.diff(closes[-lookback-1:]) / closes[-lookback-1:-1]
            pos_frac = float(np.sum(recent_returns > 0) / len(recent_returns))
            momentum = pos_frac * 100
        else:
            momentum = 50.0

        # Volume: recent volume vs average
        if lookback >= 5:
            recent_vol = float(np.mean(volumes[-5:]))
            avg_vol = float(np.mean(volumes[-lookback:])) if lookback > 0 else recent_vol
            vol_ratio = recent_vol / avg_vol if avg_vol > 0 else 1.0
            volume = min(100.0, vol_ratio * 50)
        else:
            volume = 50.0

        # Technical: trend strength from price vs moving average
        if n >= 20:
            sma20_val = float(np.mean(closes[-20:]))
            technical = min(100.0, max(0.0, ((closes[-1] / sma20_val) - 0.95) * 1000))
        else:
            technical = 50.0

        return {
            'volatility': round(volatility, 2),
            'momentum': round(momentum, 2),
            'volume': round(volume, 2),
            'technical': round(technical, 2),
        }

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    def train_all(self, opens, highs, lows, closes, volumes, dates,
                  layers_config=None, model_config=None,
                  train_ratio=0.7, n_walks=1, optuna_trials=0,
                  feature_select_k=30, drop_corr_threshold=0.90,
                  confidence_threshold=0.55, position_mode='both') -> dict:
        """Full pipeline: train all 3 layers, compute meta decision, signals & trades.

        Parameters
        ----------
        opens, highs, lows, closes, volumes : array-like
            OHLCV data.
        dates : list[str]
            Date strings aligned to bar array.
        layers_config : dict or None
            Per-layer configuration overrides.
        model_config : dict or None
            Model configuration overrides.
        train_ratio : float
            Training data fraction.
        n_walks : int
            Walk-forward windows.
        optuna_trials : int
            Optuna trial count.
        feature_select_k : int
            Top features to select.
        drop_corr_threshold : float
            Correlation drop threshold.
        confidence_threshold : float
            Minimum confidence for signal generation.
        position_mode : str
            'long-only', 'short-only', or 'both'.

        Returns
        -------
        dict with full pipeline results.
        """
        opens = np.asarray(opens, dtype=float)
        highs = np.asarray(highs, dtype=float)
        lows = np.asarray(lows, dtype=float)
        closes = np.asarray(closes, dtype=float)
        volumes = np.asarray(volumes, dtype=float)

        warnings_list = []
        layers_config = layers_config or {}
        model_config = model_config or {}

        # Parse model config
        short_model_types = None
        medium_model_types = None

        if 'short_term_model' in model_config:
            mt = model_config['short_term_model']
            short_model_types = mt.split('+') if '+' in mt else [mt]

        if 'medium_term_model' in model_config:
            mt = model_config['medium_term_model']
            medium_model_types = mt.split('+') if '+' in mt else [mt]

        # Layer configs
        st_config = layers_config.get('short_term', {})
        mt_config = layers_config.get('medium_term', {})
        risk_config = layers_config.get('risk', {})
        risk_enabled = risk_config.get('enabled', True)

        # Compute features once for metadata
        feat_df = compute_feature_matrix(opens, highs, lows, closes, volumes)
        total_features = feat_df.shape[1]

        # ---- Layer 1: Short-term ----
        logger.info("=== Katman 1: Kisa vadeli sinyal ===")
        st_forward = st_config.get('forward_period', 5)
        st_threshold = st_config.get('threshold', 0.02)
        st_threshold_short = st_config.get('threshold_short', None)

        layer1_result = self.train_layer(
            'short_term', opens, highs, lows, closes, volumes,
            forward_period=st_forward,
            threshold=st_threshold,
            threshold_short=st_threshold_short,
            train_ratio=train_ratio,
            n_walks=n_walks,
            optuna_trials=optuna_trials,
            feature_select_k=feature_select_k,
            drop_corr_threshold=drop_corr_threshold,
            model_types=short_model_types,
        )

        # ---- Layer 2: Medium-term ----
        logger.info("=== Katman 2: Orta vadeli trend ===")
        mt_forward = mt_config.get('forward_period', 20)
        mt_threshold = mt_config.get('threshold', 0.03)

        layer2_result = self.train_layer(
            'medium_term', opens, highs, lows, closes, volumes,
            forward_period=mt_forward,
            threshold=mt_threshold,
            train_ratio=train_ratio,
            n_walks=n_walks,
            optuna_trials=optuna_trials,
            feature_select_k=feature_select_k,
            drop_corr_threshold=drop_corr_threshold,
            model_types=medium_model_types,
        )

        # ---- Layer 3: Risk ----
        risk_result = {'score': 50.0, 'components': {
            'volatility': 50.0, 'momentum': 50.0,
            'volume': 50.0, 'technical': 50.0
        }}
        if risk_enabled:
            logger.info("=== Katman 3: Risk/guc ===")
            risk_result = self.train_risk_layer(
                opens, highs, lows, closes, volumes,
                train_ratio=train_ratio,
                optuna_trials=optuna_trials,
                feature_select_k=feature_select_k,
                drop_corr_threshold=drop_corr_threshold,
            )

        # ---- Meta decision ----
        short_signal = layer1_result['signal']
        medium_trend = layer2_result.get('trend', 'sideways')
        risk_score = risk_result['score']

        meta_decision = compute_meta_decision(short_signal, medium_trend, risk_score)

        # ---- Signal generation from Layer 1 OOS predictions ----
        signals = []
        wf_l1 = self.layer_results.get('short_term_wf', {})
        oos_preds = wf_l1.get('oos_predictions', np.array([]))
        oos_proba = wf_l1.get('oos_proba', np.array([]))
        oos_orig_indices = self.layer_results.get('short_term_orig_indices', [])

        for i, (pred, orig_idx) in enumerate(zip(oos_preds, oos_orig_indices)):
            if pred == 0:
                continue
            # Get confidence for this prediction
            pred_class = LABEL_MAP[int(pred)]
            if i < len(oos_proba):
                conf = float(oos_proba[i][pred_class])
            else:
                conf = 0.0

            if conf >= confidence_threshold:
                signals.append({
                    'barIndex': int(orig_idx),
                    'signal': int(pred),
                    'confidence': round(conf, 4),
                })

        # ---- Trades & Stats ----
        closes_list = closes.tolist()
        dates_list = list(dates) if not isinstance(dates, list) else dates

        trades = pair_trades(signals, dates_list, closes_list, position_mode=position_mode)
        stats = compute_stats(trades)

        # ---- Warnings ----
        l1_acc = layer1_result['oos_accuracy']
        l2_acc = layer2_result['oos_accuracy']

        if l1_acc < 0.40:
            warnings_list.append(
                f"Dusuk OOS dogrulugu: {l1_acc:.1%}. Model guvenilir olmayabilir."
            )
        if l2_acc < 0.40:
            warnings_list.append(
                f"Dusuk OOS dogrulugu (Katman 2): {l2_acc:.1%}. Model guvenilir olmayabilir."
            )

        # ---- Walk-forward results summary ----
        walk_forward_results = []
        for layer in ['short_term', 'medium_term']:
            wf = self.layer_results.get(f'{layer}_wf', {})
            if wf:
                walk_forward_results.append({
                    'layer': layer,
                    'oos_accuracy': wf.get('oos_accuracy', 0.0),
                    'n_oos_samples': len(wf.get('oos_predictions', [])),
                })

        # ---- Training meta ----
        training_meta = {
            'total_features': total_features,
            'selected_features': feature_select_k,
            'total_bars': len(closes),
            'training_bars': int(len(closes) * train_ratio),
            'optuna_trials': optuna_trials,
            'best_trial_score': 0.0,
        }

        return {
            'layers': {
                'short_term': layer1_result,
                'medium_term': layer2_result,
                'risk_score': risk_result,
            },
            'meta_decision': meta_decision,
            'signals': signals,
            'trades': trades,
            'stats': stats,
            'walk_forward_results': walk_forward_results,
            'warnings': warnings_list,
            'training_meta': training_meta,
        }

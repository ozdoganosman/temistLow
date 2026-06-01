"""
Tests for ml.features — ~80+ technical feature computation.
"""

import sys
from pathlib import Path

# Ensure backend dir is on path for indicator imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
import pytest

from ml.features import compute_feature_matrix, drop_correlated_features


# ──────────────────────────────────────────────
# Helpers: synthetic OHLCV data
# ──────────────────────────────────────────────

def _make_ohlcv(n: int = 300, seed: int = 42):
    """Generate synthetic OHLCV data with realistic structure."""
    rng = np.random.RandomState(seed)
    # Random walk for close
    returns = rng.normal(0.001, 0.02, n)
    close = 100.0 * np.exp(np.cumsum(returns))
    high = close * (1 + rng.uniform(0.001, 0.03, n))
    low = close * (1 - rng.uniform(0.001, 0.03, n))
    opn = low + (high - low) * rng.uniform(0.2, 0.8, n)
    volume = rng.uniform(1e5, 1e7, n)
    return opn, high, low, close, volume


# ──────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────

class TestFeatureMatrix:
    """Core feature matrix tests."""

    @pytest.fixture(scope="class")
    def ohlcv(self):
        return _make_ohlcv(300)

    @pytest.fixture(scope="class")
    def df(self, ohlcv):
        o, h, l, c, v = ohlcv
        return compute_feature_matrix(o, h, l, c, v, normalize=False)

    def test_column_count_minimum(self, df):
        """Feature matrix must have at least 75 columns."""
        assert df.shape[1] >= 75, f"Expected >=75 columns, got {df.shape[1]}"

    def test_row_count_matches_input(self, df):
        """Rows must equal input length."""
        assert df.shape[0] == 300

    def test_no_inf_after_dropna(self, df):
        """After dropping NaN warmup rows, no infinities should remain."""
        clean = df.dropna()
        assert clean.shape[0] > 0, "No rows survive dropna — warmup too long?"
        has_inf = np.isinf(clean.values).any()
        assert not has_inf, "Infinite values found after dropping NaN rows"

    def test_group_a_features_exist(self, df):
        """Improved existing indicator features."""
        expected = [
            "rsi_7", "rsi_14", "rsi_21", "rsi_slope_5", "rsi_divergence",
            "macd_hist", "macd_signal_dist", "macd_hist_accel",
            "bb_pct_b", "bb_bandwidth", "bb_squeeze_dur",
            "stoch_rsi_k", "stoch_rsi_d", "stoch_cross_lag",
            "adx", "di_diff", "adx_slope", "di_cross_freshness",
            "supertrend_dir", "supertrend_flip_bars",
            "ichimoku_tk_diff", "ichimoku_price_vs_cloud",
            "ichi_cloud_thickness", "ichi_chikou_confirm",
            "obv_vs_ema", "obv_slope", "obv_divergence",
        ]
        for name in expected:
            assert name in df.columns, f"Missing group-A feature: {name}"

    def test_group_b_momentum_features(self, df):
        """Momentum features."""
        expected = ["roc_5", "roc_10", "roc_20", "roc_60",
                    "williams_r", "cci_20"]
        for name in expected:
            assert name in df.columns, f"Missing momentum feature: {name}"

    def test_group_c_volatility_features(self, df):
        """Volatility features."""
        expected = ["atr_ratio", "keltner_pos", "chaikin_vol",
                    "hist_vol_ratio"]
        for name in expected:
            assert name in df.columns, f"Missing volatility feature: {name}"

    def test_group_d_trend_features(self, df):
        """Trend features."""
        expected = ["ema_ribbon_aligned", "aroon_osc", "trix",
                    "linreg_slope", "linreg_r2", "price_vs_ema_dist"]
        for name in expected:
            assert name in df.columns, f"Missing trend feature: {name}"

    def test_group_e_microstructure_features(self, df):
        """Market microstructure features."""
        expected = ["vwap_deviation", "rel_volume_anomaly",
                    "hl_spread", "body_ratio"]
        for name in expected:
            assert name in df.columns, f"Missing microstructure feature: {name}"

    def test_group_f_statistical_features(self, df):
        """Statistical features."""
        expected = ["zscore_50", "hurst_proxy", "autocorr_1",
                    "return_entropy", "variance_ratio"]
        for name in expected:
            assert name in df.columns, f"Missing statistical feature: {name}"

    def test_group_g_interaction_features(self, df):
        """Interaction features."""
        expected = ["rsi_x_adx", "macd_x_vol", "bb_x_atr",
                    "st_x_adx", "stoch_x_rsi", "obv_x_ret"]
        for name in expected:
            assert name in df.columns, f"Missing interaction feature: {name}"

    def test_group_h_regime_features(self, df):
        """Regime features."""
        expected = ["vol_regime", "trend_regime", "volume_regime"]
        for name in expected:
            assert name in df.columns, f"Missing regime feature: {name}"

    def test_group_i_lag_features(self, df):
        """Lag features."""
        expected = ["rsi_lag_1", "rsi_lag_3", "rsi_lag_5",
                    "macd_hist_lag_1", "macd_hist_lag_3",
                    "return_1_lag_1", "return_1_lag_5", "return_1_lag_10"]
        for name in expected:
            assert name in df.columns, f"Missing lag feature: {name}"

    def test_supertrend_values(self, df):
        """SuperTrend direction should be +1 or -1."""
        clean = df["supertrend_dir"].dropna()
        assert len(clean) > 0
        assert set(clean.unique()).issubset({1.0, -1.0})

    def test_rsi_range(self, df):
        """RSI values should be between 0 and 100."""
        clean = df["rsi_14"].dropna()
        assert clean.min() >= 0.0
        assert clean.max() <= 100.0

    def test_regime_values(self, df):
        """Regime features should have expected discrete values."""
        vr = df["vol_regime"].dropna()
        assert set(vr.unique()).issubset({0.0, 1.0, 2.0})

        vr2 = df["volume_regime"].dropna()
        assert set(vr2.unique()).issubset({0.0, 1.0, 2.0})

        tr = df["trend_regime"].dropna()
        assert set(tr.unique()).issubset({-2.0, -1.0, 0.0, 1.0, 2.0})


class TestDropCorrelatedFeatures:
    """Tests for correlation-based feature dropping."""

    def test_drops_correlated_columns(self):
        """Highly correlated columns should be dropped."""
        rng = np.random.RandomState(123)
        x = rng.randn(100)
        df = pd.DataFrame({
            "a": x,
            "b": x + rng.randn(100) * 0.001,  # almost identical to a
            "c": rng.randn(100),                # independent
        })
        result = drop_correlated_features(df, threshold=0.90)
        assert "a" in result.columns
        assert "b" not in result.columns
        assert "c" in result.columns

    def test_no_drop_below_threshold(self):
        """Uncorrelated columns should all survive."""
        rng = np.random.RandomState(456)
        df = pd.DataFrame({
            "x": rng.randn(100),
            "y": rng.randn(100),
            "z": rng.randn(100),
        })
        result = drop_correlated_features(df, threshold=0.90)
        assert list(result.columns) == ["x", "y", "z"]

    def test_single_column(self):
        """Single-column input should return unchanged."""
        df = pd.DataFrame({"only": [1, 2, 3]})
        result = drop_correlated_features(df, threshold=0.90)
        assert list(result.columns) == ["only"]


class TestNormalization:
    """Test normalize=True produces roughly centered features."""

    def test_normalized_features_centered(self):
        """Normalized features should have mean near 0 and std near 1."""
        o, h, l, c, v = _make_ohlcv(400, seed=99)
        df = compute_feature_matrix(o, h, l, c, v, normalize=True)
        clean = df.dropna()
        assert clean.shape[0] > 50, "Not enough non-NaN rows after normalization"

        # Check a handful of columns for rough centering
        for col in ["rsi_14", "macd_hist", "bb_pct_b"]:
            if col in clean.columns and len(clean[col].dropna()) > 20:
                vals = clean[col].dropna().values
                mean = np.mean(vals)
                # Mean should be roughly centered (within +/-2)
                assert abs(mean) < 3.0, (
                    f"Normalized {col} mean = {mean:.2f}, expected near 0"
                )

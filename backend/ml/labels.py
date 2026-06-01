"""Label generation for the 3-layer ML system."""
from __future__ import annotations

import numpy as np
from collections import Counter

from indicators import true_range, wilder_smooth, sma, ema


def compute_short_term_labels(
    closes: np.ndarray,
    forward_period: int = 5,
    threshold: float = 0.02,
    threshold_short: float | None = None,
) -> np.ndarray:
    """Compute short-term trading labels (3-class).

    +1 = BUY   (forward return > threshold)
    -1 = SHORT (forward return < -threshold_short)
     0 = NEUTRAL

    Trailing bars where the future is unknown are set to NaN.

    Parameters
    ----------
    closes : np.ndarray
        Array of closing prices.
    forward_period : int
        Number of bars to look ahead for the return calculation.
    threshold : float
        Minimum positive return to trigger a BUY label.
    threshold_short : float or None
        Minimum absolute negative return to trigger a SHORT label.
        If None, *threshold* is used (symmetric).
    """
    if threshold_short is None:
        threshold_short = threshold

    n = len(closes)
    labels = np.full(n, np.nan)

    for i in range(n - forward_period):
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
    """Compute medium-term trend labels (3-class, symmetric thresholds).

    +1 = UPTREND
     0 = SIDEWAYS
    -1 = DOWNTREND

    Trailing bars where the future is unknown are set to NaN.

    Parameters
    ----------
    closes : np.ndarray
        Array of closing prices.
    forward_period : int
        Number of bars to look ahead for the return calculation.
    threshold : float
        Symmetric threshold for uptrend / downtrend classification.
    """
    n = len(closes)
    labels = np.full(n, np.nan)

    for i in range(n - forward_period):
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
    """Compute a composite risk/opportunity score (0-100) for regression.

    Components (weighted):
      - Volatility  (30%): ATR percentile in a rolling 100-bar window,
                            scaled 0-100.
      - Momentum    (30%): Fraction of positive multi-timeframe returns
                            (5, 10, 20 bars) * 100.
      - Volume      (20%): volume / SMA(volume, 20), capped at 2x,
                            scaled 0-100.
      - Technical   (20%): Fraction of bullish signals
                            (close > SMA20, close > SMA50, positive 5-bar
                            return) * 100.

    The first ~60 bars are NaN (warmup).
    """
    n = len(closes)
    scores = np.full(n, np.nan)

    # Pre-compute shared arrays
    tr = true_range(highs, lows, closes)
    atr = wilder_smooth(tr, lookback)

    sma20 = sma(closes, 20)
    sma50 = sma(closes, 50)
    vol_sma20 = sma(volumes, 20)

    # Minimum warmup: need SMA50 (49 bars) + some ATR percentile window
    # We require at least 60 bars of valid history before producing a score.
    warmup = 60

    atr_window = 100  # rolling window for ATR percentile

    for i in range(warmup, n):
        # --- Volatility component (30%) ---
        if np.isnan(atr[i]):
            continue

        # Determine rolling ATR percentile
        start = max(0, i - atr_window + 1)
        atr_slice = atr[start: i + 1]
        valid_atr = atr_slice[~np.isnan(atr_slice)]
        if len(valid_atr) < 2:
            continue
        percentile = np.sum(valid_atr < atr[i]) / len(valid_atr) * 100.0
        vol_score = percentile  # already 0-100

        # --- Momentum component (30%) ---
        pos_count = 0
        for period in (5, 10, 20):
            if i >= period:
                ret = (closes[i] - closes[i - period]) / closes[i - period]
                if ret > 0:
                    pos_count += 1
        mom_score = pos_count / 3.0 * 100.0

        # --- Volume component (20%) ---
        if np.isnan(vol_sma20[i]) or vol_sma20[i] == 0:
            volume_score = 50.0  # neutral fallback
        else:
            vol_ratio = volumes[i] / vol_sma20[i]
            vol_ratio = min(vol_ratio, 2.0)  # cap at 2x
            volume_score = vol_ratio / 2.0 * 100.0  # scale 0-100

        # --- Technical strength component (20%) ---
        bullish_count = 0
        total_signals = 3

        # close > SMA20
        if not np.isnan(sma20[i]) and closes[i] > sma20[i]:
            bullish_count += 1
        # close > SMA50
        if not np.isnan(sma50[i]) and closes[i] > sma50[i]:
            bullish_count += 1
        # positive 5-bar return
        if i >= 5:
            ret5 = (closes[i] - closes[i - 5]) / closes[i - 5]
            if ret5 > 0:
                bullish_count += 1

        tech_score = bullish_count / total_signals * 100.0

        # --- Composite ---
        composite = (
            vol_score * 0.30
            + mom_score * 0.30
            + volume_score * 0.20
            + tech_score * 0.20
        )

        # Clamp to [0, 100]
        scores[i] = max(0.0, min(100.0, composite))

    return scores


def validate_class_distribution(
    labels: np.ndarray,
    min_samples: int = 10,
) -> None:
    """Raise ``ValueError`` if any class has too few samples.

    Checks classes -1, 0, 1 in *labels* (NaN values are ignored).

    Parameters
    ----------
    labels : np.ndarray
        Label array (may contain NaN).
    min_samples : int
        Minimum number of samples required per class.
    """
    cls_names = {-1: "SAT", 0: "NÖTR", 1: "AL"}

    valid = labels[~np.isnan(labels)].astype(int)
    counts = Counter(valid)

    for cls in (-1, 0, 1):
        count = counts.get(cls, 0)
        if count < min_samples:
            dist_al = counts.get(1, 0)
            dist_notr = counts.get(0, 0)
            dist_sat = counts.get(-1, 0)
            raise ValueError(
                f"{cls_names[cls]} sınıfı yalnızca {count} örneğe sahip "
                f"(en az {min_samples} gerekli). Eşik değerini ayarlayın. "
                f"Dağılım: AL={dist_al}, NÖTR={dist_notr}, SAT={dist_sat}"
            )

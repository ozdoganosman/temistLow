"""
ML feature engineering — ~80+ technical features from OHLCV data.

Groups:
  A. Improved Existing Indicators (~25)
  B. Momentum (6)
  C. Volatility (5)
  D. Trend (7)
  E. Market Microstructure (4)
  F. Statistical (5)
  G. Interaction (6)
  H. Regime (3)
  I. Lag (8)

Also provides:
  - drop_correlated_features()
  - Optional rolling z-score normalization
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from indicators import (
    ema,
    sma,
    wilder_smooth,
    true_range,
    stdev,
    rolling_highest,
    rolling_lowest,
)


# ──────────────────────────────────────────────
# Helper utilities
# ──────────────────────────────────────────────

def _safe_div(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Element-wise division, returning 0 where denominator is 0 or NaN."""
    with np.errstate(divide="ignore", invalid="ignore"):
        result = np.where((b == 0) | np.isnan(b), 0.0, a / b)
    return result


def _slope(src: np.ndarray, period: int) -> np.ndarray:
    """Simple slope: (src[i] - src[i-period]) / period."""
    n = len(src)
    out = np.full(n, np.nan)
    for i in range(period, n):
        if np.isnan(src[i]) or np.isnan(src[i - period]):
            continue
        out[i] = (src[i] - src[i - period]) / period
    return out


def _lag(arr: np.ndarray, k: int) -> np.ndarray:
    """Shift array by k bars (lag)."""
    n = len(arr)
    out = np.full(n, np.nan)
    if k < n:
        out[k:] = arr[: n - k]
    return out


# ──────────────────────────────────────────────
# Sub-indicator computations
# ──────────────────────────────────────────────

def _compute_rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    n = len(closes)
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = wilder_smooth(gains, period)
    avg_loss = wilder_smooth(losses, period)
    rsi = np.full(n, np.nan)
    for i in range(len(avg_gain)):
        ag, al = avg_gain[i], avg_loss[i]
        if np.isnan(ag) or np.isnan(al):
            continue
        rsi[i + 1] = 100.0 if al == 0 else 100.0 - 100.0 / (1.0 + ag / al)
    return rsi


def _compute_macd(closes: np.ndarray, fast: int = 12, slow: int = 26, sig: int = 9):
    fast_ema = ema(closes, fast)
    slow_ema = ema(closes, slow)
    macd_line = fast_ema - slow_ema
    signal_line = ema(macd_line, sig)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _compute_bollinger(closes: np.ndarray, period: int = 20, mult: float = 2.0):
    mid = sma(closes, period)
    sd = stdev(closes, period)
    upper = mid + mult * sd
    lower = mid - mult * sd
    bandwidth = _safe_div(upper - lower, mid)
    pct_b = _safe_div(closes - lower, upper - lower)
    return upper, lower, mid, bandwidth, pct_b


def _compute_stoch_rsi(closes: np.ndarray, rsi_period: int = 14,
                       stoch_period: int = 14, k_smooth: int = 3,
                       d_smooth: int = 3):
    rsi = _compute_rsi(closes, rsi_period)
    n = len(closes)
    raw_k = np.full(n, np.nan)
    for i in range(stoch_period - 1, n):
        w = rsi[max(0, i - stoch_period + 1): i + 1]
        valid = w[~np.isnan(w)]
        if len(valid) < stoch_period:
            continue
        hi, lo = np.max(valid), np.min(valid)
        rng = hi - lo
        raw_k[i] = 50.0 if rng == 0 else ((rsi[i] - lo) / rng) * 100.0
    k = sma(raw_k, k_smooth)
    d = sma(k, d_smooth)
    return k, d


def _compute_adx(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray,
                 period: int = 14):
    n = len(closes)
    plus_dm = np.zeros(n)
    minus_dm = np.zeros(n)
    tr = true_range(highs, lows, closes)
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        if up > down and up > 0:
            plus_dm[i] = up
        if down > up and down > 0:
            minus_dm[i] = down
    atr = wilder_smooth(tr, period)
    sp = wilder_smooth(plus_dm, period)
    sm = wilder_smooth(minus_dm, period)
    plus_di = np.full(n, np.nan)
    minus_di = np.full(n, np.nan)
    dx = np.full(n, np.nan)
    for i in range(n):
        if np.isnan(atr[i]) or atr[i] == 0:
            continue
        plus_di[i] = (sp[i] / atr[i]) * 100
        minus_di[i] = (sm[i] / atr[i]) * 100
        di_sum = plus_di[i] + minus_di[i]
        if di_sum > 0:
            dx[i] = abs(plus_di[i] - minus_di[i]) / di_sum * 100
    adx_line = wilder_smooth(dx, period)
    return adx_line, plus_di, minus_di


def _compute_supertrend(highs: np.ndarray, lows: np.ndarray,
                        closes: np.ndarray, atr_period: int = 10,
                        mult: float = 3.0) -> np.ndarray:
    n = len(closes)
    tr = true_range(highs, lows, closes)
    atr = wilder_smooth(tr, atr_period)
    hl2 = (highs + lows) / 2.0
    upper_band = np.full(n, np.nan)
    lower_band = np.full(n, np.nan)
    direction = np.full(n, np.nan)
    for i in range(atr_period, n):
        if np.isnan(atr[i]):
            continue
        bu = hl2[i] + mult * atr[i]
        bl = hl2[i] - mult * atr[i]
        if i > atr_period and not np.isnan(upper_band[i - 1]):
            upper_band[i] = bu if (bu < upper_band[i - 1] or closes[i - 1] > upper_band[i - 1]) else upper_band[i - 1]
        else:
            upper_band[i] = bu
        if i > atr_period and not np.isnan(lower_band[i - 1]):
            lower_band[i] = bl if (bl > lower_band[i - 1] or closes[i - 1] < lower_band[i - 1]) else lower_band[i - 1]
        else:
            lower_band[i] = bl
        if i == atr_period:
            direction[i] = 1.0 if closes[i] > upper_band[i] else -1.0
        else:
            prev = direction[i - 1] if not np.isnan(direction[i - 1]) else -1.0
            if prev == -1.0 and closes[i] > upper_band[i]:
                direction[i] = 1.0
            elif prev == 1.0 and closes[i] < lower_band[i]:
                direction[i] = -1.0
            else:
                direction[i] = prev
    return direction


def _compute_obv(closes: np.ndarray, volumes: np.ndarray) -> np.ndarray:
    n = len(closes)
    obv = np.zeros(n)
    for i in range(1, n):
        if closes[i] > closes[i - 1]:
            obv[i] = obv[i - 1] + volumes[i]
        elif closes[i] < closes[i - 1]:
            obv[i] = obv[i - 1] - volumes[i]
        else:
            obv[i] = obv[i - 1]
    return obv


def _compute_ichimoku(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray,
                      tenkan_p: int = 9, kijun_p: int = 26,
                      senkou_b_p: int = 52):
    """Return tenkan, kijun, senkou_a, senkou_b arrays (non-displaced)."""
    n = len(closes)

    def midpoint(h, l, period):
        out = np.full(n, np.nan)
        for i in range(period - 1, n):
            out[i] = (np.max(h[i - period + 1: i + 1]) +
                      np.min(l[i - period + 1: i + 1])) / 2
        return out

    tenkan = midpoint(highs, lows, tenkan_p)
    kijun = midpoint(highs, lows, kijun_p)
    senkou_a = np.full(n, np.nan)
    for i in range(n):
        if not np.isnan(tenkan[i]) and not np.isnan(kijun[i]):
            senkou_a[i] = (tenkan[i] + kijun[i]) / 2
    senkou_b = midpoint(highs, lows, senkou_b_p)
    return tenkan, kijun, senkou_a, senkou_b


# ──────────────────────────────────────────────
# Main feature matrix computation
# ──────────────────────────────────────────────

def compute_feature_matrix(
    opens: np.ndarray,
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    volumes: np.ndarray,
    normalize: bool = False,
) -> pd.DataFrame:
    """
    Compute ~80+ technical features from OHLCV data.

    Parameters
    ----------
    opens, highs, lows, closes, volumes : np.ndarray
        OHLCV price/volume arrays (equal length).
    normalize : bool
        If True, apply rolling z-score normalization (100-bar window).

    Returns
    -------
    pd.DataFrame  with one column per feature.
    """
    with np.errstate(divide="ignore", invalid="ignore"):
        return _build_features(opens, highs, lows, closes, volumes, normalize)


def _build_features(opens, highs, lows, closes, volumes, normalize):
    n = len(closes)
    feat: dict[str, np.ndarray] = {}

    # Pre-compute shared intermediaries
    tr = true_range(highs, lows, closes)
    log_returns = np.full(n, np.nan)
    for i in range(1, n):
        if closes[i] > 0 and closes[i - 1] > 0:
            log_returns[i] = math.log(closes[i] / closes[i - 1])
    returns_1 = np.full(n, np.nan)
    for i in range(1, n):
        if closes[i - 1] != 0:
            returns_1[i] = (closes[i] - closes[i - 1]) / closes[i - 1]

    # ================================================================
    # A. Improved Existing Indicators (~25)
    # ================================================================

    # --- RSI multi-period ---
    rsi_7 = _compute_rsi(closes, 7)
    rsi_14 = _compute_rsi(closes, 14)
    rsi_21 = _compute_rsi(closes, 21)
    feat["rsi_7"] = rsi_7
    feat["rsi_14"] = rsi_14
    feat["rsi_21"] = rsi_21

    # RSI slope
    feat["rsi_slope_5"] = _slope(rsi_14, 5)

    # RSI divergence
    close_slope_20 = _slope(closes, 20)
    rsi_slope_20 = _slope(rsi_14, 20)
    rsi_div = np.full(n, np.nan)
    for i in range(n):
        cs = close_slope_20[i]
        rs = rsi_slope_20[i]
        if np.isnan(cs) or np.isnan(rs):
            continue
        rsi_div[i] = 1.0 if np.sign(cs) != np.sign(rs) else 0.0
    feat["rsi_divergence"] = rsi_div

    # --- MACD ---
    macd_line, signal_line, histogram = _compute_macd(closes, 12, 26, 9)
    feat["macd_hist"] = histogram
    feat["macd_signal_dist"] = macd_line - signal_line

    macd_hist_accel = np.full(n, np.nan)
    for i in range(1, n):
        if not np.isnan(histogram[i]) and not np.isnan(histogram[i - 1]):
            macd_hist_accel[i] = histogram[i] - histogram[i - 1]
    feat["macd_hist_accel"] = macd_hist_accel

    # --- Bollinger Bands ---
    _, _, _, bb_bw, bb_pctb = _compute_bollinger(closes, 20, 2.0)
    feat["bb_pct_b"] = bb_pctb
    feat["bb_bandwidth"] = bb_bw

    # Bollinger squeeze duration
    bb_squeeze_dur = np.full(n, np.nan)
    for i in range(99, n):
        if np.isnan(bb_bw[i]):
            continue
        window = bb_bw[max(0, i - 99): i + 1]
        valid = window[~np.isnan(window)]
        if len(valid) < 10:
            continue
        pct20 = np.percentile(valid, 20)
        count = 0
        for j in range(i, -1, -1):
            if np.isnan(bb_bw[j]):
                break
            if bb_bw[j] < pct20:
                count += 1
            else:
                break
        bb_squeeze_dur[i] = float(count)
    feat["bb_squeeze_dur"] = bb_squeeze_dur

    # --- Stochastic RSI ---
    stoch_k, stoch_d = _compute_stoch_rsi(closes)
    feat["stoch_rsi_k"] = stoch_k
    feat["stoch_rsi_d"] = stoch_d

    # Stoch cross lag
    stoch_cross_lag = np.full(n, np.nan)
    for i in range(1, n):
        if np.isnan(stoch_k[i]) or np.isnan(stoch_d[i]):
            continue
        if np.isnan(stoch_k[i - 1]) or np.isnan(stoch_d[i - 1]):
            stoch_cross_lag[i] = 0.0
            continue
        # Find last cross
        lag_val = 0.0
        for j in range(i, 0, -1):
            if np.isnan(stoch_k[j]) or np.isnan(stoch_d[j]) or \
               np.isnan(stoch_k[j - 1]) or np.isnan(stoch_d[j - 1]):
                break
            diff_now = stoch_k[j] - stoch_d[j]
            diff_prev = stoch_k[j - 1] - stoch_d[j - 1]
            if diff_now >= 0 and diff_prev < 0:
                # K crossed above D
                lag_val = float(i - j)
                break
            elif diff_now < 0 and diff_prev >= 0:
                # K crossed below D
                lag_val = -float(i - j)
                break
        stoch_cross_lag[i] = lag_val
    feat["stoch_cross_lag"] = stoch_cross_lag

    # --- ADX / DMI ---
    adx_arr, plus_di, minus_di = _compute_adx(highs, lows, closes, 14)
    feat["adx"] = adx_arr
    feat["di_diff"] = plus_di - minus_di

    feat["adx_slope"] = _slope(adx_arr, 5)

    # DI cross freshness
    di_cross_fresh = np.full(n, np.nan)
    for i in range(1, n):
        if np.isnan(plus_di[i]) or np.isnan(minus_di[i]):
            continue
        bars = 0.0
        for j in range(i, 0, -1):
            if np.isnan(plus_di[j]) or np.isnan(minus_di[j]) or \
               np.isnan(plus_di[j - 1]) or np.isnan(minus_di[j - 1]):
                break
            d_now = plus_di[j] - minus_di[j]
            d_prev = plus_di[j - 1] - minus_di[j - 1]
            if (d_now >= 0 and d_prev < 0) or (d_now < 0 and d_prev >= 0):
                bars = float(i - j)
                break
        di_cross_fresh[i] = bars
    feat["di_cross_freshness"] = di_cross_fresh

    # --- SuperTrend ---
    st_dir = _compute_supertrend(highs, lows, closes)
    feat["supertrend_dir"] = st_dir

    # SuperTrend flip bars
    st_flip_bars = np.full(n, np.nan)
    for i in range(1, n):
        if np.isnan(st_dir[i]):
            continue
        bars = 0.0
        for j in range(i, 0, -1):
            if np.isnan(st_dir[j]) or np.isnan(st_dir[j - 1]):
                break
            if st_dir[j] != st_dir[j - 1]:
                bars = float(i - j)
                break
        st_flip_bars[i] = bars
    feat["supertrend_flip_bars"] = st_flip_bars

    # --- Ichimoku ---
    tenkan, kijun, senkou_a, senkou_b = _compute_ichimoku(highs, lows, closes)

    feat["ichimoku_tk_diff"] = _safe_div(tenkan - kijun, closes)

    cloud_top = np.full(n, np.nan)
    cloud_bottom = np.full(n, np.nan)
    for i in range(n):
        if not np.isnan(senkou_a[i]) and not np.isnan(senkou_b[i]):
            cloud_top[i] = max(senkou_a[i], senkou_b[i])
            cloud_bottom[i] = min(senkou_a[i], senkou_b[i])

    price_vs_cloud = np.full(n, np.nan)
    for i in range(n):
        if np.isnan(cloud_top[i]) or np.isnan(cloud_bottom[i]):
            continue
        if closes[i] > cloud_top[i]:
            price_vs_cloud[i] = 1.0
        elif closes[i] < cloud_bottom[i]:
            price_vs_cloud[i] = -1.0
        else:
            price_vs_cloud[i] = 0.0
    feat["ichimoku_price_vs_cloud"] = price_vs_cloud

    feat["ichi_cloud_thickness"] = _safe_div(
        np.abs(senkou_a - senkou_b), closes
    )

    # Chikou confirmation (look-back 26 bars)
    ichi_chikou = np.full(n, np.nan)
    for i in range(26, n):
        idx = i - 26
        if np.isnan(cloud_top[idx]) or np.isnan(cloud_bottom[idx]):
            continue
        if closes[idx] > cloud_top[idx]:
            ichi_chikou[i] = 1.0
        elif closes[idx] < cloud_bottom[idx]:
            ichi_chikou[i] = -1.0
        else:
            ichi_chikou[i] = 0.0
    feat["ichi_chikou_confirm"] = ichi_chikou

    # --- OBV ---
    obv = _compute_obv(closes, volumes)
    obv_ema_arr = ema(obv, 20)
    feat["obv_vs_ema"] = _safe_div(obv - obv_ema_arr, np.abs(obv_ema_arr) + 1e-10)

    obv_slope_raw = _slope(obv, 10)
    feat["obv_slope"] = _safe_div(obv_slope_raw, np.abs(obv) + 1e-10)

    close_slope_10 = _slope(closes, 10)
    obv_div = np.full(n, np.nan)
    for i in range(n):
        os_val = obv_slope_raw[i]
        cs_val = close_slope_10[i]
        if np.isnan(os_val) or np.isnan(cs_val):
            continue
        obv_div[i] = 1.0 if np.sign(os_val) != np.sign(cs_val) else 0.0
    feat["obv_divergence"] = obv_div

    # ================================================================
    # B. Momentum (6)
    # ================================================================
    for p in [5, 10, 20, 60]:
        roc = np.full(n, np.nan)
        for i in range(p, n):
            if closes[i - p] != 0:
                roc[i] = (closes[i] - closes[i - p]) / closes[i - p]
        feat[f"roc_{p}"] = roc

    # Williams %R
    hh14 = rolling_highest(highs, 14)
    ll14 = rolling_lowest(lows, 14)
    feat["williams_r"] = _safe_div(hh14 - closes, hh14 - ll14) * -100.0

    # CCI(20)
    typical = (highs + lows + closes) / 3.0
    typical_sma = sma(typical, 20)
    # Mean absolute deviation
    mad20 = np.full(n, np.nan)
    for i in range(19, n):
        w = typical[i - 19: i + 1]
        if np.any(np.isnan(w)) or np.isnan(typical_sma[i]):
            continue
        mad20[i] = np.mean(np.abs(w - typical_sma[i]))
    feat["cci_20"] = _safe_div(typical - typical_sma, 0.015 * mad20)

    # ================================================================
    # C. Volatility (5)
    # ================================================================
    atr_7 = wilder_smooth(tr, 7)
    atr_10 = wilder_smooth(tr, 10)
    atr_14 = wilder_smooth(tr, 14)
    atr_21 = wilder_smooth(tr, 21)

    feat["atr_ratio"] = _safe_div(atr_7, atr_21)

    ema_20 = ema(closes, 20)
    feat["keltner_pos"] = _safe_div(closes - ema_20, 2.0 * atr_10)

    # Chaikin Volatility
    hl_diff = highs - lows
    ema_hl_10 = ema(hl_diff, 10)
    chaikin_vol = np.full(n, np.nan)
    for i in range(10, n):
        if not np.isnan(ema_hl_10[i]) and not np.isnan(ema_hl_10[i - 10]):
            denom = ema_hl_10[i - 10]
            if denom != 0:
                chaikin_vol[i] = (ema_hl_10[i] - denom) / denom
            else:
                chaikin_vol[i] = 0.0
    feat["chaikin_vol"] = chaikin_vol

    # Historical volatility ratio
    std_ret_10 = stdev(log_returns, 10)
    std_ret_30 = stdev(log_returns, 30)
    feat["hist_vol_ratio"] = _safe_div(std_ret_10, std_ret_30)

    # bb_squeeze_dur already in group A

    # ================================================================
    # D. Trend (7)
    # ================================================================

    # EMA ribbon aligned
    ema_periods = [8, 13, 21, 34, 55]
    ema_ribbons = [ema(closes, p) for p in ema_periods]
    ema_ribbon_aligned = np.full(n, np.nan)
    for i in range(n):
        vals = [e[i] for e in ema_ribbons]
        if any(np.isnan(v) for v in vals):
            continue
        count = 0
        for j in range(len(vals) - 1):
            if vals[j] < vals[j + 1]:
                count += 1
            elif vals[j] > vals[j + 1]:
                count -= 1
        ema_ribbon_aligned[i] = float(count)
    feat["ema_ribbon_aligned"] = ema_ribbon_aligned

    # Aroon Oscillator
    aroon_up = np.full(n, np.nan)
    aroon_down = np.full(n, np.nan)
    for i in range(25, n):
        w_h = highs[i - 25: i + 1]
        w_l = lows[i - 25: i + 1]
        up_idx = np.argmax(w_h)
        down_idx = np.argmin(w_l)
        aroon_up[i] = (up_idx / 25.0) * 100.0
        aroon_down[i] = (down_idx / 25.0) * 100.0
    feat["aroon_osc"] = aroon_up - aroon_down

    # TRIX: percentage change of triple-EMA(close, 15)
    ema1 = ema(closes, 15)
    ema2 = ema(ema1, 15)
    ema3 = ema(ema2, 15)
    trix = np.full(n, np.nan)
    for i in range(1, n):
        if not np.isnan(ema3[i]) and not np.isnan(ema3[i - 1]) and ema3[i - 1] != 0:
            trix[i] = (ema3[i] - ema3[i - 1]) / ema3[i - 1]
    feat["trix"] = trix

    # Linear regression slope and R2 over 20 bars
    linreg_slope_arr = np.full(n, np.nan)
    linreg_r2_arr = np.full(n, np.nan)
    for i in range(19, n):
        w = closes[i - 19: i + 1]
        if np.any(np.isnan(w)):
            continue
        x = np.arange(20, dtype=float)
        x_mean = 9.5
        y_mean = np.mean(w)
        ss_xy = np.sum((x - x_mean) * (w - y_mean))
        ss_xx = np.sum((x - x_mean) ** 2)
        ss_yy = np.sum((w - y_mean) ** 2)
        if ss_xx == 0:
            continue
        slope_val = ss_xy / ss_xx
        linreg_slope_arr[i] = slope_val / closes[i] if closes[i] != 0 else 0.0
        if ss_yy == 0:
            linreg_r2_arr[i] = 1.0
        else:
            r = ss_xy / (math.sqrt(ss_xx) * math.sqrt(ss_yy))
            linreg_r2_arr[i] = r * r
    feat["linreg_slope"] = linreg_slope_arr
    feat["linreg_r2"] = linreg_r2_arr

    # Price vs EMA(50) distance
    ema_50 = ema(closes, 50)
    feat["price_vs_ema_dist"] = _safe_div(closes - ema_50, closes)

    # ================================================================
    # E. Market Microstructure (4)
    # ================================================================

    # Rolling VWAP deviation
    vwap_dev = np.full(n, np.nan)
    for i in range(19, n):
        w_tp = typical[i - 19: i + 1]
        w_vol = volumes[i - 19: i + 1]
        if np.any(np.isnan(w_tp)):
            continue
        vol_sum = np.sum(w_vol)
        if vol_sum == 0:
            vwap_dev[i] = 0.0
        else:
            vwap = np.sum(w_tp * w_vol) / vol_sum
            vwap_dev[i] = (closes[i] - vwap) / closes[i] if closes[i] != 0 else 0.0
    feat["vwap_deviation"] = vwap_dev

    # Relative volume anomaly
    vol_sma20 = sma(volumes, 20)
    feat["rel_volume_anomaly"] = _safe_div(volumes, vol_sma20)

    # High-Low spread
    feat["hl_spread"] = _safe_div(highs - lows, closes)

    # Body ratio
    feat["body_ratio"] = _safe_div(np.abs(closes - opens), highs - lows + 1e-10)

    # ================================================================
    # F. Statistical (5)
    # ================================================================

    # Z-score 50
    sma_50 = sma(closes, 50)
    std_50 = stdev(closes, 50)
    feat["zscore_50"] = _safe_div(closes - sma_50, std_50)

    # Hurst proxy via rescaled range (R/S) over 100-bar window
    hurst_proxy = np.full(n, np.nan)
    for i in range(99, n):
        w = log_returns[i - 99: i + 1]
        valid = w[~np.isnan(w)]
        if len(valid) < 20:
            continue
        m = np.mean(valid)
        s = np.std(valid, ddof=0)
        if s == 0:
            hurst_proxy[i] = 0.5
            continue
        cumdev = np.cumsum(valid - m)
        r = np.max(cumdev) - np.min(cumdev)
        rs = r / s
        nn = len(valid)
        if rs > 0 and nn > 1:
            hurst_proxy[i] = math.log(rs) / math.log(nn)
        else:
            hurst_proxy[i] = 0.5
    feat["hurst_proxy"] = hurst_proxy

    # Autocorrelation of 1-bar log returns over 20-bar rolling window
    autocorr_1 = np.full(n, np.nan)
    for i in range(20, n):
        w = log_returns[i - 19: i + 1]
        if np.any(np.isnan(w)):
            continue
        x = w[:-1]
        y = w[1:]
        mx = np.mean(x)
        my = np.mean(y)
        dx = x - mx
        dy = y - my
        denom = np.sqrt(np.sum(dx ** 2) * np.sum(dy ** 2))
        if denom == 0:
            autocorr_1[i] = 0.0
        else:
            autocorr_1[i] = np.sum(dx * dy) / denom
    feat["autocorr_1"] = autocorr_1

    # Return entropy: Shannon entropy of 5-bin discretized returns over 20-bar window
    return_entropy = np.full(n, np.nan)
    for i in range(20, n):
        w = log_returns[i - 19: i + 1]
        if np.any(np.isnan(w)):
            continue
        # Discretize into 5 bins
        mn, mx = np.min(w), np.max(w)
        if mn == mx:
            return_entropy[i] = 0.0
            continue
        edges = np.linspace(mn, mx, 6)
        counts = np.histogram(w, bins=edges)[0].astype(float)
        probs = counts / counts.sum()
        probs = probs[probs > 0]
        return_entropy[i] = -np.sum(probs * np.log2(probs))
    feat["return_entropy"] = return_entropy

    # Variance ratio: var(5-bar returns) / (5 * var(1-bar returns)) over 60-bar window
    variance_ratio = np.full(n, np.nan)
    for i in range(63, n):
        w1 = log_returns[i - 59: i + 1]
        if np.any(np.isnan(w1)):
            continue
        # 5-bar returns
        w5 = np.array([
            np.sum(w1[j: j + 5])
            for j in range(0, len(w1) - 4)
        ])
        var1 = np.var(w1, ddof=1) if len(w1) > 1 else 0.0
        var5 = np.var(w5, ddof=1) if len(w5) > 1 else 0.0
        if var1 == 0:
            variance_ratio[i] = 1.0
        else:
            variance_ratio[i] = var5 / (5.0 * var1)
    feat["variance_ratio"] = variance_ratio

    # ================================================================
    # Additional Price / Volume / Statistical features (11)
    # (carry-over from legacy feature set + natural extensions)
    # ================================================================
    feat["return_1"] = returns_1

    for p in [5, 10, 20]:
        ret = np.full(n, np.nan)
        for i in range(p, n):
            if closes[i - p] != 0:
                ret[i] = (closes[i] - closes[i - p]) / closes[i - p]
        feat[f"return_{p}"] = ret

    atr_pct = _safe_div(atr_14, closes)
    feat["atr_pct"] = atr_pct

    # Opening gap
    gap = np.full(n, np.nan)
    for i in range(1, n):
        if closes[i - 1] != 0:
            gap[i] = (opens[i] - closes[i - 1]) / closes[i - 1]
    feat["gap"] = gap

    # Close vs High (position of close in bar range)
    feat["close_vs_high"] = _safe_div(closes - lows, highs - lows + 1e-10)

    # Normalized volatility (stdev / sma)
    feat["volatility_20"] = _safe_div(stdev(closes, 20), sma(closes, 20) + 1e-10)

    # Rolling skewness and kurtosis of log returns
    skew_20 = np.full(n, np.nan)
    kurt_20 = np.full(n, np.nan)
    for i in range(20, n):
        w = log_returns[i - 19: i + 1]
        if np.any(np.isnan(w)):
            continue
        m = np.mean(w)
        s = np.std(w, ddof=0)
        if s == 0:
            skew_20[i] = 0.0
            kurt_20[i] = 0.0
        else:
            z = (w - m) / s
            skew_20[i] = np.mean(z ** 3)
            kurt_20[i] = np.mean(z ** 4) - 3.0
    feat["skew_20"] = skew_20
    feat["kurtosis_20"] = kurt_20

    # Volume change (1-bar)
    vol_change = np.full(n, np.nan)
    for i in range(1, n):
        if volumes[i - 1] > 0:
            vol_change[i] = (volumes[i] - volumes[i - 1]) / volumes[i - 1]
    feat["volume_change_1"] = vol_change

    # ================================================================
    # G. Interaction (6)
    # ================================================================
    feat["rsi_x_adx"] = rsi_14 * adx_arr / 10000.0
    feat["macd_x_vol"] = histogram * feat["rel_volume_anomaly"]

    feat["bb_x_atr"] = bb_pctb * atr_pct

    feat["st_x_adx"] = st_dir * adx_arr / 100.0
    feat["stoch_x_rsi"] = stoch_k * rsi_14 / 10000.0
    feat["obv_x_ret"] = feat["obv_slope"] * returns_1

    # ================================================================
    # H. Regime (3)
    # ================================================================

    # Volatility regime: ATR percentile in rolling 100 bars
    vol_regime = np.full(n, np.nan)
    for i in range(99, n):
        if np.isnan(atr_14[i]):
            continue
        w = atr_14[max(0, i - 99): i + 1]
        valid = w[~np.isnan(w)]
        if len(valid) < 10:
            continue
        pct = np.sum(valid <= atr_14[i]) / len(valid) * 100.0
        if pct < 25:
            vol_regime[i] = 0.0
        elif pct > 75:
            vol_regime[i] = 2.0
        else:
            vol_regime[i] = 1.0
    feat["vol_regime"] = vol_regime

    # Trend regime
    sma_20 = sma(closes, 20)
    trend_regime = np.full(n, np.nan)
    for i in range(n):
        a = adx_arr[i]
        pdi = plus_di[i]
        mdi = minus_di[i]
        s20 = sma_20[i]
        if np.isnan(a) or np.isnan(pdi) or np.isnan(mdi) or np.isnan(s20):
            continue
        if a > 25 and pdi > mdi:
            trend_regime[i] = 2.0
        elif a > 25 and mdi > pdi:
            trend_regime[i] = -2.0
        elif a < 20:
            trend_regime[i] = 0.0
        elif closes[i] > s20:
            trend_regime[i] = 1.0
        else:
            trend_regime[i] = -1.0
    feat["trend_regime"] = trend_regime

    # Volume regime: volume percentile in rolling 50 bars
    volume_regime = np.full(n, np.nan)
    for i in range(49, n):
        w = volumes[max(0, i - 49): i + 1]
        pct = np.sum(w <= volumes[i]) / len(w) * 100.0
        if pct < 20:
            volume_regime[i] = 0.0
        elif pct > 80:
            volume_regime[i] = 2.0
        else:
            volume_regime[i] = 1.0
    feat["volume_regime"] = volume_regime

    # ================================================================
    # I. Lag (8)
    # ================================================================
    feat["rsi_lag_1"] = _lag(rsi_14, 1)
    feat["rsi_lag_3"] = _lag(rsi_14, 3)
    feat["rsi_lag_5"] = _lag(rsi_14, 5)

    feat["macd_hist_lag_1"] = _lag(histogram, 1)
    feat["macd_hist_lag_3"] = _lag(histogram, 3)

    feat["return_1_lag_1"] = _lag(returns_1, 1)
    feat["return_1_lag_5"] = _lag(returns_1, 5)
    feat["return_1_lag_10"] = _lag(returns_1, 10)

    # ================================================================
    # Build DataFrame
    # ================================================================
    df = pd.DataFrame(feat)

    # ================================================================
    # Optional normalization: rolling z-score (100-bar window)
    # ================================================================
    if normalize:
        for col in df.columns:
            arr = df[col].values.astype(float)
            normed = np.full(len(arr), np.nan)
            for i in range(99, len(arr)):
                w = arr[max(0, i - 99): i + 1]
                valid = w[~np.isnan(w)]
                if len(valid) < 10:
                    continue
                m = np.mean(valid)
                s = np.std(valid, ddof=0)
                if s == 0:
                    normed[i] = 0.0
                else:
                    normed[i] = (arr[i] - m) / s
            df[col] = normed

    return df


# ──────────────────────────────────────────────
# Correlation filter
# ──────────────────────────────────────────────

def drop_correlated_features(
    df: pd.DataFrame,
    threshold: float = 0.90,
) -> pd.DataFrame:
    """
    Drop features with Pearson correlation above *threshold*.
    Keeps the first feature in each correlated pair (by column order).
    """
    numeric = df.select_dtypes(include=[np.number])
    if numeric.shape[1] < 2:
        return df
    corr = numeric.corr().abs()
    upper = corr.where(np.triu(np.ones(corr.shape, dtype=bool), k=1))
    to_drop = [col for col in upper.columns if any(upper[col] > threshold)]
    return df.drop(columns=to_drop)

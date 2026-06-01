"""Trade pairing and statistics for ML backtest results."""
from __future__ import annotations

import math
import numpy as np


# ------------------------------------------------------------------
# Trade pairing
# ------------------------------------------------------------------

def pair_trades(
    signals: list[dict],
    dates: list[str],
    closes: list[float],
    position_mode: str = "long-only",
) -> list[dict]:
    """Convert ML signals into paired entry/exit trades using a state machine.

    Parameters
    ----------
    signals : list[dict]
        Each dict has ``barIndex`` (int), ``signal`` (+1 or -1), and
        ``confidence`` (float).  Signal 0 should already be filtered out.
    dates : list[str]
        Date strings aligned to the bar array.
    closes : list[float]
        Close prices aligned to the bar array.
    position_mode : str
        ``'long-only'``, ``'short-only'``, or ``'both'``.

    Returns
    -------
    list[dict]
        Each trade dict contains entry/exit information and return.
    """
    if not signals:
        return []

    allow_long = position_mode in ("long-only", "both")
    allow_short = position_mode in ("short-only", "both")

    # Build a bar-index -> signal lookup
    sig_map: dict[int, int] = {}
    for s in signals:
        sig_map[s["barIndex"]] = s["signal"]

    trades: list[dict] = []
    state = "flat"  # flat | long | short
    entry_idx = -1
    prev_signal = 0
    n = len(closes)

    min_bar = min(s["barIndex"] for s in signals)
    max_bar = max(s["barIndex"] for s in signals)

    for i in range(min_bar, min(max_bar + 1, n)):
        curr = sig_map.get(i, 0)
        if curr == 0 or curr == prev_signal:
            if curr != 0:
                prev_signal = curr
            continue

        if state == "flat":
            if curr == 1 and allow_long:
                state = "long"
                entry_idx = i
            elif curr == -1 and allow_short:
                state = "short"
                entry_idx = i

        elif state == "long":
            if curr == -1:
                # Close long
                ep, xp = closes[entry_idx], closes[i]
                ret = (xp - ep) / ep if ep != 0 else 0.0
                trades.append(
                    _make_trade(dates, closes, entry_idx, i, "long", ret)
                )
                # Possibly flip to short
                if allow_short:
                    state = "short"
                    entry_idx = i
                else:
                    state = "flat"

        elif state == "short":
            if curr == 1:
                # Close short
                ep, xp = closes[entry_idx], closes[i]
                ret = (ep - xp) / ep if ep != 0 else 0.0
                trades.append(
                    _make_trade(dates, closes, entry_idx, i, "short", ret)
                )
                # Possibly flip to long
                if allow_long:
                    state = "long"
                    entry_idx = i
                else:
                    state = "flat"

        prev_signal = curr

    # Force-close any open position at the last signal bar or end of data
    last_bar = n - 1
    if state == "long" and 0 <= entry_idx < last_bar:
        ep, xp = closes[entry_idx], closes[last_bar]
        ret = (xp - ep) / ep if ep != 0 else 0.0
        trades.append(
            _make_trade(dates, closes, entry_idx, last_bar, "long", ret)
        )
    elif state == "short" and 0 <= entry_idx < last_bar:
        ep, xp = closes[entry_idx], closes[last_bar]
        ret = (ep - xp) / ep if ep != 0 else 0.0
        trades.append(
            _make_trade(dates, closes, entry_idx, last_bar, "short", ret)
        )

    return trades


def _make_trade(
    dates: list[str],
    closes: list[float],
    entry_idx: int,
    exit_idx: int,
    pos_type: str,
    ret: float,
) -> dict:
    """Build a trade dict."""
    return {
        "entryDate": dates[entry_idx],
        "entryPrice": closes[entry_idx],
        "entryBarIndex": entry_idx,
        "exitDate": dates[exit_idx],
        "exitPrice": closes[exit_idx],
        "exitBarIndex": exit_idx,
        "returnPct": round(ret, 6),
        "barsHeld": exit_idx - entry_idx,
        "positionType": pos_type,
    }


# ------------------------------------------------------------------
# Statistics
# ------------------------------------------------------------------

def compute_stats(trades: list[dict]) -> dict:
    """Compute backtest statistics from a list of trade dicts.

    Each trade must have at least ``returnPct`` (float) and ``barsHeld``
    (int) keys.

    Returns a dict with summary statistics including risk-adjusted
    metrics (Sharpe, Sortino, Calmar) and drawdown analysis.
    """
    if not trades:
        return {
            "totalTrades": 0,
            "winRate": 0.0,
            "avgReturn": 0.0,
            "profitFactor": 0.0,
            "maxWin": 0.0,
            "maxLoss": 0.0,
            "totalReturn": 0.0,
            "sharpe": 0.0,
            "sortino": 0.0,
            "maxDrawdown": 0.0,
            "calmar": 0.0,
        }

    returns = [t["returnPct"] for t in trades]
    bars_held = [t["barsHeld"] for t in trades]
    t = len(returns)

    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r <= 0]

    total_win = sum(wins)
    total_loss = abs(sum(losses))
    mean_return = sum(returns) / t

    # Profit factor
    if total_loss > 0:
        profit_factor = total_win / total_loss
    elif total_win > 0:
        profit_factor = float("inf")
    else:
        profit_factor = 0.0

    # Compounded total return
    total_return = 1.0
    for r in returns:
        total_return *= 1 + r
    total_return -= 1

    # Equity curve for drawdown
    equity_curve = [1.0]
    eq = 1.0
    for r in returns:
        eq *= 1 + r
        equity_curve.append(eq)

    # Max drawdown (peak-to-trough, expressed as negative number)
    peak = equity_curve[0]
    max_dd = 0.0
    for val in equity_curve:
        if val > peak:
            peak = val
        dd = (val - peak) / peak if peak != 0 else 0.0
        if dd < max_dd:
            max_dd = dd

    # Annualised metrics
    avg_bars = sum(bars_held) / t
    total_bars = sum(bars_held)
    trades_per_year = 252.0 / avg_bars if avg_bars > 0 else 0.0

    # Standard deviation of returns
    if t > 1:
        std_return = float(np.std(returns, ddof=1))
    else:
        std_return = 0.0

    # Sharpe ratio (annualised)
    if std_return > 0 and trades_per_year > 0:
        sharpe = (mean_return * trades_per_year) / (
            std_return * math.sqrt(trades_per_year)
        )
    else:
        sharpe = 0.0

    # Sortino ratio (annualised, downside deviation)
    downside = [min(r, 0.0) for r in returns]
    downside_sq_mean = sum(d * d for d in downside) / t
    downside_dev = math.sqrt(downside_sq_mean)

    if downside_dev > 0 and trades_per_year > 0:
        sortino = (mean_return * trades_per_year) / (
            downside_dev * math.sqrt(trades_per_year)
        )
    else:
        sortino = 0.0

    # Calmar ratio
    if total_bars > 0:
        annualized_return = total_return * (252.0 / total_bars)
    else:
        annualized_return = 0.0

    if max_dd != 0:
        calmar = annualized_return / abs(max_dd)
    else:
        calmar = 0.0

    # Clamp near-infinite profit factor for JSON safety
    if not math.isfinite(profit_factor):
        profit_factor = 9999.0

    return {
        "totalTrades": t,
        "winRate": round(len(wins) / t, 4),
        "avgReturn": round(mean_return, 6),
        "profitFactor": round(profit_factor, 4),
        "maxWin": round(max(returns), 6),
        "maxLoss": round(min(returns), 6),
        "totalReturn": round(total_return, 6),
        "sharpe": round(sharpe, 4),
        "sortino": round(sortino, 4),
        "maxDrawdown": round(max_dd, 6),
        "calmar": round(calmar, 4),
    }

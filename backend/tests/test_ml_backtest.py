import pytest
import numpy as np


def test_pair_trades_long_only():
    from ml.backtest import pair_trades

    signals = [
        {"barIndex": 5, "signal": 1, "confidence": 0.7},
        {"barIndex": 10, "signal": -1, "confidence": 0.6},
    ]
    dates = [f"2025-01-{i + 1:02d}" for i in range(20)]
    closes = [100 + i for i in range(20)]
    trades = pair_trades(signals, dates, closes, position_mode="long-only")
    assert len(trades) == 1
    assert trades[0]["positionType"] == "long"
    assert trades[0]["entryBarIndex"] == 5
    assert trades[0]["exitBarIndex"] == 10
    assert trades[0]["returnPct"] > 0  # prices going up


def test_pair_trades_both_directions():
    from ml.backtest import pair_trades

    signals = [
        {"barIndex": 5, "signal": 1, "confidence": 0.7},
        {"barIndex": 10, "signal": -1, "confidence": 0.6},
        {"barIndex": 15, "signal": 1, "confidence": 0.65},
    ]
    dates = [f"2025-01-{i + 1:02d}" for i in range(20)]
    closes = [100 + i * 0.5 for i in range(20)]
    trades = pair_trades(signals, dates, closes, position_mode="both")
    # Trade 1: long 5->10, Trade 2: short 10->15, Trade 3: long 15->19 (force-closed)
    assert len(trades) == 3
    assert trades[0]["positionType"] == "long"
    assert trades[1]["positionType"] == "short"
    assert trades[2]["positionType"] == "long"  # force-closed at end of data


def test_pair_trades_short_only():
    from ml.backtest import pair_trades

    signals = [
        {"barIndex": 5, "signal": -1, "confidence": 0.7},
        {"barIndex": 10, "signal": 1, "confidence": 0.6},
    ]
    dates = [f"2025-01-{i + 1:02d}" for i in range(20)]
    closes = [100 - i for i in range(20)]  # declining
    trades = pair_trades(signals, dates, closes, position_mode="short-only")
    assert len(trades) == 1
    assert trades[0]["positionType"] == "short"
    assert trades[0]["returnPct"] > 0  # short on declining prices


def test_force_close():
    from ml.backtest import pair_trades

    signals = [{"barIndex": 5, "signal": 1, "confidence": 0.7}]
    dates = [f"2025-01-{i + 1:02d}" for i in range(20)]
    closes = [100 + i for i in range(20)]
    trades = pair_trades(signals, dates, closes, position_mode="long-only")
    assert len(trades) == 1
    assert trades[0]["exitBarIndex"] > trades[0]["entryBarIndex"]


def test_compute_stats_basic():
    from ml.backtest import compute_stats

    trades = [
        {"returnPct": 0.05, "barsHeld": 5},
        {"returnPct": -0.02, "barsHeld": 3},
        {"returnPct": 0.08, "barsHeld": 7},
    ]
    stats = compute_stats(trades)
    assert stats["totalTrades"] == 3
    assert stats["winRate"] == pytest.approx(2 / 3, abs=0.01)
    assert stats["profitFactor"] > 1
    assert stats["sharpe"] != 0
    assert "sortino" in stats
    assert "maxDrawdown" in stats
    assert stats["maxDrawdown"] <= 0  # drawdown is negative
    assert "calmar" in stats


def test_compute_stats_empty():
    from ml.backtest import compute_stats

    stats = compute_stats([])
    assert stats["totalTrades"] == 0
    assert stats["sharpe"] == 0
    assert stats["sortino"] == 0
    assert stats["maxDrawdown"] == 0


def test_compute_stats_all_winners():
    from ml.backtest import compute_stats

    trades = [
        {"returnPct": 0.05, "barsHeld": 5},
        {"returnPct": 0.03, "barsHeld": 3},
    ]
    stats = compute_stats(trades)
    assert stats["winRate"] == 1.0
    assert stats["maxDrawdown"] == 0  # no drawdown if all winners
    assert stats["profitFactor"] > 100  # near infinity


def test_no_signals():
    from ml.backtest import pair_trades

    trades = pair_trades([], ["2025-01-01"], [100], position_mode="long-only")
    assert trades == []

"""Tests for ml.ensemble — 3-Layer Ensemble Predictor."""
import numpy as np
import pytest


def _make_ohlcv(n=400):
    np.random.seed(42)
    closes = 100 + np.cumsum(np.random.randn(n) * 0.5)
    highs = closes + np.abs(np.random.randn(n)) * 0.5
    lows = closes - np.abs(np.random.randn(n)) * 0.5
    opens = closes + np.random.randn(n) * 0.2
    volumes = np.abs(np.random.randn(n) * 1000) + 500
    dates = [f'2024-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}' for i in range(n)]
    return opens, highs, lows, closes, volumes, dates


# ---------------------------------------------------------------
# Meta-decision tests
# ---------------------------------------------------------------

def test_meta_decision_strong_buy():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(1, 'uptrend', 30) == 'strong_buy'


def test_meta_decision_buy():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(1, 'uptrend', 55) == 'buy'


def test_meta_decision_cautious_buy():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(1, 'sideways', 40) == 'cautious_buy'


def test_meta_decision_wait_conflicting():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(1, 'downtrend', 50) == 'wait'


def test_meta_decision_strong_sell():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(-1, 'downtrend', 30) == 'strong_sell'


def test_meta_decision_neutral():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(0, 'uptrend', 20) == 'neutral'


def test_meta_decision_high_risk_downgrade():
    from ml.ensemble import compute_meta_decision
    # High risk (>70) should downgrade strong_buy to buy
    result = compute_meta_decision(1, 'uptrend', 75)
    assert result != 'strong_buy'
    assert result in ('buy', 'cautious_buy')


def test_meta_decision_sell():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(-1, 'downtrend', 55) == 'sell'


def test_meta_decision_cautious_sell():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(-1, 'sideways', 40) == 'cautious_sell'


def test_meta_decision_wait_buy_sideways_high_risk():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(1, 'sideways', 60) == 'wait'


def test_meta_decision_wait_sell_uptrend():
    from ml.ensemble import compute_meta_decision
    assert compute_meta_decision(-1, 'uptrend', 30) == 'wait'


def test_meta_decision_high_risk_sell_downgrade():
    from ml.ensemble import compute_meta_decision
    # High risk (>70) should downgrade strong_sell to sell
    result = compute_meta_decision(-1, 'downtrend', 75)
    assert result != 'strong_sell'
    assert result in ('sell', 'cautious_sell')


# ---------------------------------------------------------------
# Layer training tests
# ---------------------------------------------------------------

def test_train_layer1():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    pred = EnsemblePredictor()
    result = pred.train_layer(
        'short_term', o, h, l, c, v,
        forward_period=5, threshold=0.01, train_ratio=0.7,
        n_walks=1, optuna_trials=0, feature_select_k=20,
    )
    assert 'signal' in result
    assert result['signal'] in [-1, 0, 1]
    assert 0 <= result['confidence'] <= 1
    assert 'oos_accuracy' in result
    assert 0 <= result['oos_accuracy'] <= 1
    assert 'feature_importance' in result
    assert len(result['equity_curve']) > 0


def test_train_layer2():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    pred = EnsemblePredictor()
    result = pred.train_layer(
        'medium_term', o, h, l, c, v,
        forward_period=20, threshold=0.02, train_ratio=0.7,
        n_walks=1, optuna_trials=0, feature_select_k=20,
    )
    assert 'trend' in result
    assert result['trend'] in ['uptrend', 'sideways', 'downtrend']
    assert 0 <= result['confidence'] <= 1


def test_train_risk_layer():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    pred = EnsemblePredictor()
    result = pred.train_risk_layer(o, h, l, c, v, train_ratio=0.7, feature_select_k=20)
    assert 'score' in result
    assert 0 <= result['score'] <= 100
    assert 'components' in result
    assert all(k in result['components'] for k in ['volatility', 'momentum', 'volume', 'technical'])


def test_full_pipeline():
    from ml.ensemble import EnsemblePredictor
    o, h, l, c, v, d = _make_ohlcv()
    pred = EnsemblePredictor()
    result = pred.train_all(
        o, h, l, c, v, d,
        layers_config={
            'short_term': {'forward_period': 5, 'threshold': 0.01},
            'medium_term': {'forward_period': 20, 'threshold': 0.02},
            'risk': {'enabled': True},
        },
        train_ratio=0.7, n_walks=1, optuna_trials=0,
        confidence_threshold=0.4, position_mode='both',
        feature_select_k=20,
    )
    assert 'layers' in result
    assert 'short_term' in result['layers']
    assert 'medium_term' in result['layers']
    assert 'risk_score' in result['layers']
    assert 'meta_decision' in result
    assert result['meta_decision'] in [
        'strong_buy', 'buy', 'cautious_buy', 'neutral', 'wait',
        'cautious_sell', 'sell', 'strong_sell',
    ]
    assert 'signals' in result
    assert 'trades' in result
    assert 'stats' in result
    assert 'warnings' in result
    assert isinstance(result['warnings'], list)
    assert 'training_meta' in result

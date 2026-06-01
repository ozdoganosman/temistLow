import numpy as np
import pytest


def test_short_term_labels_three_classes():
    from ml.labels import compute_short_term_labels
    # Create data with clear up/down/sideways sections
    closes = np.array([100, 102, 104, 98, 96, 100, 105, 95, 100, 103,
                       101, 99, 102, 104, 106, 108, 110, 100, 98, 97])
    labels = compute_short_term_labels(closes, forward_period=5, threshold=0.02)
    assert np.isnan(labels[-1]), "Last bars should be NaN"
    valid = labels[~np.isnan(labels)]
    unique = set(valid.astype(int))
    assert unique.issubset({-1, 0, 1})


def test_short_term_labels_asymmetric():
    from ml.labels import compute_short_term_labels
    closes = np.linspace(100, 150, 100)  # steady uptrend
    labels = compute_short_term_labels(closes, forward_period=5, threshold=0.01, threshold_short=0.05)
    valid = labels[~np.isnan(labels)]
    buy_count = (valid == 1).sum()
    short_count = (valid == -1).sum()
    assert buy_count > short_count


def test_medium_term_labels():
    from ml.labels import compute_medium_term_labels
    closes = np.linspace(100, 120, 50)  # 20% uptrend
    labels = compute_medium_term_labels(closes, forward_period=20, threshold=0.03)
    valid = labels[~np.isnan(labels)]
    assert (valid == 1).sum() > len(valid) * 0.5


def test_risk_target():
    from ml.labels import compute_risk_target
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


def test_validate_class_distribution_passes():
    from ml.labels import validate_class_distribution
    labels = np.array([1]*20 + [0]*20 + [-1]*20)
    validate_class_distribution(labels, min_samples=10)  # Should not raise


def test_validate_class_distribution_fails():
    from ml.labels import validate_class_distribution
    labels = np.array([1]*100 + [0]*5 + [-1]*2)
    with pytest.raises(ValueError, match="SAT"):
        validate_class_distribution(labels, min_samples=5)

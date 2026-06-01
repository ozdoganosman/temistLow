"""Tests for ml.models wrappers."""
import numpy as np
import pytest


def _make_classification_data(n=200, n_features=10):
    np.random.seed(42)
    X = np.random.randn(n, n_features)
    y = (X[:, 0] + X[:, 1] > 0).astype(int)
    y[X[:, 0] > 1] = 2  # 3-class
    return X, y


def test_lightgbm_wrapper():
    from ml.models import create_model, train_model, predict_proba

    X, y = _make_classification_data()
    model = create_model("lightgbm")
    train_model(model, X[:150], y[:150], model_type="lightgbm")
    proba = predict_proba(model, X[150:])
    assert proba.shape == (50, 3)
    assert np.allclose(proba.sum(axis=1), 1.0, atol=0.01)


def test_xgboost_wrapper():
    from ml.models import create_model, train_model, predict_proba

    X, y = _make_classification_data()
    model = create_model("xgboost")
    train_model(model, X[:150], y[:150], model_type="xgboost")
    proba = predict_proba(model, X[150:])
    assert proba.shape == (50, 3)


def test_mlp_wrapper():
    from ml.models import create_model, train_model, predict_proba

    X, y = _make_classification_data()
    model = create_model("mlp")
    train_model(model, X[:150], y[:150], model_type="mlp")
    proba = predict_proba(model, X[150:])
    assert proba.shape == (50, 3)


def test_regressor():
    from ml.models import create_model

    X = np.random.randn(100, 5)
    y = np.random.randn(100) * 50 + 50  # regression targets
    model = create_model("lightgbm_regressor")
    model.fit(X[:80], y[:80])
    preds = model.predict(X[80:])
    assert preds.shape == (20,)


def test_optuna_tuning():
    from ml.models import tune_hyperparameters

    X, y = _make_classification_data()
    best_params = tune_hyperparameters(
        X[:150], y[:150], model_type="lightgbm", n_trials=5
    )
    assert "n_estimators" in best_params
    assert "max_depth" in best_params


def test_feature_selection():
    from ml.models import select_features_by_importance

    X, y = _make_classification_data(n=200, n_features=20)
    names = [f"f{i}" for i in range(20)]
    indices, selected = select_features_by_importance(X, y, names, top_k=10)
    assert len(indices) == 10
    assert len(selected) == 10
    assert all(isinstance(i, (int, np.integer)) for i in indices)


def test_sample_weights():
    from ml.models import compute_sample_weights

    y = np.array([0, 0, 0, 1, 1, 2])  # imbalanced
    w = compute_sample_weights(y)
    assert len(w) == 6
    # Class 0 (3 samples) should have lower weight than class 2 (1 sample)
    assert w[0] < w[5]


def test_label_maps():
    from ml.models import LABEL_MAP, INV_LABEL_MAP

    assert LABEL_MAP[-1] == 0
    assert LABEL_MAP[0] == 1
    assert LABEL_MAP[1] == 2
    for k, v in LABEL_MAP.items():
        assert INV_LABEL_MAP[v] == k

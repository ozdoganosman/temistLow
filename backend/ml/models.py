"""Model wrappers for LightGBM, XGBoost, MLP with Optuna tuning."""
from __future__ import annotations

import numpy as np
from collections import Counter

import lightgbm as lgb
import xgboost as xgb
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import StratifiedKFold

# ---------------------------------------------------------------------------
# Label mapping: original labels (-1, 0, 1) <-> 0-indexed (0, 1, 2)
# ---------------------------------------------------------------------------
LABEL_MAP = {-1: 0, 0: 1, 1: 2}       # Original -> 0-indexed for training
INV_LABEL_MAP = {0: -1, 1: 0, 2: 1}   # 0-indexed -> original


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------
def create_model(model_type: str, params: dict | None = None):
    """Create a model instance.

    Parameters
    ----------
    model_type : str
        One of 'lightgbm', 'xgboost', 'mlp', 'lightgbm_regressor'.
    params : dict | None
        Optional parameter overrides merged on top of defaults.

    Returns
    -------
    A scikit-learn-compatible estimator.
    """
    extra_params = params or {}

    if model_type == "lightgbm":
        defaults = dict(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            num_leaves=31,
            class_weight="balanced",
            verbosity=-1,
            n_jobs=-1,
        )
        defaults.update(extra_params)
        return lgb.LGBMClassifier(**defaults)

    if model_type == "xgboost":
        defaults = dict(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            eval_metric="mlogloss",
            verbosity=0,
            n_jobs=-1,
        )
        defaults.update(extra_params)
        return xgb.XGBClassifier(**defaults)

    if model_type == "mlp":
        defaults = dict(
            hidden_layer_sizes=(64, 32),
            activation="relu",
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.1,
            random_state=42,
        )
        defaults.update(extra_params)
        return MLPClassifier(**defaults)

    if model_type == "lightgbm_regressor":
        defaults = dict(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            verbosity=-1,
            n_jobs=-1,
        )
        defaults.update(extra_params)
        return lgb.LGBMRegressor(**defaults)

    raise ValueError(f"Unknown model_type: {model_type!r}")


# ---------------------------------------------------------------------------
# Training helper
# ---------------------------------------------------------------------------
def train_model(
    model,
    X_train,
    y_train,
    model_type: str,
    sample_weight=None,
):
    """Train *model* in-place.

    For XGBoost classifiers, balanced sample weights are computed
    automatically when *sample_weight* is not provided.
    """
    if model_type == "xgboost":
        if sample_weight is None:
            sample_weight = compute_sample_weights(np.asarray(y_train))
        model.fit(X_train, y_train, sample_weight=sample_weight)
    else:
        model.fit(X_train, y_train)


# ---------------------------------------------------------------------------
# Prediction helper
# ---------------------------------------------------------------------------
def predict_proba(model, X) -> np.ndarray:
    """Return class probabilities, shape (n_samples, n_classes)."""
    return model.predict_proba(X)


# ---------------------------------------------------------------------------
# Sample-weight computation (balanced)
# ---------------------------------------------------------------------------
def compute_sample_weights(y: np.ndarray) -> np.ndarray:
    """Compute balanced sample weights.

    w[i] = n / (n_classes * count_of_class_i)
    """
    n = len(y)
    counts = Counter(y)
    n_classes = len(counts)
    weights = np.array(
        [n / (n_classes * counts[label]) for label in y], dtype=np.float64
    )
    return weights


# ---------------------------------------------------------------------------
# Feature selection via LightGBM importance
# ---------------------------------------------------------------------------
def select_features_by_importance(
    X,
    y,
    feature_names: list[str],
    top_k: int = 25,
) -> tuple[list[int], list[str]]:
    """Train a quick LightGBM and return top-k feature indices/names.

    Returns
    -------
    (sorted_indices, selected_feature_names)
    """
    quick_model = lgb.LGBMClassifier(
        n_estimators=50,
        max_depth=4,
        verbosity=-1,
        n_jobs=-1,
    )
    quick_model.fit(X, y)
    importances = quick_model.feature_importances_
    sorted_indices = np.argsort(importances)[::-1][:top_k]
    sorted_indices_list = [int(i) for i in sorted_indices]
    selected_names = [feature_names[i] for i in sorted_indices_list]
    return sorted_indices_list, selected_names


# ---------------------------------------------------------------------------
# Optuna hyperparameter tuning
# ---------------------------------------------------------------------------
def tune_hyperparameters(
    X,
    y,
    model_type: str,
    n_trials: int = 30,
    timeout: int | None = None,
) -> dict:
    """Use Optuna to find best hyperparameters via 3-fold CV accuracy.

    Parameters
    ----------
    X, y : array-like
        Training data.
    model_type : str
        'lightgbm', 'xgboost', or 'mlp'.
    n_trials : int
        Number of Optuna trials.
    timeout : int | None
        Optional timeout in seconds.

    Returns
    -------
    dict  -- best parameters found.
    """
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    X = np.asarray(X)
    y = np.asarray(y)

    def objective(trial: optuna.Trial) -> float:
        if model_type == "lightgbm":
            params = dict(
                n_estimators=trial.suggest_int("n_estimators", 50, 500),
                max_depth=trial.suggest_int("max_depth", 3, 8),
                learning_rate=trial.suggest_float(
                    "learning_rate", 0.01, 0.3, log=True
                ),
                min_child_samples=trial.suggest_int("min_child_samples", 5, 50),
                num_leaves=trial.suggest_int("num_leaves", 15, 63),
            )
            model = create_model("lightgbm", params)

        elif model_type == "xgboost":
            params = dict(
                n_estimators=trial.suggest_int("n_estimators", 50, 500),
                max_depth=trial.suggest_int("max_depth", 3, 8),
                learning_rate=trial.suggest_float(
                    "learning_rate", 0.01, 0.3, log=True
                ),
                min_child_samples=trial.suggest_int("min_child_samples", 5, 50),
                num_leaves=trial.suggest_int("num_leaves", 15, 63),
                reg_alpha=trial.suggest_float("reg_alpha", 1e-4, 1.0, log=True),
                reg_lambda=trial.suggest_float("reg_lambda", 1e-4, 1.0, log=True),
            )
            model = create_model("xgboost", params)

        elif model_type == "mlp":
            hidden_choices = [(32,), (64, 32), (128, 64, 32)]
            idx = trial.suggest_categorical(
                "hidden_layer_sizes_idx", [0, 1, 2]
            )
            params = dict(
                hidden_layer_sizes=hidden_choices[idx],
                alpha=trial.suggest_float("alpha", 1e-4, 1e-2, log=True),
                learning_rate_init=trial.suggest_float(
                    "learning_rate_init", 1e-4, 1e-2, log=True
                ),
            )
            model = create_model("mlp", params)
        else:
            raise ValueError(f"Tuning not supported for {model_type!r}")

        skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        accuracies = []
        for train_idx, val_idx in skf.split(X, y):
            X_tr, X_val = X[train_idx], X[val_idx]
            y_tr, y_val = y[train_idx], y[val_idx]
            train_model(model, X_tr, y_tr, model_type=model_type)
            acc = (model.predict(X_val) == y_val).mean()
            accuracies.append(acc)

        return float(np.mean(accuracies))

    study = optuna.create_study(
        direction="maximize",
        pruner=optuna.pruners.MedianPruner(),
    )
    study.optimize(objective, n_trials=n_trials, timeout=timeout)

    best_params = study.best_params.copy()

    # Convert hidden_layer_sizes_idx back to actual tuple for MLP
    if model_type == "mlp" and "hidden_layer_sizes_idx" in best_params:
        hidden_choices = [(32,), (64, 32), (128, 64, 32)]
        best_params["hidden_layer_sizes"] = hidden_choices[
            best_params.pop("hidden_layer_sizes_idx")
        ]

    return best_params

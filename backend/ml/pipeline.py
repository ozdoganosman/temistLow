"""ML training pipeline -- caching, orchestration, and cache management."""
from __future__ import annotations
import hashlib
import numpy as np
from ml.ensemble import EnsemblePredictor
from log import get_logger

logger = get_logger(__name__)

_model_cache: dict[str, dict] = {}
_MAX_CACHE = 20


def _hash_data(*arrays: np.ndarray) -> str:
    h = hashlib.md5()
    for a in arrays:
        h.update(a.tobytes())
    return h.hexdigest()[:16]


def _cache_key(data_hash: str, config: dict) -> str:
    """Deterministic cache key from data hash + config."""
    parts = [data_hash]
    # Add key config fields that affect results
    layers = config.get('layers', {})
    st = layers.get('short_term', {})
    mt = layers.get('medium_term', {})
    mc = config.get('model_config', {})
    tc = config.get('training', {})
    parts.append(f"st{st.get('forward_period', 5)}_{st.get('threshold', 0.02)}")
    parts.append(f"mt{mt.get('forward_period', 20)}_{mt.get('threshold', 0.03)}")
    parts.append(f"m{mc.get('short_term_model', 'lgb')}_{mc.get('medium_term_model', 'xgb+mlp')}")
    parts.append(f"e{mc.get('ensemble', True)}")
    parts.append(f"tr{tc.get('train_ratio', 0.7)}_w{tc.get('n_walks', 2)}_t{tc.get('optuna_trials', 30)}")
    parts.append(f"k{tc.get('feature_select_k', 30)}_c{tc.get('drop_corr_threshold', 0.9)}")
    parts.append(f"p{config.get('position_mode', 'both')}_cf{config.get('confidence_threshold', 0.55)}")
    return '_'.join(parts)


def train(ohlcv: list[dict], config: dict) -> dict:
    """
    Main training entry point called by the router.

    1. Parse OHLCV arrays from dicts
    2. Check cache
    3. Instantiate EnsemblePredictor
    4. Call train_all()
    5. Cache result
    6. Return result
    """
    # Parse arrays
    opens = np.array([d["open"] for d in ohlcv], dtype=float)
    highs = np.array([d["high"] for d in ohlcv], dtype=float)
    lows = np.array([d["low"] for d in ohlcv], dtype=float)
    closes = np.array([d["close"] for d in ohlcv], dtype=float)
    volumes = np.nan_to_num(np.array([d.get("volume", 0) for d in ohlcv], dtype=float), nan=0.0)
    dates = [d["date"] for d in ohlcv]

    # Cache check
    data_hash = _hash_data(closes, volumes)
    ckey = _cache_key(data_hash, config)
    if ckey in _model_cache:
        logger.debug("ML cache hit: %s", ckey[:32])
        return _model_cache[ckey]

    # Parse config
    layers_config = config.get('layers', {
        'short_term': {'forward_period': 5, 'threshold': 0.02},
        'medium_term': {'forward_period': 20, 'threshold': 0.03},
        'risk': {'enabled': True},
    })
    model_config = config.get('model_config', {})
    training = config.get('training', {})
    position_mode = config.get('position_mode', 'both')
    confidence_threshold = config.get('confidence_threshold', 0.55)

    # Train
    predictor = EnsemblePredictor()
    result = predictor.train_all(
        opens, highs, lows, closes, volumes, dates,
        layers_config=layers_config,
        model_config=model_config,
        train_ratio=training.get('train_ratio', 0.7),
        n_walks=training.get('n_walks', 2),
        optuna_trials=training.get('optuna_trials', 30),
        feature_select_k=training.get('feature_select_k', 30),
        drop_corr_threshold=training.get('drop_corr_threshold', 0.90),
        confidence_threshold=confidence_threshold,
        position_mode=position_mode,
    )

    # Cache
    if len(_model_cache) >= _MAX_CACHE:
        oldest = next(iter(_model_cache))
        del _model_cache[oldest]
    _model_cache[ckey] = result
    logger.info("ML training complete, cached: %s", ckey[:32])

    return result


def clear_cache():
    """Clear the model cache."""
    _model_cache.clear()

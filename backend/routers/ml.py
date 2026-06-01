"""ML training API endpoints -- 3-layer ensemble system."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from log import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["ml"])


class ModelConfig(BaseModel):
    short_term_model: str = "lightgbm"
    medium_term_model: str = "xgboost+mlp"
    ensemble: bool = True
    mlp_weight: float = 0.4


class TrainingConfig(BaseModel):
    preset: str = "balanced"
    train_ratio: float = 0.7
    n_walks: int = 2
    optuna_trials: int = 30
    feature_select_k: int = 30
    drop_corr_threshold: float = 0.90
    use_boruta: bool = False


class MLTrainRequest(BaseModel):
    ohlcv: list[dict]
    layers: Optional[dict] = None
    models: Optional[ModelConfig] = None
    training: Optional[TrainingConfig] = None
    position_mode: str = "both"
    confidence_threshold: float = 0.55


@router.post("/api/ml/train")
def ml_train(req: MLTrainRequest):
    """Train a 3-layer ML ensemble on provided OHLCV data."""
    if len(req.ohlcv) < 100:
        raise HTTPException(status_code=422, detail="En az 100 bar veri gerekli")

    try:
        from ml.pipeline import train

        config = {
            'layers': req.layers or {
                'short_term': {'forward_period': 5, 'threshold': 0.02},
                'medium_term': {'forward_period': 20, 'threshold': 0.03},
                'risk': {'enabled': True},
            },
            'model_config': (req.models or ModelConfig()).model_dump(),
            'training': (req.training or TrainingConfig()).model_dump(),
            'position_mode': req.position_mode,
            'confidence_threshold': req.confidence_threshold,
        }

        result = train(ohlcv=req.ohlcv, config=config)
        return result

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("ML training error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/ml/cache")
def clear_ml_cache():
    """Clear ML model cache."""
    from ml.pipeline import clear_cache
    clear_cache()
    return {"cleared": True}

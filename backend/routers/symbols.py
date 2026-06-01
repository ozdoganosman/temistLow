"""Symbol listing and search endpoints."""
from fastapi import APIRouter, HTTPException, Query
import borsapy as bp

from log import get_logger
from shared import BIST_SYMBOLS, BIST_INDICES

logger = get_logger(__name__)
router = APIRouter(tags=["symbols"])


@router.get("/api/symbols")
def get_symbols():
    return {"stocks": BIST_SYMBOLS, "indices": BIST_INDICES}


@router.get("/api/search")
def search_symbol(q: str = Query(..., min_length=1)):
    try:
        results = bp.search_bist(q)
        if results is None:
            return {"results": []}
        if hasattr(results, 'to_dict'):
            return {"results": results.to_dict('records')}
        return {"results": list(results) if results else []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""Market scan endpoints -- all indicators on all symbols."""
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import borsapy as bp
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from config import SCAN_CACHE_TTL, SCAN_MAX_WORKERS
from log import get_logger
from shared import BIST_SYMBOLS
from indicators import compute_all_indicators

logger = get_logger(__name__)
router = APIRouter(tags=["scan"])

_scan_cache: dict | None = None
_scan_cache_time: float = 0
_scan_lock = threading.Lock()


def _fetch_and_analyze(symbol: str) -> dict | None:
    """Fetch OHLCV history for one symbol and compute all indicators."""
    try:
        t = bp.Ticker(symbol)
        df = t.history(period="max", interval="1d")
        if df is None or df.empty or len(df) < 30:
            return None

        opens = df["Open"].to_numpy(dtype=float)
        highs = df["High"].to_numpy(dtype=float)
        lows = df["Low"].to_numpy(dtype=float)
        closes = df["Close"].to_numpy(dtype=float)
        volumes = df["Volume"].to_numpy(dtype=float)

        # Replace NaN in volumes
        volumes = np.nan_to_num(volumes, nan=0.0)

        last_close = float(closes[-1])
        last_volume = int(volumes[-1])

        results = compute_all_indicators(opens, highs, lows, closes, volumes)

        row: dict = {
            "symbol": symbol,
            "close": round(last_close, 2),
            "volume": last_volume,
            "data_points": len(closes),
        }
        for r in results:
            row[f"{r.name}_score"] = round(r.score, 4)
            row[f"{r.name}_signal"] = r.signal
            for k, v in r.details.items():
                if isinstance(v, bool):
                    row[f"{r.name}_{k}"] = v
                elif isinstance(v, (int, float)):
                    row[f"{r.name}_{k}"] = round(float(v), 4) if isinstance(v, float) else v
        return row
    except Exception:
        return None


@router.get("/api/scan")
async def scan_market():
    """Scan all BIST symbols with all indicators. Returns SSE stream with progress."""
    global _scan_cache, _scan_cache_time

    # Check cache first
    now = time.time()
    with _scan_lock:
        if _scan_cache is not None and (now - _scan_cache_time) < SCAN_CACHE_TTL:
            return _scan_cache

    async def generate():
        global _scan_cache, _scan_cache_time
        symbols = [s["name"] for s in BIST_SYMBOLS]
        total = len(symbols)
        results = []

        with ThreadPoolExecutor(max_workers=SCAN_MAX_WORKERS) as executor:
            futures = {
                executor.submit(_fetch_and_analyze, sym): sym
                for sym in symbols
            }
            completed = 0
            for future in as_completed(futures):
                completed += 1
                row = future.result()
                if row is not None:
                    results.append(row)

                if completed % 10 == 0 or completed == total:
                    progress_data = json.dumps({
                        "type": "progress",
                        "completed": completed,
                        "total": total,
                        "found": len(results),
                    })
                    yield f"data: {progress_data}\n\n"

        # Sort by symbol name
        results.sort(key=lambda r: r["symbol"])

        # Cache results
        cache_time = time.time()
        with _scan_lock:
            _scan_cache = {
                "type": "complete",
                "results": results,
                "total_symbols": total,
                "analyzed": len(results),
                "timestamp": cache_time,
            }
            _scan_cache_time = cache_time

        final_data = json.dumps(_scan_cache)
        yield f"data: {final_data}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/api/scan/results")
def get_scan_results():
    """Return cached scan results if available."""
    with _scan_lock:
        if _scan_cache is not None:
            age = time.time() - _scan_cache_time
            return {**_scan_cache, "cache_age_seconds": int(age)}
    return {"results": [], "cached": False}


@router.delete("/api/scan/cache")
def clear_scan_cache():
    """Clear scan cache to force re-scan."""
    global _scan_cache, _scan_cache_time
    with _scan_lock:
        _scan_cache = None
        _scan_cache_time = 0
    return {"cleared": True}

"""Historical OHLCV data endpoint."""
from fastapi import APIRouter, HTTPException, Query
import borsapy as bp

from log import get_logger
from shared import _validate_symbol

logger = get_logger(__name__)
router = APIRouter(tags=["history"])


@router.get("/api/history/{symbol}")
def get_history(
    symbol: str,
    period: str = Query(default="1y", description="1d,5d,1mo,3mo,6mo,1y,2y,5y,max"),
    interval: str = Query(default="1d", description="1m,5m,15m,30m,1h,1d,1wk,1mo"),
):
    try:
        _validate_symbol(symbol)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    try:
        t = bp.Ticker(symbol)
        df = t.history(period=period, interval=interval)

        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        intraday = interval in ('1m', '5m', '15m', '30m', '1h')
        records = []
        for idx, row in df.iterrows():
            ts = idx
            if hasattr(ts, 'isoformat'):
                if intraday:
                    date_str = ts.strftime('%Y-%m-%d %H:%M')
                else:
                    date_str = ts.strftime('%Y-%m-%d')
            else:
                date_str = str(ts)

            records.append({
                "date": date_str,
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            })

        return {"symbol": symbol, "data": records}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

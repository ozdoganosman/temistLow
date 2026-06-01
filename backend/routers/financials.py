"""Financial statements endpoints."""
from fastapi import APIRouter, HTTPException, Query

from config import CACHE_DIR
from log import get_logger
from shared import BANK_SYMBOLS, _validate_symbol, _get_cached_financials

logger = get_logger(__name__)
router = APIRouter(tags=["financials"])


@router.get("/api/financials/{symbol}")
def get_financials(
    symbol: str,
    report: str = Query(default="income_stmt", description="income_stmt, balance_sheet, cashflow"),
    quarterly: bool = Query(default=False),
):
    """Fetch financial statements with local file cache."""
    try:
        _validate_symbol(symbol)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    try:
        is_bank = symbol.upper() in BANK_SYMBOLS
        fg = "2" if is_bank else "1"

        df = _get_cached_financials(symbol, fg)

        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No financial data for {symbol}",
            )

        # Filter by report type using FINANCIAL_ITEM_CODE prefix
        if "FINANCIAL_ITEM_CODE" in df.columns:
            code_col = df["FINANCIAL_ITEM_CODE"].astype(str)
            if report == "income_stmt":
                df = df[code_col.str.startswith("3")]
            elif report == "balance_sheet":
                df = df[code_col.str.match(r"^[12]")]
            elif report == "cashflow":
                df = df[code_col.str.startswith("4C")]

        # Period columns are like '2010/3', '2010/6', '2010/9', '2010/12'
        period_cols = [c for c in df.columns if "/" in str(c)]

        if not quarterly:
            period_cols = [c for c in period_cols if str(c).endswith("/12")]

        def sort_key(col):
            parts = str(col).split("/")
            return (int(parts[0]), int(parts[1]))
        period_cols.sort(key=sort_key)

        records = []
        for _, row in df.iterrows():
            item_name = str(row.get("FINANCIAL_ITEM_NAME_TR", ""))
            if not item_name:
                continue
            rec = {"item": item_name}
            for col in period_cols:
                val = row.get(col)
                if val is None or (isinstance(val, float) and val != val):
                    rec[str(col)] = None
                else:
                    try:
                        rec[str(col)] = float(val)
                    except (ValueError, TypeError):
                        rec[str(col)] = None
            records.append(rec)

        periods = [str(c) for c in period_cols]

        return {
            "symbol": symbol,
            "report": report,
            "quarterly": quarterly,
            "periods": periods,
            "data": records,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Financials error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/financials/cache")
def clear_cache():
    """Clear all cached financial data."""
    count = 0
    for f in CACHE_DIR.glob("*.pkl"):
        f.unlink()
        count += 1
    return {"cleared": count}

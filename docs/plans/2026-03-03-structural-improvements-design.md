# Structural Improvements Design

**Date**: 2026-03-03
**Status**: Approved

## Scope

All improvements executed in parallel across 5 groups.

## 1. Frontend Structural

### 1.1 Lazy Loading
- `React.lazy()` + `Suspense` for: MarketAnalysis, MultiChartView, BacktestView, FinancialAnalysisView, CryptoPage
- Fallback: loading overlay with Turkish text

### 1.2 Toolbar Prop Drilling
- Extract `useToolbarProps()` hook from App.tsx
- Hook consumes AppContext + local state, returns toolbar props object
- Reduces App.tsx by ~40 lines

### 1.3 CSS Theme Consolidation
- Remove `colors.ts` hardcoded tokens
- Add `getThemeColors()` utility reading CSS custom properties via `getComputedStyle`
- Single source of truth: `variables.css`

## 2. Backend Structural

### 2.1 Router Split
- `routers/symbols.py` — /api/symbols, /api/search
- `routers/history.py` — /api/history/{symbol}
- `routers/financials.py` — /api/financials/*
- `routers/scan.py` — /api/scan/*
- `routers/ml.py` — /api/ml/*
- `routers/ws.py` — WebSocket /ws/stream/{symbol}
- `main.py` — App factory, CORS, startup, shared state

### 2.2 Error Handling
- HTTPException with proper status codes (404, 422, 500)
- Consistent error response format

### 2.3 Logging
- `logging` module replacing all `print()` calls
- Format: `%(asctime)s %(levelname)s %(name)s %(message)s`

### 2.4 Environment Config
- `python-dotenv` + `config.py`
- Variables: CORS_ORIGINS, WS_TIMEOUT, CACHE_DIR, LOG_LEVEL, HOST, PORT

### 2.5 Thread-Safe Cache
- `threading.Lock()` on scan cache and ML cache dicts

## 3. DX / Project Quality

### 3.1 ESLint + Prettier
- eslint + @typescript-eslint + eslint-plugin-react-hooks
- prettier + eslint-config-prettier
- Scripts: `lint`, `format`

### 3.2 dist/ Cleanup
- `git rm -r --cached dist/`
- Verify .gitignore already has dist entry

## 4. i18n

- `react-i18next` + `i18next`
- `src/i18n/i18n.ts` config
- `src/i18n/locales/tr.json`, `src/i18n/locales/en.json`
- All hardcoded Turkish strings replaced with `t('key')`
- Default language: TR

## 5. Testing

### Frontend
- Keep existing 2 test files
- Add tests for: computeFinancialMetrics, signalOptimizer, formatters
- Add component tests with @testing-library/react: Toolbar, Legend, StockSummary

### Backend
- pytest + httpx
- Test files per router: test_symbols.py, test_history.py, test_financials.py, test_scan.py, test_ml.py
- Edge cases: invalid symbol, empty data, path traversal

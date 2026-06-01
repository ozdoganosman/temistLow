# Structural Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the Borsa project with lazy loading, backend router split, ESLint/Prettier, CSS theme consolidation, i18n, proper logging/error handling, .env config, and comprehensive tests.

**Architecture:** Parallel execution across 5 independent workstreams: (A) Frontend structural, (B) Backend structural, (C) DX tooling, (D) i18n, (E) Testing. Each workstream can be assigned to a separate agent since they touch non-overlapping files.

**Tech Stack:** React 18 + TypeScript + Vite 6, FastAPI + Python, react-i18next, ESLint + Prettier, pytest + httpx, vitest + @testing-library/react

---

## Task 1: ESLint + Prettier Setup

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Modify: `package.json` (add devDeps + scripts)

**Step 1: Install dependencies**

Run:
```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier eslint-config-prettier
```

**Step 2: Create eslint.config.js**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettierConfig,
  { ignores: ['dist/', 'node_modules/', 'public/'] },
);
```

**Step 3: Create .prettierrc**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

**Step 4: Add scripts to package.json**

Add to `"scripts"`:
```json
"lint": "eslint src/",
"lint:fix": "eslint src/ --fix",
"format": "prettier --write \"src/**/*.{ts,tsx,css}\""
```

**Step 5: Run lint to check current state**

Run: `npm run lint 2>&1 | head -50`
Expected: Some warnings but no blocking errors

**Step 6: Run format on all files**

Run: `npm run format`

**Step 7: Commit**

```bash
git add eslint.config.js .prettierrc package.json package-lock.json src/
git commit -m "chore: add ESLint + Prettier configuration"
```

---

## Task 2: Remove dist/ from Git Tracking

**Files:**
- Modify: `.gitignore` (verify `dist` entry exists)

**Step 1: Verify .gitignore has dist entry**

Run: `grep -n "dist" .gitignore`
Expected: Should show `dist` line. If missing, add it.

**Step 2: Remove dist/ from tracking**

Run: `git rm -r --cached dist/`

**Step 3: Commit**

```bash
git commit -m "chore: remove dist/ from git tracking"
```

---

## Task 3: CSS Theme Consolidation

**Files:**
- Delete: `src/theme/colors.ts`
- Modify: `src/contexts/ThemeContext.tsx`

**Context:** `colors.ts` exports `darkTheme` and `lightTheme` objects that duplicate CSS variables in `variables.css`. The `useTheme().colors` field is exported from ThemeContext but NEVER consumed anywhere. `chartBuilder.ts` already reads CSS variables via `getComputedStyle`. We can safely remove the TS duplication.

**Step 1: Simplify ThemeContext.tsx**

Replace entire file with:
```tsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { loadFromStorage, saveToStorage } from '../utils/storage';

type ThemeName = 'dark' | 'light';

interface ThemeContextValue {
  theme: ThemeName;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

const STORAGE_KEY = 'borsa_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() =>
    loadFromStorage<ThemeName>(STORAGE_KEY, 'dark'),
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveToStorage(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
```

**Step 2: Delete colors.ts**

Run: `rm src/theme/colors.ts`

**Step 3: Verify no other imports of colors.ts**

Run: `grep -r "colors" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: Only chartBuilder's own ThemeColors interface and `UP_COLOR`/`DOWN_COLOR` constants remain.

**Step 4: Build to verify**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add src/theme/ src/contexts/ThemeContext.tsx
git commit -m "refactor: consolidate theme to single CSS source of truth"
```

---

## Task 4: Lazy Loading in App.tsx

**Files:**
- Modify: `src/App.tsx` (lines 1-28 imports, lines 252-261 kripto, lines 350-391 views)

**Step 1: Replace static imports with lazy imports**

Replace lines 10, 13-15, 19 (MarketAnalysis, MultiChartView, BacktestView, FinancialAnalysisView, CryptoPage) with:
```tsx
import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
// ... keep all other static imports except the 5 lazy ones ...

const MarketAnalysis = lazy(() => import('./components/Analysis/MarketAnalysis'));
const MultiChartView = lazy(() => import('./components/MultiChart/MultiChartView'));
const BacktestView = lazy(() => import('./components/Backtest/BacktestView'));
const FinancialAnalysisView = lazy(() => import('./components/FinancialAnalysis/FinancialAnalysisView'));
const CryptoPage = lazy(() => import('./components/Crypto/CryptoPage'));
```

**Step 2: Add loading fallback component**

Add after imports:
```tsx
function ViewFallback() {
  return <div className="loading-overlay">Yükleniyor...</div>;
}
```

**Step 3: Wrap lazy components with Suspense**

Wrap each lazy component usage:
- CryptoPage (line ~256): `<Suspense fallback={<ViewFallback />}><CryptoPage ... /></Suspense>`
- MarketAnalysis (line ~353): `<Suspense fallback={<ViewFallback />}><MarketAnalysis ... /></Suspense>`
- MultiChartView (line ~359): `<Suspense fallback={<ViewFallback />}><MultiChartView ... /></Suspense>`
- BacktestView (line ~376): `<Suspense fallback={<ViewFallback />}><BacktestView ... /></Suspense>`
- FinancialAnalysisView (line ~383): `<Suspense fallback={<ViewFallback />}><FinancialAnalysisView ... /></Suspense>`

**Step 4: Ensure each lazy-loaded component has a default export**

Check that each of the 5 components uses `export default function ...` (they all do already).

**Step 5: Build to verify code splitting**

Run: `npm run build`
Expected: Build output shows additional chunks beyond echarts and xlsx.

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "perf: lazy-load 5 view components for code splitting"
```

---

## Task 5: Extract useToolbarProps Hook

**Files:**
- Create: `src/hooks/useToolbarProps.ts`
- Modify: `src/App.tsx` (lines 213-249)

**Step 1: Create the hook file**

```tsx
import { useCallback, useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../components/Toast/Toast';
import { useWatchlist } from './useWatchlist';
import { useAlarms } from './useAlarms';
import { useIsMobile } from './useMediaQuery';
import { useHistoryData } from './useHistoryData';
import { fetchSymbols, fetchDataTimestamp } from '../api/borsaApi';
import type { SymbolInfo } from '../api/borsaApi';
import type { Interval, LegendData, ActiveView } from '../components/Chart/types';

// Hash routing helpers
const VIEW_ROUTES: ActiveView[] = ['analysis', 'multichart', 'backtest', 'finansal', 'kripto'];

function parseHash(): { symbol?: string; view?: ActiveView } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return {};
  if (VIEW_ROUTES.includes(hash as ActiveView)) return { view: hash as ActiveView };
  if (/^[A-Za-z0-9]+$/.test(hash)) return { symbol: hash.toUpperCase(), view: 'chart' };
  return {};
}

function writeHash(view: ActiveView, symbol: string) {
  const next = view === 'chart' ? `#/${symbol}` : `#/${view}`;
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}

export function useToolbarProps() {
  const {
    showBollinger, showRSI, showMACD, showStochRSI, showSuperTrend,
    showIchimoku, showOBV, showFinancials, showSignals, logScale,
    signalConfig, signalDateRange, toggle, setSignalConfig, setSignalDateRange,
  } = useAppContext();

  const { toast } = useToast();

  const initial = parseHash();
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [symbol, setSymbol] = useState(initial.symbol ?? 'THYAO');
  const [interval, setInterval_] = useState<Interval>('1d');
  const [legendData, setLegendData] = useState<LegendData | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>(initial.view ?? 'chart');
  const [dataTimestamp, setDataTimestamp] = useState<number | null>(null);
  const [finHeight, setFinHeight] = useState(300);
  const [sigHeight, setSigHeight] = useState(300);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [alarmsOpen, setAlarmsOpen] = useState(false);
  const splitterRef = useRef<HTMLDivElement>(null);
  const sigSplitterRef = useRef<HTMLDivElement>(null);

  const { watchlist, toggleSymbol, removeSymbol, isWatched } = useWatchlist();
  const { alarms, addAlarm, removeAlarm, updateAlarm, resetTriggered, uniqueActiveSymbols } = useAlarms();
  const isMobile = useIsMobile();
  const { data, loading } = useHistoryData(symbol, interval);

  // Reset legend when symbol changes
  useEffect(() => { setLegendData(null); }, [symbol]);

  // Fetch symbol list + data timestamp on mount
  useEffect(() => {
    fetchSymbols()
      .then((res) => { setSymbols([...res.stocks, ...res.indices]); })
      .catch(() => {
        toast('Sembol listesi yüklenemedi, varsayılan liste kullanılıyor', 'warning');
        setSymbols([
          { name: 'THYAO', displayName: 'Türk Hava Yolları' },
          { name: 'GARAN', displayName: 'Garanti Bankası' },
          { name: 'AKBNK', displayName: 'Akbank' },
          { name: 'ASELS', displayName: 'Aselsan' },
          { name: 'EREGL', displayName: 'Ereğli Demir Çelik' },
        ]);
      });
    fetchDataTimestamp().then((ts) => setDataTimestamp(ts));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state → hash
  useEffect(() => { writeHash(activeView, symbol); }, [activeView, symbol]);

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash();
      if (parsed.view) setActiveView(parsed.view);
      if (parsed.symbol) setSymbol(parsed.symbol);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Splitter drag — financials
  const finHeightRef = useRef(finHeight);
  finHeightRef.current = finHeight;
  useEffect(() => {
    if (!showFinancials) return;
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = finHeightRef.current;
      const onMove = (ev: MouseEvent) => {
        setFinHeight(Math.max(120, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY))));
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    const splitter = splitterRef.current;
    splitter?.addEventListener('mousedown', onMouseDown);
    return () => splitter?.removeEventListener('mousedown', onMouseDown);
  }, [showFinancials]);

  // Splitter drag — signals
  const sigHeightRef = useRef(sigHeight);
  sigHeightRef.current = sigHeight;
  useEffect(() => {
    if (!showSignals) return;
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = sigHeightRef.current;
      const onMove = (ev: MouseEvent) => {
        setSigHeight(Math.max(120, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY))));
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    const splitter = sigSplitterRef.current;
    splitter?.addEventListener('mousedown', onMouseDown);
    return () => splitter?.removeEventListener('mousedown', onMouseDown);
  }, [showSignals]);

  const lastBar = data.length > 0 ? data[data.length - 1] : null;
  const prevBar = data.length > 1 ? data[data.length - 2] : null;

  const handleLegendUpdate = useCallback((d: LegendData | null) => { setLegendData(d); }, []);
  const handleSymbolClick = useCallback((sym: string) => { setSymbol(sym); setActiveView('chart'); }, []);

  const toolbarProps = {
    symbol, symbols, interval,
    onSymbolChange: setSymbol,
    onIntervalChange: setInterval_,
    onToggleFinancials: () => toggle('showFinancials'), showFinancials,
    onToggleBollinger: () => toggle('showBollinger'), showBollinger,
    onToggleRSI: () => toggle('showRSI'), showRSI,
    onToggleMACD: () => toggle('showMACD'), showMACD,
    onToggleStochRSI: () => toggle('showStochRSI'), showStochRSI,
    onToggleSuperTrend: () => toggle('showSuperTrend'), showSuperTrend,
    onToggleIchimoku: () => toggle('showIchimoku'), showIchimoku,
    onToggleOBV: () => toggle('showOBV'), showOBV,
    logScale, onToggleLogScale: () => toggle('logScale'),
    activeView, onViewChange: setActiveView,
    watchlistOpen, onToggleWatchlist: () => setWatchlistOpen((v: boolean) => !v),
    isCurrentSymbolWatched: isWatched(symbol),
    onToggleCurrentSymbolWatch: () => toggleSymbol(symbol),
    alarmsOpen, onToggleAlarms: () => setAlarmsOpen((v: boolean) => !v),
    alarmCount: alarms.filter((a) => a.enabled && !a.triggered).length,
    dataTimestamp,
    onToggleSignals: () => toggle('showSignals'), showSignals,
  };

  return {
    // Toolbar props
    toolbarProps,
    // View state
    activeView, setActiveView,
    // Symbol state
    symbol, symbols, setSymbol,
    // Data
    data, loading, interval,
    // Legend
    legendData, lastBar, prevBar,
    handleLegendUpdate,
    // Panels
    showFinancials, finHeight, splitterRef,
    showSignals, sigHeight, sigSplitterRef,
    signalConfig, setSignalConfig,
    signalDateRange, setSignalDateRange,
    showBollinger, showRSI, showMACD, showStochRSI,
    showSuperTrend, showIchimoku, showOBV, logScale,
    // Watchlist
    watchlistOpen, setWatchlistOpen, watchlist, removeSymbol,
    handleSymbolClick,
    // Alarms
    alarmsOpen, setAlarmsOpen, alarms, addAlarm, removeAlarm, updateAlarm,
    resetTriggered, uniqueActiveSymbols,
    // Responsive
    isMobile,
  };
}
```

**Step 2: Refactor App.tsx to use the hook**

Replace AppContent with a much smaller component that just renders, consuming `useToolbarProps()`.

**Step 3: Build to verify**

Run: `npm run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/hooks/useToolbarProps.ts src/App.tsx
git commit -m "refactor: extract useToolbarProps hook from App.tsx"
```

---

## Task 6: Backend Config Module (.env Support)

**Files:**
- Create: `backend/config.py`
- Create: `backend/.env.example`
- Modify: `backend/requirements.txt` (add python-dotenv)

**Step 1: Add python-dotenv to requirements.txt**

Append: `python-dotenv`

**Step 2: Create config.py**

```python
"""Application configuration loaded from environment variables."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "*").split(",")
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8001"))
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
CACHE_DIR: Path = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent / "cache")))
CACHE_TTL: int = int(os.getenv("CACHE_TTL", "86400"))
SCAN_CACHE_TTL: int = int(os.getenv("SCAN_CACHE_TTL", "3600"))
SCAN_MAX_WORKERS: int = int(os.getenv("SCAN_MAX_WORKERS", "10"))
WS_TIMEOUT: int = int(os.getenv("WS_TIMEOUT", "30"))
```

**Step 3: Create .env.example**

```env
# CORS origins (comma-separated, * for all)
CORS_ORIGINS=*
# Server
HOST=0.0.0.0
PORT=8001
# Logging
LOG_LEVEL=INFO
# Cache
CACHE_DIR=./cache
CACHE_TTL=86400
SCAN_CACHE_TTL=3600
SCAN_MAX_WORKERS=10
WS_TIMEOUT=30
```

**Step 4: Add .env to .gitignore**

Verify `backend/.env` is in `.gitignore`. If not, add it.

**Step 5: Commit**

```bash
git add backend/config.py backend/.env.example backend/requirements.txt
git commit -m "feat: add config module with .env support"
```

---

## Task 7: Backend Logging Module

**Files:**
- Create: `backend/log.py`
- Modify: `backend/main.py` — replace all `print()` with logger calls

**Step 1: Create log.py**

```python
"""Centralized logging configuration."""
import logging
from config import LOG_LEVEL

def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Suppress noisy third-party loggers
    logging.getLogger("borsapy").setLevel(logging.ERROR)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
```

**Step 2: Replace print() calls in main.py**

Replace every `print(...)` with appropriate logger level:
- `print(f"TradingView stream connected")` → `logger.info("TradingView stream connected")`
- `print(f"Subscribed to realtime quotes for {symbol}")` → `logger.info("Subscribed to quotes: %s", symbol)`
- `print(f"Stream error for {symbol}: {e}")` → `logger.error("Stream error for %s: %s", symbol, e, exc_info=True)`
- `print(f"Cache hit: {symbol} ...")` → `logger.debug("Cache hit: %s (age %ds)", symbol, int(age))`
- `print(f"Fetching financials ...")` → `logger.info("Fetching financials for %s", symbol)`
- `print(f"Cached: {symbol} ...")` → `logger.debug("Cached %s (%d rows)", symbol, len(df))`
- `print(f"Cache write error: {e}")` → `logger.warning("Cache write error: %s", e)`
- `print(f"Financials error: {e}")` → `logger.error("Financials error: %s", e)`
- Remove `import traceback` and `traceback.print_exc()` calls (use `exc_info=True`)

Add at top of main.py:
```python
from log import setup_logging, get_logger
setup_logging()
logger = get_logger(__name__)
```

**Step 3: Do same for ml_predictor.py**

Add logger and replace any print() calls.

**Step 4: Verify import works**

Run: `cd backend && python -c "from main import app; print('OK')"`
Expected: OK

**Step 5: Commit**

```bash
git add backend/log.py backend/main.py backend/ml_predictor.py
git commit -m "refactor: replace print() with structured logging"
```

---

## Task 8: Backend Router Split

**Files:**
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/symbols.py`
- Create: `backend/routers/history.py`
- Create: `backend/routers/financials.py`
- Create: `backend/routers/scan.py`
- Create: `backend/routers/ml.py`
- Create: `backend/routers/ws.py`
- Modify: `backend/main.py` — app factory only

**Step 1: Create routers directory**

Run: `mkdir -p backend/routers && touch backend/routers/__init__.py`

**Step 2: Create routers/symbols.py**

Extract `/api/symbols` and `/api/search` endpoints. Import `BIST_SYMBOLS`, `BIST_INDICES` from main module or move symbol loading to a shared module.

```python
from fastapi import APIRouter, Query
import borsapy as bp
from log import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["symbols"])

# Loaded at module level from shared data
from shared import BIST_SYMBOLS, BIST_INDICES

@router.get("/symbols")
def get_symbols():
    return {"stocks": BIST_SYMBOLS, "indices": BIST_INDICES}

@router.get("/search")
def search_symbol(q: str = Query(..., min_length=1)):
    try:
        results = bp.search_bist(q)
        if results is None:
            return {"results": []}
        if hasattr(results, 'to_dict'):
            return {"results": results.to_dict('records')}
        return {"results": list(results) if results else []}
    except Exception:
        return {"results": []}
```

**Step 3: Create backend/shared.py**

Move shared state (symbols data, connections, locks, SSL session, validate_symbol, BANK_SYMBOLS) to `shared.py`.

**Step 4: Create remaining routers**

Each router file follows the same pattern: `APIRouter` with prefix, imports from `shared.py`, proper error handling.

**Step 5: Refactor main.py to app factory**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import CORS_ORIGINS
from log import setup_logging

setup_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    from shared import stream_tasks
    for task in stream_tasks.values():
        task.cancel()

app = FastAPI(title="Borsa API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import symbols, history, financials, scan, ml, ws
app.include_router(symbols.router)
app.include_router(history.router)
app.include_router(financials.router)
app.include_router(scan.router)
app.include_router(ml.router)
app.include_router(ws.router)

if __name__ == "__main__":
    import uvicorn
    from config import HOST, PORT
    uvicorn.run(app, host=HOST, port=PORT)
```

**Step 6: Verify all endpoints still work**

Run: `cd backend && python -c "from main import app; print([r.path for r in app.routes])"`
Expected: All 11 original routes present

**Step 7: Commit**

```bash
git add backend/routers/ backend/shared.py backend/main.py
git commit -m "refactor: split main.py into router modules"
```

---

## Task 9: Backend Error Handling

**Files:**
- Modify: `backend/routers/history.py`
- Modify: `backend/routers/financials.py`
- Modify: `backend/routers/scan.py`

**Step 1: Fix history endpoint**

Replace `return {"error": ...}` with `raise HTTPException(status_code=404, detail=...)` for no-data and `HTTPException(status_code=500, ...)` for exceptions.

**Step 2: Fix financials endpoint**

Same pattern — use 404 for empty data, 422 for invalid params, 500 for server errors.

**Step 3: Fix search endpoint**

Return 500 on exception instead of empty results silently.

**Step 4: Verify frontend handles HTTP errors**

Check that `borsaApi.ts` fetch calls check `response.ok` — they should already throw on non-200.

**Step 5: Commit**

```bash
git add backend/routers/
git commit -m "fix: return proper HTTP status codes from all endpoints"
```

---

## Task 10: Backend Thread-Safe Caches

**Files:**
- Modify: `backend/routers/scan.py` (or `shared.py` depending on where scan cache lives)

**Step 1: Add lock to scan cache**

```python
import threading
_scan_lock = threading.Lock()

# In scan_market():
with _scan_lock:
    if _scan_cache is not None and (now - _scan_cache_time) < SCAN_CACHE_TTL:
        return _scan_cache

# At cache write:
with _scan_lock:
    _scan_cache = result
    _scan_cache_time = time.time()
```

**Step 2: Verify ML cache has lock**

Check `ml_predictor.py` cache dict access is locked (may already be done in bug fix phase).

**Step 3: Commit**

```bash
git add backend/
git commit -m "fix: add thread-safe locks to scan and ML caches"
```

---

## Task 11: i18n Setup

**Files:**
- Create: `src/i18n/i18n.ts`
- Create: `src/i18n/locales/tr.json`
- Create: `src/i18n/locales/en.json`
- Modify: `src/main.tsx` (import i18n)
- Modify: `package.json` (add deps)

**Step 1: Install dependencies**

Run: `npm install i18next react-i18next`

**Step 2: Create i18n config**

`src/i18n/i18n.ts`:
```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: 'tr',
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
});

export default i18n;
```

**Step 3: Create Turkish locale**

`src/i18n/locales/tr.json` — extract ALL hardcoded Turkish strings from components. Key structure organized by component:

```json
{
  "common": {
    "loading": "Yükleniyor...",
    "dataLoading": "Veri yükleniyor...",
    "error": "Hata",
    "close": "Kapat",
    "save": "Kaydet",
    "delete": "Sil",
    "cancel": "İptal",
    "search": "Ara",
    "noData": "Veri bulunamadı"
  },
  "toolbar": {
    "symbolSearch": "Sembol ara...",
    "indicators": "İndikatörler",
    "financials": "Finansallar",
    "signals": "Sinyaller",
    "chart": "Grafik",
    "analysis": "Piyasa Analizi",
    "multichart": "Çoklu Grafik",
    "backtest": "Backtest",
    "financial": "Finansal Analiz",
    "crypto": "Kripto",
    "watchlist": "Favori Listesi",
    "alarms": "Alarmlar",
    "logScale": "Log Ölçek",
    "dataUpdated": "Veri güncellendi"
  },
  "stockSummary": {
    "lastPrice": "Son Fiyat",
    "change": "Değişim",
    "volume": "Hacim",
    "avgVolume20": "Ort. Hacim (20G)",
    "high52w": "52H Yüksek",
    "low52w": "52H Düşük"
  },
  "legend": {
    "open": "A",
    "high": "Y",
    "low": "D",
    "close": "K",
    "volume": "Hac"
  },
  "signals": {
    "panel": "Sinyal Paneli",
    "config": "Konfigürasyon",
    "optimizer": "Optimize Et",
    "mlPanel": "ML Tahmin",
    "savedConfigs": "Kayıtlı Ayarlar"
  },
  "analysis": {
    "title": "Piyasa Taraması",
    "scanning": "Taranıyor...",
    "lastScan": "Son tarama",
    "rescan": "Yeniden Tara"
  },
  "alarms": {
    "title": "Alarmlar",
    "addAlarm": "Alarm Ekle",
    "priceAbove": "Fiyat üstünde",
    "priceBelow": "Fiyat altında",
    "triggered": "Tetiklendi",
    "active": "Aktif"
  },
  "disclaimer": {
    "text": "Bu uygulama yalnızca bilgilendirme amaçlıdır. Yatırım tavsiyesi değildir."
  },
  "errors": {
    "symbolListFailed": "Sembol listesi yüklenemedi, varsayılan liste kullanılıyor",
    "dataFetchFailed": "Veri yüklenemedi",
    "connectionError": "Bağlantı hatası"
  }
}
```

**Step 4: Create English locale**

`src/i18n/locales/en.json` — same keys with English translations:

```json
{
  "common": {
    "loading": "Loading...",
    "dataLoading": "Loading data...",
    "error": "Error",
    "close": "Close",
    "save": "Save",
    "delete": "Delete",
    "cancel": "Cancel",
    "search": "Search",
    "noData": "No data found"
  },
  "toolbar": {
    "symbolSearch": "Search symbol...",
    "indicators": "Indicators",
    "financials": "Financials",
    "signals": "Signals",
    "chart": "Chart",
    "analysis": "Market Analysis",
    "multichart": "Multi-Chart",
    "backtest": "Backtest",
    "financial": "Financial Analysis",
    "crypto": "Crypto",
    "watchlist": "Watchlist",
    "alarms": "Alarms",
    "logScale": "Log Scale",
    "dataUpdated": "Data updated"
  },
  "stockSummary": {
    "lastPrice": "Last Price",
    "change": "Change",
    "volume": "Volume",
    "avgVolume20": "Avg. Volume (20D)",
    "high52w": "52W High",
    "low52w": "52W Low"
  },
  "legend": {
    "open": "O",
    "high": "H",
    "low": "L",
    "close": "C",
    "volume": "Vol"
  },
  "signals": {
    "panel": "Signal Panel",
    "config": "Configuration",
    "optimizer": "Optimize",
    "mlPanel": "ML Prediction",
    "savedConfigs": "Saved Configs"
  },
  "analysis": {
    "title": "Market Scan",
    "scanning": "Scanning...",
    "lastScan": "Last scan",
    "rescan": "Rescan"
  },
  "alarms": {
    "title": "Alarms",
    "addAlarm": "Add Alarm",
    "priceAbove": "Price above",
    "priceBelow": "Price below",
    "triggered": "Triggered",
    "active": "Active"
  },
  "disclaimer": {
    "text": "This application is for informational purposes only. Not investment advice."
  },
  "errors": {
    "symbolListFailed": "Failed to load symbol list, using defaults",
    "dataFetchFailed": "Failed to load data",
    "connectionError": "Connection error"
  }
}
```

**Step 5: Import i18n in main.tsx**

Add `import './i18n/i18n';` before App import in `src/main.tsx`.

**Step 6: Commit i18n infrastructure**

```bash
git add src/i18n/ src/main.tsx package.json package-lock.json
git commit -m "feat: add i18n infrastructure with TR and EN locales"
```

---

## Task 12: Apply i18n to Components

**Files:**
- Modify: `src/App.tsx` — loading overlay text
- Modify: `src/components/StockSummary/StockSummary.tsx` — all labels
- Modify: `src/components/Legend/Legend.tsx` — A/Y/D/K/Hac labels
- Modify: `src/components/Disclaimer/Disclaimer.tsx` — disclaimer text
- Modify: `src/components/Toolbar/Toolbar.tsx` — button labels
- Modify: `src/components/Toolbar/MobileToolbar.tsx` — button labels
- Modify: `src/components/Alarms/AlarmPanel.tsx` — alarm labels
- Modify: `src/components/Analysis/MarketAnalysis.tsx` — scan labels
- Modify: Other components with hardcoded Turkish text

**Step 1: Add useTranslation to StockSummary**

```tsx
import { useTranslation } from 'react-i18next';
// ...
const { t } = useTranslation();
// Replace "Son Fiyat" → {t('stockSummary.lastPrice')}
// Replace "Degisim" → {t('stockSummary.change')}
// etc.
```

**Step 2: Apply same pattern to all listed components**

Each component gets `const { t } = useTranslation();` and all hardcoded strings replaced with `t('key')`.

**Step 3: Add language toggle to Toolbar**

Add a small TR/EN toggle button to the toolbar.

**Step 4: Build and verify**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add src/components/ src/App.tsx
git commit -m "feat: apply i18n translations to all components"
```

---

## Task 13: Frontend Tests — Utility Functions

**Files:**
- Create: `src/utils/formatters.test.ts`
- Create: `src/utils/computeFinancialMetrics.test.ts`

**Step 1: Write formatters tests**

```ts
import { describe, it, expect } from 'vitest';
import { formatPrice, formatVolume, formatChange } from './formatters';

describe('formatPrice', () => {
  it('formats small prices with 2 decimals', () => {
    expect(formatPrice(42.5)).toBe('42.50');
  });
  it('formats large prices with comma separators', () => {
    expect(formatPrice(12345.67)).toBe('12,345.67');
  });
  it('formats zero', () => {
    expect(formatPrice(0)).toBe('0.00');
  });
});

describe('formatVolume', () => {
  it('formats billions', () => {
    expect(formatVolume(2_500_000_000)).toBe('2.50B');
  });
  it('formats millions', () => {
    expect(formatVolume(1_500_000)).toBe('1.50M');
  });
  it('formats thousands', () => {
    expect(formatVolume(5_000)).toBe('5.0K');
  });
  it('formats small values', () => {
    expect(formatVolume(42)).toBe('42');
  });
});

describe('formatChange', () => {
  it('handles positive change', () => {
    const result = formatChange(110, 100);
    expect(result.positive).toBe(true);
    expect(result.percent).toContain('+');
  });
  it('handles negative change', () => {
    const result = formatChange(90, 100);
    expect(result.positive).toBe(false);
  });
  it('handles zero previous (division by zero)', () => {
    const result = formatChange(10, 0);
    expect(result.percent).toBe('+0.00%');
  });
  it('handles equal values', () => {
    const result = formatChange(100, 100);
    expect(result.positive).toBe(true);
    expect(result.percent).toBe('+0.00%');
  });
});
```

**Step 2: Run tests**

Run: `npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/utils/formatters.test.ts
git commit -m "test: add formatters utility tests"
```

---

## Task 14: Frontend Tests — Component Tests

**Files:**
- Create: `src/components/Legend/Legend.test.tsx`
- Create: `src/components/StockSummary/StockSummary.test.tsx`
- Modify: `package.json` (add @testing-library/react dev dep)

**Step 1: Install testing library**

Run: `npm install -D @testing-library/react @testing-library/jest-dom jsdom`

**Step 2: Add vitest config to vite.config.ts**

Add test configuration:
```ts
export default defineConfig({
  // ... existing config
  test: {
    environment: 'jsdom',
    setupFiles: [],
  },
});
```

**Step 3: Write Legend component test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Legend from './Legend';

describe('Legend', () => {
  it('renders symbol name', () => {
    render(<Legend data={null} symbol="THYAO" lastClose={100} prevClose={95} />);
    expect(screen.getByText('THYAO')).toBeTruthy();
  });

  it('shows positive change in green', () => {
    render(<Legend data={null} symbol="TEST" lastClose={110} prevClose={100} />);
    const changeEl = document.querySelector('.positive');
    expect(changeEl).toBeTruthy();
  });

  it('shows negative change in red', () => {
    render(<Legend data={null} symbol="TEST" lastClose={90} prevClose={100} />);
    const changeEl = document.querySelector('.negative');
    expect(changeEl).toBeTruthy();
  });
});
```

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/components/Legend/Legend.test.tsx src/components/StockSummary/StockSummary.test.tsx vite.config.ts package.json
git commit -m "test: add component tests for Legend and StockSummary"
```

---

## Task 15: Backend Tests

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_symbols.py`
- Create: `backend/tests/test_history.py`
- Create: `backend/tests/test_financials.py`
- Create: `backend/tests/test_validation.py`
- Modify: `backend/requirements.txt` (add pytest, httpx)

**Step 1: Add test dependencies**

Append to `requirements.txt`:
```
pytest
httpx
```

**Step 2: Create tests directory**

Run: `mkdir -p backend/tests && touch backend/tests/__init__.py`

**Step 3: Write symbol endpoint test**

`backend/tests/test_symbols.py`:
```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_get_symbols():
    response = client.get("/api/symbols")
    assert response.status_code == 200
    data = response.json()
    assert "stocks" in data
    assert "indices" in data
    assert len(data["stocks"]) > 0

def test_search_symbol():
    response = client.get("/api/search", params={"q": "THY"})
    assert response.status_code == 200
    data = response.json()
    assert "results" in data

def test_search_requires_query():
    response = client.get("/api/search")
    assert response.status_code == 422
```

**Step 4: Write validation tests**

`backend/tests/test_validation.py`:
```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_path_traversal_blocked():
    response = client.get("/api/history/../../../etc/passwd")
    assert response.status_code in (404, 422)

def test_invalid_symbol_chars():
    response = client.get("/api/financials/../../secret")
    assert response.status_code in (404, 422)

def test_ml_train_requires_min_bars():
    response = client.post("/api/ml/train", json={
        "ohlcv": [{"date": "2024-01-01", "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 100}] * 50
    })
    assert response.status_code == 422
```

**Step 5: Run backend tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All pass

**Step 6: Commit**

```bash
git add backend/tests/ backend/requirements.txt
git commit -m "test: add backend API tests with pytest"
```

---

## Execution Order (Parallelizable Groups)

**Group A** (Frontend — independent): Tasks 3, 4, 5
**Group B** (Backend — sequential): Tasks 6 → 7 → 8 → 9 → 10
**Group C** (DX — independent): Tasks 1, 2
**Group D** (i18n — after Group A): Tasks 11 → 12
**Group E** (Testing — after all others): Tasks 13, 14, 15

**Dependency graph:**
```
Task 1 (ESLint)    ─────────────────────────────┐
Task 2 (dist/)     ─────────────────────────────┤
Task 3 (CSS theme) ─────────────────────────────┤
Task 4 (Lazy load) ─────────────────────────────┤
Task 5 (Hook)      ─────────────────────────────┤
Task 6 (Config)    → Task 7 (Logging) → Task 8  ├→ Task 13 (FE tests)
                     (Router split) → Task 9     ├→ Task 14 (Component tests)
                     (Error handling) → Task 10  ├→ Task 15 (BE tests)
Task 11 (i18n setup) → Task 12 (i18n apply)     ┘
```

Tasks 1-5, 6, 11 can all start simultaneously. Backend tasks 7-10 are sequential. i18n application (12) depends on i18n setup (11). Testing (13-15) should run last to catch regressions.

# Chart performance profiling

## Built-in pan probe (this repo)

1. Open the app with `?chartProfile=1`, or run in the console:
   ```js
   localStorage.setItem('temist_chart_profile', '1');
   location.reload();
   ```
2. Pan the chart with the pointer tool.
3. Watch the browser console for lines like:
   `[temist chart] pan (interval): ~12 setOption/s, avg setOption 18.42ms`

Disable with `localStorage.removeItem('temist_chart_profile')` and reload.

## Chrome DevTools (recommended for “what is slow?”)

1. **Performance** tab → Record → pan for 3–5 seconds → Stop.
2. Look for long **Scripting** blocks and **`setOption`** / **ECharts** in the flame chart.
3. **Rendering** / **Paint** spikes mean too many series or grids redraw per frame.

## React

- **React DevTools → Profiler**: records component re-renders. Pan should **not** re-render `ChartContainer` every frame; if it does, a parent is updating state on zoom.

## What usually causes pan lag here

| Cost | Why |
|------|-----|
| Many `series` on screen | Each pan frame redraws every visible series (EMA, Pearson, sub-panels). |
| Updating **slider** `dataZoom` every frame | Extra layout + handle paint. |
| **`dataZoom` event** → autoscale / saves | Feedback loops without `silent: true`. |
| Full **`buildOption`** during drag | Should only run on data/indicator changes, not pan. |

**Pan lite mode** (indicator load ≥ 4) hides overlays and sub-panels during drag, then restores on release.

# Graph Explorer — next steps (written 2026-10-06; updated 2026-10-07)

> **2026-10-07:** items 1–3 below are DONE. The main line of work is now the A–Z workflow: see `graph-explorer-a-z.md` (status by area, Priority 1 = groups, Priority 2 = profiles/credentials) and the generated `phis-api-inventory.md`.

State: experiment page tabs, factor boxes and picks, chart grid with detail dialog, back/forward — built on branch
`graph-explorer/project` (last code commit `2625f2e`, 253 tests). Not merged to `main`, not deployed (live site still
runs the 2026-10-02 build). Deploy = `az acr build -r phisacr -t graph-explorer:latest graph-explorer` +
`kubectl rollout restart deploy/graph-explorer -n graph-explorer` (needs `az login`; confirm first).

## Requested by the user, not built yet
1. **Factors themselves selectable on the Overview.** Today only a factor's levels are chips; the factor name is plain text
   (with a "Pick plants ›" button). Make the factor name a selectable chip too: plain click opens the factor page, ctrl/shift
   pick it (a picked factor = a whole row of charts in the grid, as on the Plants tab).
2. **The grid window should adapt to the number of charts.** Today the dialog keeps its full width and a single chart still gets a
   grid slot the size it would have among many. Size the dialog and the charts to the content (one chart: a larger single chart;
   few charts: fewer, wider columns; many: the current grid), keep S/M/L as the preference on top.
3. **Overlay should not force means.** Overlay should simply lay the charts on top of each other as they are: each chart's
   own contents (its plant lines, mean, and the band when statistics is on) in one plot, coloured per chart, with the legend
   to hide/show a chart. (Today overlay draws only one mean line per chart.)

## Suggestions offered, not built
- Normalise option ("% of first scan"); CSV export of what the grid shows and PNG of the grid; highlight outlier plants
  (beyond ~2 SD of their group) in the detail dialog; per-chart y toggle (double-click a chart for its own scale).
- Overview "quick looks" (miniature grids) and the open tab as part of back/forward history.

## Other open items
- Portal-wide audit: `docs/superpowers/portal-audit-todo.md` (ragged chip lists, shift/drag gestures only on the experiment
  page, deferred minors including the chart-grid ones in its section 4).
- Open questions from earlier: variable naming / Unitless / reuse of PHIS characteristics before any PROD import; rename
  the long PBar1x4 provenance; Guest account `admin=true` on phis-test (likely prod too).
- Working notes: Bash heredocs and sed mangle backslashes, so write regexes/templates with the Write/Edit tools; tests read
  `public/index.html` live, so never edit it while the suite runs.

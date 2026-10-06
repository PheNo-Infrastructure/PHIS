# Experiment chart grid — design

Status: draft for review (2026-10-06). Part of Graph Explorer stage 2 (measurements), after step 4.
Brainstormed with the user; mockups were in the visual companion (not kept).

## Goal

From an experiment's page, see how factors affect variables: pick variables and groups of plants
(a plant, a factor level, a whole factor, or any mix), and a grid of charts opens; click a chart for
the full picture. Exploratory and descriptive (mean, SD, values) — no significance testing.

## What the user asked for (in their words, condensed)

- The experiment page stays the entry point; variables are added to it as selectable items.
- Plants are no longer an alphabetical list: they sit in a box per factor, with a box per level,
  plants inside. A plant appears under **every** factor it belongs to (duplicates are intended).
- Plain click opens the resource; ctrl/shift/drag select (same rules as everywhere).
- Picking a factor gives a row of charts (one per level); a level gives one chart; plants picked
  inside one level overlay on that level's chart; plants from different levels get different charts.
- A single plant is selectable and viewable on its own.
- No forced "factor X vs factor Y" grid: the grid is just the selection, arranged by origin.
- Statistics toggle: mean ± SD per chart, the individual plant lines fade.
- The feature must be made known to the user (discoverable).

## Facts that shaped it

- PBar1x4: GroupID has 10 levels (10 plants each), Replicate has 5 (20 plants each), and they are
  **nested** (each GroupID lies inside one Replicate). Other experiments may be crossed. Because plants
  are listed under every factor, the layout does not need to know which.
- `GET /core/scientific_objects?experiment=&factor_levels=<level>` lists a level's plants (already used by
  the factor-level page), so membership costs one query per level.
- `/core/data/search` takes the targets in the body (see the stage 2 probe facts) and one variable's
  values for a whole experiment fit one query (~100 plants x ~10 scans per variable on PBar1x4).

## Design

### 1. Experiment page
- **Variables** group: the variables with values in this experiment, each chip with its value count
  (this is also the "Measured in" reverse view planned for the variable page). Selectable chips.
- **Scientific objects** group becomes **boxes per factor**: factor box (header selectable = whole factor)
  > level boxes (header selectable = the level) > plant chips (selectable). Trays and any object with no
  factor level: a "Not in a factor" box. A plant lacking a level in a factor: an "(unset)" box in that factor.
- Boxes with many plants collapse to a header and count, expand on click.
- Plain click on a plant, level or factor opens its page (chip rule). Ctrl toggles, shift ranges (reading
  order within one factor's boxes), drag sweeps (plants within one factor's boxes only).

### 2. Selection
- Normal case: unchanged. A plant is one pick keyed by its id. Each pick made in a box also records `via`
  (the level box it was clicked in); nothing else reads it.
- **Same plant picked again from another box** (ctrl-click a second copy of a selected plant): the selection
  enters **graph-only mode**. Picks are then keyed plant + box. Ctrl-clicking the same copy still deselects.
- In graph-only mode the action bar offers only **Show chart grid**, with the reason and the way out
  ("PB007 is picked twice (GroupID 1, Replicate 1), so only charts are available. Remove one pick for the
  usual actions."). Removing the duplicate returns to normal mode.
- The selection bar counts picks and distinct plants ("3 picks · 2 plants") in that mode.
- Other copies of a selected plant show a lighter "also picked elsewhere" ring.
- Link / set germplasm / etc. never see a duplicated plant (blocked in graph-only mode).

### 3. Chart grid
- Opens from the action bar (**Show chart grid**) when the selection holds a variable and at least one
  plant, level or factor. A "Variable" switch sits above the grid.
- Arrangement by origin: a picked factor = a row, one chart per level; a picked level = one chart (a level
  already inside a picked factor is not charted twice); plants picked inside a level overlay in that level's
  chart; a plant picked outside any box = its own chart in a "Plants" row; one plant in two boxes = one chart
  per box's level.
- Chart: the plants as thin lines, the group mean thick, shared y-axis across the grid (toggle). Hover = time
  and value. Colours: one per level, validated for dark mode, at most ~8 levels per chart (clear message above).
- **Statistics** toggle: per-scan mean ± 1 SD band per chart; plant lines fade. Missing values are skipped per
  scan; one value only -> SD blank, not zero.
- **Mixed selections** — the grid is a set of views of the selection, nothing is merged or deduplicated:
  a level/factor plus a standalone plant gives the level/factor charts plus a "Plants" row with the plant's own
  chart; if that plant also belongs to a picked level it appears in both, drawn bolder among the level's lines;
  a plant ctrl-clicked inside a picked level adds no chart (already in it), it is only emphasised; plants picked
  inside a level that is not picked overlay in that level's chart. Factor rows come first (experiment factor
  order), then the Plants row. Single plants have no mean/SD, so the statistics band only appears on level and
  factor charts. Graph-only mode is triggered only by explicitly picking the same plant twice, not by a plant
  merely being inside a picked level.
- **The variable is independent of the selection:** the selection decides who is charted, the variable what is
  plotted; paging changes only the variable, so only that variable's values are fetched.
- **Click a chart** -> dialog like the plant page's, for the group: larger chart, a mean/SD/n table per scan,
  the plants in it (click highlights, ctrl hides), links to the plant, level or factor page.
- Several variables selected: one grid per variable, paged — a pager above the grid (‹ Plant Height Max · 2 of 4 ›, plus the variable names as tabs) goes to the grid of that variable. The group selection is shared; only the variable changes. A plant with no values for the shown variable gets an empty chart saying so (a plant is tied to a variable only through its values).

### 4. Making it known
- The experiment page gets a short "How charts work" note (collapsible, like "How scientific objects work")
  and a one-line hint above the variables and boxes.
- A **Chart overview** button on the experiment page opens the grid with defaults (first variable, first factor,
  all its levels), so the feature shows something with no selection knowledge.
- Never a dead end: with plants but no variable the action bar says "Pick a variable to chart" and highlights the
  variables; with a variable but nothing to chart it says "Pick plants, levels or a factor".

### 5. Data and code
- New read-only route `GET /api/experiment-overview?experiment=&variable=` returning, per plant, its name, its
  level ids per factor and its series, plus the factors with their levels. Mean and SD are computed in the page
  (instant toggling; custom groups need no new server logic).
- Statistics maths in one small pure function with unit tests.
- Grid and dialog reuse the plant page's chart code (`chartHtml`, `wireChart`, the dialog).

## Out of scope (first version)
- Significance tests, regression, exporting data or images.
- A factor-A x factor-B matrix view for crossed designs (possible later toggle).
- Editing anything: this feature is read-only.

## Testing
1. Selection: existing actions unchanged in normal mode; graph-only mode entered/left correctly; counts; actions blocked.
2. Backend: route against a mocked PHIS; live read-only check on PBar1x4 (phis-test).
3. Statistics function unit tests (missing values, one value, SD).
4. e2e: boxes, selection rules, grid arrangement, dialog, discoverability states; screenshots in light and dark.

## Build order
1. Selection key (`via`, graph-only mode) with tests for the existing actions.
2. Experiment page: variables group and factor boxes with duplicated plants, selection rules, "also picked" ring.
3. The overview route.
4. Grid and the click-for-detail dialog; then statistics; then discoverability pieces.

## Decided with the user (2026-10-06)
- Several variables: one grid per variable, paged (see 3).
- A standalone plant gets its own chart per variable; plants are tied to variables only through their values.
- Colours: left to the implementer — categorical palette from the dataviz skill, one colour per level, checked in light and dark, ~8 levels per chart.

## Open
- None blocking. Revisit stacked grids or variables as a grid dimension only if paging proves awkward.

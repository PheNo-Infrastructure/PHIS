# Graph Explorer — portal-wide audit (to do, not scheduled)

Collected 2026-10-06 while building the experiment page. These problems were fixed on the experiment page only;
the same patterns exist in many other places. Audit the whole portal in one pass (own spec, then a plan), not page by page.

## 1. Lists of connected items look ragged and do not scale
- Relation groups render as pills (`chipHtml`, `relGroupHtml`) whose width follows each name, so rows are ragged.
  The experiment page now uses fixed-size grids instead: 56px plant tiles (`.hx-plants`), 172px level cells
  (`.ov-levels`), equal-width variable rows in 1-2 columns (`.var-grid`).
- Long groups (an organization's facilities, a site's objects, a species' accessions, a variable's experiments...)
  become walls of pills. Experiments got tabs, a filter and group-by. A general rule is still open: when a page has
  more than one connected group and the total is long (about 20 items), offer tabs / filter / "show all" automatically.
- Decide one grid rule for all chip lists (cell width by content class: short code, name, long name) and one
  overflow rule (ellipsis plus a hover `title` with the full name).

## 2. Selection gestures differ between places
- In the detail pane, relation chips only support plain click (open) and ctrl-click (toggle). Shift-click (range) and
  drag (sweep) do nothing there. They now work on the experiment page for level chips, variable chips and plant tiles
  (`hxPick`, `hxSweep`, `chipAnchor`) but nowhere else.
- Goal: one gesture set everywhere a list of selectable things appears (plain opens, ctrl toggles, shift ranges within
  one list, drag sweeps), ideally one shared implementation instead of per-list code.

## 3. Smaller items deferred from the reviews
- Keyboard access: `.hx` tiles, level/factor headers and grid chips cannot be reached or picked with the keyboard.
- A pick re-renders the whole detail pane, so a filter input loses focus mid-typing (text is kept).
- The filter handler reads `NODE_DETAIL[id].structure` without a guard while the node is being refetched.
- An empty Plants tab with no filter says `No plant matches ""` instead of "None.".
- Back/forward (`navigateTo` / `popstate`) restores the page but not the tab that was open at that history entry.
- A list pick plus a box pick of the same plant gives order-dependent results (list ctrl-click on a box-picked plant
  deselects it; list marquee/shift overwrite `vias`).
- `viaLabel` only resolves levels of the open experiment page; after navigating, the graph-only bar shows raw uris.
- An experiment with no factors and no objects shows an empty "Scientific objects" heading; "1 plants" plural.
- A plain click on a box item always navigates globally, even when the page was opened locally from the tree.
- Overview cards say "scientific objects · N in a factor"; the spec asked for plants/trays and a scan-range card.
- Names from PHIS are escaped in all new code; older innerHTML spots are listed in the unified-design spec's Known gaps.

## 4. Chart grid — deferred minors (2026-10-06 review)
- With shared y-axis and statistics both on, the mean ± SD band can spill outside the plot (the y range ignores it).
- Non-numeric values arrive as NaN/null and can show as blank charts or zeros (the plant page has the same issue).
- The graph-only bar promises charts even when the shown page is not the experiment (no button then).
- Picked levels / factors of another experiment are ignored silently (only plants are reported as outside).
- The hover tip disappears beside a visible line when the nearest scan has no value for that chart.
- A remembered builder pick that no longer exists throws on Show chart grid.
- `sameId()` matches uris by their last path segment; compare compacted uris server-side instead (not verified on live prefixes).
- The overview data (`OVERVIEW`) and measurements caches are never refreshed after an import (session lifetime).

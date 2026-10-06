# Chart grid — Implementation Plan (plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From an experiment's page, pick variables and plants / levels / factors (or use the Overview's chart builder), press **Show chart grid**, and see a grid of charts (one per picked group, one row per factor, a "Plants" row for single plants), paged per variable, with an optional mean ± SD band; click a chart for its full numbers.

**Architecture:** A read-only route returns one variable's values for every plant of an experiment (the plant page's `columns` + per-plant `values` shape, so scans line up). Pure maths and the selection-to-charts arrangement live in `src/chart-math.js`, an ES module that is also inlined into the page (the same pattern as `adjacency.js` / `creation.js`), so Node unit tests exercise exactly what the browser runs. The page adds a full-screen grid overlay (`<dialog>`) with SVG charts and a detail dialog.

**Tech Stack:** Node 22 with `--experimental-strip-types`, `node:test`, Playwright; plain `<script>` page, no build.

**Spec:** `docs/superpowers/specs/2026-10-06-experiment-chart-grid-design.md` (sections 3, 4, 5 and the Overview chart builder in section 1). Plans 1 and 2 (structure, picks, tabs) are built. Left for later: quick looks on the Overview, tab state in history, the portal-wide audit (`docs/superpowers/portal-audit-todo.md`).

## Global Constraints

- No new dependencies, no build step. Read-only: nothing here writes to PHIS. Relative fetches only; names from PHIS go through `escapeHtml`.
- `src/chart-math.js` may only contain top-level `export function` / `export const` declarations and no imports (the server inlines it into the page after stripping `export `).
- Selection rules from plans 1-2 are unchanged (plain opens, ctrl/shift/drag pick, `vias`, graph-only). The grid reads the selection; it never changes it, except the Overview builder, which sets it explicitly.
- Statistics: mean and **sample** SD (n-1) per scan over the plants that have a value then; n=1 gives SD `null` (no band, shown as "–"), never 0.
- Colours: CSS tokens `--c1 … --c8` on `:root`, redefined for dark mode; a chart uses one colour (cycling after 8). Single plants use the ink colour.
- Tests: `npm test` from `graph-explorer/` (226 at the start). Single test: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="<name>" test/<file>.test.ts`. Do not edit `public/index.html` while a suite runs (tests read it live). Use the Write/Edit tools for anything containing backslashes (Bash heredocs and sed mangle them).
- Commit each task on `graph-explorer/project`, push, end messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A variable with no values for the experiment, or a picked plant with no values for the variable: an empty chart that says "no values", not a crash or a blank hole; paging keeps the layout.
- One scan only (single column), one plant in a group (SD null), all values equal (flat line, y range zero): no NaN in SVG paths, no divide by zero.
- Selection holding a variable but nothing chartable, or plants from another experiment: the action bar says what to pick next; plants not in this experiment are reported, not silently dropped.
- A plant picked in two boxes (graph-only): one chart per box; the grid button is the only action offered.
- A plant picked standalone AND inside a picked level: bold line in the level chart plus its own chart.
- More than ~20 charts (a whole factor with 10 levels plus another factor): the grid scrolls, stays readable, and fetches only the current variable.
- The route with a `variable` PHIS does not know, or a PHIS failure: the overlay shows the error with a retry, never a stuck spinner.

## File structure

| File | Responsibility |
|---|---|
| `src/chart-math.js` (new) | `meanSd`, `groupColumns`, `yRange`, `arrangeCharts` — pure, unit-tested |
| `src/routes/experiment-overview.ts` (new) | `GET /api/experiment-overview` |
| `src/routes/measurements.ts` | `buildColumns` extracted so both routes share it |
| `src/routes/static.ts`, `src/index.ts` | inline `chart-math.js`, register the route |
| `public/index.html` | tokens, overlay, SVG charts, pager, detail dialog, action-bar button, Overview builder, note |
| `test/chart-math.test.ts` (new), `test/backend.test.ts`, `test/e2e.test.ts` | tests |

---

### Task 1: Chart maths and arrangement (pure)

**Files:**
- Create: `src/chart-math.js`
- Test: `test/chart-math.test.ts`

**Interfaces:**
- Produces (all pure):
  - `meanSd(values: (number|null)[]): {mean:number, sd:number|null, n:number} | null` — null when no numbers.
  - `groupColumns(plants: {values: ({v:number}|null)[]}[], nCols: number): ({mean:number, sd:number|null, n:number} | null)[]` — per scan column.
  - `yRange(seriesLists: (number|null)[][], band?: boolean): {lo:number, hi:number}` — over all given numbers; if `lo===hi` widens by 1 so a flat line has height.
  - `arrangeCharts(picks, st): {variables:{id,label}[], rows:{label:string, kind:"factor"|"plants", charts:Chart[]}[], outside:string[]}` with
    `Chart = {key:string, title:string, sub:string, kind:"level"|"picked"|"plant", plantIds:string[], emphasis:string[], colorIndex:number}`.
    `picks` = `[...selection.values()]` (items `{id,type,label,vias?}`); `st` = the plan-1 structure (`factors[].levels[].plants`, `unset`, `other`).

- [ ] **Step 1: Write the failing tests** — `test/chart-math.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { meanSd, groupColumns, yRange, arrangeCharts } from "../src/chart-math.js";

test("meanSd: mean and sample SD over the numbers present; one value has SD null; nothing gives null", () => {
  assert.deepEqual(meanSd([2, 4, 6]), { mean: 4, sd: 2, n: 3 });
  assert.deepEqual(meanSd([5, null, undefined as any]), { mean: 5, sd: null, n: 1 });
  assert.equal(meanSd([null, null]), null);
  assert.equal(meanSd([]), null);
});

test("groupColumns: per scan column over the plants that have a value then", () => {
  const plants = [{ values: [{ v: 1 }, { v: 3 }, null] }, { values: [{ v: 3 }, null, null] }];
  assert.deepEqual(groupColumns(plants, 3), [{ mean: 2, sd: Math.SQRT2, n: 2 }, { mean: 3, sd: null, n: 1 }, null]);
});

test("yRange: spans every number; a flat line still gets height", () => {
  assert.deepEqual(yRange([[1, 5], [3, null]]), { lo: 1, hi: 5 });
  assert.deepEqual(yRange([[7, 7]]), { lo: 6.5, hi: 7.5 });
  assert.deepEqual(yRange([[]]), { lo: 0, hi: 1 });
});

const P = (n: number) => ({ id: `p${n}`, label: `PB${n}` });
const ST = {
  truncated: false, variables: [],
  factors: [
    { id: "fg", label: "GroupID", unset: [], levels: [
      { id: "g1", type: "factor_level", label: "GroupID: 1", factor: "fg", plants: [P(1), P(2)] },
      { id: "g2", type: "factor_level", label: "GroupID: 2", factor: "fg", plants: [P(3)] } ] },
    { id: "fr", label: "Replicate", unset: [], levels: [
      { id: "r1", type: "factor_level", label: "Replicate: 1", factor: "fr", plants: [P(1), P(2), P(3)] } ] },
  ],
  other: [{ id: "t1", label: "Tray 31" }],
};
const v = (id: string) => ({ id, type: "variable", label: id });
const lvl = (id: string, factor: string, label: string) => ({ id, type: "factor_level", label, factor });
const plant = (n: number, vias?: string[]) => ({ id: `p${n}`, type: "scientific_object", label: `PB${n}`, ...(vias ? { vias } : {}) });

test("arrangeCharts: variables are listed in pick order; nothing chartable gives no rows", () => {
  const r = arrangeCharts([v("v2"), v("v1")], ST);
  assert.deepEqual(r.variables.map((x) => x.id), ["v2", "v1"]);
  assert.deepEqual(r.rows, []);
});

test("arrangeCharts: a picked factor is a row with a chart per level; its levels are not charted twice", () => {
  const r = arrangeCharts([{ id: "fg", type: "factor", label: "GroupID" }, lvl("g1", "fg", "GroupID: 1"), lvl("r1", "fr", "Replicate: 1")], ST);
  assert.deepEqual(r.rows.map((x) => [x.label, x.charts.map((c) => c.key)]), [["GroupID", ["g1", "g2"]], ["Replicate", ["r1"]]]);
  assert.deepEqual(r.rows[0].charts.map((c) => c.plantIds), [["p1", "p2"], ["p3"]]);
  assert.deepEqual(r.rows[0].charts.map((c) => c.colorIndex), [0, 1]);
});

test("arrangeCharts: plants picked inside an unpicked level overlay in that level's chart; inside a picked level they only get emphasis", () => {
  const r = arrangeCharts([plant(1, ["g1"]), plant(2, ["g1"]), plant(3, ["g2"]), lvl("g2", "fg", "GroupID: 2")], ST);
  const g = r.rows.find((x) => x.label === "GroupID")!;
  const g1 = g.charts.find((c) => c.key === "g1:picked")!;
  assert.deepEqual([g1.kind, g1.plantIds], ["picked", ["p1", "p2"]]);
  const g2 = g.charts.find((c) => c.key === "g2")!;
  assert.deepEqual([g2.kind, g2.plantIds, g2.emphasis], ["level", ["p3"], ["p3"]]);
});

test("arrangeCharts: standalone plants (list, A-Z, trays, unset) get their own chart in a Plants row, after the factor rows; a plant also inside a picked level appears in both", () => {
  const r = arrangeCharts([lvl("g1", "fg", "GroupID: 1"), plant(1, [""]), plant(2, ["#all"]), { id: "t1", type: "scientific_object", label: "Tray 31", vias: ["#other"] }], ST);
  assert.deepEqual(r.rows.map((x) => x.label), ["GroupID", "Plants"]);
  assert.deepEqual(r.rows[1].charts.map((c) => [c.kind, c.plantIds]), [["plant", ["p1"]], ["plant", ["p2"]], ["plant", ["t1"]]]);
  assert.deepEqual(r.rows[0].charts[0].emphasis, ["p1", "p2"], "bold inside the level they also belong to");
});

test("arrangeCharts: the same plant picked in two boxes (graph-only) is charted once per box", () => {
  const r = arrangeCharts([plant(1, ["g1", "r1"])], ST);
  assert.deepEqual(r.rows.map((x) => [x.label, x.charts.map((c) => c.plantIds)]), [["GroupID", [["p1"]]], ["Replicate", [["p1"]]]]);
});

test("arrangeCharts: a pick with no vias is standalone; plants unknown to this experiment are reported", () => {
  const r = arrangeCharts([{ id: "zz", type: "scientific_object", label: "ZZ plant" }, plant(1)], ST);
  assert.deepEqual(r.rows[0].charts.map((c) => c.plantIds), [["p1"]], "p1 is in the experiment");
  assert.deepEqual(r.outside, ["ZZ plant"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test test/chart-math.test.ts`
Expected: FAIL (cannot find `../src/chart-math.js`).

- [ ] **Step 3: Write `src/chart-math.js`**

```js
// Maths and layout for the experiment chart grid. Pure (no DOM, no imports): Node tests import it as an ES
// module, and the server inlines it into the page after stripping `export ` (see static.ts).

export function meanSd(values) {
  const xs = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : null;
  return { mean, sd, n: xs.length };
}

// Per scan column: the mean and SD over the plants that have a value in that column.
export function groupColumns(plants, nCols) {
  return Array.from({ length: nCols }, (_, i) => meanSd(plants.map((p) => p.values[i]?.v ?? null)));
}

// The y span of every number in the lists; a flat line (or nothing) still gets some height.
export function yRange(seriesLists) {
  const xs = seriesLists.flat().filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return { lo: 0, hi: 1 };
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return lo === hi ? { lo: lo - 0.5, hi: hi + 0.5 } : { lo, hi };
}

const STANDALONE_VIAS = new Set(["", "#all", "#other"]); // not a factor box: a plant picked here is charted on its own

// What to chart for a selection in one experiment. `picks` = the selection's items, `st` = the experiment's structure.
export function arrangeCharts(picks, st) {
  const variables = picks.filter((p) => p.type === "variable").map((p) => ({ id: p.id, label: p.label }));
  const levelOf = new Map(), factorOfLevel = new Map();
  st.factors.forEach((f) => f.levels.forEach((l) => { levelOf.set(l.id, l); factorOfLevel.set(l.id, f); }));
  const known = new Set([...st.factors.flatMap((f) => f.levels.flatMap((l) => l.plants.map((p) => p.id))), ...st.factors.flatMap((f) => f.unset.map((p) => p.id)), ...st.other.map((p) => p.id)]);

  const pickedFactors = new Set(picks.filter((p) => p.type === "factor").map((p) => p.id));
  const pickedLevels = new Set(picks.filter((p) => p.type === "factor_level" && levelOf.has(p.id)).map((p) => p.id));
  const covered = (levelId) => pickedLevels.has(levelId) || pickedFactors.has(factorOfLevel.get(levelId)?.id);
  const plants = picks.filter((p) => p.type === "scientific_object");
  const outside = [];
  const instances = []; // {id, label, via} — one per pick instance
  plants.forEach((p) => {
    if (!known.has(p.id)) { outside.push(p.label); return; }
    (p.vias ?? [""]).forEach((via) => instances.push({ id: p.id, label: p.label, via }));
  });

  const rows = [];
  st.factors.forEach((f) => {
    const charts = [];
    f.levels.forEach((l, i) => {
      const alsoPicked = instances.filter((x) => x.via === l.id).map((x) => x.id);
      const standaloneInside = instances.filter((x) => STANDALONE_VIAS.has(x.via) && l.plants.some((q) => q.id === x.id)).map((x) => x.id);
      if (covered(l.id)) {
        charts.push({ key: l.id, title: l.label, sub: `${l.plants.length} plants`, kind: "level", plantIds: l.plants.map((q) => q.id), emphasis: [...new Set([...alsoPicked, ...standaloneInside])], colorIndex: i });
      } else if (alsoPicked.length) {
        charts.push({ key: `${l.id}:picked`, title: l.label, sub: `${alsoPicked.length} picked`, kind: "picked", plantIds: alsoPicked, emphasis: [], colorIndex: i });
      }
    });
    if (charts.length) rows.push({ label: f.label, kind: "factor", charts });
  });

  const alone = [];
  // A pick is standalone when it was made outside a factor box: from a list ("") or the A-Z view or trays, or in an "(unset)" box.
  instances.filter((x) => STANDALONE_VIAS.has(x.via) || x.via.endsWith("#unset")).forEach((x) => {
    if (!alone.some((a) => a.id === x.id)) alone.push(x);
  });
  if (alone.length) rows.push({ label: "Plants", kind: "plants", charts: alone.map((x) => ({ key: `plant:${x.id}`, title: x.label, sub: "single plant", kind: "plant", plantIds: [x.id], emphasis: [], colorIndex: 0 })) });
  return { variables, rows, outside };
}
```

- [ ] **Step 4: Run to verify it passes**: the Step 2 command. Expected: all 7 tests PASS. Then `npm test` (all green).
- [ ] **Step 5: Commit**

```bash
git add graph-explorer/src/chart-math.js graph-explorer/test/chart-math.test.ts
git commit -m "feat(graph-explorer): chart maths and the selection-to-charts arrangement (pure, unit-tested)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: The overview data route and inlining chart-math into the page

**Files:**
- Create: `src/routes/experiment-overview.ts`
- Modify: `src/routes/measurements.ts` (extract `buildColumns`), `src/index.ts` (register the route), `src/routes/static.ts` (inline `chart-math.js`)
- Test: `test/backend.test.ts` (append)

**Interfaces:**
- Consumes: `authedPost`, `authedGetOne`, `compactUri`, `respondOpenSilexErrors` (as `measurements.ts` does).
- Produces: `buildColumns(rows: {date:string, variable:string, value:unknown}[]): {columns:{key:string,times:string[]}[], key:(r)=>string, keys:string[]}` exported from `measurements.ts`; `experimentOverview(experiment: string, variable: string)`; the route `GET /api/experiment-overview?experiment=&variable=` answering
  `{variable:{id,name,unit}, columns:[{key,times}], plants:[{id, values:[{v,at}|null]}]}` (plant `id` = the target uri exactly as PHIS returns it; the page matches by compacted id). The page can call `measurementPoints(data, plant)` from plan 0 on each plant since the shape matches (`plant.values`).

- [ ] **Step 1: Write the failing test** — append to `test/backend.test.ts`:

```ts
test("GET /api/experiment-overview: one variable's values for every plant of an experiment, scans aligned; bad requests are refused", async () => {
  await withServer(async (base) => {
    let searchUrl = "", searchBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: {} });
      if (url.includes("/core/data/search")) {
        searchUrl = url; searchBody = JSON.parse(String(init?.body));
        return jsonResponse(200, { result: [
          { date: "2025-10-22T12:54:51.000+0200", target: "so-p1", variable: "var-1", value: 10 },
          { date: "2025-10-22T13:10:00.000+0200", target: "so-p2", variable: "var-1", value: 20 },
          { date: "2025-10-23T08:00:00.000+0200", target: "so-p1", variable: "var-1", value: 12 },
        ] });
      }
      if (url.includes("/core/variables/by_uris")) return jsonResponse(200, { result: [{ uri: "var-1", name: "Height", unit: { uri: "unit-mm", name: "millimeter" } }] });
      if (url.includes("/core/units/unit-mm")) return jsonResponse(200, { result: { symbol: "mm" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/experiment-overview?experiment=exp-1&variable=var-1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(searchUrl, /experiments=exp-1/);
    assert.match(searchUrl, /variables=var-1/);
    assert.deepEqual(searchBody, [], "no target filter: every plant of the experiment");
    assert.deepEqual(body.variable, { id: "var-1", name: "Height", unit: "mm" });
    assert.deepEqual(body.columns, [{ key: "2025-10-22", times: ["12:54", "13:10"] }, { key: "2025-10-23", times: ["08:00"] }]);
    assert.deepEqual(body.plants, [
      { id: "so-p1", values: [{ v: 10, at: "12:54" }, { v: 12, at: "08:00" }] },
      { id: "so-p2", values: [{ v: 20, at: "13:10" }, null] },
    ]);

    const bad = await realFetch(`${base}/api/experiment-overview?experiment=exp-1`);
    assert.equal(bad.status, 400);
  });
});

test("GET /api/experiment-overview: an experiment with no values for the variable answers with empty lists", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/search")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/variables/by_uris")) return jsonResponse(200, { result: [{ uri: "var-9", name: "Empty" }] });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const body = await (await realFetch(`${base}/api/experiment-overview?experiment=exp-1&variable=var-9`)).json();
    assert.deepEqual(body.columns, []);
    assert.deepEqual(body.plants, []);
    assert.equal(body.variable.name, "Empty");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="experiment-overview" test/backend.test.ts`
Expected: FAIL (404 / route not found).

- [ ] **Step 3: Extract `buildColumns`.** In `src/routes/measurements.ts` replace the lines that compute `day`, `minute`, `perDay`, `key`, `keys`, `columns` (inside `measurementsOf`) with a call to a new exported function placed above it:

```ts
// Scans as columns: one per day, or per day and minute when a day holds several values of one variable.
export function buildColumns(rows: Row[]) {
  const day = (r: Row) => r.date.slice(0, 10);
  const minute = (r: Row) => r.date.slice(0, 16);
  const perDay = new Set(rows.map((r) => `${r.variable}|${r.target ?? ""}|${day(r)}`)).size === rows.length;
  const key = perDay ? day : minute;
  const keys = [...new Set(rows.map(key))].sort();
  const columns = keys.map((k) => ({ key: k, times: [...new Set(rows.filter((r) => key(r) === k).map((r) => r.date.slice(11, 16)))] }));
  return { columns, key, keys };
}
```

and in `measurementsOf` use `const { columns, key, keys } = buildColumns(rows);`. Change the `Row` type to `{ variable: string; date: string; value: unknown; target?: string }`. (The `target` part of `perDay` keeps plants from forcing minute columns on each other: two plants measured the same day are one column.) Run the existing measurements tests: unchanged behaviour for single-target rows.

- [ ] **Step 4: Write `src/routes/experiment-overview.ts`**

```ts
// One variable's values for every plant of an experiment, shaped like the plant page's measurements
// (scan columns + per-plant values), for the chart grid. Read-only.
import { authedGetOne, authedPost, respondOpenSilexErrors } from "../opensilex.ts";
import { buildColumns } from "./measurements.ts";
import type { RouteHandler } from "../http.ts";

const enc = encodeURIComponent;
type Row = { variable: string; date: string; value: unknown; target?: string };
const unitSymbols = new Map<string, Promise<string>>();

export async function experimentOverview(experiment: string, variable: string) {
  // No target in the body = every object of the experiment (probed 2026-10-06: 884 rows for 100 plants in ~0.5 s).
  const rows = (await authedPost(`/core/data/search?experiments=${enc(experiment)}&variables=${enc(variable)}&page_size=100000&order_by=${enc("date=asc")}`, [])).result as unknown as Row[];
  const info = ((await authedPost("/core/variables/by_uris", [variable])).result as unknown as { uri: string; name: string; unit?: { uri: string; name?: string } }[])[0];
  const unit = await (async () => {
    const u = info?.unit;
    if (!u) return "";
    if (!unitSymbols.has(u.uri)) unitSymbols.set(u.uri, authedGetOne(`/core/units/${enc(u.uri)}`).then((r) => String(r.result.symbol ?? "")).catch(() => ""));
    return (await unitSymbols.get(u.uri)!) || (u.name === "Unitless" ? "" : u.name ?? "");
  })();
  const head = { id: variable, name: String(info?.name ?? variable), unit };
  if (!rows.length) return { variable: head, columns: [], plants: [] };

  const { columns, key, keys } = buildColumns(rows);
  const byPlant = new Map<string, Row[]>();
  for (const r of rows) byPlant.set(String(r.target), [...(byPlant.get(String(r.target)) ?? []), r]);
  const plants = [...byPlant].map(([id, mine]) => ({
    id,
    values: keys.map((k) => { const r = mine.find((x) => key(x) === k); return r ? { v: Number(r.value), at: r.date.slice(11, 16) } : null; }),
  }));
  return { variable: head, columns, plants };
}

export const handleExperimentOverview: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/experiment-overview" || req.method !== "GET") return false;
  const experiment = searchParams.get("experiment"), variable = searchParams.get("variable");
  if (!experiment || !variable) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "experiment and variable are required" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const body = JSON.stringify(await experimentOverview(experiment, variable));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  return true;
};
```

Register it in `src/index.ts` next to `handleMeasurements` (same import style).

- [ ] **Step 5: Inline chart-math into the page.** In `src/routes/static.ts` add `const CHART_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../chart-math.js");`, read it in the `Promise.all`, and append `+ "\n" + chartJs.replace(/^export /gm, "")` to `inlineJs`. Add a backend test:

```ts
test("the page carries the chart maths inline (no export keyword left, functions callable)", async () => {
  await withServer(async (base) => {
    const html = await (await nativeFetch(`${base}/`)).text();
    assert.match(html, /function meanSd\(/);
    assert.match(html, /function arrangeCharts\(/);
    assert.doesNotMatch(html, /^export function meanSd/m);
  });
});
```

- [ ] **Step 6: Run and verify**: the backend tests (all pass), `npm test` (all green). Live read-only check: `node --experimental-strip-types --env-file=.env` a one-off script calling `experimentOverview(<PBar1x4>, <plant_height_max>)`: expect 100 plants and 9 columns.
- [ ] **Step 7: Commit**

```bash
git add graph-explorer/src graph-explorer/test/backend.test.ts
git commit -m "feat(graph-explorer): /api/experiment-overview (one variable, every plant) and the chart maths inlined into the page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: The chart grid overlay

**Files:**
- Modify: `public/index.html` (CSS tokens and rules; grid code after the measurement code; the action bar in `renderActionbar`, both the normal and the graph-only bars)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: Task 1/2 functions available in the page (`meanSd`, `groupColumns`, `yRange`, `arrangeCharts`), `NODE_DETAIL[id].structure`, `selection`, `timeOf`, `whenText`, `sig4`, `unitText`, `escapeHtml`, `currentPane()`.
- Produces:
  - `const OVERVIEW = {}` — cache `"<exp>|<var>"` -> Promise of the route's answer.
  - `chartableSelection(): {experiment, st, plan}|null` — the open experiment page's id, structure and `arrangeCharts(...)` result when something chartable AND a variable are picked; used by the action bar.
  - `openChartGrid(experimentId)` — builds `<dialog class="grid-dialog" id="chartGrid">`, state `{vi:0, stats:false, sharedY:true}`; `renderChartGrid()` re-renders the body.
  - DOM: `#chartGrid`, `button[data-gvar="<i>"]` (pager tabs), `button#gridPrev` / `#gridNext`, `input#gridStats`, `input#gridShared`, `.g-row`, `.g-chart[data-key]`, `.g-line` (plant lines), `.g-mean`, `.g-band`; action-bar button `#showGridBtn`.

- [ ] **Step 1: Write the failing e2e tests** — append (mock `/api/experiment-overview` per variable; reuse `openStructuredExperiment`, extend the fixture's variables to two):

```ts
const OV = (name: string, base: number) => ({
  variable: { id: name, name, unit: "mm" },
  columns: [{ key: "2025-10-22", times: ["10:00"] }, { key: "2025-10-23", times: ["10:00"] }, { key: "2025-10-24", times: ["10:00"] }],
  plants: [1, 2, 3].map((n) => ({ id: `so-p${n}`, values: [{ v: base + n, at: "10:00" }, { v: base * 2 + n * 2, at: "10:00" }, n === 3 ? null : { v: base * 3 + n * 3, at: "10:00" }] })),
});
async function routeOverview(page: import("playwright").Page, seen: string[] = []) {
  await page.route("**/api/experiment-overview*", (r) => {
    const v = new URL(r.request().url()).searchParams.get("variable")!;
    seen.push(v);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OV(v, v === "var-1" ? 10 : 100)) });
  });
}
async function withTwoVariables(fn: () => Promise<void>) {
  STRUCT.variables.push({ id: "var-2", label: "NDVI", count: 9 });
  try { await fn(); } finally { STRUCT.variables.length = 1; }
}

test("e2e: Show chart grid appears once a variable and something chartable are picked; the grid has a row per factor, a chart per level, and pages per variable", async () => {
  await withTwoVariables(async () => {
    await withServerAndBrowser(async (base, page) => {
      const seen: string[] = [];
      await routeOverview(page, seen);
      await openStructuredExperiment(page, base, "variables");
      assert.equal(await page.locator("#showGridBtn").count(), 0, "nothing picked yet");
      await page.locator("#variablesBody .chip", { hasText: "Plant Height" }).click({ modifiers: ["Control"] });
      await page.locator("#variablesBody .chip", { hasText: "NDVI" }).click({ modifiers: ["Control"] });
      assert.match((await page.locator("#actionbar").innerText()).replace(/\s+/g, " "), /Pick plants, levels or a factor/, "a variable but nothing to chart: says what to pick");
      await page.locator('button.dtab[data-dtab="plants"]').click();
      await page.locator('.hx-head[data-id="fac-g"]').click({ modifiers: ["Control"] });
      await page.locator("#showGridBtn").click();

      const grid = page.locator("#chartGrid");
      await grid.locator(".g-chart").first().waitFor();
      assert.equal(await grid.locator(".g-row").count(), 1);
      assert.match(await grid.locator(".g-row").first().innerText(), /GroupID/);
      assert.equal(await grid.locator(".g-chart").count(), 2, "a chart per level of the picked factor");
      assert.equal(await grid.locator(".g-chart").first().locator(".g-line").count(), 2, "its plants as thin lines");
      assert.equal(await grid.locator(".g-chart").first().locator(".g-mean").count(), 1);
      assert.match(await grid.locator(".g-title").innerText(), /Plant Height/);

      await grid.locator("#gridNext").click();
      await grid.locator(`.g-title:has-text("NDVI")`).waitFor();
      assert.deepEqual(seen, ["var-1", "var-2"], "each variable fetched once, when paged to");
      await grid.locator("#gridPrev").click();
      assert.deepEqual(seen, ["var-1", "var-2"], "paging back reuses the cache");
    });
  });
});

test("e2e: the statistics toggle draws a mean ± SD band and fades the plant lines; a group of one plant has no band", async () => {
  await withServerAndBrowser(async (base, page) => {
    await routeOverview(page);
    await openStructuredExperiment(page, base, "variables");
    await page.locator("#variablesBody .chip", { hasText: "Plant Height" }).click({ modifiers: ["Control"] });
    await page.locator('button.dtab[data-dtab="plants"]').click();
    await page.locator('.hx-head[data-id="fac-g"]').click({ modifiers: ["Control"] });
    await page.locator("#showGridBtn").click();
    const grid = page.locator("#chartGrid");
    await grid.locator(".g-chart").first().waitFor();
    assert.equal(await grid.locator(".g-band").count(), 0, "off by default");
    await grid.locator("#gridStats").check();
    assert.equal(await grid.locator(".g-chart").first().locator(".g-band").count(), 1, "level 1 has 2 plants: a band");
    assert.equal(await grid.locator(".g-chart").nth(1).locator(".g-band").count(), 0, "level 2 has 1 plant: SD is null, no band");
    assert.equal(await grid.locator(".g-chart.stats").count(), 2, "stats class fades the plant lines");
  });
});

test("e2e: a standalone plant and a plant picked in a level box get their charts; empty values say so; hover names the scan", async () => {
  await withServerAndBrowser(async (base, page) => {
    await routeOverview(page);
    await openStructuredExperiment(page, base, "variables");
    await page.locator("#variablesBody .chip", { hasText: "Plant Height" }).click({ modifiers: ["Control"] });
    await page.locator('button.dtab[data-dtab="plants"]').click();
    await page.locator('.hx-fac[data-fac="fac-g"] .hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    await page.locator('.hx-fac[data-fac="#other"] .hx-plant').first().click({ modifiers: ["Control"] });
    await page.locator("#showGridBtn").click();
    const grid = page.locator("#chartGrid");
    await grid.locator(".g-chart").first().waitFor();
    assert.deepEqual(await grid.locator(".g-row").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row)), ["GroupID", "Plants"]);
    assert.match(await grid.locator('.g-chart[data-key="plant:so-t1"]').innerText(), /no values/i, "the tray has none for this variable");
    const chart = grid.locator('.g-chart[data-key="lv-g1:picked"] .g-plot');
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    assert.match(await grid.locator('.g-chart[data-key="lv-g1:picked"] .g-tip').innerText(), /22 Oct 2025/);
  });
});
```

(The first test needs `STRUCT.variables` to hold `{id:"var-1", label:"Plant Height", count:1200}` — it already does; `withTwoVariables` adds the second.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="Show chart grid appears|statistics toggle|standalone plant and a plant picked" test/e2e.test.ts`
Expected: FAIL (no `#showGridBtn`).

- [ ] **Step 3: CSS.** Palette tokens next to the other `:root` tokens (and again in both dark-mode blocks the file already has; use the same duplication the file uses for its other tokens):

```css
:root { --c1: #2a9d8f; --c2: #d98e1f; --c3: #8e6bbf; --c4: #3d7fd1; --c5: #cf4a5c; --c6: #5f9a2f; --c7: #b5509f; --c8: #7a7f87; }
/* dark: --c1: #4cc3b3; --c2: #efb04c; --c3: #b39be0; --c4: #6aa3ec; --c5: #ec7b8b; --c6: #86c25a; --c7: #d681c3; --c8: #a4a9b1; */
.grid-dialog { width: min(1280px, 96vw); max-height: 94vh; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--ink); overflow: auto; }
.grid-dialog::backdrop { background: rgba(0, 0, 0, .5); }
.g-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
.g-title { font-size: 16px; font-weight: 600; }
.g-pager { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.g-pager button, .g-head button { border: 1px solid var(--border); background: none; color: var(--ink); border-radius: 12px; font: inherit; font-size: 12px; padding: 2px 10px; cursor: pointer; }
.g-pager button.on { background: color-mix(in srgb, var(--accent) 22%, transparent); border-color: var(--accent); font-weight: 600; }
.g-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; margin-bottom: 10px; }
.g-row-label { font-weight: 600; font-size: 13px; padding-top: 4px; }
.g-row-charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.g-chart { border: 1px solid var(--border); border-radius: var(--radius); padding: 5px 8px 6px; cursor: pointer; }
.g-chart:hover { border-color: var(--accent); }
.g-ct { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
.g-ct span { color: var(--ink-faint); font-size: 11px; }
.g-plot { position: relative; height: 96px; }
.g-plot svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.g-plot polyline { fill: none; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.g-line { stroke-width: 1; opacity: .35; }
.g-line.em { stroke-width: 2.2; opacity: 1; }
.g-chart.stats .g-line { opacity: .12; }
.g-mean { stroke-width: 2.4; }
.g-band { opacity: .2; stroke: none; }
.g-empty { color: var(--ink-faint); font-size: 12px; line-height: 96px; text-align: center; }
.g-tip { position: absolute; bottom: 100%; margin-bottom: 4px; padding: 2px 7px; white-space: nowrap; font-size: 11.5px; background: var(--ink); color: var(--surface); border-radius: 4px; pointer-events: none; z-index: 5; display: none; }
.g-dot { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; pointer-events: none; display: none; }
```

- [ ] **Step 4: The grid code.** Add after the measurement code in `public/index.html`:

```js
// ---- the experiment chart grid ----
const OVERVIEW = {}; // "<experiment>|<variable>" -> promise of /api/experiment-overview
const gridState = { vi: 0, stats: false, sharedY: true, exp: null };
const colorVar = i => `var(--c${(i % 8) + 1})`;
const sameId = (a, b) => a === b || a.split("/").pop() === b.split("/").pop(); // PHIS gives full or prefixed uris

function loadOverview(exp, varId) {
  const key = `${exp}|${varId}`;
  if (!OVERVIEW[key]) {
    OVERVIEW[key] = fetch(`api/experiment-overview?experiment=${encodeURIComponent(exp)}&variable=${encodeURIComponent(varId)}`)
      .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(b => Promise.reject(new Error(b.error || `PHIS answered ${r.status}`))))
      .catch(err => { delete OVERVIEW[key]; throw err; });
  }
  return OVERVIEW[key];
}

// The open experiment page's structure and what the selection asks to chart; null off an experiment page.
function chartableSelection() {
  const p = currentPane();
  const st = p && NODE_DETAIL[p.id]?.structure;
  if (!st) return null;
  const plan = arrangeCharts([...selection.values()], st);
  return { experiment: p.id, st, plan };
}

function gridChartHtml(ch, data, yr, opts) {
  const e = escapeHtml;
  const byId = new Map(data.plants.map(p => [p.id, p]));
  const find = id => data.plants.find(p => sameId(p.id, id));
  const plants = ch.plantIds.map(find).filter(Boolean);
  const head = `<div class="g-ct"><b style="color:${ch.kind === "plant" ? "var(--ink)" : colorVar(ch.colorIndex)}">${e(ch.title)}</b><span>${e(ch.sub)}</span></div>`;
  const nCols = data.columns.length;
  const pts = plants.filter(p => p.values.some(Boolean));
  if (!nCols || !pts.length) return `<div class="g-chart" data-key="${e(ch.key)}">${head}<div class="g-empty">no values for ${e(data.variable.name)}</div></div>`;
  const ts = data.columns.map(c => timeOf(c.key)), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const X = i => 2 + 96 * (t1 === t0 ? 0.5 : (ts[i] - t0) / (t1 - t0));
  const stats = groupColumns(pts, nCols);
  const own = opts.stats && ch.kind !== "plant";
  const yr2 = opts.sharedY ? yr : yRange([pts.flatMap(p => p.values.map(v => v?.v ?? null)), own ? stats.flatMap(s => s ? [s.mean - (s.sd ?? 0), s.mean + (s.sd ?? 0)] : []) : []]);
  const Y = v => 12 + 76 * (1 - (v - yr2.lo) / (yr2.hi - yr2.lo));
  const path = (vals) => vals.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean);
  const color = ch.kind === "plant" ? "var(--ink)" : colorVar(ch.colorIndex);
  let svg = "";
  if (ch.kind !== "plant") pts.forEach(p => { const d = path(p.values.map(v => v?.v ?? null)); if (d.length > 1) svg += `<polyline class="g-line${ch.emphasis.some(x => sameId(x, p.id)) ? " em" : ""}" stroke="${color}" points="${d.join(" ")}"/>`; });
  if (own) {
    const up = [], down = [];
    stats.forEach((s, i) => { if (s && s.sd != null) { up.push(`${X(i).toFixed(1)},${Y(s.mean + s.sd).toFixed(1)}`); down.unshift(`${X(i).toFixed(1)},${Y(s.mean - s.sd).toFixed(1)}`); } });
    if (up.length > 1) svg += `<polygon class="g-band" fill="${color}" points="${[...up, ...down].join(" ")}"/>`;
  }
  const meanPts = path(stats.map(s => s ? s.mean : null));
  if (meanPts.length > 1) svg += `<polyline class="g-mean" stroke="${color}" points="${meanPts.join(" ")}"/>`;
  return `<div class="g-chart${opts.stats ? " stats" : ""}" data-key="${e(ch.key)}">${head}<div class="g-plot" data-key="${e(ch.key)}"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg><span class="g-dot" style="background:${color}"></span><span class="g-tip"></span></div></div>`;
}

async function renderChartGrid() {
  const dlg = document.getElementById("chartGrid");
  const sel = chartableSelection();
  if (!dlg || !sel) return;
  const { plan, st } = sel, e = escapeHtml;
  const v = plan.variables[Math.min(gridState.vi, plan.variables.length - 1)];
  gridState.vi = plan.variables.indexOf(v);
  const pager = plan.variables.length > 1
    ? `<div class="g-pager"><button id="gridPrev" ${gridState.vi === 0 ? "disabled" : ""}>‹</button>${plan.variables.map((x, i) => `<button data-gvar="${i}" class="${i === gridState.vi ? "on" : ""}">${e(x.label)}</button>`).join("")}<button id="gridNext" ${gridState.vi === plan.variables.length - 1 ? "disabled" : ""}>›</button></div>` : "";
  const note = plan.outside.length ? `<div class="hx-note">${plan.outside.length} picked object${plan.outside.length === 1 ? " is" : "s are"} not in this experiment and not charted: ${e(plan.outside.join(", "))}.</div>` : "";
  dlg.innerHTML = `<div class="g-head"><span class="g-title">${e(v.label)}</span>${pager}<span style="flex:1"></span>
      <label><input type="checkbox" id="gridShared" ${gridState.sharedY ? "checked" : ""}> shared y-axis</label>
      <label><input type="checkbox" id="gridStats" ${gridState.stats ? "checked" : ""}> show statistics (mean ± SD)</label>
      <button id="gridClose">Close</button></div>${note}<div id="gridBody"><div class="hx-note">Loading ${e(v.label)}…</div></div>`;
  dlg.querySelector("#gridClose").addEventListener("click", () => dlg.close());
  dlg.querySelector("#gridPrev")?.addEventListener("click", () => { gridState.vi--; renderChartGrid(); });
  dlg.querySelector("#gridNext")?.addEventListener("click", () => { gridState.vi++; renderChartGrid(); });
  dlg.querySelectorAll("[data-gvar]").forEach(b => b.addEventListener("click", () => { gridState.vi = Number(b.dataset.gvar); renderChartGrid(); }));
  dlg.querySelector("#gridShared").addEventListener("change", ev => { gridState.sharedY = ev.target.checked; renderChartGrid(); });
  dlg.querySelector("#gridStats").addEventListener("change", ev => { gridState.stats = ev.target.checked; renderChartGrid(); });
  const body = dlg.querySelector("#gridBody");
  let data;
  try { data = await loadOverview(sel.experiment, v.id); }
  catch (err) {
    body.innerHTML = `<div class="import-warning">Couldn't load ${e(v.label)}: ${e(String(err.message))} <button id="gridRetry">Retry</button></div>`;
    body.querySelector("#gridRetry").addEventListener("click", () => renderChartGrid());
    return;
  }
  if (!dlg.open) return;
  const yr = yRange(plan.rows.flatMap(r => r.charts.flatMap(c => c.plantIds.map(id => data.plants.find(p => sameId(p.id, id))).filter(Boolean).map(p => p.values.map(x => x?.v ?? null)))));
  body.innerHTML = plan.rows.map(r => `<div class="g-row" data-row="${e(r.label)}"><div class="g-row-label">${e(r.label)}</div><div class="g-row-charts">${r.charts.map(c => gridChartHtml(c, data, yr, gridState)).join("")}</div></div>`).join("");
  body.querySelectorAll(".g-plot").forEach(plot => {
    const ch = plan.rows.flatMap(r => r.charts).find(c => c.key === plot.dataset.key);
    wireGridChart(plot, ch, data);
  });
}

// Hover: the nearest scan of the chart — the mean (± SD, n) of a group, the value of a single plant.
function wireGridChart(plot, ch, data) {
  const dot = plot.querySelector(".g-dot"), tip = plot.querySelector(".g-tip");
  const find = id => data.plants.find(p => sameId(p.id, id));
  const plants = ch.plantIds.map(find).filter(Boolean);
  const stats = groupColumns(plants, data.columns.length);
  const ts = data.columns.map(c => timeOf(c.key)), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const xs = ts.map(t => 2 + 96 * (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)));
  plot.addEventListener("mousemove", ev => {
    const r = plot.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width * 100;
    let i = 0; xs.forEach((x, j) => { if (Math.abs(x - fx) < Math.abs(xs[i] - fx)) i = j; });
    const s = stats[i];
    if (!s) { tip.style.display = dot.style.display = "none"; return; }
    const u = data.variable.unit ? " " + data.variable.unit : "";
    tip.textContent = `${whenText(data.columns[i].key)} · ${ch.kind === "plant" ? sig4(s.mean) : `mean ${sig4(s.mean)}${s.sd != null ? ` ± ${sig4(s.sd)}` : ""} (n=${s.n})`}${u}`;
    tip.style.cssText = `display:block;left:${xs[i]}%;transform:translateX(-${xs[i]}%)`;
  });
  plot.addEventListener("mouseleave", () => { tip.style.display = dot.style.display = "none"; });
}

function openChartGrid() {
  document.getElementById("chartGrid")?.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "grid-dialog"; dlg.id = "chartGrid";
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  gridState.vi = 0;
  dlg.showModal();
  renderChartGrid();
}
```

- [ ] **Step 5: The action-bar button.** In `renderActionbar`, directly before the `if (selection.size === 0) {` branch that handles "Nothing selected" compute `const grid = chartableSelection();` and add a helper `gridButtonHtml(grid)`:

```js
function gridButtonHtml(grid) {
  if (!grid || !grid.plan.variables.length && !grid.plan.rows.length) return "";
  if (!grid.plan.variables.length) return `<div class="selection-summary link-why">Pick a variable to chart (Variables tab).</div>`;
  if (!grid.plan.rows.length) return `<div class="selection-summary link-why">Pick plants, levels or a factor to chart.</div>`;
  return `<button class="btn primary" id="showGridBtn">Show chart grid</button>`;
}
```

Insert `${gridButtonHtml(grid)}` into both the normal bar template (just before the `+ New` menu) and the graph-only bar template (after the explanation, before "Remove extra picks"), and after each `innerHTML` assignment wire `document.getElementById("showGridBtn")?.addEventListener("click", openChartGrid);`.

- [ ] **Step 6: Run to verify they pass**, then `npm test`. Fix spacing and colours in light and dark mode with a screenshot of the grid on real PBar1x4 (Replicate factor, Plant Height Max, statistics on) — see Task 6.
- [ ] **Step 7: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): chart grid — rows per factor, a chart per level, plants and picked groups, paged per variable, mean ± SD" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Click a chart for the full numbers

**Files:**
- Modify: `public/index.html` (the grid code from Task 3, CSS)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's `renderChartGrid` (its `plan` and `data` are in scope where the wiring happens), `groupColumns`, `meanSd`.
- Produces: `openChartDetail(ch, data)` — a second `<dialog class="meas-dialog" id="chartDetail">` (reusing the measurement dialog's look): a large chart (the same SVG builder with `big` sizing), a table `Scan | Mean | SD | n` for groups or `Scan | Value` for a plant, the plants of the group as buttons (`button.g-plant[data-id]`: click highlights its line, ctrl-click hides it), and links "Open <level/plant>" calling `openRelatedNode`.

- [ ] **Step 1: Write the failing test** — append:

```ts
test("e2e: clicking a chart opens its numbers: a scan table with mean, SD and n, and the plants of the group (click highlights, ctrl hides)", async () => {
  await withServerAndBrowser(async (base, page) => {
    await routeOverview(page);
    await openStructuredExperiment(page, base, "variables");
    await page.locator("#variablesBody .chip", { hasText: "Plant Height" }).click({ modifiers: ["Control"] });
    await page.locator('button.dtab[data-dtab="plants"]').click();
    await page.locator('.hx-head[data-id="fac-g"]').click({ modifiers: ["Control"] });
    await page.locator("#showGridBtn").click();
    const grid = page.locator("#chartGrid");
    await grid.locator(".g-chart").first().waitFor();
    await grid.locator('.g-chart[data-key="lv-g1"] .g-ct').click();
    const d = page.locator("#chartDetail");
    await d.waitFor();
    const text = (await d.innerText()).replace(/\s+/g, " ");
    assert.match(text, /GroupID: 1/);
    assert.match(text, /22 Oct 2025 \S* ?11 ?\S* ?1\.414 ?2/, "scan row: mean 11, SD 1.414, n 2 (values 11 and 12)");
    assert.equal(await d.locator("button.g-plant").count(), 2);
    await d.locator('button.g-plant[data-id="so-p1"]').click();
    assert.equal(await d.locator(".g-line.em").count(), 1, "click highlights that plant's line");
    await d.locator('button.g-plant[data-id="so-p2"]').click({ modifiers: ["Control"] });
    assert.equal(await d.locator(".g-line").count(), 1, "ctrl hides a plant's line");
    await d.locator("button.g-close").click();
    assert.equal(await page.locator("#chartDetail").count(), 0);
    assert.equal(await page.locator("#chartGrid").count(), 1, "the grid is still there behind it");
  });
});
```

(The fixture's GroupID level 1 holds plants 1 and 2; with `OV("var-1", 10)` their first-scan values are 11 and 12, so mean 11.5 and SD 0.707. Adjust the regex to the exact numbers the fixture yields: first scan mean `11.5`, SD `0.7071`, n `2`. Use `/22 Oct 2025 11\.5 0\.7071 2/` after running once to see the real text.)

- [ ] **Step 2: Run to verify it fails** (`--test-name-pattern="clicking a chart opens its numbers"`). Expected: FAIL (no `#chartDetail`).
- [ ] **Step 3: Implement.** In `renderChartGrid`, after the charts are rendered, wire `body.querySelectorAll(".g-chart[data-key]").forEach(c => c.addEventListener("click", () => openChartDetail(chartOf(c.dataset.key), data)))` (`chartOf` = look up in `plan.rows`). Write `openChartDetail(ch, data)`:
  1. Build the dialog with a header (title, sub, variable name and unit, a `button.g-close` "Close"), a big plot (`.g-plot` with height 220px via an inline style, built by `gridChartHtml` with a state object `{stats: true, sharedY: false}` and a `hidden`/`highlight` set so lines can be restyled), the scan table (rows from `groupColumns(plants, nCols)`; `Scan` via `whenText(key)`, numbers via `sig4`, SD `–` when null), and a plant list (`button.g-plant` per plant).
  2. `button.g-plant` click toggles `highlight` for that id (re-render the plot: that plant's polyline gets class `em`, others fade); ctrl-click toggles `hidden` (the polyline is not drawn, the mean is unchanged: it is the group's own number).
  3. `showModal()`; on close remove itself. Clicking a plant's name with the meta key is not used for navigation; a separate "Open" link per chart title calls `openRelatedNode` for a level (`{id, type:"factor_level", label, factor}`) or a plant.
  To keep `gridChartHtml` reusable, add an optional 5th argument `view = {highlight:Set, hidden:Set, big:false}` that it consults when building each plant polyline (class `em` if highlighted or in `ch.emphasis`; skipped if hidden; `stats` class forced on when `big`).
- [ ] **Step 4: Run to verify it passes**, then `npm test`.
- [ ] **Step 5: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): click a chart for its scan table (mean, SD, n) and its plants" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: The Overview's chart builder, and making the feature known

**Files:**
- Modify: `public/index.html` (`overviewHtml`, wiring, CSS)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's `openChartGrid`, `selection`, the structure on the Overview, `hxAfterPick`.
- Produces: on the Overview a `.cb` "Chart builder" block: `select#cbVariable` (the experiment's variables), `button.cb-factor[data-fac]` pills (one factor, or none), `button#cbShow` "Show chart grid"; a collapsed `<details class="how-charts">` "How charts work" note. Pressing `#cbShow` replaces the selection with {the chosen variable item, the chosen factor item (or, with no factor, nothing, which asks for plants)} and opens the grid.

- [ ] **Step 1: Write the failing test** — append:

```ts
test("e2e: the Overview's chart builder sets the selection and opens the grid; a note explains how charts work", async () => {
  await withServerAndBrowser(async (base, page) => {
    await routeOverview(page);
    await openStructuredExperiment(page, base, null);
    const body = page.locator("#detailBody");
    assert.match(await body.locator("details.how-charts summary").innerText(), /How charts work/);
    assert.equal(await body.locator("#cbVariable option").count(), 1);
    await body.locator('button.cb-factor[data-fac="fac-r"]').click();
    await body.locator("#cbShow").click();
    const grid = page.locator("#chartGrid");
    await grid.locator(".g-chart").first().waitFor();
    assert.match(await grid.locator(".g-row").first().innerText(), /Replicate/);
    assert.deepEqual(await page.evaluate(() => [...selection.values()].map((v: any) => v.type).sort()), ["factor", "variable"], "the builder just fills the selection");
    await grid.locator("#gridClose").click();
    assert.match((await page.locator("#actionbar").innerText()).replace(/\s+/g, " "), /Show chart grid/, "and the action bar offers the same button");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Expected: FAIL (no `details.how-charts`).
- [ ] **Step 3: Implement.** In `overviewHtml(node)` after the cards, add:

```js
  if (st.variables.length && st.factors.length) {
    const pick = ovBuilder[node.uri] ??= { fac: st.factors[0].id, variable: st.variables[0].id };
    h += `<div class="rel-group"><div class="rel-label">Chart builder</div><div class="cb">
      <div class="tab-controls"><span class="k">Variable</span><select id="cbVariable" class="tab-filter" style="flex:none">${st.variables.map(v => `<option value="${e(v.id)}"${v.id === pick.variable ? " selected" : ""}>${e(v.label)}</option>`).join("")}</select></div>
      <div class="tab-controls"><span class="k">Compare</span>${st.factors.map(f => `<button class="pill cb-factor${f.id === pick.fac ? " on" : ""}" data-fac="${e(f.id)}">${e(f.label)} (${f.levels.length} levels)</button>`).join("")}</div>
      <div class="tab-controls"><button class="btn primary" id="cbShow">Show chart grid</button><span class="k">= every level of the factor, for this variable. Pick plants or more variables on their tabs for other charts.</span></div></div>
      <details class="how-charts"><summary>How charts work</summary><p>Pick variables (Variables tab) and plants, levels or whole factors (Plants tab or the factor list above) — ctrl-click, shift-click or drag — then press <b>Show chart grid</b> in the bar below or here. Each factor becomes a row with a chart per level; plants picked inside a level overlay in that level's chart; single plants get their own chart. Page through variables at the top of the grid; click a chart for its numbers.</p></details></div>`;
  }
```

(`ovBuilder` is a module-level `const ovBuilder = {}` next to `detailTab`; `e` is the existing `escapeHtml` alias in `overviewHtml`.) Wiring in `renderNodeDetail` next to the other tab wiring:

```js
  els.detailBody.querySelector("#cbVariable")?.addEventListener("change", ev => { ovBuilder[node.uri].variable = ev.target.value; });
  els.detailBody.querySelectorAll("button.cb-factor").forEach(b => b.addEventListener("click", () => { ovBuilder[node.uri].fac = b.dataset.fac; renderDetail(); }));
  document.getElementById("cbShow")?.addEventListener("click", () => {
    const st = node.structure, pick = ovBuilder[node.uri];
    const v = st.variables.find(x => x.id === pick.variable), f = st.factors.find(x => x.id === pick.fac);
    selection = new Map([[v.id, { id: v.id, type: "variable", label: v.label }], [f.id, { id: f.id, type: "factor", label: f.label }]]);
    hxAfterPick();
    openChartGrid();
  });
```

Note `#cbShow` is inside `#detailBody`, so use `els.detailBody.querySelector` (not `document.getElementById`) if the id is also used by the action bar: the action bar's button is `#showGridBtn`, so `document.getElementById("cbShow")` is fine.
- [ ] **Step 4: Run to verify it passes**, then `npm test`.
- [ ] **Step 5: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): Overview chart builder and a how-charts-work note" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 6: Real-data check, colours and wrap-up

- [ ] **Step 1:** `npm test` all green.
- [ ] **Step 2:** On phis-test (second server on :4001 as in plans 1-2): open PBar1x4; builder: Plant Height Max × Replicate → 5 charts in one row, lines rising; statistics on: bands; shared y on/off; page through two variables (pick a second on the Variables tab); GroupID factor + three single plants; a graph-only selection (same plant in two boxes) still shows only the grid button; click a chart: numbers match what you see (mean ± SD per scan); a variable with no values for some plants shows "no values". Light and dark mode: palette readable, plant lines visible but faint, band visible.
- [ ] **Step 3:** Screenshots of the grid and the detail dialog for the user; fix spacing/colour issues found.
- [ ] **Step 4:** Update the memory note (feature built, plan 3 done, what is deferred: quick looks, tab state in history, the portal audit file).
- [ ] **Step 5:** Final whole-branch review as in plans 1-2 (fresh reviewer, Review Focus above), ledger the deferred minors.

## Self-review

- **Spec coverage:** grid opened from the action bar when a variable and something chartable are picked (T3, T5), arrangement by origin with the mixed-selection rules (T1), per-variable paging with a shared selection (T3), statistics toggle with mean ± SD and fading plant lines, no band for one plant (T1, T3), click for a scan table and plants (T4), data route per variable (T2), discoverability: how-charts note, builder with defaults, hints in the action bar (T3, T5), colours as tokens (T3), single plants with no values show an empty chart (T3). Not built, named earlier: quick looks, tab state in history.
- **Placeholder scan:** none (T4 describes the detail dialog's steps with the exact function names, class names and behaviours; the regex in T4's test says to read the real text once and fix the numbers, with the expected values stated).
- **Type consistency:** `arrangeCharts` output (`rows[].charts[]` with `key/title/sub/kind/plantIds/emphasis/colorIndex`) is consumed by `gridChartHtml` and `openChartDetail`; `groupColumns(plants, nCols)` takes route plants (`values`), matching `/api/experiment-overview`; `sameId` bridges full/prefixed uris between the structure's plant ids and the route's target uris.

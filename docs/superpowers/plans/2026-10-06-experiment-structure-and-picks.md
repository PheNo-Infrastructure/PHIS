# Experiment structure and picks — Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The experiment page lists its variables (with value counts) and shows its plants in a box per factor, with a box per level inside; plants, levels and factors can be opened, picked, range-picked and drag-picked, and picking the same plant from two boxes puts the selection in a "graph-only" state.

**Architecture:** One new server function (`experimentStructure`) is attached to the experiment's existing `/api/node-detail` answer as a `structure` field. The page renders it as new elements (`.hx`) and handles them in the existing single mousedown/mouseup pipeline. A plant pick stays one entry in `selection` keyed by id; it only gains a `vias` list (which boxes it was picked from). "Graph-only" is derived (any plant with more than one instance), not stored.

**Tech Stack:** Node 22 with `--experimental-strip-types`, `node:test`, Playwright; the page is one `public/index.html` with no build step.

**Spec:** `docs/superpowers/specs/2026-10-06-experiment-chart-grid-design.md` (sections 1 and 2). Plan 2 (overview route, statistics, grid, dialog, "how charts work" note) comes after this one ships and is judged on real data. This plan adds no chart button; its graph-only bar offers only "Remove extra picks" and "Clear".

## Global Constraints

- No new dependencies, no build step; edit `public/index.html` in place.
- Read-only: nothing here writes to PHIS. The experiment's existing relations stay (unlink mode and delete rely on them).
- Plain click on a plant, level or factor opens its page (same as chips); ctrl toggles, shift ranges, drag sweeps. Shift and drag stay within one factor's box.
- A plant is one entry in `selection`, keyed by its id. Existing code paths must behave exactly as before for items without `vias`.
- Every fetch the page makes is relative (`api/...`). Names from PHIS are escaped with `escapeHtml` before going into HTML.
- Tests: `npm test` from `graph-explorer/` (209 existing + 1 e2e measurements test = 210 at the start). Run a single test with
  `node --experimental-strip-types --env-file=.env --test --test-name-pattern="<name>" test/<file>.test.ts`.
- Test files have mixed line endings: use the Edit tool for small changes; for scripted edits split on `\n` and keep each line's `\r`.
- Commit each task to branch `graph-explorer/project` and push; end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- An experiment with no factors: every object goes in "Not in a factor"; no empty factor boxes; the page still renders.
- An experiment with no variables measured: the Variables group is hidden, not an empty heading.
- A factor with no levels, or a level with no plants: the box renders with "no plants" and nothing throws.
- More than 500 objects (the PHIS page size the app already uses): the page says the list is cut off instead of silently showing a subset.
- A plant whose uri comes back full from one endpoint and prefixed from another: it must not land in "Not in a factor" by mistake (compare compacted uris).
- Ctrl-clicking the same copy twice returns the plant to unselected; shift across two factors' boxes falls back to a plain ctrl pick rather than selecting a nonsense range.
- A drag that starts inside one factor box and ends outside it selects only what it crosses inside that box.

---

## File structure

| File | Responsibility |
|---|---|
| `src/experiment-structure.ts` (new) | `experimentStructure(expId)`: variables with counts, factors with levels and their plants, objects in no factor |
| `src/node-types.ts` | `NodeConfig.structure?` hook; `experiment` sets it |
| `src/routes/node.ts` | adds `structure` to the node-detail body when the type has the hook |
| `public/index.html` | `structureHtml`, hierarchy CSS, pick helpers (`hxPick`, `togglePlantVia`), pipeline branch, graph-only bar |
| `test/backend.test.ts` | structure through `/api/node-detail` with a mocked PHIS |
| `test/e2e.test.ts` | rendering, click rules, duplicates and the graph-only bar |

---

### Task 1: The experiment's structure from PHIS

**Files:**
- Create: `src/experiment-structure.ts`
- Modify: `src/node-types.ts` (NodeConfig type near line 20-110; `experiment` entry near line 665)
- Modify: `src/routes/node.ts:22-34`
- Test: `test/backend.test.ts` (append)

**Interfaces:**
- Produces: `experimentStructure(expId: string): Promise<Structure>` and the `Structure` type below. The node-detail answer for an experiment gains `structure: Structure`.

```ts
export type Ref = { id: string; label: string };
export type Structure = {
  truncated: boolean; // the experiment has more objects than one page of 500
  variables: { id: string; label: string; count: number }[];
  factors: {
    id: string; label: string;
    levels: { id: string; type: "factor_level"; label: string; factor: string; plants: Ref[] }[];
    unset: Ref[]; // in some other factor's level but in none of this factor's
  }[];
  other: Ref[]; // in no level of any factor (trays, for example)
};
```

- [ ] **Step 1: Write the failing test** — append to `test/backend.test.ts`:

```ts
test("GET /api/node-detail for an experiment adds its structure: variables with counts, plants per factor level, unset and 'other' objects", async () => {
  await withServer(async (base) => {
    const so = (n: string) => ({ uri: `so-${n}`, name: n });
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: {} });
      if (url.includes("/core/data/count")) return jsonResponse(200, { result: url.includes("variables=var-1") ? 5 : 3 });
      if (url.includes("/core/experiments/exp-1/variables")) return jsonResponse(200, { result: [{ uri: "var-2", name: "Leaf area" }, { uri: "var-1", name: "Height" }] });
      if (url.includes("/core/experiments/exp-1/species")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/experiments/exp-1/factors")) return jsonResponse(200, { result: [
        { uri: "fac-g", name: "GroupID", experiment: "exp-1", levels: [{ uri: "lv-g1", name: "1" }, { uri: "lv-g2", name: "2" }] },
        { uri: "fac-r", name: "Replicate", experiment: "exp-1", levels: [{ uri: "lv-r1", name: "1" }] },
      ] });
      if (url.includes("factor_levels=lv-g1")) return jsonResponse(200, { result: [so("p2"), so("p1")] });
      if (url.includes("factor_levels=lv-g2")) return jsonResponse(200, { result: [so("p3")] });
      if (url.includes("factor_levels=lv-r1")) return jsonResponse(200, { result: [so("p1"), so("p2")] });
      if (url.includes("/core/scientific_objects?experiment=exp-1&page_size=500")) return jsonResponse(200, { result: [so("p1"), so("p2"), so("p3"), so("t1")], metadata: { pagination: { totalCount: 4 } } });
      if (url.endsWith("/core/experiments/exp-1")) return jsonResponse(200, { result: { uri: "exp-1", name: "Trial" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node-detail?type=experiment&id=exp-1`);
    assert.equal(res.status, 200);
    const { structure } = await res.json();
    assert.equal(structure.truncated, false);
    assert.deepEqual(structure.variables, [{ id: "var-1", label: "Height", count: 5 }, { id: "var-2", label: "Leaf area", count: 3 }], "sorted by name, counted per variable");
    const g = structure.factors.find((f: any) => f.label === "GroupID");
    assert.deepEqual(g.levels.map((l: any) => [l.label, l.plants.map((p: any) => p.label)]), [["GroupID: 1", ["p1", "p2"]], ["GroupID: 2", ["p3"]]], "levels and plants in natural order");
    assert.deepEqual(g.levels[0], { id: "lv-g1", type: "factor_level", label: "GroupID: 1", factor: "fac-g", plants: [{ id: "so-p1", label: "p1" }, { id: "so-p2", label: "p2" }] });
    assert.deepEqual(g.unset, [], "every plant with a level somewhere has one in GroupID");
    const r = structure.factors.find((f: any) => f.label === "Replicate");
    assert.deepEqual(r.unset.map((p: any) => p.label), ["p3"], "p3 has a GroupID but no Replicate");
    assert.deepEqual(structure.other.map((p: any) => p.label), ["t1"], "the tray is in no factor at all");
  });
});

test("an experiment with no factors puts every object in 'other'; a cut-off object list is flagged", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: {} });
      if (url.includes("/core/experiments/exp-2/variables")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/experiments/exp-2/species")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/experiments/exp-2/factors")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/scientific_objects?experiment=exp-2&page_size=500")) return jsonResponse(200, { result: [{ uri: "so-a", name: "A" }], metadata: { pagination: { totalCount: 900 } } });
      if (url.endsWith("/core/experiments/exp-2")) return jsonResponse(200, { result: { uri: "exp-2", name: "Plain" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const { structure } = await (await realFetch(`${base}/api/node-detail?type=experiment&id=exp-2`)).json();
    assert.deepEqual(structure.variables, []);
    assert.deepEqual(structure.factors, []);
    assert.deepEqual(structure.other, [{ id: "so-a", label: "A" }]);
    assert.equal(structure.truncated, true, "900 objects exist, 1 came back");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="adds its structure|no factors puts" test/backend.test.ts`
Expected: FAIL (`structure` is undefined).

- [ ] **Step 3: Write `src/experiment-structure.ts`**

```ts
// How an experiment's objects and variables sit, for its page: the variables with values (and how many),
// each factor's levels with the plants that have them, and the objects in no factor. Read-only.
import { authedGet, authedPost, compactUri } from "./opensilex.ts";

const enc = encodeURIComponent;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export type Ref = { id: string; label: string };
export type Structure = {
  truncated: boolean;
  variables: { id: string; label: string; count: number }[];
  factors: {
    id: string; label: string;
    levels: { id: string; type: "factor_level"; label: string; factor: string; plants: Ref[] }[];
    unset: Ref[];
  }[];
  other: Ref[];
};
type Row = { uri?: unknown; name?: unknown };
type FactorRow = { uri: string; name: string; levels?: { uri: string; name: string }[] };

const refs = (rows: Row[]): Ref[] => rows.map((r) => ({ id: String(r.uri), label: String(r.name ?? r.uri) })).sort((a, b) => natural(a.label, b.label));
const PAGE = 500; // the page size the app already asks PHIS for (EXPERIMENT_SOS)

export async function experimentStructure(expId: string): Promise<Structure> {
  const e = enc(expId);
  const [varRows, factorRows, soPage] = await Promise.all([
    authedGet(`/core/experiments/${e}/variables`),
    authedGet(`/core/experiments/${e}/factors`),
    authedGet(`/core/scientific_objects?experiment=${e}&page_size=${PAGE}`),
  ]);

  const variables = await Promise.all(varRows.result.map(async (v) => ({
    id: String(v.uri),
    label: String(v.name ?? v.uri),
    count: Number((await authedPost(`/core/data/count?experiments=${e}&variables=${enc(String(v.uri))}&count_limit=1000000`, [])).result) || 0,
  })));
  variables.sort((a, b) => natural(a.label, b.label));

  // Uris come back full or prefixed depending on the endpoint, so objects are matched by compacted uri.
  const all = refs(soPage.result);
  const keyOf = new Map(await Promise.all(all.map(async (o) => [o.id, await compactUri(o.id)] as const)));
  const key = async (id: string) => keyOf.get(id) ?? compactUri(id);
  const inAnyFactor = new Set<string>();

  const built = await Promise.all((factorRows.result as unknown as FactorRow[]).map(async (f) => {
    const own = new Set<string>();
    const levels = await Promise.all((f.levels ?? []).map(async (l) => {
      const plants = refs((await authedGet(`/core/scientific_objects?experiment=${e}&factor_levels=${enc(l.uri)}&page_size=${PAGE}`)).result);
      for (const p of plants) { const k = await key(p.id); own.add(k); inAnyFactor.add(k); }
      return { id: l.uri, type: "factor_level" as const, label: `${f.name}: ${l.name}`, factor: f.uri, plants };
    }));
    levels.sort((a, b) => natural(a.label, b.label));
    return { id: f.uri, label: f.name, levels, own };
  }));

  const factors = built.map(({ own, ...f }) => ({ ...f, unset: all.filter((o) => !own.has(keyOf.get(o.id)!) && inAnyFactor.has(keyOf.get(o.id)!)) }));
  const other = all.filter((o) => !inAnyFactor.has(keyOf.get(o.id)!));
  const total = soPage.metadata?.pagination?.totalCount ?? all.length;
  return { truncated: total > all.length, variables, factors, other };
}
```

- [ ] **Step 4: Attach it.** In `src/node-types.ts`, add to the `NodeConfig` type (next to `queryRelations`, after its closing `}[];` near line 113):

```ts
  // Extra structure for the node's page (an experiment's variables and factor boxes), sent beside `relations`.
  structure?: (id: string) => Promise<unknown>;
```

Add `import { experimentStructure } from "./experiment-structure.ts";` with the other imports at the top, and in the `experiment` entry (near `deleteRemovesLinks: true, visibility: true,`) add `structure: experimentStructure,`.

In `src/routes/node.ts`, inside the `JSON.stringify({ ... })` after the `relations: ...` line add:

```ts
      ...(config.structure ? { structure: await config.structure(id) } : {}),
```

- [ ] **Step 5: Run to verify it passes**

Run the Step 2 command. Expected: both tests PASS. Then `npm test` (all green).

- [ ] **Step 6: Live read-only check on phis-test**

Run (from `graph-explorer/`, with the dev server on :4000):
`curl -s "localhost:4000/api/node-detail?type=experiment&id=https%3A%2F%2Fphis.pheno.no%2Fid%2Fexperiment%2Fpbar1x4__traitfinder__2025-10-22" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=JSON.parse(d).structure;console.log(s.variables.length,"variables;",s.factors.map(f=>f.label+" "+f.levels.length+" levels, unset "+f.unset.length).join(" | "),";","other",s.other.length,"truncated",s.truncated)})'`
Expected: `21 variables; GroupID 10 levels, unset 0 | Replicate 5 levels, unset 0 ; other 25 truncated false` (25 trays; the exact counts may differ if phis-test changed — what matters is no unset plants and the trays under other).

- [ ] **Step 7: Commit**

```bash
git add graph-explorer/src graph-explorer/test/backend.test.ts
git commit -m "feat(graph-explorer): an experiment's structure (variables, factor levels with plants) in its node-detail" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: The experiment page shows variables and factor boxes

**Files:**
- Modify: `public/index.html` (CSS after the `.item-box-key` rule near line 458; new `structureHtml` before `renderNodeDetail` near line 1695; the normal relations branch near line 1799)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: `NODE_DETAIL[id].structure` (Task 1 shape), `chipHtml(it)`, `escapeHtml`, `selection`, `typeStyle`.
- Produces: `structureHtml(st): string`; DOM contract used by Tasks 3-4:
  `.hx-fac[data-fac]` (a factor box) containing `.hx.hx-head[data-hx="factor"][data-id][data-label]`, `.hx-level[data-level]` boxes each with `.hx.hx-head[data-hx="level"][data-id][data-label][data-fac]`, and `.hx.hx-plant[data-hx="plant"][data-id][data-label][data-via][data-fac]` (`data-via` = the level id, `<factorId>#unset` or `#other`). The "Not in a factor" box is `.hx-fac[data-fac="#other"]` with plants only (no factor header pick).
  State classes on `.hx`: `on` (picked here), `also` (this plant is picked, but from another box).

- [ ] **Step 1: Write the failing e2e test** — append to `test/e2e.test.ts`:

```ts
const P = (n: number) => ({ id: `so-p${n}`, label: `PB00${n}` });
const STRUCT = {
  truncated: false,
  variables: [{ id: "var-1", label: "Plant Height", count: 1200 }],
  factors: [
    { id: "fac-g", label: "GroupID", unset: [], levels: [
      { id: "lv-g1", type: "factor_level", label: "GroupID: 1", factor: "fac-g", plants: [P(1), P(2)] },
      { id: "lv-g2", type: "factor_level", label: "GroupID: 2", factor: "fac-g", plants: [P(3)] } ] },
    { id: "fac-r", label: "Replicate", unset: [], levels: [
      { id: "lv-r1", type: "factor_level", label: "Replicate: 1", factor: "fac-r", plants: [P(1), P(2), P(3)] } ] },
  ],
  other: [{ id: "so-t1", label: "Tray 31" }],
};
async function openStructuredExperiment(page: import("playwright").Page, base: string) {
  await page.route("**/api/node-detail*", (r) => {
    const id = new URL(r.request().url()).searchParams.get("id");
    const body = id === "exp-1"
      ? { uri: "exp-1", actions: ["rename", "delete", "link"], relations: [{ label: "Scientific objects", field: "scientific_object", items: [{ id: "so-p1", type: "scientific_object", label: "PB001" }] }], structure: STRUCT }
      : { uri: String(id), actions: [], relations: [] };
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(base);
  await page.waitForTimeout(1000);
  await page.evaluate(() => openNode({ id: "exp-1", type: "experiment", label: "Trial" }));
  await page.waitForTimeout(500);
}

test("e2e: an experiment's page lists its variables with counts and its plants in a box per factor and level; trays sit under 'Not in a factor'", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base);
    const body = page.locator("#detailBody");
    assert.match(await body.locator(".rel-group", { hasText: "Variables measured" }).innerText(), /Plant Height\s*·\s*1,200/);
    assert.equal(await body.locator(".hx-fac").count(), 3, "two factors and 'Not in a factor'");
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"] .hx-level').count(), 2);
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"] .hx-plant').count(), 3);
    assert.equal(await body.locator('.hx-plant[data-id="so-p1"]').count(), 2, "a plant is listed under every factor it belongs to");
    assert.match(await body.locator('.hx-fac[data-fac="#other"]').innerText(), /Tray 31/);
    assert.equal(await body.locator(".rel-group", { hasText: "Scientific objects" }).locator(".chip", { hasText: "PB001" }).count(), 0, "the flat list is replaced");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="lists its variables with counts" test/e2e.test.ts`
Expected: FAIL (no "Variables measured" group).

- [ ] **Step 3: CSS** — insert after the `.item-box-key { ... }` rule in `public/index.html`:

```css
.hx-fac { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 8px 10px 10px; margin-bottom: 8px; }
.hx-levels { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin-top: 6px; }
.hx-level { border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 8px 8px; }
.hx-head { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12.5px; cursor: pointer; border-radius: 4px; padding: 1px 4px; margin-left: -4px; }
.hx-head small { font-weight: 400; color: var(--ink-faint); }
.hx-plants { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
.hx-plant { font-size: 11px; line-height: 16px; border: 1px solid var(--border); border-radius: 9px; padding: 0 7px; cursor: pointer; user-select: none; }
.hx.on { background: color-mix(in srgb, var(--accent) 22%, transparent); border-color: var(--accent); }
.hx-plant.on { font-weight: 700; }
.hx.also { border-style: dashed; border-color: var(--accent); }
.hx-note { font-size: 12px; color: var(--ink-faint); margin: 4px 0; }
```

- [ ] **Step 4: Render it.** Add before `function renderNodeDetail` in `public/index.html`:

```js
// An experiment's structure: its variables and its plants in a box per factor and level (a plant is
// listed under every factor it belongs to). The .hx elements are picked/opened by the pipeline in
// setupSelection; `on` = picked from this box, `also` = picked, but from another box.
function structureHtml(st) {
  const e = escapeHtml;
  const hx = (kind, it, extra, cls = "") => {
    const picked = selection.get(it.id);
    const state = kind === "plant"
      ? (picked ? ((picked.vias ?? [""]).includes(extra.via) ? " on" : " also") : "")
      : (picked ? " on" : "");
    const data = Object.entries(extra).map(([k, v]) => ` data-${k}="${e(v)}"`).join("");
    return `<span class="hx ${cls}${state}" data-hx="${kind}" data-id="${e(it.id)}" data-label="${e(it.label)}"${data}>`;
  };
  const plants = (list, via, fac) => list.length
    ? `<div class="hx-plants">${list.map(p => `${hx("plant", p, { via, fac }, "hx-plant")}${e(p.label)}</span>`).join("")}</div>`
    : `<div class="hx-note">no plants</div>`;
  let h = "";
  if (st.variables.length) {
    h += `<div class="rel-group"><div class="rel-label">Variables measured</div><div class="chip-row">`
      + st.variables.map(v => chipHtml({ id: v.id, type: "variable", label: v.label, count: v.count.toLocaleString("en") })).join("") + `</div></div>`;
  }
  h += `<div class="rel-group"><div class="rel-label">Scientific objects — by factor</div>`;
  if (st.truncated) h += `<div class="hx-note">PHIS returned only the first 500 objects, so some are missing here.</div>`;
  st.factors.forEach(f => {
    h += `<div class="hx-fac" data-fac="${e(f.id)}">${hx("factor", { id: f.id, label: f.label }, { fac: f.id }, "hx-head")}${e(f.label)} <small>${f.levels.length} level${f.levels.length === 1 ? "" : "s"}</small></span><div class="hx-levels">`;
    f.levels.forEach(l => {
      h += `<div class="hx-level" data-level="${e(l.id)}">${hx("level", l, { fac: f.id, factor: f.id }, "hx-head")}${e(l.label.replace(/^[^:]*:\s*/, "Level "))} <small>${l.plants.length} plants</small></span>${plants(l.plants, l.id, f.id)}</div>`;
    });
    if (f.unset.length) h += `<div class="hx-level"><div class="hx-head" style="cursor:default">(unset) <small>${f.unset.length} without a level here</small></div>${plants(f.unset, `${f.id}#unset`, f.id)}</div>`;
    h += `</div></div>`;
  });
  if (st.other.length) h += `<div class="hx-fac" data-fac="#other"><div class="hx-head" style="cursor:default">Not in a factor <small>${st.other.length}</small></div>${plants(st.other, "#other", "#other")}</div>`;
  return h + `</div>`;
}
```

In `renderNodeDetail`, replace the normal-branch line
`node.relations.forEach(rel => { html += relGroupHtml(rel, { withMeasurements: type === "scientific_object" }); });`
with:

```js
      if (node.structure) html += structureHtml(node.structure);
      node.relations.forEach(rel => {
        if (node.structure && rel.field === "scientific_object") return; // shown as boxes above (unlink mode keeps the flat list)
        html += relGroupHtml(rel, { withMeasurements: type === "scientific_object" });
      });
```

- [ ] **Step 5: Run to verify it passes**, then `npm test` (all green).

- [ ] **Step 6: Screenshot check** — `node --experimental-strip-types --env-file=.env --test` is not needed; instead start `npm run dev`, open http://localhost:4000, browse Trials › Experiments › PBar1x4 and look at the boxes in light and dark mode (use the OS theme). Fix spacing if the plant chips overflow.

- [ ] **Step 7: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): experiment page shows its variables and its plants in a box per factor level" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Click rules on the boxes — open, ctrl, shift, drag

**Files:**
- Modify: `public/index.html` (the `setupSelection` IIFE near line 3148; new helpers right after `toggleChipSelection` near line 2059)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: the `.hx` DOM contract from Task 2; `selection` (Map id -> item), `anchorId`, `refreshLeftPane()`, `renderDetail()`, `renderActionbar()`, `openRelatedNode(item)`.
- Produces:
  - `hxItem(el): {id, type, label, factor?}` — the selectable item behind an `.hx` element (plants `scientific_object`, levels `factor_level` with `factor`, factors `factor`).
  - `togglePlantVia(item, via)` — adds/removes one instance of a plant (see below).
  - `hxPick(el, mod)` — `mod` is `"ctrl"` or `"shift"`.
  - `hxSweep(fromEl, hits, mod)` — marquee result.
  - A plant item in `selection` is `{id, type:"scientific_object", label, vias?: string[]}`; `vias` is absent for a plant picked from a list (one standalone instance, written `""`).

- [ ] **Step 1: Write the failing e2e test** — append:

```ts
test("e2e: in the factor boxes plain click opens, ctrl toggles (remembering the box), shift ranges within one factor, drag sweeps within one box", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base);
    const sel = () => page.evaluate(() => [...selection.values()].map((v: any) => [v.id, v.vias ?? null]));
    const g = page.locator('.hx-fac[data-fac="fac-g"]');

    await g.locator('.hx-plant[data-id="so-p1"]').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#selfChip").innerText(), /PB001/, "plain click opens the plant");
    assert.deepEqual(await sel(), [], "and selects nothing");
    await page.evaluate(() => openNode({ id: "exp-1", type: "experiment", label: "Trial" }));
    await page.waitForTimeout(400);

    await g.locator('.hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    assert.deepEqual(await sel(), [["so-p1", ["lv-g1"]]], "ctrl picks it, remembering the level box it was picked in");
    assert.equal(await page.locator('.hx-plant[data-id="so-p1"].on').count(), 1, "lit in that box");
    assert.equal(await page.locator('.hx-plant[data-id="so-p1"].also').count(), 1, "ringed in the other factor's box");
    await g.locator('.hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    assert.deepEqual(await sel(), [], "ctrl on the same copy again deselects");

    await g.locator('.hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    await g.locator('.hx-plant[data-id="so-p3"]').click({ modifiers: ["Shift"] });
    assert.deepEqual((await sel()).map((s) => s[0]), ["so-p1", "so-p2", "so-p3"], "shift ranges in reading order within the factor");
    await g.locator('.hx-head[data-id="lv-g2"]').click({ modifiers: ["Control"] });
    assert.ok((await sel()).some((s) => s[0] === "lv-g2"), "ctrl on a level header picks the level");
    await g.locator('.hx-head[data-id="fac-g"]').click({ modifiers: ["Control"] });
    assert.ok((await sel()).some((s) => s[0] === "fac-g"), "ctrl on a factor header picks the whole factor");

    await page.evaluate(() => { selection = new Map(); refreshLeftPane(); renderDetail(); renderActionbar(); });
    const r = page.locator('.hx-fac[data-fac="fac-r"]');
    const a = (await r.locator('.hx-plant[data-id="so-p1"]').boundingBox())!, b = (await r.locator('.hx-plant[data-id="so-p3"]').boundingBox())!;
    await page.mouse.move(a.x + 2, a.y + 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 2, b.y + b.height - 2, { steps: 6 });
    await page.mouse.up();
    assert.deepEqual(await sel(), [["so-p1", ["lv-r1"]], ["so-p2", ["lv-r1"]], ["so-p3", ["lv-r1"]]], "drag inside a box picks what it crosses, only in that factor");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="plain click opens, ctrl toggles" test/e2e.test.ts`
Expected: FAIL (clicking does nothing; the pipeline ignores `.hx`).

- [ ] **Step 3: Helpers** — insert after `toggleChipSelection` in `public/index.html`:

```js
// ---- picks inside an experiment's factor boxes (.hx) ----
// A plant picked from a box is remembered with that box (`vias`); one picked from a list has none (""),
// so "the same plant picked twice" is simply more than one instance.
const plantInstances = it => it.vias ?? [""];

function hxItem(el) {
  const d = el.dataset;
  if (d.hx === "plant") return { id: d.id, type: "scientific_object", label: d.label };
  if (d.hx === "level") return { id: d.id, type: "factor_level", label: d.label, factor: d.factor };
  return { id: d.id, type: "factor", label: d.label };
}

// Adds or removes ONE instance of a plant (the copy clicked in `via`'s box).
function togglePlantVia(item, via) {
  const cur = selection.get(item.id);
  if (!cur) { selection.set(item.id, { ...item, vias: [via] }); return; }
  const vias = plantInstances(cur);
  if (vias.includes(via)) {
    const left = vias.filter(v => v !== via);
    if (left.length) selection.set(item.id, { ...cur, vias: left }); else selection.delete(item.id);
  } else {
    selection.set(item.id, { ...cur, vias: [...vias, via] });
  }
}

function hxAfterPick() { refreshLeftPane(); renderDetail(); renderActionbar(); }

// ctrl toggles one thing; shift picks the range, in reading order, between the anchor and this one
// among things of the same kind in the same factor box (anything else falls back to ctrl).
let hxAnchor = null; // the .hx element last clicked, by data
function hxPick(el, mod) {
  const item = hxItem(el);
  const key = d => `${d.hx}|${d.fac}|${d.via ?? ""}|${d.id}`;
  if (mod === "shift" && hxAnchor && hxAnchor.hx === el.dataset.hx && hxAnchor.fac === el.dataset.fac) {
    const all = [...document.querySelectorAll(`.hx[data-hx="${el.dataset.hx}"][data-fac="${CSS.escape(el.dataset.fac)}"]`)];
    const i = all.findIndex(x => key(x.dataset) === hxAnchor.key), j = all.indexOf(el);
    if (i >= 0 && j >= 0) {
      selection = new Map();
      all.slice(Math.min(i, j), Math.max(i, j) + 1).forEach(x => {
        const it = hxItem(x);
        if (it.type === "scientific_object") togglePlantVia(it, x.dataset.via); else selection.set(it.id, it);
      });
      hxAfterPick();
      return;
    }
  }
  if (item.type === "scientific_object") togglePlantVia(item, el.dataset.via);
  else if (selection.has(item.id)) selection.delete(item.id); else selection.set(item.id, item);
  hxAnchor = { hx: el.dataset.hx, fac: el.dataset.fac, key: key(el.dataset) };
  anchorId = item.id;
  hxAfterPick();
}

// A drag that started inside one factor box: picks the plants it crossed (or, if it crossed none, the
// level/factor headers) in that box only. Without ctrl it replaces the selection.
function hxSweep(box, hits, mod) {
  const plants = hits.filter(x => x.dataset.hx === "plant");
  const chosen = plants.length ? plants : hits;
  if (!chosen.length) return;
  if (mod !== "ctrl") selection = new Map();
  chosen.forEach(x => {
    const it = hxItem(x);
    if (it.type === "scientific_object") { const cur = selection.get(it.id); if (!cur || !plantInstances(cur).includes(x.dataset.via)) togglePlantVia(it, x.dataset.via); }
    else selection.set(it.id, it);
  });
  const last = chosen[chosen.length - 1];
  hxAnchor = { hx: last.dataset.hx, fac: last.dataset.fac, key: `${last.dataset.hx}|${last.dataset.fac}|${last.dataset.via ?? ""}|${last.dataset.id}` };
  hxAfterPick();
}
```

- [ ] **Step 4: Pipeline branch** — in `setupSelection` (`public/index.html`):

1. Next to `let downInTree = false;` add `let downHx = null, downFac = null;`.
2. In the `mousedown` listener, after `downInTree = !!rowEl?.closest("#treeArea");` add:
   ```js
    downHx = e.target.closest(".hx");
    downFac = e.target.closest(".hx-fac");
   ```
3. In the `mouseup` listener, replace `if (downItem) applyClick(downItem, mod, downInTree ? treeOrder : rowOrder);` with:
   ```js
      if (downItem) applyClick(downItem, mod, downInTree ? treeOrder : rowOrder);
      else if (downHx) {
        if (mod === "plain") openRelatedNode(hxItem(downHx)); // plain click opens, like a chip
        else hxPick(downHx, mod);
      }
   ```
   and at the start of the `else if (box) {` branch (the marquee), before `const bx = ...`, insert:
   ```js
      if (downFac) {
        const rect = box.getBoundingClientRect();
        const hits = [...downFac.querySelectorAll(".hx")].filter(x => {
          const r = x.getBoundingClientRect();
          return r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom;
        });
        hxSweep(downFac, hits, mod);
        removeBox(); downItem = downHx = downFac = null;
        return;
      }
   ```
4. At the end of the listener, next to `downItem = null;` add `downHx = downFac = null;`.

Note `.hx-head` elements that are not `.hx` (the "(unset)" and "Not in a factor" headers) are not pickable and a click on them does nothing; `downFac` still starts a sweep from them, which is intended.

- [ ] **Step 5: Run to verify it passes**, then `npm test` (all green, including the unchanged list marquee tests).

- [ ] **Step 6: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): factor boxes — plain click opens, ctrl/shift/drag pick, plants remember their box" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: The same plant picked twice — graph-only selection

**Files:**
- Modify: `public/index.html` (`renderActionbar` near line 2848-2897; helpers next to the Task 3 ones)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: `plantInstances`, `togglePlantVia`, `selection`, `hxAfterPick`, `NODE_DETAIL`, `currentPane()`.
- Produces: `isGraphOnly(): boolean`, `pickCounts(): {picks, plants}`, `dropExtraPicks()`, `viaLabel(via): string`. In graph-only state the action bar shows only the explanation, "Remove extra picks" and "Clear" (plan 2 adds "Show chart grid").

- [ ] **Step 1: Write the failing e2e test** — append:

```ts
test("e2e: picking the same plant from two boxes makes the selection graph-only: the usual actions go, the way back is offered", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base);
    const g = page.locator('.hx-fac[data-fac="fac-g"]'), r = page.locator('.hx-fac[data-fac="fac-r"]');
    await g.locator('.hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    assert.ok(await page.locator("#linkSelectionBtn, #newBtn").count() > 0, "one pick: the usual actions");

    await r.locator('.hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    assert.equal(await page.evaluate(() => selection.size), 1, "still one plant");
    assert.deepEqual(await page.evaluate(() => selection.get("so-p1").vias), ["lv-g1", "lv-r1"], "two instances");
    const bar = page.locator("#actionbar");
    const text = await bar.innerText();
    assert.match(text, /2 picks/);
    assert.match(text, /1 plant/);
    assert.match(text, /PB001 is picked in GroupID: 1 and Replicate: 1/);
    assert.match(text, /only charts are available/i);
    assert.equal(await page.locator("#newBtn, #linkSelectionBtn, #visBtn").count(), 0, "no create/link/visibility in graph-only mode");

    await page.locator("#dropExtraBtn").click();
    assert.deepEqual(await page.evaluate(() => selection.get("so-p1").vias), ["lv-g1"], "extra picks dropped, the first kept");
    assert.ok(await page.locator("#newBtn").count() > 0, "the usual actions are back");
    assert.equal(await page.locator("#dropExtraBtn").count(), 0);
  });
});
```


- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="graph-only" test/e2e.test.ts`
Expected: FAIL (the usual bar stays; no `#dropExtraBtn`).

- [ ] **Step 3: Helpers** — add after `hxSweep`:

```js
// The selection is graph-only as soon as one plant is picked in more than one place (two boxes, or a
// list plus a box). Only charts make sense then: link/create/visibility would act on the same plant twice.
const isGraphOnly = () => [...selection.values()].some(v => v.type === "scientific_object" && plantInstances(v).length > 1);
function pickCounts() {
  let picks = 0, plants = 0;
  selection.forEach(v => { if (v.type === "scientific_object") { plants++; picks += plantInstances(v).length; } else picks++; });
  return { picks, plants };
}
function viaLabel(via) {
  if (via === "") return "the list";
  if (via === "#other") return "Not in a factor";
  const st = NODE_DETAIL[currentPane()?.id]?.structure;
  const level = st?.factors.flatMap(f => f.levels).find(l => l.id === via);
  if (level) return level.label;
  const unset = st?.factors.find(f => via === `${f.id}#unset`);
  return unset ? `${unset.label} (unset)` : via;
}
function dropExtraPicks() {
  selection.forEach((v, id) => {
    if (v.type === "scientific_object" && plantInstances(v).length > 1) {
      const first = plantInstances(v)[0];
      selection.set(id, first === "" ? (({ vias, ...rest }) => rest)(v) : { ...v, vias: [first] });
    }
  });
  hxAfterPick();
}
```

- [ ] **Step 4: The bar** — in `renderActionbar`, immediately after the `if (selection.size === 0) { ... return; }` block (the one ending before `bar.className = "actionbar";` near line 2897) insert:

```js
  if (isGraphOnly()) {
    const { picks, plants } = pickCounts();
    const twice = [...selection.values()].filter(v => v.type === "scientific_object" && plantInstances(v).length > 1);
    const where = v => andList(plantInstances(v).map(viaLabel));
    bar.className = "actionbar";
    bar.innerHTML = `
      <div class="selection-summary sel-count-summary">Selected <b>${picks}</b> picks · <b>${plants}</b> ${plants === 1 ? "plant" : "plants"}
        <span class="selection-names">${twice.map(v => `${escapeHtml(v.label)} is picked in ${escapeHtml(where(v))}`).join("; ")}</span></div>
      <div class="selection-summary link-why">Only charts are available while a plant is picked twice. Remove the extra picks to get the usual actions back.</div>
      <button class="btn primary" id="dropExtraBtn">Remove extra picks</button>
      <button class="btn ghost" id="clearSel">Clear</button>
    `;
    document.getElementById("dropExtraBtn").addEventListener("click", dropExtraPicks);
    document.getElementById("clearSel").addEventListener("click", () => { selection = new Map(); anchorId = null; hxAnchor = null; hxAfterPick(); });
    return;
  }
```

- [ ] **Step 5: Run to verify it passes**, then `npm test` (all green).

- [ ] **Step 6: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): a plant picked from two boxes makes the selection graph-only, with a way back" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Real-data check and wrap-up

**Files:** none new (fixes only if the check finds something).

- [ ] **Step 1: Run the whole suite.** `npm test` from `graph-explorer/`. Expected: all pass (210 + the 5 new tests = 215).
- [ ] **Step 2: Look at it on phis-test.** Start `npm run dev`, open http://localhost:4000, Trials › Experiments › PBar1x4. Check, and fix if wrong: Variables group (21 chips with counts, summing sensibly); GroupID box with 10 level boxes of 10 plants, Replicate box with 5 level boxes of 20; "Not in a factor" with the trays; ctrl-click a plant in GroupID and again in Replicate gives the graph-only bar naming "GroupID: n and Replicate: m"; "Remove extra picks" brings the usual bar back; plain click opens the plant (its page shows the measurement lines from before); light and dark mode.
- [ ] **Step 3: Check unlink mode still works on an experiment** (open an experiment, Unlink…): the flat "Scientific objects" list with × is still there, because unlink mode renders relations only.
- [ ] **Step 4: Update the memory pointer** (`project_next_traitfinder_demo.md`): plan 1 done, spec and plan paths, plan 2 next.
- [ ] **Step 5: Report** what was verified and what was not (nothing deployed; live site still on the 2026-10-02 build).

## Self-review

- **Spec coverage (plan 1 scope):** spec 1 — variables group with counts (T1, T2), factor boxes with duplicated plants (T1, T2), "Not in a factor" and "(unset)" (T1, T2), plain/ctrl/shift/drag rules (T3); spec 2 — `via` per pick, graph-only on a second instance, reason + way out, "N picks · M plants", "also picked" ring, other actions never see duplicates (T3, T4). Deferred to plan 2 (named in the spec): collapsing big boxes, the "How charts work" note, Chart overview button, the route, statistics, grid, dialog, pager, mixed-selection arrangement, colours.
- **Placeholder scan:** none; every code step has code. One conditional note in T4 (actionbar element id) is a lookup instruction, not a gap.
- **Type consistency:** `Structure`, `.hx` data attributes (`hx`, `id`, `label`, `fac`, `via`, `factor`), `plantInstances`, `togglePlantVia`, `hxPick`, `hxSweep`, `hxAfterPick`, `isGraphOnly`, `dropExtraPicks`, `viaLabel` are used with the same names across tasks.

# Experiment page tabs and Overview — Implementation Plan (plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The experiment page stops being a wall: it gets tabs (Overview, Variables, Plants, Factors, Species) with counts; the Overview holds only what stays small (count cards, the other connections, the factors with their levels and "Pick plants ›" buttons); the Plants tab groups plants by one factor at a time with a filter; the Variables tab is a filterable list.

**Architecture:** Pure front-end rework in `public/index.html`, driven by the `structure` that plan 1 already sends. Tab, group-by and filter state live in small per-node maps (`detailTab`, `plantsView`) that survive re-renders; the plan-1 pick rules (`.hx` elements, `vias`, graph-only) are untouched and only re-homed into the Plants tab. No server change.

**Tech Stack:** as plan 1 (single `public/index.html`, Playwright e2e).

**Spec:** `docs/superpowers/specs/2026-10-06-experiment-chart-grid-design.md`, section 1 ("Experiment page (tabs)"). Plan 3 (overview route, statistics, chart grid and dialog, the Overview's chart builder, "how charts work" note, colours) follows. The Overview here has no chart builder or quick looks yet: a button with nothing behind it would be a dead end.

## Global Constraints

- No new dependencies, no build step, no server change; relative fetches only; names from PHIS go through `escapeHtml`.
- Selection stays global and unchanged: switching tabs never clears it; plain click opens, ctrl/shift/drag pick (plan 1 rules).
- Tabs apply to a node page only when it has `node.structure` (experiments). The spec's general "tabs on any long page" rule is deferred and recorded as a ruling: only experiments have the problem today and a generic rule needs its own design pass.
- Unlink mode (`unlinkTargetId`) keeps the old flat relation lists, no tabs.
- Tests: `npm test` from `graph-explorer/` (219 at the start). Single test: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="<name>" test/e2e.test.ts`. Edit test files with the Edit tool or scripts that keep each line's `\r`.
- Commit each task on `graph-explorer/project`, push, end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- An experiment with no factors: Plants tab shows one "Not in a factor" box and no group-by pills except "None"; Overview shows no Factors section; nothing throws.
- An experiment with no variables or no species: those tabs show "None." and their counts read 0.
- A filter that matches nothing: "No plant matches" instead of an empty page; clearing it restores everything.
- Typing in a filter must not lose the typed text or the focus when the page re-renders (a pick re-renders the pane).
- Selection made on the Plants tab is still selected after switching to another tab and back, and the action bar keeps showing it.
- Two experiments opened one after the other keep separate tab / group-by / filter state (keyed by node id).

## File structure

| File | Responsibility |
|---|---|
| `public/index.html` | tab state and rendering (`tabbedExperimentHtml`, `overviewHtml`, `variablesTabHtml`, `plantsTabHtml`), CSS, wiring in `renderNodeDetail` |
| `test/e2e.test.ts` | the plan-1 experiment tests moved onto the Plants tab; new tab tests |

---

### Task 1: Tab shell — Overview, Variables, Plants, Factors, Species

**Files:**
- Modify: `public/index.html` (CSS near the plan-1 `.hx-*` rules; `structureHtml` near line 1760 split up; the normal branch of `renderNodeDetail`; wiring after `els.detailBody.innerHTML = html`)
- Modify: `test/e2e.test.ts` (plan-1 tests that read the experiment page; helper `openStructuredExperiment`)

**Interfaces:**
- Consumes: `NODE_DETAIL[id].structure` and `.relations` (plan 1), `chipHtml(it)`, `relGroupHtml(rel)`, `escapeHtml`, `selection`.
- Produces:
  - `const detailTab = {}` — node id -> `"overview" | "variables" | "plants" | "factors" | "species"` (absent = overview).
  - `tabbedExperimentHtml(id, node): string`, `overviewHtml(node)`, `variablesTabHtml(st)`, `plantsTabHtml(id, st)` (in this task: exactly plan 1's boxes), `plantIdsOf(st): Set<string>`.
  - DOM: tab buttons `button.dtab[data-dtab="<name>"]` (active one has class `on`), cards `.ov-card`.

- [ ] **Step 1: Update the helper and write the failing tests.** In `test/e2e.test.ts` change `openStructuredExperiment` to take a tab (default `"plants"`) and click it after opening:

```ts
async function openStructuredExperiment(page: import("playwright").Page, base: string, tab: string | null = "plants") {
  // ...existing body unchanged (route mock, goto, openNode, wait)...
  if (tab) { await page.locator(`button.dtab[data-dtab="${tab}"]`).click(); await page.waitForTimeout(200); }
}
```

Replace the plan-1 test "an experiment's page lists its variables with counts and its plants in a box per factor and level; trays sit under 'Not in a factor'" by two tests:

```ts
test("e2e: an experiment's page has tabs with counts; the Overview holds cards and the other connections, not the long lists", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base, null);
    const tabs = (await page.locator("button.dtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    assert.deepEqual(tabs, ["Overview", "Variables 1", "Plants 4", "Factors 2", "Species 0"], "counts in the labels (4 = 3 plants + 1 tray)");
    assert.equal(await page.locator("button.dtab.on").innerText(), "Overview", "the Overview opens first");
    const ov = (await page.locator("#detailBody").innerText()).replace(/\s+/g, " ");
    assert.match(ov, /1,200\s*values/);
    assert.equal(await page.locator("#detailBody .hx-plant").count(), 0, "no plant list on the Overview");
    assert.equal(await page.locator("#detailBody .hx-fac").count(), 0);
  });
});

test("e2e: the Variables tab lists variables with counts; Plants has a box per factor and level, trays under 'Not in a factor'; tabs keep the selection", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base, "variables");
    const body = page.locator("#detailBody");
    assert.match(await body.locator(".rel-group", { hasText: "Variables measured" }).innerText(), /Plant Height\s*·\s*1,200/);
    await page.locator('button.dtab[data-dtab="plants"]').click();
    assert.equal(await body.locator(".hx-fac").count(), 3, "two factors and 'Not in a factor'");
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"] .hx-level').count(), 2);
    assert.equal(await body.locator('.hx-plant[data-id="so-p1"]').count(), 2, "a plant is listed under every factor it belongs to");
    assert.match(await body.locator('.hx-fac[data-fac="#other"]').innerText(), /Tray 31/);
    await body.locator('.hx-fac[data-fac="fac-g"] .hx-plant[data-id="so-p1"]').click({ modifiers: ["Control"] });
    await page.locator('button.dtab[data-dtab="factors"]').click();
    await page.locator('button.dtab[data-dtab="plants"]').click();
    assert.equal(await body.locator('.hx-plant[data-id="so-p1"].on').count(), 1, "the pick is still there after leaving and coming back");
  });
});
```

(The plan-1 tests for click rules and graph-only already call `openStructuredExperiment(page, base)`, so they now open the Plants tab through the helper.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="has tabs with counts|Variables tab lists" test/e2e.test.ts`
Expected: FAIL (`button.dtab` not found).

- [ ] **Step 3: CSS** — add after the `.hx-note` rule:

```css
.dtabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--border); margin: 10px 0 12px; }
.dtab { border: none; background: none; color: var(--ink-muted); font: inherit; font-size: 12.5px; padding: 6px 10px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.dtab small { color: var(--ink-faint); margin-left: 3px; }
.dtab:hover { color: var(--ink); }
.dtab.on { color: var(--ink); font-weight: 600; border-bottom-color: var(--accent); }
.ov-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 8px; }
.ov-card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 7px 10px; }
.ov-card b { display: block; font-size: 17px; font-weight: 600; }
.ov-card span { font-size: 11.5px; color: var(--ink-faint); }
```

- [ ] **Step 4: Render the tabs.** In `public/index.html`:

1. Split plan 1's `structureHtml(st)`: keep the `hx` helper and the `plants` helper at the top of the function but move them to file level as `hxHtml(kind, it, extra, cls)` and `hxPlants(list, via, fac)` (same bodies, taking nothing from the old closure except `selection`/`escapeHtml`). Then:
   - `variablesTabHtml(st)` = the "Variables measured" `.rel-group` block (or `<div class="rel-group"><div class="rel-label">Variables measured</div><span class="rel-empty">None.</span></div>`).
   - `plantsTabHtml(id, st)` = the "Scientific objects — by factor" `.rel-group` block exactly as plan 1 built it (truncation note, factor boxes, unset, Not in a factor).
   - Delete the old `structureHtml`.
2. Add:

```js
// An experiment's page: tabs, so nothing long sits on the first screen. `detailTab` (node id -> tab) survives re-renders.
const detailTab = {};
const plantIdsOf = st => new Set(st.factors.flatMap(f => f.levels.flatMap(l => l.plants.map(p => p.id))));

function overviewHtml(node) {
  const st = node.structure, e = escapeHtml;
  const values = st.variables.reduce((n, v) => n + v.count, 0);
  const inFactors = plantIdsOf(st).size;
  let h = \`<div class="ov-cards">
    <div class="ov-card"><b>\${st.variables.length}</b><span>variables · \${values.toLocaleString("en")} values</span></div>
    <div class="ov-card"><b>\${inFactors + st.other.length}</b><span>scientific objects · \${inFactors} in a factor</span></div>
    <div class="ov-card"><b>\${st.factors.length}</b><span>factor\${st.factors.length === 1 ? "" : "s"}</span></div></div>\`;
  node.relations.forEach(rel => {
    if (["Scientific objects", "Factors", "Species"].includes(rel.label)) return; // their own tabs
    h += relGroupHtml(rel);
  });
  return h;
}

function tabbedExperimentHtml(id, node) {
  const st = node.structure;
  const rel = label => node.relations.find(r => r.label === label);
  const tabs = [
    ["overview", "Overview", null],
    ["variables", "Variables", st.variables.length],
    ["plants", "Plants", plantIdsOf(st).size + st.other.length],
    ["factors", "Factors", st.factors.length],
    ["species", "Species", rel("Species")?.items.length ?? 0],
  ];
  const active = tabs.some(t => t[0] === detailTab[id]) ? detailTab[id] : "overview";
  const none = label => \`<div class="rel-group"><div class="rel-label">\${label}</div><span class="rel-empty">None.</span></div>\`;
  const body = {
    overview: () => overviewHtml(node),
    variables: () => variablesTabHtml(st),
    plants: () => plantsTabHtml(id, st),
    factors: () => rel("Factors") ? relGroupHtml(rel("Factors")) : none("Factors"),
    species: () => rel("Species") ? relGroupHtml(rel("Species")) : none("Species"),
  }[active]();
  return \`<div class="dtabs">\${tabs.map(([k, label, n]) => \`<button class="dtab\${k === active ? " on" : ""}" data-dtab="\${k}">\${label}\${n == null ? "" : \` <small>\${n}</small>\`}</button>\`).join("")}</div>\${body}\`;
}
```

3. In `renderNodeDetail`'s normal branch replace the plan-1 block
   `if (node.structure) html += structureHtml(node.structure); node.relations.forEach(...)` with:

```js
      if (node.structure) html += tabbedExperimentHtml(focusNode.id, node);
      else node.relations.forEach(rel => { html += relGroupHtml(rel, { withMeasurements: type === "scientific_object" }); });
```

4. After `els.detailBody.innerHTML = html;` (next to `wireTypeInfo`) add:

```js
  els.detailBody.querySelectorAll("[data-dtab]").forEach(b => b.addEventListener("click", () => { detailTab[focusNode.id] = b.dataset.dtab; renderDetail(); }));
```

- [ ] **Step 5: Run to verify they pass**, then the whole suite (`npm test`): the plan-1 click-rule and graph-only tests must still pass through the helper's Plants tab.

- [ ] **Step 6: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): experiment page gets tabs; the Overview holds cards and connections, the long lists have their own tabs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Plants tab — one factor at a time, with a filter; Variables filter

**Files:**
- Modify: `public/index.html` (`plantsTabHtml`, `variablesTabHtml`, CSS, wiring)
- Test: `test/e2e.test.ts` (append; adjust the two plan-1 tests that picked the same plant in two factors)

**Interfaces:**
- Consumes: Task 1's `plantsTabHtml(id, st)`, `variablesTabHtml(st)`, `hxHtml`, `hxPlants`.
- Produces: `const plantsView = {}` — node id -> `{by: factorId | "none", q: string}`; `plantsBodyHtml(id, st): string` (the part below the controls); `variablesBodyHtml(st, q)`; `const varFilter = {}` — node id -> string. DOM: `button.pill[data-by]` (active has `on`), `input.tab-filter[data-filter="plants"|"variables"]`, `#plantsBody`, `#variablesBody`. "None (A–Z)" uses `via = "#all"`, `fac = "#all"`.

- [ ] **Step 1: Write the failing tests** — append, and update the plan-1 graph-only/click tests: where they click a plant in `.hx-fac[data-fac="fac-r"]` while `fac-g` is shown, first switch Group by (`await page.locator('button.pill[data-by="fac-r"]').click()`), pick, switch back as needed. Group by defaults to the first factor (`fac-g`).

```ts
test("e2e: Plants tab shows one factor at a time (switchable, or None A–Z) and filters by name; the filter keeps its text across a pick", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base);
    const body = page.locator("#detailBody");
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"]').count(), 1, "the first factor is shown");
    assert.equal(await body.locator('.hx-fac[data-fac="fac-r"]').count(), 0, "not both at once");
    assert.equal(await body.locator('.hx-fac[data-fac="#other"]').count(), 1, "'Not in a factor' stays");

    await body.locator('button.pill[data-by="fac-r"]').click();
    assert.equal(await body.locator('.hx-fac[data-fac="fac-r"] .hx-level').count(), 1);
    await body.locator('button.pill[data-by="none"]').click();
    assert.deepEqual(await body.locator('.hx-fac[data-fac="#all"] .hx-plant').allInnerTexts(), ["PB001", "PB002", "PB003"], "None = every plant A–Z");

    const filter = body.locator('input[data-filter="plants"]');
    await filter.fill("pb002");
    assert.deepEqual(await body.locator(".hx-plant").allInnerTexts(), ["PB002"], "filtered by name");
    await body.locator("button.pill[data-by=\"fac-g\"]").click();
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"] .hx-level').count(), 1, "levels with no match are hidden");
    await body.locator(".hx-plant", { hasText: "PB002" }).first().click({ modifiers: ["Control"] });
    assert.equal(await body.locator('input[data-filter="plants"]').inputValue(), "pb002", "typed text survives the re-render a pick causes");
    await body.locator('input[data-filter="plants"]').fill("zzz");
    assert.match(await body.locator("#plantsBody").innerText(), /No plant matches/);
    await body.locator('input[data-filter="plants"]').fill("");
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"] .hx-plant').count(), 3, "clearing the filter restores everything");
  });
});

test("e2e: the Variables tab filters by name", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base, "variables");
    const body = page.locator("#detailBody");
    await body.locator('input[data-filter="variables"]').fill("zzz");
    assert.match(await body.locator("#variablesBody").innerText(), /No variable matches/);
    await body.locator('input[data-filter="variables"]').fill("height");
    assert.equal(await body.locator("#variablesBody .chip").count(), 1);
  });
});
```


- [ ] **Step 2: Run to verify they fail**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="one factor at a time|Variables tab filters" test/e2e.test.ts`
Expected: FAIL (no `button.pill[data-by]` / filter inputs).

- [ ] **Step 3: CSS**

```css
.tab-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; font-size: 12px; }
.tab-controls .k { color: var(--ink-faint); }
.tab-controls .pill { border: 1px solid var(--border); background: var(--surface); color: var(--ink); border-radius: 12px; padding: 2px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.tab-controls .pill.on { background: color-mix(in srgb, var(--accent) 22%, transparent); border-color: var(--accent); font-weight: 600; }
.tab-filter { flex: 1; min-width: 140px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--ink); padding: 2px 10px; font: inherit; font-size: 12px; }
```

- [ ] **Step 4: Implement.**

```js
// Per node (by id): which factor the Plants tab groups by ("none" = A–Z) and what is typed in its filter.
const plantsView = {}, varFilter = {};
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function plantsBodyHtml(id, st) {
  const view = plantsView[id], q = view.q.trim().toLowerCase();
  const hit = p => !q || p.label.toLowerCase().includes(q);
  const note = st.truncated ? `<div class="hx-note">PHIS returned only the first 500 objects of a list, so some plants are missing or sit in the wrong box here.</div>` : "";
  let h = note, any = false;
  const f = st.factors.find(x => x.id === view.by);
  if (f) {
    h += `<div class="hx-fac" data-fac="${escapeHtml(f.id)}">${hxHtml("factor", { id: f.id, label: f.label }, { fac: f.id }, "hx-head")}${escapeHtml(f.label)} <small>${f.levels.length} level${f.levels.length === 1 ? "" : "s"}</small></span><div class="hx-levels">`;
    f.levels.forEach(l => {
      const shown = l.plants.filter(hit);
      if (q && !shown.length) return;
      any = any || shown.length > 0;
      h += `<div class="hx-level" data-level="${escapeHtml(l.id)}">${hxHtml("level", l, { fac: f.id, factor: f.id }, "hx-head")}${escapeHtml(l.label.replace(/^[^:]*:\s*/, "Level "))} <small>${q ? `${shown.length} of ${l.plants.length}` : l.plants.length} plants</small></span>${hxPlants(shown, l.id, f.id)}</div>`;
    });
    const unset = f.unset.filter(hit);
    if (unset.length) { any = true; h += `<div class="hx-level"><div class="hx-head" style="cursor:default">(unset) <small>${unset.length} without a level here</small></div>${hxPlants(unset, `${f.id}#unset`, f.id)}</div>`; }
    h += `</div></div>`;
  } else {
    const all = [...new Map([...st.factors.flatMap(x => x.levels.flatMap(l => l.plants)), ...st.factors.flatMap(x => x.unset)].map(p => [p.id, p])).values()].sort((a, b) => natural(a.label, b.label)).filter(hit);
    if (all.length) { any = true; h += `<div class="hx-fac" data-fac="#all"><div class="hx-head" style="cursor:default">All plants <small>${all.length}</small></div>${hxPlants(all, "#all", "#all")}</div>`; }
  }
  const other = st.other.filter(hit);
  if (other.length) { any = true; h += `<div class="hx-fac" data-fac="#other"><div class="hx-head" style="cursor:default">Not in a factor <small>${other.length}</small></div>${hxPlants(other, "#other", "#other")}</div>`; }
  return h + (any ? "" : `<div class="hx-note">No plant matches "${escapeHtml(view.q)}".</div>`);
}

function plantsTabHtml(id, st) {
  plantsView[id] ??= { by: st.factors[0]?.id ?? "none", q: "" };
  const view = plantsView[id];
  if (view.by !== "none" && !st.factors.some(f => f.id === view.by)) view.by = st.factors[0]?.id ?? "none";
  const pill = (by, label) => `<button class="pill${view.by === by ? " on" : ""}" data-by="${escapeHtml(by)}">${escapeHtml(label)}</button>`;
  return `<div class="rel-group"><div class="rel-label">Scientific objects</div>
    <div class="tab-controls"><span class="k">Group by</span>${st.factors.map(f => pill(f.id, f.label)).join("")}${pill("none", "None (A–Z)")}
      <input class="tab-filter" data-filter="plants" placeholder="Filter plants…" value="${escapeHtml(view.q)}"></div>
    <div id="plantsBody">${plantsBodyHtml(id, st)}</div></div>`;
}

function variablesBodyHtml(st, q) {
  const text = q.trim().toLowerCase();
  const list = st.variables.filter(v => !text || v.label.toLowerCase().includes(text));
  return list.length
    ? `<div class="chip-row">${list.map(v => chipHtml({ id: v.id, type: "variable", label: v.label, count: v.count.toLocaleString("en") })).join("")}</div>`
    : `<span class="rel-empty">${st.variables.length ? `No variable matches "${escapeHtml(q)}".` : "None."}</span>`;
}
function variablesTabHtml(id, st) {
  const q = varFilter[id] ?? "";
  return `<div class="rel-group"><div class="rel-label">Variables measured</div>
    <div class="tab-controls"><input class="tab-filter" data-filter="variables" placeholder="Filter variables…" value="${escapeHtml(q)}"></div>
    <div id="variablesBody">${variablesBodyHtml(st, q)}</div></div>`;
}
```

Change the Task 1 call `variablesTabHtml(st)` in `tabbedExperimentHtml` to `variablesTabHtml(id, st)`. Wiring (after the `data-dtab` wiring in `renderNodeDetail`):

```js
  els.detailBody.querySelectorAll("[data-by]").forEach(b => b.addEventListener("click", () => { plantsView[focusNode.id].by = b.dataset.by; renderDetail(); }));
  els.detailBody.querySelectorAll("input[data-filter]").forEach(inp => inp.addEventListener("input", () => {
    const st = NODE_DETAIL[focusNode.id].structure;
    if (inp.dataset.filter === "plants") { plantsView[focusNode.id].q = inp.value; document.getElementById("plantsBody").innerHTML = plantsBodyHtml(focusNode.id, st); }
    else { varFilter[focusNode.id] = inp.value; document.getElementById("variablesBody").innerHTML = variablesBodyHtml(st, inp.value); }
  }));
```

Then, so the chips in `#variablesBody` keep working after a filter re-render, move the chip-click wiring into a function: change the final `els.detailBody.querySelectorAll(".chip[data-openid]").forEach(chip => chip.addEventListener("click", (e) => onChipClick(chip, e)));` to a helper `wireChips(root)` that `renderNodeDetail` calls once and the variables filter calls again on `#variablesBody` after replacing it (`wireChips(document.getElementById("variablesBody"))`). (`.hx` elements need no re-wiring: the document-level pipeline handles them.)

- [ ] **Step 5: Run to verify they pass**, then `npm test` (all green; the plan-1 tests adjusted in Step 1 included).
- [ ] **Step 6: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): Plants tab shows one factor at a time with a filter; Variables tab filters" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Overview factors and the "Pick plants ›" buttons

**Files:**
- Modify: `public/index.html` (`overviewHtml`, `plantsTabHtml`, CSS, wiring; the "scroll to level" step after render)
- Test: `test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1-2 (`plantsView`, `detailTab`, `renderDetail`).
- Produces: in the Overview a `.ov-fac[data-fac]` card per factor with level chips (selectable `.chip`, type `factor_level`, `data-factor`) and buttons `button.go-plants[data-by][data-level?]`; `let plantsFocus = null` (a level id to scroll to after the next render); on the Plants tab a `button[data-dtab="overview"]` "‹ Overview".

- [ ] **Step 1: Write the failing test** — append:

```ts
test("e2e: the Overview lists factors with their levels; 'Pick plants ›' jumps to the Plants tab grouped by that factor, and a level's › to that level; ‹ Overview goes back", async () => {
  await withServerAndBrowser(async (base, page) => {
    await openStructuredExperiment(page, base, null);
    const body = page.locator("#detailBody");
    assert.equal(await body.locator(".ov-fac").count(), 2);
    assert.equal(await body.locator('.ov-fac[data-fac="fac-g"] .chip').count(), 2, "a chip per level");

    await body.locator('.ov-fac[data-fac="fac-g"] .chip', { hasText: "GroupID: 2" }).click({ modifiers: ["Control"] });
    assert.deepEqual(await page.evaluate(() => [...selection.keys()]), ["lv-g2"], "a level chip picks the level, like any chip");

    await body.locator('.ov-fac[data-fac="fac-r"] button.go-plants:not([data-level])').click();
    assert.equal(await page.locator("button.dtab.on").innerText().then((t) => t.replace(/\s+\d+$/, "")), "Plants");
    assert.equal(await body.locator('.hx-fac[data-fac="fac-r"]').count(), 1, "grouped by the factor whose button was pressed");
    assert.deepEqual(await page.evaluate(() => [...selection.keys()]), ["lv-g2"], "the selection survived the jump");

    await body.locator('button[data-dtab="overview"]').click();
    await body.locator('.ov-fac[data-fac="fac-g"] button.go-plants[data-level="lv-g2"]').click();
    assert.equal(await body.locator('.hx-fac[data-fac="fac-g"]').count(), 1);
    assert.equal(await body.locator('.hx-level[data-level="lv-g2"].flash').count(), 1, "the level's box is highlighted");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --env-file=.env --test --test-name-pattern="Pick plants" test/e2e.test.ts`
Expected: FAIL (no `.ov-fac`).

- [ ] **Step 3: CSS**

```css
.ov-fac { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 7px 10px 8px; margin-bottom: 6px; }
.ov-fac-head { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin-bottom: 4px; }
.ov-fac-head small { color: var(--ink-faint); }
.go-plants { border: 1px solid var(--border); background: none; color: var(--ink-muted); border-radius: 10px; font: inherit; font-size: 11.5px; padding: 0 8px; cursor: pointer; }
.go-plants:hover { color: var(--ink); border-color: var(--accent); }
.go-level { margin-left: -2px; margin-right: 6px; padding: 0 6px; }
.flash { animation: hxflash 1.6s ease-out; }
@keyframes hxflash { 0% { box-shadow: 0 0 0 3px var(--accent); } 100% { box-shadow: 0 0 0 3px transparent; } }
```

- [ ] **Step 4: Implement.** In `overviewHtml(node)` add, after the cards and before the connection groups:

```js
  if (st.factors.length) {
    h += `<div class="rel-group"><div class="rel-label">Factors</div>` + st.factors.map(f => `<div class="ov-fac" data-fac="${e(f.id)}">
      <div class="ov-fac-head"><b>${e(f.label)}</b><small>${f.levels.length} level${f.levels.length === 1 ? "" : "s"}</small>
        <button class="go-plants" data-by="${e(f.id)}" title="Pick plants grouped by ${e(f.label)}">Pick plants ›</button></div>
      <div class="chip-row">${f.levels.map(l => chipHtml({ id: l.id, type: "factor_level", label: l.label, factor: f.id, count: l.plants.length })
        + `<button class="go-plants go-level" data-by="${e(f.id)}" data-level="${e(l.id)}" title="Pick plants in ${e(l.label)}">›</button>`).join("")}</div></div>`).join("") + `</div>`;
  }
```

At the top of `plantsTabHtml` output (inside the `.rel-group`, before `.tab-controls`) add `<div class="tab-controls"><button class="go-plants" data-dtab="overview">‹ Overview</button></div>`. Add state and wiring:

```js
let plantsFocus = null; // a level to scroll to and flash once, after the next render
```

In `renderNodeDetail` after the other wiring:

```js
  els.detailBody.querySelectorAll("button.go-plants[data-by]").forEach(b => b.addEventListener("click", () => {
    plantsView[focusNode.id] = { by: b.dataset.by, q: "" };
    detailTab[focusNode.id] = "plants";
    plantsFocus = b.dataset.level ?? null;
    renderDetail();
  }));
  if (plantsFocus) {
    const box = [...els.detailBody.querySelectorAll(".hx-level[data-level]")].find(x => x.dataset.level === plantsFocus);
    plantsFocus = null;
    if (box) { box.scrollIntoView({ block: "center" }); box.classList.add("flash"); }
  }
```

(`data-dtab` buttons already wired in Task 1 cover "‹ Overview"; level chips are ordinary `.chip`s, so the existing chip handlers give plain click = open, ctrl = pick.)

- [ ] **Step 5: Run to verify it passes**, then `npm test` (all green).
- [ ] **Step 6: Commit**

```bash
git add graph-explorer/public/index.html graph-explorer/test/e2e.test.ts
git commit -m "feat(graph-explorer): Overview lists factors and levels; Pick plants jumps to the Plants tab" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Real-data check and wrap-up

- [ ] **Step 1:** `npm test` all green.
- [ ] **Step 2:** On phis-test (a second server on :4001 as in plan 1, or restart `npm run dev`): open PBar1x4. Check: tab labels and counts (Variables 21, Plants 125, Factors 2, Species 1); Overview short enough for one screen in light and dark; Variables filter; Plants group-by Replicate / GroupID / None; filter "PB05"; ctrl-pick a plant under GroupID, switch Group by to Replicate, ctrl-pick it again, confirm the graph-only bar; Pick plants › and a level › (scroll and flash); selection survives tab switches; unlink mode still shows the flat list; Alt+Left after opening a plant returns to the experiment (its tab resets to Overview — known, see below).
- [ ] **Step 3:** Screenshot the Overview and the Plants tab for the user.
- [ ] **Step 4:** Update the memory note (plan 2 done; plan 3 = route, statistics, grid, dialog, builder, quick looks later); mention known gaps: open tab is not part of back/forward history yet; general tabs rule deferred.

## Self-review

- **Spec coverage (section 1):** tabs with counts (T1), Overview content — facts/cards, connections, factors with level chips (T1, T3), bounded rule (long lists only in their tabs), Pick plants › on factors and levels, "‹ Overview" (T3), Variables filterable (T2), Plants group-by + filter (T2), "Not in a factor" / "(unset)" kept (T2), selection global across tabs (T1 test). Deferred and named: chart builder and quick looks (plan 3, need the grid), tabs as a general rule, tab state in back/forward history, collapse of big boxes (superseded by group-by + filter), "a single plant…" shortcut (belongs to the builder, plan 3).
- **Placeholder scan:** none.
- **Type consistency:** `detailTab`, `plantsView`, `varFilter`, `plantsFocus`, `plantsBodyHtml`, `variablesTabHtml(id, st)` (Task 2 changes the Task 1 signature, noted there), `hxHtml`/`hxPlants` (moved to file level in Task 1) are used consistently.

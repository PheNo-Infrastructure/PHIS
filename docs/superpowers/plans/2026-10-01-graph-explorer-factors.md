# Graph Explorer Factors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Factors become a full type: create (with levels) for one experiment, rename, delete with an honest cascade confirm, and factor levels become selectable so they can be set on / removed from scientific objects.

**Architecture:** Server: `NODE_TYPES.factor` gets rename (own PUT payload with the levels) and delete (a counted warning); a new minimal `NODE_TYPES.factor_level`; the scientific object's per-experiment "Factor levels" row becomes removable and linkable (`inExperiment.byType.factor_level`), with the level's own experiment fixed (no "which experiment?" question) and one level per factor per object. `CREATABLE.factor` (requiresLink + onlyOne experiment, a "lines" field for the levels). Page: the `factor_level` type, selectable level chips, the link/why rules, the create form's textarea, the delete confirm.

**Tech Stack:** Node 22 `--experimental-strip-types`, `node:test`, Playwright, plain-script `public/index.html`.

**Spec:** `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md`, section "Factors (designed 2026-10-01)".

## Global Constraints

- Run from `graph-explorer/`. One file: `node --experimental-strip-types --env-file=.env --test test/<file>.test.ts`; all: `npm test`.
- `.env` points at phis-test; live checks write only to the "ZZ factor probe" throwaway experiment, then clean up.
- Probed facts (2026-10-01): factor endpoints 404 a prefixed uri — level and factor ids are **full** uris; a level's uri is its factor's uri + `.` + the level; `GET /core/experiments/factors/{uri}` returns `{uri, name, experiment, levels:[{uri,name,description}]}`; `GET /core/experiments/factors/levels/{uri}` returns `{uri,name,description}`; rename = `PUT /core/experiments/factors {uri, name, experiment, levels:[{uri,name,description}]}` keeps level uris and objects' links; delete cascades (objects lose the level); `GET /core/scientific_objects?experiment=E&factor_levels=L1&factor_levels=L2&page_size=1` counts objects using any of them (`metadata.pagination.totalCount`).
- No `ADJACENT` change: `factor_level` is an in-experiment value (like germplasm on an object), reached through `IN_EXPERIMENT_PAIRS`, which the drift test keeps equal to the server's `inExperiment.byType`.
- PHIS values into `innerHTML` go through `escapeHtml`. No emojis. Relative `api/...` URLs.
- Commit + push `graph-explorer/project` after each task; never `main`.

## Review Focus

1. Two levels of the SAME factor selected with objects: no link button, a why line; the server refuses too — Task 2 test "two levels of one factor are refused" + Task 4 test "level chips select…".
2. Setting a level on an object that already has another level of that factor replaces it, and keeps every other relation (germplasm, part of, levels of other factors) — Task 2 test "replaces the same factor's old level".
3. An object not in the level's experiment: asked to add it there first, never silently skipped — Task 2 test "object not in the level's experiment" + Task 4 test "set a level…".
4. Renaming a factor must not drop its levels or the objects' links — Task 1 test "rename sends the levels back".
5. A factor/level name containing HTML in chips, prompts and confirms renders as text — Task 4 test "level chips select…" uses an HTML label.

---

### Task 1: Server — factor rename, honest delete, levels as items

**Files:**
- Modify: `graph-explorer/src/node-types.ts`
- Modify: `graph-explorer/src/routes/node.ts` (detail returns `deleteWarning`)
- Test: `graph-explorer/test/backend.test.ts` (new tests + update two existing ones)

**Interfaces:**
- Produces: `NodeConfig.putPayload?(dto, name)`, `NodeConfig.deleteWarning?(id, dto): Promise<string>`, queryRelation `load?(id)`; node-detail field `deleteWarning: string`; level items `{ id: <full level uri>, type: "factor_level", label: "<Factor>: <level>", factor: <full factor uri> }` (in the factor's "Levels" group and in an object's "Factor levels" row); `export async function factorOfLevel(levelId): Promise<{uri, name, experiment, levels}>`; `NODE_TYPES.factor_level` with `actions: ["link"]`.

- [ ] **Step 1: Failing tests** — append to `test/backend.test.ts`:

```ts
// ---------- factors ----------
const FAC = "https://phis.pheno.no/id/factor/exp.rep";
const facDto = { uri: FAC, name: "Replicate", experiment: "https://phis.pheno.no/id/experiment/exp", levels: [{ uri: `${FAC}.1`, name: "1", description: null }, { uri: `${FAC}.2`, name: "2", description: null }] };
function factorStub(calls: string[], puts: any[] = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: FAC }); }
    if (url.includes("/core/scientific_objects?") && url.includes("factor_levels=")) return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 100 } } });
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}/experiments`)) return jsonResponse(200, { result: [{ uri: facDto.experiment, name: "PBar1x4" }] });
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}`)) return jsonResponse(200, { result: facDto });
    if (url.includes(`/core/experiments/${encodeURIComponent(facDto.experiment)}`)) return jsonResponse(200, { result: { uri: facDto.experiment, name: "PBar1x4" } });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("factor detail: rename and delete allowed, levels are selectable 'Replicate: 1' items, delete warns with the counted cascade", async () => {
  await withServer(async (base) => {
    globalThis.fetch = factorStub([]);
    const d = await (await realFetch(`${base}/api/node-detail?type=factor&id=${encodeURIComponent(FAC)}`)).json();
    assert.deepEqual(d.actions, ["rename", "delete"]);
    assert.equal(d.deleteRemovesLinks, true);
    assert.equal(d.deleteWarning, "It also removes its level from 100 scientific objects in PBar1x4.");
    const levels = d.relations.find((r: any) => r.label === "Levels");
    assert.deepEqual(levels.items, [
      { id: `${FAC}.1`, type: "factor_level", label: "Replicate: 1", factor: FAC },
      { id: `${FAC}.2`, type: "factor_level", label: "Replicate: 2", factor: FAC },
    ]);
  });
});

test("factor rename sends the levels back with their uris (OpenSILEX keeps them and the objects' links — probed)", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = factorStub([], puts);
    const res = await realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "factor", id: FAC, name: "Block" }) });
    assert.equal(res.status, 200);
    assert.deepEqual(puts[0], { uri: FAC, name: "Block", experiment: facDto.experiment, levels: facDto.levels });
  });
});
```

  Also update two existing tests:
  - In `"scientific object: factor levels show per experiment as their factor ('Replicate: 2'), and a germplasm edit sends them back"`: rename it to `"scientific object: factor levels show per experiment as selectable levels ('Replicate: 2'), removable, and a germplasm edit sends them back"` and change its `row` assertion to:

```ts
    assert.deepEqual(row, { label: "Factor levels", field: "hasFactorLevel", type: "factor_level", items: [{ id: "https://phis.pheno.no/id/factor/rep.2", type: "factor_level", label: "Replicate: 2", factor: "https://phis.pheno.no/id/factor/rep" }] });
```

  - In the test containing `const bad = await put({ … link: { field: "hasFactorLevel", uris: ["x"] } });`: change `hasFactorLevel` to `hasNothing` (factor levels are writable now; the point of that check is "only the per-experiment rows").
  - In both tests whose expected `groups` contain `{ label: "Factor levels", items: [] }` (around lines 587 and 637–642): change each to `{ label: "Factor levels", field: "hasFactorLevel", type: "factor_level", items: [] }`.

- [ ] **Step 2: Run** `node --experimental-strip-types --env-file=.env --test test/backend.test.ts` — Expected: the two new tests and the edited ones FAIL (actions `[]`, no `deleteWarning`, old chip shape).

- [ ] **Step 3: Types** — in `src/node-types.ts`, in `NodeConfig` after the `deleteFirst?` member add:

```ts
  // The whole UpdateDTO, when copying the GetDTO back would mangle it (a factor's levels are
  // {uri, name} objects that must go back as objects — probed).
  putPayload?: (dto: Record<string, unknown>, name: string) => Record<string, unknown>;
  // A sentence for the delete confirm when OpenSILEX's delete cascades somewhere the relations
  // don't show (a factor's levels vanish from the objects using them — probed). Counted, never guessed.
  deleteWarning?: (id: string, dto: Record<string, unknown>) => Promise<string>;
```

  and in the `queryRelations` item type after `item?: …` add:

```ts
    // Builds the items itself instead of mapping `url`'s rows (labels that need the parent node).
    load?: (id: string) => Promise<{ id: string; label: string; [k: string]: unknown }[]>;
```

- [ ] **Step 4: `queryItems` honours `load`** — first line of `queryItems`:

```ts
  if (q.load) return (await q.load(id)).map((it) => ({ ...it, type: q.type }));
```

- [ ] **Step 5: `updateNode` honours `putPayload`** — replace its `authedPut` line with:

```ts
  const name = mod.name ?? String(current.name ?? "");
  await authedPut(config.putUrl, config.putPayload ? config.putPayload(current, name) : updatePayloadFromDto(id, name, current, config, mod));
```

- [ ] **Step 6: Level helpers** — replace the whole `factorLevelChips` function (and its comment) with:

```ts
type FactorDto = { uri: string; name: string; experiment: string; levels: { uri: string; name: string; description?: string | null }[] };
const levelItem = (f: FactorDto, l: { uri: string; name: string }) => ({ id: l.uri, type: "factor_level", label: `${f.name}: ${l.name}`, factor: f.uri });

// A level's uri is its factor's uri + "." + the level (probed: …/factor/<exp>.<factor>.<level>);
// the factor's own record confirms the level and names the experiment. Ids stay FULL: the factor
// endpoints 404 a prefixed uri (probed).
// ponytail: derives the factor from the uri shape; a level that doesn't match is refused (400), never guessed.
export async function factorOfLevel(levelId: string): Promise<FactorDto> {
  const cut = levelId.lastIndexOf(".");
  const f = cut > 0 ? ((await authedGetOne(`/core/experiments/factors/${encodeURIComponent(levelId.slice(0, cut))}`).catch(() => null))?.result as FactorDto | undefined) : undefined;
  if (!f?.levels?.some((l) => l.uri === levelId)) throw new OpenSilexError(400, `Not a factor level this app can resolve: ${levelId}`);
  return f;
}

// Every factor of the experiment with its levels comes back in one call — enough to name them all.
async function factorLevelChips(expId: string, uris: string[]) {
  const factors = (await authedGet(`/core/experiments/${encodeURIComponent(expId)}/factors`)).result as unknown as FactorDto[];
  const byLevel = new Map<string, ReturnType<typeof levelItem>>();
  for (const f of factors) for (const l of f.levels ?? []) byLevel.set(await compactUri(l.uri), levelItem(f, l));
  return Promise.all(uris.map(async (u) => byLevel.get(await compactUri(u)) ?? { id: u, type: "factor_level", label: u, factor: "" }));
}
async function factorLevelItems(factorId: string) {
  const f = (await authedGetOne(`/core/experiments/factors/${encodeURIComponent(factorId)}`)).result as unknown as FactorDto;
  return (f.levels ?? []).map((l) => levelItem(f, l));
}
```

- [ ] **Step 7: The object's "Factor levels" row** — replace its `SO_ROWS_PER_EXPERIMENT` entry (and the two comment lines above it) with:

```ts
  // A level has no node of its own beyond uri + name; its chip is "Replicate: 2" (type
  // factor_level, selectable). Removable here; set through Link selection (byType below), never
  // carried over or offered to children — levels belong to ONE experiment's factors.
  { label: "Factor levels", property: "hasFactorLevel", type: "factor_level", names: factorLevelChips, addable: false, removable: true, single: false },
```

  and in `scientific_object.inExperiment` replace the `byType:` line with:

```ts
      byType: { ...Object.fromEntries(SO_ROWS_PER_EXPERIMENT.filter((r) => r.addable).map((r) => [r.type, r.property])), factor_level: "hasFactorLevel" },
```

- [ ] **Step 8: `NODE_TYPES.factor` and `factor_level`** — replace the `factor:` entry (and its two comment lines) with:

```ts
  // A factor belongs to one experiment; its levels are listed as selectable items. Rename sends
  // the levels back as objects (putPayload); delete cascades to the objects using its levels,
  // so the confirm says how many (deleteWarning).
  factor: {
    getUrl: (id) => `/core/experiments/factors/${encodeURIComponent(id)}`,
    putUrl: "/core/experiments/factors",
    deleteUrl: (id) => `/core/experiments/factors/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "delete"],
    putPayload: (dto, name) => ({
      uri: dto.uri, name, experiment: dto.experiment,
      levels: ((dto.levels as FactorDto["levels"] | undefined) ?? []).map((l) => ({ uri: l.uri, name: l.name, description: l.description ?? null })),
    }),
    deleteRemovesLinks: true,
    deleteWarning: async (_id, dto) => {
      const levels = (dto.levels as { uri: string }[] | undefined) ?? [];
      const exp = String(dto.experiment ?? "");
      if (!levels.length || !exp) return "No scientific object uses it.";
      const filter = levels.map((l) => `factor_levels=${encodeURIComponent(l.uri)}`).join("&");
      const n = (await authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(exp)}&${filter}&page_size=1`)).metadata?.pagination?.totalCount ?? 0;
      if (!n) return "No scientific object uses it.";
      const expName = String((await authedGetOne(`/core/experiments/${encodeURIComponent(exp)}`)).result.name ?? exp);
      return `It also removes its level from ${n} scientific object${n === 1 ? "" : "s"} in ${expName}.`;
    },
    queryRelations: [
      { label: "Experiment", type: "experiment", url: (id) => `/core/experiments/factors/${encodeURIComponent(id)}/experiments` },
      { label: "Levels", type: "factor_level", url: (id) => `/core/experiments/factors/${encodeURIComponent(id)}/levels`, load: factorLevelItems },
    ],
  },
  // A factor's level: only uri + name in OpenSILEX. Exists as a type so it can be selected and set
  // on scientific objects (their inExperiment.byType); its factor/experiment come from factorOfLevel.
  factor_level: {
    getUrl: (id) => `/core/experiments/factors/levels/${encodeURIComponent(id)}`,
    putUrl: "",
    deleteUrl: () => "",
    relationGroups: [],
    updateLinkFields: [],
    actions: ["link"],
  },
```

- [ ] **Step 9: node-detail returns the warning** — in `src/routes/node.ts` `handleNodeDetail`, after the `...(config.deleteBlockedBy?.(dto) ? …)` line add:

```ts
      ...(config.deleteWarning ? { deleteWarning: await config.deleteWarning(id, dto) } : {}),
```

- [ ] **Step 10: Run** the backend file — Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add src/node-types.ts src/routes/node.ts test/backend.test.ts
git commit -m "feat(graph-explorer): factors can be renamed (levels kept) and deleted (counted cascade warning); levels are selectable items"
git push
```

---

### Task 2: Server — set a level on objects (its own experiment, one per factor)

**Files:**
- Modify: `graph-explorer/src/node-types.ts` (`inExperiment.fixedExperiment`, `updateSoInExperiment`)
- Modify: `graph-explorer/src/routes/link.ts`
- Test: `graph-explorer/test/backend.test.ts`

**Interfaces:**
- Consumes: `factorOfLevel` (Task 1).
- Produces: `/api/link` with objects + levels writes `hasFactorLevel` on the level's experiment copy; answers `{ needsExperiment: { notInAny: [{id,label}], placeOptions: [{ id, type: "experiment", label }] } }` when an object isn't in that experiment; 400 `"Two levels of <Factor> can't both be on a scientific object."`.

- [ ] **Step 1: Failing tests** — append:

```ts
function levelLinkStub(calls: string[], puts: any[], soExps: Record<string, { experiment: string; experiment_name: string }[]>, rels: any[] = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: "ok" }); }
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}`)) return jsonResponse(200, { result: facDto });
    if (url.includes(`/core/experiments/${encodeURIComponent(facDto.experiment)}`)) return jsonResponse(200, { result: { uri: facDto.experiment, name: "PBar1x4" } });
    const m = url.match(/scientific_objects\/([^/?]+)\/experiments/);
    if (m) return jsonResponse(200, { result: soExps[decodeURIComponent(m[1])] ?? [] });
    if (url.includes("?experiment=")) return jsonResponse(200, { result: { uri: "so-1", name: "PB001", rdf_type: "vocabulary:Plant", relations: rels } });
    if (url.includes("/core/scientific_objects/")) return jsonResponse(200, { result: { uri: "so-x", name: url.includes("so-2") ? "PB002" : "PB001" } });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}
const linkPost = (base: string, items: any[]) => realFetch(`${base}/api/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
const inPbar = [{ experiment: facDto.experiment, experiment_name: "PBar1x4" }, { experiment: "https://phis.pheno.no/id/experiment/other", experiment_name: "Other" }];

test("link object + level: written on the level's own experiment (no question, even when the object is in two), replacing the same factor's old level and keeping the rest", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    const rels = [
      { property: "vocabulary:hasFactorLevel", value: `${FAC}.1`, inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "https://phis.pheno.no/id/factor/exp.group.a", inverse: false },
      { property: "vocabulary:hasGermplasm", value: "https://phis.pheno.no/id/germplasm/annika", inverse: false },
    ];
    globalThis.fetch = levelLinkStub([], puts, { "so-1": inPbar }, rels);
    const res = await linkPost(base, [{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${FAC}.2` }]);
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.needsExperiment, undefined);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].experiment, facDto.experiment);
    assert.deepEqual(puts[0].relations.map((r: any) => r.value).sort(), [`${FAC}.2`, "https://phis.pheno.no/id/factor/exp.group.a", "https://phis.pheno.no/id/germplasm/annika"].sort());
  });
});

test("link object + level: an object not in the level's experiment is asked to be added there first (nothing written)", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = levelLinkStub([], puts, { "so-1": inPbar, "so-2": [{ experiment: "https://phis.pheno.no/id/experiment/other", experiment_name: "Other" }] });
    const body = await (await linkPost(base, [{ type: "scientific_object", id: "so-1" }, { type: "scientific_object", id: "so-2" }, { type: "factor_level", id: `${FAC}.2` }])).json();
    assert.deepEqual(body.needsExperiment, { notInAny: [{ id: "so-2", label: "PB002" }], placeOptions: [{ id: facDto.experiment, type: "experiment", label: "PBar1x4" }] });
    assert.equal(puts.length, 0);
  });
});

test("link object + level: two levels of one factor are refused", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = levelLinkStub([], puts, { "so-1": inPbar });
    const res = await linkPost(base, [{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${FAC}.1` }, { type: "factor_level", id: `${FAC}.2` }]);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Two levels of Replicate/);
    assert.equal(puts.length, 0);
  });
});
```

- [ ] **Step 2: Run** the backend file — Expected: the three new tests FAIL.

- [ ] **Step 3: `fixedExperiment` on the inExperiment config** — in `NodeConfig.inExperiment` (after `experimentsOf`) add:

```ts
    // Values that belong to ONE experiment (a factor level): keyed by the value's type, gives
    // that experiment — the link is written there only, and no "which experiment?" is asked.
    fixedExperiment?: Record<string, (valueIds: string[]) => Promise<{ id: string; label: string }>>;
```

  and in `scientific_object.inExperiment` add after `experimentsOf: …`:

```ts
      fixedExperiment: { factor_level: levelsExperiment },
```

  with this function next to `factorOfLevel`:

```ts
// The one experiment a set of levels belongs to; refuses two levels of one factor (an object holds
// one level per factor) and levels from different experiments.
async function levelsExperiment(levelIds: string[]) {
  const factors = await Promise.all(levelIds.map(factorOfLevel));
  const seen = new Set<string>();
  for (const f of factors) {
    if (seen.has(f.uri)) throw new OpenSilexError(400, `Two levels of ${f.name} can't both be on a scientific object.`);
    seen.add(f.uri);
  }
  const exps = new Set(factors.map((f) => f.experiment));
  if (exps.size !== 1) throw new OpenSilexError(400, "These factor levels belong to different experiments.");
  const id = factors[0].experiment;
  return { id, label: String((await authedGetOne(`/core/experiments/${encodeURIComponent(id)}`)).result.name ?? id) };
}
```

- [ ] **Step 4: One level per factor** — in `updateSoInExperiment`, directly after the line `if (mod.add?.length && SO_ROWS_PER_EXPERIMENT.find(…)?.single) relations = …;` add:

```ts
  // An object holds one level per factor: a new level replaces the old one of the same factor.
  if (mod.add?.length && mod.field === "hasFactorLevel") {
    const sameFactor = new Set<string>();
    for (const uri of mod.add) for (const l of (await factorOfLevel(uri)).levels) sameFactor.add(await compactUri(l.uri));
    const drop = await Promise.all(relations.map(async (r) => mine(r) && sameFactor.has(await compactUri(r.value))));
    relations = relations.filter((_, i) => !drop[i]);
  }
```

- [ ] **Step 5: `/api/link` uses it** — in `src/routes/link.ts`:
  - The `inExp` array type gains `otherType: string`; in its `push`, add `otherType: other`.
  - Before `for (const p of inExp) {` add `const notInFixed: { id: string; label: string }[] = []; let placeOptions: { id: string; type: string; label: string }[] | null = null;`
  - Replace the body of `for (const p of inExp) { … }` with:

```ts
      const cfg = NODE_TYPES[p.ownerType].inExperiment!;
      const fixed = cfg.fixedExperiment?.[p.otherType] ? await cfg.fixedExperiment[p.otherType](p.otherIds) : null;
      for (const id of p.ownerIds) {
        const exps = await cfg.experimentsOf(id);
        if (fixed) {
          // The value belongs to one experiment: write there only; an object not in it is asked
          // to be added there first (the page's lone-object question), never silently skipped.
          const key = await compactUri(fixed.id);
          const there = (await Promise.all(exps.map(async (e) => ((await compactUri(e.id)) === key ? e : null)))).filter((e) => e !== null);
          if (!there.length) {
            notInFixed.push({ id, label: String((await authedGetOne(NODE_TYPES[p.ownerType].getUrl(id))).result.name ?? id) });
            placeOptions = [{ id: fixed.id, type: "experiment", label: fixed.label }];
            continue;
          }
          targets.push({ ownerType: p.ownerType, field: p.field, id, exps: there, otherIds: p.otherIds, fixed: true });
          continue;
        }
        if (!exps.length) {
          notInAny.push({ id, label: String((await authedGetOne(NODE_TYPES[p.ownerType].getUrl(id))).result.name ?? id) });
          continue;
        }
        if (exps.length > 1 && !chosen) needsChoice = true;
        for (const e of exps) {
          const c = choices.get(e.id) ?? { id: e.id, label: e.label, objects: 0 };
          c.objects++;
          choices.set(e.id, c);
        }
        const keep = chosen ? (await Promise.all(exps.map(async (e) => (chosen.has(await compactUri(e.id)) ? e : null)))).filter((e) => e !== null) : exps;
        targets.push({ ownerType: p.ownerType, field: p.field, id, exps: keep, otherIds: p.otherIds });
      }
```

  - Give `targets` the optional field: its type becomes `{ ownerType: string; field: string; id: string; exps: { id: string; label: string }[]; otherIds: string[]; fixed?: true }[]`.
  - Before the existing `if (notInAny.length || needsChoice) {` add:

```ts
    if (notInFixed.length) {
      const out = JSON.stringify({ needsExperiment: { notInAny: notInFixed, placeOptions } });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(out);
      return;
    }
```

  - In the `written.push(...)` line change `only: !chosen` to `only: !chosen && !t.fixed`.
  - In the write loop change `if (cfg.childOffer) childOffer.push(…)` to `if (cfg.childOffer && !t.fixed) childOffer.push(…)` — a level is never offered to an object's children (spec: levels are never carried over or offered).

- [ ] **Step 6: Run** the backend file — Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/node-types.ts src/routes/link.ts test/backend.test.ts
git commit -m "feat(graph-explorer): set a factor level on scientific objects — the level's own experiment, one level per factor"
git push
```

---

### Task 3: Server — create a factor with its levels

**Files:**
- Modify: `graph-explorer/src/creation.js` (`CREATABLE.factor`)
- Modify: `graph-explorer/src/routes/create.ts` (`lines` fields, `onlyOne`)
- Test: `graph-explorer/test/backend.test.ts`

**Interfaces:**
- Produces: `CREATABLE.factor = { url, requiresLink: "experiment", onlyOne: "experiment", linkFields: { experiment: "experiment" }, scalarLinkFields: ["experiment"], fields: [{ key: "levels", label: "Levels (one per line)", input: "lines", required: true }] }`.

- [ ] **Step 1: Failing tests** — append:

```ts
test("create factor: name + experiment + levels (one per line -> [{name}]); no levels or two experiments refused", async () => {
  await withServer(async (base) => {
    const posts: any[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "POST") { posts.push({ url, body: JSON.parse(String(init.body)) }); return jsonResponse(201, { result: [FAC] }); }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const create = (body: unknown) => realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const exp = { type: "experiment", id: facDto.experiment };

    const ok = await create({ type: "factor", name: "Replicate", links: [exp], fields: { levels: "1\n 2 \n\n3" } });
    assert.equal(ok.status, 201);
    assert.deepEqual(posts[0].body, { name: "Replicate", experiment: facDto.experiment, levels: [{ name: "1" }, { name: "2" }, { name: "3" }] });
    assert.match(posts[0].url, /\/core\/experiments\/factors$/);

    const none = await create({ type: "factor", name: "X", links: [exp], fields: { levels: " \n " } });
    assert.equal(none.status, 400);
    assert.match((await none.json()).error, /Levels/);

    const two = await create({ type: "factor", name: "X", links: [exp, { type: "experiment", id: "e2" }], fields: { levels: "1" } });
    assert.equal(two.status, 400);
    assert.match((await two.json()).error, /belongs to one experiment/);
    assert.equal(posts.length, 1);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (`creation not implemented for type: factor`).

- [ ] **Step 3: `CREATABLE.factor`** — in `src/creation.js` add after the `site` entry:

```js
  // A factor belongs to exactly one experiment (requiresLink + onlyOne) and is created with its
  // levels: input "lines" = one per line, sent as [{name}], at least one.
  factor: {
    url: "/core/experiments/factors",
    requiresLink: "experiment",
    onlyOne: "experiment",
    linkFields: { experiment: "experiment" },
    scalarLinkFields: ["experiment"],
    fields: [{ key: "levels", label: "Levels (one per line)", input: "lines", required: true }],
  },
```

- [ ] **Step 4: `create.ts`** — after the intersection-rule check (`if (links.length > 0 && !creatableTypesFor(…`) block) add:

```ts
  if (config.onlyOne && links.filter((l) => l.type === config.onlyOne).length > 1) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `a ${type} belongs to one ${config.onlyOne}` }));
    return true;
  }
```

  and replace the body of the `for (const f of config.fields ?? [])` loop with:

```ts
    const value = body.fields?.[f.key];
    // "lines": one value per line -> [{name}] (a factor's levels); blank lines don't count.
    const lines = f.input === "lines" ? String(value ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : null;
    if (value === undefined || value === "" || (lines && !lines.length)) {
      if (!f.required) continue;
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `${f.label} is required` }));
      return true;
    }
    payload[f.key] = lines ? lines.map((name) => ({ name })) : String(value);
```

- [ ] **Step 5: Run** the backend file — Expected: all PASS. Then `npm test` — Expected: the e2e test `"… '+ New' …"` asserting `factor` is greyed "in PHIS for now" with ONE experiment selected now FAILS (factor is creatable). Update that test: replace its two `factor` assertions with:

```ts
    assert.equal(await page.locator("#newList .newmenu-item", { hasText: "factor" }).isDisabled(), false, "a factor can be created for one experiment");
    assert.equal(await page.locator("#newList .newmenu-item", { hasText: "person" }).isDisabled(), true);
    assert.match(await page.locator("#newList .newmenu-item", { hasText: "person" }).textContent() ?? "", /in PHIS for now/);
```

  and run `npm test` again — Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/creation.js src/routes/create.ts test/backend.test.ts test/e2e.test.ts
git commit -m "feat(graph-explorer): create a factor with its levels for one experiment"
git push
```

---

### Task 4: Page — levels selectable, set/remove on objects, create form, delete confirm

**Files:**
- Modify: `graph-explorer/public/index.html`
- Test: `graph-explorer/test/e2e.test.ts`

**Interfaces:**
- Consumes: level items (Task 1), `/api/link` answers (Task 2), `CREATABLE.factor` (Task 3), node-detail `deleteWarning` (Task 1).

- [ ] **Step 1: Failing e2e tests** — append:

```ts
// ---------- factors ----------
const FL = "https://phis.pheno.no/id/factor/exp.rep";
const levelDetail = (label = "Replicate") => ({
  uri: FL, actions: ["rename", "delete"], deleteRemovesLinks: true, deleteWarning: "It also removes its level from 100 scientific objects in PBar1x4.",
  relations: [
    { label: "Experiment", items: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] },
    { label: "Levels", items: [1, 2].map((n) => ({ id: `${FL}.${n}`, type: "factor_level", label: `${label}: ${n}`, factor: FL })) },
  ],
});

test("e2e: level chips select with ctrl; plant + level reads 'Set Replicate: 2 on PB001…'; two levels of one factor give a why, not a button; HTML names stay text", async () => {
  await withServerAndBrowser(async (base, page) => {
    const evil = `<img src=x onerror="window.__pwned=1">Rep`;
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(levelDetail(evil)) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { selection = new Map([["so-1", { id: "so-1", type: "scientific_object", label: "PB001" }]]); });
    await page.evaluate(() => openNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.locator(`.chip[data-openid="${FL}.2"]`).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.match(await page.locator("#linkSelectionBtn").innerText(), /^Set .*Rep: 2 on PB001…$/);
    await page.locator(`.chip[data-openid="${FL}.1"]`).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
    assert.match(await page.locator("#actionbar").innerText(), /Two levels of one factor can't both be on a scientific object/);
    assert.equal(await page.locator("img").count(), 0);
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined);
  });
});

test("e2e: set a level on a plant not in its experiment — asked to add it there first, then the level is set", async () => {
  await withServerAndBrowser(async (base, page) => {
    const links: any[] = [];
    await page.route("**/api/link", (r) => {
      const b = r.request().postDataJSON();
      links.push(b);
      const asks = links.length === 1;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(asks
        ? { needsExperiment: { notInAny: [{ id: "so-1", label: "PB001" }], placeOptions: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] } }
        : { ok: true, linkedPairs: 1, alreadyLinked: 0, written: [{ id: "so-1", values: [`${FL}.2`], experiments: ["PBar1x4"], only: false }] }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate((fl) => linkItems([{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${fl}.2` }]), FL);
    await page.waitForTimeout(400);
    assert.match((await page.locator("#actionbar").innerText()).replace(/\s+/g, " "), /PB001 isn't in PBar1x4, where this factor level belongs\. Add it there first\?/);
    await page.locator("#linkList .newmenu-item", { hasText: "PBar1x4" }).click();
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(500);
    assert.deepEqual(links[1].items, [{ type: "scientific_object", id: "so-1" }, { type: "experiment", id: "exp-1" }], "the plant is added to the experiment");
    assert.deepEqual(links[2].items, [{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${FL}.2` }], "then the level is set");
  });
});

test("e2e: + New factor asks for levels (one per line) and posts them; with two experiments it is greyed", async () => {
  await withServerAndBrowser(async (base, page) => {
    let posted: any = null;
    await page.route("**/api/create", (r) => { posted = r.request().postDataJSON(); return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: FL, type: "factor", label: "Replicate" }) }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { selection = new Map([["exp-1", { id: "exp-1", type: "experiment", label: "PBar1x4" }]]); renderActionbar(); });
    await page.locator("#newBtn").click();
    await page.locator("#newList .newmenu-item", { hasText: "factor" }).click();
    await page.locator("dialog input[name=name]").fill("Replicate");
    await page.locator("dialog textarea[name=levels]").fill("1\n2");
    await page.locator("dialog button[value=ok]").click();
    await page.waitForTimeout(400);
    // A form may send a textarea's line breaks as \r\n — the server splits on both.
    assert.deepEqual({ ...posted, fields: { levels: posted.fields.levels.replace(/\r/g, "") } }, { type: "factor", name: "Replicate", links: [{ type: "experiment", id: "exp-1" }], fields: { levels: "1\n2" } });

    await page.evaluate(() => { selection = new Map([["exp-1", { id: "exp-1", type: "experiment", label: "A" }], ["exp-2", { id: "exp-2", type: "experiment", label: "B" }]]); renderActionbar(); });
    await page.locator("#newBtn").click();
    const item = page.locator("#newList .newmenu-item", { hasText: "factor" });
    assert.equal(await item.isDisabled(), true);
    assert.match(await item.textContent() ?? "", /one experiment only/);
  });
});

test("e2e: deleting a factor confirms with the counted cascade", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(levelDetail()) }));
    let msg = "";
    page.on("dialog", (d) => { msg = d.message(); return d.dismiss(); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.evaluate(() => deleteNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(200);
    assert.equal(msg, "Delete Replicate? It also removes its level from 100 scientific objects in PBar1x4. This cannot be undone.");
  });
});
```

- [ ] **Step 2: Run** `node --experimental-strip-types --env-file=.env --test --test-name-pattern="level|factor" test/e2e.test.ts` — Expected: the four new tests FAIL.

- [ ] **Step 3: The type** — in `TYPES`, after the `factor:` line add:

```js
  factor_level: { color: "var(--type-data)", soft: "var(--type-data-soft)", name: "factor level", plural: "factor levels" },
```

  add `"factor_level"` to the `LINKABLE_TYPES` set, and change `IN_EXPERIMENT_PAIRS` to `new Set(["scientific_object:germplasm", "scientific_object:factor_level"])`.

- [ ] **Step 4: Link rules** — in `linkPlan`:
  - change `pairOk` to also accept in-experiment pairs:

```js
  const pairOk = (a, b) => a !== b && LINKABLE_TYPES.has(a) && LINKABLE_TYPES.has(b) && ((ADJACENT[a] || []).includes(b) || (ADJACENT[b] || []).includes(a) || inExperimentOnly(a, b));
```

  - directly after the `if (types.length === 1) { … }` block add:

```js
  // An object holds one level per factor.
  const levels = items.filter(v => v.type === "factor_level");
  if (new Set(levels.map(l => l.factor)).size < levels.length) return { kind: "none", why: "Two levels of one factor can't both be on a scientific object — keep one." };
```

  In `linkSelectionLabel` change `` `${values.length} germplasm` `` to `` `${values.length} ${typeName(values[0].type, values.length)}` ``.

- [ ] **Step 5: Chips** — in `chipHtml`, after `data-type="${e(it.type)}"` add `${it.factor ? ` data-factor="${e(it.factor)}"` : ""}`. In the detail pane's `.chip[data-openid]` click handler replace the `found` line and the navigation part with:

```js
      const id = chip.dataset.openid;
      const found = findItemById(id) || { id, type: chip.dataset.type, label: chip.textContent.trim(), ...(chip.dataset.factor ? { factor: chip.dataset.factor } : {}) };
      if (e.ctrlKey || e.metaKey) {
        toggleChipSelection(found);
        return;
      }
      // Plain click still just navigates — but not while unlinking, where the point is to
      // stay put and manage links, not wander off (the × button is the only action there).
      if (unlinking) return;
      // A level has no page of its own: plain click opens its factor.
      const target = found.type === "factor_level"
        ? (findItemById(found.factor) || { id: found.factor, type: "factor", label: found.label.split(":")[0] })
        : found;
      if (local) {
        detailPath = [...detailPath, target];
        renderDetail();
        loadNodeDetail(target);
      } else {
        openRelatedNode(target);
      }
```

- [ ] **Step 6: "Add it there first"** — in `linkItems`, replace the `experimentChoice = { what: "germplasm", … };` line with:

```js
      const names = andList((n.notInAny || []).map(o => escapeHtml(o.label)));
      experimentChoice = n.placeOptions
        ? { what: "factor level", lone: n.notInAny, placeOptions: n.placeOptions, retry: () => linkItems(items),
            lonePrompt: `${names} ${n.notInAny.length === 1 ? "isn't" : "aren't"} in ${escapeHtml(n.placeOptions[0].label)}, where this factor level belongs. Add ${n.notInAny.length === 1 ? "it" : "them"} there first?` }
        : { what: "germplasm", lone: n.notInAny, experiments: n.experiments, objects: n.objects, retry: (exps) => linkItems(items, exps) };
```

- [ ] **Step 7: "+ New": one experiment only** — in `renderActionbar`'s `[...creatable].sort().forEach(t => { … })`, replace the `const can = …`, `item.innerHTML = …` and `if (!can) …` lines with:

```js
    const one = CREATABLE[t]?.onlyOne;
    const tooMany = one && [...selection.values()].filter(v => v.type === one).length > 1;
    const can = t in CREATABLE && !tooMany && [...selection.values()].every(canLink);
    item.innerHTML = `<span class="swatch"></span>${typeName(t)}${can ? "" : `<span class="newmenu-item-type">${tooMany ? `one ${typeName(one)} only` : "in PHIS for now"}</span>`}`;
    if (!can) {
      item.disabled = true;
      item.title = tooMany ? `A ${typeName(t)} belongs to one ${typeName(one)} — select just one.` : `This app can't create a ${typeName(t)} here yet. Create it in PHIS, then link it here.`;
    }
```

- [ ] **Step 8: The levels field** — in `askCreateValues` change the `input` helper to:

```js
  const input = (fd) => fd.input === "select"
    ? `<select name="${fd.key}"${fd.required ? " required" : ""}><option value="">Choose…</option>${options[fd.key].map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join("")}</select>`
    : fd.input === "lines"
      ? `<textarea name="${fd.key}" rows="4"${fd.required ? " required" : ""}></textarea>`
      : `<input name="${fd.key}" type="${fd.input || "text"}"${fd.required ? " required" : ""}>`;
```

  and extend the dialog CSS: change `.create-dialog input, .create-dialog select {` to `.create-dialog input, .create-dialog select, .create-dialog textarea {`, and `.create-dialog input:focus, .create-dialog select:focus {` to `.create-dialog input:focus, .create-dialog select:focus, .create-dialog textarea:focus {`.

- [ ] **Step 9: Delete confirm** — in `deleteNode` replace the `const alsoUnlinks = …` line with:

```js
  // A type whose delete cascades where the relations don't show says so itself (a factor's levels
  // vanish from the objects using them — counted by the server).
  const alsoUnlinks = node?.deleteWarning ? ` ${node.deleteWarning}`
    : related.length ? ` It will also be unlinked from: ${related.map(it => it.label).join(", ")}.` : "";
```

- [ ] **Step 10: Run** the new tests, then `npm test` — Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add public/index.html test/e2e.test.ts
git commit -m "feat(graph-explorer): factor levels in the page — select, set on plants (add to the experiment first when needed), + New factor with levels, honest delete"
git push
```

---

### Task 5: Live check on the throwaway, deploy, status

**Files:**
- Create (scratchpad, not committed): a live script driving the app's own API
- Modify: `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md` (status)

- [ ] **Step 1: Live round trip on "ZZ factor probe"** (phis-test, throwaway) — with `npm run dev` running on :4000, drive the app's API: `POST /api/create {type:"factor", name:"ZZ Rep", links:[{type:"experiment", id:"https://phis.pheno.no/id/experiment/zz_factor_probe"}], fields:{levels:"a\nb"}}` -> 201; `GET /api/node-detail?type=factor&id=<new>` -> levels "ZZ Rep: a/b"; `POST /api/link` ZZ plant (`https://phis.pheno.no/id/scientific-object/so-zz_plant`) + level a -> ok; then + level b -> the plant has only b (read `node-detail` of the plant); `PUT /api/node {type:"factor", id, name:"ZZ Rep renamed"}` -> the plant still has b; node-detail `deleteWarning` = "It also removes its level from 1 scientific object in ZZ factor probe."; `DELETE /api/node?type=factor&id=…` -> the plant has no level. Expected: every step as written.

- [ ] **Step 2: Deploy** (repo root)

```bash
az acr build -r phisacr -t graph-explorer:latest -t graph-explorer:$(git rev-parse --short HEAD) graph-explorer
kubectl rollout restart deploy/graph-explorer -n graph-explorer
kubectl rollout status deploy/graph-explorer -n graph-explorer --timeout=120s
```

- [ ] **Step 3: Status** — append to the spec's Factors section, before `## Access during development`:

```markdown
**Built 2026-10-01:** all of the above, deployed to phis.pheno.no/portal; live round trip on the
ZZ throwaway (create, set, replace, rename, counted delete). Next: editing a factor's level list.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md
git commit -m "docs(graph-explorer): factors built and deployed"
git push
```

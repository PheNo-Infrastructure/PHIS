# Graph Explorer Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top search bar a real, server-side, selection-aware way to select anything in PHIS, and retire "Add to selection…".

**Architecture:** A new `GET api/search` route fans out to OpenSILEX's own `name=` filters per type (in parallel, 20 rows a type, totals from pagination) and builds rows with the same builder as the list route, so a search hit and a browsed row are the same item. The page shows results as a view over the list pane (not a breadcrumb place), with the normal click rules, Select all, Show more, and — when something is selected — a per-result "can link / already linked / can't link" note.

**Tech Stack:** Node 22 with `--experimental-strip-types` (no build), plain `node:test`, Playwright (Chromium) for e2e, one plain-script page `public/index.html`.

**Spec:** `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md`, section "Search as a way to select (designed 2026-10-01)".

## Global Constraints

- Run everything from `graph-explorer/`: `npm test` = all tests; one file: `node --experimental-strip-types --env-file=.env --test test/<file>.test.ts`.
- `.env` points at phis-test (`PHIS_HOST=http://20.23.34.101`); e2e and live tests hit it read-only. Never point tests at prod.
- No new dependencies. No build step. Page code is a plain classic `<script>` (top-level `let`/`const` are reachable by bare name in `page.evaluate`).
- API calls from the page are relative (`api/...`, never `/api/...`) — the app is served under `/portal`.
- Every PHIS value that reaches `innerHTML` goes through `escapeHtml`; labels set with `textContent` need nothing.
- Same click/ctrl/shift/marquee rules in every list (plain click replaces the selection, ctrl toggles, shift ranges).
- Wording: PHIS's own type names via `typeName(t, n)`; no emojis anywhere.
- Facts probed live on 2026-10-01 (phis-test): OpenSILEX `name=` is a case-insensitive Java **regex** (`P.ar` matches, a bare `(` returns an error), so queries are regex-escaped before sending (escaped queries verified: no errors, literal match). `facilities`, `sites`, `organisations` **ignore** `name=` (return everything) — those three are fetched whole via their list route and filtered in our route. All others honour it and return `metadata.pagination.totalCount`.
- Commit after each task on branch `graph-explorer/project` and push (`git push`); never to `main`.

## Review Focus

1. Typing fast: an older, slower answer must never replace a newer query's results — Task 2, test "a late answer to an older query is dropped".
2. Special characters in a query (`PBar1x4 (`, `Plant 1)`, `a.b`) must neither error nor act as regex — Task 1, test "regex characters are escaped".
3. One type's OpenSILEX call failing must not blank the whole search; that type says it couldn't be searched — Task 1 test "one failing type…" + Task 2 test "no matches / failed type / HTML names".
4. A PHIS name containing HTML shown in search results must render as text — Task 2, same test.
5. Leaving the search by navigating (a crumb, `›`, a chip) must end it: bar cleared, list pane back to normal, no ghost "Search:" view — Task 2, test "`›` opens the canonical path; a crumb also ends the search".

---

### Task 1: `api/search` route (server)

**Files:**
- Modify: `graph-explorer/src/opensilex.ts` (type of `authedGet`)
- Modify: `graph-explorer/src/routes/list.ts` (export `listRoutes`, `ListRoute`, `Row`, `toRows`)
- Create: `graph-explorer/src/routes/search.ts`
- Modify: `graph-explorer/src/index.ts` (register `handleSearch`)
- Test: `graph-explorer/test/backend.test.ts` (append), `graph-explorer/test/live-smoke.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/search?q=<text>[&type=<type>&page=<n>]` -> `200 [{ type: string, total: number, items: Row[], error?: string }]`, groups in `SEARCH_TYPES` order, groups with no hits and no error left out; empty `q` -> `[]`. `Row = { id: string; type: string; label: string; parent?: string }`. 20 rows per page.
- Produces: `toRows(route: ListRoute, items: RawItem[]): Promise<Row[]>` in `list.ts`.

- [ ] **Step 1: Write the failing backend tests** — append to `test/backend.test.ts`:

```ts
// ---------- /api/search ----------
const SEARCH_NS = { result: { phis: "https://phis.pheno.no/" } };
function searchStub(calls: string[], overrides: Record<string, () => Response> = {}) {
  return (async (url: string) => {
    calls.push(url);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, SEARCH_NS);
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url.includes("/core/germplasm?")) return jsonResponse(200, {
      result: [{ uri: "https://phis.pheno.no/id/germplasm/annika", name: "Annika", species: "phis:id/germplasm/barley" }],
      metadata: { pagination: { totalCount: 182 } },
    });
    if (url.includes("/core/experiments/factors?")) return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 0 } } });
    if (url.includes("/core/experiments?")) return jsonResponse(200, { result: [{ uri: "e1", name: "Annika trial" }], metadata: { pagination: { totalCount: 1 } } });
    if (url.includes("/core/organisations")) return jsonResponse(200, { result: [{ uri: "o1", name: "Annika Institute" }, { uri: "o2", name: "Other" }] });
    if (url.includes("/core/facilities?")) return jsonResponse(200, { result: [{ uri: "f1", name: "Greenhouse" }] });
    if (url.includes("/core/sites?")) return jsonResponse(200, { result: [] });
    return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 0 } } });
  }) as typeof fetch;
}

test("GET /api/search fans out with OpenSILEX's name filter (20 a type), totals from pagination, rows like the list route's; types that ignore name= are filtered here", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    const res = await realFetch(`${base}/api/search?q=ann`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      { type: "experiment", total: 1, items: [{ id: "e1", type: "experiment", label: "Annika trial" }] },
      { type: "germplasm", total: 182, items: [{ id: "phis:id/germplasm/annika", type: "germplasm", label: "Annika", parent: "phis:id/germplasm/barley" }] },
      { type: "organization", total: 1, items: [{ id: "o1", type: "organization", label: "Annika Institute" }] },
    ]);
    assert.ok(calls.some((u) => u.includes("/core/germplasm?name=ann&page_size=20&page=0")));
    assert.ok(!calls.some((u) => u.includes("/core/organisations?name=")), "organisations ignores name= — never sent");
    assert.ok(!calls.some((u) => /\/core\/(facilities|sites)\?name=/.test(u)), "facilities/sites ignore name= — never sent");
  });
});

test("GET /api/search: one failing type is reported, the others still answer", async () => {
  await withServer(async (base) => {
    globalThis.fetch = searchStub([], { "/core/germplasm?": () => jsonResponse(500, { result: { message: "boom" } }) });
    const body = await (await realFetch(`${base}/api/search?q=ann`)).json();
    const g = body.find((x: any) => x.type === "germplasm");
    assert.equal(g.total, 0);
    assert.deepEqual(g.items, []);
    assert.match(g.error, /boom/);
    assert.ok(body.some((x: any) => x.type === "experiment" && x.total === 1));
  });
});

test("GET /api/search?type=&page= asks only that type, at that page (Show more)", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    const body = await (await realFetch(`${base}/api/search?q=ann&type=germplasm&page=2`)).json();
    assert.equal(body.length, 1);
    assert.equal(body[0].type, "germplasm");
    const opensilex = calls.filter((u) => u.includes("/core/") || u.includes("/security/persons"));
    assert.deepEqual(opensilex.map((u) => u.replace(/^.*\/rest/, "")), ["/core/germplasm?name=ann&page_size=20&page=2"]);
  });
});

test("GET /api/search with an empty query answers [] without asking OpenSILEX", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    assert.deepEqual(await (await realFetch(`${base}/api/search?q=%20`)).json(), []);
    assert.equal(calls.length, 0);
  });
});

test("GET /api/search: regex characters are escaped (OpenSILEX's name= is a regex) and local filtering stays literal", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    await realFetch(`${base}/api/search?q=${encodeURIComponent("Plant 1) a.b")}`);
    const sent = calls.find((u) => u.includes("/core/germplasm?"))!;
    assert.equal(decodeURIComponent(sent.split("name=")[1].split("&")[0]), "Plant 1\\) a\\.b");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --experimental-strip-types --env-file=.env --test test/backend.test.ts`
Expected: the five new tests FAIL (404 from the server: no `/api/search` route).

- [ ] **Step 3: Widen `authedGet`'s type** — in `src/opensilex.ts` replace the `authedGet` function with:

```ts
// List answers carry pagination metadata (search reads totalCount from it).
export type ListPage = { result: RawItem[]; metadata?: { pagination?: { totalCount?: number } } };
export async function authedGet(urlPath: string): Promise<ListPage> {
  return authedFetch(urlPath) as Promise<ListPage>;
}
```

- [ ] **Step 4: Share the row builder in `src/routes/list.ts`** — export the route table and its type, add `Row` and `toRows`, and use it in the handler. Change `type ListRoute = …` to `export type ListRoute = …`, `const listRoutes` to `export const listRoutes`, and replace everything from `export const handleList` to the end of the file with:

```ts
export type Row = { id: string; type: string; label: string; parent?: string };

// One row per OpenSILEX item — shared by the list and search routes so a browsed row and a
// search hit are the same item (same id form). A germplasm's own uri comes back full
// (https://phis.pheno.no/id/...) while its species field is often prefixed (phis:id/...), same as
// the detail pane's chips — so ids and parents are compacted to one form.
export async function toRows(route: ListRoute, items: RawItem[]): Promise<Row[]> {
  const rows: Row[] = items.map((i) => ({ id: String(i.uri), type: route.type, label: route.label(i) }));
  if (!route.parent) return rows;
  return Promise.all(
    items.map(async (i, n) => {
      const p = route.parent!(i);
      return { ...rows[n], id: await compactUri(String(i.uri)), ...(typeof p === "string" && p ? { parent: await compactUri(p) } : {}) };
    })
  );
}

export const handleList: RouteHandler = async (req, res, { pathname }) => {
  const route = req.method === "GET" ? listRoutes[pathname] : undefined;
  if (!route) return false;

  const items = (await authedGet(route.url)).result;
  if (!Array.isArray(items)) throw new Error(`OpenSILEX response for ${req.url} did not contain a result list`);
  // Body is fully built BEFORE writeHead so a bad shape here still lands in the catch block
  // below instead of sending a 200 header and then failing mid-response (which would hang
  // the connection open forever — a real bug this ordering fix caught during testing).
  let rows = await toRows(route, items);
  if (route.parent) {
    // A parent not in the list is dropped: the item then shows at the category level instead of
    // being hidden under nothing.
    const known = new Set(rows.map((r) => r.id));
    rows = rows.map(({ parent, ...r }) => (parent && known.has(parent) ? { ...r, parent } : r));
  }
  const payload = JSON.stringify(rows);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(payload);
  return true;
};
```

- [ ] **Step 5: Create `src/routes/search.ts`**

```ts
import { authedGet } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";
import { listRoutes, toRows, type Row } from "./list.ts";

const PAGE = 20;

// Searched types, in menu order (Trials, Data, Setup, People) -> their list route. Not events,
// data files, documents: their labels are a description, filename, title — not a name.
const SEARCH_TYPES: Record<string, string> = {
  experiment: "/api/experiments", factor: "/api/factors", scientific_object: "/api/scientific-objects", germplasm: "/api/germplasm",
  variable: "/api/variables", provenance: "/api/provenances",
  facility: "/api/facilities", device: "/api/devices", site: "/api/sites",
  organization: "/api/organizations", project: "/api/projects", person: "/api/persons",
};
// These endpoints ignore `name=` and return everything (probed live 2026-10-01), so they are
// fetched whole through their list route and filtered here.
// ponytail: whole-list filter, capped by the list route's page_size=500; fine for these small types.
const FILTER_HERE = new Set(["facility", "site", "organization"]);

// OpenSILEX's `name=` is a case-insensitive Java regex — a bare "(" is an error, "." matches anything.
const escapeRegex = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type SearchGroup = { type: string; total: number; items: Row[]; error?: string };

async function searchType(type: string, q: string, page: number): Promise<SearchGroup> {
  const route = listRoutes[SEARCH_TYPES[type]];
  try {
    if (FILTER_HERE.has(type)) {
      const needle = q.toLowerCase();
      const hits = (await toRows(route, (await authedGet(route.url)).result)).filter((r) => r.label.toLowerCase().includes(needle));
      return { type, total: hits.length, items: hits.slice(page * PAGE, (page + 1) * PAGE) };
    }
    const base = route.url.split("?")[0];
    const r = await authedGet(`${base}?name=${encodeURIComponent(escapeRegex(q))}&page_size=${PAGE}&page=${page}`);
    return { type, total: r.metadata?.pagination?.totalCount ?? r.result.length, items: await toRows(route, r.result) };
  } catch (err) {
    // One type failing must not blank the whole search — the page says this type couldn't be searched.
    return { type, total: 0, items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export const handleSearch: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (req.method !== "GET" || pathname !== "/api/search") return false;
  const q = (searchParams.get("q") ?? "").trim();
  const only = searchParams.get("type");
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const types = only ? (only in SEARCH_TYPES ? [only] : []) : Object.keys(SEARCH_TYPES);
  const groups = q ? (await Promise.all(types.map((t) => searchType(t, q, page)))).filter((g) => g.total || g.error) : [];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(groups));
  return true;
};
```

- [ ] **Step 6: Register the route** — in `src/index.ts` add `import { handleSearch } from "./routes/search.ts";` after the `handleElsewhere` import, and add `handleSearch,` after `handleList,` in `routeHandlers`.

- [ ] **Step 7: Run the backend tests**

Run: `node --experimental-strip-types --env-file=.env --test test/backend.test.ts`
Expected: all PASS (including the existing list tests — `toRows` must keep their output identical).

- [ ] **Step 8: Add the live smoke test** — append to `test/live-smoke.test.ts`:

```ts
test("live: GET /api/search reaches the real PHIS instance and answers well-shaped groups", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/search?q=a`);
    assert.equal(res.status, 200);
    const groups = (await res.json()) as Array<{ type: string; total: number; items: unknown[]; error?: string }>;
    assert.ok(Array.isArray(groups));
    for (const g of groups) {
      assert.equal(g.error, undefined, `${g.type} failed: ${g.error}`);
      assert.equal(typeof g.total, "number");
      assert.ok(g.items.length <= 20);
      assertWellShapedList(g.items, g.type);
    }
  });
});
```

Run: `node --experimental-strip-types --env-file=.env --test test/live-smoke.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/opensilex.ts src/routes/list.ts src/routes/search.ts src/index.ts test/backend.test.ts test/live-smoke.test.ts
git commit -m "feat(graph-explorer): api/search — OpenSILEX name filters per type, 20 a type with totals, rows shared with the list route"
git push
```

---

### Task 2: The search view in the page

**Files:**
- Modify: `graph-explorer/public/index.html` (search input id, CSS, state, `rowEl`, `renderRows`, search functions, `navigateTo`, `renderCrumbs`)
- Test: `graph-explorer/test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: `GET api/search` from Task 1.
- Produces (page globals used by Tasks 3–4): `search` (`null` | `{ q: string, groups: SearchGroup[] | null, failed?: string }`), `rowEl(item, note?)` -> `HTMLElement`, `searchGroupsInOrder()` -> `SearchGroup[]`, `clearSearch()`, `endSearch()`.

- [ ] **Step 1: Write the failing e2e tests** — append to `test/e2e.test.ts`:

```ts
// ---------- search ----------
async function stubSearch(page: import("playwright").Page, answer: (u: URL) => unknown, delayMs: (u: URL) => number = () => 0) {
  await page.route("**/api/search*", async (r) => {
    const u = new URL(r.request().url());
    const wait = delayMs(u);
    if (wait) await new Promise((res) => setTimeout(res, wait));
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer(u)) });
  });
}
async function typeSearch(page: import("playwright").Page, q: string) {
  await page.locator("#searchInput").fill(q);
  await page.waitForTimeout(500); // 250 ms debounce + the stubbed answer
}
const ANN = [
  { type: "experiment", total: 1, items: [{ id: "e1", type: "experiment", label: "Annika trial" }] },
  { type: "germplasm", total: 182, items: [{ id: "g1", type: "germplasm", label: "Annika" }, { id: "g2", type: "germplasm", label: "Annikki" }] },
];

test("e2e: search shows matches per type with honest counts; click selects, ctrl adds, Select all takes what is shown; Esc goes back", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, () => ANN);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    assert.equal(await page.locator("#paneTitle").innerText(), "Search: “ann”");
    const heads = await page.locator("#rowlist .search-group").allInnerTexts();
    assert.equal(heads.length, 2);
    assert.match(heads[1], /2 of 182/);

    await page.locator("#rowlist .row", { hasText: "Annika trial" }).click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 1);
    await page.locator("#rowlist .row[data-id='g1']").click({ modifiers: ["Control"] }); // by id: "Annika" is also in "Annika trial"
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 2);

    assert.match(await page.locator("#searchSelectAll").innerText(), /Select all 3 shown/);
    assert.match(await page.locator("#paneCount").innerText(), /183 match/);
    await page.locator("#searchSelectAll").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 3);

    await page.locator("#searchInput").press("Escape");
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#paneTitle").innerText(), "Graph");
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.equal(await page.locator("#selList .sel-item").count(), 3, "leaving the search keeps the selection");
  });
});

test("e2e: Show more asks for the next page of that one type and appends it", async () => {
  await withServerAndBrowser(async (base, page) => {
    const urls: string[] = [];
    await stubSearch(page, (u) => {
      urls.push(u.search);
      return u.searchParams.get("type") === "germplasm"
        ? [{ type: "germplasm", total: 182, items: [{ id: "g21", type: "germplasm", label: "Annette" }] }]
        : ANN;
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    await page.locator("#rowlist .search-more").click();
    await page.waitForTimeout(300);
    assert.ok(urls.some((s) => s.includes("type=germplasm") && s.includes("page=1")));
    assert.equal(await page.locator("#rowlist .row", { hasText: "Annette" }).count(), 1);
    assert.match((await page.locator("#rowlist .search-group").allInnerTexts())[1], /3 of 182/);
  });
});

test("e2e: a late answer to an older query is dropped", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(
      page,
      (u) => (u.searchParams.get("q") === "a" ? [{ type: "germplasm", total: 1, items: [{ id: "gs", type: "germplasm", label: "Stale" }] }] : ANN),
      (u) => (u.searchParams.get("q") === "a" ? 800 : 0)
    );
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.locator("#searchInput").fill("a");
    await page.waitForTimeout(350); // the "a" request is now in flight (800 ms)
    await page.locator("#searchInput").fill("ann");
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("#rowlist .row", { hasText: "Stale" }).count(), 0);
    assert.equal(await page.locator("#paneTitle").innerText(), "Search: “ann”");
  });
});

test("e2e: search states — nothing found, a type that couldn't be searched, HTML in a name shown as text", async () => {
  await withServerAndBrowser(async (base, page) => {
    const evil = `<img src=x onerror="window.__pwned=1">Evil`;
    await stubSearch(page, (u) => u.searchParams.get("q") === "zzz" ? [] : [
      { type: "germplasm", total: 0, items: [], error: "boom" },
      { type: "experiment", total: 1, items: [{ id: "e-evil", type: "experiment", label: evil }] },
    ]);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "zzz");
    assert.match(await page.locator("#rowlist").innerText(), /No matches for “zzz”\./);
    await typeSearch(page, "ev");
    assert.match(await page.locator("#rowlist").innerText(), /couldn't be searched/);
    assert.match(await page.locator("#rowlist").innerText(), /<img src=x/);
    assert.equal(await page.locator("#rowlist img").count(), 0);
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined);
  });
});

test("e2e: `›` on a result opens it at its real place and ends the search; a crumb also ends it", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, () => ANN);
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", relations: [] }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    await page.locator("#rowlist .row", { hasText: "Annika trial" }).locator(".row-nav").click();
    await page.waitForTimeout(300);
    assert.match((await page.locator(".crumb").allInnerTexts()).join(" "), /Experiments.*Annika trial/);
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.doesNotMatch(await page.locator("#paneTitle").innerText(), /^Search/);

    await typeSearch(page, "ann");
    await page.locator(".crumb").first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.equal(await page.locator("#paneTitle").innerText(), "Graph");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --experimental-strip-types --env-file=.env --test test/e2e.test.ts --test-name-pattern="search|Show more|late answer|›"`
Expected: FAIL (`#searchInput` not found).

- [ ] **Step 3: Give the input an id** — in `public/index.html` change the search `<input>` in `.searchrow` to:

```html
      <input type="text" id="searchInput" placeholder="Search experiments, scientific objects, germplasm&hellip;" aria-label="Search">
```

- [ ] **Step 4: Add CSS** — after the `.pane-count { … }` rule:

```css
.search-group { padding: 10px 14px 4px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); font-weight: 600; }
.search-more { margin: 2px 14px 8px; }
.pane-count .btn { margin-left: 8px; }
```

- [ ] **Step 5: Add the search state** — directly after the `let deleteBlockedShown = null;` declaration:

```js
// Non-null while the top bar holds text: the list pane shows these results instead of `path`'s
// list — search is a view over the pane, not a place in the breadcrumb (spec "Search as a way to
// select"). groups = api/search's [{type, total, items, error?}], null while waiting.
let search = null;
let searchSeq = 0;   // bumped per query; an answer for an older seq is dropped
let searchTimer = null;
```

and add `searchInput: document.getElementById("searchInput"),` to the `els` object.

- [ ] **Step 6: Pull the row builder out of `renderRows`** — replace the whole `function renderRows() { … }` with:

```js
// One list row. `note` (search only) is appended to the type line, e.g. "can link".
function rowEl(item, note) {
  const isSelected = item.type === "category" ? isCategoryFullySelected(item.id) : selection.has(item.id);
  const row = document.createElement("div");
  row.className = "row" + (isSelected ? " selected" : "") + (note === "can't link" ? " row-cant" : "");
  row.setAttribute("style", typeStyle(item.type));
  row.dataset.id = item.id;
  const typeLine = item.type === "category" ? escapeHtml(item.hint ?? "") : typeName(item.type) + (note ? ` · ${note}` : "");
  row.innerHTML = `
    <span class="row-dot"></span>
    <span class="row-main${item.type === "category" ? " stacked" : ""}">
      <span class="row-label">${escapeHtml(item.label)}</span>
      <span class="row-type">${typeLine}</span>
    </span>
    <button class="row-nav" title="Open" aria-label="Open ${escapeHtml(item.label)}">›</button>
  `;
  // A search hit opens at its real place (its canonical path); navigateTo ends the search.
  row.querySelector(".row-nav").addEventListener("click", (e) => { e.stopPropagation(); search ? openRelatedNode(item) : openNode(item); });
  return row;
}

function emptyHint(text) {
  const div = document.createElement("div");
  div.className = "empty-hint";
  div.textContent = text;
  els.rowlist.appendChild(div);
}

function renderRows() {
  if (search) return renderSearchRows();
  const items = itemsForPane();
  const p = currentPane();
  els.paneTitle.textContent = p.label;
  els.paneCount.textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";
  els.rowlist.innerHTML = "";
  rowOrder = items.map(it => it.id);
  addressableItems = new Map(items.map(it => [it.id, it]));
  if (!items.length) return emptyHint("Nothing here yet.");
  items.forEach(item => els.rowlist.appendChild(rowEl(item)));
}
```

- [ ] **Step 7: Add the search functions** — directly after `renderRows`:

```js
/* ---------------- search (spec "Search as a way to select") ----------------
   The top bar asks api/search (OpenSILEX's own name filters, 20 a type with totals) ~250 ms after
   typing stops. Results are an ordinary list: same click rules, Select all, Show more per type. */
function searchGroupsInOrder() { return search.groups || []; }

function renderSearchRows() {
  const groups = searchGroupsInOrder();
  const items = groups.flatMap(g => g.items);
  els.paneTitle.textContent = `Search: “${search.q}”`;
  els.paneCount.textContent = "";
  els.rowlist.innerHTML = "";
  rowOrder = items.map(it => it.id);
  addressableItems = new Map(items.map(it => [it.id, it]));
  if (search.failed) return emptyHint(`Search failed: ${search.failed}`);
  if (!search.groups) return emptyHint("Searching…");
  if (!groups.length) return emptyHint(`No matches for “${search.q}”.`);

  const total = groups.reduce((n, g) => n + g.total, 0);
  if (items.length) {
    // Selects what is shown, never thousands by accident; says so when more match.
    if (items.length < total) els.paneCount.textContent = `${total} match — type more to narrow`;
    const all = document.createElement("button");
    all.className = "btn ghost small";
    all.id = "searchSelectAll";
    all.textContent = items.length < total ? `Select all ${items.length} shown` : `Select all ${items.length}`;
    all.addEventListener("click", () => {
      selection = new Map(items.map(it => [it.id, it]));
      anchorId = null;
      refreshLeftPane(); renderDetail(); renderActionbar();
    });
    els.paneCount.appendChild(all);
  }
  groups.forEach(g => {
    const head = document.createElement("div");
    head.className = "search-group";
    head.textContent = `${typeName(g.type, 2)} · ${g.error ? "couldn't be searched" : g.items.length < g.total ? `${g.items.length} of ${g.total}` : g.total}`;
    els.rowlist.appendChild(head);
    g.items.forEach(item => els.rowlist.appendChild(rowEl(item)));
    if (!g.error && g.items.length < g.total) {
      const more = document.createElement("button");
      more.className = "btn ghost small search-more";
      more.textContent = "Show more";
      more.addEventListener("click", () => showMoreResults(g));
      els.rowlist.appendChild(more);
    }
  });
}

async function runSearch(q) {
  const seq = ++searchSeq;
  search = { q, groups: null };
  renderRows();
  try {
    const res = await fetch(`api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const groups = await res.json();
    if (seq !== searchSeq) return; // an older query answering late
    search = { q, groups };
  } catch (err) {
    if (seq !== searchSeq) return;
    search = { q, groups: [], failed: err.message };
  }
  renderRows();
}

async function showMoreResults(group) {
  const seq = searchSeq;
  const page = Math.floor(group.items.length / 20); // api/search pages hold 20
  const res = await fetch(`api/search?q=${encodeURIComponent(search.q)}&type=${encodeURIComponent(group.type)}&page=${page}`);
  const [next] = res.ok ? await res.json() : [];
  if (seq !== searchSeq || !search) return;
  if (next) group.items = group.items.concat(next.items.filter(it => !group.items.some(x => x.id === it.id)));
  else showToast("Couldn't load more.");
  renderRows();
}

// Ends the search without rendering (callers that navigate render anyway).
function clearSearch() {
  clearTimeout(searchTimer);
  searchSeq++;
  search = null;
  els.searchInput.value = "";
}
function endSearch() { clearSearch(); renderRows(); }

els.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = els.searchInput.value.trim();
  if (!q) return endSearch();
  searchTimer = setTimeout(() => runSearch(q), 250);
});
els.searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") endSearch(); });
```

- [ ] **Step 8: Navigation ends the search** — in `navigateTo` add `clearSearch();` as its first line. In `renderCrumbs`, change the crumb click handler to:

```js
      btn.addEventListener("click", () => { clearSearch(); path = path.slice(0, i + 1); render(); });
```

- [ ] **Step 9: Run the new tests**

Run: `node --experimental-strip-types --env-file=.env --test test/e2e.test.ts --test-name-pattern="search|Show more|late answer|›"`
Expected: PASS.

- [ ] **Step 10: Run the whole suite** — `npm test`. Expected: all PASS (renderRows refactor must not change normal lists).

- [ ] **Step 11: Commit**

```bash
git add public/index.html test/e2e.test.ts
git commit -m "feat(graph-explorer): the search bar works — results per type in the list pane, same click rules, Select all, Show more, Esc"
git push
```

---

### Task 3: Retire "Add to selection…"

**Files:**
- Modify: `graph-explorer/public/index.html` (`renderActionbar`, `linkPickerCandidatesByType`, `renderLinkPicker`, `renderLinkPickerFooter`)
- Modify: `graph-explorer/test/e2e.test.ts` (convert/delete the seven tests that used `#addToSelectionBtn`)

**Interfaces:**
- Consumes: `#searchInput`, search rows (Task 2).
- Keeps: the picker popover (`linkMenuHtml`, `wireLinkMenu`, `linkPickerMode`) for the app's questions — experiment choice, carry-over, requiresLink standalone create. `linkableExistingTypes()` stays (Task 4 uses it).

- [ ] **Step 1: Convert the tests first**, so none of them touches `#addToSelectionBtn` any more and they keep passing once it is gone. In `test/e2e.test.ts`:

  a. Test `"e2e: no '+ Add' in boxes — germplasm is added through the selection (Add to selection… -> Link selection)…"`: rename to `"e2e: no '+ Add' in boxes — germplasm is added through the selection (search -> Link selection); × in unlink mode removes it in THAT experiment"`. Add after the existing `page.route("**/api/germplasm", …)` line:

```ts
    await stubSearch(page, () => [{ type: "germplasm", total: 1, items: [{ id: "g-arild", type: "germplasm", label: "Arild" }] }]);
```

  and replace the six lines from `await page.locator("#addToSelectionBtn").click();` through `await page.locator(".linkmenu-confirm").click();` (and the comment above them) with:

```ts
    // Select the object (its title), find the germplasm with the search bar, ctrl-click it, then Link selection.
    await page.locator("#selfChip").click();
    await typeSearch(page, "Ari");
    await page.locator("#rowlist .row", { hasText: "Arild" }).click({ modifiers: ["Control"] });
```

  b. Test `"e2e: a PHIS name containing HTML is shown as text everywhere (rows, title, chips, boxes, picker) — never run"`: rename `picker` to `search`. Add after its `page.route("**/api/node-detail*", …)` call:

```ts
    await stubSearch(page, () => [{ type: "germplasm", total: 1, items: [{ id: "g-evil", type: "germplasm", label: evil }] }]);
```

  replace the three lines `await page.locator("#addToSelectionBtn").click();`, `…{ hasText: "germplasm" }).click();`, `await page.waitForTimeout(300);` with `await typeSearch(page, "Ev");`, and replace the assertion on `#linkList .linkmenu-items` with:

```ts
    assert.match(await page.locator("#rowlist").innerText(), /<img src=x/);
```

  c. Delete the test `"e2e: \"Add to selection…\" is a two-level type-then-item browser: …"` (its behaviour is now the search tests of Task 2).

  d. Replace the test `"e2e: \"Add to selection…\" picking follows the exact same click/ctrl/shift rules …"` with this one (the popover's click rules, through a question flow that still uses it):

```ts
test("e2e: picker popover (an app question) follows the same click/ctrl rules as every list — plain click REPLACES, ctrl toggles", async () => {
  await withServerAndBrowser(async (base, page) => {
    const offer = (value: string, label: string) => ({
      type: "scientific_object", id: "so-1", label: "Plot 1", experiment: "exp-B", experimentLabel: "Barley 2027",
      field: "hasGermplasm", value, valueType: "germplasm", valueLabel: label, from: "Barley 2025",
    });
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 1, alreadyLinked: 0, carryOver: [offer("g-a", "Annika"), offer("g-b", "Arild"), offer("g-c", "Brage")],
    }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => linkItems([{ type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }]));
    await page.waitForTimeout(400);
    const rows = page.locator("#linkList .linkmenu-items .newmenu-item");
    const picked = () => page.locator("#linkList .linkmenu-items .newmenu-item.selected").count();
    await rows.nth(0).click();
    await rows.nth(1).click();
    assert.equal(await picked(), 1, "plain click replaces");
    await rows.nth(2).click({ modifiers: ["Control"] });
    assert.equal(await picked(), 2, "ctrl adds");
    await rows.nth(1).click({ modifiers: ["Control"] });
    assert.equal(await picked(), 1, "ctrl removes");
    assert.equal((await page.locator(".linkmenu-confirm").innerText()).trim(), "Carry over 1");
  });
});
```

  e. Test `"e2e: one organization selected + more picked via \"Add to selection…\" -> Link selection opens the ranking modal …"`: rename `picked via "Add to selection…"` to `ctrl-clicked in the list`. Replace everything from `await page.locator("#addToSelectionBtn").click();` through `await page.locator(".linkmenu-confirm").click();` with:

```ts
    // More organizations join the selection with ctrl-click — the same rule as everywhere.
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.locator("#rowlist .row").nth(2).click({ modifiers: ["Control"] });
```

  f. Test `"e2e: one object selected + other objects added -> Link selection -> the ranking modal with ONE parent slot …"`: replace the five lines from `await page.locator("#addToSelectionBtn").click();` through `await page.locator(".linkmenu-confirm").click();` with:

```ts
    for (const name of ["Block A", "Block B", "Plant 1"]) await page.locator("#rowlist .row", { hasText: name }).click({ modifiers: ["Control"] });
```

  g. Replace the test `"e2e: \"Add to selection…\" popover closes via its own × button, not just an outside click"` with:

```ts
test("e2e: the picker popover (an app question) closes via its own × button, not just an outside click", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 1, alreadyLinked: 0, carryOver: [{ type: "scientific_object", id: "so-1", label: "Plot 1", experiment: "exp-B",
        experimentLabel: "Barley 2027", field: "hasGermplasm", value: "g-a", valueType: "germplasm", valueLabel: "Annika", from: "Barley 2025" }],
    }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => linkItems([{ type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }]));
    await page.waitForTimeout(400);
    assert.ok(await page.locator("#linkMenu").evaluate((el) => el.classList.contains("open")));
    await page.locator("#linkMenuClose").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#linkMenu").evaluate((el) => el.classList.contains("open")), false);
  });
});
```

  Then also add the check that the button is gone, at the end of the first Task 2 test (before its closing `});`):

```ts
    assert.equal(await page.locator("#addToSelectionBtn").count(), 0, "\"Add to selection…\" is retired — the search bar does its job");
```

- [ ] **Step 2: Run them**

Run: `npm test`
Expected: everything PASSES except the new `#addToSelectionBtn` count assertion (the button still exists).

- [ ] **Step 3: Remove the mechanic** in `public/index.html`:
  - In `renderActionbar`: delete `const hasExistingCandidates = linkPickerCandidatesByType().size > 0;`, the template line `${hasExistingCandidates ? linkMenuHtml(…"Add to selection") : ""}`, and the whole `if (hasExistingCandidates) { … wireLinkMenu("addToSelectionBtn", …) … }` block with its comment.
  - Replace `linkPickerCandidatesByType` with:

```js
// The picker only answers the app's questions now (linkPickerMode set): which experiment,
// carry-over, the anchor of a requiresLink create. Gathering a selection is the search bar's job.
function linkPickerCandidatesByType() {
  if (!linkPickerMode) return new Map();
  return new Map([[linkPickerMode.type, (linkPickerMode.items || CATEGORY_ITEMS[CATEGORY_FOR_TYPE[linkPickerMode.type]] || []).filter(it => !linkPickerMode.exclude?.has(it.id))]]);
}
```

  - In `renderLinkPicker`: every caller sets `linkPickerType` and `linkPickerMode`, so delete the `if (!linkPickerType) { … } else {` type-list branch (keep its `else` body, un-nested) and the `if (!linkPickerMode) { … linkmenu-back crumb … }` block.
  - In `renderLinkPickerFooter`: the confirm handler keeps only the `linkPickerMode` path; delete the comment and code after `return;` (the "Add N to selection" branch), and set the label to `linkPickerMode.confirmLabel(linkPickerPicked.size)`.
  - Update the `linkMenuHtml` comment to: `// The picker popover's markup + open/close wiring, used by the app's questions (experiment choice, carry-over, requiresLink create).`

- [ ] **Step 4: Run the whole suite** — `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/e2e.test.ts
git commit -m "feat(graph-explorer): retire 'Add to selection…' — the search bar gathers the selection; the popover stays for the app's questions"
git push
```

---

### Task 4: Search knows what's selected

**Files:**
- Modify: `graph-explorer/public/index.html` (`searchGroupsInOrder`, `renderSearchRows`, a `searchNote` helper, CSS)
- Test: `graph-explorer/test/e2e.test.ts` (append)

**Interfaces:**
- Consumes: `linkableExistingTypes()` (existing: the types that can link to everything selected), `NODE_DETAIL`, `selection`, Task 2's `rowEl(item, note)`.
- Produces: `searchNote(item)` -> `null | "can link" | "already linked" | "can't link"`.

- [ ] **Step 1: Write the failing test** — append to `test/e2e.test.ts`:

```ts
test("e2e: with something selected, search says what each result is to it — can link first, already linked when known, can't link last", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, (u) => u.searchParams.get("q") === "plot"
      ? [{ type: "scientific_object", total: 1, items: [{ id: "so-1", type: "scientific_object", label: "Plot 1" }] }]
      : [
          { type: "person", total: 1, items: [{ id: "p1", type: "person", label: "Ann Smith" }] },
          { type: "germplasm", total: 2, items: [{ id: "g1", type: "germplasm", label: "Annika" }, { id: "g2", type: "germplasm", label: "Annikki" }] },
        ]);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "plot");
    await page.locator("#rowlist .row", { hasText: "Plot 1" }).click();
    await page.evaluate(() => { NODE_DETAIL["so-1"] = { relations: [{ label: "Germplasm", items: [{ id: "g2", type: "germplasm", label: "Annikki" }] }] }; });
    await typeSearch(page, "ann");

    const heads = await page.locator("#rowlist .search-group").allInnerTexts();
    assert.match(heads[0], /germplasm/i, "the type that can link comes first");
    const typeLine = (label: string) => page.locator("#rowlist .row", { hasText: label }).first().locator(".row-type").innerText();
    assert.match(await typeLine("Annika"), /can link/);
    assert.match(await typeLine("Annikki"), /already linked/);
    assert.match(await typeLine("Ann Smith"), /can't link/);

    // Nothing selected: no notes.
    await page.evaluate(() => { selection = new Map(); refreshLeftPane(); });
    assert.doesNotMatch(await typeLine("Annika"), /link/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --experimental-strip-types --env-file=.env --test test/e2e.test.ts --test-name-pattern="search says what"`
Expected: FAIL (no "can link" text; person group first).

- [ ] **Step 3: Implement** — replace `function searchGroupsInOrder() { return search.groups || []; }` with:

```js
// What a result is to the current selection (null when nothing is selected or it is selected):
// "can link" — its type can link to everything selected (the rule behind + New); "already linked"
// — only when known: one selected item whose detail is cached, never guessed; else "can't link".
function searchNote(item) {
  if (!selection.size || selection.has(item.id)) return null;
  if (selection.size === 1) {
    const rel = NODE_DETAIL[[...selection.keys()][0]]?.relations ?? [];
    if (rel.some(r => r.items.some(it => it.id === item.id))) return "already linked";
  }
  return linkableExistingTypes().has(item.type) ? "can link" : "can't link";
}

// Linkability is per type, so with something selected the types that can link come first
// (a stable sort keeps menu order within each half).
function searchGroupsInOrder() {
  const groups = search.groups || [];
  if (!selection.size) return groups;
  const linkable = linkableExistingTypes();
  return [...groups].sort((a, b) => (linkable.has(a.type) ? 0 : 1) - (linkable.has(b.type) ? 0 : 1));
}
```

  In `renderSearchRows` change `g.items.forEach(item => els.rowlist.appendChild(rowEl(item)));` to:

```js
    g.items.forEach(item => els.rowlist.appendChild(rowEl(item, searchNote(item))));
```

  Add CSS after the `.search-more` rule: `.row.row-cant .row-type { opacity: 0.55; }`

- [ ] **Step 4: Run the test, then the suite**

Run: `node --experimental-strip-types --env-file=.env --test test/e2e.test.ts --test-name-pattern="search says what"` — Expected: PASS. Then `npm test` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/e2e.test.ts
git commit -m "feat(graph-explorer): search knows the selection — can link first, already linked when known, can't link greyed"
git push
```

---

### Task 5: Deploy, look at it live, record status

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md` (status line in the search section)

- [ ] **Step 1: Build and roll out** (from the repo root)

```bash
az acr build -r phisacr -t graph-explorer:latest -t graph-explorer:$(git rev-parse --short HEAD) graph-explorer
kubectl rollout restart deploy/graph-explorer -n graph-explorer
kubectl rollout status deploy/graph-explorer -n graph-explorer --timeout=120s
```

- [ ] **Step 2: Check the live route** — `curl -s -u phis:<basic-auth password> "https://phis.pheno.no/portal/api/search?q=pbar"`. Expected: a JSON array with an `experiment` group containing "PBar1x4 – TraitFinder – 2025-10-22". Then open https://phis.pheno.no/portal/ in a browser and try: "pbar", "zz", "ann" with a plant selected, `›` on a result, Esc.

- [ ] **Step 3: Record status** — append to the spec's search section, before `## Access during development`:

```markdown
**Built 2026-10-01:** 1+2+4 (api/search, the search view, "Add to selection…" retired) and 3
(selection-aware notes), deployed to phis.pheno.no/portal. Next: 5 (no match -> "+ New").
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md
git commit -m "docs(graph-explorer): search built and deployed"
git push
```

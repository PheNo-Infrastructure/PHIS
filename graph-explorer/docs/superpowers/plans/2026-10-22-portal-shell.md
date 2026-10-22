# Portal shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the portal a navbar (Overview · Set up · Import · Browse · Manage) with a front-door Overview as the first page, and a first version of each section, before the Tuesday 2026-10-27 demo.

**Architecture:** `public/index.html` (one file, no build step) gets a `view` state mirrored in `location.hash`. Browse and Manage show today's three-pane workspace unchanged; Overview, Set up and Import show a wide page in place of the first two panes. The Selection pane stays on every view. Overview's trial list is built from one "nodes" array (`{id, type, label, facts}`) so a graph can replace the list later without touching the page.

**Tech Stack:** plain HTML/JS in `public/index.html`, Node/TypeScript server (`src/`), `node --test` with Playwright for e2e (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-09-portal-shell-design.md` (navbar, lenses, "page must not restate the button"), plus decisions of 2026-10-22 in "Global Constraints". Mockups of the pages are in `.superpowers/brainstorm/78-1792654677/content/` (gitignored, local).

## Global Constraints

- Navbar labels, in this order, exactly: `Overview`, `Set up`, `Import`, `Browse`, `Manage`. Hash routes: `#overview` (default), `#setup`, `#import`, `#browse`, `#manage`.
- Overview holds: the search box, one import card (button text `Import from an instrument…`), and "Your trials" rows with the green `›` open arrow. No "Recently imported" strip (user's call, 2026-10-22).
- PheNo light theme only: use existing CSS tokens, no new colours, no dark mode, Public Sans only.
- Keep every fetch relative (`api/...`), never a leading `/` (the portal is served under `/portal`).
- Keep PHIS's own words (experiment, scientific object, factor...) visible; plain explanations next to them are fine.
- Same click rules everywhere: plain click selects, ctrl toggles, shift ranges, `›` opens. Selection survives every view switch.
- Do not touch the import dialog's behaviour (review, edits, run). Only where it is opened from changes.
- Out of scope: the graph, the import redesign (column mapping), login, mobile widths, "More actions" re-ordering in the Selection pane, a "who sees what" table.

## Review Focus

- Opening the portal at a stale or unknown hash (`#nope`, `#browse` with a deep path) lands on Overview, never a blank page.
- No trials in PHIS (empty list) or the trial request fails: Overview still shows search + import card and says what happened.
- Selection made in Browse is still there after Overview → Browse and back.
- Browser back/forward moves between views.
- The demo path still works end to end: Overview → Import card → review → run → `Open the experiment` lands in the Browse workspace on that experiment.

---

### Task 1: Navbar and view switching

**Files:**
- Modify: `public/index.html` (masthead markup around line 937, `<style>` block, script state near `let path` line 1127)
- Modify: `test/e2e.test.ts` (every `page.goto(base)` becomes `page.goto(base + "/#browse")`), `scripts/demo-rehearsal.mts`, `scripts/demo-reset.mts` if they load the page
- Test: `test/e2e.test.ts`

**Interfaces:**
- Produces: `type View = "overview" | "setup" | "import" | "browse" | "manage"`; `let view: View`; `function showView(next: View): void` (sets `view`, writes `location.hash`, toggles `document.body.dataset.view`, re-renders); `body[data-view]` is the CSS hook later tasks use; containers `#pagePane` (wide page, hidden in browse/manage) and the existing `.workspace` panes.

- [ ] **Step 1: Write the failing test** in `test/e2e.test.ts`: `"navbar switches views and the hash follows"`. Load `base`, assert the five nav links have the exact labels in order and `body[data-view="overview"]`; click `Browse`, assert `location.hash === "#browse"` and `#rowlist` is visible; `page.goBack()` returns to `#overview`; loading `base + "/#nope"` ends on `data-view="overview"`.
- [ ] **Step 2: Run** `npm test -- --test-name-pattern="navbar"` (or `node --experimental-strip-types --env-file=.env --test test/e2e.test.ts`). Expected: FAIL (no navbar).
- [ ] **Step 3: Implement** `<nav id="mainnav">` in the masthead (replace the "Graph Explorer" `h1` text spacing as needed, keep the logo), `showView`, a `hashchange` listener, and CSS so that in `overview|setup|import` the Explorer and Detail panes are hidden and `#pagePane` fills their place beside the Selection pane; in `browse|manage` the workspace is exactly as today. `manage` additionally opens the Groups category on first entry (find its category id in `ROOT`). Keep the search row visible in all views; typing in it while on a page view switches to `browse` (search results live in the explorer pane).
- [ ] **Step 4: Update existing tests/scripts** with sed: `page.goto(base)` → `page.goto(base + "/#browse")`; in `scripts/demo-rehearsal.mts` the start URL stays the bare portal URL (it begins on Overview, which is the point). Run the full `npm test`; every test that passed before must pass (320 tests on the parent branch).
- [ ] **Step 5: Commit** `feat(graph-explorer): navbar with five views; hash routing; Browse is today's workspace`

### Task 2: Overview page

**Files:**
- Modify: `public/index.html` (a `renderOverview()` that fills `#pagePane` when `view === "overview"`; move the import button out of the masthead into the card)
- Test: `test/e2e.test.ts`

**Interfaces:**
- Consumes: `showView`, `body[data-view]`, `openImport()` (line ~4522), `rowEl`-style open behaviour `openNode(item)`.
- Produces: `type OverviewNode = { id: string; type: "experiment"; label: string; facts: string[] }`; `function overviewNodes(experiments: Item[]): OverviewNode[]` (pure, the one place a future graph reads); `renderOverview(): void`.

- [ ] **Step 1: Write the failing tests**: (a) `"overview shows the import card and the trials"` with `api/experiments` stubbed to two experiments: card button text is `Import from an instrument…`, two trial rows with names, each with a `.row-open` arrow; clicking an arrow switches to `data-view="browse"` with that experiment open. (b) `"overview with no trials still works"`: stub `api/experiments` to `[]` then to a 500; page shows the card and a plain sentence, and no console errors.
- [ ] **Step 2: Run** them; expected FAIL.
- [ ] **Step 3: Implement** `renderOverview` from the data the page already loads for the Experiments category (reuse, do not add a second fetch if the category list is already cached; otherwise `fetch("api/experiments")`). `facts` come from what the list already carries (e.g. visibility); do not add per-trial API calls. The card button keeps the id `importBtn` so existing tests and the rehearsal keep working. Remove the masthead button.
- [ ] **Step 4: Run full `npm test`** and `npm run demo:rehearse` is deferred to Task 6. Expected: all pass.
- [ ] **Step 5: Commit** `feat(graph-explorer): Overview front door — search, import card, your trials`

### Task 3: Import page

**Files:**
- Modify: `public/index.html` (`renderImportPage()`)
- Test: `test/e2e.test.ts`

**Interfaces:**
- Consumes: `api/provenances` (existing list route, type `provenance`), `openImport()`.
- Produces: `renderImportPage(): void`.

- [ ] **Step 1: Failing test** `"import page lists past imports and opens the dialog"`: stub `api/provenances` with two items; page shows both rows with `›` and a button `New import…` that opens `#importOverlay`; empty list shows "No imports yet." and the button.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Rows open the provenance with the existing `openNode`. Do not add Undo (needs delete-by-import, not built); the row hint says only what exists today.
- [ ] **Step 4: Run full `npm test`.**
- [ ] **Step 5: Commit** `feat(graph-explorer): Import page lists past imports beside New import`

### Task 4: Set up page

**Files:**
- Modify: `public/index.html` (`renderSetupPage()`)
- Test: `test/e2e.test.ts`

**Interfaces:**
- Consumes: the trial list from Task 2, the cached `NODE_DETAIL[experimentId].relations`, the existing "+ New" flow (`creation.js`).
- Produces: `renderSetupPage(): void`; `setupSteps(detail): { key: string; label: string; done: boolean; hint: string }[]` (pure).

- [ ] **Step 1: Failing tests**: pure `setupSteps` for a detail with plants/factors/germplasm/devices vs. one with none (steps: Experiment, Plants and blocks, Treatments, Varieties, Equipment; `done` true only when that relation is non-empty); e2e: page asks "Which trial?" with the trials as rows, choosing one shows the five steps with ticks and a `+ New` on unfinished ones.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** First read a real experiment's `api/node-detail` response (run the portal, `curl`) to confirm which relation labels map to each step; write the mapping from what you see, not from this plan. `+ New` opens the existing creation flow for that type with the trial pre-selected. If a step has no existing creation flow, show the row without a button and say so in the hint.
- [ ] **Step 4: Run full `npm test`.**
- [ ] **Step 5: Commit** `feat(graph-explorer): Set up page — checklist for one trial`

### Task 5: Manage and Browse polish

**Files:**
- Modify: `public/index.html`
- Test: `test/e2e.test.ts`

- [ ] **Step 1: Failing test** `"manage opens on groups and keeps the selection"`: select a row in Browse, switch to Manage and back, assert the selection count is unchanged and Manage shows the Groups list.
- [ ] **Step 2: Run, expect FAIL** if Task 1's Manage entry is not yet there; otherwise this passes and the step is a regression guard.
- [ ] **Step 3: Implement** anything missing; Browse lists Trials first, then the other kinds (reorder `ROOT` presentation only, do not rename PHIS kinds).
- [ ] **Step 4: Run full `npm test`.**
- [ ] **Step 5: Commit** `feat(graph-explorer): Manage opens on groups; Browse lists trials first`

### Task 6: Demo path and runbook

**Files:**
- Modify: `scripts/demo-rehearsal.mts`, `docs/superpowers/demo-runbook.md`, `docs/superpowers/specs/2026-10-09-portal-shell-design.md` (status line: Overview/Set up/Import/Manage first version built)

- [ ] **Step 1:** Run `npm run demo:reset`, then `npm run demo:rehearse`. Fix the script where it assumed the old start page (it starts on Overview now; it clicks the card's `Import from an instrument…`). Expected: rehearsal passes end to end; ends at the Browse workspace on the new experiment.
- [ ] **Step 2:** Run `npm run demo:reset` again (phis-test must be left clean), then `DEMO_VIDEO=1 npm run demo:rehearse` and reset once more to re-make the fallback video.
- [ ] **Step 3:** Update the runbook's step 1 ("On the start page" → Overview card) and the "menu structure is being reworked" line.
- [ ] **Step 4: Commit** `docs(graph-explorer): demo path and runbook start on Overview`

---

## Self-review notes

- Spec coverage: navbar and hash routes (T1), Overview (T2), Import (T3), Set up (T4), Manage/Browse (T5), demo (T6). Not covered by design: stage tabs on the trial page, picker and inline editor, "More actions" folding (all listed out of scope).
- Types: `View`, `showView`, `OverviewNode`/`overviewNodes`, `renderOverview`, `renderImportPage`, `renderSetupPage`, `setupSteps` are named the same wherever used.
- Known soft spot: Task 4's step mapping depends on real node-detail data and is deliberately decided at implementation time.

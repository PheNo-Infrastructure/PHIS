# Graph Explorer — Unified Rebuild (supersedes 2026-09-17-graph-explorer-v2-design.md)

> **Moved 2026-09-25** from the PhisWebPortal repo (`PhisWebPortal@f740511`, branch `worktree-graph-explorer-v2`) into the PHIS repo. Code: `graph-explorer/`. Streamlit-era files mentioned below as reference (`utils/*.py`, `pages/`, `instruments/`) stayed in PhisWebPortal.


## Status

Supersedes the Streamlit-based v2 design. That spec's Phase 0 (multi-select
feasibility) and the interactive prototype built during its Phase 1 review
proved the *interaction design* (breadcrumb nav, Windows-Explorer-style
selection, a selection tree, adjacency-driven creation) — but also proved
Streamlit could not deliver it at an acceptable visual/interaction quality
without constant fighting. This spec keeps the validated design and changes
the platform and the product scope.

## Development process — read this before writing any task plan

**No upfront multi-phase plan.** This is a deliberate, explicit instruction
from the user, given after the original v2 plan's Phase 1/Phase 3 split
(nav shipped separately from selection) turned out to feel disconnected
and premature — the exact failure mode this process exists to prevent:

> "We build the tower from bottom to top. Small pieces. Top pieces must
> work with the bottom pieces... We must not necessarily identify every
> future step, but only the next step. We identify the bottom, which we
> already have (your previous artifacts), then we find the next step. The
> next step will be a small addon, that works with the previous and is
> easy to test."

Concretely, for whoever picks this up next (including a future session
with no memory of how this spec came to be):

1. **The bottom already exists — open it, don't just read about it.**
   `graph-explorer/public/index.html` is
   the actual, validated, working mockup (open the file directly in a
   browser — it's fully self-contained, no server needed). Breadcrumb nav,
   Windows-Explorer-style selection, the selection tree with connector
   lines, recursive category group-selection, local breadcrumb,
   adjacency-filtered "+ New" menu — all real, all clickable, all approved
   after roughly a dozen rounds of live feedback. This file is the
   foundation. It is not a throwaway prototype to be redesigned — it's
   the thing everything else attaches to.
2. **Identify only the next step, not the whole roadmap.** Do not write a
   Phase 0–N plan document covering backend scaffolding through every
   node type's creation panel. Figure out the single smallest next piece
   that builds directly on what currently works.
3. **Every step must (a) be small, (b) actually connect to what's already
   there — not sit parallel to it waiting to be wired in later — and (c)
   be easy to test on its own**, ideally by literally opening the running
   result and seeing the new piece work inside the same validated UI, not
   by reading code or trusting a description.
4. **Get the step confirmed working before finding the next one.** Do not
   queue up multiple steps in advance. This spec captures the destination
   and the reasoning; it does not capture the sequence of steps to get
   there — that gets decided one step at a time, each time informed by
   what the previous step actually proved.

## Core message (unchanged from the original brainstorm)

The portal's UI didn't feel professional. Scoped down to Graph Explorer
first, because Graph Explorer was never really "browse a graph" — its job
is letting the user find or create the **correct anchor point** in the RDF
graph before data goes in, so imports never create orphaned nodes.
OpenSILEX's model ties everything together through relations: a scientific
object with no experiment, a device with no facility, is a broken import.

What's changed is the conclusion, not the message. Instead of Graph
Explorer being the front door to a separate import tool, it now **is** the
tool. Browsing, creating, linking, and importing are the same interface
because they were always the same problem — confirm the right anchor, then
act on it.

## Creation model: minimize orphaned nodes

This is the load-bearing idea behind the "+ New" mechanism, worked out
across a live session and easy to silently drift away from if
re-derived from code alone — captured here so it doesn't have to be.

**The shared goal, stated plainly:** *minimize* orphaned nodes — not
eliminate them by requiring a relation at birth. Corrected mid-session
after initially over-reading this as "every created node must have a
relation": clusters have to start somewhere, and OpenSILEX's own data
has real standalone roots (a top-level organization has no parent).
The actual rule is narrower and about *timing*, not *requirement*:
creation driven by a selection stays linked — the new node attaches to
everything selected, per the intersection rule below — but creation
from nothing selected (browsing straight to a category page) is
allowed to be standalone. Minimizing orphans means linking should stay
*easy* once there's something real to link to (see "Current
implementation status" — a freshly created node, standalone or linked,
lands in `selection` either way, ready to be ctrl-clicked together
with something else), not that every node is forced to guess at a
relation just to exist. Preventing genuinely meaningless/broken
relations (see intersection rule below) is still the entire reason
Graph Explorer exists (see Core message above) — that part is
unchanged.

**Why the "+ New" menu is an intersection, not a union.** When multiple
nodes are selected, a single new node gets linked to *all* of them at
once — not to whichever one happens to accept it. So the menu must only
offer a type that is a valid adjacency target for *every* selected node
simultaneously. Offering a type that's only adjacent to some of the
selection would suggest a create-and-link action that silently fails
(or silently orphans) for the rest. This was implemented as a union
first, then corrected — worth remembering because "union" is the more
intuitive first guess and the bug doesn't announce itself: the menu
just quietly offers more than it should.

Confirmed empirically, not just in theory: audited all 78 pairwise
combinations across the 13 wired types against the real `ADJACENT` data
— 32 pairs (41%) produce a genuine non-empty intersection (e.g.
Scientific Object + Germplasm → `{scientific_object, germplasm}`,
Experiment + Project → `{project, person}`), and the other 46 correctly
resolve to "nothing can be linked to all of these at once." The
mechanic does real, non-vacuous work — it isn't degenerate.

**Three tiers of autonomy, same underlying rule, different failure
modes:**

1. **Manual** (Graph Explorer's UI, what exists today) — a human selects
   anchors and picks one type from the menu. Failure is soft: an invalid
   type simply doesn't appear.
2. **File importation** (the instrument-plugin import path from Product
   scope below — not yet built). Semi-autonomous: a plugin parses a
   file, each row's values get resolved against existing graph nodes
   (entity resolution — doesn't exist yet), a reviewable import plan is
   built from that, and a human approves the *plan* once rather than
   each row individually. A row that fails the adjacency check gets
   flagged into that plan for review (or triggers the recursive
   "create the missing dependency first" path), not silently dropped or
   silently created as an orphan.
3. **Pipeline automation** (fully unattended, no human review at all) —
   **explicitly out of scope**, not currently relevant to Graph
   Explorer, named here only so it isn't accidentally designed for
   prematurely. If it's ever built, it needs hard-fail-and-log
   semantics (reject the row, never silently create an orphan) since
   there's no human downstream to catch a mistake.

Tiers 1 and 2 are both real and already implied by this spec's Product
scope. Tier 3 is not — don't let it creep into near-term design.

**The generalization guardrail.** Discovery (manual: given selected
anchor types, find valid target types) and validation (file import:
given a plugin-declared target type and a row's resolved anchors, is
that link valid?) are the *same* rule, just called two different ways —
`targetType ∈ creatableTypesFor(anchorTypes)` is validation,
`creatableTypesFor(anchorTypes)` alone is discovery. Concretely, this
means the adjacency rule must stay a pure, direction-agnostic function
with no DOM or browser dependency, reachable from a Node context (a
future import pipeline) as easily as from the click UI — not
reimplemented twice. Already done: `graph-explorer/src/adjacency.js` holds
`ADJACENT` and `creatableTypesFor`, is inlined into the served page as a
plain script (the page has no build step) and is also imported directly
by Node tests — one file, both consumers, no duplication risk.

## Product scope

**One page.** Not "Graph Explorer plus Instrument Import plus TraitFinder
plus the rest of the portal" — just Graph Explorer, doing all of it.
Everything reachable today from the old portal's separate pages becomes an
action available from wherever you're standing in the graph:

- Browsing the catalog (the old accordion / the old multi-page tree).
- Creating and linking any node type (the generic adjacency mechanism from
  the original v2 spec, Parts 2–5 — unchanged in design, just no longer
  gated behind Streamlit dialogs).
- Importing instrument data (the old instrument-import wizard's job) —
  surfaced as a "+ New" action on an experiment, not a separate
  destination.

**What's explicitly NOT in scope right now:** authentication/SSO. The plan
in the original v2 spec was for PHIS (the instrument-side software, outside
this repo) to eventually launch the portal pre-authenticated. That patch
doesn't exist yet and isn't scheduled — "another day." Until it does, this
rebuild has **no login flow of its own** and is **dev-only, never exposed
on the public web** (see Deployment below). The old Streamlit portal stays
running, untouched, at its current URL until this one is ready to replace
it — no migration, no parallel-auth bridging, no feature-parity pressure on
day one.

## Architecture

**Design carries forward. Files don't — with exactly one exception.**
Nothing currently in this repo's Streamlit-era code —
`utils/graph_explorer/*.py`, `utils/import_wizard.py`,
`utils/instrument_registry.py`, any Streamlit page — is being wrapped,
reused, or treated as an anchor on any decision here. The one file that
DOES carry forward is
`graph-explorer/public/index.html` itself
— not as code to import, but as the executable record of the validated
design: the interaction/visual design proven there, and the *shape* of the
instrument-plugin pattern (a protocol every plugin satisfies, auto-
discovered, no registry edits to add
one). Neither is tied to Python. The existing Python files remain useful
only as a record of which OpenSILEX/SPARQL calls and query shapes actually
work — reference material, not code to import.

**Language: one stack, chosen on its own merits, not by file gravity.**
Earlier reasoning here (first "keep Python for the SDK," then "keep Python
because the import pipeline is pandas-native") both leaned on treating
existing code as load-bearing. Corrected: the SDK is regenerable
boilerplate (`opensilexClientToolsPython` is Swagger Codegen output; the
live server publishes its own current spec at
`https://phis.pheno.no/rest/swagger.json`, from which an equivalent typed
client can be generated for any language via `openapi-generator` — the
currently pinned client is even stale, `1.5.0` against a live `1.5.4.7`
server). And whether instrument-parsing scripts need to be Python at all
is itself unconfirmed — scientists contributing their own parsing code is
a *possible* future requirement, not a locked one.

With neither pulling toward Python, and the frontend already vanilla JS:
**Node/TypeScript, end to end.** One language for frontend and backend,
one dev loop, no venv/Docker split for the parts that don't need one — a
typed OpenSILEX client generated from the live `swagger.json` with a
TypeScript template, a plugin system built the same way
`InstrumentPlugin` was designed (an interface every plugin satisfies,
auto-discovered from a plugins directory) but implemented in TypeScript.
If a scientist someday needs to contribute a plugin in Python specifically,
that ONE plugin can shell out to a Python subprocess for its parsing step
— an escape hatch for a real future need, not something to build
speculatively now.

Concretely, the backend needs to provide:

- List/node-detail endpoints (what `catalog.py`/`sparql.py`/
  `neighborhood.py` do today, reimplemented against the same OpenSILEX
  REST + GraphDB SPARQL endpoints, informed by — not copied from — the
  existing query shapes). **Done for list endpoints** — see Current
  implementation status below; node-detail (a selected node's own
  relations, beyond the flat category lists) is not built yet.
- The type-adjacency index driving "+ New" (`relation_schema.py`'s design
  from the original v2 spec, Phase 2 — a data structure, not tied to any
  language). **Done** — `graph-explorer/src/adjacency.js`, see Creation model
  above.
- Import endpoints: entity resolution against existing graph nodes,
  building and executing an import plan, anchored to whatever node is
  selected in the graph instead of a separate wizard's own picker step.
  **Not started.**
- A plugin loader: scan a plugins directory, each exposing detect/parse/
  build-DTOs functions against a shared interface — the concept from
  `InstrumentPlugin`, not the file. **Not started.**

No framework was ever added (no Express/Fastify) — a single
`node:http` handler turned out to be simpler than a router for the
routes built so far. Revisit only if routing complexity actually
demands it.

### Current implementation status (update this, don't let it go stale)

- `graph-explorer/src/` — a plain Node/TS backend (runs via
  `node --experimental-strip-types`, no build step, no framework),
  serving the mockup page and 14 real OpenSILEX list endpoints
  (Organizations, Experiments, Projects, Facilities, Devices, Sites,
  Persons, Scientific Objects, Variables, Germplasm, Data files,
  Provenances, Events, Documents, Factor). Tabular Data is deliberately
  unwired — `/core/data` returns measurement rows, not named nodes; see
  the comment at its `CATEGORY_ITEMS` entry in the mockup. Split into
  modules once it grew past one file's worth of distinct concerns:
  `opensilex.ts` (auth/token cache, the authed GET/GET-one/POST/PUT/
  DELETE verbs, `OpenSilexError` for surfacing real OpenSILEX
  status/messages instead of a flattened 502), `http.ts` (tiny generic
  node:http helpers, incl. the `RouteHandler` shape every route module
  implements), `routes/{static,list,create,node}.ts` (one file per
  route group), and `index.ts` itself now just a list of route
  handlers tried in order plus the server bootstrap — adding a new
  route group is "add one file + one list entry," not growing an
  if/else chain. `adjacency.js` and `creation.js` stay plain JS at the
  top level (not under `routes/`) since they're also served/inlined
  directly to the browser, unlike the TS route modules.
- `graph-explorer/src/adjacency.js` — the type-adjacency rule (`ADJACENT`,
  `creatableTypesFor`), shared verbatim between the served page and
  Node/tests. See Creation model above for why this needed to be pulled
  out on its own.
- `graph-explorer/src/creation.js` — real creation, two types so far
  (`facility`, `organization`). A small data-driven config
  (`CREATABLE`), same sharing pattern as `adjacency.js` (inlined into
  the served page, imported directly by the backend and tests — one
  source of truth). `POST /api/create`'s `links` is now optional —
  see the Creation model's corrected "minimize, don't require" framing
  above. Given links, it still re-validates the selection against
  `creatableTypesFor` itself (not just trusting the UI already
  filtered it) before building the payload and POSTing to OpenSILEX,
  and groups multiple same-type links into one array — the
  organization↔facility relation is N:N, so selecting two organizations
  before creating a facility links it to both, not just one. Given NO
  links, the intersection check is skipped entirely (nothing to
  validate against) and the type only needs to exist in `CREATABLE` at
  all — this is what powers the standalone "+ New <type>" button (see
  below). On success the frontend auto-attaches the created node into
  `selection` (standalone or linked, either way — ready to be
  ctrl-clicked together with something else) AND
  pushes it into the same `CATEGORY_ITEMS` array the category browser
  reads, so it's visible immediately without a reload. Everything else
  in `ADJACENT` (experiment, project, scientific_object, ...) still
  shows the placeholder toast — those DTOs need fields beyond a name +
  link (e.g. `ExperimentCreationDTO` needs `objective`/`start_date`),
  which is a bigger step than this one. Verified against the real
  OpenSILEX instance manually (create a facility under a real
  organization, confirm it shows up both in the app and in PHIS
  itself); the automated e2e test intercepts `POST /api/create` so
  the test suite itself never writes to the shared live instance.
- Standalone creation: the action bar isn't just idle when nothing's
  selected — browsing straight to a leaf category page (e.g.
  Organizations, Facilities) with no selection shows a "+ New <type>"
  button, distinct from the selection-driven "+ New" menu (different
  label, no dropdown, no link required), for any type `CREATABLE` has
  an entry for. `TYPE_FOR_CATEGORY` (the mockup, inverse of
  `CATEGORY_FOR_TYPE`) drives which type a given category page creates.
  Both creation entry points now funnel through one shared
  `createNode(type, name, links, toastSuffix)` frontend function
  instead of duplicating the POST/auto-attach/toast logic.
- Linking EXISTING nodes directly (no third node created) — the
  natural follow-up to standalone creation: "I made a node with
  nothing selected, now connect it to something real." Generalized
  beyond a single pair once the user pointed out ADJACENT is really
  the governing concept: "in theory, anything that could be adjacent
  should be linkable, maybe even at once... choosing 4 facilities and
  an org should be able to link that to an org." `POST /api/link`
  takes `{items: [{type,id}, ...]}`, any size, any mix of types — same
  "everything selected participates" philosophy `/api/create`'s
  `links` already uses for a brand-new node, just applied to nodes
  that already exist. Server groups by type, and for every pair of
  distinct types present, `node-types.ts`'s `linkFieldFor(typeA,
  typeB)` decides which side owns a settable field pointing at the
  other (checks both directions; returns null for same-type pairs —
  e.g. two organizations, where which one is the parent is ambiguous
  from the pair alone, not handled yet). Same-type items on the
  resolved side are batched into **one PUT per owner**, not one call
  per pair — 4 selected facilities plus 1 selected organization is one
  PUT to the organization with all 4 appended to `facilities`, not 4
  separate calls (confirmed by a backend test asserting exactly one
  PUT fires). `updatePayloadFromDto` gained a `link: {field, uris}` op
  (plural) alongside the existing `unlink` — same read-current-DTO-
  then-full-PUT shape, appending instead of filtering, deduped so
  linking an already-linked pair is a harmless no-op on the wire.
  Frontend: a "Link selection" button appears whenever the selection
  contains at least one resolvable type pair — `selectionHasLinkablePair`
  checks every distinct-type pair present against both `LINKABLE_TYPES`
  (a hand-maintained companion list of which types `NODE_TYPES` actually
  covers — checked against drift by an e2e test, same pattern as
  `CATEGORY_FOR_TYPE`) and `ADJACENT`, since `ADJACENT` alone is too
  loose a proxy (e.g. it still lists organization↔site as related even
  though neither side can own that field yet). On success every
  selected node's `NODE_DETAIL` cache entry is dropped (not patched) so
  each refetches fresh relations next time it's opened. Verified live
  end to end: created a standalone organization, ctrl-selected 4 real
  facilities alongside it, clicked "Link selection", and confirmed via
  a fresh `GET /api/node-detail` that the organization now lists all 4
  as real relations.
- "Link existing…" — a two-level, breadcrumb-style popover next to
  "+ New" that addresses the friction "Link selection" still had:
  building a link meant navigating away to manually find and ctrl-
  click the target, losing sight of what you started from. Went
  through three real iterations in one session, each corrected from
  live feedback rather than guessed right upfront:
  1. **Flat dropdown, click-links-immediately.** Didn't scale, no
     multi-select: "this menu does not scale well... we need the same
     shift, ctrl and drag functions on every menu... adding links 1 by
     1 is not very fun."
  2. **Two-level type→item browser with pick-then-confirm.** Level 1
     picks a candidate *type* (a tiny category list, e.g.
     "facility · 28"); level 2 browses that type's real items with a
     live search box, picking into a local `linkPickerPicked` set with
     the exact same click/ctrl/shift rules as the main rowlist's
     `applyClick`. A confirm button ("Link N picked") does one
     `linkItems()` call for the whole batch. Shipped with two real
     bugs, both caught live: plain click was made to behave like ctrl
     (both just toggled, reasoning "picking is additive") instead of
     REPLACING the pick set like the main list does — a stray sequence
     of plain clicks accumulated 26 picks instead of replacing down to
     1; and the `.selected` class was toggled in JS but the CSS rule
     for `.newmenu-item.selected` was never written, so picks never
     rendered as highlighted regardless of how many were correctly
     tracked underneath. Both fixed, both locked in with e2e tests
     (click-semantics test asserts row counts after plain/ctrl clicks,
     not just internal state). Also added: an explicit × close button
     (only had close-on-outside-click before) and drag-marquee was
     deliberately left out of the popover itself (wiring it into a
     small scrolling list is real added complexity for a secondary
     gesture click/ctrl/shift already covers) — a documented trade-off,
     not a silent omission.
  3. **Organizations pick the exact same way as everything else — see
     the "Organization↔organization linking" entry below** for what
     replaced the second design's separate "Set as parent"/"Set as
     child" buttons, which the user correctly called out as ambiguous
     copy (parent/child of *what*, exactly?) and inconsistent with "the
     same shift/ctrl functions... as every other menu."

  `linkableExistingTypes()` reuses the exact same intersection rule
  `creatableTypesFor` already uses for "+ New" (a candidate type must
  be adjacent to every currently selected item), narrowed to
  `LINKABLE_TYPES` on both the candidate and every already-selected
  type, and makes one exception: organization is allowed as a same-
  type candidate when exactly one organization is selected (see below
  for why that's resolvable and other same-type cases aren't).
  `linkPickerCandidatesByType()` groups real candidates by type,
  sourced straight from `CATEGORY_ITEMS` (already-fetched, no new
  endpoint). Verified live: selected only UiT, opened "Link
  existing…", drilled into facility, searched "HOLT", picked two, and
  linked both in one confirm without ever leaving the Organizations
  page.
- **Organization↔organization linking**, resolved by a drag-to-rank
  modal instead of guessing or an explicit per-row button. Asked about
  three times over the session, correct every time: `parents` is a
  real settable field, `children` isn't (derived from the other org's
  `parents`), so given two organizations there's no way to know which
  should become the other's parent from the pair alone — a genuine
  ambiguity, not a bug to route around. Design went through two builds:
  a first pass added explicit "Set as parent"/"Set as child" buttons
  per candidate row, which worked but was flagged as unclear ("which
  exactly is set as parent?") and broke the "same interactions
  everywhere" rule (no shift/ctrl multi-select in that mode, no
  batching). Replaced with what the user described in full: pick
  organizations with the SAME click/ctrl/shift rules as any other type
  (`linkableExistingTypes()` allows "organization" as a candidate only
  when exactly one organization is selected — `ambiguousPickIds()`
  is what later recognizes which picks need this path); confirming
  routes picks with an ambiguous relation to `selection`'s single org
  anchor into a **ranking modal** (`enterLinkRanking`/
  `renderLinkRankingModal`, `linkRanking` state) instead of linking
  them blindly — the anchor sits fixed in the middle, candidates start
  in a Children zone below it, and native HTML5 drag-and-drop moves
  them into a Parents zone above (or back). Rows in the ranking modal
  support the identical click/ctrl/shift multi-select as everywhere
  else, and dragging a row that's part of the current selection moves
  the whole group at once. Unambiguous picks in the same confirm
  action (e.g. a facility picked alongside organizations) link
  immediately via the normal path — only the ambiguous ones go to
  ranking. Confirming the ranking does one batched `PUT /api/node`
  to the anchor for everything left in Parents (`link: {field:
  "parents", uris: [...]}`, all at once — same batching `/api/link`
  already does for same-field items) and one `PUT` per organization
  left in Children (each owns its own `parents` field, so these can't
  be batched into a single call the way the Parents side can). `PUT
  /api/node` itself was generalized to accept this `link: {field,
  uris}` body alongside the existing `unlink` (same `updatePayloadFromDto`
  mod shape `/api/link` already used internally, exposed on the public
  per-node endpoint too — no new route needed). Selecting more than one
  organization at once still gets no "organization" candidates
  (direction would be ambiguous across multiple anchors, and there's
  no anchor to fix in the middle of a ranking view) — not handled,
  same limitation as before, just narrower in scope now. Verified live
  end to end twice: once dragging a single candidate into Parents
  (confirmed via `GET /api/node-detail` that it's a real "Parent
  organizations" relation on the anchor), once with two candidates —
  one dragged to Parents, one left in Children — confirming both a
  batched-parent PUT and a separate child-owned PUT actually landed.
- View/edit/delete, data-driven, two types so far — facility and
  organization. `graph-explorer/src/node-types.ts` holds `NODE_TYPES` (same
  "add one entry" shape as `CREATABLE` in creation.js: per type, the
  get/put/delete URLs, which GetDTO fields are relations worth showing
  — `relationGroups` — and which of those are actually settable on
  that type's UpdateDTO — `updateLinkFields`, since some GetDTO
  relations are read-only/derived, e.g. an organization's `children`/
  `sites`/`experiments` aren't fields on `OrganizationUpdateDTO` at
  all, only `parents`/`facilities` are). `GET /api/node-detail`
  fetches the live DTO and maps it through `relationsFromDto` into the
  relation-group shape `NODE_DETAIL` (in the mockup) already knew how
  to render (`{uri, relations: [{label, items}]}` — that rendering
  code predates this work and was just never fed real data before).
  `PUT /api/node` renames a node; because every type's update endpoint
  is a full-DTO replace, it reads the current DTO first and carries
  `updateLinkFields` forward unchanged via `updatePayloadFromDto`,
  rather than risking a silent unlink. `DELETE /api/node` deletes one.
  The frontend needed zero changes to pick up the second type — it was
  already fully generic over `item.type`, never hardcoded to
  "facility" (confirmed by grep before adding organization). Fetches
  node-detail on open (`openNode` → `loadNodeDetail`, populates
  `NODE_DETAIL` as a cache, not a preload) and shows Rename/Delete
  buttons only once a real detail response has come back — same
  honesty rule `CREATABLE` follows for the "+ New" menu: a type the
  backend doesn't support yet just keeps the existing "No connections
  found" fallback, never a broken button. Rename mutates the shared
  node object in place (same object reference lives in
  `selection`/`CATEGORY_ITEMS`/`path`, per the auto-attach-on-create
  pattern), so every view of it updates without extra sync code.
  Delete removes it from `CATEGORY_ITEMS`/`selection`/`NODE_DETAIL` and
  pops `path` back a level if the deleted node was the one open.
  OpenSILEX's own referential-integrity check (can't delete a facility
  still linked to an organization) surfaces as a real 409 with its
  actual message, not a flattened 502 — confirmed live both ways:
  deleting a facility right after creating it (which always leaves
  exactly that link) is correctly refused with the real OpenSILEX
  conflict message, and opening the real UiT organization now shows
  that same facility as a real "Facilities" relation.
- Delete no longer just fails when a node has real relations — it
  routes into an inline "unlink before delete" view instead (per-item
  Unlink, or "Unlink all"), reusing the exact same `PUT /api/node`
  mechanism as rename: an `unlink: {field, uri}` body drops one uri
  from one field via the same read-current-DTO-then-full-PUT path, and
  the response includes the refreshed relations so the frontend
  updates its cache without a second GET. `relationsFromDto` only
  attaches a `field` to a relation group when it's in
  `updateLinkFields` — that's the one signal the frontend needs to
  decide whether a relation is unlinkable at all (e.g. a facility's
  Devices relation isn't — devices reference the facility from their
  own record — so it shows read-only with a note instead of a dead
  Unlink button). `unlinkTargetId` (which node is mid-unlink) resets
  automatically once relations hit zero, so Delete becomes actionable
  again without any extra step, and also resets on any navigation.
- Fixed a real breadcrumb bug found while testing the above: following
  a relation chip (e.g. Org -> its Facility -> back to the same Org)
  used to just append onto whatever trail got you to the current node,
  so a chip round-trip grew the breadcrumb forever instead of landing
  back on the target's own spot in the tree. `openRelatedNode` (chip
  clicks) now computes the target's canonical two-level category path
  via `canonicalPathFor` and jumps there, instead of appending like
  `openNode` (real drill-down navigation, where appending is correct)
  still does. Confirmed live: UiT -> its Facilities relation -> that
  facility now lands on `Graph > Scientific Organization > Facilities
  > <facility>`, not a growing Org/Facility ping-pong trail.
- Delete's label is dynamic — plain "Delete" when nothing blocks it,
  "Unlink/Delete" once the node has relations — since the button
  doesn't just delete in that case, it redirects into the unlink view;
  saying so upfront avoids a misleading label.
- Relation chips now support the same ctrl/meta-click-to-select
  interaction as rows in the left pane, in both the normal relations
  view and the unlink view: plain click still navigates (or, while
  unlinking, does nothing — that view is for managing links, not
  wandering off), ctrl/meta-click toggles the chip into/out of the
  current `selection` without disturbing whatever else is already
  selected (`toggleChipSelection` — same "add, don't replace"
  reasoning `addToSelectionFromGraph` already used for picks from the
  simulated graph panel) and switches to tree mode so the pick is
  immediately visible. Chips reflect membership with a `.selected`
  style, matching `.row.selected`. This means a selection can now be
  built up across several nodes' relations without leaving the detail
  pane at all — e.g. open an Organization, ctrl-click one of its
  Facilities into the selection, open a different Experiment, ctrl-click
  one of ITS Persons in too, and both end up in the same selection tree.
- **Site** is the third fully wired type (view/rename/delete/create/link) — one entry each in
  `NODE_TYPES` and `CREATABLE`, plus `"site"` in `LINKABLE_TYPES`. `ADJACENT.organization`
  gained `"site"`: `creatableTypesFor` only reads the *selected* type's list, so without it an
  org selection never offered site in "+ New" or "Link existing…", even though
  `SiteCreationDTO.organizations` owns that link (an org's own `sites` is derived, read-only).
  OpenSILEX refuses a site with no organization ("A site must be attached to at least one
  organization"), so `CREATABLE.site.requiresLink = "organization"` and the standalone
  "+ New site…" button opens the "Link existing…" picker locked to organizations
  (`linkPickerMode`: one fixed type, no type list, its own confirm action) instead of
  POSTing something that can only fail. Same click/ctrl/shift rules and search as every
  other list; multiple orgs allowed (`SiteCreationDTO.organizations` is a list). Confirm
  ("Create site in N organizations") → name prompt → the usual `createNode` with all picks
  as links. The popover markup/wiring is shared with "Link existing…"
  (`linkMenuHtml`/`wireLinkMenu`). Verified live: created a site in two throwaway orgs via
  the real page, PHIS showed both links, cleaned up.
- **Deleting a site down to its last organization.** Delete routes a linked node into
  unlink mode, but a site's last org can never be unlinked (OpenSILEX refuses it), so a
  site was undeletable from both sides. Deleting from the org was considered and rejected —
  ambiguous/risky for a site shared by several orgs. Instead `lastRequiredLink` (driven by
  the same `CREATABLE[t].requiresLink`) detects the single remaining required link: its
  chip loses the × and the unlink banner says why ("a site must belong to at least one
  organization, so <org> can't be unlinked") and offers "Delete site", whose confirm names
  every link that goes with it (`deleteNode(item, force)`; OpenSILEX drops a site's links
  on delete — confirmed live). With 2+ orgs, unlinking works as before; "Unlink all" keeps
  the last required link instead of failing halfway. A forced delete also invalidates every
  related node's `NODE_DETAIL`. Verified live: site in two throwaway orgs + a facility,
  unlinked one org in the UI, banner switched to the last-org state, deleted — gone in PHIS,
  no org/facility still references it.
- **One node, one id.** OpenSILEX's POST returns a created node's full uri
  (`https://phis.pheno.no/id/...`) while every list/relation GET returns it prefixed
  (`phis:id/...`), so a node created in-session and later reached via a relation chip
  existed under two ids — deleting it left the other copy in the Sites list/selection until
  a reload. `/api/create` now compacts its id with `compactUri` (opensilex.ts), using
  OpenSILEX's own prefix table from `GET /ontology/name_space` (fetched once, longest
  namespace wins, never throws — falls back to the full uri rather than failing a create
  that already succeeded). Verified live: created a site via the picker, reached it via its
  org's Sites chip — same id — deleted it, Sites list and selection updated without reload.
- **Restored 2 org types lost to the old wiping PUT.** A read-only scan found exactly the two
  orgs modified during the 2026-09-22 live ranking tests (Plant Phenotyping NMBU, Climate
  Laboratory - Holt) reset to the default `foaf:Organization`, while all 7 others kept a
  specific type. Set back to `vocabulary:NationalOrganization` / `vocabulary:ResearchUnit`
  (user-confirmed) via the fixed full-DTO PUT; parents/facilities verified unchanged.
  Facilities were untouched (none modified in that window).
- **Device deferred** after a swagger/live check: `rdf_type` is required (a specific device
  class), and device↔facility isn't a DTO field at all — hosting comes from move events
  (no real device has one yet). Not a one-config-entry step.
- **Experiment, view-only** (first slice toward imports, which anchor on an experiment).
  `NODE_TYPES.experiment` with `readOnly: true`: node-detail shows Organizations,
  Facilities, Projects, supervisors and Factors as chips; the backend refuses PUT/DELETE for
  a readOnly type (400, never reaches OpenSILEX), node-detail returns `readOnly` and the
  frontend hides Rename/Delete for it. Read-only types stay out of `LINKABLE_TYPES` (drift
  test now compares against non-readOnly `NODE_TYPES`). `relationsFromDto` also accepts
  bare-uri refs — an experiment's supervisors/factors are plain strings, so those chips show
  the uri until persons get a label lookup (empty in all 3 real experiments today).
  Verified live, read-only: NMBU_ProteinBar_251022 shows its real org + 2 facilities, no
  edit buttons, chip round-trip experiment → org → back lands on canonical crumbs, zero
  non-GET requests.
- **Experiment creation.** `CREATABLE.experiment` links organisations/facilities and declares
  `fields` (objective + start date required, end date optional). `askCreateValues(type)`
  is now the one entry point every creation path asks through: a plain `prompt()` for
  name-only types, a native `<dialog>` form built from `fields` otherwise (browser-enforced
  `required`, date inputs). `/api/create` passes through only declared field keys, 400s a
  missing required one, and now refuses a link type the config has no field for instead of
  silently dropping it (a quiet orphan) — e.g. "+ New" → experiment from a selected project
  shows the placeholder toast, and the API refuses it too. `ADJACENT.organization`/`facility`
  gained `experiment` (same one-sided-list gap site had). Note: the 78-pair intersection
  audit in "Creation model" predates the site/experiment additions — its exact 32/46 split
  no longer holds, the mechanism does. Verified live: throwaway org selected → "+ New" →
  experiment → form → PHIS has name/objective/start date/org link; opened it in the
  view-only detail showing that org; deleted via the API (the app can't delete experiments).
- **Experiments are linkable** ("every resource should be able to use the link function").
  `readOnly` is gone, replaced by the narrower `noDelete`: an experiment renames and links
  like any other type (in `LINKABLE_TYPES`), only Delete is refused (backend) and hidden
  (frontend). Its update DTO is `ExperimentCreationDTO`, where every relation field is
  settable, so all six (orgs, facilities, projects, both supervisor lists, factors) are
  `updateLinkFields` — anything left out would count as derived and be dropped from the
  full-replace PUT. `refUri` reads both {uri,name} refs and bare-uri strings everywhere a
  relation field is read for a write. Consequence: with Delete hidden, the unlink view isn't
  reachable for experiments yet. Verified live on throwaways: "Link selection" (experiment +
  facility) and "Link existing…" (experiment → org) each did one PUT; PHIS kept
  objective/start date/description and has both links.
- **The open node's own title is a selectable chip** (`#selfChip`) — however you reached a
  node, it's no longer in the row list, so it needed its own way to be picked up. Plain
  click replaces the selection with it, ctrl/cmd toggles it (same rules as rows); unlike
  relation chips it does NOT jump into tree mode, since the point is to pick up where you
  are and keep browsing. Dashed pill on hover, solid accent when selected.
- **Tree-mode local detail now fetches relations.** Opening a node from the selection tree
  (or following a chip/member inside that local view) only called `renderDetail()`, never
  `loadNodeDetail()`, so it always read "No connections found" (e.g. UiT, which has a
  real child organization — stored on the child's side, so PHIS's own UiT page may not
  show it).
- **Decided, not built: experiment delete = empty-check.** PHIS's own UI deletes an
  experiment in one click (confirmed by the user, on an empty one), and swagger documents no
  refusal response — so it's unknown whether OpenSILEX refuses, cascades, or orphans an
  experiment's scientific objects/data. Graph Explorer will be stricter than PHIS: before
  deleting, the backend checks `/core/scientific_objects?experiment=<uri>` (and data) and
  409s with a clear message if anything is there; org/facility links don't block (named in
  the confirm, like sites). Replaces `noDelete` on experiment, which also makes its unlink
  view reachable. Deferred until experiments can hold scientific objects, so the non-empty
  case can be tested live instead of assumed.
  **Probed live since (throwaways): OpenSILEX does NOT refuse** deleting an experiment that
  holds a scientific object — it deletes the experiment and orphans the object: still in the
  global SO list, and undeletable ("object is used into an experiment"). So the empty-check
  is required, not just caution — and PHIS's own one-click delete can orphan real data.
  Recovery that worked: POST a new experiment with the SAME uri (the object's data lives in
  the experiment's graph, which the delete leaves behind), then delete the object with
  `?experiment=<uri>`, then without it (global copy), then the experiment.
- **Scientific objects in an experiment** (first step toward imports; PHIS had 0 SOs).
  Experiment node-detail gains a "Scientific objects" group from
  `/core/scientific_objects?experiment=<uri>` — a new `NODE_TYPES[t].queryRelations`
  (relation groups from a query, not a DTO field; read-only, no Unlink), merged in by
  `relationsFor()` for both node-detail and unlink responses. `CREATABLE.scientific_object`:
  `experiment` is a `scalarLinkFields` entry (one id, not a list — two experiments is a 400,
  and the "+ New" menu explains instead of opening the form); `rdf_type` is a new
  `input: "select"` field whose options come from `/api/scientific-object-types` (OpenSILEX's
  `used_types`, via the existing list-route shape). Global SOs (no experiment) are allowed —
  the standalone button on the Scientific Objects page creates one. Deleting an SO needs two
  calls: `?experiment=<uri>` removes it from the experiment, a plain delete removes the
  global copy — found live when the first cleanup left a global leftover. Not yet: opening
  an SO's own detail (its chip reads "No connections found"), parent/germplasm/factor links,
  geometry. Verified live: throwaway experiment → "+ New" → scientific object → form (11
  real classes) → "plant" → shows under the experiment and in PHIS as `vocabulary:Plant`.
- **Scientific object detail, view-only.** An SO's own DTO has no experiment field; its
  experiments come from `/core/scientific_objects/{uri}/experiments`, which returns one row
  per context the object lives in — each real experiment (`experiment` + `experiment_name`)
  plus the global SO graph itself (`…set/scientific-object`, no name), which is skipped.
  `queryRelations` gained an optional per-row `item` mapper for this. `NODE_TYPES.
  scientific_object` reads the global copy and is `readOnly` (flag reintroduced: no
  rename/delete/link — backend refuses, frontend hides, out of `LINKABLE_TYPES`), since its
  writes need experiment context and a two-step delete. Verified live, read-only, on the
  user's own "test" object: experiment → SO chip → "Experiments: test" → back.
- **Deletion, built (experiments + scientific objects).** The two ad-hoc flags (`noDelete`,
  `readOnly`) are replaced by one explicit `NODE_TYPES[t].actions` list (rename/delete/link,
  default all; node-detail returns it; frontend shows only those buttons; `LINKABLE_TYPES` =
  types allowing "link"). `deleteRemovesLinks`: the type's delete takes its links along, so
  Delete goes straight to a confirm naming them (experiment, scientific object) instead of
  unlink mode. `queryRelations[].blocksDelete`: the empty-check — an experiment holding
  scientific objects gets a 409 from the backend (enforced server-side, not just UI), and in
  the UI, Delete routes to the unlink view with a "CAN'T DELETE YET — still holds N
  scientific objects … would leave them orphaned in PHIS" banner and a "Delete N scientific
  objects" button (confirm lists them and says they're removed from PHIS entirely), which then
  continues straight into the experiment's own confirm — one flow, no dead end.
  `deleteFirst` gives scientific objects their correct two-step delete (each experiment copy
  via `?experiment=`, then the global copy); SO `actions` = delete only (rename/link need
  experiment context — not yet). Node-detail also returns `typeName` (OpenSILEX's
  `rdf_type_name`), shown in the header: "scientific object · plant", "facility ·
  Compartment", "organization · Research Unit". Verified live on throwaways: experiment
  (linked to an org) holding a plant → banner → delete object → experiment confirm → PHIS:
  experiment gone, both SO copies gone, org no longer lists it; a second plant deleted from
  its own page → both copies gone; zero ZZ leftovers.
- **Scientific object ↔ experiment linking, and shared objects.** Probed live first: an SO
  CAN live in several experiments — adding it to experiment B is a POST with the same `uri`
  and `experiment: B` (a second add 400s: names must be unique per experiment graph); each
  experiment holds its own copy, and a rename in B doesn't touch A or the global copy;
  `DELETE ?experiment=A` removes only A's copy. Modelled as `contextLinks` (an operation,
  not a DTO field), registered on both types and keyed by the relation group's `field`
  (`queryRelations[].field` makes a query group unlinkable): `current`/`link`/`unlink`.
  `/api/link` tries `contextLinkFor` before `linkFieldFor` (and counts already-linked
  pairs); `PUT /api/node` routes a `link`/`unlink` whose field is a contextLink there instead
  of a DTO PUT. SOs now allow "link" (in `LINKABLE_TYPES`); rename stays off (names are per
  experiment copy). **This changed experiment deletion:** "Clear N scientific objects…" now
  decides per object — only in this experiment → deleted from PHIS entirely; also in another
  experiment → only removed from this one, kept there — and the confirm lists which is which
  before anything happens. Each blocker chip also has its own × (remove from this experiment).
  **"Unlink…" button** for types whose Delete doesn't pass through unlink mode
  (`deleteRemovesLinks`) — without it an SO could never be taken out of one experiment, nor
  an empty experiment's orgs unlinked. Verified live on throwaways, all through the real page:
  "Link existing…" (B → plant) and "Link selection" (plant + A) each added one experiment
  copy; "Unlink…" → × on A left B + global intact; deleting B (plant shared with A) removed it
  from B only; deleting A (plant now only there) deleted it entirely; zero leftovers.
- **Create one scientific object in several experiments at once.** `scalarLinkFields` no
  longer means "only one": several selected experiments → the first POST creates the object,
  then one POST per extra experiment with the SAME `uri` adds a copy there. The node exists
  after the first POST, so a failed copy (e.g. a name clash in that experiment) comes back as
  a `warning` on the 201 ("not added to 1 of 2 — …") and in the toast, never as a failed
  create. Verified live: two throwaway experiments selected → one form → PHIS shows the
  plant in both (+ global).
- **"How scientific objects work" info box.** `TYPE_INFO` (mockup) holds short explainers
  for types whose OpenSILEX behaviour isn't obvious; `typeInfoHtml` renders one as a native
  `<details>` box on that type's category page and on each node of it, collapsed by default,
  open state remembered per viewer (localStorage — a convenience only). Scientific objects
  get the copies-per-experiment / names-per-copy / unlink / delete / experiment-delete rules.
- **Full-replace PUT data loss, fixed.** `updatePayloadFromDto` used to send only name + link
  fields; since every OpenSILEX update replaces the whole DTO, every rename/link/unlink
  silently wiped `description`, `rdf_type`, `address`, `groups` etc. It now sends the whole
  current DTO back (`{uri,name}` ref arrays flattened to uri strings, derived relation
  groups dropped). Verified live: a facility's `description` and `rdf_type`
  (`vocabulary:Compartment`) survive rename and link. Earlier sessions' live links to real
  orgs may already have lost fields this way — not audited.
- **OpenSILEX 1.5.4.7 bug: never PUT a node that has an `address`.** Found live, the hard
  way: a site PUT carrying `address` creates a *second* location `ObservationCollection`
  instead of reusing the existing one, after which every GET of that type 500s ("Multiple
  objects for the same URI") — one test PUT broke the whole Sites list, in PHIS itself, until
  the duplicate triples were deleted by hand in GraphDB. Omitting `address` instead wipes it.
  So `updatePayloadFromDto` refuses (409, clear message, no PUT sent) for any node whose
  current DTO has an address — data-driven, not per type (2 of 3 real sites have one; no
  facility does yet, but `FacilityUpdateDTO` has the same field). Verified live: renaming the
  real Holt Research Farm is refused and the record is untouched; a no-address test site
  renames/links/unlinks fine. Lesson for live testing: never chain experimental PUTs against
  real OpenSILEX on the same node — use a throwaway per attempt, and keep the GraphDB cleanup
  path in mind before trying anything new.
- `graph-explorer/test/` — 106 tests: `backend.test.ts` (unit, mocked
  OpenSILEX responses — covers auth retry, malformed responses, network
  failure, `/api/create` and `/api/node[-detail]`'s validation/payload
  building, and the 409-passthrough behavior), `live-smoke.test.ts`
  (hits the real PHIS instance, asserts shape only, no hardcoded
  counts), `e2e.test.ts` (Playwright, drives the real served page —
  the creation and view/rename/delete flow tests mock their respective
  `/api/*` calls specifically so the suite never writes real data),
  `adjacency.test.ts` (the pure rule, direct Node import, no browser).
  Run with `npm test` from `graph-explorer/`.
- To run it locally: `cd graph-explorer && npm run dev`, then open
  `http://localhost:4000` — this serves the mockup *and* the API from
  one process/origin (no CORS, no separate "open the HTML file"
  step — that was an early mistake, corrected once).
- **What's NOT built yet (as of 2026-09-24).** Wired types: facility, organization, site,
  experiment, scientific object. Candidate next steps, none started — pick ONE with the user:
  - Several scientific objects at once ("Plant 1–24" in one form) — closest to an import.
  - Scientific-object rename — needs a decision first: rename every experiment copy, or
    only the copy in the experiment being viewed (names are per copy, unique per experiment).
  - SO parent / germplasm / factor-level links; project, person, device, germplasm and the
    other `ADJACENT` types (device needs `rdf_type` + move events for facility hosting —
    see "Device deferred" above).
  - Then the file-import path described in Creation model above.
  Known gaps: 2 real sites with an `address` can't be edited in the app (OpenSILEX PUT bug,
  guarded with a 409); supervisors/factors chips show bare URIs (no person label lookup).

**Frontend: the validated design, unchanged.** The interactive mockup at
`graph-explorer/public/index.html`,
built and approved during this session — breadcrumb navigation,
Windows-Explorer-style selection (plain/ctrl/shift-click, drag-marquee), a
selection tree with real connector lines, recursive category
group-selection, a local breadcrumb for following relations inside the
tree without losing the base selection, an adjacency-filtered "+ New" menu
— is the UI contract. Same visual language: Public Sans + IBM Plex Mono,
the existing PHIS green palette (`#3D8526` / `#F2F5DE` / `#264030`), per-
type accent colors. Vanilla HTML/CSS/JS, calling the new backend over a
plain REST API — no framework decision forced yet; add one later only if
hand-rolled state management actually becomes the bottleneck.

## Access during development

Not exposed on the public web. Runs locally (or on an internal-only
address) for one user during the build. No auth system — either a single
hardcoded dev connection (reusing existing `.env` credentials, server-side
only) or an explicit "not connected" state with no login UI at all,
whichever is less code. This is a development convenience, not a security
design — it must not be reachable from outside until real auth exists.

## Non-goals (explicitly deferred)

- Authentication / SSO / the PHIS pre-auth handoff.
- Public deployment, k8s manifests, ingress — none of that until there's
  something worth exposing.
- Migrating or retiring the old Streamlit portal. It keeps running at its
  current URL, unmodified, until this replaces it wholesale.
- Feature parity with every existing Streamlit page beyond what Graph
  Explorer's unified scope actually needs (Graph Explorer + creation/
  linking + instrument import). Anything else currently in the portal is
  out of scope until explicitly revisited.

## What carries forward — design only, no files

- The generic node creation/linking mechanism (type-adjacency index,
  **intersection**-over-selection creatable-types menu — corrected from an
  initial "union" implementation, see Creation model below — auto-attach
  on creation, recursive "create new" for missing dependencies) from the
  original v2 spec's Parts 2, 4, and 5 — the interaction model,
  reimplemented fresh, not the Streamlit `st.dialog` code that used to
  run it.
- The instrument-plugin *pattern*: a shared interface every plugin
  satisfies, auto-discovered from a plugins directory, adding a new
  instrument means adding one file. Confirmed still the right shape by the
  user directly — "I like the plugin design, I don't care what language
  it is in." Rebuilt in TypeScript as part of the new backend, not
  imported from `utils/instrument_registry.py`.

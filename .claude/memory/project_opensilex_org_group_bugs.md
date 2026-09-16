---
name: project_opensilex_org_group_bugs
description: "OpenSILEX org/group bugs: BUG1 non-admin org-list 400 = TWO bugs, patches 010 (getByUserURI null) + 011 (org search dedup) in image 1.5.4.3 not yet deployed; BUG2 org-delete cascade fixed 1.5.4.2; BUG3 16 orphan GroupUserProfile nodes DELETED 2026-09-02"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce94d7fb-dd64-4ff1-bac8-51cfd8ce6a6f
  modified: 2026-09-16T09:12:42.365Z
---

Both discovered 2026-09-01 on prod (phis.pheno.no), OpenSILEX 1.5.0. Both
unfixed upstream (checked `develop`).

**BUG 1 — 2026-09-02: was TWO separate bugs. FIXED + DEPLOYED in image
1.5.4.3 (prod + phis-test, commits 82ae089 patches / 4c3417d image bump).
Verified by Sebastian: non-admin org page loads, no "Multiple results" 400,
no "Access denied" on single-org view.**

Real user symptom = `GET /rest/core/organisations` HTTP 400, browser console
`Failed to load resource: 400` + `Uncaught (in promise) e` (spinner never
clears). API error body: `"Multiple results with the same URI
(phis:id/organization/uit_...) at index 6"`. NO `"force logout"` line ->
NOT the anonymous-loop.

- **Patch 011** `011-fix-organization-search-duplicate-models.patch` — THE
  org-list 400. `OrganizationDAO.searchWithoutFilters` non-admin branch adds
  `addOrganizationAccessClause` = `{group-hierarchy branch} UNION {no-group
  branch}`. When ANY org has `os-sec:hasGroup`, the query emits the same org
  URI on >1 non-contiguous row -> duplicate `OrganizationModel`s ->
  `SPARQLListFetcher.updateModels()` throws "Multiple results with the same
  URI at index N" (the `userOrganizationCache.put(...toMap...)` right after
  would too). Admins skip the access clause -> unaffected (this is why
  "admin bypasses BUG 1" always held). FIX = dedupe models by URI.
  Reproduced with the reconstructed non-admin query vs prod GraphDB: every
  org returned twice. Exact SPARQL mechanism (OPTIONAL group-hierarchy +
  UNION + `hasPart` path eval) not fully pinned; dedup covers all variants.

- **Patch 010** `010-fix-profile-getbyuseruri-null-guard.patch` — a SECOND,
  independent bug: `/rest/vuejs/user_config` (not `@ApiProtected`) for an
  anonymous / stale-token non-admin -> `AccountModel.getAnonymous()` (URI
  null) -> `getByUserURI(null)` -> `SPARQLDeserializers.nodeURI(null)`
  returns null -> Jena renders the triple object as bare `ANY` -> GraphDB
  `MALFORMED QUERY ... after prefix "ANY"`. Swallowed by `catch(Exception
  ignored)` -> empty menu. FIX = `if (uri == null) return
  Collections.emptyList();`. This is the `ANY125` from the 2026-09-01 logs.

All three (009/010/011) are upstream bugs, unfixed on `develop` 2026-09-02.
Sebastian is unsure he has permission to contribute to `OpenSILEX/opensilex`.
Fallback: file GitHub *issues* (no write access needed) with the repro
details, or keep internal. Patches stay in our `tools/patches/` stack
regardless — re-checked each upgrade cycle.

Layer-2 note (NOT patched): `AuthenticationService()` regenerates the RSA
JWT keypair every startup + `userRegistry` is in-memory -> every opensilex
restart logs out ALL users; stale-token non-admins then hit patch-010's
path. Frontend `main.ts:587` `if (userConfig.userIsAnonymous &&
user.isLoggedIn())` force-logout+reload = an "infinite loading" loop for
those. Invasive to fix properly (persist key + rebuild user from claims /
externalize sessions) -> file upstream, only worth it if deploy-logout
becomes a real complaint. Patch 010 makes the fallout graceful.

**BUG 2 — deleting an org HARD-DELETES its linked group (data loss). FIXED — prod on 1.5.4.2 since 2026-09-01.**
Root cause: `OrganizationModel.java` `@SPARQLProperty(property="hasGroup", cascadeDelete=true)`.
Removed upstream in 1.5.1+. Verified fixed on phis-test AND prod: create org,
attach group, delete org -> group survives. See [[project_opensilex_upgrade_task]].

**BUG 3 — `researchers` group has 16 orphan GroupUserProfile nodes (found 2026-09-02).**
GraphDB state on prod: `researchers` group has 7 CLEAN GUP nodes (all ->
`researcher_profile`). Profiles clean: only `default-profile` (0 cred) +
`researcher_profile` (59 cred), no dupes. BUT 24 total `GroupUserProfile`
nodes exist in `set/group` graph, only 8 attached to a group -> **16 orphans**
(all -> `default-profile`, multiple per account, ZERO inbound refs from any
subject/predicate/graph). Residue from the BUG 2 hard-delete + hand-recovery
+ repeated failed UI updates.
UI symptom: group-edit screen shows sebive98@gmail.com & thomas.bawin@nmbu.no
on "Default profile" (picking up an orphan GUP), dropdown shows ~8 dupe
"Researcher profile" rows, and Save -> `Error: URI not found : phis:id/group/1159411821`
(a phantom GUP URI that does not exist in GraphDB). Patch 007's cleanup
(`GroupDAO.update` post-update sweep) can't fire because the update itself
is failing on the phantom URI -> vicious cycle, orphans keep accumulating.
**DONE 2026-09-02:** backup `graphdb-backup-preclean-20260902` /
`/backup/20260902-0720.trig` taken + verified, then SPARQL DELETE of the 16
orphan GUP nodes (64 triples) via `scripts/delete-orphan-gups.sh`. Result:
24->8 GUP nodes, set/group 116->52 triples, researchers still 7 members all
`researcher_profile`. NOTE: the orphan-GUP timestamps were June 2026 (old
add/remove churn, not just the Sept incident). **admin@opensilex.org password (2026-09-02):** the value in Azure Key Vault
`opensilex-admin-password` does NOT work. An older password Sebastian had
saved DOES work. So KV is stale / was never updated after some past reset.
`az keyvault list` returned nothing in the working session (subscription /
RBAC). ACTION: set KV `opensilex-admin-password` to the password that
actually works, so KV = reality (ESO syncs to secret `opensilex-credentials`
key `admin-password`, refreshInterval 1h). Note: even then the OpenSILEX
user DB is NOT auto-updated on restart (`user add ... || true` no-ops) —
that's the Layer-2 limitation. Vault URL is `${KEY_VAULT_URI}` substituted
into `k8s/external-secrets/config/clustersecretstore.yaml`.
**BUG 4 — group-edit "Users and profiles" dropdown shows duplicate
"Researcher profile" rows. FIXED 2026-09-16, deployed in image 1.5.4.6
(patch 012).** Root cause was NOT orphan data and NOT a `ProfileDAO`
query-side dup like 011 — it was a URI **format** mismatch between two
independent frontend data sources feeding the same dropdown:
`GroupDAO.search()` (backs the group list/edit modal) returns
`profile_uri` as an expanded IRI (`https://phis.pheno.no/id/profile/x`),
while `GET /security/profiles/all` (backs the master profile list) returns
the same profile compact/prefixed (`phis:id/profile/x`). Same real
resource, different string, so `GroupUserProfileForm.vue`'s
`profileOptionsWithFallback` treated every group member's profile as
"unknown" and added a synthetic fallback dropdown option per user row
sharing it (4 users -> 4 duplicate rows). First-pass fix (dedup by exact
string) got it down to 1 residual duplicate — still wrong because the
underlying mismatch was a *format* difference, not literal duplication.
Real fix: compare and select by a new `canonicalUri()` helper (strips
scheme+host or prefix, comparing just the local path) instead of exact
string equality, and reroute the `<select>`'s bound value through the same
canonicalization (`resolveSelectValue()`) so the right option shows
selected regardless of which URI form a given row happens to carry.
Confirmed root cause by pulling both live API responses via `kubectl exec`
+ `curl` against the running pod and diffing the raw JSON byte-for-byte —
not from speculation. See `tools/patches/012-fix-group-profile-dropdown-duplicates.patch`
and its README entry for the full diff.

`DELETE /rest/core/organisations/{uri}` cascade issues
`DELETE DATA { GRAPH <set/group> { <group/X> ... all triples ... } }` plus
deletes every `GroupUserProfile` of that group, plus sweeps
`?x os-sec:hasGroup <group/X>` from set/experiment, set/germplasm,
set/organization, set/user. So deleting an org with `hasGroup` destroys a
SHARED top-level security group and everyone's membership.
Happened 2026-09-01: deleting `test` org destroyed the `researchers` group
(6 members, `researcher_profile`). Recovered by hand-recreating the group +
re-adding 6 accounts (Sebastian did this). Accounts + `researcher_profile`
(~60 credentials) were untouched. Residual risk: any resource shared
directly with `researchers` lost its share-link (re-share if a user complains).

**Behavioral lesson:** OpenSILEX REST DELETE is NOT a safe operation —
cascades widely. Never call it on prod without checking what's linked first.
See CLAUDE.md data-persistence section.

**Cleanup DONE 2026-09-16:** disabled throwaway account `debug-nonadmin@phis.local`
(person `person.dbg.user`) deleted by Sebastian directly (via UI, not API) —
the earlier 409/405 hard-delete failure is no longer an issue.

Pre-incident GraphDB backup (03:00 2026-09-01, `researchers` intact) kept
until ~2026-10-01 in Azure blob `graphdb-backups` if surgical recovery needed.

See [[project_graphdb_wedge_incident]], [[project_opensilex_init]].

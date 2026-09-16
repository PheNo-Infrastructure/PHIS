---
name: project_opensilex_upgrade_task
description: "OpenSILEX 1.5.0 -> 1.5.4 upgrade DONE; prod on image 1.5.4.3 (patches 010+011 for non-admin org bug, 2026-09-02). opensilex-upgrade skill built. Open: BUG4 dup profiles, KV admin pw."
metadata:
  node_type: memory
  type: project
  originSessionId: ce94d7fb-dd64-4ff1-bac8-51cfd8ce6a6f
  modified: 2026-09-02T08:42:45.135Z
---

**DONE 2026-09-01** (upgrade), **image bumped to 1.5.4.3 on 2026-09-02**
(patches 010+011). Prod PHIS runs
`ghcr.io/pheno-infrastructure/opensilex-phis:1.5.4.3`
(namespace moved off `ghcr.io/lversen` to the org, package PUBLIC).
phis-test also on 1.5.4.3 via sync-test-image.yml.

**What shipped:**
- `.github/workflows/build-opensilex.yml`: lowercase `github.repository_owner`
  into `OWNER_LC` for GHCR tags (commit 39256fe).
- Patch 008 rebased: `new ExperimentDAO(sparql, nosql)` -> `(sparql, nosql, fs)`
  — 1.5.4 added a 3rd `FileStorageService` ctor arg (commit 04abfd9).
- New patch 009 `009-fix-empty-germplasm-attr-migration.patch`: guards
  `GermplasmAttributeUpdateRightsMigration` against empty Mongo `bulkWrite`
  (`writes is not an empty list`). Upstream bug, unfixed on develop.
  Reported upstream: still TODO (commit 5fbe0a9).
- `k8s/opensilex/deployment.yaml` image bump (commit e44b771).
- Patches 002-007: applied clean/with tolerated fuzz, no rebase needed.

**Migrations run on prod (both no-ops — prod has 0 germplasm attributes,
0 custom vocab types, same as phis-test):**
- `org.opensilex.migration.one_point_five_ALL.GermplasmAttributeUpdateRightsMigration`
- `org.opensilex.migration.one_point_five_ALL.ChangeTypeParametersUri`

**Validated on `phis-test`** (the populated long-lived env, NOT a fresh one):
image boots, both migrations exit 0, BUG 2 cascade fixed (delete org ->
group survives).

**Pre-upgrade backups:** manual jobs `graphdb-backup-preupg-20260901` /
`mongodb-backup-preupg-20260901` in namespace `phis`, blobs in Azure
`phistfstate`. Plus the daily 03:00 GraphDB backup. Keep ~30 days.

**Incidents during the upgrade:**
- Admin login broke (Key Vault password stale — ESO does NOT sync into
  OpenSILEX user DB, no reset CLII). Recovered by `user add --admin` with
  a new email `admin-recovery@phis.pheno.no`. TODO: reset
  `admin@opensilex.org` password via UI + update Key Vault to match.
- Users hit infinite-loading until Ctrl+Shift+R (stale SPA chunk hashes).
- User re-created an org+group on prod -> re-armed [[project_opensilex_org_group_bugs]]
  BUG 1. Needs deleting as admin via UI.

**The skill:** `.claude/skills/opensilex-upgrade/SKILL.md` (commit 0a1f157,
NOT yet pushed). 10-phase runbook, all this run's lessons folded in.

**Still open:**
- Push commits 0a1f157 (+ everything since) to `k8s`.
- Delete the prod BUG-1 test org (as recovery admin, via UI).
- Reset `admin@opensilex.org` password + sync Key Vault.
- File patch-009 bug upstream with OpenSILEX.
- **BUG 1** — DONE 2026-09-02. Was TWO bugs: patch 011 (org search dedup =
  THE org-list 400) + patch 010 (getByUserURI null guard). Image **1.5.4.3**
  built (GH run 33606136402), deployed to prod + phis-test (commits 82ae089
  patches / 4c3417d image bump), verified by Sebastian — org page loads.
- **BUG 3** — DONE 2026-09-02: 16 orphan GroupUserProfile nodes deleted
  (backup `graphdb-backup-preclean-20260902` first).
- **BUG 4 (NEW, open)** — group-edit dropdown STILL shows duplicate
  "Researcher profile" rows on 1.5.4.3. Separate profile-list query dup.
  Not user-blocking. Next task. See [[project_opensilex_org_group_bugs]].
- **admin@opensilex.org password** — KV value does NOT work, an older saved
  password does. KV is stale. ACTION: set KV `opensilex-admin-password` to
  the working value. See [[project_opensilex_org_group_bugs]].
- **File upstream** — 009/010/011 all upstream bugs. Sebastian unsure of
  contribution rights -> GitHub issues (no write needed) or keep internal.
- Move stale Flux deploy key cleanup, external uptime alerting (from
  [[project_graphdb_wedge_incident]] / [[project_repo_org_migration_todo]]).

See [[project_build_process.md]] [[feedback_k8s_patterns]] [[project_k8s_deployment]].

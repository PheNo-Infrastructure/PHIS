---
name: opensilex-upgrade
description: Use when upgrading the PHIS OpenSILEX image to a newer upstream release (e.g. 1.5.0 -> 1.5.4), rebasing the tools/patches stack, running OpenSILEX data migrations, or bumping opensilex_tag in build-opensilex.yml.
---

# OpenSILEX Upgrade (PHIS)

End-to-end procedure for moving the PHIS OpenSILEX image from its current
upstream release to a newer one. Drives existing tooling
(`build-opensilex.yml`, `scripts/test-env.ps1`, Flux) — it does not add
new tooling.

**Read first:** [CLAUDE.md](../../CLAUDE.md) data-persistence section,
`.claude/memory/project_opensilex_upgrade_task.md`,
`project_opensilex_org_group_bugs.md`, `feedback_no_prod_deletes.md`.

## Two hard stops

This procedure runs autonomously EXCEPT:

1. **Complexity gate (Phase 1b)** — stop if any upstream upgrade step is
   not one of {`run-update` call, image-tag bump, patch rebase}. Do not
   guess an unrecognized migration procedure.
2. **Prod snapshot gate (Phase 6)** — stop until a fresh GraphDB +
   MongoDB backup is confirmed. This is the only rollback point for
   irreplaceable research data.

Everything else (patch review, image build, test-env validation, Flux
deploy, prod `run-update`) proceeds without asking, aborting only on
hard errors.

## Inputs

- Target upstream tag, e.g. `1.5.4`. Use the plain tag, never `-rdg`.
- Current state (read, don't assume):
  - `opensilex_tag` default + `image_version` default in
    [.github/workflows/build-opensilex.yml](../../.github/workflows/build-opensilex.yml)
  - running image in
    [k8s/opensilex/deployment.yaml](../../k8s/opensilex/deployment.yaml)
    (`ghcr.io/<owner>/opensilex-phis:<v>`)

## Phases

| # | Phase | Mode |
|---|-------|------|
| 0 | Preflight access check | auto |
| 1 | Version + complexity assessment | auto |
| 1b | Complexity gate | STOP if unknown steps |
| 2 | Patch review / rebase | auto |
| 3 | Rebase confirmation | brief confirm |
| 4 | Build image | auto |
| 5 | Test-env validation | auto |
| 6 | Prod snapshot gate | STOP |
| 7 | Prod deploy (Flux) | auto |
| 8 | Prod migration | auto |
| 9 | Verify + record | auto |

### Phase 0 — Preflight access check

Do this BEFORE anything else — an upgrade can lock you out mid-flight.

1. Confirm you can log into prod as an **admin** account right now
   (phis.pheno.no). ESO/Key Vault is NOT synced into OpenSILEX's user DB
   (see the comment in `k8s/opensilex/deployment.yaml`), so the Key Vault
   `opensilex-admin-password` is often stale. There is **no** password-reset
   CLI — only `user add` / `user add-guest`, and `add` refuses an existing
   email.
2. If admin login fails, recover first: create a fresh admin with a NEW
   email (this is data-safe, just adds an account):
   `kubectl exec -n phis deploy/opensilex -- ./bin/opensilex.sh user add --admin --email=admin-recovery@phis.pheno.no --firstName=Recovery --lastName=Admin --password='<strong>' --lang=en`
3. Note: admin bypasses BUG 1, so a working admin is also the tool for
   clearing a BUG-1 trigger later (Phase 9 / org cleanup).

### Phase 1 — Version + complexity assessment

1. Determine current tag and the ordered list of releases between current
   and target (e.g. 1.5.0 -> 1.5.1 -> 1.5.2 -> 1.5.3 -> 1.5.4).
2. For every release in that range, fetch upstream release notes:
   - GitHub releases: `https://github.com/OpenSILEX/opensilex/releases`
   - and the docs tree
     `opensilex-doc/src/main/resources/markdown/release/` at the target tag.
3. `git`-diff the upstream `opensilex-migration` module between current
   and target tags to catch migration classes not mentioned in notes:
   compare `opensilex-migration/src/main/java/org/opensilex/migration/`
   file lists at each tag (raw GitHub or shallow clone per tag).
4. Extract **every** manual step the notes describe — not just
   `run-update`: config-file keys added/renamed, `opensilex.yml` /
   `opensilex.front.yml` changes, GraphDB repo-config changes, MongoDB
   reindex / index rebuilds, data backfills, breaking REST API changes,
   build-process / base-image changes.
5. Classify each extracted step:
   - **known** — a `system run-update <class>` call, an
     `opensilex_tag` / `image_version` bump, or a `tools/patches` rebase.
   - **unknown** — anything else.
6. Produce the assessment table: releases in range, migration classes to
   run (in order), known steps, unknown steps.

### Phase 1b — Complexity gate

- All steps known -> routine upgrade, continue to Phase 2 without asking.
- Any unknown step -> **STOP**. Present the unrecognized steps and their
  source (which release note, which line). Plan them with the user before
  Phase 4. Extend this skill if the new step type will recur.

### Phase 2 — Patch review / rebase

Patches live in [tools/patches/](../../tools/patches/), applied in
filename order `002`..`008` by
[opensilex-build-step.docker](../../tools/patches/opensilex-build-step.docker)
(`patch -p1`). Several patches touch the same file
(`AuthenticationAPI.java` x4) and later patches assume earlier ones
applied — never renumber or reorder.

For each `NNN-*.patch`:

1. Parse the target file paths from the diff headers.
2. Fetch each target file's source at the **target** upstream tag
   (raw GitHub `OpenSILEX/opensilex` at tag).
3. Dry-run: apply the patch stack in order against a shallow clone of the
   target tag. On Windows the checkout partially fails — the repo has
   theme files with `:` in the name (`vocabulary:anr.svg`) that are
   invalid on NTFS. Use sparse checkout excluding them:
   ```
   git clone --depth 1 --branch <target> --no-checkout <url> os-<target>
   cd os-<target> && git config core.sparseCheckout true
   printf '/*\n!opensilex-front/front/theme/\n' > .git/info/sparse-checkout
   git read-tree -mu HEAD    # theme errors are harmless, no patch touches theme
   for p in tools/patches/*.patch; do patch -p1 --force < $p; done
   ```
   `patch` (not `git apply`) — the build uses `patch`, different fuzz
   behavior. Do the REAL apply, not just `--dry-run`: dry-run only checks
   context lines, it does NOT check the result compiles.
4. Classify each patch:
   - **clean** — applies, no rejects.
   - **needs-rebase** — hunks reject, OR they apply but the result won't
     compile against changed upstream APIs (e.g. 1.5.4 added a 3rd
     `FileStorageService` arg to `ExperimentDAO` → patch 008 applied fine
     but failed `mvn compile`). For a one-token change to an existing
     added (`+`) line, edit the `.patch` directly (hunk counts unchanged).
     For anything structural, regenerate with the **`patch-creator`**
     skill (`/patch-creator <files> <change>`) — it computes hunk offsets
     against the already-applied earlier patches. Then re-run the full
     stack apply.
   - **now-redundant** — upstream already fixed this (identify the
     upstream commit / release). Propose removing the patch. Removing a
     mid-sequence patch is fine for `patch -p1` (glob, not numbered
     apply) but re-check that later patches don't depend on its hunks.
5. Also check the `sed` block in `opensilex-build-step.docker` that
   edits `components/index.ts` — confirm the anchor line
   (`components["opensilex-ForgotPassword"] = ForgotPassword;`) still
   exists at the target tag.

Output: table of patches x {clean | rebased | redundant} + any `.patch`
files regenerated.

**The image build (Phase 4) is the authoritative patch check** — a clean
local apply can still fail `mvn compile`. Budget 1-2 rebuild iterations
(~5-6 min each to the first compile error) for API-drift fixes. New
`.patch` files must be committed+pushed before each rebuild (the workflow
checks out `--ref k8s`).

### Phase 3 — Rebase confirmation

- All clean/redundant -> state so, continue.
- Any rebased or new patch -> generate it with **`patch-creator`**, show
  the diff, get a yes, then commit (`fix(patches): rebase NNN onto <target>`
  or `fix(patches): add NNN-<slug>`, `Co-Authored-By:` trailer). A new
  patch for an upstream bug found during validation (like 009) is numbered
  after the current highest and picked up automatically by the build glob.

### Phase 4 — Build image

1. `gh workflow run build-opensilex.yml -f opensilex_tag=<target>
   -f image_version=<target>.1 --ref k8s`. Bump the last segment for each
   rebuild (`.2`, `.3`, ...) — one per patch-fix iteration.
2. Poll: `gh run list --workflow=build-opensilex.yml` then
   `gh run watch <id> --exit-status`.
3. On failure: `gh run view <id> --log | grep -Ei "COMPILATION ERROR|BUILD FAILURE|cannot find symbol|cannot be applied|\.java:\["`.
   The build has two known self-healing retries (vuelayers bind operator,
   missing TS stubs) already in the Dockerfile — a compile failure past
   those is a real patch/upstream break; go back to Phase 2, fix the
   patch, commit+push, rebuild with a bumped version.
4. On success the image pushes to
   `ghcr.io/<owner-lowercased>/opensilex-phis:<target>.N`.
   - The workflow lowercases `github.repository_owner` (it is
     `PheNo-Infrastructure`, mixed case; Docker tags must be lowercase).
   - A **new** GHCR package (new org, or first build after an org move)
     is **private** by default. Test/prod pulls fail until it is public
     OR the `ghcr-pull-secret` PAT can read it. Package visibility can
     only be changed in the **web UI**
     (`github.com/orgs/<org>/packages/container/<pkg>/settings` → Danger
     Zone) — the REST API `PATCH .../visibility` returns 404, and an org
     policy may block public. Verify with an anon pull:
     `T=$(curl -s "https://ghcr.io/token?scope=repository:<owner>/opensilex-phis:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/'); curl -so /dev/null -w "%{http_code}\n" "https://ghcr.io/v2/<owner>/opensilex-phis/manifests/<tag>" -H "Authorization: Bearer $T"`
     (200 = public/pullable). Allow a minute for propagation.
   - If the namespace changed, Phase 7's `deployment.yaml` edit must
     change the registry path too, not just the tag.

### Phase 5 — Test-env validation

**Use the EXISTING `phis-test` namespace, not a fresh one.** A fresh
`test-env.ps1` env has an empty DB, so every migration no-ops and
validates nothing. `phis-test` is long-lived and populated (sometimes
more than prod). It is NOT Flux-managed — change its image directly.

1. Back up the test GraphDB first (migrations do in-place rewrites):
   `kubectl exec -n phis-test deploy/graphdb -c graphdb -- sh -c 'curl -s -X GET -H "Accept: application/x-trig" http://localhost:7200/repositories/opensilex/statements > /tmp/pretest.trig'`
   Add a `mongodump` if the env has a mongodb deployment.
2. Point test opensilex at the new image:
   `kubectl set image deployment/opensilex -n phis-test opensilex=ghcr.io/<owner>/opensilex-phis:<tag>`
   `kubectl rollout status deployment/opensilex -n phis-test --timeout=300s`
3. Confirm clean boot: `kubectl logs -n phis-test deploy/opensilex --tail=40`
   (all API modules load, `ProtocolHandler ["http-nio-8666"]` started,
   `Hibernate Validator <image_version>`, no stack traces).
4. Run the migration classes from Phase 1, in order, inside the pod:
   `kubectl exec -n phis-test deploy/opensilex -- ./bin/opensilex.sh system run-update <fully.qualified.ClassName>`
   then `echo "exit: $LASTEXITCODE"`. Each must exit 0. Watch for
   `SPARQL TRANSACTION ROLLBACK` / stack traces even when exit looks ok.
   Known: `GermplasmAttributeUpdateRightsMigration` crashes on an empty
   germplasm-attribute collection (`writes is not an empty list`) —
   patch 009 guards it. A migration that "does nothing" can still throw;
   treat any exception as needs-rebase (Phase 2) with a new patch.
5. Smoke checks against `phis-test`:
   - login screen renders with Feide button (patch 004)
   - normal pages load (experiments / germplasm / SO lists)
   - create an org, add a group to it, delete the org -> group SURVIVES
     (BUG 2 regression check — must pass on >=1.5.1). Then DELETE that
     org so it does not re-arm BUG 1 for non-admin testers.
   - `GET /rest/core/organisations` as a non-admin group member — still
     400 until BUG 1's own patch lands; must not be a NEW regression.
   - invite flow returns 503 (email disabled in test) not 500
   - batch SO import `POST /core/scientific_objects/json_import` exists
     (patch 008)
6. Leave `phis-test` on the new image (it re-syncs from prod in Phase 7
   anyway). Report pass/fail per check. Any fail -> stop, diagnose.

### Phase 6 — Prod snapshot gate  **STOP**

1. `kubectl get pvc -n phis` — confirm GraphDB + MongoDB PVCs bound,
   reclaim policy `Retain`.
2. Trigger fresh backups rather than waiting for the 02:00/03:00 cron:
   `kubectl create job -n phis --from=cronjob/graphdb-backup   graphdb-backup-preupgrade-<date>`
   `kubectl create job -n phis --from=cronjob/mongodb-backup   mongodb-backup-preupgrade-<date>`
3. Wait for both jobs Complete. Verify blobs exist in Azure container
   `graphdb-backups` / mongo container (storage account `phistfstate`).
4. State the rollback path (Phase 9) and the resources at risk
   (GraphDB security graphs, Mongo data DB). Get explicit confirmation
   naming the upgrade before continuing.

### Phase 7 — Prod deploy

1. Edit image tag in
   [k8s/opensilex/deployment.yaml](../../k8s/opensilex/deployment.yaml)
   to `ghcr.io/<owner>/opensilex-phis:<target>.1`.
2. Commit on the `k8s` branch
   (`chore(opensilex): upgrade to <target>`, `Co-Authored-By:` trailer).
   **Let the user run `git push`** — that push is the prod trigger. Do
   not commit to any other branch. Note: pushing this file also fires
   `sync-test-image.yml`, which `kubectl set image`s the new tag across
   every `phis-*` namespace — so never push before Phase 5 passes, or
   test envs jump to an unvalidated image.
3. Flux reconciles (or `flux reconcile kustomization flux-system --with-source`).
4. `kubectl rollout status deploy/opensilex -n phis --timeout=300s` — the
   new pod's startupProbe can take ~90s (probe reports "connection
   refused" until Tomcat binds — normal). NEVER `kubectl delete pod`
   opensilex — rollout only.

### Phase 8 — Prod migration

Only if the range crosses a release that needs `run-update` (per Phase 1).

`kubectl exec -n phis deploy/opensilex -- ./bin/opensilex.sh system
run-update <fully.qualified.ClassName>` for each class, in order.
Each must exit 0. On failure -> stop, this is a rollback decision
(Phase 9), do not retry blindly.

### Phase 9 — Verify + record

1. In-cluster health (independent of browser cache):
   `kubectl exec -n phis deploy/opensilex -- sh -c 'curl -so /dev/null -w "%{http_code}\n" http://localhost:8666/rest/vuejs/config'`
   plus `/rest/core/system/info` and `/app/` — all 200.
2. **Tell the user to hard-refresh (Ctrl+Shift+R).** A new frontend build
   changes chunk hashes; a cached `index.html` points at gone files and
   the SPA shows infinite-loading / blank. This is NOT a rollback
   trigger — confirm the backend is 200 in-cluster first.
3. `ClientAbortException: Connection reset by peer` / `MappableException`
   in the logs after deploy = clients disconnecting from a hanging page
   (a symptom of the stale-asset reload loop), not a server fault.
4. `kubectl logs deploy/opensilex -n phis` — no startup errors, no
   repeated genuine SPARQL failures. A single `MALFORMED QUERY` warn is
   BUG 1 (a non-admin hit the org list) — clear it by deleting any prod
   org that has a group attached, as admin, via the UI.
5. Update `.claude/memory/project_opensilex_upgrade_task.md` and
   `project_build_process` (or create it) with: shipped tag, image
   version, patch changes, migrations run, date.
6. Copy updated `.claude/memory/*.md` back per CLAUDE.md, commit.

## Rollback

- **Bad image / startup failure, no migration ran:** revert the Phase 7
  commit -> Flux rolls the image back. Done.
- **Migration ran and corrupted data:** revert the Phase 7 commit, then
  restore GraphDB and/or MongoDB from the Phase 6 pre-upgrade backup
  (see `k8s/backup/` job definitions for the restore path). Migrations
  are not automatically reversible.

## Quick reference

| Thing | Where |
|-------|-------|
| Upstream source | `github.com/OpenSILEX/opensilex` (tag = release) |
| Release notes | GH releases + `opensilex-doc/.../markdown/release/` |
| Build workflow | `.github/workflows/build-opensilex.yml` (workflow_dispatch) |
| Patch apply logic | `tools/patches/opensilex-build-step.docker` |
| Prod image ref | `k8s/opensilex/deployment.yaml` |
| Test env | `scripts/test-env.ps1` (max 1, ephemeral) |
| Run a migration | `./bin/opensilex.sh system run-update <Class>` in the pod |
| Deploy | commit image tag on `k8s` branch -> Flux |

## Common mistakes

- Starting without checking admin login works (Phase 0). No password-reset
  CLI exists; recovery mid-upgrade means creating a new admin email.
- Assuming the migration set. Every range differs — 1.4.8->1.5.0 needed
  DB migrations; always derive from release notes + the
  `opensilex-migration` module diff (Phase 1), never from memory.
- Validating on a FRESH test env. Empty DB => migrations no-op => nothing
  tested. Use the populated `phis-test`.
- Trusting a clean `patch --dry-run`. It checks context, not compilation.
  The image build is the real check; expect API-drift rebases.
- Using the `-rdg` tag variant, or `git apply` instead of `patch -p1`.
- Pushing the Phase 7 commit before Phase 5 passes — `sync-test-image.yml`
  drags every test env onto the unvalidated image.
- Treating post-deploy infinite-loading as a failure. It is almost always
  a stale SPA cache — check `/rest/vuejs/config` 200 in-cluster, then
  hard-refresh.
- `kubectl delete pod` on opensilex/graphdb/mongodb. Rollout restart only.
- Deleting a prod org to "test" the cascade. That destroyed the
  `researchers` group on 2026-09-01. Do the cascade check on `phis-test`.
- Creating an org+group on PROD to smoke-test — it re-arms BUG 1 for
  every non-admin group member. Test that on `phis-test` only.
- Skipping the Phase 6 backup because "it worked on test". Test data is
  disposable; prod research data is not.

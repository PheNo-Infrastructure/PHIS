# Graph Explorer migration into the PHIS repo — design

Date: 2026-09-25. Status: approved in conversation, awaiting written-spec review.
This file is committed only after step 0, on a feature branch, so the history rewrite does not
have to handle it.

## Goal

Move the new web portal (the Graph Explorer: Node/TS server + its single page) from
`PheNo-Infrastructure/PhisWebPortal` (branch `worktree-graph-explorer-v2`, commit `f740511`)
into this repo, so that **Graph Explorer development continues in a new Claude session in the
PHIS repo as if nothing happened**: same code, same tests, same dev loop, same design
knowledge, same working rules. The two-repo split has become more friction than help.

The Streamlit portal is out of scope. It stays in PhisWebPortal, untouched and still deployed.

## Scope

In scope, as four ordered steps. Each step is verified before the next starts:

0. Prune sensitive data from this repo's git history and rename branch `k8s` to `main`, in one
   cut-over.
1. Move the Graph Explorer code into `graph-explorer/`.
2. Consolidate Claude memory for both projects into one local-only folder, and update
   `CLAUDE.md` so a new session can pick up the work.
3. Retire leftovers.

Out of scope, a separate follow-up project: container image, build workflow and Kubernetes
manifests for the Graph Explorer. That project must first decide how to handle the missing
login (the server acts with admin credentials against PHIS). Also out of scope: moving patch
features into an OpenSILEX module, re-evaluating RDF4J vs GraphDB, and config follow-ups from
the 2026-09-25 OpenSILEX developer meeting.

## Constraints

- **This repo is public.** Code is fine. Credentials, `.env`, and Claude memory must never be
  committed. Memory becomes local-only.
- **The `k8s` branch is production.** Flux (`clusters/phis-cluster/flux-system/gotk-sync.yaml`)
  applies `./k8s` from it. Anything outside `./k8s` does not affect the cluster.
- **Force-push exception.** The user's global rules forbid force-pushing. The user granted a
  one-time exception for this history rewrite only (2026-09-25).
- Cluster commands (`kubectl`, `flux`, `az`) are given to the user to run, per `CLAUDE.md`.
- After step 0, `main` is production. Work happens on feature branches and is merged only
  when the user says so.

## Step 0 — history prune and branch rename

### What is pruned (sensitive data only)

- `.claude/memory/` (every file, every revision)
- `.claude/settings.local.json`
- `archive/tools-old/opensilex-official-docker/docker_logs/` (contains an expired signed URL)
- Two credential strings found by a history scan on 2026-09-25 (which files hold which secret
  is recorded in local memory only, not here). They are replaced with `***REMOVED***` through
  `git filter-repo --replace-text`, using an expressions file kept outside the repo. The files
  that contained them are kept.

Old unused bulk (`archive/`, generated Python clients) is **not** pruned.

### Credential handling, done before the rewrite

- The leaked Feide client secret is checked against the live one by comparing SHA-256
  fingerprints, never the values. **Rotate only if they match**: issue a new secret in the
  Feide dashboard, store it in Key Vault, let ESO sync it, and roll the OpenSILEX deployment.
- The other credential belonged to Keycloak, which no longer exists. Pruning is enough.
- Pruning does not make a leaked value safe. Old commits stay reachable by hash on GitHub for
  a while, and in any existing clone or fork. Rotation is the real fix. A GitHub support
  request to purge cached views is optional.

### Cut-over sequence

0. **Back up local-only files first.** Copy `.claude/memory/` and `.claude/settings.local.json`
   from the working clone to a folder outside the repo (for example
   `~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory-backup-2026-09-25/`).
   Step 7 resets clones to the rewritten history, and git deletes tracked files that are not in
   the new tree, so without this copy the memory is lost before step 2 can sort it.
1. Make a fresh `git clone --mirror` of this repo, and run `git filter-repo` on it with the
   path removals and the replace-text file above.
2. Verify the rewritten repo:
   - `git log --all -S '<secret>'` finds nothing, for both secrets.
   - No `.claude/memory` path exists in any commit.
   - The tip tree equals the current `k8s` tip, apart from the removed paths. Check with
     `git diff` against the original clone.
3. In the rewritten repo, add one commit that changes `gotk-sync.yaml` to `branch: main` and
   `.github/workflows/sync-test-image.yml` to `branches: [main]`. Push it as a **new** branch
   `main` (nothing is overwritten yet).
4. On the original `k8s`, commit the same `gotk-sync.yaml` and workflow change, and push.
   Flux reads it and switches its source to `main`. The manifests are identical, so nothing
   restarts.
5. Verify: `flux get sources git` shows `main` and Ready, and no pod in `phis` has restarted.
   **Rollback until this point:** push `branch: k8s` to `main`, since `k8s` still exists.
6. Set `main` as the GitHub default branch, then delete `k8s` on GitHub. This is the
   irreversible step. It needs explicit confirmation at the time.
7. Re-clone or hard-reset local clones (this machine and any other). Drop
   `harden/graphdb-wedge-recovery` (already merged).
8. On a feature branch: replace remaining "`k8s` branch" references in `README.md`,
   `DEPLOYMENT.md`, `docs/*.md`, `CLAUDE.md` and `.claude/skills/opensilex-upgrade/SKILL.md`.
   Add `.claude/memory/`, `.claude/settings.local.json`, `graph-explorer/.env` and
   `graph-explorer/node_modules/` to `.gitignore`.

## Step 1 — move the code

A fresh import in one commit, whose message names the source `PhisWebPortal@f740511`. No
history is carried over; the old repo keeps it.

| From (PhisWebPortal) | To (PHIS) | Change |
|---|---|---|
| `server/src/**` | `graph-explorer/src/**` | `routes/static.ts`: page path points to `../../public/index.html` |
| `server/test/**` | `graph-explorer/test/**` | None (only `routes/static.ts` refers to the page's path) |
| `server/package.json`, `package-lock.json` | `graph-explorer/` | `--env-file=.env` instead of `../.env` |
| `docs/superpowers/prototypes/2026-09-21-graph-explorer-mockup.html` | `graph-explorer/public/index.html` | None |
| `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md` | `docs/superpowers/specs/` | Paths inside updated to the new layout |
| `.env.example` | `graph-explorer/.env.example` | Only `PHIS_HOST`, `PHIS_USER`, `PHIS_PASS` |

Not moved: the Streamlit app, pages, `utils/`, instrument plugins, superseded specs and plans
(neighborhood, v2), `.venv*`, `.superpowers/`. They stay in PhisWebPortal as reference.

The local `.env` is copied by hand into `graph-explorer/.env`. It is ignored and never
committed.

Done when:
- `npm install && npm test` passes in `graph-explorer/` (4 suites; the live smoke test reads
  real PHIS).
- `npm run dev` serves `http://localhost:4000` and `/api/experiments` returns real
  experiments.
- `git grep` finds no `../.env`, no path leaving `graph-explorer/`, and no credential values.

## Step 2 — memory and dev setup

**Target:** one local-only folder,
`~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory/`, with a fresh
`MEMORY.md` index. Nothing is committed.

**Sources:**

| Source | Files | Treatment |
|---|---|---|
| This repo's `.claude/memory/` (the step 0.0 backup) | 30 | Base. Merge duplicates. Rewrite or drop stale entries (old VMs, Ansible branch, finished repo-org migration). |
| Existing local `...-PHIS-PHIS/memory/` | 20 | Older copy. Merge anything newer, then replace it with the curated set. |
| Portal v2 folder `...-worktree-graph-explorer-v2/memory/` | 7 | Take all of them. Update paths (`server/` becomes `graph-explorer/`). |
| `...-PHIS-PhisWebPortal/memory/` | 25 | Keep only what is still useful: OpenSILEX RDF model, oeso map, SMTP, JVM tuning, working-style feedback. Leave the Streamlit-specific files. |
| `...-GitHub-PHIS/`, `...-prompt-improver-PhisWebPortal/` | 14 and 5 | Read for anything unique, then leave them. |

**Process:**
1. Write a triage table: each file with keep, merge into X, rewrite, or drop, plus a
   one-line reason. **The user approves it before anything is written.**
2. Build the new folder. Check that every `[[link]]` matches an existing `name:`.
3. Add a memory recording which files held the pruned credentials, and whether the Feide
   secret was rotated.
4. Old folders are not deleted. The user decides later.

**`CLAUDE.md` (this repo):**
- Remove the "copy memory in/out, commit" procedure. It points at an old path from another
  machine, and memory is now local-only.
- Add a Graph Explorer section: where it lives, `npm run dev` (port 4000) and `npm test`,
  the `.env` keys, where the design spec is, and the rule that live runs hit production PHIS
  (throwaway nodes only; never PUT a node that has an `address`).
- State that `main` is production and that work goes on feature branches.

`.claude/skills/` in this repo stays as is. The user-level `phiswebportal-onboard-instrument`
skill is Streamlit-specific and is left alone.

## Step 3 — retire leftovers

- PhisWebPortal README: a line saying the Graph Explorer moved to `PHIS/graph-explorer`.
  Optionally, archive the repo; the user decides. It is already private and its history has no
  secrets (audited 2026-09-25).
- `k8s/portal/graphdb-init-job.yaml` and the GraphDB `portal` user are kept for now. They
  serve the Streamlit portal, and the deploy project decides their future.

## Success criteria

1. **Continuity:** a new Claude session opened in the PHIS repo, with no other context, can
   run and test the Graph Explorer and continue its next step using only `CLAUDE.md`, the
   curated memory and `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md`.
   Check this by opening such a session and asking it to start the server and summarise the
   next step.
2. Flux is Ready on `main`, `k8s` is gone on GitHub, and no pod in `phis` restarted because of
   the cut-over.
3. The Feide secret is confirmed not live, or it has been rotated.
4. A fresh clone contains no `.claude/memory`, no `settings.local.json`, and neither credential
   string in any commit.
5. `npm test` passes in `graph-explorer/`.

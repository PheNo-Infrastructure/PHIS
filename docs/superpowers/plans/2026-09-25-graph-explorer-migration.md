# Graph Explorer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Graph Explorer into this repo so its development continues in a new Claude session here as if nothing happened. Along the way, prune sensitive data from this public repo's history, rename `k8s` to `main`, and consolidate Claude memory into one local-only set.

**Architecture:** First a one-time history rewrite (`git filter-repo` on a mirror clone), pushed as a new `main`. Flux is switched to `main` by a commit on `k8s`; the manifests are identical, so nothing restarts. After that, ordinary feature-branch work: docs and `.gitignore`, a fresh import of the code into `graph-explorer/`, and memory curation outside git.

**Tech Stack:** git 2.50 + git-filter-repo (installed), Flux v2 (GitRepository `flux-system`), Node 22 (`--experimental-strip-types`), kubectl, PowerShell for commands the user runs.

**Spec:** `docs/superpowers/specs/2026-09-25-graph-explorer-migration-design.md`

## Global Constraints

- The repo is public. Never commit credentials, `.env`, `.claude/memory/` or `.claude/settings.local.json`. Never print a credential value in terminal output; compare SHA-256 fingerprints only.
- `k8s` (and later `main`) is production. Flux applies `./k8s` (Kustomization `phis-stack`) and `./clusters/phis-cluster` (Kustomization `flux-system`).
- The force-push and branch-delete exception applies only to this history rewrite (granted by the user on 2026-09-25). No other force pushes.
- `kubectl`, `flux` and `az` commands: give them to the user in PowerShell syntax and let the user run them (`CLAUDE.md`). Git pushes to GitHub: ask right before each one.
- Irreversible step (Task 5: deleting `k8s` on GitHub): explicit confirmation at the time, naming the branch.
- Never `kubectl delete` anything in namespace `phis`. The cut-over must not restart any pod.
- After Task 5, work happens on branch `migrate/graph-explorer`, which is merged into `main` only when the user says so.
- Source of the code: `PheNo-Infrastructure/PhisWebPortal` at commit `f740511`, branch `worktree-graph-explorer-v2`, local path `C:\Users\siv017\Documents\GitHub\PHIS\PhisWebPortal\.claude\worktrees\worktree-graph-explorer-v2`.
- Scratch area for this plan, outside every repo: `~/.claude/phis-prune/` (`C:\Users\siv017\.claude\phis-prune\`). Delete it in Task 10.

## Review Focus

1. **The rewritten tip differs from production beyond the 31 removed paths** (for example, replace-text matched a string in a manifest). Flux would then change the live cluster. Task 3 Step 5 checks the tree against `origin/k8s` and fails on any difference outside `.claude/memory/**` and `.claude/settings.local.json`.
2. **New commits land on `k8s` between the mirror clone and the cut-over** (CI, another machine). They would silently vanish. Task 4 Step 1 checks that `origin/k8s` is still `33906f2`; if it isn't, redo Task 3.
3. **Flux can't find `main` and stops deploying.** Task 4 Step 5 checks that the GitRepository is Ready on `main`, and the rollback is written into Task 4.
4. **Local memory is deleted when the clone is reset to the rewritten history.** Task 1 Step 2 backs it up and checks the count (30 files, plus the settings file) before anything else happens.
5. **`graph-explorer/.env` gets committed.** Task 7 Step 7 checks with `git check-ignore` before the commit.

---

### Task 1: Back up local-only files and build the replace-text file

**Files:**
- Create: `~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory-backup-2026-09-25/` (copy of `.claude/memory/` and `settings.local.json`)
- Create: `~/.claude/phis-prune/expressions.txt` (secret values; never printed, never committed)

**Interfaces:**
- Produces: `expressions.txt` in `git filter-repo --replace-text` format (`<literal>==>***REMOVED***`, one per line), used in Task 3. Also `feide-leaked.sha256`, used in Task 2.

- [ ] **Step 1: Confirm the starting state**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git fetch origin
git status -sb | head -1              # expect: ## k8s...origin/k8s (no ahead/behind)
git rev-parse --short origin/k8s      # expect: 33906f2
ls .claude/memory | wc -l             # expect: 30
```

If `origin/k8s` is not `33906f2`, update the expected tip everywhere in this plan to the new value, and re-check that the tip still contains neither of the two leaked files (listed in local memory).

- [ ] **Step 2: Back up memory and the settings file**

```bash
B=~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory-backup-2026-09-25
mkdir -p "$B"
cp -p .claude/memory/*.md "$B"/
cp -p .claude/settings.local.json "$B"/
ls "$B" | wc -l                       # expect: 31
diff -rq .claude/memory "$B" | grep -v settings.local.json   # expect: no output
```

- [ ] **Step 3: Build the replace-text file without printing the values**

```bash
mkdir -p ~/.claude/phis-prune
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git grep -h -o -E "$(cat ~/.claude/phis-prune/patterns.txt)" $(git rev-list --all) 2>/dev/null \
  | sed -E 's/^[A-Z_]+="(.*)"$/\1/' | sort -u \
  | awk '{print $0 "==>***REMOVED***"}' > ~/.claude/phis-prune/expressions.txt
wc -l < ~/.claude/phis-prune/expressions.txt          # expect: 2 (one per secret; more only if a value changed across revisions)
awk -F'==>' '{print length($1), substr($1,1,3)"..."}' ~/.claude/phis-prune/expressions.txt   # lengths and 3-char prefixes only
```

Expected: the two prefixes recorded in local memory (`project_phis_history_leaks.md`). If the count isn't 2, inspect the prefixes and lengths, not the values.

- [ ] **Step 4: Fingerprint the leaked Feide secret**

```bash
awk -F'==>' 'substr($1,1,3)==ENVIRON["FEIDE_PREFIX"]{printf "%s", $1}' ~/.claude/phis-prune/expressions.txt \
  | sha256sum | cut -c1-64 | tr 'a-f' 'A-F' > ~/.claude/phis-prune/feide-leaked.sha256
cat ~/.claude/phis-prune/feide-leaked.sha256          # a 64-char hex fingerprint, safe to show
```

No commit in this task. Nothing in the repo changes.

---

### Task 2: Check whether the leaked Feide secret is live; rotate only if it is

**Files:** none in the repo. Updates memory file `project_phis_history_leaks.md` (the "Status" line).

**Interfaces:**
- Consumes: `~/.claude/phis-prune/feide-leaked.sha256` (Task 1).
- Produces: a decision, "not live" or "rotated", recorded in memory. The history rewrite does not depend on it, but finish this task before Task 3 so the leaked value is dead before anything else happens.

- [ ] **Step 1: The user fingerprints the live secret (PowerShell)**

Give the user this block. It reads the Kubernetes secret that OpenSILEX actually uses, hashes it, and prints only the hash.

```powershell
$b64 = kubectl get secret feide-credentials -n phis -o jsonpath='{.data.client-secret}'
$bytes = [Convert]::FromBase64String($b64)
$hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
([BitConverter]::ToString($hash) -replace '-','')
```

- [ ] **Step 2: Compare**

Compare the user's output with the contents of `feide-leaked.sha256`.
- **Different:** the leaked secret isn't live. Record "not live (checked 2026-MM-DD)" in memory and skip to Task 3.
- **Same:** the leaked secret is live. Do Step 3.

- [ ] **Step 3 (only if they match): Rotate**

The user:
1. In the Feide customer portal (`https://dashboard.dataporten.no` → the PHIS application → client secret), generates a new secret.
2. Stores it in Key Vault under the name `feide-client-secret`:
   Needs PowerShell 7 (`pwsh`) for `-AsPlainText`. The value is typed at a hidden prompt and never echoed:
   ```powershell
   $kv = az keyvault list --query "[0].name" -o tsv
   az keyvault secret set --vault-name $kv --name feide-client-secret --value (Read-Host -AsSecureString "New secret" | ConvertFrom-SecureString -AsPlainText)
   ```
3. Forces ESO to sync instead of waiting up to 1 h, then restarts OpenSILEX the safe way:
   ```powershell
   kubectl annotate externalsecret feide-credentials -n phis force-sync=(Get-Date -UFormat %s) --overwrite
   kubectl rollout restart deployment/opensilex -n phis
   kubectl rollout status deployment/opensilex -n phis --timeout=300s
   ```
4. Checks: log in to `https://phis.pheno.no` with Feide, and it works.
5. Repeats Step 1. The hash must now differ from `feide-leaked.sha256`.

Record "rotated 2026-MM-DD" in memory.

---

### Task 3: Rewrite a mirror clone and verify it

**Files:**
- Create: `~/.claude/phis-prune/PHIS.git` (mirror, rewritten)

**Interfaces:**
- Consumes: `expressions.txt` (Task 1).
- Produces: a rewritten repo whose branch `k8s` has the same tree as `origin/k8s` minus 31 paths. Task 4 pushes it as `main`.

- [ ] **Step 1: Mirror clone**

```bash
cd ~/.claude/phis-prune
git clone --mirror https://github.com/PheNo-Infrastructure/PHIS.git PHIS.git
git -C PHIS.git rev-parse --short k8s          # expect: 33906f2
```

- [ ] **Step 2: Rewrite**

```bash
cd ~/.claude/phis-prune/PHIS.git
git filter-repo --force \
  --invert-paths \
  --path .claude/memory/ \
  --path .claude/settings.local.json \
  --path archive/tools-old/opensilex-official-docker/docker_logs/ \
  --replace-text ../expressions.txt
```

Expected: it finishes with "Completely finished after ..." and removes the `origin` remote (that's normal for filter-repo).

- [ ] **Step 3: Verify no secret remains in any commit**

```bash
cd ~/.claude/phis-prune/PHIS.git
while IFS= read -r line; do
  v="${line%%==>*}"
  n=$(git log --all --oneline -S"$v" | wc -l)
  echo "${v:0:3}... hits: $n"
done < ../expressions.txt
```

Expected: `0` hits for both prefixes.

- [ ] **Step 4: Verify no pruned path remains in any commit**

```bash
git log --all --format= --name-only | grep -E '^\.claude/memory/|^\.claude/settings\.local\.json$|opensilex-official-docker/docker_logs/' | wc -l
```

Expected: `0`.

- [ ] **Step 5: Verify the tip tree equals production minus the 31 paths**

```bash
cd ~/.claude/phis-prune
git -C /c/Users/siv017/Documents/GitHub/PHIS/PHIS ls-tree -r origin/k8s \
  | grep -v -E $'\t\\.claude/memory/|\t\\.claude/settings\\.local\\.json$' | sort > before.txt
git -C PHIS.git ls-tree -r k8s | sort > after.txt
diff before.txt after.txt && echo "TREES IDENTICAL"
git -C /c/Users/siv017/Documents/GitHub/PHIS/PHIS ls-tree -r origin/k8s | wc -l   # N
wc -l < after.txt                                                                   # expect: N - 31
```

Expected: `TREES IDENTICAL`, and the counts differ by exactly 31. **If `diff` prints anything, stop.** Pushing this would change the live cluster.

- [ ] **Step 6: Record the branch list**

```bash
git -C PHIS.git for-each-ref --format='%(refname)' | grep -v '^refs/pull/'
```

Expected: `refs/heads/k8s` only. The `refs/pull/*` refs came with the mirror clone. They are not pushed; GitHub's copy of the one existing pull request keeps its old commits, and only GitHub support can remove those.

No commit. Nothing is pushed.

---

### Task 4: Cut Flux over to the rewritten `main`

**Files:**
- Modify: `clusters/phis-cluster/flux-system/gotk-sync.yaml:11` (`branch: k8s` → `branch: main`), in both the rewritten repo and the current clone
- Modify: `.github/workflows/sync-test-image.yml:5` (`branches: [k8s]` → `branches: [main]`), same two places
- Modify: `terraform/identity.tf:5,19,23` (the GitHub Actions to Azure trust: `ref:refs/heads/k8s` → `ref:refs/heads/main`, plus the two comments), same two places

**Interfaces:**
- Consumes: the rewritten `PHIS.git` (Task 3).
- Produces: GitHub branch `main` (rewritten history, production from now on). Flux GitRepository `flux-system` tracks `main`.

- [ ] **Step 1: Confirm production hasn't moved**

```bash
git -C /c/Users/siv017/Documents/GitHub/PHIS/PHIS fetch origin
git -C /c/Users/siv017/Documents/GitHub/PHIS/PHIS rev-parse --short origin/k8s   # expect: 33906f2
```

If it changed, stop and redo Task 3 from Step 1.

- [ ] **Step 2: Add the switch commit to the rewritten history**

```bash
cd ~/.claude/phis-prune
rm -rf work && git clone -q PHIS.git work && cd work
git checkout -q k8s && git checkout -q -b main
sed -i 's/^    branch: k8s$/    branch: main/' clusters/phis-cluster/flux-system/gotk-sync.yaml
sed -i 's/^    branches: \[k8s\]$/    branches: [main]/' .github/workflows/sync-test-image.yml
sed -i -e 's#ref:refs/heads/k8s"#ref:refs/heads/main"#' -e 's/k8s branch/main branch/g' terraform/identity.tf
git diff --stat           # expect: 3 files changed (gotk-sync.yaml, sync-test-image.yml, identity.tf)
git -c user.name="Sebastian Iversen" -c user.email="sebive98@gmail.com" commit -qam "chore: track branch main instead of k8s (Flux, workflow, Azure OIDC trust)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push the new `main` (ask the user first)**

```bash
cd ~/.claude/phis-prune/work
git push https://github.com/PheNo-Infrastructure/PHIS.git main:main
```

This creates a new branch and overwrites nothing. `sync-test-image.yml` may run for `main`. It sets every test namespace to the image already in `deployment.yaml`, so nothing changes.

- [ ] **Step 4: Make the same change on `k8s` so Flux reads it (ask the user first)**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
sed -i 's/^    branch: k8s$/    branch: main/' clusters/phis-cluster/flux-system/gotk-sync.yaml
sed -i 's/^    branches: \[k8s\]$/    branches: [main]/' .github/workflows/sync-test-image.yml
sed -i -e 's#ref:refs/heads/k8s"#ref:refs/heads/main"#' -e 's/k8s branch/main branch/g' terraform/identity.tf
git diff --stat           # expect: 3 files changed
git commit -qam "chore: track branch main instead of k8s (Flux, workflow, Azure OIDC trust)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin k8s
```

- [ ] **Step 5: The user checks the switch (PowerShell)**

```powershell
flux reconcile kustomization flux-system --with-source
flux get sources git -A
flux get kustomizations -A
kubectl get pods -n phis
```

Expected:
- `flux-system` GitRepository: READY `True`, revision `main@sha1:<the Step 2 commit>`.
- All Kustomizations are READY `True`.
- In `kubectl get pods`, every pod's AGE is unchanged, with no new pods.

- [ ] **Step 6: Move the GitHub Actions to Azure trust to `main` (the user runs this, PowerShell)**

Until this is applied, `sync-test-image.yml` fails at "Azure login" for pushes to `main`. Production isn't affected; Flux doesn't use this.

```powershell
cd C:\Users\siv017\Documents\GitHub\PHIS\PHIS\terraform
terraform plan -out=branch.tfplan
```

Expected plan: **only** `azurerm_federated_identity_credential.gha` changes (its `subject` goes from `...:ref:refs/heads/k8s` to `...:ref:refs/heads/main`; replacement is fine). If anything else appears in the plan, stop and show it. Then:

```powershell
terraform apply branch.tfplan
gh workflow run sync-test-image.yml --ref main -R PheNo-Infrastructure/PHIS
gh run watch -R PheNo-Infrastructure/PHIS
```

Expected: the run passes "Azure login (OIDC)". It either syncs the test namespaces or reports "No test namespaces found".

**Rollback** (only if the GitRepository isn't Ready on `main` within about 5 minutes). While the source is failing, Flux keeps the last applied state, so the cluster is unaffected, but pushing to `main` won't help because Flux can't fetch it. Point Flux back at `k8s` directly, then undo the switch on `k8s`:

```powershell
kubectl describe gitrepository flux-system -n flux-system      # read the error first
kubectl patch gitrepository flux-system -n flux-system --type merge -p '{\"spec\":{\"ref\":{\"branch\":\"k8s\"}}}'
```

Then `git revert` the Step 4 commit on `k8s` and push it. Otherwise, the next `flux-system` reconcile would switch back to `main`.

---

### Task 5: Make `main` the default, delete `k8s`, reset the local clone

**Files:** none in the repo. The local clone moves to the rewritten history.

**Interfaces:**
- Consumes: Flux Ready on `main` (Task 4 Step 5). **Don't start without it.**
- Produces: GitHub with only `main`. The local clone is on `main` (rewritten), with `.claude/memory/` gone from disk (it's in the Task 1 backup).

- [ ] **Step 1: Set the default branch (ask the user first)**

```bash
gh repo edit PheNo-Infrastructure/PHIS --default-branch main
gh api repos/PheNo-Infrastructure/PHIS --jq .default_branch      # expect: main
```

- [ ] **Step 2: Delete `k8s` on GitHub (IRREVERSIBLE, explicit confirmation naming `k8s`)**

```bash
git -C /c/Users/siv017/Documents/GitHub/PHIS/PHIS push origin --delete k8s
git ls-remote --heads https://github.com/PheNo-Infrastructure/PHIS.git   # expect: refs/heads/main only
```

- [ ] **Step 3: Move the local clone in place (keeps untracked files such as `docs/superpowers/`)**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git fetch origin --prune
git checkout -B main origin/main
git branch -D k8s harden/graphdb-wedge-recovery
git branch --set-upstream-to=origin/main main
git remote set-head origin -a
git status -sb | head -1        # expect: ## main...origin/main
ls .claude/memory 2>/dev/null | wc -l   # expect: 0 (removed from disk; backup exists)
ls docs/superpowers/specs/2026-09-25-graph-explorer-migration-design.md   # still there (untracked)
```

- [ ] **Step 4: Check that no other clone exists**

Ask the user whether the PHIS repo is cloned on any other machine (the old memory path `c--Users-sebas-...` suggests one existed). Any other clone must run `git fetch origin --prune; git checkout -B main origin/main` before its next push. A push from an old clone would bring the pruned history back.

---

### Task 6: Branch refs, `.gitignore`, and commit the spec and plan

**Files:**
- Modify: `.gitignore` (append 4 lines)
- Modify: every file listed by Step 2's search (expected: `README.md`, `DEPLOYMENT.md`, `docs/ONBOARDING.md`, `docs/EXTERNAL_ACCESS.md`, `docs/architecture-prompt.md`, `.claude/skills/opensilex-upgrade/SKILL.md`, `CLAUDE.md`)
- Add: `docs/superpowers/specs/2026-09-25-graph-explorer-migration-design.md`, `docs/superpowers/plans/2026-09-25-graph-explorer-migration.md`

**Interfaces:**
- Produces: branch `migrate/graph-explorer`, used by Tasks 7 and 9.

- [ ] **Step 1: Branch**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git checkout -b migrate/graph-explorer
```

- [ ] **Step 2: Find prose references to the old branch**

```bash
git grep -n -E '`k8s` branch|k8s branch|branch `k8s`|branch k8s|origin/k8s|on `k8s`|to `k8s`|\(`?k8s`?\)|branches: \[k8s\]' -- . ':!k8s/**' ':!docs/superpowers/**'
```

Change each hit to `main`, keeping the sentence otherwise intact. For example, `This branch (\`k8s\`) contains` becomes `This branch (\`main\`) contains`. Leave paths like `k8s/opensilex/` alone; they're folder names, not the branch. Then re-run the search. Expected: no output.

- [ ] **Step 3: Extend `.gitignore`**

Append:

```gitignore

# Claude Code: memory and local settings are local-only (repo is public)
.claude/memory/
.claude/settings.local.json

# Graph Explorer
graph-explorer/.env
graph-explorer/node_modules/
```

- [ ] **Step 4: Check the ignores**

```bash
git check-ignore -v --no-index .claude/memory/x.md .claude/settings.local.json graph-explorer/.env graph-explorer/node_modules/x
```

Expected: 4 lines, each naming the new `.gitignore` rule. (`check-ignore` works on paths that don't exist, so no files are created.)

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md DEPLOYMENT.md docs/ONBOARDING.md docs/EXTERNAL_ACCESS.md docs/architecture-prompt.md .claude/skills/opensilex-upgrade/SKILL.md CLAUDE.md \
  docs/superpowers/specs/2026-09-25-graph-explorer-migration-design.md docs/superpowers/plans/2026-09-25-graph-explorer-migration.md
git status --short     # nothing staged outside that list
git commit -m "docs: rename branch k8s to main; ignore local Claude files; add migration spec and plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Adjust the `git add` list to the files Step 2 actually changed.

---

### Task 7: Import the Graph Explorer into `graph-explorer/`

**Files:**
- Create: `graph-explorer/src/**` (copy of `server/src/**`)
- Create: `graph-explorer/test/**` (copy of `server/test/**`)
- Create: `graph-explorer/package.json`, `graph-explorer/package-lock.json`
- Create: `graph-explorer/public/index.html` (copy of `docs/superpowers/prototypes/2026-09-21-graph-explorer-mockup.html`)
- Create: `graph-explorer/.env.example`
- Create: `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md`
- Modify: `graph-explorer/src/routes/static.ts:8` (page path)
- Modify: `graph-explorer/package.json` (`--env-file`)
- Local only: `graph-explorer/.env` (copied, ignored)

**Interfaces:**
- Consumes: branch `migrate/graph-explorer` and the `.gitignore` rules (Task 6).
- Produces: `npm run dev` on port 4000 and `npm test`, both run from `graph-explorer/`. Tasks 9 and 10 document and check them.

- [ ] **Step 1: Copy the files**

```bash
SRC=/c/Users/siv017/Documents/GitHub/PHIS/PhisWebPortal/.claude/worktrees/worktree-graph-explorer-v2
DST=/c/Users/siv017/Documents/GitHub/PHIS/PHIS
git -C "$SRC" rev-parse --short HEAD          # expect: f740511, and a clean `git -C "$SRC" status --short`
mkdir -p "$DST/graph-explorer/public"
cp -r "$SRC/server/src" "$SRC/server/test" "$DST/graph-explorer/"
cp "$SRC/server/package.json" "$SRC/server/package-lock.json" "$DST/graph-explorer/"
cp "$SRC/docs/superpowers/prototypes/2026-09-21-graph-explorer-mockup.html" "$DST/graph-explorer/public/index.html"
cp "$SRC/docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md" "$DST/docs/superpowers/specs/"
cp "$SRC/.env" "$DST/graph-explorer/.env"
```

- [ ] **Step 2: Run the tests before changing anything (expect failure)**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS/graph-explorer
npm install
npm test 2>&1 | tail -15
```

Expected: failure. `--env-file=../.env` finds no `PHIS/.env`, so `requireEnv("PHIS_HOST")` throws. And `GET /` fails because the page path points into `docs/superpowers/prototypes/`. This confirms the two changes below are the ones needed.

- [ ] **Step 3: Point the server at the new locations**

In `graph-explorer/src/routes/static.ts`, replace:

```ts
  "../../../docs/superpowers/prototypes/2026-09-21-graph-explorer-mockup.html"
```

with:

```ts
  "../../public/index.html"
```

In `graph-explorer/package.json`, replace both occurrences of `--env-file=../.env` with `--env-file=.env`:

```json
  "scripts": {
    "dev": "node --experimental-strip-types --env-file=.env src/index.ts",
    "test": "node --experimental-strip-types --env-file=.env --test test/*.test.ts"
  },
```

- [ ] **Step 4: Write `graph-explorer/.env.example`**

```
# Copy to .env (ignored by git; never commit it). Read by `npm run dev` and `npm test`.
# The server logs in to OpenSILEX with these and acts as this account for every request.
PHIS_HOST=https://phis.pheno.no
PHIS_USER=admin@opensilex.org
PHIS_PASS=
```

- [ ] **Step 5: Update the paths inside the design spec**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
sed -i \
  -e 's#docs/superpowers/prototypes/2026-09-21-graph-explorer-mockup\.html#graph-explorer/public/index.html#g' \
  -e 's#`server/src/#`graph-explorer/src/#g' -e 's#`server/test/#`graph-explorer/test/#g' \
  -e 's#`cd server && npm run dev`#`cd graph-explorer \&\& npm run dev`#g' \
  -e 's#Run with `npm test` from `server/`#Run with `npm test` from `graph-explorer/`#g' \
  docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md
grep -n -E "server/|prototypes/" docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md
```

Look over each remaining hit. Rewrite ones that are file paths into `graph-explorer/...`. Leave ones that mean "the server" in prose.

- [ ] **Step 6: Run the tests and the dev server**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS/graph-explorer
npm test 2>&1 | tail -8
```

Expected: all suites pass; the summary shows `# fail 0`. (The e2e suite needs Playwright's browser. If it reports a missing browser, run `npx playwright install chromium` and retry.)

Start the server in the background (`npm run dev`), then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/          # expect: 200
curl -s http://localhost:4000/api/experiments | head -c 120; echo       # expect: JSON with real experiments
```

Stop the server afterwards.

- [ ] **Step 7: Check nothing sensitive or leaking is staged**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git add graph-explorer docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md
git diff --cached --name-only | grep -E '(^|/)\.env$|node_modules/' ; echo "exit=$?"   # expect: exit=1 (no match)
git check-ignore -q graph-explorer/.env && echo ".env ignored"                          # expect: .env ignored
git grep --cached -n -E '\.\./\.env|\.\./\.\./\.\./' -- graph-explorer ; echo "exit=$?" # expect: exit=1
PASSV=$(sed -n 's/^PHIS_PASS=//p' graph-explorer/.env)
[ -n "$PASSV" ] && git grep --cached -q -F "$PASSV" -- . && echo "PASSWORD FOUND - STOP" || echo "no password in index"
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(graph-explorer): import from PhisWebPortal@f740511

Fresh import (no history) of the Graph Explorer server, tests and page.
The page moves from docs/superpowers/prototypes/ to graph-explorer/public/index.html,
and .env is read from graph-explorer/.env instead of the repo root.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Memory triage table (user approval gate)

**Files:**
- Create: `~/.claude/phis-prune/memory-triage.md` (local)

**Interfaces:**
- Consumes: the Task 1 backup (30 files), `~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory/` (20), `...-PhisWebPortal--claude-worktrees-worktree-graph-explorer-v2/memory/` (9, including the two files from 2026-09-25), `...-PHIS-PhisWebPortal/memory/` (25), `...-GitHub-PHIS/memory/` (14), `...-prompt-improver-PhisWebPortal/memory/` (5).
- Produces: an approved table. Every source file gets exactly one of: `keep`, `merge → <target name>`, `rewrite`, `drop`, `ignore (older copy)`, each with a one-line reason. Task 9 builds from it.

- [ ] **Step 1: Read every source file.** For duplicate names across folders, compare the `modified:` metadata and the content; the newest wins.

- [ ] **Step 2: Write the table**, one section per source folder, with columns `file | action | target | reason`. Rules:
  - Keep anything about the live system: cluster, patches, OpenSILEX behaviour, the Graph Explorer design, the user's working style.
  - Drop anything about retired things (old VMs, the Ansible branch, the finished repo-org migration, Streamlit CSS or pages) unless it holds a lesson that still applies. In that case, merge the lesson.
  - Rewrite anything that states a now-wrong fact: the `k8s` branch, `server/` paths, the memory copy procedure, "patches 002–012".
  - Every `merge` target must be a file that is `keep` or `rewrite`.
  - **Always keep** (user requirement): `project_opensilex_dev_meeting_2026_09_25.md`, the conclusions of the 2026-09-25 meeting with the OpenSILEX developers (co-development invite, modules over core patches, RDF4J re-evaluation, users and access are ours to decide, several fixes already upstream, interest in the Kubernetes deployment, follow-up meeting on contributing). Also always keep `project_phis_history_leaks.md`.

- [ ] **Step 3: Show the table to the user and wait for approval.** Apply the changes they ask for. Nothing is written to the target folder before approval.

---

### Task 9: Build the curated memory and update `CLAUDE.md`

**Files:**
- Replace the contents of: `~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory/` (first move the 20 existing files to `.../memory-pre-2026-09-25/`)
- Modify: `CLAUDE.md` (the "Project Memory" section, plus a new "Graph Explorer" section)

**Interfaces:**
- Consumes: the approved triage table (Task 8), and the commands from Task 7 (`npm run dev` on port 4000, `npm test`, `graph-explorer/.env`).
- Produces: the memory set a new session loads, and a `CLAUDE.md` that points to everything.

- [ ] **Step 1: Set the old local folder aside**

```bash
P=~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS
mv "$P/memory" "$P/memory-pre-2026-09-25" && mkdir "$P/memory"
```

- [ ] **Step 2: Write the files per the table.** Each file keeps the standard frontmatter (`name`, `description`, `metadata.type`). Paths are updated (`server/` → `graph-explorer/`, the prototype path → `graph-explorer/public/index.html`, `k8s` branch → `main`). Include `project_phis_history_leaks.md` with the Task 2 outcome, and `project_opensilex_dev_meeting_2026_09_25.md` (the meeting conclusions; required by the user). Link the meeting note from the patch, upgrade and GraphDB memories it affects.

- [ ] **Step 3: Write `MEMORY.md`**, one line per file: `- [Title](file.md) — hook`, grouped under `## Feedback`, `## Project`, `## Graph Explorer`, `## Reference`.

- [ ] **Step 4: Check the links**

```bash
cd ~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory
grep -h '^name:' *.md | sed 's/name: *//' | sort -u > /tmp/names.txt
grep -oh '\[\[[^]]*\]\]' *.md | sed 's/\[\[\(.*\)\]\]/\1/' | sort -u > /tmp/links.txt
comm -13 /tmp/names.txt /tmp/links.txt      # links with no matching file; review each
ls *.md | grep -v MEMORY.md | while read f; do grep -q "($f)" MEMORY.md || echo "not indexed: $f"; done   # expect: no output
```

Dangling links are allowed only where they deliberately mark something to write later. Fix any typos.

- [ ] **Step 5: Update `CLAUDE.md` on `migrate/graph-explorer`**

Replace the whole "## Project Memory" section with:

```markdown
## Project Memory

Claude memory for this repo is **local only** (the repo is public): it lives in
`~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory/` and is never
committed (`.claude/memory/` is in `.gitignore`). It covers both the cluster/OpenSILEX
work and the Graph Explorer. Read `MEMORY.md` there at session start.
```

Add after "## Test Environments":

```markdown
## Graph Explorer (`graph-explorer/`)

The new web portal: one page (`public/index.html`) plus a small Node/TypeScript server
(`src/`), no framework, no build step. It was moved here from the PhisWebPortal repo
(`PhisWebPortal@f740511`). The Streamlit portal still lives there and is out of scope.

- Setup: copy `.env.example` to `.env` and fill in `PHIS_PASS`. Never commit `.env`.
- Run: `cd graph-explorer && npm install && npm run dev`, then open http://localhost:4000.
  Restart after any backend change.
- Test: `npm test` (unit, adjacency, Playwright e2e, and a read-only live smoke test).
- Design and status: `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md`.
  Its "What's NOT built yet" list is where the next step comes from. Pick one step with the user.
- **Live runs hit production PHIS** (`PHIS_HOST` in `.env`). Use a throwaway node for each
  experiment, and never PUT a node that has an `address` (OpenSILEX 1.5.4.7 duplicates the
  location, and the whole list starts returning 500).
- Not deployed to the cluster yet. The deploy project must first solve login, since the
  server acts with the `.env` account.

## Branches

`main` is production (Flux applies `./k8s` from it). Work on a feature branch and merge
only when the user says so.
```

- [ ] **Step 6: Commit `CLAUDE.md`**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git add CLAUDE.md
git commit -m "docs(claude): local-only memory, Graph Explorer section, main is production

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Retire leftovers and check continuity

**Files:**
- Modify: `PhisWebPortal/README.md` (on its `main`, on a branch, merged only with the user's approval)
- Delete: `~/.claude/phis-prune/` (after all checks)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Pointer in the old repo**

In the PhisWebPortal main checkout (`C:\Users\siv017\Documents\GitHub\PHIS\PhisWebPortal`), on a branch `docs/graph-explorer-moved`, add under the title in `README.md`:

```markdown
> **The Graph Explorer (the new portal) moved** to the PHIS repo:
> `PheNo-Infrastructure/PHIS`, folder `graph-explorer/`. Its last version here is commit `f740511`
> on branch `worktree-graph-explorer-v2`. This repo keeps the Streamlit portal.
```

Commit it. Ask the user whether to merge it, and separately whether to archive the repo on GitHub.

- [ ] **Step 2: Fresh-clone check of the public repo**

```bash
cd ~/.claude/phis-prune && rm -rf verify && git clone -q https://github.com/PheNo-Infrastructure/PHIS.git verify && cd verify
git log --all --format= --name-only | grep -c -E '^\.claude/memory/|settings\.local\.json$'   # expect: 0
while IFS= read -r l; do v="${l%%==>*}"; echo "${v:0:3}... $(git log --all --oneline -S"$v" | wc -l)"; done < ../expressions.txt   # expect: 0 and 0
git branch -r        # expect: origin/HEAD -> origin/main, origin/main (+ migrate/graph-explorer if pushed)
```

- [ ] **Step 3: Continuity check (the spec's first success criterion)**

The user opens a **new** Claude Code session in `C:\Users\siv017\Documents\GitHub\PHIS\PHIS`, on `migrate/graph-explorer` (or on `main` after the merge), and asks: *"Start the Graph Explorer and tell me what the next step is."*

Pass means the session, without being told anything else:
- runs `npm run dev` in `graph-explorer/`, and `localhost:4000` shows real data;
- names the next-step candidates from the spec's "What's NOT built yet" list, and asks the user to pick one;
- knows the live-write rules (throwaway nodes, no `address` PUT) and the click-consistency rule from memory;
- when asked "what did the OpenSILEX developers conclude?", answers from memory: modules over core patches, re-evaluate RDF4J, a follow-up meeting on contributing.

Whatever it misses gets added to `CLAUDE.md` or memory, and the check is repeated.

- [ ] **Step 4: Merge (only when the user says so)**

```bash
cd /c/Users/siv017/Documents/GitHub/PHIS/PHIS
git checkout main && git merge --no-ff migrate/graph-explorer && git push origin main
```

Nothing under `k8s/` or `clusters/` changed on this branch, so Flux applies no cluster change. Check with `git diff --stat origin/main..migrate/graph-explorer -- k8s clusters` before merging. Expected: empty.

- [ ] **Step 5: Clean up the scratch area**

```bash
rm -rf ~/.claude/phis-prune
```

This removes the only local copy of the secret values (`expressions.txt`). The memory backup under `.../memory-backup-2026-09-25/` stays until the user decides.

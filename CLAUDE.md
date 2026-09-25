# PHIS Project — Claude Code Context

## Data Persistence (HIGHEST PRIORITY)

Research data in this cluster is **irreplaceable**. Treat any operation that touches storage as a potential data-loss event, even if it looks routine.

### Never — without naming the specific resource AND explicit user confirmation
- Delete a PVC (`kubectl delete pvc ...`)
- Delete a StatefulSet or its pods in a way that races with an unmounted disk
- Run `kubectl delete pod` on MongoDB, GraphDB, or OpenSILEX — use `kubectl rollout restart` instead
- Delete or truncate the OpenSILEX `.installed` marker at `/home/opensilex/data/.installed` unless the user explicitly says they want to re-run system install (it resets **all user data**)
- Change a StorageClass or PV reclaim policy from `Retain` to `Delete`
- Drop the MongoDB replica set (`rs.remove`, `rs.reconfig`) without verifying the PVC survives

### Before any kubectl delete or patch touching a running database pod
1. `kubectl get pvc -n phis` — confirm reclaim policy and binding
2. State what data is at risk and what the recovery path is
3. Ask for explicit confirmation naming the resource

### Safe image upgrade path (no data risk)
Update image tag in `k8s/opensilex/deployment.yaml` → commit + push → Flux rolling restart. PVCs are never touched.

### When in doubt
Do the read-only version first (`kubectl get`, `kubectl describe`, `kubectl logs`), report findings, then ask before mutating.

## Working Style

The user is learning Kubernetes and Azure infrastructure. For `kubectl`, `az`, `terraform`, and `flux`:

- **Run the command yourself** (the user prefers this, 2026-09-25). Read-only commands (`get`, `describe`, `logs`, `show`, `terraform plan`) need no confirmation.
- **High-risk commands: confirm first.** State exactly what will change and wait for a yes before anything that changes production: `kubectl apply/patch/annotate/rollout` in `phis`, `terraform apply`, `az ... set/delete`, pushes to `main`. The Data Persistence rules above always apply.
- **Explain what the command does and why** in plain language — what it talks to, what it changes, what could go wrong. Short and concrete; define jargon in one line.
- If the permission classifier blocks a command, give the user the PowerShell version instead.
- Azure: always the "Lab - Sebastian Iversen (FOF)" subscription; pass `-var=subscription_id=...` to terraform. The `flux` CLI is not installed — use `kubectl get gitrepositories,kustomizations -A`.

## Test Environments

On-demand environments for testing changes without touching production. Managed by `scripts/test-env.ps1` (interactive PowerShell menu).

- Namespaces: `phis-<name>` (e.g. `phis-test`, `phis-myfeature`)
- Max **1 test environment** at a time — Azure Disk limit (7/8 slots used by prod+test on the D4s_v3)
- Test PVCs use `managed-csi` with Delete reclaim policy — data is destroyed with `kubectl delete namespace`
- Production deployment files are sourced at spin-up time — new environments automatically get the latest image tags
- `email: enable: false` is required in `k8s/test/opensilex.yml` — `simulateSending: true` alone still crashes on SMTP connect
- `k8s/test/resource-patches.yaml` lowers CPU requests to 100m — do not remove, the node hits scheduler limits without it

**Data protection note:** Test PVCs are intentionally ephemeral (Delete reclaim policy). The Kyverno `block-pvc-delete-phis` policy only covers the `phis` namespace — test namespace PVCs are unprotected by design.

## Project Memory

Claude memory for this repo is **local only** (the repo is public): it lives in
`~/.claude/projects/c--Users-siv017-Documents-GitHub-PHIS-PHIS/memory/` and is never
committed (`.claude/memory/` is in `.gitignore`). It covers both the cluster/OpenSILEX
work and the Graph Explorer. Read `MEMORY.md` there at session start.

## Graph Explorer (`graph-explorer/`)

The new web portal: one page (`public/index.html`) plus a small Node/TypeScript server
(`src/`), no framework, no build step. It was moved here from the PhisWebPortal repo
(`PhisWebPortal@f740511`). The Streamlit portal still lives there and is out of scope.

- Setup: copy `.env.example` to `.env` and fill in `PHIS_PASS`. Never commit `.env`.
- Run: `cd graph-explorer && npm install && npm run dev`, then open http://localhost:4000.
  Restart after any backend change. Stopping the npm task can leave `node` holding
  :4000 — free the port explicitly (see the dev-loop memory).
- Test: `npm test` (unit, adjacency, Playwright e2e, and a read-only live smoke test).
- Design and status: `docs/superpowers/specs/2026-09-21-graph-explorer-unified-design.md`.
  Its "What's NOT built yet" list is where the next step comes from — pick ONE with the user.
- **Live runs hit production PHIS** (`PHIS_HOST` in `.env`). Use a throwaway node for each
  experiment, and never PUT a node that has an `address` (OpenSILEX 1.5.4.7 duplicates the
  location, and the whole list starts returning 500).
- Not deployed to the cluster yet. The deploy project must first solve login, since the
  server acts with the `.env` account.

## Branches

`main` is production (Flux applies `./k8s` from it). Work on a feature branch and merge
only when the user says so.

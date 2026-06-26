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

The user is learning Kubernetes and Azure infrastructure. When running `kubectl`, `az`, `terraform`, or `flux` commands:

- **Provide the command for the user to run manually** rather than executing it directly, unless they explicitly ask Claude to run it.
- **Explain what the command does and why** in plain language before giving it — what it talks to, what it changes, what could go wrong.
- Keep explanations short and concrete. Avoid jargon without a one-line definition. Assume no prior Kubernetes/Azure knowledge.
- If a sequence of commands is needed, walk through them one at a time so the user can see the output of each before proceeding.

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

Memory files live in `.claude/memory/` in this repo and travel with the code.

**Session start:** copy `.claude/memory/` → `~/.claude/projects/c--Users-sebas-Documents-GitHub-PHIS/memory/` then read `MEMORY.md` and linked files.

```bash
cp .claude/memory/*.md ~/.claude/projects/c--Users-sebas-Documents-GitHub-PHIS/memory/
```

**Session end (after significant changes):** copy updated memory files back, commit, push.

```bash
cp ~/.claude/projects/c--Users-sebas-Documents-GitHub-PHIS/memory/*.md .claude/memory/
git add .claude/memory/
git commit -m "docs: update project memory"
git push
```

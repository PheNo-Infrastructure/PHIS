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

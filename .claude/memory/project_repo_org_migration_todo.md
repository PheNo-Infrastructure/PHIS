---
name: project_repo_org_migration_todo
description: TODO — loose ends after moving PHIS repo from personal github (lversen) to org PheNo-Infrastructure
metadata: 
  node_type: memory
  type: project
  originSessionId: ce94d7fb-dd64-4ff1-bac8-51cfd8ce6a6f
  modified: 2026-09-16T09:09:18.940Z
---

Repo was moved from personal GitHub (`lversen/PHIS`) to org
`PheNo-Infrastructure/PHIS` (org id 318586985, repo id 1009483669).
Discovered 2026-09-01 when `sync-test-image.yml` failed at Azure OIDC login:
`AADSTS700213: No matching federated identity record` for subject
`repo:PheNo-Infrastructure@318586985/PHIS@1009483669:ref:refs/heads/k8s`.

**RESOLVED 2026-09-01:**
- Flux GitOps was frozen at `k8s@131b60a` (GitRepository pointed at old
  `lversen/PHIS`). Org `PheNo-Infrastructure` had deploy keys disabled org-wide,
  which also killed the transferred deploy key. Owner re-enabled deploy keys;
  rotated to a fresh ed25519 key (`gh api POST .../keys`), updated secret
  `flux-system` (identity/identity.pub/known_hosts), patched GitRepository url
  to org SSH, suspended+resumed flux-system Kustomization to beat the revert
  race. Now READY at `33d1817`. GraphDB hardening deployed and verified.
- gotk-sync.yaml url committed as org SSH in `33d1817`.

**RESOLVED 2026-09-16** (verified, not just assumed — checked live state):
- Only one deploy key on the repo now (`flux-system-k8s (rotated 2026-09-01)`,
  id 161919989) — stale key already gone.
- `deployment.yaml` already references `ghcr.io/pheno-infrastructure/opensilex-phis`
  (org namespace), not the old `lversen` one.
- `sync-test-image.yml` and `build-opensilex.yml` both ran green multiple times
  on 2026-09-16 (images 1.5.4.4 through 1.5.4.6) — Azure OIDC federated
  credentials and GHCR auth are working, so the `terraform apply` / federated
  credential update must have landed at some point after this memory was
  written. `ghcr-pull-secret` in the cluster is unchanged since 2026-06-11 and
  still pulling fine.
- No remaining action items from this TODO.


See [[project_graphdb_wedge_incident]], [[project_k8s_deployment]].

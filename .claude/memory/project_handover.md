---
name: project-handover
description: "Repo handover prep — new docs added 2026-08-20 (ONBOARDING.md, RUNBOOK.md), stale docs fixed, one outstanding manual action item (Key Vault access grant)."
metadata: 
  node_type: memory
  type: project
  originSessionId: be479585-b7bd-4897-b162-bc3bc199e366
  modified: 2026-08-20T07:53:52.376Z
---

## Status (as of 2026-08-20)

Preparing the `k8s` branch repo for handover to a successor who is **not**
assumed to know Kubernetes, Azure, or Terraform. Work done in this session:

- Added `docs/ONBOARDING.md` — access checklist, tool list, glossary of K8s/Azure/Flux terms written for a beginner, suggested reading order.
- Added `docs/RUNBOOK.md` — step-by-step procedures for: OpenSILEX down, Flux not syncing, cert/HTTPS broken, admin password out of sync, ESO secret sync stuck, restoring MongoDB/GraphDB from backup, restoring a PVC from an Azure disk snapshot, intentional PVC deletion, tearing down a test environment.
- Fixed stale claims in `README.md` and `DEPLOYMENT.md`: both previously said production still ran on the old Docker VMs (`docker-compose-official` branch) — wrong since 2026-06-11, this `k8s` branch has been production the whole time. Also replaced the "Before Promoting to Production" checklist (all items either done or contradicted by "already in prod") with a "Known Gaps" section listing real follow-up hardening items.
- `tools/patches/README.md` only documented 3 of 8 patches (missing 004 default-Feide-login, 005 self-registration, 006 invite-system, 007 group/user-profile-cleanup) — filled in all four, including the apply-order note (Dockerfile globs `*.patch` alphabetically, 002→008; patch 002 calls a service class that patch 006 defines, which is fine at build time but worth knowing).
- `README.md`/`DEPLOYMENT.md` previously didn't mention the portal GraphDB-init job, `kube-prometheus-stack` monitoring, or the three-layer backup/DR system at all — all three shipped between 2026-06-16 and 2026-08-19 and were undocumented. Added a Monitoring section, a Backups & Disaster Recovery section (with the actual restore commands, not just "backups exist"), and a Portal section to `DEPLOYMENT.md`.

## Outstanding action item — needs the departing maintainer, not just docs

`terraform/keyvault.tf` (`admin_kv_officer` role assignment) currently grants
permanent Key Vault Secrets Officer to **one** Azure AD object ID only —
`siv017-cloud@uit.no` (imported into TF state 2026-06-30, see
[[project-k8s-deployment]]). A successor needs their *own* object ID added
there (edit + `terraform apply`) before they can read/rotate secrets — this is
a real access grant, not something fixable by writing documentation. Flagged
in `docs/ONBOARDING.md` but not resolved as of this session.

## Related
[[project-k8s-deployment]] [[project-test-environment]] [[feedback-opensilex-patch-patterns]]

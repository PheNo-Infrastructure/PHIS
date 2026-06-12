---
name: project-active-vms
description: "Old Docker VMs — all decommissioned/empty, pending RG deletion"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ae002f9-23e1-439e-b698-cd78bf928e71
---

The 3 Docker VMs (prod/test/sandbox) have been superseded by the AKS k8s deployment as of 2026-06-11. All VMs were empty (no real data). Production is now on AKS at phis.pheno.no.

**RGs pending deletion** (confirm data is irrelevant before deleting):
- `PHIS-SANDBOX` (norwayeast)
- `PHIS-TEST-DOCKER` (norwayeast)
- `RG-OPENSILEX-DEBIAN12-TEST` (norwayeast)
- `PHIS-IP` (westeurope, empty — IP moved to MC_ group)

**Why:** Migration was possible because all VMs were empty (GraphDB running but no research data). Docker-compose-official branch remains in git for reference but is no longer the active deployment.

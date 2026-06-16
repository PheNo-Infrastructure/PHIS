# PHIS Project Memory — k8s branch

## Feedback (behavioral rules)
- [Data persistence priority](feedback_data_persistence.md) — Research data is irreplaceable; never delete PVCs/pods without explicit confirmation, always read-only diagnose first
- [Direct az/kubectl/terraform access](feedback_az_access.md) — Run Azure CLI, kubectl, terraform, flux directly; don't just instruct the user
- [Destructive action confirmation](feedback_destructive_actions.md) — Never delete VMs/RGs based on "proceed" alone; require explicit confirmation
- [AKS K8s version selection](feedback_aks_k8s_version.md) — Use K8s 1.33; 1.30-1.32 LTS-only (Premium required), 1.34+ invisible to azurerm 4.76

## Project state
- [k8s deployment (PRODUCTION)](project_k8s_deployment.md) — West Europe cluster, HTTPS on phis.pheno.no, Flux GitOps, ESO secrets, all pods running
- [Azure infrastructure](project_azure_infra.md) — Terraform state blob backend, azurerm 4.x, IP/region constraints, LTS K8s restriction, Git Bash MSYS_NO_PATHCONV
- [k8s architecture & design](project_k8s_architecture.md) — MongoDB StatefulSet, GraphDB nginx sidecar, initContainers, config injection, resource limits
- [Build process](project_build_process.md) — workflow_dispatch, patch versioning (1.5.0.N), Maven ~15-20 min, full release loop
- [Image tag versioning](project_versioning.md) — 1.5.0.N = new patch, 1.5.0.N.M = fix iteration on same patch
- [k8s patterns & feedback](feedback_k8s_patterns.md) — imagePullPolicy Always, ttlSecondsAfterFinished, configMapGenerator, curl Host header
- [OpenSILEX patch patterns](feedback_opensilex_patch_patterns.md) — @ApiModel on DTOs, no @Required, enable=true on create, getUser() unreliable, GHA cache invalidation
- [Old Docker VMs](project_active_vms.md) — All empty, pending RG deletion (PHIS-SANDBOX, PHIS-TEST-DOCKER, RG-OPENSILEX-DEBIAN12-TEST, PHIS-IP)

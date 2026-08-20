# PHIS Project Memory — k8s branch

## Feedback (behavioral rules)
- [Direct az/kubectl/terraform access](feedback_az_access.md) — Run Azure CLI, kubectl, terraform, flux directly; don't just instruct the user
- [Destructive action confirmation](feedback_destructive_actions.md) — Never delete VMs/RGs based on "proceed" alone; require explicit confirmation
- [AKS K8s version selection](feedback_aks_k8s_version.md) — Use K8s 1.33; 1.30-1.32 LTS-only (Premium required), 1.34+ invisible to azurerm 4.76
- [PowerShell for manual commands](feedback_powershell_commands.md) — User's terminal is PowerShell; bash syntax (`$(...)`, `VAR=cmd`, `\` continuation) fails

## Project state
- [k8s deployment (PRODUCTION)](project_k8s_deployment.md) — West Europe cluster, HTTPS on phis.pheno.no, Flux GitOps, ESO secrets, PVs on Retain, disk snapshots, ~$150/mo
- [opensilex-init job](project_opensilex_init.md) — Creates Default profile (no credentials!) + Users group; Feide users auto-assigned on login; credentials must be set manually after deploy
- [Azure infrastructure](project_azure_infra.md) — Terraform state blob backend, subscription_id var required, Scoop terraform path, MongoDB Compass directConnection, MSYS_NO_PATHCONV
- [k8s architecture & design](project_k8s_architecture.md) — MongoDB StatefulSet, GraphDB nginx sidecar, initContainers, config injection, resource limits
- [k8s patterns & feedback](feedback_k8s_patterns.md) — imagePullPolicy Always, ttlSecondsAfterFinished, configMapGenerator, registry.k8s.io/kubectl (not bitnami), commit patches before build
- [Old Docker VMs](project_active_vms.md) — All empty, pending RG deletion (PHIS-SANDBOX, PHIS-TEST-DOCKER, RG-OPENSILEX-DEBIAN12-TEST, PHIS-IP)
- [Handover prep](project_handover.md) — docs/ONBOARDING.md + RUNBOOK.md added 2026-08-20; stale prod/checklist claims fixed; KV access grant still needs manual terraform edit for successor

## Related repos
- **PhisWebPortal**: `C:\Users\siv017\Documents\GitHub\prompt-improver\PhisWebPortal` — Streamlit (Python 3.11) front-end for PHIS. 9 pages (Projects→Observations), all functional. Connects to OpenSILEX REST API at `https://phis.pheno.no`. Auth: per-user or service account via `PHIS_HOST`/`PHIS_USER`/`PHIS_PASS` env vars. Deploys via GitHub Actions → Azure Container Apps.

# PHIS Project Memory — k8s branch

## Feedback (behavioral rules)
- [No local Python for package inspection](feedback_python_not_available.md) — No local Python has portal deps; use `_test_dto_signatures.py` or GitHub source instead
- [Direct az/kubectl/terraform access](feedback_az_access.md) — Run Azure CLI, kubectl, terraform, flux directly; don't just instruct the user
- [Destructive action confirmation](feedback_destructive_actions.md) — Never delete VMs/RGs based on "proceed" alone; require explicit confirmation
- [AKS K8s version selection](feedback_aks_k8s_version.md) — Use K8s 1.33; 1.30-1.32 LTS-only (Premium required), 1.34+ invisible to azurerm 4.76
- [PowerShell for manual commands](feedback_powershell_commands.md) — User's terminal is PowerShell; bash syntax (`$(...)`, `VAR=cmd`, `\` continuation) fails
- [No prod deletes without cascade check](feedback_no_prod_deletes.md) — Never call DELETE/PUT removing data on prod PHIS without mapping links + explicit confirm; OpenSILEX cascades are wide and opaque

## Project state
- [k8s deployment (PRODUCTION)](project_k8s_deployment.md) — West Europe cluster, HTTPS on phis.pheno.no, Flux GitOps, ESO secrets, PVs on Retain, disk snapshots, ~$150/mo
- [opensilex-init job](project_opensilex_init.md) — Creates Default profile (no credentials!) + Users group; Feide users auto-assigned on login; credentials must be set manually after deploy
- [Azure infrastructure](project_azure_infra.md) — Terraform state blob backend, subscription_id var required, Scoop terraform path, MongoDB Compass directConnection, MSYS_NO_PATHCONV
- [k8s architecture & design](project_k8s_architecture.md) — MongoDB StatefulSet, GraphDB nginx sidecar, initContainers, config injection, resource limits
- [k8s patterns & feedback](feedback_k8s_patterns.md) — imagePullPolicy Always, ttlSecondsAfterFinished, configMapGenerator, registry.k8s.io/kubectl (not bitnami), commit patches before build
- [Old Docker VMs](project_active_vms.md) — All empty, pending RG deletion (PHIS-SANDBOX, PHIS-TEST-DOCKER, RG-OPENSILEX-DEBIAN12-TEST, PHIS-IP)
- [GraphDB wedge incident 2026-09-01](project_graphdb_wedge_incident.md) — Org delete hung a GraphDB txn, probes on non-SPARQL endpoint missed it; hardening merged to k8s. External uptime alerting (blackbox-exporter + Alertmanager email) added 2026-09-16.
- [Repo org migration TODO](project_repo_org_migration_todo.md) — RESOLVED 2026-09-16, no action items remain (deploy key rotated, CI green, GHCR on org namespace)
- [OpenSILEX org/group bugs](project_opensilex_org_group_bugs.md) — BUG1-3 fixed in 1.5.4.3. BUG4 (group-edit dropdown dup profiles) FIXED 2026-09-16 in image 1.5.4.6, patch 012 — root cause was profile URI format mismatch (expanded IRI vs prefixed) between GroupDAO.search() and getAllProfiles(), not orphan data. Admin password now KV-driven via CronJob (see project_k8s_deployment.md), no longer manual.
- [OpenSILEX upgrade task](project_opensilex_upgrade_task.md) — prod on image 1.5.4.6 (patches 002-012). BUG1-4 all fixed and deployed. Filing 009/010/011 upstream declined by user (not worth it).
- [opensilex-upgrade skill](../../.claude/skills/opensilex-upgrade/SKILL.md) — 10-phase runbook for OpenSILEX version bumps (in repo, commit 0a1f157)
- [Azure subscription for PHIS](project_azure_subscription.md) — Lives in "Lab - Sebastian Iversen (FOF)" sub, NOT p-phsprd despite the name; migration to p-phsprd is a TODO, not urgent

## Related repos
- **PhisWebPortal**: `C:\Users\siv017\Documents\GitHub\prompt-improver\PhisWebPortal` — Streamlit (Python 3.11) front-end for PHIS. 9 pages (Projects→Observations), all functional. Connects to OpenSILEX REST API at `https://phis.pheno.no`. Auth: per-user or service account via `PHIS_HOST`/`PHIS_USER`/`PHIS_PASS` env vars. Deploys via GitHub Actions → Azure Container Apps.

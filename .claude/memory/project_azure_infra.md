---
name: project-azure-infra
description: "Azure infrastructure details — Terraform state, provider version, AKS quirks, and IP/region constraints"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ae002f9-23e1-439e-b698-cd78bf928e71
---

## Terraform

- **State backend**: Azure Blob — `phistfstate` / `tfstate` / `phis.tfstate` in `phis-rg` (westeurope)
- **Provider**: `azurerm ~> 4.0` (4.76.0). Was 3.110 — upgraded because 3.x couldn't read AKS 1.33+ clusters via its older ARM API version.
- **K8s version pinned to `1.33`** in `variables.tf`. See [[feedback-aks-k8s-version]] for why.
- `purge_soft_delete_on_destroy = true` on Key Vault — allows same name reuse after destroy.

## Resource Groups

| RG | Region | Contents |
|---|---|---|
| `phis-rg` | westeurope | AKS cluster, Key Vault, Storage Account, Managed Identity |
| `MC_phis-rg_phis-cluster_westeurope` | westeurope | AKS node infra, static IP `172.211.86.191` |
| `PHIS-IP` | westeurope | **EMPTY — IP moved to MC_ group. Safe to delete.** |
| `PHIS-SANDBOX` | norwayeast | Old Docker VM — pending deletion |
| `PHIS-TEST-DOCKER` | norwayeast | Old Docker VM — pending deletion |
| `RG-OPENSILEX-DEBIAN12-TEST` | norwayeast | Old Docker VM — pending deletion |
| `phis-portal-rg` | westeurope | Unknown/separate — do not touch |

## AKS ARM API version issue

azurerm 4.76 uses AKS API `2024-09-01`. Kubernetes 1.34+ clusters are **not visible** to this API version (created with a newer ARM schema). Attempting to import or manage a 1.34 cluster fails with "Cannot import non-existent remote object" even though the cluster exists.

**Fix**: Use K8s ≤ 1.33, which azurerm 4.76 can read via its API version.

## Azure public IP cross-region restriction

A public IP in West Europe **cannot** be attached to a Load Balancer in Norway East. Azure requires the IP and LB to be in the same region. This was the root cause of the cluster rebuild from norwayeast → westeurope.

## Azure cloud-provider-azure casing

`cloud-provider-azure` uppercases resource names when constructing ARM references internally. The `azure-pip-name` and `azure-pip-resource-group` annotations on the ingress-nginx Service are case-sensitive — use the exact casing as returned by `az network public-ip show`.

## Terraform — subscription_id variable required

Every `terraform plan/apply/import` in this repo requires `-var="subscription_id=64d45747-e6a6-4ba0-b46c-3247997c6f92"`. There is no `terraform.tfvars` file (it is gitignored to avoid committing the subscription ID). Forgetting this causes an interactive prompt that blocks `--auto-approve`.

`terraform` is installed via Scoop (`C:\Users\siv017\scoop\shims\terraform.exe`). In Git Bash, use the full path. In PowerShell, the shims directory is already in the user PATH registry — open a new terminal if `terraform` isn't found.

## MongoDB Compass external access

To connect MongoDB Compass to the cluster, port-forward and add `directConnection=true` to the connection string:

```
kubectl port-forward -n phis svc/mongodb 27017:27017
# Connection string:
mongodb://root:<password>@localhost:27017/?authSource=admin&directConnection=true
```

`directConnection=true` is required because without it, Compass uses the replica set discovery protocol, which returns internal K8s DNS names (`mongodb-0.mongodb.phis.svc.cluster.local`) that are unreachable from outside the cluster.

## Git Bash path mangling

When passing ARM resource IDs (starting with `/subscriptions/`) to Bash commands in Git Bash, prefix with `MSYS_NO_PATHCONV=1` or Git Bash converts the path to `C:/Program Files/Git/subscriptions/...`.

Example: `MSYS_NO_PATHCONV=1 terraform import azurerm_kubernetes_cluster.phis "/subscriptions/..."`

## Kubernetes LTS version restriction

As of June 2026 in West Europe, K8s **1.30, 1.31, 1.32 are LTS-only** — creating a cluster on these versions fails with `K8sVersionNotSupported` unless the cluster is on Premium tier with LTS support plan. Use **1.33 or 1.35** for Standard tier.

## Key identifiers

- Subscription: `64d45747-e6a6-4ba0-b46c-3247997c6f92`
- Tenant: `4e7f212d-74db-4563-a57b-8ae44ed05526`
- ESO identity client ID: `ab1e2d77-5bc1-4052-83cc-460735248fb0`
- Key Vault URI: `https://phis-kv.vault.azure.net/`
- OIDC issuer URL: `https://westeurope.oic.prod-aks.azure.com/4e7f212d-74db-4563-a57b-8ae44ed05526/6c88a240-5319-425d-a19c-2ce62680efd1/`

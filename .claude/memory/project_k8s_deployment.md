---
name: project-k8s-deployment
description: "AKS k8s deployment — PRODUCTION as of 2026-06-11. West Europe cluster, HTTPS on phis.pheno.no, Flux GitOps, ESO + Key Vault secrets."
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ae002f9-23e1-439e-b698-cd78bf928e71
---

## Status

**k8s branch IS production** as of 2026-06-11. Docker VMs are pending deletion (all were empty/unused). The cluster replaced the 3 Docker VMs.

## AKS Cluster

- **Cluster**: `phis-cluster`, resource group `phis-rg`, region **westeurope**
- **Kubernetes**: 1.33 (pinned — see note on LTS versions below)
- **Node**: 1× `Standard_D4s_v3` (4 vCPU, 16 GB RAM), Free tier
- **Managed infra RG**: `MC_phis-rg_phis-cluster_westeurope`
- **Namespace**: `phis`

## Access

- **OpenSILEX**: `https://phis.pheno.no/` (ingress-nginx, ports 80+443, TLS via cert-manager)
- **Admin port 8667**: `kubectl port-forward -n phis svc/opensilex-admin 8667:8667`
- **GraphDB/MongoDB**: ClusterIP only
- **kubectl**: `az aks get-credentials -g phis-rg -n phis-cluster --overwrite-existing`

## DNS & IP

- **Static IP**: `172.211.86.191` (named `phis-debian12-TEST-ip`, parked in `MC_phis-rg_phis-cluster_westeurope`)
- **DNS**: `phis.pheno.no` → 172.211.86.191. DNS is managed by an **external organization** — user cannot update it. IP must never change.
- **Why West Europe**: The static IP is in West Europe. Azure requires LB and IP to be in the same region.

## Flux GitOps

- Watches **`k8s` branch** of `https://github.com/lversen/PHIS`
- Kustomizations: `flux-system`, `cert-manager-stack`, `cert-manager-config`, `external-secrets-stack`, `external-secrets-config`, `ingress-nginx-stack`, `phis-stack`
- Push to `k8s` branch → cluster reconciles in ~1 min
- **`phis-tf-outputs` ConfigMap** (in `flux-system` ns) must be created manually after cluster rebuild — Flux substitutes `${KEY_VAULT_URI}` and `${ESO_IDENTITY_CLIENT_ID}` from it

## Secrets — External Secrets Operator (ESO) + Azure Key Vault

Secrets live in Azure Key Vault `phis-kv` (West Europe). ESO pulls them into the cluster via workload identity. **No SealedSecrets** — those were replaced by ESO.

| Secret name in KV | K8s secret key | Used by |
|---|---|---|
| `mongodb-root-password` | `root-password` | MongoDB auth |
| `mongodb-opensilex-password` | `opensilex-password` | OpenSILEX→MongoDB |
| `mongodb-keyfile` | `keyfile` | MongoDB replica set auth |
| `graphdb-admin-password` | `admin-password` | GraphDB |
| `feide-client-id` | `client-id` | Feide OIDC |
| `feide-client-secret` | `client-secret` | Feide OIDC |
| `ghcr-pull-secret-json` | (full JSON) | ghcr.io image pull |

To force ESO re-sync: `kubectl annotate externalsecret -n phis --all force-sync=$(date +%s) --overwrite`

## Terraform

- State on Azure Blob: `phistfstate` storage account, container `tfstate`, key `phis.tfstate`
- Provider: `azurerm ~> 4.0` (4.76.0 installed)
- K8s version pinned to **1.33** in `variables.tf` — see [[feedback-aks-k8s-version]]
- Backend block is active in `terraform/main.tf` (not commented out)

## Storage

| PVC | Size | StorageClass | Backend |
|-----|------|---|---|
| `graphdb-data` | 50Gi | managed-csi | Azure Managed Disk |
| `mongodb-data-mongodb-0` | 10Gi | managed-csi | Azure Managed Disk |
| `mongodb-config-mongodb-0` | 1Gi | managed-csi | Azure Managed Disk |
| `opensilex-data` | 10Gi | azureblob-fuse2-phis | Azure Blob |
| `mongodb-backup-pvc` | 100Gi | azureblob-fuse2-backup | Azure Blob |
| `graphdb-backup-pvc` | 100Gi | azureblob-fuse2-backup | Azure Blob |

## Current image

`ghcr.io/lversen/opensilex-phis:1.5.0.5.3` — patches: Feide auto-group assignment, password-reset fix, SSO login buttons UX, self-service registration (patch 005).
Deployed 2026-06-16. Patch 005 (self-registration) adds `/app/register` + `/app/confirm-registration/:token`, creates accounts with `enable=true`, auto-assigns to "Users" group.

## Pending

- Delete old VM resource groups: `PHIS-SANDBOX`, `PHIS-TEST-DOCKER`, `RG-OPENSILEX-DEBIAN12-TEST`
- Delete `PHIS-IP` resource group (IP already moved to MC_ group)
- Rename git default branch from `docker-compose-official` to `k8s`

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

| Secret name in KV | K8s secret name | K8s secret key | Used by |
|---|---|---|---|
| `mongodb-root-password` | `mongodb-credentials` | `root-password` | MongoDB auth |
| `mongodb-opensilex-password` | `mongodb-credentials` | `opensilex-password` | OpenSILEX→MongoDB |
| `mongodb-keyfile` | `mongodb-credentials` | `keyfile` | MongoDB replica set auth |
| `graphdb-admin-password` | `graphdb-credentials` | `admin-password` | GraphDB |
| `feide-client-id` | `feide-credentials` | `client-id` | Feide OIDC |
| `feide-client-secret` | `feide-credentials` | `client-secret` | Feide OIDC |
| `opensilex-admin-password` | `opensilex-credentials` | `admin-password` | OpenSILEX startup + init job |
| `smtp-username` | `opensilex-credentials` | `smtp-username` | OpenSILEX email service |
| `smtp-password` | `opensilex-credentials` | `smtp-password` | OpenSILEX email service |
| `ghcr-pull-secret-json` | `ghcr-pull-secret` | (full JSON) | ghcr.io image pull |

To force ESO re-sync: `kubectl annotate externalsecret -n phis --all force-sync=$(date +%s) --overwrite`

## Terraform

- State on Azure Blob: `phistfstate` storage account, container `tfstate`, key `phis.tfstate`
- Provider: `azurerm ~> 4.0` (4.76.0 installed)
- K8s version pinned to **1.33** in `variables.tf` — see [[feedback-aks-k8s-version]]
- Backend block is active in `terraform/main.tf` (not commented out)
- `terraform/secrets.tf` creates all Key Vault secrets with `REPLACE_ME` placeholder + `lifecycle { ignore_changes = [value] }`. The lifecycle guard is critical — without it, any `terraform apply` silently resets live secrets back to `REPLACE_ME`. 04-bootstrap.ps1 sets real values after first apply.

## AKS Node Upgrades

- **Automatic node image upgrade is active** with no maintenance window configured. AKS drains and reboots the node on its own schedule (observed ~midnight UTC). Any pod with volume-mounted secrets that changed since startup will pick up the new secret values on restart — this is what triggered the 2026-06-23 outage (REPLACE_ME keyfile went live only after MongoDB was evicted).

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

`ghcr.io/lversen/opensilex-phis:1.5.0.6.10` — active patches:
- `002-openid-auto-group-assignment` (SecurityAutoAssignmentService — auto-adds Feide/SAML logins to Users group)
- `006-invite-system` (email invite flow — invited users go to Researchers group)
- `007-fix-group-user-profile-cleanup` (fixes orphaned GUP RDF nodes on group update and account delete — resolves "URI is linked with other resources" error)

Built from upstream OpenSILEX `1.5.0` tag. Patch numbering (`006`, `007`, etc.) is PHIS-custom, not upstream. Build via GitHub Actions `workflow_dispatch` — all `.patch` files in `tools/patches/` must be **committed and pushed** before triggering the workflow (GitHub Actions checks out from GitHub, not local disk).

## Key Vault access

`admin_kv_officer` role assignment now in Terraform state (imported 2026-06-30). `siv017-cloud@uit.no` has permanent `Key Vault Secrets Officer` on `phis-kv` — no longer dependent on whoever last ran terraform.

## OpenSILEX Admin Password

Admin password managed via ESO secret `opensilex-credentials` (Key Vault: `opensilex-admin-password`). Both the deployment startup script and the `opensilex-init` Job now read `OPENSILEX_ADMIN_PASSWORD` from the secret. Init job exits non-zero on auth failure (was silently skipping group creation before). To rotate: update Key Vault secret → force ESO sync → change password in UI → restart deployment.

## Email / SMTP (as of 2026-06-11)

Password-reset emails work via **Azure Communication Services Email** (free tier, 100 emails/day).

- **ACS resources**: `phis-email` (Email Service), `phis-acs` (Communication Service), domain `321e53e1-dadf-4465-b273-7e986540596c.azurecomm.net` (managed, all DNS auto-verified)
- **SMTP**: `smtp.azurecomm.net:587`, STARTTLS, username `phis-smtp-user`, password = Entra app secret
- **Entra SP**: `phis-smtp` (app ID `82612100-bbfd-44ec-8efa-c4429c7e548d`), role `Communication and Email Service Owner` on `phis-acs`
- **OpenSILEX config key**: `security.email.config` in `opensilex.yml`; `sender` = `DoNotReply@321e53e1-dadf-4465-b273-7e986540596c.azurecomm.net`
- **Verification**: `POST /rest/security/forgot-password?identifier=<email>` returns 403 for admin (correct — admin excluded by design), 200+email for regular users
- **Custom sender domain** (`noreply@phis.pheno.no`) can be added later via ACS domain verification

## opensilex-init Job — Known Quirks

Two bugs fixed 2026-06-11:
1. **Host header**: All internal `curl` calls must include `-H "Host: phis.pheno.no"` — OpenSILEX validates Host against its configured `publicURI`. Without it, auth returns 400.
2. **sed token extraction**: OpenSILEX returns `"token" : "..."` (spaces around colon). The pattern must be `'s/.*"token" *: *"\([^"]*\)".*/\1/p'`, not `"token":"..."`.
3. **Group creation warning**: On re-runs the Users group already exists, so the create returns 409 → curl -sf exits non-zero → RESPONSE is empty → warning fires. Benign; job exits 0.

## Pending

- Confirm old VM RG deletion completed: `PHIS-SANDBOX`, `PHIS-TEST-DOCKER`, `RG-OPENSILEX-DEBIAN12-TEST`, `PHIS-IP` (async delete queued 2026-06-11)
- `phis-portal-rg` resource group exists — not yet investigated
- `Standard_B4ms` node switch not yet implemented (~$45/month saving)

## Data Persistence (as of 2026-06-11)

All three data PVs were **live-patched** to `reclaimPolicy: Retain` via `kubectl patch pv` — disks now survive accidental PVC deletion. Cannot be done via Flux (StatefulSet volumeClaimTemplates and PVC spec are immutable after creation).

StorageClass `managed-csi-retain` added to `k8s/storage-classes.yaml` for fresh cluster rebuilds. StatefulSet/PVC yamls still reference `managed-csi` (immutable in-place) — on a fresh rebuild, update those to `managed-csi-retain`.

**Disk snapshots**: CronJob `disk-snapshot` runs daily at **01:00 UTC**, retains 7 snapshots per PVC, uses `VolumeSnapshotClass` `csi-disk-snapshots` (driver: `disk.csi.azure.com`). RBAC: `snapshot-manager` ServiceAccount in `phis` namespace.

## Monthly Cost Baseline (~$150/month)

| Item | Monthly |
|---|---|
| VM `Standard_D4s_v3` | ~$140 |
| GraphDB disk (50Gi → 64Gi E6) | ~$5.12 |
| MongoDB data disk (10Gi → 16Gi E3) | ~$1.28 |
| MongoDB config disk (1Gi → 4Gi E1) | ~$0.32 |
| Static IP | ~$3 |
| Blob storage + snapshots | ~$0 (grows with data) |

**Stopping the cluster** (deallocates VM, keeps disks/IP): floor ~$10/month.
**Switching to `Standard_B4ms`**: running cost ~$95/month (not yet implemented).

## Backups (as of 2026-06-11)

- **MongoDB**: CronJob `mongodb-backup` runs daily 02:00 UTC → Azure Blob (`mongodb-backup-pvc`). Uses root credentials + `directConnection=true`. Fixed 2026-06-11 (was using `opensilex` user + replicaSet URI — both wrong).
- **GraphDB**: CronJob `graphdb-backup` runs daily 03:00 UTC → Azure Blob (`graphdb-backup-pvc`). Working.
- **Root cause of original failure**: MongoDB PVC had `.auth_initialized` marker from a previous cluster run. When rebuilt, init was skipped. Azure Key Vault had 2 secret versions (v1: 14:14 UTC, v2: 14:45 UTC). MongoDB had v1 passwords; ESO served v2. Fix: deleted `mongodb-data-mongodb-0` and `mongodb-config-mongodb-0` PVCs → fresh init with v2 credentials.
- **Warning**: If cluster is rebuilt and PVC data persists, this mismatch will recur. Solution: always delete MongoDB PVCs on cluster rebuild, OR ensure Key Vault secret versions match PVC-stored passwords.

## Git
- Default branch is **`k8s`** (changed 2026-06-11, was `docker-compose-official`)

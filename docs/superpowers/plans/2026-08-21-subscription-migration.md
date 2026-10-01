# PHIS Subscription Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PHIS production stack from subscription `Lab - Sebastian Iversen (FOF)` (`64d45747-e6a6-4ba0-b46c-3247997c6f92`) to `p-phsprd` (`11b62ac0-bb4d-47bb-8e5f-1f59ab674130`), fully IaC-driven, with zero data loss and a reversible cutover.

**Architecture:** AKS clusters cannot be moved between subscriptions (`Microsoft.ContainerService/managedClusters` has no `CrossSubscriptionResourceMove` capability), so a **new cluster is built fresh via Terraform** in the target subscription while the old one keeps serving traffic. Storage accounts, managed disks, Key Vault, and ACR **do** support `CrossSubscriptionResourceMove` (verified via `az provider show`) — these are moved as native ARM operations (metadata-only, no data copy, no re-upload risk) rather than snapshotted and restored. Only managed identities and Communication Services must be recreated, since neither resource type supports cross-subscription move. The only step with real user-facing downtime is Phase 4 (disk detach → move → reattach), which is short, rehearsed against a rollback snapshot, and gated on validation before DNS is touched.

**Tech Stack:** Terraform (`azurerm` ~>4.0, `azuread` ~>2.53), Azure CLI, Flux GitOps, kubectl.

**Spec:** N/A — no prior spec doc. Requirements were gathered live against the actual subscriptions via `az cli` in this conversation; the inventory below is the spec.

## Global Constraints

- Never delete a PVC, disk, or the OpenSILEX `.installed` marker without naming the resource and getting explicit confirmation (project CLAUDE.md).
- Never run `kubectl delete pod` on MongoDB/GraphDB/OpenSILEX — use `kubectl rollout restart` / scale, never a bare delete.
- All `az`/`kubectl`/`terraform` commands in this plan are to be **run by the user**, not executed autonomously by Claude, per project working style — Claude prepares commands and explains them, user runs and pastes back output.
- The old subscription's resources (`phis-rg`) are not deleted at any point in this plan — decommissioning is an explicit out-of-scope follow-up after a soak period.
- Existing `prevent_destroy` lifecycle blocks (resource group, storage account, containers, AKS cluster) and the `CanNotDelete` management locks in `locks.tf` stay in place throughout; do not remove them to work around a blocked operation — investigate why the operation is blocked instead.
- Target subscription: `p-phsprd` (`11b62ac0-bb4d-47bb-8e5f-1f59ab674130`), same AAD tenant (`4e7f212d-74db-4563-a57b-8ae44ed05526`) as source — required for `az resource move`.
- Source inventory (verified `2026-08-21`): AKS `phis-cluster` (v1.33, 1× `Standard_D4s_v3`), Key Vault `phis-kv` (13 secrets), storage account `phistfstate` (tfstate + OpenSILEX blobfuse2 file storage + mongodb/graphdb backup containers), ACR `phisacr` (1 repo: `phis-portal`), 7 PVC disks in `MC_phis-rg_phis-cluster_westeurope`, identities `phis-eso-identity` / `phis-gha-identity` (federated OIDC, not movable), `phis-email` + `phis-acs` (Communication Services, manually created, not in Terraform, not movable).

---

### Task 1: Bring Communication Services into Terraform

**Files:**
- Create: `terraform/communication.tf`
- Modify: `terraform/outputs.tf` (append 2 outputs)

**Interfaces:**
- Produces: `azurerm_communication_service.phis` (resource "phis-acs"), `azurerm_email_communication_service.phis` (resource "phis-email"), plus their domain/sender-username linkage — later tasks reference `azurerm_communication_service.phis.id` when recreating this service fresh in the target subscription.

Today `phis-email` and `phis-acs` exist only because someone ran `az` commands by hand on 2026-06-11. Since neither resource type supports cross-subscription move, they have to be recreated in `p-phsprd` regardless — recreate them *from Terraform* so the handover doesn't repeat the manual-click problem, and so Task 6 can `terraform apply` them straight into the new subscription.

- [ ] **Step 1: Inspect the live resources to capture exact config**

Run:
```
az communication show -n phis-acs -g phis-rg -o json
az resource show -g phis-rg -n phis-email --resource-type Microsoft.Communication/emailServices -o json
az resource show -g phis-rg -n phis-email/AzureManagedDomain --resource-type Microsoft.Communication/emailServices/domains -o json
```
Record: `dataLocation` (`europe`), the managed domain's `mailFromSenderDomain` / `fromSenderDomain`, and whether `phis-acs` has a linked domain (`az communication list-linked-domain -n phis-acs -g phis-rg`).

- [ ] **Step 2: Write `terraform/communication.tf`**

```hcl
resource "azurerm_email_communication_service" "phis" {
  name                = "phis-email"
  resource_group_name = azurerm_resource_group.phis.name
  data_location        = "Europe"
}

resource "azurerm_email_communication_service_domain" "phis" {
  name              = "AzureManagedDomain"
  email_service_id  = azurerm_email_communication_service.phis.id
  domain_management = "AzureManaged"
}

resource "azurerm_communication_service" "phis" {
  name                = "phis-acs"
  resource_group_name = azurerm_resource_group.phis.name
  data_location       = "Europe"
}

resource "azurerm_communication_service_email_domain_association" "phis" {
  communication_service_id = azurerm_communication_service.phis.id
  email_service_domain_id  = azurerm_email_communication_service_domain.phis.id
}
```

Adjust `data_location` / `domain_management` if Step 1's output showed different values.

- [ ] **Step 3: Import the existing resources into state (no infra change)**

```
cd terraform
terraform import azurerm_email_communication_service.phis /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/phis-rg/providers/Microsoft.Communication/emailServices/phis-email
terraform import azurerm_email_communication_service_domain.phis /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/phis-rg/providers/Microsoft.Communication/emailServices/phis-email/domains/AzureManagedDomain
terraform import azurerm_communication_service.phis /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/phis-rg/providers/Microsoft.Communication/communicationServices/phis-acs
```

- [ ] **Step 4: Verify zero-diff plan**

Run: `terraform plan`
Expected: `No changes.` (or only cosmetic diffs — fix the `.tf` file to match reality until this is clean). This is the "test" for this task: if `terraform plan` wants to change or recreate the resource, the `.tf` doesn't match what's actually deployed, and applying it against prod would be destructive.

- [ ] **Step 5: Add outputs**

Append to `terraform/outputs.tf`:
```hcl
output "acs_connection_string_hint" {
  value       = "Fetch manually: az communication list-key -n ${azurerm_communication_service.phis.name} -g ${var.resource_group_name}"
  description = "ACS keys are sensitive and not exposed as a resource attribute in state"
}
```

- [ ] **Step 6: Commit**

```
git add terraform/communication.tf terraform/outputs.tf
git commit -m "chore(terraform): codify Communication Services (email + ACS) that were created manually"
```

---

### Task 2: Register Microsoft.Communication in the target subscription

**Files:** none (Azure control-plane state only)

- [ ] **Step 1: Register the provider**

```
az provider register -n Microsoft.Communication --subscription 11b62ac0-bb4d-47bb-8e5f-1f59ab674130
```

- [ ] **Step 2: Verify**

```
az provider show -n Microsoft.Communication --subscription 11b62ac0-bb4d-47bb-8e5f-1f59ab674130 --query registrationState -o tsv
```
Expected: `Registered` (registration is async — poll every 30s if it still says `Registering`).

---

### Task 3: Stand up a second Terraform state for the target subscription

**Files:**
- Create: `terraform/prod-new/main.tf`, `terraform/prod-new/variables.tf`, `terraform/prod-new/terraform.tfvars`

**Interfaces:**
- Consumes: same `.tf` resource definitions as the root `terraform/` module (aks.tf, identity.tf, keyvault.tf, secrets.tf, resource-group.tf, communication.tf from Task 1) — copy them rather than symlink, since Windows symlinks need elevated perms and this is a temporary migration scaffold, deleted in Task 9 once the old module is retired.
- Produces: a second, fully independent Terraform state (own blob key), so `terraform apply` here can never touch the existing prod state or accidentally destroy the old cluster.

Running the existing module a second time with just a different `subscription_id` in the same state would make Terraform think the old resources need to be destroyed (they're not in the new plan's desired set once you point at a different subscription's empty RG). A **separate state**, in a **separate directory**, is what keeps this genuinely zero-risk to the old environment — there is no shared state file for a mistake to corrupt.

- [ ] **Step 1: Create the directory and copy resource definitions**

```
mkdir terraform/prod-new
cp terraform/aks.tf terraform/identity.tf terraform/keyvault.tf terraform/secrets.tf terraform/resource-group.tf terraform/communication.tf terraform/variables.tf terraform/outputs.tf terraform/locks.tf terraform/prod-new/
```

- [ ] **Step 2: Write `terraform/prod-new/main.tf`** (same provider config, different backend key)

```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
  }

  # Deliberately still points at the OLD storage account for state hosting —
  # it's just a blob container, doesn't matter which subscription hosts the
  # state file itself, and moving it in Task 8 carries the state along
  # automatically. A *different key* is what isolates this from prod state.
  backend "azurerm" {
    resource_group_name  = "phis-rg"
    storage_account_name = "phistfstate"
    container_name       = "tfstate"
    key                  = "phis-prod-new.tfstate"
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id

  features {
    key_vault {
      purge_soft_delete_on_destroy = false # target is prod — no soft-delete bypass
    }
  }
}

data "azurerm_client_config" "current" {}
```

- [ ] **Step 3: Write `terraform/prod-new/terraform.tfvars`** (gitignored, same as root module's convention)

```hcl
subscription_id = "11b62ac0-bb4d-47bb-8e5f-1f59ab674130"
key_vault_name  = "phis-kv" # same name is fine — different subscription, different namespace
```

- [ ] **Step 4: Confirm `.gitignore` covers the new tfvars**

Run: `git check-ignore terraform/prod-new/terraform.tfvars`
Expected: prints the path (i.e. it IS ignored). If empty, add `terraform/prod-new/terraform.tfvars` to `.gitignore` — this file will hold nothing secret in this case (just a subscription ID), but matching the existing convention avoids drift.

- [ ] **Step 5: Init and verify the new state is isolated**

```
cd terraform/prod-new
terraform init
terraform state list
```
Expected: `terraform state list` prints nothing (empty state) — confirms this is not accidentally sharing the prod state key.

- [ ] **Step 6: Commit**

```
git add terraform/prod-new/main.tf terraform/prod-new/*.tf .gitignore
git commit -m "chore(terraform): scaffold isolated state for prod subscription migration"
```

---

### Task 4: Deploy the new cluster (zero impact on old subscription)

**Files:** none new — applies `terraform/prod-new/` as built in Task 3.

**Interfaces:**
- Produces: new AKS cluster `phis-cluster` in `p-phsprd`/`phis-rg`, new Key Vault `phis-kv` (empty secrets — placeholders only), new `phis-eso-identity`/`phis-gha-identity` with federated credentials pointed at the *new* cluster's OIDC issuer and GitHub repo, new ACS/email. This step touches nothing in the old subscription — it's additive infrastructure in a subscription that currently has zero PHIS resources.

- [ ] **Step 1: Plan and review before applying**

```
cd terraform/prod-new
terraform plan -out=tfplan
```
Expected: plan shows only **creates** (no updates, no destroys) — this is the safety check for a "new subscription, new everything" apply. If it shows anything against a resource ID in the old subscription, stop and investigate before applying.

- [ ] **Step 2: Apply**

```
terraform apply tfplan
```

- [ ] **Step 3: Verify the new cluster exists and is healthy**

```
az aks show -g phis-rg -n phis-cluster --subscription 11b62ac0-bb4d-47bb-8e5f-1f59ab674130 --query "provisioningState" -o tsv
```
Expected: `Succeeded`

- [ ] **Step 4: Fetch kubeconfig for the new cluster into a separate context**

```
terraform output -raw kube_config > $HOME/.kube/phis-new-config
export KUBECONFIG=$HOME/.kube/phis-new-config
kubectl get nodes
```
Expected: 1 node, `Ready`. Keep `$HOME/.kube/config` (old cluster) untouched — use `KUBECONFIG=$HOME/.kube/phis-new-config` explicitly for every command against the new cluster from here on, so there's no risk of running something against the wrong cluster by habit.

---

### Task 5: Bootstrap Flux + external-secrets on the new cluster (placeholder secrets)

**Files:** none — reuses the existing `clusters/phis-cluster/` manifests already in the repo; no repo changes needed since GitOps config is cluster-agnostic (namespace/service-account names, not cluster identity).

- [ ] **Step 1: Follow the existing bootstrap script against the new cluster**

```
export KUBECONFIG=$HOME/.kube/phis-new-config
./04-bootstrap.ps1   # or the documented bootstrap steps in docs/RUNBOOK.md
```
(Placeholder secret values from `secrets.tf` are what's live in the new Key Vault at this point — workloads will come up but MongoDB/GraphDB/OpenSILEX will be running against **empty, fresh** placeholder-credential state. That's expected and fine — this task only proves the GitOps plumbing works end-to-end on the new cluster before real data enters the picture.)

- [ ] **Step 2: Verify ESO is pulling from the new Key Vault**

```
kubectl get externalsecret -A
```
Expected: all `SecretSynced` (against placeholder values, not yet real ones).

- [ ] **Step 3: Verify pods come up**

```
kubectl get pods -A
```
Expected: mongodb, graphdb, opensilex, portal pods `Running` (with fresh, empty data volumes — dynamically provisioned, not yet the real disks).

- [ ] **Step 4: Scale the new cluster's stateful workloads to 0**

```
kubectl scale statefulset mongodb graphdb --replicas=0
kubectl scale deployment opensilex --replicas=0
```
This clears the way for Task 7 to attach the *real* (moved) disks in place of these placeholder ones, without a running pod fighting over the mount.

---

### Task 6: Move Key Vault, storage account, and ACR (metadata-only, no data copy)

**Files:** none — pure Azure control-plane operation, followed by a `terraform import` to reconcile each state file with the new resource ID.

**Interfaces:**
- Consumes: `terraform/prod-new` state from Task 4 (the KV/storage/ACR resources it created must be destroyed first — see Step 1 — since the *moved* resources will replace them under the same names).

These three resource types support `CrossSubscriptionResourceMove` (confirmed via `az provider show`) — the move is an ARM metadata operation, not a copy. The bytes never move; only which subscription "owns" the resource ID changes. This is why it's the low-risk option compared to snapshot/restore.

- [ ] **Step 1: Remove the placeholder KV/storage/ACR created in Task 4**

The new subscription currently has an empty placeholder Key Vault (from Task 4) that would collide by name with the moved one. Destroy just those resources from the new state (not the whole apply):
```
cd terraform/prod-new
terraform destroy -target=azurerm_key_vault.phis -target=azurerm_key_vault_secret.graphdb_admin_password -target=azurerm_key_vault_secret.mongodb_root_password -target=azurerm_key_vault_secret.mongodb_opensilex_password -target=azurerm_key_vault_secret.mongodb_keyfile -target=azurerm_key_vault_secret.feide_client_id -target=azurerm_key_vault_secret.feide_client_secret -target=azurerm_key_vault_secret.ghcr_pull_secret
```
(No storage account or ACR was defined in `terraform/prod-new` — Task 3 only copied `aks.tf`/`identity.tf`/`keyvault.tf`/`secrets.tf`/`resource-group.tf`/`communication.tf`, and `resource-group.tf` includes the storage account, so also target that:)
```
terraform destroy -target=azurerm_storage_account.main -target=azurerm_storage_container.tfstate -target=azurerm_storage_container.mongodb_backups -target=azurerm_storage_container.graphdb_backups
```
Expected: destroy plan shows only these targeted resources.

- [ ] **Step 2: Move the real resources from the old subscription**

```
az resource move \
  --destination-subscription-id 11b62ac0-bb4d-47bb-8e5f-1f59ab674130 \
  --destination-group phis-rg \
  --ids \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/phis-rg/providers/Microsoft.KeyVault/vaults/phis-kv \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/phis-rg/providers/Microsoft.Storage/storageAccounts/phistfstate \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/phis-rg/providers/Microsoft.ContainerRegistry/registries/phisacr
```
This is a long-running operation (can take several minutes). It will fail loudly and non-destructively if anything blocks it (e.g. a lock, a missing RBAC role) — nothing is left half-moved on failure.

- [ ] **Step 3: Verify the move landed**

```
az resource list -g phis-rg --subscription 11b62ac0-bb4d-47bb-8e5f-1f59ab674130 -o table
az resource list -g phis-rg --subscription 64d45747-e6a6-4ba0-b46c-3247997c6f92 -o table
```
Expected: `phis-kv`, `phistfstate`, `phisacr` now listed under the target subscription and gone from the source.

- [ ] **Step 4: Re-point the still-old-subscription's Terraform state (root module) at the moved resources**

The **existing prod cluster** (still running, still serving traffic) references these resources by ID via Terraform-managed `azurerm_role_assignment`s etc. Its state now points at resource IDs that no longer exist under that subscription. Reconcile:
```
cd terraform
terraform state rm azurerm_key_vault.phis azurerm_storage_account.main azurerm_storage_container.tfstate azurerm_storage_container.mongodb_backups azurerm_storage_container.graphdb_backups azurerm_container_registry.phis 2>&1 | true
```
(Exact resource names — check `terraform state list` first; `azurerm_container_registry.phis` may not exist as a named resource if ACR was created manually too — verify with `az resource show -g phis-rg -n phisacr --subscription 64d45747... --query systemData.createdByType`.)

This step is why the plan does the move **after** the old cluster's stateful workloads are about to be scaled down anyway (Task 7) — the old cluster loses its KV/storage the moment the move completes, so its ESO sync and blobfuse mounts stop working from this point forward. That's the actual start of the downtime window.

- [ ] **Step 5: Import the moved resources into `terraform/prod-new` state**

```
cd terraform/prod-new
terraform import azurerm_key_vault.phis /subscriptions/11b62ac0-bb4d-47bb-8e5f-1f59ab674130/resourceGroups/phis-rg/providers/Microsoft.KeyVault/vaults/phis-kv
terraform import azurerm_storage_account.main /subscriptions/11b62ac0-bb4d-47bb-8e5f-1f59ab674130/resourceGroups/phis-rg/providers/Microsoft.Storage/storageAccounts/phistfstate
terraform import azurerm_storage_container.tfstate https://phistfstate.blob.core.windows.net/tfstate
terraform import azurerm_storage_container.mongodb_backups https://phistfstate.blob.core.windows.net/mongodb-backups
terraform import azurerm_storage_container.graphdb_backups https://phistfstate.blob.core.windows.net/graphdb-backups
```
(ACR isn't a resource in this module — track it as a plain Azure resource for now, or add `azurerm_container_registry` + import if closing that gap matters for the handover, same reasoning as Task 1.)

- [ ] **Step 6: Verify clean plan**

```
terraform plan
```
Expected: no destructive diff. RBAC role assignments (`azurerm_role_assignment.eso_kv_reader` etc.) should show as **creates** (they need to be (re)established against the new cluster's identity principal IDs) — anything else is unexpected, stop and investigate.

- [ ] **Step 7: Apply to fix up role assignments**

```
terraform apply
```

---

### Task 7: Move the 7 data disks and reattach to the new cluster

**Files:**
- Create: `k8s/migration/pv-mongodb-data.yaml`, `k8s/migration/pv-mongodb-config.yaml`, `k8s/migration/pv-graphdb-data.yaml` (static PersistentVolume manifests — one per disk, referencing the moved disk's new resource ID)

**Interfaces:**
- Consumes: disk resource IDs from Task 6, `azureDisk`/CSI driver PV spec matching whatever field the existing StatefulSets' PVC `volumeName` binds to (check `clusters/phis-cluster/**/*.yaml` for the current storage class / CSI driver name before writing these).

This is the actual downtime window. Keep it short by having every manifest pre-written and reviewed *before* scaling anything down.

- [ ] **Step 1: Confirm the old cluster's workloads are stopped (they lost KV/storage access in Task 6 anyway)**

On the OLD cluster (`KUBECONFIG` unset or pointed at `$HOME/.kube/config`):
```
kubectl scale statefulset mongodb graphdb --replicas=0
kubectl scale deployment opensilex --replicas=0
```

- [ ] **Step 2: Take a final manual snapshot of each disk as a rollback point**

```
for disk in pvc-11812d21-47ea-4513-96bd-c9117e1afd7f pvc-590f53ce-4dc2-4ddf-8797-1d40e6cf599b pvc-85746719-0082-4a94-bed5-4fef7c08fa16 pvc-c92b863c-9317-4b84-ab1c-e72655de40de pvc-d4d15369-f100-4752-832e-9608cc2da144 pvc-e42e0f8e-8908-434f-b4bf-d0fefffacff7 pvc-fdf6d55b-f9f8-4f6b-96ec-2d0db588f88a; do
  az snapshot create -g MC_phis-rg_phis-cluster_westeurope -n "${disk}-premigration" --source "$disk" --subscription 64d45747-e6a6-4ba0-b46c-3247997c6f92
done
```
This snapshot stays in the OLD subscription and is the rollback path if anything in Steps 3-6 goes wrong — it is not deleted until Task 9 confirms the new cluster is good.

- [ ] **Step 3: Verify every disk shows `diskState: Unattached` before moving**

```
az disk list -g MC_phis-rg_phis-cluster_westeurope --subscription 64d45747-e6a6-4ba0-b46c-3247997c6f92 --query "[].{name:name, state:diskState}" -o table
```
Expected: all 7 `Unattached`. If any still show `Attached`, the pod using it hasn't fully terminated — wait and recheck rather than forcing.

- [ ] **Step 4: Move the disks**

```
az resource move \
  --destination-subscription-id 11b62ac0-bb4d-47bb-8e5f-1f59ab674130 \
  --destination-group MC_phis-rg_phis-cluster_westeurope \
  --ids \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-11812d21-47ea-4513-96bd-c9117e1afd7f \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-590f53ce-4dc2-4ddf-8797-1d40e6cf599b \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-85746719-0082-4a94-bed5-4fef7c08fa16 \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-c92b863c-9317-4b84-ab1c-e72655de40de \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-d4d15369-f100-4752-832e-9608cc2da144 \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-e42e0f8e-8908-434f-b4bf-d0fefffacff7 \
    /subscriptions/64d45747-e6a6-4ba0-b46c-3247997c6f92/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-fdf6d55b-f9f8-4f6b-96ec-2d0db588f88a
```
Note the destination group is the **new cluster's** node resource group (`MC_phis-rg_phis-cluster_westeurope` under the new subscription — same name, different subscription, AKS generates it automatically at cluster creation).

- [ ] **Step 5: Update `locks.tf` disk IDs and re-apply (in `terraform/prod-new`)**

The `CanNotDelete` locks on the GraphDB/MongoDB disks (`locks.tf`) referenced the old subscription's disk IDs — they moved with the resource but Terraform's copy in `terraform/prod-new/locks.tf` still has the OLD subscription ID baked into the `scope` string (it's built from `var.subscription_id`, which is already correct since it reads from `terraform/prod-new/terraform.tfvars` — verify, don't assume):
```
cd terraform/prod-new
terraform plan -target=azurerm_management_lock.graphdb_data_disk -target=azurerm_management_lock.mongodb_data_disk -target=azurerm_management_lock.mongodb_config_disk
```
Expected: creates the 3 locks pointing at the new subscription's disk IDs. Apply if correct.

- [ ] **Step 6: Identify which existing PVC name/StorageClass each disk belongs to**

```
export KUBECONFIG=$HOME/.kube/phis-new-config
kubectl get pvc -A -o wide
```
Match against the disk names by size/purpose (mongodb-data, mongodb-config, graphdb-data, opensilex file storage, etc. — cross-reference `locks.tf` comments, which already identify 3 of the 7: graphdb data = `pvc-590f53ce...`, mongodb data = `pvc-c92b863c...`, mongodb config = `pvc-11812d21...`). For the remaining 4, check `az disk show -n <name> --query diskSizeGb` against each StatefulSet's PVC size in `clusters/phis-cluster/**/*.yaml`.

- [ ] **Step 7: Write static PV manifests binding the moved disks to the existing PVC claims**

Example for one (repeat per disk, using the CSI driver name already in use — check `kubectl get storageclass` output first):
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-mongodb-data-migrated
spec:
  capacity:
    storage: <match existing PVC request>
  accessModes:
    - ReadWriteOnce
  csi:
    driver: disk.csi.azure.com
    volumeHandle: /subscriptions/11b62ac0-bb4d-47bb-8e5f-1f59ab674130/resourceGroups/MC_phis-rg_phis-cluster_westeurope/providers/Microsoft.Compute/disks/pvc-c92b863c-9317-4b84-ab1c-e72655de40de
  claimRef:
    namespace: <mongodb namespace>
    name: <existing PVC name>
  persistentVolumeReclaimPolicy: Retain
  storageClassName: <match existing PVC storageClassName>
```

- [ ] **Step 8: Delete the placeholder dynamically-provisioned PVCs and disks the new cluster created in Task 5, apply the static PVs, let the StatefulSets re-bind**

```
kubectl delete pvc <placeholder-pvc-name> -n <namespace>
kubectl apply -f k8s/migration/
kubectl scale statefulset mongodb graphdb --replicas=1
kubectl scale deployment opensilex --replicas=1
```
Naming the exact PVC before deleting it satisfies the project's "never delete a PVC without naming the resource and confirming" rule — confirm with the user before running this delete, since it's the one genuinely destructive-looking command in this task (the disk itself isn't touched, only the placeholder claim object pointing at empty, disposable, freshly-created storage).

- [ ] **Step 9: Verify data is present and correct**

```
kubectl exec -it mongodb-0 -- mongosh --eval "db.adminCommand('listDatabases')"
kubectl exec -it graphdb-0 -- curl -s localhost:7200/rest/repositories
```
Expected: real database/repository names from prod, not empty. Compare row/document counts against a value captured from the OLD cluster before Task 7 Step 1 scaled it down, if an exact match matters.

---

### Task 8: Full validation pass on the new cluster (no DNS change yet)

**Files:** none.

- [ ] **Step 1: Port-forward and smoke-test each service**

```
kubectl port-forward svc/opensilex 8080:80
```
Hit `http://localhost:8080` — log in with real (moved-KV) credentials, confirm real project/experiment data is visible.

- [ ] **Step 2: Test email/SMTP**

Trigger whatever in-app action sends mail (password reset, notification) and confirm delivery via the recreated `phis-acs`/`phis-email` (Task 1/6) — this is the one integration that has genuinely new credentials (ACS keys regenerate on recreation), so it's the most likely thing to silently be broken.

- [ ] **Step 3: Test Feide login end-to-end**

Feide's registered redirect URI is tied to a specific hostname — if it's `phis.pheno.no`, this may not fully validate until Task 9's DNS cutover. At minimum confirm the `feide-client-id`/`feide-client-secret` secrets synced correctly (`kubectl get secret <feide-secret> -o yaml`, compare values against the old cluster's, which still has them since the old secrets weren't touched — the *new* KV was moved, so both should already be identical since the KV itself moved rather than being copied).

- [ ] **Step 4: Confirm CI/CD works against the new cluster**

Update the 3 GitHub Actions repo secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) using `terraform output` from `terraform/prod-new`, push a trivial change on the `k8s` branch, confirm the workflow deploys successfully to the new cluster.

---

### Task 9: DNS cutover

**Files:** none — DNS is external to Azure (confirmed no Azure DNS zone holds `phis.pheno.no`).

- [ ] **Step 1: Get the new cluster's ingress public IP**

```
export KUBECONFIG=$HOME/.kube/phis-new-config
kubectl get svc -n <ingress-namespace> <ingress-service-name> -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

- [ ] **Step 2: Repoint the DNS A record** for `phis.pheno.no` at the registrar/DNS provider that hosts it (external to Azure — whoever manages `pheno.no`) to the new IP. Lower the TTL beforehand if a fast rollback matters.

- [ ] **Step 3: Wait for propagation, then verify**

```
nslookup phis.pheno.no
curl -sI https://phis.pheno.no
```
Expected: resolves to the new IP, TLS cert valid (cert-manager should have issued a fresh one against the new ingress — verify `kubectl get certificate -A` shows `Ready: True` before relying on this).

- [ ] **Step 4: Rollback path if anything is wrong post-cutover**

Repoint DNS back to the old cluster's IP (still running, untouched, just without live KV/storage access — reversible by moving `phis-kv`/`phistfstate`/`phisacr` back with the same `az resource move` command, source/destination swapped, plus restoring the pre-migration disk snapshots from Task 7 Step 2 if the new cluster wrote data that needs discarding).

---

### Task 10: Decommission the old subscription's resources (separate approval gate)

**Files:**
- Delete: `terraform/aks.tf`, `terraform/identity.tf`, `terraform/keyvault.tf`, `terraform/secrets.tf`, `terraform/resource-group.tf`, `terraform/communication.tf`, `terraform/locks.tf`, `terraform/outputs.tf`, `terraform/main.tf`, `terraform/variables.tf` (root module — everything now lives in `terraform/prod-new`)
- Rename: `terraform/prod-new/` → `terraform/` (once the old module is gone, drop the temporary directory name)

Do not start this task until Task 8's validation and at least a several-day soak period on the new cluster have passed. This is explicitly out of scope for the same session as Tasks 1-9 — it involves `terraform destroy` against the old AKS cluster and old node resource group, which is exactly the class of action that needs the resource named explicitly and confirmed, per the project's data-safety rules, not bundled into a migration run.

- [ ] **Step 1: Confirm with the user, naming each resource to be destroyed**, before writing or running anything here.
- [ ] **Step 2 onward: deferred** — write as its own follow-up plan once Task 9 has been live long enough to trust.

---

## Rollback Summary (read this before starting Task 6)

| Point of no return | What it breaks if wrong | Rollback |
|---|---|---|
| Task 6 Step 2 (move KV/storage/ACR) | Old cluster's ESO sync + blobfuse mounts stop working immediately | Move the 3 resources back (swap source/destination in the same command) |
| Task 7 Step 4 (move disks) | Old cluster's PVCs point at nothing; new cluster not yet attached | Move disks back; if new cluster wrote data, restore from Task 7 Step 2 snapshots instead |
| Task 9 Step 2 (DNS cutover) | User-facing traffic hits the new cluster | Repoint DNS back to old cluster's IP (old cluster still running until Task 10) |

Nothing before Task 6 touches the old subscription at all — Tasks 1-5 are pure addition in an empty target subscription and can be abandoned or retried freely.

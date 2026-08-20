# Onboarding

Written for someone taking over this repo who hasn't necessarily used
Kubernetes, Azure, or Terraform before. Read this first, then
[README.md](../README.md) and [DEPLOYMENT.md](../DEPLOYMENT.md), and keep
[RUNBOOK.md](RUNBOOK.md) bookmarked for when something breaks.

## What this repo is

PHIS/PheNo is a research data platform (OpenSILEX) running for the university.
This branch (`k8s`) is the **live production deployment** — a Kubernetes
cluster on Azure that a GitOps tool (Flux) keeps in sync with what's committed
here. In short: **changes you push to this branch go live on their own,
usually within a minute.** There is no separate "deploy" step to run.

## Access you'll need

None of this is self-service — someone with existing admin access (Azure
subscription owner / the previous maintainer) has to grant it.

| What | Why | Notes |
|---|---|---|
| Azure role on resource group `phis-rg` (Contributor or Owner) | To run `az`/`kubectl`/`terraform` commands against the cluster and its resources | Granted in the Azure Portal (IAM tab) — not managed by Terraform in this repo |
| Key Vault (`phis-kv`) — "Key Vault Secrets Officer" role | To read/rotate secrets (passwords, API keys) | **Currently hardcoded to one person's Azure AD object ID** in [terraform/keyvault.tf](../terraform/keyvault.tf) (`admin_kv_officer` resource) — this needs to be updated (or extended to a list) to add a new person; ask whoever is doing the handover to do this explicitly, don't just self-grant |
| GitHub repo access (write) | To push to the `k8s` branch and trigger the image-build workflow | Standard GitHub collaborator/team access |
| GHCR (`ghcr.io/lversen/opensilex-phis`) pull/push access | Usually comes for free with GitHub repo access via `GITHUB_TOKEN` in Actions — only matters if you need to push images manually | |
| DNS for `phis.pheno.no` | The domain is managed by an **external organization**, not by whoever runs this cluster | You cannot change DNS yourself; if the cluster's static IP ever needs to change, you'd have to go through them. In practice: never change the AKS load balancer's IP |

## Tools to install locally

- [`az`](https://learn.microsoft.com/cli/azure/install-azure-cli) — Azure CLI, for logging in (`az login`) and managing Azure resources
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/) — talks to the Kubernetes cluster
- [`flux`](https://fluxcd.io/flux/installation/) — inspect/force GitOps reconciliation (optional day-to-day, needed for some runbook steps)
- [`terraform`](https://developer.hashicorp.com/terraform/install) — only needed if you're changing infrastructure (new resources, cluster settings), not for routine app changes
- PowerShell — the cluster lifecycle and test-environment scripts (`tools/k8s-cluster/*.ps1`, `scripts/test-env.ps1`) are PowerShell, cross-platform via [PowerShell 7](https://github.com/PowerShell/PowerShell)

After `az login`, point `kubectl` at the cluster:
```bash
az aks get-credentials --resource-group phis-rg --name phis-cluster --overwrite-existing
```

## Where things live (map of the repo)

| Directory | What |
|---|---|
| `k8s/` | Everything Flux deploys — the actual app, databases, monitoring, backups |
| `clusters/phis-cluster/` | Tells Flux *what to watch* — one file per component (points at a folder in `k8s/`) |
| `terraform/` | The Azure infrastructure itself (the cluster, Key Vault, disk locks) — changed rarely |
| `tools/patches/` | Source-code patches applied to upstream OpenSILEX during the image build, plus the Dockerfiles that do it |
| `tools/k8s-cluster/` | Scripts to create/start/stop the whole cluster |
| `scripts/test-env.ps1` | Spin up/tear down a disposable test copy of the stack |
| `docs/` | This file, the runbook, and an architecture-diagram prompt |
| `.claude/memory/` | Working notes accumulated by the previous maintainer's AI assistant (Claude Code) — point-in-time observations, not authoritative, but useful background reading if you also use Claude Code |

## Glossary

Plain-language definitions of terms you'll see throughout the docs and code.

- **Kubernetes (K8s) / AKS**: a system that runs containerized applications across a cluster of machines and keeps them running (restarts crashed ones, etc.). AKS is Microsoft Azure's managed version — Azure runs the control plane, you don't have to.
- **Pod**: the smallest running unit in Kubernetes — one or more containers running together. When something is "crashing," it's a pod.
- **Deployment / StatefulSet**: a Kubernetes object that manages a set of pods (how many copies, what image, restart behavior). StatefulSet is used when a pod needs a stable identity and its own dedicated storage (MongoDB); Deployment is used for everything else here.
- **Service**: a stable network address/name for reaching a pod (or set of pods) from inside the cluster, even as individual pods come and go.
- **Ingress**: the entry point that routes external traffic (from the internet) into the cluster and to the right Service — this is what `https://phis.pheno.no/` actually hits.
- **Namespace**: a way to partition a cluster into isolated groups of resources. Production lives in namespace `phis`; a test copy might live in `phis-test`.
- **PV / PVC (PersistentVolume / PersistentVolumeClaim)**: how Kubernetes attaches durable disk storage to a pod. The PVC is the *request* for storage that a pod uses; the PV is the actual underlying disk. This is where the actual research data lives — see the data-persistence rules in [CLAUDE.md](../CLAUDE.md).
- **StorageClass**: a template describing *what kind* of storage a PVC gets (e.g. an Azure Managed Disk vs. Azure Blob Storage) and what happens to it when the PVC is deleted (`Retain` = disk survives; `Delete` = disk is destroyed too).
- **Flux / GitOps**: instead of manually running `kubectl apply`, Flux continuously watches this Git branch and applies whatever's committed here to the cluster automatically. Git is the source of truth — if the live cluster and the repo ever disagree, Flux will change the *cluster* to match the *repo*, not the other way around.
- **Kustomization**: Flux's unit of "watch this folder and apply it." Each major component (OpenSILEX, monitoring, backups...) has one.
- **HelmRelease / Helm chart**: Helm is a package manager for Kubernetes apps (like `apt`/`npm` but for K8s manifests). A few third-party components here (monitoring, cert-manager, ingress-nginx) are installed as Helm charts rather than hand-written YAML, because upstream publishes them that way.
- **ExternalSecret / ESO (External Secrets Operator)**: instead of storing passwords in Git (never do that), ESO pulls real secret values from Azure Key Vault and creates them as native Kubernetes Secrets inside the cluster automatically.
- **Kyverno**: a policy engine that can block certain actions cluster-wide. Here it's used for exactly one thing: preventing accidental `kubectl delete pvc` on production data.
- **cert-manager**: automatically obtains and renews the HTTPS certificate for `phis.pheno.no` from Let's Encrypt.
- **Terraform / IaC (Infrastructure as Code)**: instead of clicking around the Azure Portal to create the cluster, Key Vault, etc., their definitions are written as code in `terraform/` and applied with the `terraform` CLI — reproducible and reviewable, like the app code itself.

## Suggested reading order

1. This file
2. [README.md](../README.md) — what's deployed, repo layout
3. [DEPLOYMENT.md](../DEPLOYMENT.md) — how to actually operate it day-to-day
4. [RUNBOOK.md](RUNBOOK.md) — keep open when something's broken
5. [architecture-prompt.md](architecture-prompt.md) — narrative description of how the pieces connect (written as a diagram-generation prompt, but reads fine as plain text too)
6. `.claude/memory/` — optional, deeper historical context and gotchas

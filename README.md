# PHIS — Kubernetes Deployment

This branch (`k8s`) contains the Kubernetes manifests and tooling for deploying the PHIS OpenSILEX stack on Azure Kubernetes Service (AKS).

> **This branch is production.** It runs live at `https://phis.pheno.no/`. The old Docker VMs (`docker-compose-official` branch) were replaced by this cluster and are no longer used — that branch is kept for historical reference only.

## What's Deployed

- **OpenSILEX 1.5.0** (patched) — PHIS/PheNo instance
- **GraphDB** — RDF triplestore (replaces RDF4J)
- **MongoDB** — Document store (replica set mode)
- **FluxCD** — GitOps operator (watches this branch, reconciles every ~1 min)
- **Prometheus + Grafana** — cluster and app metrics (`kube-prometheus-stack`)
- **Nightly backups + disk snapshots** — MongoDB dumps, GraphDB RDF exports, Azure disk snapshots
- **Kyverno** — blocks accidental `kubectl delete pvc` on research data
- **PhisWebPortal** — a separate app (Azure Container App, *not* in this repo) that reads from OpenSILEX/GraphDB; this repo only contains the one-time job that creates its read-only GraphDB user

New here and don't know Kubernetes/Azure yet? Start with [docs/ONBOARDING.md](docs/ONBOARDING.md) — it explains the jargon and what access you need before touching anything.

## Quick Start

Push to this branch — FluxCD reconciles the cluster within ~1 minute. No manual `kubectl apply` needed.

```bash
# Manual apply (bypass Flux — debugging only)
kubectl apply -k k8s/
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for cluster access, secrets, image builds, and operational procedures.

## Repo Structure

```
k8s/                  # Kubernetes manifests (deployed by FluxCD)
  opensilex/          # Main app: Deployment, Service, Ingress, config
  graphdb/, mongodb/  # Databases
  monitoring/         # Prometheus + Grafana
  backup/             # Nightly backup + disk-snapshot CronJobs
  kyverno/            # PVC delete-protection policy
  portal/             # One-off job: creates PhisWebPortal's GraphDB read-only user
  test/               # Templates for on-demand test environments (see scripts/test-env.ps1)
clusters/phis-cluster/ # FluxCD bootstrap config — what Flux watches and installs
tools/
  k8s-cluster/        # Cluster lifecycle scripts (create/start/stop)
  patches/            # Source patches + Dockerfiles for image build
scripts/
  test-env.ps1        # Interactive: spin up/tear down a throwaway test namespace
terraform/            # Azure infrastructure as code (AKS cluster, Key Vault, resource locks)
.github/workflows/
  build-opensilex.yml # Build patched image and push to GHCR
docs/                 # Onboarding, runbook, architecture
reference/            # OpenSILEX API usage patterns (Python)
```

## Other Branches

- `docker-compose-official` — old Docker VM deployment, retired, kept for history
- `ansible-deployment` — Ansible automation, WIP, not in use

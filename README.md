# PHIS — Kubernetes Deployment

This branch (`k8s`) contains the Kubernetes manifests and tooling for deploying the PHIS OpenSILEX stack on Azure Kubernetes Service (AKS).

> **Production** currently runs on Docker VMs (`docker-compose-official` branch). This branch is the intended future platform, validated in parallel.

## What's Deployed

- **OpenSILEX 1.5.0** (patched) — PHIS/PheNo instance
- **GraphDB** — RDF triplestore (replaces RDF4J)
- **MongoDB** — Document store (replica set mode)
- **FluxCD** — GitOps operator (watches this branch, reconciles every ~1 min)

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
clusters/             # FluxCD bootstrap config
tools/
  k8s-cluster/        # Cluster lifecycle scripts (create/start/stop)
  patches/            # Source patches + Dockerfiles for image build
.github/workflows/
  build-opensilex.yml # Build patched image and push to GHCR
reference/            # OpenSILEX API usage patterns (Python)
```

## Other Branches

- `docker-compose-official` — Docker-based deployment (current production)
- `ansible-deployment` — Ansible automation (WIP)

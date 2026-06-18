---
name: project-test-environment
description: PHIS test environment system — k8s/test/ manifests + scripts/test-env.ps1 interactive PowerShell script
metadata: 
  node_type: memory
  type: project
  originSessionId: d4697684-8787-4a1f-95b2-f6a353b04002
---

## Overview

On-demand test environments that mirror production functionality but with no data persistence requirements. Built 2026-06-18.

**Why:** Allows testing OpenSILEX changes in isolation without touching production data.

## How to use

```powershell
.\scripts\test-env.ps1   # interactive menu
```

Options: spin up, tear down, list, configure GHCR credentials.

GHCR credentials are auto-generated from `gh auth token` and stored in `~/.phis-test-secrets.json`.

## Architecture

- Lives in `phis-<name>` namespace (e.g. `phis-test`, `phis-myfeature`)
- **Plain K8s Secrets** instead of ESO/Key Vault
- **managed-csi** storage (Delete reclaim policy — data destroyed with namespace)
- **LoadBalancer** service on port 80 instead of ClusterIP+Ingress
- **HTTP only**, no TLS/cert-manager
- `email: enable: false` (no SMTP)
- Separate Feide app per environment

## Key files

| File | Purpose |
|---|---|
| `k8s/test/kustomization.yaml` | Kustomize template (placeholders `__NS__`, `__LB_IP__`) |
| `k8s/test/opensilex.yml` | Test-specific config (HTTP, no email, `__LB_IP__` placeholders) |
| `k8s/test/mongodb-statefulset.yaml` | Test-specific: managed-csi + `__NS__` in RS hostname |
| `k8s/test/resource-patches.yaml` | CPU request overrides (100m) to avoid scheduler starvation |
| `scripts/test-env.ps1` | Interactive PowerShell menu script |

## What syncs from production automatically

When spinning up a new environment, the script pulls these files directly from production:
- `k8s/opensilex/deployment.yaml` (image tags, container config)
- `k8s/graphdb/deployment.yaml`
- `k8s/graphdb/service.yaml`, `nginx-config.yaml`
- `k8s/graphdb-init/job.yaml`
- `k8s/mongodb/service.yaml`

Changes to running environments do NOT auto-sync — tear down and re-spin, or `kubectl rollout restart`.

## Constraints

- Max **1 test environment** at a time on the current D4s_v3 node (Azure Disk limit: 7/8 slots used by prod+test)
- Two-pass deploy: pass 1 gets LB IP, pass 2 applies real IP + creates init job (OpenSILEX validates Host header against publicURI)
- MongoDB RS hostname is namespace-specific: `mongodb-0.mongodb.<ns>.svc.cluster.local:27017`

## See also

[[feedback-test-env-patterns]] for gotchas (email crash, CPU requests, disk limits, secret recovery)

---
name: feedback-aks-k8s-version
description: "AKS K8s version selection: 1.33 is the right choice — 1.30-1.32 are LTS-only (Premium required), 1.34+ invisible to azurerm 4.76"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4ae002f9-23e1-439e-b698-cd78bf928e71
---

Always use Kubernetes **1.33** for new AKS clusters (as of June 2026, West Europe).

**Why:**
- K8s 1.30, 1.31, 1.32 → `K8sVersionNotSupported` error at cluster creation. Azure flags them as LTS-only, requiring Premium tier + LTS support plan.
- K8s 1.34+ → cluster creates successfully but azurerm 4.76 uses AKS ARM API `2024-09-01` which cannot read clusters created with the newer schema. `terraform import` fails with "Cannot import non-existent remote object" even though `az aks show` confirms the cluster exists. Only AKS API `2025-01-01+` can see 1.34 clusters.
- K8s 1.33 → Standard-supported (no LTS restriction), visible to azurerm 4.76 via its API version.

**How to apply:** In `terraform/variables.tf`, keep `default = "1.33"`. Before upgrading to 1.34+, first verify that the azurerm provider has been updated to use AKS API 2025-01-01 or later.

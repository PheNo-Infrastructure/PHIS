---
name: project_azure_subscription
description: "Which Azure subscription hosts PHIS resources, and the pending move to prod subscription"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce94d7fb-dd64-4ff1-bac8-51cfd8ce6a6f
  modified: 2026-09-16T09:10:26.935Z
---

PHIS's Azure resources (`phis-rg`, `phis-cluster` AKS, `phis-kv`, etc.) live in
the subscription **"Lab - Sebastian Iversen (FOF)"**
(`64d45747-e6a6-4ba0-b46c-3247997c6f92`), NOT the org's `p-phsprd` production
subscription (`11b62ac0-bb4d-47bb-8e5f-1f59ab674130`) despite the name
suggesting PHIS. `az account set --subscription` defaults to whatever was last
used (often `p-we1net`), so always verify/switch subscription before running
`az group list` or similar for this project.

**Why:** Confirmed directly by the user (2026-09-16) when I incorrectly
assumed `p-phsprd` was the right subscription based on naming alone.

**How to apply:** There is a standing TODO to migrate these resources from
the Lab subscription to `p-phsprd` — but the user said explicitly not now.
Don't initiate or suggest that migration proactively; wait for the user to
raise it. Until then, always target the Lab subscription for PHIS Azure
operations.

See [[project_azure_infra]], [[project_k8s_deployment]].

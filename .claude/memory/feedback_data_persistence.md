---
name: feedback-data-persistence
description: "Data persistence is the highest priority for PHIS — research data is irreplaceable, treat storage operations as potential data-loss events"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f55fe2a2-c56a-43f8-9964-d80ddca06b31
---

Data persistence must be prioritized to the highest degree for all PHIS operations.

**Why:** Research phenotyping data in MongoDB, GraphDB, and OpenSILEX blob storage is irreplaceable. There is no upstream source to restore from. Loss is permanent.

**How to apply:**
- Never delete PVCs, StatefulSets, or database pods without explicit confirmation naming the resource
- Never touch `/home/opensilex/data/.installed` unless user explicitly requests a system install reset (doing so wipes all user data)
- Always prefer `kubectl rollout restart` over `kubectl delete pod` for database workloads
- Before any destructive kubectl operation: run `kubectl get pvc -n phis`, state the risk and recovery path, then ask
- Safe upgrade path: update image tag in deployment.yaml, push — Flux handles the rollout without touching PVCs
- When uncertain whether an operation is safe: do the read-only diagnostic first, report, then ask

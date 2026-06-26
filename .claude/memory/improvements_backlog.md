# Infrastructure Improvements Backlog

Identified 2026-06-26. Prioritized by operational impact.

---

## High Priority

### 1. Observability — no alerting exists today
If a backup job fails at 2am, no one knows until recovery is needed.

Options (pick one):
- **Azure Container Insights** — nearly free, add `oms_agent` block to `terraform/aks.tf`
- **kube-prometheus-stack** — Prometheus + Grafana + Alertmanager via a single HelmRelease

Minimum useful alerts to configure once the stack is in:
- Backup CronJob failed (MongoDB, GraphDB)
- Pod restart loop (CrashLoopBackOff)
- PVC disk usage >80%

---

### 2. MongoDB using wrong StorageClass
`k8s/mongodb/statefulset.yaml` uses `managed-csi` (Delete reclaim policy).
`managed-csi-retain` (Retain) was created for exactly this purpose but never used here.

Currently papered over by the Azure Management Locks in `locks.tf`, but those locks
reference hardcoded disk UUIDs that would break on a cluster rebuild.

**Fix:** Change `storageClassName: managed-csi` → `managed-csi-retain` in both
`volumeClaimTemplates` entries in `k8s/mongodb/statefulset.yaml`.

Note: This only applies to new PVCs — existing disks are unaffected.

---

### 3. Single node = single point of failure
All workloads (MongoDB, GraphDB, OpenSILEX, system pods) run on one D4s_v3.
Azure maintenance on that node takes everything down simultaneously.

**Fix:** `node_count = 2` in `terraform/variables.tf`.

Blocker: Azure Disk quota — currently at 7/8 slots on D4s_v3.
May need a quota increase or a VM SKU change before doing this.

---

## Medium Priority

### 4. No image vulnerability scanning in CI
`build-opensilex.yml` builds and pushes but never scans.

Add after the push step in `.github/workflows/build-opensilex.yml`:
```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/lversen/opensilex-phis:${{ inputs.image_version }}
    severity: CRITICAL,HIGH
    exit-code: '1'
```

---

### 5. AKS not auto-patching Kubernetes
No `automatic_channel_upgrade` set — patch versions accumulate silently.

Add to `terraform/aks.tf` inside the `azurerm_kubernetes_cluster` resource:
```hcl
automatic_channel_upgrade = "patch"
```

---

### 6. `imagePullPolicy: Always` on OpenSILEX
`k8s/opensilex/deployment.yaml` line 131. Forces a GHCR pull on every pod restart.
If GHCR is down during a restart, the pod won't recover even though the image is cached locally.

**Fix:** Change to `imagePullPolicy: IfNotPresent` (safe because explicit version tags are used).

---

## Low Priority / Housekeeping

### 7. Remove hardcoded `restartedAt` annotation
`k8s/opensilex/deployment.yaml` line 16 — leftover from a manual `kubectl rollout restart`.
Harmless but misleading. Safe to delete.

### 8. `purge_soft_delete_on_destroy` should be removed
`terraform/main.tf` line 37 — comment says "remove for production" but it's still there.
If `terraform destroy` is ever run, Key Vault is permanently deleted instead of entering
90-day soft-delete. Low probability but easy to fix.

### 9. NetworkPolicy to isolate databases
No NetworkPolicy means any pod can reach MongoDB or GraphDB.
Add policies to restrict MongoDB/GraphDB to only accept connections from OpenSILEX pods
and backup jobs.

### 10. Hardcoded disk UUIDs in locks.tf (document, not fix)
`terraform/locks.tf` references specific Azure disk UUIDs (pvc-590f53ce-..., etc.).
These would need manual updating after a full cluster rebuild.
No clean automated fix exists — just something to be aware of during a rebuild.

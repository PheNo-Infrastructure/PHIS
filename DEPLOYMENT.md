# PHIS Kubernetes Deployment

## Cluster

- **Cluster**: `phis-cluster`, resource group `phis-rg`, region `westeurope`
- **Namespace**: `phis`
- **Connect**: `az aks get-credentials --resource-group phis-rg --name phis-cluster`

## GitOps Workflow

FluxCD watches the `k8s` branch and reconciles every ~1 minute.

| Action | Result |
|--------|--------|
| Push manifest change | Cluster auto-updates |
| Edit `k8s/opensilex/opensilex.yml` | `configMapGenerator` hash changes → automatic pod rollout |
| Rebuild image with same tag | Push first, then `kubectl rollout restart deployment/opensilex -n phis` |

Check sync status:

```bash
kubectl get kustomization -n flux-system
```

## Access

| Service | Address |
|---------|---------|
| OpenSILEX | `https://phis.pheno.no/` |
| Admin port | `kubectl port-forward -n phis svc/opensilex-admin 8667:8667` |
| GraphDB | ClusterIP only — port 7200 |
| MongoDB | ClusterIP only — port 27017 |
| Grafana | `kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80` — see [Monitoring](#monitoring) |

## Building the Image

Trigger manually via GitHub Actions (`build-opensilex.yml`):

| Input | Example | Description |
|-------|---------|-------------|
| `image_version` | `1.5.0.2` | Docker tag pushed to GHCR |
| `opensilex_tag` | `1.5.0` | Upstream OpenSILEX git tag to build from |

Pushes `ghcr.io/lversen/opensilex-phis:<image_version>`.

After a rebuild using the same tag, restart the pod to pull the new image:

```bash
kubectl rollout restart deployment/opensilex -n phis
```

## Secrets

All secrets are managed by External Secrets Operator (ESO), synced from Azure Key Vault `phis-kv`.
Kubernetes secrets are created automatically — never commit secret values to git.

| Kubernetes Secret | Key Vault Secret(s) | Keys |
|-------------------|---------------------|------|
| `mongodb-credentials` | `mongodb-root-password`, `mongodb-opensilex-password`, `mongodb-keyfile` | `root-password`, `opensilex-password`, `keyfile` |
| `graphdb-credentials` | `graphdb-admin-password` | `admin-password` |
| `feide-credentials` | `feide-client-id`, `feide-client-secret` | `client-id`, `client-secret` |
| `opensilex-credentials` | `opensilex-admin-password` | `admin-password` |
| `ghcr-pull-secret` | `ghcr-pull-secret-json` | `.dockerconfigjson` |

If the cluster is recreated, ESO re-syncs all secrets automatically from Key Vault — no manual step needed.

### Changing the OpenSILEX admin password

**Key Vault is the source of truth.** Just set it there — nothing else:

```bash
az keyvault secret set --vault-name phis-kv --name opensilex-admin-password --value 'new-password'
```

The `opensilex-admin-password-sync` CronJob (hourly, `k8s/opensilex/admin-password-sync-cronjob.yaml`)
bcrypts the Key Vault value and writes it into GraphDB as the admin account's
`os-sec:hasPasswordHash`. The change takes effect within ~1–2h (ESO's 1h
refresh + the next CronJob run).

To apply it immediately instead of waiting:

```bash
kubectl annotate externalsecret opensilex-credentials -n phis force-sync=$(date +%s) --overwrite
kubectl create job -n phis --from=cronjob/opensilex-admin-password-sync pwsync-now
kubectl logs -n phis job/pwsync-now      # expect: "admin password synced from Key Vault."
```

Notes:
- A password changed in the OpenSILEX UI is **reverted to the Key Vault value**
  on the next CronJob run. Key Vault is the only knob, by design.
- The CronJob gates nothing — if it fails, OpenSILEX keeps running on the
  current password and it retries next hour.
- `flow`: Key Vault → ESO (`opensilex-credentials` secret) → CronJob → GraphDB.

If the CronJob is ever removed / disabled, fall back to the manual path:
`az keyvault secret set`, then change the password in the OpenSILEX UI
(**Security → My account** as `admin@opensilex.org`) to match.

## Updating OpenSILEX Config

Edit `k8s/opensilex/opensilex.yml` and push. The `configMapGenerator` detects the content change, updates the ConfigMap hash, which changes the Deployment spec and triggers a rolling restart automatically.

## Ontology Reload (Major Upgrades Only)

OpenSILEX skips `system install` if `/home/opensilex/data/.installed` exists. If a new version ships updated ontologies, delete the marker before restarting:

```bash
kubectl exec -n phis <pod-name> -- rm /home/opensilex/data/.installed
kubectl rollout restart deployment/opensilex -n phis
```

## Monitoring

`kube-prometheus-stack` (Prometheus + Grafana + Alertmanager) runs in the `monitoring` namespace, installed by Flux (`clusters/phis-cluster/monitoring-stack.yaml` → `k8s/monitoring/install/`).

**Viewing dashboards:**
```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80
```
Open `http://localhost:3000`. Username is `admin`; get the password with:
```bash
kubectl get secret -n monitoring kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}" | base64 -d
```
The chart ships with a set of default Kubernetes dashboards out of the box (node/pod resource usage, etc.) — nothing PHIS-specific has been built yet.

**No persistence by design**: Grafana normally stores its own settings (dashboards you create, alert rules) in a local SQLite file, but this cluster's default storage (Azure Files/SMB) doesn't support the file locking SQLite needs — it crash-loops. Persistence is disabled (`k8s/monitoring/install/helmrelease.yaml`), so **anything you configure by hand in the Grafana UI is lost on pod restart.** Built-in dashboards survive because they're loaded from ConfigMaps, not the UI. If you need to keep custom dashboards, provision them as ConfigMaps (like the built-in ones) rather than clicking "Save" in the UI, or add an `managed-csi` (Azure Disk) volume instead of the default.

## Backups & Disaster Recovery

Three independent layers protect the data. None of them require you to do anything day-to-day — this section is for when something actually breaks.

| Layer | What | Schedule | Where it lands | Retention |
|---|---|---|---|---|
| Logical dump | `mongodump` of the whole MongoDB database | Nightly 02:00 UTC (`k8s/backup/mongodb-cronjob.yaml`) | `mongodb-backup-pvc` (Azure Blob) | 30 days |
| Logical export | GraphDB repo exported as RDF (`.trig`) over its HTTP API | Nightly 03:00 UTC (`k8s/backup/graphdb-cronjob.yaml`) | `graphdb-backup-pvc` (Azure Blob) | 30 days |
| Disk snapshot | Azure Disk snapshot of the live MongoDB + GraphDB volumes | Nightly 01:00 UTC (`k8s/backup/snapshot-cronjob.yaml`) | Azure snapshot resources (not in the PVC) | last 7 kept |

Plus: all PVs are `Retain` (survive even if the PVC/pod is deleted), 3 of the underlying Azure managed disks + the Terraform state storage account have `CanNotDelete` resource locks, and Kyverno blocks `kubectl delete pvc` in the `phis` namespace unless it's explicitly annotated first (see `k8s/kyverno/policy/block-pvc-delete.yaml`). See [docs/RUNBOOK.md](docs/RUNBOOK.md) for the actual disaster-recovery restore steps.

**Checking backups are healthy:**
```bash
kubectl get cronjob -n phis
kubectl get jobs -n phis -l app=mongodb-backup    # or app=graphdb-backup
kubectl logs -n phis job/<latest-job-name>
```

## Portal (PhisWebPortal)

PhisWebPortal is a separate public-facing web app that displays PHIS research data. It is **not deployed by this repo** — it runs as its own Azure Container App, with its own codebase/deployment pipeline.

What *is* here: `k8s/portal/graphdb-init-job.yaml`, a one-off Job that creates (or resyncs the password for) a **read-only** GraphDB user for the portal to query against, using credentials from the `graphdb-portal-credentials` secret. It runs once via Flux like any other manifest; re-running it (e.g. after rotating the portal's GraphDB password in Key Vault) is safe — it detects whether the user already exists and updates the password instead of failing.

## Test Environments

For trying out changes (a new patch, a config tweak, a new image tag) without touching production. Namespace `phis-test` (or `phis-<name>`), spun up/torn down interactively:
```powershell
scripts/test-env.ps1
```
Full details, constraints (max 1 environment at a time — Azure Disk slot limit), and gotchas are in [CLAUDE.md](CLAUDE.md#test-environments). Test environments intentionally use `Delete`-reclaim PVCs — unlike production, deleting the test namespace destroys its data. That's by design; don't treat a test environment as a place to keep anything.

## Cluster Lifecycle

```powershell
tools/k8s-cluster/04-bootstrap.ps1        # First-time: terraform apply + secrets + Flux bootstrap
tools/k8s-cluster/02-start-cluster.ps1   # Start a stopped cluster
tools/k8s-cluster/03-stop-cluster.ps1    # Stop cluster (reduce costs)
```

## Known Gaps

This cluster **is production** (has been since 2026-06-11) — the items below are follow-up hardening, not blockers.

- [ ] Upgrade AKS from Free tier to Standard for an SLA
- [ ] Add autoscaler / multiple nodes for high availability (currently a single `Standard_D4s_v3` node — a node failure is an outage)
- [ ] Invite-token store is in-memory only (patch 006) — a pod restart silently drops pending researcher invites; would need a DB-backed store to survive restarts
- [ ] New PVCs aren't auto-locked in Azure — `terraform/locks.tf` must be updated by hand whenever a new managed disk is added (see [Backups & Disaster Recovery](#backups--disaster-recovery) above)
- [ ] No PHIS-specific Grafana dashboards yet — only the chart's generic Kubernetes ones

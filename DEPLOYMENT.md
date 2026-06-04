# PHIS Kubernetes Deployment

## Cluster

- **Cluster**: `phis-cluster`, resource group `phis-rg`, region `norwayeast`
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
| OpenSILEX | `http://20.100.143.97:8666/app/` |
| Admin port | `kubectl port-forward -n phis svc/opensilex-admin 8667:8667` |
| GraphDB | ClusterIP only — port 7200 |
| MongoDB | ClusterIP only — port 27017 |

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

All secrets are SealedSecrets — encrypted, safe to commit, cluster-specific.

| Secret | Keys |
|--------|------|
| `mongodb-credentials` | `root-password`, `opensilex-password`, `keyfile` |
| `graphdb-credentials` | `admin-password` |
| `feide-credentials` | `client-id`, `client-secret` |

If the cluster is recreated, re-seal all secrets with `kubeseal` using the new cluster's certificate.

## Updating OpenSILEX Config

Edit `k8s/opensilex/opensilex.yml` and push. The `configMapGenerator` detects the content change, updates the ConfigMap hash, which changes the Deployment spec and triggers a rolling restart automatically.

## Ontology Reload (Major Upgrades Only)

OpenSILEX skips `system install` if `/home/opensilex/data/.installed` exists. If a new version ships updated ontologies, delete the marker before restarting:

```bash
kubectl exec -n phis <pod-name> -- rm /home/opensilex/data/.installed
kubectl rollout restart deployment/opensilex -n phis
```

## Cluster Lifecycle

```powershell
tools/k8s-cluster/01-create-cluster.ps1   # First-time AKS setup
tools/k8s-cluster/02-start-cluster.ps1    # Start a stopped cluster
tools/k8s-cluster/03-stop-cluster.ps1     # Stop cluster (reduce costs)
```

## Before Promoting to Production

- [ ] Add TLS/HTTPS ingress (currently plain HTTP on port 8666)
- [ ] Point DNS to cluster IP and update `publicURI` in `k8s/opensilex/opensilex.yml`
- [ ] Upgrade AKS from Free tier to Standard for SLA
- [ ] Add autoscaler / multiple nodes for HA
- [ ] Change default admin password (`admin@opensilex.org` / `admin`)

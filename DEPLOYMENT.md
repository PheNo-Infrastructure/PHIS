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

The admin password must be kept in sync between Key Vault and OpenSILEX's internal database (GraphDB).
**Always update Key Vault first**, then OpenSILEX.

1. Update the secret in Key Vault:
   ```bash
   az keyvault secret set --vault-name phis-kv --name opensilex-admin-password --value "<new-password>"
   ```
2. ESO syncs the Kubernetes secret within 1 hour (or force it: `kubectl annotate externalsecret opensilex-credentials -n phis force-sync=$(date +%s) --overwrite`).
3. Change the password in the OpenSILEX UI: **Security → My account** (logged in as `admin@opensilex.org`).
4. Restart the pod so the new password is picked up by the startup script:
   ```bash
   kubectl rollout restart deployment/opensilex -n phis
   ```

If Key Vault and OpenSILEX get out of sync, the `opensilex-init` Job will fail to authenticate on next run and log:
`ERROR: Could not authenticate. Check opensilex-admin-password in Key Vault.`

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

- [x] Add TLS/HTTPS ingress
- [x] Point DNS to cluster IP (`phis.pheno.no`)
- [ ] Upgrade AKS from Free tier to Standard for SLA
- [ ] Add autoscaler / multiple nodes for HA
- [ ] Change default admin password — see [Changing the OpenSILEX admin password](#changing-the-opensilex-admin-password)

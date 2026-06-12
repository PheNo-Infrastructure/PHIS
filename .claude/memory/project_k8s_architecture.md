---
name: project-k8s-architecture
description: "k8s stack design decisions, component breakdown, and non-obvious technical gotchas for the PHIS AKS deployment"
metadata: 
  node_type: memory
  type: project
  originSessionId: 04154a3f-1a21-4db1-a22c-6c3e18a4e74b
---

## Stack layout (all in namespace `phis`)

| Component | K8s kind | File |
|-----------|----------|------|
| MongoDB | StatefulSet | `k8s/mongodb/statefulset.yaml` |
| GraphDB | Deployment (+ nginx sidecar) | `k8s/graphdb/deployment.yaml` |
| OpenSILEX | Deployment | `k8s/opensilex/deployment.yaml` |
| GraphDB repo init | Job (one-shot) | `k8s/graphdb-init/job.yaml` |
| OpenSILEX post-install | Job (one-shot) | `k8s/opensilex-init/job.yaml` |
| OpenSILEX config | configMapGenerator | `k8s/opensilex/opensilex.yml` (source), generated into `opensilex-config-<hash>` |
| Secrets | ExternalSecret (ESO) | `k8s/*/externalsecret.yaml` |
| Storage | PVC | `k8s/graphdb/pvc.yaml`, inline in statefulset |
| Entry point | `kubectl apply -k k8s/` | `k8s/kustomization.yaml` |

## MongoDB — why StatefulSet

OpenSILEX requires MongoDB in replica set mode even for a single instance. StatefulSet gives the pod a stable, predictable DNS name (`mongodb-0.mongodb.phis.svc.cluster.local`) which MongoDB stores as the replica set member identity. A regular Deployment would get a random pod name and break the replica set on restarts.

**Auth bootstrap**: On first boot, mongod starts without auth, creates root + opensilex users, initializes the replica set, writes a `.auth_initialized` marker, then shuts down and restarts with `--auth --keyFile`. Subsequent boots skip the init block entirely. The keyFile is injected from the `mongodb-credentials` Secret.

## GraphDB — why Recreate strategy + nginx sidecar

**Recreate strategy**: The PVC is `ReadWriteOnce` (only one node can mount it). RollingUpdate would briefly run two pods, both trying to mount the same disk — Azure would reject the second mount. Recreate kills the old pod fully first.

**nginx sidecar**: OpenSILEX's first-time system install sends a `PUT /repositories/opensilex/config` with an `rdf4j:LmdbStore` sail type that GraphDB rejects with an error. The nginx sidecar (port 7201) intercepts any `PUT`/`POST` to `/repositories/*/config` and returns `204` silently, letting the install proceed. All other traffic is proxied to GraphDB (port 7200). The GraphDB Service routes to port 7201 (not 7200 directly) so all traffic passes through nginx.

## OpenSILEX — startup ordering via initContainers

k8s has no `depends_on`. Ordering is handled by 3 initContainers that run sequentially before the main container:

1. **generate-config** — The ConfigMap holds `opensilex.yml` with `${MONGO_APP_PASSWORD}`, `${FEIDE_CLIENT_ID}`, `${FEIDE_CLIENT_SECRET}` placeholders. This initContainer uses `sed` to substitute values from Secrets and writes the rendered config to an `emptyDir` volume at `/home/opensilex/config-gen`. The main container mounts this emptyDir as its config directory.
2. **wait-for-mongodb** — Polls `mongosh rs.status().ok` (with root credentials) until it returns 1.
3. **wait-for-graphdb** — Polls `http://graphdb:7200/rest/repositories/opensilex` until HTTP 200. Then runs a SPARQL ASK query to check if the oeso vocabulary graph is loaded. If yes, touches `.installed` to skip system install on this boot.

Note: no fix-permissions initContainer — `opensilex-data` PVC uses `azureblob-fuse2-phis` StorageClass which enforces uid/gid=1001 at the FUSE level. `chown` is unsupported on blobfuse2 mounts.

**Install marker**: The main container checks for `/home/opensilex/data/.installed` before running `system install`. This prevents re-running the install (which resets data) on every pod restart.

**Ontology reload on upgrade**: The `.installed` marker suppresses `system install` on upgrades too. If a new OpenSILEX version ships updated ontologies, delete the marker manually before restarting: `kubectl exec -n phis <pod> -- rm /home/opensilex/data/.installed`.

## OpenSILEX post-install init Job

`opensilex-init/job.yaml` runs after OpenSILEX is up and creates the "Users" group (required for Feide auto-assignment). It:
- Waits for the REST API (`/rest/core/system/info`)
- Authenticates as `admin@opensilex.org` using password from `opensilex-credentials` secret (Key Vault: `opensilex-admin-password`)
- Checks if "Users" group exists; exits 0 if so (idempotent)
- Creates the group if missing
- Exits **1** on auth failure so Kubernetes retries (backoffLimit: 20)

**Feide auto-assignment** (`SecurityAutoAssignmentService`, patch 002): on Feide login, assigns new users to "Users" group with "Default profile". Both must exist — "Default profile" is created by OpenSILEX by default; "Users" group is created by this init job. If either is missing, assignment silently skips.

## One-shot Jobs — common settings

Both init Jobs (`graphdb-init`, `opensilex-init`) have:
- `ttlSecondsAfterFinished: 86400` — auto-delete 24h after completion so FluxCD can re-create them on cluster reset
- `restartPolicy: OnFailure` + `backoffLimit` — retry until success

## Config injection pattern

```
k8s/opensilex/opensilex.yml  (source file, committed to git)
  → Kustomize configMapGenerator hashes content → ConfigMap named opensilex-config-<hash>
  → generate-config initContainer renders ${MONGO_APP_PASSWORD} etc. from Secrets
  → emptyDir volume at /home/opensilex/config-gen
  → main container mounts emptyDir as /home/opensilex/config (read-only)
```

Changing `opensilex.yml` and pushing to git causes the ConfigMap name to change, which changes the Deployment spec, which automatically triggers a pod rollout. No manual restart needed.

## imagePullPolicy

OpenSILEX Deployment uses `imagePullPolicy: Always`. This is necessary because image tags are reused on rebuilds (e.g., `1.5.0.2` rebuilt with a fix). Without `Always`, Kubernetes uses the cached image and ignores the new push. With `Always`, every `kubectl rollout restart` pulls fresh from GHCR.

## Networking

- All inter-pod communication uses k8s Service DNS: `mongodb:27017`, `graphdb:7200`
- `graphdb` Service routes port 7200 → pod port 7201 (nginx sidecar), not 7200 (GraphDB directly)
- OpenSILEX exposed via two Services: `opensilex` (LoadBalancer, port 8666) and `opensilex-admin` (ClusterIP, port 8667)
- Nothing else is externally reachable

## Image

`ghcr.io/lversen/opensilex-phis:1.5.0.2` — custom build with patches applied, hosted on GitHub Container Registry. Built by `.github/workflows/build-opensilex.yml` with inputs `image_version` (our Docker tag, e.g. `1.5.0.2`) and `opensilex_tag` (upstream git tag, e.g. `1.5.0`). The `IMAGE_VERSION` build arg is passed through to Maven `-Drevision=` so the UI version matches the image tag.

The Deployment references `ghcr-pull-secret` for pull auth; remove `imagePullSecrets` if the package is set to public.

## Resource limits

| Component | CPU request | CPU limit | Memory request | Memory limit |
|-----------|-------------|-----------|----------------|--------------|
| OpenSILEX | 200m | 1000m | 512Mi | 2Gi |
| GraphDB | 500m | 2000m | 1Gi | 4Gi |
| MongoDB | 250m | 1000m | 512Mi | 2Gi |
| nginx sidecar | 10m | 50m | 32Mi | 128Mi |

## Probes

OpenSILEX uses all three probe types:
- `startupProbe` — 60 attempts × 10s = up to 10 min for first boot. Suspends liveness during this window.
- `readinessProbe` — removes pod from Service endpoints if it fails (stops traffic)
- `livenessProbe` — restarts the container if it fails (kicks a hung process)

All probes hit `GET /rest/core/system/info` on port 8666.

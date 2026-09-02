# Runbook — Common Problems

Step-by-step fixes for the situations most likely to come up. Written assuming
you're comfortable in a terminal but new to Kubernetes/Azure — each command
says what it does before you run it. If a term is unfamiliar, check
[ONBOARDING.md](ONBOARDING.md#glossary) first.

**Before anything else**, connect to the cluster (this points `kubectl`,
the Kubernetes command-line tool, at the right cluster):
```bash
az aks get-credentials --resource-group phis-rg --name phis-cluster --overwrite-existing
```

**Read-only first.** For anything involving the databases (MongoDB, GraphDB)
or their storage (PVCs), diagnose with `get`/`describe`/`logs` before running
anything that changes or deletes state. Research data here is irreplaceable —
see [CLAUDE.md](../CLAUDE.md) for the hard rules. When a step below deletes or
overwrites something, it says so explicitly.

---

## OpenSILEX site is down (phis.pheno.no not loading / 502 / 503)

1. Check the pod is actually running:
   ```bash
   kubectl get pods -n phis -l app=opensilex
   ```
   Look at the `STATUS` column. `Running` with `1/1` ready is healthy.
   `CrashLoopBackOff`, `Error`, or `Pending` means something's wrong.

2. Read the logs (`--previous` shows the log from before the last crash, useful
   if it's currently restarting):
   ```bash
   kubectl logs -n phis deployment/opensilex --tail=100
   kubectl logs -n phis deployment/opensilex --tail=100 --previous
   ```
   Common causes: MongoDB/GraphDB not reachable yet (OpenSILEX will retry —
   give it a minute after a fresh restart), a bad config value in
   `k8s/opensilex/opensilex.yml`, or the admin password being out of sync
   (see below).

3. If the pod is healthy but the site still doesn't load, check ingress and
   certificate:
   ```bash
   kubectl get ingress -n phis
   kubectl describe certificate -n phis
   ```

4. **Never** run `kubectl delete pod` on the OpenSILEX, MongoDB, or GraphDB
   pods to "fix" a hang — that can race with the PVC and doesn't force a clean
   restart the way you'd expect. Use this instead, which cleanly replaces the
   pod without touching storage:
   ```bash
   kubectl rollout restart deployment/opensilex -n phis
   ```

## Flux isn't picking up a change I pushed

Flux normally reconciles every ~1–5 minutes on its own. If it's been longer:

1. Check reconciliation status — look for `Ready: True` and a recent
   `Last reconciled` time:
   ```bash
   kubectl get kustomization -n flux-system
   ```

2. If a Kustomization shows `Ready: False`, get details on *why* (usually a
   YAML syntax error or a resource that failed to apply):
   ```bash
   kubectl describe kustomization phis-stack -n flux-system
   ```

3. Force an immediate reconcile instead of waiting (requires the `flux` CLI,
   installed alongside `kubectl`/`az` — see [ONBOARDING.md](ONBOARDING.md)):
   ```bash
   flux reconcile kustomization phis-stack --with-source
   ```

4. If you edited `k8s/opensilex/opensilex.yml`: that file is turned into a
   ConfigMap by Kustomize's `configMapGenerator`. A content change there
   *always* triggers a pod rollout automatically — you never need to manually
   restart for a config-only change once Flux has synced it.

## HTTPS / certificate broken (browser shows "not secure" or cert expired)

Certificates are issued and renewed automatically by cert-manager via Let's
Encrypt — this should be rare, but if it happens:

```bash
kubectl get certificate -n phis
kubectl describe certificate -n phis
kubectl get pods -n cert-manager
kubectl logs -n cert-manager deployment/cert-manager --tail=100
```
A `Ready: False` certificate with an error about rate limits or DNS
validation is the most common failure. Note: DNS for `phis.pheno.no` is
managed by an external organization — you cannot fix a DNS-side problem
yourself; you'd need to contact them.

## Admin password: change it, or it's "out of sync"

**Key Vault is the source of truth.** To change the admin password, set it in
Key Vault and nothing else — the `opensilex-admin-password-sync` CronJob
(hourly) writes it into GraphDB:

```bash
az keyvault secret set --vault-name phis-kv --name opensilex-admin-password --value 'new-password'
```

Takes effect within ~1–2h. To apply now, or if the password seems out of sync:

```bash
kubectl annotate externalsecret opensilex-credentials -n phis force-sync=$(date +%s) --overwrite
kubectl create job -n phis --from=cronjob/opensilex-admin-password-sync pwsync-now
kubectl logs -n phis job/pwsync-now
```

A password changed in the OpenSILEX UI reverts to the Key Vault value on the
next CronJob run — that's intentional. Full details:
[DEPLOYMENT.md](../DEPLOYMENT.md#changing-the-opensilex-admin-password).

## Secrets not syncing (ExternalSecret stuck / stale value in the cluster)

Secrets flow: Azure Key Vault → External Secrets Operator (ESO) → Kubernetes
Secret → pod. ESO normally re-syncs within an hour of a Key Vault change.

```bash
kubectl get externalsecret -n phis
kubectl describe externalsecret <name> -n phis
```
Force an immediate re-sync of everything instead of waiting:
```bash
kubectl annotate externalsecret -n phis --all force-sync=$(date +%s) --overwrite
```
After a secret value actually changes, the pod using it still needs a
restart to pick up the new value — `kubectl rollout restart deployment/<name> -n phis`.

## Restoring MongoDB from a backup

Use this if data was corrupted or lost and you need to go back to a nightly
snapshot. **This overwrites current MongoDB data — confirm with whoever's
using the system before running it, and double check the backup file name
(the newest one) before restoring.**

1. List available backups (they live on `mongodb-backup-pvc`, one `.gz` file
   per night, mounted at `/backup` inside the CronJob's pod — we spin up a
   throwaway pod to browse it):
   ```bash
   kubectl run -it --rm backup-browser -n phis --restart=Never \
     --image=mongo:6.0 --overrides='{"spec":{"containers":[{"name":"backup-browser","image":"mongo:6.0","command":["sh"],"stdin":true,"tty":true,"volumeMounts":[{"name":"backup","mountPath":"/backup"}]}],"volumes":[{"name":"backup","persistentVolumeClaim":{"claimName":"mongodb-backup-pvc"}}]}}' \
     -- sh
   # inside the pod:
   ls -la /backup
   ```

2. From that same shell, restore the chosen file (replace the filename; this
   needs the Mongo root password — get it with
   `kubectl get secret mongodb-credentials -n phis -o jsonpath="{.data.root-password}" | base64 -d`
   run from a *separate* terminal, since you're inside the throwaway pod):
   ```bash
   mongorestore --uri="mongodb://root:<password>@mongodb.phis.svc.cluster.local:27017/opensilex?authSource=admin&directConnection=true" \
     --gzip --archive=/backup/<chosen-file>.gz --drop
   ```
   `--drop` replaces existing collections with the backup's contents — that's
   the "this overwrites current data" part above.

3. Exit the shell (pod auto-deletes because of `--rm`), then restart
   OpenSILEX so it picks up a clean connection:
   ```bash
   kubectl rollout restart deployment/opensilex -n phis
   ```

## Restoring GraphDB from a backup

Same idea, but GraphDB backups are RDF `.trig` files on `graphdb-backup-pvc`.

1. Browse backups:
   ```bash
   kubectl run -it --rm backup-browser -n phis --restart=Never \
     --image=curlimages/curl:8.7.1 --overrides='{"spec":{"containers":[{"name":"backup-browser","image":"curlimages/curl:8.7.1","command":["sh"],"stdin":true,"tty":true,"volumeMounts":[{"name":"backup","mountPath":"/backup"}]}],"volumes":[{"name":"backup","persistentVolumeClaim":{"claimName":"graphdb-backup-pvc"}}]}}' \
     -- sh
   ls -la /backup
   ```

2. Upload the chosen file into the `opensilex` repository (get the GraphDB
   admin password the same way as above, from the `graphdb-credentials`
   secret; this **adds/overwrites** the triples in the file — it does not
   first clear the repository, so for a true point-in-time restore you may
   need to clear the graph first via GraphDB's UI):
   ```bash
   curl -sf -u "admin:<password>" -X POST \
     -H "Content-Type: application/x-trig" \
     --data-binary @/backup/<chosen-file>.trig \
     http://graphdb.phis.svc.cluster.local:7200/repositories/opensilex/statements
   ```

## Restoring from a disk snapshot (whole-volume, last resort)

Disk snapshots (`disk-snapshot` CronJob, nightly, last 7 kept) capture the
entire MongoDB or GraphDB volume as-is — use this if the mongodump/RDF export
approach above isn't enough (e.g. the PVC itself is gone or corrupted, not
just the data in it).

1. List available snapshots:
   ```bash
   kubectl get volumesnapshot -n phis
   ```
2. Create a new PVC from a snapshot (this does **not** touch the original —
   it creates a separate, new volume you can inspect or swap in):
   ```bash
   kubectl apply -f - <<EOF
   apiVersion: v1
   kind: PersistentVolumeClaim
   metadata:
     name: restore-test
     namespace: phis
   spec:
     storageClassName: managed-csi
     dataSource:
       name: <snapshot-name>
       kind: VolumeSnapshot
       apiGroup: snapshot.storage.k8s.io
     accessModes: [ReadWriteOnce]
     resources:
       requests:
         storage: 50Gi
   EOF
   ```
3. Inspect it via a throwaway pod (same pattern as the backup-browsing steps
   above) before deciding whether to actually swap it in for the live PVC —
   swapping a StatefulSet/Deployment's PVC is a bigger, riskier operation;
   don't do it without a second pair of eyes.

## I need to intentionally delete a PVC

Kyverno blocks this in the `phis` namespace by default. To proceed on
purpose:
```bash
kubectl annotate pvc <name> -n phis phis.pheno.no/confirm-delete=true
kubectl delete pvc <name> -n phis
```
Per [CLAUDE.md](../CLAUDE.md), name the specific resource and get explicit
confirmation before doing this — the PV itself is `Retain`, so the underlying
disk survives even after the PVC is deleted, but reattaching it is a manual
Azure-level operation, not a quick undo.

## Test environment won't clean up / left something running

```bash
kubectl get namespace | grep phis-
kubectl delete namespace phis-<name>
```
Safe to do freely — test namespaces use `Delete`-reclaim PVCs by design (see
[DEPLOYMENT.md](../DEPLOYMENT.md#test-environments)), so this really does
throw away all data in that namespace, which is the point.

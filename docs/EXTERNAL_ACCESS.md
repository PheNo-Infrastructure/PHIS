# External Collaborator Access (Read-Only)

Covers the `external-collaborator-readonly` ServiceAccount defined in
[k8s/access/external-readonly.yaml](../k8s/access/external-readonly.yaml). It
gives someone outside the org **read-only** access to the `phis` namespace
only, without needing an Azure account, Azure AD invite, or `az` CLI at all —
just `kubectl` and a kubeconfig file.

## What they can and can't do

| Can | Can't |
|---|---|
| `get`/`list`/`watch` pods, deployments, services, configmaps, jobs, etc. in `phis` | See any other namespace |
| Read pod logs | Read Secrets (passwords, keys) |
| View events, resource status | Exec into a pod or port-forward |
| | Create, edit, or delete anything |
| | See cluster-scoped resources (nodes, StorageClasses, RBAC, CRDs) |

If they need more than this, extend the RoleBinding in
[external-readonly.yaml](../k8s/access/external-readonly.yaml) — don't hand
out a second, broader credential to work around the limit.

---

## Part 1 — What the admin does (granting access)

1. Push [k8s/access/external-readonly.yaml](../k8s/access/external-readonly.yaml)
   to the `k8s` branch (Flux creates the ServiceAccount + RoleBinding within
   ~1 min).
2. Mint a token (90 days here; re-run to reissue when it expires):
   ```powershell
   kubectl create token external-collaborator-readonly -n phis --duration=2160h
   ```
3. Build a standalone kubeconfig so they don't touch your Azure login:
   ```powershell
   $SERVER = kubectl config view --raw -o jsonpath='{.clusters[?(@.name=="phis-cluster")].cluster.server}'
   $CA     = kubectl config view --raw -o jsonpath='{.clusters[?(@.name=="phis-cluster")].cluster.certificate-authority-data}'
   $TOKEN  = kubectl create token external-collaborator-readonly -n phis --duration=2160h

   @"
   apiVersion: v1
   kind: Config
   clusters:
     - name: phis-cluster
       cluster:
         server: $SERVER
         certificate-authority-data: $CA
   contexts:
     - name: external-readonly
       context:
         cluster: phis-cluster
         namespace: phis
         user: external-collaborator-readonly
   current-context: external-readonly
   users:
     - name: external-collaborator-readonly
       user:
         token: $TOKEN
   "@ | Out-File -Encoding utf8 external-collaborator-kubeconfig.yaml
   ```
4. Send `external-collaborator-kubeconfig.yaml` to them over a **secure
   channel** (not email/Slack in plaintext) — anyone holding this file has
   the access it grants.
5. **Revoking access**: delete the ServiceAccount (instantly invalidates all
   its tokens):
   ```powershell
   kubectl delete serviceaccount external-collaborator-readonly -n phis
   ```
   To restore it later, just re-push the manifest and issue a fresh token.

---

## Part 2 — What the collaborator does (setup)

### 1. Install kubectl

Follow <https://kubernetes.io/docs/tasks/tools/> for your OS. Verify:
```bash
kubectl version --client
```

### 2. Save the kubeconfig file you were sent

Save it somewhere on disk, e.g. `~/.kube/phis-readonly.yaml`.

### 3. Point kubectl at it

Either set it for one terminal session:
```bash
export KUBECONFIG=~/.kube/phis-readonly.yaml      # macOS/Linux
$env:KUBECONFIG = "$HOME\.kube\phis-readonly.yaml" # PowerShell
```
or pass `--kubeconfig ~/.kube/phis-readonly.yaml` on every command below.

### 4. Test the connection

```bash
kubectl get pods -n phis
```
You should see a list of running pods (mongodb, graphdb, opensilex, etc.).
If you get a `Forbidden` or `Unauthorized` error, the token may have
expired — ask the admin to reissue it (step 2 in Part 1).

**Note:** the token has a fixed expiry (90 days from when it was issued).
When it lapses you'll start seeing auth errors — that's expected, just ask
for a new kubeconfig file.

---

## Common commands (read-only)

| What | Command |
|---|---|
| List all resources in the namespace | `kubectl get all -n phis` |
| List pods with status | `kubectl get pods -n phis` |
| Watch pods live (auto-refresh) | `kubectl get pods -n phis -w` |
| Describe a pod (events, config, why it's crashing) | `kubectl describe pod <pod-name> -n phis` |
| View logs from a pod | `kubectl logs <pod-name> -n phis` |
| Follow logs live | `kubectl logs -f <pod-name> -n phis` |
| Logs from a specific container in a multi-container pod | `kubectl logs <pod-name> -c <container-name> -n phis` |
| Previous container's logs (after a crash/restart) | `kubectl logs <pod-name> -n phis --previous` |
| Recent cluster events (sorted by time) | `kubectl get events -n phis --sort-by=.lastTimestamp` |
| List deployments/statefulsets/jobs | `kubectl get deployments,statefulsets,jobs -n phis` |
| View a resource's full YAML | `kubectl get pod <pod-name> -n phis -o yaml` |

You do not have permission to `exec`, `port-forward`, edit, or delete
anything — those commands will return a `Forbidden` error, which is
expected, not a bug.

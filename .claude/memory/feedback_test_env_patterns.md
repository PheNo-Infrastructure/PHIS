---
name: feedback-test-env-patterns
description: Gotchas discovered when building and running the PHIS test environment system (k8s/test/ + scripts/test-env.ps1)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d4697684-8787-4a1f-95b2-f6a353b04002
---

## email must be `enable: false` in test config

`simulateSending: true` alone is NOT enough. OpenSILEX's `EmailService.startup()` calls `testConnection()` regardless of `simulateSending`, which crashes the process if no SMTP server is reachable. Always set `enable: false` in `k8s/test/opensilex.yml`.

**Why:** Discovered when system install crashed with `MailerException: Was unable to connect to SMTP server` even with `simulateSending: true`.

**How to apply:** `k8s/test/opensilex.yml` already has `enable: false`. Never change it to `enable: true` unless a real SMTP server is wired up.

---

## Test CPU requests must be much lower than production

**Why:** The D4s_v3 node has 4 vCPU but only ~3860m allocatable. Production + test + system pods together push CPU *requests* to 97% even when actual usage is ~14%. The scheduler rejects new pods based on requests, not actual usage.

**How to apply:** `k8s/test/resource-patches.yaml` overrides CPU requests to 100m for all three workloads (MongoDB, GraphDB, OpenSILEX). Never remove this file or raise requests to production levels in test.

---

## Azure Disk limit on D4s_v3: max 8 managed-csi disks

Production uses 3 managed-csi disks, test uses 4 = 7 total. One slot remains. A second test environment would require 4 more disks (11 total) → scheduling failure.

**How to apply:** Maximum 1 test environment running at a time on the current node. If more are needed, the node must be resized or the cluster autoscaler enabled.

---

## GHCR pull secret: `gh auth token` may lack `read:packages` scope

`gh auth login` default scopes don't always include `read:packages`. If image pulls fail with 401, run:
```
gh auth refresh -s read:packages
```
Then re-run option 4 in `test-env.ps1` to regenerate the stored credentials.

---

## Recovering a test env with deleted secrets

If secrets are deleted from a running environment, get the existing passwords from running pod environment variables *before* recreating secrets — otherwise the new passwords won't match what's stored in the MongoDB/GraphDB data volumes:
```bash
kubectl exec mongodb-0 -n <ns> -- printenv MONGO_ROOT_PASSWORD
kubectl exec mongodb-0 -n <ns> -- printenv MONGO_APP_PASSWORD
kubectl exec -n <ns> deploy/graphdb -c graphdb -- printenv GDB_ADMIN_PASSWORD
MSYS_NO_PATHCONV=1 kubectl exec mongodb-0 -n <ns> -- cat /etc/mongodb/keyfile
```

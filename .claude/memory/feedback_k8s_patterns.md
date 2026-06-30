---
name: feedback-k8s-patterns
description: Learned patterns and preferences for the k8s deployment — what to do and avoid
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b41507dc-4c3e-4247-be2f-eae269885e06
---

## PheNo theme: skip for k8s

Don't implement the PheNo theme (Script 04) for the k8s deployment. User intentionally skips it.

**Why:** The Docker theme script was described as "not implemented that well to begin with." Not worth porting to k8s.

**How to apply:** If theme comes up in a k8s context, note it's intentionally omitted and move on.

## imagePullPolicy: Always on OpenSILEX Deployment

Always set `imagePullPolicy: Always` on the OpenSILEX container spec (already in place as of 2026-06-04).

**Why:** We rebuild images with the same tag (e.g., `1.5.0.2` rebuilt to fix Maven revision). Without `Always`, Kubernetes uses the cached image and the new push is silently ignored. Confirmed via `kubectl describe pod` — different SHA hashes proved the old vs new image.

**How to apply:** If the image tag changes, this is less critical (Kubernetes always pulls new tags). But since we reuse tags on patch rebuilds, `Always` is the safe default.

## All k8s Jobs need ttlSecondsAfterFinished: 86400

Every one-shot Job (`graphdb-init`, `opensilex-init`) must have `ttlSecondsAfterFinished: 86400`. (`mongodb-init` was removed — the StatefulSet handles replica set init internally.)

**Why:** Without it, completed Jobs remain as objects in the cluster. On cluster reset, FluxCD tries to re-create them and gets a conflict error.

**How to apply:** Any new Job added to `k8s/` should include this field in `spec:`.

## Internal curl calls to OpenSILEX must include Host header

Any pod that calls `http://opensilex:8666` internally (e.g., init jobs, health scripts) must include `-H "Host: phis.pheno.no"` on every request, or OpenSILEX returns 400 Bad Request.

**Why:** OpenSILEX validates the `Host` header against its configured `publicURI: "https://phis.pheno.no/"`. Internal K8s service DNS produces `Host: opensilex:8666`, which fails validation. Confirmed 2026-06-11 when `opensilex-init` was persistently failing despite correct credentials.

**How to apply:** All new Jobs or scripts that hit the OpenSILEX internal service must use `curl ... -H "Host: phis.pheno.no"`.

## kubectl image: use registry.k8s.io, not bitnami

For any job/cronjob needing `kubectl`, use `registry.k8s.io/kubectl:v1.33.0` — NOT `bitnami/kubectl:1.33`.

**Why:** Bitnami dropped versioned kubectl tags (only `latest` exists now). The snapshot cronjob was in `ImagePullBackOff` for 6 days because of this. `registry.k8s.io/kubectl` is the official Kubernetes project image with proper `v<major>.<minor>.<patch>` tags.

**How to apply:** Any new Job or CronJob that shells out to `kubectl` must use the `registry.k8s.io/kubectl:v<version>` image format.

## Patch files must be committed before triggering build

When adding or editing files in `tools/patches/`, always `git commit` + `git push` BEFORE triggering the GitHub Actions build workflow.

**Why:** GitHub Actions does `actions/checkout@v4` — it clones from GitHub. Untracked or uncommitted local files are invisible to the build. This caused patch 007 to be missing from the `1.5.0.6.9` image even though it was written locally. A new image version (`1.5.0.6.10`) had to be built after the patch was committed.

**How to apply:** Before clicking "Run workflow", verify `git status` is clean (or at minimum that patch files are staged + pushed).

## configMapGenerator for auto-rollout

The OpenSILEX ConfigMap uses Kustomize's `configMapGenerator` (not a hand-written ConfigMap resource). Source file is `k8s/opensilex/opensilex.yml`.

**Why:** Changing the ConfigMap without this pattern does NOT restart the pod — Kubernetes applies the new ConfigMap but keeps the old pod running with stale config. configMapGenerator appends a content hash to the name, which changes the Deployment spec on every content change, triggering an automatic rollout.

**How to apply:** If asked to edit the OpenSILEX config, edit `k8s/opensilex/opensilex.yml` — not a configmap.yaml (that file was deleted). The rollout happens automatically on push.

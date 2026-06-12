---
name: project-build-process
description: How the OpenSILEX custom image is built and deployed — workflow, versioning, and the full release loop
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Build workflow

GitHub Actions: `.github/workflows/build-opensilex.yml`

**Trigger**: `workflow_dispatch` — must be triggered manually (GitHub UI or `gh workflow run`). Not automatic on push.

```bash
gh workflow run build-opensilex.yml --repo lversen/PHIS \
  --field image_version=1.5.0.X \
  --field opensilex_tag=1.5.0
```

**What it does:**
1. Clones `https://github.com/OpenSILEX/opensilex-docker-compose` as build context
2. Copies `tools/patches/` into the build context
3. Applies every `*.patch` file in `tools/patches/` via `patch -p1` (sorted order — 002, 003, 004, ...)
4. Builds with Maven (`mvn clean install -DskipTests -Drevision=${IMAGE_VERSION}`)
5. Pushes `ghcr.io/lversen/opensilex-phis:<image_version>` and `:latest`

**Patches live in**: `tools/patches/*.patch` (git diff format, applied with `patch -p1` against OpenSILEX source at `opensilex_tag`)

## Version numbering

`<upstream_tag>.<patch_number>` — increment the last digit for each rebuild:

| Image | Upstream tag | What changed |
|-------|-------------|--------------|
| 1.5.0.1 | 1.5.0 | initial |
| 1.5.0.2 | 1.5.0 | patch 002: Feide auto-group assignment |
| 1.5.0.3 | 1.5.0 | patch 003: password-reset token + URL fix |
| 1.5.0.4 | 1.5.0 | patch 004: SSO login buttons (UX) |

## Full release loop (after writing a new patch)

1. Add patch as `tools/patches/00N-description.patch`
2. Dry-run: `patch --dry-run -p1 -d <src> < patch` (see [[feedback-k8s-patterns]] for test setup)
3. Commit + push patch to `k8s` branch
4. Trigger build: `gh workflow run build-opensilex.yml --repo lversen/PHIS --field image_version=1.5.0.N --field opensilex_tag=1.5.0`
5. Wait for build to succeed (GitHub Actions, ~15-20 min due to Maven)
6. Update `k8s/opensilex/deployment.yaml` image tag to `1.5.0.N`
7. Commit + push → Flux reconciles in ~1 min → pod rolls out

## Build time

Maven build takes ~15–20 minutes. There is a GHA cache (`cache-from: type=gha`) that helps on subsequent runs.

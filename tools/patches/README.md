# OpenSILEX Patches

Patches applied to OpenSILEX source during the GitHub Actions image build (`build-opensilex.yml`).

## Active Patches

### 002-openid-auto-group-assignment.patch

Automatically assigns new Feide/OpenID users to the "Users" group on first login.

**Root cause**: `AccountDAO` did not assign users to any group after OpenID authentication, leaving new users with zero permissions and an `UnsupportedOperationException` on the immutable list returned by the OpenID provider.

## Build Files

| File | Purpose |
|------|---------|
| `opensilex-build-step.docker` | Dockerfile — clones upstream OpenSILEX, applies patches, runs Maven build |
| `opensilex-runtime-patch.docker` | Runtime image — copies built artifacts into the final image |
| `feide-openid-config.yml` | OpenID config template injected during build |
| `nginx-opensilex.conf` | nginx reverse proxy config for HTTPS |

## Adding a New Patch

1. Create `NNN-description.patch` in this directory
2. Reference it in `opensilex-build-step.docker`
3. Trigger `build-opensilex.yml` with a new `image_version`

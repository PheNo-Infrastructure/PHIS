# OpenSILEX Patches

Patches applied to OpenSILEX source during the GitHub Actions image build (`build-opensilex.yml`).

## Active Patches

### 008-batch-scientific-objects-import.patch

Adds `POST /core/scientific_objects/json_import` — a JSON batch endpoint for creating many scientific objects in one request.

**Motivation**: the existing `POST /core/scientific_objects` endpoint is called once per object. At 8000+ SOs per import, each round-trip takes ~15-17s under concurrent load, making large imports impractically slow. This endpoint accepts a list of `ScientificObjectCreationDTO`, generates URIs for all models upfront, batch-inserts via `createWithNoValidations`, copies to global graph once, and updates experiment species once — turning N HTTP calls into 1.

**Files**: `ScientificObjectAPI.java` (+2 imports, +1 endpoint)

### 003-fix-reset-password-token.patch

Fixes two bugs in the password-reset flow (shipped in image `1.5.0.3`):

1. **Token expiry** (`AuthenticationService.java`): `Thread.sleep(getRenewTokenExpiresInSec())` passed seconds to a method that takes milliseconds. Tokens expired in ~86 seconds instead of 24 hours. Fixed: `* 1000L`.

2. **Reset URL construction** (`AuthenticationAPI.java`): `Paths.get()` normalizes `https://` to `https:/` (filesystem path logic). `URLEncoder.encode()` encoded `:` to `%3A` in the token. Fixed: plain string concatenation.

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

# OpenSILEX Patches

Patches applied to OpenSILEX source during the GitHub Actions image build (`build-opensilex.yml`).

## Active Patches

The build applies patches in filename order — `002` → `011` — via a shell glob
in `opensilex-build-step.docker` (`for patch in /patches/*.patch`). Several
patches edit the same file (`AuthenticationAPI.java` especially), and later
patches assume earlier ones already applied, so **don't rename or renumber
existing patches** — a gap or reorder will make a later diff fail to apply.

Listed below newest-first (011 → 002) for readability; that is *not* the
apply order.

### 011-fix-organization-search-duplicate-models.patch

`GET /rest/core/organisations` returned HTTP 400/500 for every **non-admin**
as soon as any organisation had a group attached (`os-sec:hasGroup`).

**Cause**: `OrganizationDAO.searchWithoutFilters` adds `addOrganizationAccessClause`
for non-admins — a `{ group-hierarchy branch } UNION { no-group branch }`. An
organisation reachable through a group in its `hasPart` hierarchy can be emitted
on multiple non-contiguous rows, yielding duplicate `OrganizationModel`s for one
URI. `SPARQLListFetcher.updateModels()` throws *"Multiple results with the same
URI ... at index N"*, and the `userOrganizationCache.put(... toMap ...)` right
after would throw on the duplicate key. Admins skip the access clause entirely.

**Fix**: dedupe `models` by URI (first wins) before the list fetcher. Upstream
bug, unfixed on `develop` 2026-09-02.

**Files**: `OrganizationDAO.java` (+12 lines in `searchWithoutFilters`)

### 010-fix-profile-getbyuseruri-null-guard.patch

Guards `ProfileDAO.getByUserURI` against a null URI.

**Cause**: `/rest/vuejs/user_config` is not `@ApiProtected`; a request without a
valid token resolves to `AccountModel.getAnonymous()` (URI = null). For a
non-admin the menu build calls `AccountDAO.getCredentialList(user.getUri())` →
`ProfileDAO.getByUserURI(null)` → `SPARQLDeserializers.nodeURI(null)` returns
null → Jena renders the triple object as the bare token `ANY` → GraphDB
`MALFORMED QUERY ... after prefix "ANY"`. The exception is swallowed so the menu
silently comes back empty. Every opensilex restart invalidates all JWTs (fresh
RSA keypair, in-memory session registry), so stale-token non-admins hit this on
any page.

**Fix**: `if (uri == null) return Collections.emptyList();`. Upstream bug,
unfixed on `develop` 2026-09-02.

**Files**: `ProfileDAO.java` (+3 lines in `getByUserURI`)

### 009-fix-empty-germplasm-attr-migration.patch

Guards the 1.5.1 `GermplasmAttributeUpdateRightsMigration` against an empty Mongo
`bulkWrite`. When no germplasm has custom attributes the ops list is empty and
the Mongo driver throws *"state should be: writes is not an empty list"*,
aborting the migration instead of completing as a no-op. Upstream bug, present in
1.5.4, unfixed on `develop`.

**Files**: `GermplasmAttributeUpdateRightsMigration.java` (+4 lines)

### 008-batch-scientific-objects-import.patch

Adds `POST /core/scientific_objects/json_import` — a JSON batch endpoint for creating many scientific objects in one request.

**Motivation**: the existing `POST /core/scientific_objects` endpoint is called once per object. At 8000+ SOs per import, each round-trip takes ~15-17s under concurrent load, making large imports impractically slow. This endpoint accepts a list of `ScientificObjectCreationDTO`, generates URIs for all models upfront, batch-inserts via `createWithNoValidations`, copies to global graph once, and updates experiment species once — turning N HTTP calls into 1.

**Files**: `ScientificObjectAPI.java` (+2 imports, +1 endpoint)

### 007-fix-group-user-profile-cleanup.patch

Fixes an orphaned-record bug in group/user management.

**Root cause**: `GroupDAO.update()` overwrote a group's member list in SPARQL but never deleted the old `GroupUserProfile` records for members who were removed — they became invisible orphans that still existed in the triplestore. Similarly, `AccountDAO.delete()` didn't clean up an account's `GroupUserProfile` records before deleting the account, which could leave the delete blocked (`URI is linked with other resources`) or leave orphans behind.

**Fix**: `GroupDAO.update()` now diffs the old vs. new `GroupUserProfile` URIs and deletes the ones removed. `AccountDAO.delete()` now calls a new `cleanOrphanedGroupUserProfiles()` step first, which removes any `GroupUserProfile` no longer referenced by a parent group.

**Files**: `GroupDAO.java`, `AccountDAO.java`

**Symptom if missing**: deleting a user account from the OpenSILEX UI can fail with a "linked with other resources" error, or removing someone from a group doesn't fully take effect.

### 006-invite-system.patch

Adds an admin-only "invite a researcher by email" flow, separate from open self-registration (005).

**How it works**:
1. Admin calls `POST /security/invite` with an email — generates a one-time token (kept **in-memory only**, cleared on pod restart) and emails an accept link.
2. Invitee visits `/app/accept-invite/:token` → `GET /security/accept-invite` marks that email as a "pending researcher".
3. When that person actually logs in via Feide, `SecurityAutoAssignmentService` sees they're a pending researcher and assigns them to the **Researchers** group / **Researcher profile** instead of the default **Users** group.

**Files**: `InviteService.java` (new), `InviteDTO.java` (new), `SecurityAutoAssignmentService.java` (new — also used by patch 002/005 for default-group assignment), `AuthenticationAPI.java`, `invite.mustache` (new email template), `AcceptInvite.vue` (new frontend page)

**Known limitation**: invite tokens live in a Java in-memory map (`ConcurrentHashMap`), not the database. A pod restart (rollout restart, crash, redeploy) silently invalidates all pending invites — the admin has to resend them. Fine for low volume; would need a DB-backed store to survive restarts.

### 005-self-registration.patch

Adds public self-service account registration (as opposed to admin-issued invites in 006).

**How it works**:
1. `POST /security/register` (public) creates a disabled account and emails a confirmation link.
2. User clicks the link → `GET /security/confirm-registration?token=...` enables the account and auto-assigns it to the default **Users** group via `SecurityAutoAssignmentService`.
3. Frontend adds `/app/register` and `/app/confirm-registration/:token` pages, plus a "Don't have an account? Register here" link on the login screen.

**Files**: `AccountRegisterDTO.java` (new), `AuthenticationAPI.java`, `register-confirmation.mustache` (new email template), `Register.vue` (new), `ConfirmRegistration.vue` (new), `opensilex.front.yml` (new routes), `DefaultLoginComponent.vue`

**Requires**: `email.enable: true` in `opensilex.yml` — registration and invites both return HTTP 503 if the email service isn't configured. (Test environments deliberately run with email disabled — see [CLAUDE.md](../../CLAUDE.md) — so registration/invite links won't work there.)

### 004-default-feide-login.patch

UI-only change: when Feide (OpenID SSO) is configured, show the SSO button(s) directly on the login screen instead of behind a "select login method" dropdown. Password login stays available underneath.

**Files**: `DefaultLoginComponent.vue`

### 003-fix-reset-password-token.patch

Fixes two bugs in the password-reset flow (shipped in image `1.5.0.3`):

1. **Token expiry** (`AuthenticationService.java`): `Thread.sleep(getRenewTokenExpiresInSec())` passed seconds to a method that takes milliseconds. Tokens expired in ~86 seconds instead of 24 hours. Fixed: `* 1000L`.

2. **Reset URL construction** (`AuthenticationAPI.java`): `Paths.get()` normalizes `https://` to `https:/` (filesystem path logic). `URLEncoder.encode()` encoded `:` to `%3A` in the token. Fixed: plain string concatenation.

### 002-openid-auto-group-assignment.patch

Automatically assigns new password/OpenID/SAML users to a default group on first login, instead of leaving them with zero permissions.

**Root cause**: OpenSILEX didn't assign any group to a newly-created account after authentication.

**Fix**: calls `SecurityAutoAssignmentService.assignToDefaultGroupIfNew()` from all three login paths in `AuthenticationAPI.java` (password, OpenID, SAML). Note: `SecurityAutoAssignmentService` itself is defined later in patch **006** — that's fine, all patches apply before the Maven build compiles anything — but it means 002 and 006 are logically a pair even though they're numbered apart.

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

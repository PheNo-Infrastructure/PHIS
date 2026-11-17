# phis-extensions: moving our OpenSILEX patches into a module

Date: 2026-11-17. Status: draft for the owner's approval. Nothing here is built.

## Intent

PHIS runs a patched OpenSILEX image (`opensilex-phis:1.5.4.13` in production). The patch
stack in `tools/patches/` (002 to 015) is applied to the upstream source at build time.
The OpenSILEX developers asked us to review the patches and, where possible, ship features
as modules, so that our work does not collide with theirs and can be shared. Every upstream
upgrade also costs a rebase of every patch that touches shared files
(`AuthenticationAPI.java` is touched by four of them).

This design moves the patches that are features into one module, `phis-extensions`, and
leaves the bug-fix patches where they are for now.

## Ground truth

The current patched image works in production. That is the reference for everything below.
A migrated feature is correct when it behaves exactly as the patch does today, not when it
matches some idealised design. Parity is checked against `phis-test` (a copy of prod data),
never against prod.

## Goals

- One module jar, `phis-extensions`, in this repo under `tools/modules/phis-extensions/`,
  self-contained (own `pom.xml`, no references to the rest of the repo) so it can later be
  moved to its own repository without edits.
- The image build compiles the module against the upstream tag being built and ships the
  jar in `bin/modules/`.
- Each migrated feature is removed from `tools/patches/` in the same change that adds it to
  the module, so a feature is never in both places.
- No behaviour change visible to users or to the Graph Explorer portal.

## Non-goals

- No upstream contribution work. Fork, issues, pull requests and emails to the OpenSILEX
  team are a separate, optional track that nothing here waits for.
- The bug-fix patches (007, 009 to 015) are not module material; a module cannot fix core code.
  009 is dropped separately (upstream 1.5.6 already has the same guard).
- No upgrade to 1.5.9 in this work. The module must build against both `1.5.4` (today) and
  `1.5.9` (next), so the upgrade stays a separate step.
- No URI editor, no access-levels work. A URI editor may become a later module of the same jar.

## Anti-goals (a failure even if it technically works)

- A first login of a new user ends with no permissions (see risk 1).
- The `/core/scientific_objects/json_import` URL changes silently and the import path breaks.
- The module and a patch both define the same behaviour at once.
- The image build becomes flaky or needs hand steps for the module.

## What is migrated, in order

| Order | Patch | Becomes | Notes |
|---|---|---|---|
| 1 | 008 batch scientific-object import | `APIExtension` endpoint in the module | Pilot. Smallest, new endpoint only. |
| 2 | 002 auto-group on first login | `LoginExtension` in the module | Hardest correctness case, see risk 1. Removes our edits to `AuthenticationAPI`. |
| dropped | 005 self-registration, 006 invites | Deleted 2026-11-17 (commit e1489cf on `chore/patches-audit`), not migrated | No recorded use. The front-hook risk (3) no longer applies. `SecurityAutoAssignmentService` now lives in 002 without the invite branch. |
| later | 004 Feide button, PheNo theme | Front or theme module | Not part of this design. Revisit after the above. |

Order matters: a patch is removed from `tools/patches/` only after its module replacement
passes the parity checks below on `phis-test`.

## Module shape (from upstream's `how-to/modules.md`, checked at 1.5.9)

- Directory with a `pom.xml` whose parent is the OpenSILEX parent, and a class
  `PhisExtensionsModule extends OpenSilexModule implements APIExtension, LoginExtension`.
- `APIExtension` adds REST resources and DI bindings. `LoginExtension.login(user, tokenBuilder)`
  runs on every login, called from `AuthenticationService.generateToken`.
- Module files carry the OpenSILEX licence header (AGPL v3).

## Build wiring (decided approach, details left to the builder)

Today `build-opensilex.yml` clones `opensilex-docker-compose` into `build-context`, copies
`tools/patches` in, and builds `tools/patches/opensilex-build-step.docker`, which clones
upstream, applies patches and runs `mvn clean install`. The compose repo already has a
`modules/` folder that the Dockerfile copies into `bin/modules`.

Approach: copy `tools/modules` into the build context the same way patches are copied; in
the Dockerfile, after the upstream `mvn install`, build the module jar with
`mvn -f <module>/pom.xml package` (upstream artifacts are already in the local Maven repo),
and copy the jar into `/built-release/modules/`. This avoids editing upstream's root `pom.xml`
(upstream's docs say to add a module there, which would need a fragile `sed`).

## Acceptance: parity checks on phis-test

Each migrated feature is checked on `phis-test` with the image that contains the module and
no longer contains the patch:

- 008: `POST /core/scientific_objects/json_import` with a small list returns 201 and the
  same URIs as before; the experiment's species are updated; an unknown experiment returns 404;
  an empty list returns an empty 201. The TraitFinder import path of the Graph Explorer
  still works end to end.
- 002: a new password user, a new OpenID user and a new SAML user (SAML if it can be tested)
  each end their first login in the default group, and the first login's token already carries
  that group's credentials. An invited researcher lands in Researchers.
- 005 and 006: register, confirm, invite and accept flows work with email enabled (the
  existing 503 behaviour when email is disabled is unchanged). In tests the Feide login
  button and the "Register here" link still render.

## Risks

1. **First-login credentials (002).** Today the patch assigns the group before
   `accountDAO.getCredentialList(...)` is evaluated, so the first token already has the new
   permissions. A `LoginExtension` hook runs inside `generateToken`, after the credentials list
   has been passed in. The hook may need to override the credentials claim on `tokenBuilder`.
   Whether a second `withClaim` replaces the first, and whether all three login paths reach
   `generateToken`, is not verified. If the hook cannot reproduce today's behaviour, 002 stays
   a patch and 005/006 follow it.
2. **Endpoint path (008).** The current URL is `/core/scientific_objects/json_import`, a method
   on upstream's `ScientificObjectAPI`. A module resource with the same root path may conflict
   or merge in Jersey. Unverified. If it cannot keep the URL, the portal's import call changes
   with it, in the same release.
3. **Front hook.** No longer a risk for this design: 005 and 006 (the only patches that needed
   Vue pages and routes) were dropped. It returns only if 004 (Feide button) is moved later.
4. **Two upstream versions.** The module compiles against 1.5.4 and must also compile against
   1.5.9; APIs it uses (`ScientificObjectLogic`, `ExperimentDAO`, `AccountDAO`) changed between
   them (patch 008 already needed a compile fix once in 1.5.4).

## Calls made while writing (the owner may overrule any of them)

- **Partial result is fine.** A feature migrates only if its parity checks pass. If risk 1, 2 or 3
  cannot be solved, that feature stays a patch and the work is still done for the others.
  Parity beats migration, because the current image works.
- **Spike first.** Before the 008 pilot, run one throwaway spike that answers risks 1 to 3
  (hook ordering, same-path resource, front routes). The order in the table above is the
  order of migration after the spike, not before it.
- **The 008 URL is a hard constraint.** If a module resource cannot keep
  `/core/scientific_objects/json_import`, 008 stays a patch. No coordinated Graph Explorer change.
- **Dependent patches may be regenerated.** Removing 002, 005 or 006 can break the context lines of
  the other patches that touch `AuthenticationAPI.java`; regenerate those with the `patch-creator`
  skill and re-run the full stack apply against both tags. Never renumber.
- **Two tags are verified by running the build twice** (the workflow already takes `opensilex_tag`),
  not by a CI matrix. One source tree; version-specific code only if an API actually differs.
- **SAML is not a gate.** Neither `k8s/opensilex/opensilex.yml` nor `k8s/test/opensilex.yml`
  configures SAML; only OpenID (Feide). 002's SAML path is checked by reading the code, not by login.
- **Module loading** is checked by the first spike: the Dockerfile's final stage copies
  `/built-release/*` into `bin/`, so a jar in `/built-release/modules/` lands in `bin/modules/`;
  whether the runtime config must also list the module is unverified. A config change under
  `k8s/opensilex/` would need the owner's confirmation.

## Left to the builder

- Package names, artifact id, version scheme, the exact Maven setup (parent, dependency scope).
- How the Dockerfile and workflow copy and build the module, within the approach above.
- Whether to use a spike first to answer risks 1 to 3 before committing to the order above.
- Test structure inside the module (unit tests where cheap; the parity checks above are the
  acceptance bar).

## Constraints

- Never touch production to test. Use `phis-test` (see `CLAUDE.md`), one throwaway resource
  per attempt, never PUT a node that has an `address`.
- A new image tag per build; never reuse a tag. Patches are applied in filename order and must
  not be renumbered.
- Committing and pushing is the owner's call; `main` is production.

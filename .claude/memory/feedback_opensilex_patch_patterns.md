---
name: feedback-opensilex-patch-patterns
description: Patterns learned from patching OpenSILEX — DTO annotations, auth, account enable flag, swagger-codegen quirks
metadata:
  node_type: memory
  type: feedback
  originSessionId: f55fe2a2-c56a-43f8-9964-d80ddca06b31
---

## Always add `@ApiModel` to new DTOs

Any new DTO class used as a JAX-RS body parameter must be annotated with `@ApiModel("ClassName")`.

**Why:** swagger-codegen 2.x (used by OpenSILEX) throws a `NullPointerException` on `RefProperty.get$ref()` when processing body parameters whose DTO class isn't explicitly registered. The NPE is caught per-operation but causes TypeScript model files (`geoJsonObject.ts`, `namedResourceDTO.ts`, etc.) to be skipped, failing the yarn build. The bug surfaced only on cache-miss builds because GHA Docker layer cache masked it for prior runs.

**How to apply:** Every new `*DTO.java` introduced in a patch: add `import io.swagger.annotations.ApiModel;` and `@ApiModel("MyDTO")` above the class declaration.

---

## Do not use `@Required` on DTO fields

Use only `@ApiModelProperty(value = "...", required = true)` for required fields in new DTOs. Do not add `@Required` (from `org.opensilex.server.rest.validation.Required`).

**Why:** The custom `@Required` annotation combined with `@ApiModelProperty(required = true)` triggers the swagger-codegen RefProperty NPE described above. `@ApiModelProperty(required = true)` alone is sufficient for both Swagger spec and runtime validation.

**How to apply:** When writing or reviewing new DTO classes in patches, check for `@Required` and replace with just `@ApiModelProperty(required = true)`.

---

## OpenSILEX accounts with `enable=false` are completely unusable

Accounts created with `enable=false` cannot log in regardless of password. Even when an admin changes their password via the UI, the `enable` flag stays false and login still fails.

**Why:** The admin password-change endpoint preserves all fields including `enable`. There's no visible "Enable account" toggle in the admin flow when editing. Users have no way to self-recover.

**How to apply:** In the self-registration flow (and any future automated account creation), always create accounts with `enable=true`. Existing disabled accounts must be explicitly enabled via `AccountDAO.update(..., true, ...)` or through the admin UI account edit form.

---

## `$opensilex.getUser()` returns truthy when unauthenticated

Do not use `$opensilex.getUser()` as an auth gate in Vue components. It returns a non-null object even when no user is logged in.

**Why:** Attempted to add a route guard in `Register.vue` that redirected to `/home` if `getUser()` was truthy. This redirected ALL users (logged in or not) away from the register page.

**How to apply:** Don't add auth guards to public routes using `$opensilex.getUser()`. If a logged-in redirect is needed, investigate the actual Vuex store state (`this.$store.state.user`) or a token check rather than the `$opensilex` plugin method.

---

## GHA Docker layer cache: `COPY patches/` invalidates all Maven layers

Any change to any file in `tools/patches/` (including Vue content inside `.patch` files) invalidates the Docker cache for `COPY patches/ /patches/` and all subsequent layers — including the Maven build and swagger codegen steps.

**Why:** This means bugs that existed in prior builds but were masked by cache hit will surface after any patch change. Specifically, the swagger-codegen NPE only manifested on cache-miss builds.

**How to apply:** When a build fails after a minor patch change with errors that seem unrelated to the change (e.g., TypeScript modules not found), suspect a previously-cached layer is now running fresh and exposing a pre-existing bug.

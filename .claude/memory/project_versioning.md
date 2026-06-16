---
name: project-versioning
description: Image tag versioning scheme — patch-relative with sub-versions for fix iterations
metadata: 
  node_type: memory
  type: project
  originSessionId: f55fe2a2-c56a-43f8-9964-d80ddca06b31
---

Image tag convention: `1.5.0.<patch>` for the first build of a given patch set, `1.5.0.<patch>.<iter>` for fix iterations on the same patch.

- `1.5.0.5` = build with patch 005 (self-registration)
- `1.5.0.5.1` = first fix to patch 005 (e.g., service ID typo)
- `1.5.0.6` = first build once patch 006 lands

**Why:** Keeps the tag semantically tied to which major patch set is active; fix iterations don't look like a new feature.

**How to apply:** When re-building to fix a bug in patch N (not adding patch N+1), use `1.5.0.N.M` not `1.5.0.(N+1)`. Workflow dispatch `image_version` field accepts dotted strings; Maven `${revision}` also accepts them.

Patch 005 fix history (all on self-registration):
- `1.5.0.5` = initial build (broken — loadService used `/` not `.` separator)
- `1.5.0.5.1` = fixed service ID (`opensilex-security.AuthenticationService`) — deployed 2026-06-15
- `1.5.0.5.2` = enabled accounts immediately + added Users group assignment (had broken route guard bug)
- `1.5.0.5.3` = removed broken route guard; fixed swagger-codegen NPE via `@ApiModel` on AccountRegisterDTO — **current production**

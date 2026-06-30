---
name: project-opensilex-init
description: opensilex-init job creates Default profile and Users group on first deploy — Default profile has no credentials
metadata: 
  node_type: memory
  type: project
  originSessionId: 0881ac5e-5b43-4888-ad15-189978638d93
---

The `opensilex-init` Job (prod: `k8s/opensilex-init/job.yaml`, test: `k8s/test/opensilex-init-job.yaml`) runs once after first deployment to seed:

1. **Default profile** — created with `credentials: []` (no permissions)
2. **Users group** — Feide/OpenID users are auto-assigned here by `SecurityAutoAssignmentService` on first login

**Known limitation:** "Default profile" is created with no credentials, so auto-assigned Feide users land in the group but can't do anything. After each new deployment, manually grant permissions via Admin UI → Security → Profiles → Default profile.

**Future improvement:** Query `GET /rest/security/credentials` to get all valid credential URIs, then include the desired subset in the profile creation POST body in the init job. This would eliminate the manual step entirely.

**Why:** The credentials list was left empty because the full set of URIs wasn't known at implementation time and it varies by OpenSILEX version.

**Test service port:** Test init job uses `http://opensilex:80` (test service exposes port 80). Prod job uses `http://opensilex:8666` (prod service exposes 8666 directly). Don't make them the same.

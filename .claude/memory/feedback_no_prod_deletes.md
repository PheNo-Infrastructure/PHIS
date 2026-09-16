---
name: feedback_no_prod_deletes
description: Never call delete operations on the prod PHIS instance without mapping the cascade first
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ce94d7fb-dd64-4ff1-bac8-51cfd8ce6a6f
  modified: 2026-09-01T08:43:19.171Z
---

On 2026-09-01 I called `DELETE /rest/core/organisations/test` on prod to
"cleanly" remove a throwaway org, judging it low-risk. OpenSILEX's cascade
hard-deleted the shared `researchers` group and all 6 members' access.

**Why:** CLAUDE.md's entire top section is "Data Persistence (HIGHEST
PRIORITY) — treat any operation that touches storage as a potential data-loss
event, even if it looks routine." An API DELETE counts. OpenSILEX cascades are
opaque and wide (org delete -> group delete -> profile deletes -> hasGroup
sweep across 5 named graphs).

**How to apply:** Before ANY delete/PUT that removes data on prod PHIS
(REST API, SPARQL UPDATE, kubectl) — even a throwaway object I created
minutes ago:
1. Query what links TO the target (`?s ?p <target>`) and what the target
   links to, across all graphs.
2. State the cascade and recovery path.
3. Get explicit confirmation naming the resource.
Recreating a small object by hand (Sebastian recreated the group in the UI)
is safer than a cascade delete. When unsure, do the read-only version and let
the user act.

See [[project_opensilex_org_group_bugs]].

---
name: project_graphdb_wedge_incident
description: 2026-09-01 outage — OpenSILEX probes missed a GraphDB SPARQL wedge; hardening on branch harden/graphdb-wedge-recovery
metadata: 
  node_type: memory
  type: project
  originSessionId: ce94d7fb-dd64-4ff1-bac8-51cfd8ce6a6f
  modified: 2026-09-16T09:23:31.486Z
---

**2026-09-01 outages (x2) + org rename/delete hanging 100% of the time.**

**ROOT CAUSE (found via live repro, fixed in commit 49c8a42):** the GraphDB
nginx sidecar ([k8s/graphdb/nginx.conf](../../k8s/graphdb/nginx.conf)) used
`proxy_set_header Host $host` — nginx's `$host` strips the port. GraphDB builds
transaction `Location` URLs from the Host header, so it returned
`http://graphdb` (= port 80). Every write goes through an RDF4J HTTP
transaction; the client follows that Location for commit/rollback and connects
to `graphdb:80`. The `graphdb` Service only exposes 7200, so ClusterIP:80 is a
black hole — SYN dropped, not refused — so `sun.nio.ch.Net.connect0` hangs
FOREVER with no timeout, unkillable by thread interrupt. Plain SELECT/ASK
queries were unaffected (they use the configured `http://graphdb:7200` direct).
Repro: `curl -i -X POST http://graphdb:7200/repositories/opensilex/transactions`
from the opensilex pod → `Location: http://graphdb/...` (no port).
Fix: `$host` → `$http_host` (keeps `graphdb:7200`).

**Why it wasn't auto-caught:** OpenSILEX liveness/readiness hit
`/rest/core/system/info`, which does NOT touch SPARQL — it kept returning 200
so the pod was never restarted (48d uptime, 0 restarts).

**Recovery:** `kubectl rollout restart deployment/opensilex -n phis` (safe path,
no PVC touch). GraphDB/MongoDB not touched.

**Defense-in-depth (commit 33d1817, NOT the fix — the fix is 49c8a42 above):**
- opensilex deployment.yaml: readiness+liveness → `/rest/vuejs/config`
  (unauth, acquires SPARQL conn). Readiness fail ~45s, liveness restart ~4min.
  startupProbe stays on system/info.
- graphdb deployment.yaml: `-Dgraphdb.engine.query-timeout=60` in GDB_JAVA_OPTS.
  GraphDB pod recreated cleanly, repo + site healthy after.

**RESOLVED 2026-09-16:** external uptime alerting added. Discovered the
cluster already had a kube-prometheus-stack (Prometheus/Grafana/Alertmanager,
`k8s/monitoring/install/`) deployed via Flux — Azure App Insights was NOT
needed, just wiring what existed. Alertmanager's only receiver was `"null"`
(no real notification), and no ServiceMonitor/Probe actually checked the
live app (only Kubernetes-internal metrics). Added:
- `blackbox-helmrelease.yaml` — prometheus-blackbox-exporter chart.
- `phis-availability-probe.yaml` — Probe CR hitting
  `https://phis.pheno.no/rest/vuejs/config` every 1m (same unauth-but-
  SPARQL-touching endpoint recommended above — catches the GraphDB-wedge
  class of outage, not just simple down).
- `phis-availability-alertrule.yaml` — `PhisAvailabilityDown` alert, fires
  after 2m of failed probes.
- `helmrelease.yaml` — Alertmanager config routes that alert to email via
  the same Azure Communication Services SMTP relay OpenSILEX itself uses
  (`smtp.azurecomm.net`, `phis-smtp-user`).
- `smtp-externalsecret.yaml` — the SMTP password had to be pulled into a
  **monitoring-namespace** copy of the secret (`alertmanager-smtp-credentials`)
  because `opensilex-credentials` lives in `phis` and secrets can't be
  mounted cross-namespace — first attempt referencing the phis-namespace
  secret directly left Alertmanager stuck at `Init:0/1` (`FailedMount`).
  Verified end-to-end: `probe_success{job="phis-availability"}` = 1,
  Alertmanager pod 2/2 Running with the new config loaded cleanly.
Alerts go to sebastian.t.iversen@uit.no. RDF4J pool still has no acquisition
timeout (would need an OpenSILEX code change) — this catches an outage
faster, it doesn't prevent the underlying wedge class.

See [[project_k8s_deployment]], [[project_k8s_architecture]].

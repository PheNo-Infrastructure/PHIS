---
name: GraphDB Unified Deployment - Lessons Learned
description: Key fixes made during unification of OpenSILEX + GraphDB deployment scripts, with root causes
type: project
originSessionId: 4dca06e9-b910-4f35-bdbc-db2aceba21a0
---
## Unified script: 01-deploy-opensilex-graphdb.ps1

Replaces the old 01-deploy-opensilex.ps1 + 02-migrate-to-graphdb.ps1. GraphDB is now mandatory (not optional).

**Why:** Eliminating RDF4J due to parser bugs (EOFException, JSON parse errors) on datasets >700K triples.

**How to apply:** This script is the standard deployment path. All issues below are fixed in the script.

---

## Fixes Required (in order of discovery)

### 1. GraphDB volumes in docker-compose.yml
RDF4J only declares 2 volumes (`data`, `logs`). GraphDB needs 3 (`data`, `logs`, `work`).
The `persist_graphdb_work` volume was never added because `grep` found it in the service mount section and skipped the volumes section. Fix: `grep -q '^  persist_graphdb_work:'` (anchored pattern) then `sed -i '/^  persist_graphdb_logs:/a\  persist_graphdb_work:'`.

### 2. OpenSILEX SPARQL config path
Wrong path: `sparql.rdf4j.serverURI` — has no effect.
Correct path: `ontologies.sparql.config.serverURI` (matches opensilex-template-custom.yml).
**Must also include `repository: opensilex-docker-db`** alongside serverURI — YAML map replacement wipes the entire config block, losing the repository key and falling back to JAR default `opensilex`.

### 3. GraphDB repository creation — wrong type for 10.x
GraphDB 10.x changed repository types from 9.x:
- `graphdb:FreeSailRepository` → `graphdb:SailRepository`
- `graphdb:FreeSail` → `graphdb:Sail`
- `owlim:` prefix → full URI `<http://www.ontotext.com/config/graphdb#...>`

### 4. GraphDB repository creation — used docker compose without --env-file
`docker compose ps -q graphdb` without `--env-file` returns nothing (all variables blank).
Fix: curl directly to `localhost:7200` (GraphDB's exposed host port) instead of using docker exec.

### 5. HAProxy crashes — still references rdf4j backend
`haproxy.cfg` had `backend rdf4jserver` pointing to `rdf4j:8080`. GraphDB is accessed directly by OpenSILEX (not proxied through HAProxy), so these lines must be removed before Docker build.
Fix: add sed commands in Step 4 to strip the rdf4j ACL, routing rule, and backend block from haproxy.cfg.

---

## Verified Working
- Device creation works on GraphDB (the key test that failed on RDF4J with large datasets)
- Sandbox server: 108.143.24.11

#!/bin/sh
# One-off: delete orphaned GroupUserProfile nodes from prod GraphDB set/group graph.
# These have no parent group (?g os-sec:hasUserProfile ?gup) and are cascade/churn
# residue that breaks the group-edit UI (and suspected in the non-admin org-list 400).
# Backup taken first: /backup/20260902-0720.trig  (graphdb-backup-pvc).
# Run inside the opensilex pod; pass the GraphDB admin password as $1.
set -e
GDBPW="$1"
B=http://graphdb:7200/repositories/opensilex

echo "=== BEFORE ==="
curl -s -G "$B" --data-urlencode 'query=PREFIX os-sec: <http://www.opensilex.org/security#>
SELECT (COUNT(DISTINCT ?gup) AS ?totalGUP) WHERE { GRAPH ?g { ?gup a os-sec:GroupUserProfile } }' -H 'Accept: text/csv'

echo "=== DELETE ==="
curl -s -w 'HTTP %{http_code}\n' -u "admin:$GDBPW" \
  -X POST "$B/statements" \
  --data-urlencode 'update=PREFIX os-sec: <http://www.opensilex.org/security#>
DELETE { GRAPH <https://phis.pheno.no/set/group> { ?gup ?p ?o } }
WHERE {
  GRAPH <https://phis.pheno.no/set/group> { ?gup a os-sec:GroupUserProfile . ?gup ?p ?o . }
  FILTER NOT EXISTS { GRAPH <https://phis.pheno.no/set/group> { ?g os-sec:hasUserProfile ?gup } }
}'

echo "=== AFTER (expect totalGUP 8) ==="
curl -s -G "$B" --data-urlencode 'query=PREFIX os-sec: <http://www.opensilex.org/security#>
SELECT (COUNT(DISTINCT ?gup) AS ?totalGUP) WHERE { GRAPH ?g { ?gup a os-sec:GroupUserProfile } }' -H 'Accept: text/csv'

echo "=== set/group triples (expect 116 - 64 = 52) ==="
curl -s -G "$B" --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { GRAPH <https://phis.pheno.no/set/group> { ?s ?p ?o } }' -H 'Accept: text/csv'

echo "=== researchers members (expect 7, unchanged) ==="
curl -s -G "$B" --data-urlencode 'query=PREFIX os-sec: <http://www.opensilex.org/security#>
SELECT ?user (SAMPLE(?profile) AS ?prof) WHERE {
  GRAPH ?g { <https://phis.pheno.no/id/group/researchers> os-sec:hasUserProfile ?gup .
             ?gup os-sec:hasUser ?user OPTIONAL { ?gup os-sec:hasProfile ?profile } }
} GROUP BY ?user' -H 'Accept: text/csv'

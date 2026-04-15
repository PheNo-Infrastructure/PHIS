#!/bin/bash
# Test querying OWL restrictions for SensingDevice (mimics what DeviceDAO does)

QUERY='
PREFIX oeso: <http://www.opensilex.org/vocabulary/oeso#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT * WHERE {
  ?classURI rdfs:subClassOf ?restriction .
  <http://www.opensilex.org/vocabulary/oeso#SensingDevice> rdfs:subClassOf* ?classURI .
  ?restriction a owl:Restriction .
} LIMIT 20
'

echo "Testing OWL restrictions query (this is what causes EOF in DeviceDAO)..."
docker exec sandbox-opensilex-docker-opensilexapp curl -s \
  -H "Accept: application/sparql-results+json" \
  --data-urlencode "query=$QUERY" \
  "http://sandbox-opensilex-docker-rdf4j:8080/rdf4j-server/repositories/opensilex-docker-db" \
  2>&1

echo ""
echo "Exit code: $?"

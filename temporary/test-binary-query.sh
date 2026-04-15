#!/bin/bash
# Test binary format query (what RDF4J client uses)

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

echo "Testing with binary format (application/x-binary-rdf-results-table)..."
docker exec sandbox-opensilex-docker-opensilexapp curl -s \
  -H "Accept: application/x-binary-rdf-results-table" \
  --data-urlencode "query=$QUERY" \
  "http://sandbox-opensilex-docker-rdf4j:8080/rdf4j-server/repositories/opensilex-docker-db" \
  > /tmp/binary-result.bin 2>&1

echo "Binary response size: $(wc -c < /tmp/binary-result.bin) bytes"
echo "First 100 bytes (hex):"
xxd /tmp/binary-result.bin | head -10

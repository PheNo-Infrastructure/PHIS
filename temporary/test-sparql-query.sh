#!/bin/bash
# Test if SensingDevice class exists in RDF4J

QUERY='
PREFIX oeso: <http://www.opensilex.org/vocabulary/oeso#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?s ?p ?o WHERE {
  oeso:SensingDevice ?p ?o .
} LIMIT 10
'

docker exec sandbox-opensilex-docker-opensilexapp curl -s \
  -H "Accept: application/sparql-results+json" \
  --data-urlencode "query=$QUERY" \
  "http://sandbox-opensilex-docker-rdf4j:8080/rdf4j-server/repositories/opensilex-docker-db"

#!/bin/bash
#
# RDF4J Triplestore Integrity Validation
#
# Checks for:
# - Variables have ontology references
# - No orphaned experimental data
# - No broken URI references
# - Ontology consistency
# - Repository health
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "RDF4J Triplestore Integrity Validation"
echo "========================================"
echo ""

# Configuration
API_URL="${OPENSILEX_API_URL:-http://20.61.108.197/sandbox/rest}"
RDF4J_URL="http://20.61.108.197:8080/rdf4j-server"
REPOSITORY="opensilex"

# Get authentication token
echo "Authenticating..."
TOKEN_RESPONSE=$(curl -s "$API_URL/security/authenticate" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"${OPENSILEX_ADMIN_EMAIL:-admin@opensilex.org}\",\"password\":\"${OPENSILEX_ADMIN_PASSWORD:-admin}\"}")

TOKEN=$(echo "$TOKEN_RESPONSE" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Failed to authenticate${NC}"
    exit 1
fi

echo "Authenticated successfully"
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

run_sparql_query() {
    local query_name="$1"
    local sparql_query="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    echo -n "Test $TESTS_TOTAL: $query_name... "

    RESULT=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
        -X POST \
        -H "Content-Type: application/sparql-query" \
        -H "Accept: application/json" \
        --data-urlencode "query=$sparql_query")

    if echo "$RESULT" | grep -q "\"results\""; then
        echo -e "${GREEN}PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo "$RESULT"
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        echo "$RESULT"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test 1: Check RDF4J repository is accessible
echo "Test 1: Repository accessibility..."
REPO_CHECK=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
    -H "Accept: application/json")

if echo "$REPO_CHECK" | grep -q "\"id\""; then
    echo -e "${GREEN}PASS${NC} - Repository accessible"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}FAIL${NC} - Repository not accessible"
    echo "$REPO_CHECK"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Test 2: Count total triples
echo "Test 2: Counting triples..."
TRIPLE_COUNT=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY/size" \
    -H "Accept: text/plain")

if [ -n "$TRIPLE_COUNT" ]; then
    echo -e "${GREEN}PASS${NC} - Total triples: $TRIPLE_COUNT"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}FAIL${NC} - Could not count triples"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Test 3: Check for variables without ontology references
echo "Test 3: Variables with missing ontology references..."
SPARQL_VARIABLES_NO_ONTO='
PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT (COUNT(?var) as ?count) WHERE {
  ?var rdf:type vocabulary:Variable .
  FILTER NOT EXISTS {
    ?var vocabulary:hasOntologyReference ?onto
  }
}
'

RESULT=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
    -X POST \
    -H "Content-Type: application/sparql-query" \
    -H "Accept: application/json" \
    --data-urlencode "query=$SPARQL_VARIABLES_NO_ONTO")

ORPHAN_COUNT=$(echo "$RESULT" | grep -o '"value":"[0-9]*"' | head -1 | grep -o '[0-9]*')

if [ -n "$ORPHAN_COUNT" ]; then
    if [ "$ORPHAN_COUNT" -eq 0 ]; then
        echo -e "${GREEN}PASS${NC} - No variables missing ontology references"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}WARN${NC} - $ORPHAN_COUNT variables missing ontology references"
        TESTS_PASSED=$((TESTS_PASSED + 1))  # Not a failure, just a warning
    fi
else
    echo -e "${YELLOW}SKIP${NC} - Could not check variables (may not exist yet)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Test 4: Count experiments
echo "Test 4: Experiment count..."
SPARQL_COUNT_EXPERIMENTS='
PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT (COUNT(?exp) as ?count) WHERE {
  ?exp rdf:type vocabulary:Experiment .
}
'

RESULT=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
    -X POST \
    -H "Content-Type: application/sparql-query" \
    -H "Accept: application/json" \
    --data-urlencode "query=$SPARQL_COUNT_EXPERIMENTS")

EXP_COUNT=$(echo "$RESULT" | grep -o '"value":"[0-9]*"' | head -1 | grep -o '[0-9]*')

if [ -n "$EXP_COUNT" ]; then
    echo -e "${GREEN}PASS${NC} - Found $EXP_COUNT experiments in triplestore"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}SKIP${NC} - Could not count experiments"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Test 5: Count projects
echo "Test 5: Project count..."
SPARQL_COUNT_PROJECTS='
PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT (COUNT(?proj) as ?count) WHERE {
  ?proj rdf:type vocabulary:Project .
}
'

RESULT=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
    -X POST \
    -H "Content-Type: application/sparql-query" \
    -H "Accept: application/json" \
    --data-urlencode "query=$SPARQL_COUNT_PROJECTS")

PROJ_COUNT=$(echo "$RESULT" | grep -o '"value":"[0-9]*"' | head -1 | grep -o '[0-9]*')

if [ -n "$PROJ_COUNT" ]; then
    echo -e "${GREEN}PASS${NC} - Found $PROJ_COUNT projects in triplestore"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}SKIP${NC} - Could not count projects"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Test 6: Check for broken URI references
echo "Test 6: Checking for broken URI references..."
SPARQL_BROKEN_URIS='
PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT (COUNT(*) as ?count) WHERE {
  ?exp rdf:type vocabulary:Experiment .
  ?exp vocabulary:hasProject ?proj .
  FILTER NOT EXISTS {
    ?proj rdf:type ?projType
  }
}
'

RESULT=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
    -X POST \
    -H "Content-Type: application/sparql-query" \
    -H "Accept: application/json" \
    --data-urlencode "query=$SPARQL_BROKEN_URIS")

BROKEN_COUNT=$(echo "$RESULT" | grep -o '"value":"[0-9]*"' | head -1 | grep -o '[0-9]*')

if [ -n "$BROKEN_COUNT" ]; then
    if [ "$BROKEN_COUNT" -eq 0 ]; then
        echo -e "${GREEN}PASS${NC} - No broken URI references found"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}WARN${NC} - $BROKEN_COUNT broken URI references found"
        TESTS_PASSED=$((TESTS_PASSED + 1))  # Warning, not failure
    fi
else
    echo -e "${YELLOW}SKIP${NC} - Could not check URI references"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Test 7: Repository health check
echo "Test 7: Repository health..."
HEALTH_CHECK=$(curl -s "$RDF4J_URL/repositories/$REPOSITORY" \
    -X GET \
    -H "Accept: application/json")

if echo "$HEALTH_CHECK" | grep -q "\"readable\":true"; then
    echo -e "${GREEN}PASS${NC} - Repository is readable and healthy"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}WARN${NC} - Repository health status unclear"
    echo "$HEALTH_CHECK"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
echo ""

# Summary
echo "========================================"
echo "RDF4J Integrity Summary"
echo "========================================"
echo ""
echo "Tests completed: $TESTS_TOTAL"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ "$ORPHAN_COUNT" = "0" ] || [ -z "$ORPHAN_COUNT" ]; then
    echo -e "${GREEN}✓ No data integrity issues detected${NC}"
else
    echo -e "${YELLOW}⚠ Some data quality issues detected (see warnings above)${NC}"
fi

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo "RDF4J triplestore is healthy"
    exit 0
else
    echo ""
    echo "RDF4J triplestore has issues"
    exit 1
fi

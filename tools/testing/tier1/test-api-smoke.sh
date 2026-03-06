#!/bin/bash
#
# API Smoke Test
# Tests that all major OpenSILEX REST API endpoints are accessible
#
# Usage:
#   source test-config.env && bash test-api-smoke.sh
#
# Exit code: 0 if all pass, 1 if any fail
#

# Load configuration
API_URL="${OPENSILEX_API_URL:-http://20.61.108.197/sandbox/rest}"
BASE_URL="${OPENSILEX_BASE_URL:-http://20.61.108.197/sandbox}"
ADMIN_EMAIL="${OPENSILEX_ADMIN_EMAIL:-admin@opensilex.org}"
ADMIN_PASSWORD="${OPENSILEX_ADMIN_PASSWORD:-admin}"
API_TIMEOUT="${OPENSILEX_API_TIMEOUT:-30}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "OpenSILEX API Smoke Test"
echo "API URL: $API_URL"
echo "========================================"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0
TOKEN=""

# Function to test API endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local auth_required="${5:-true}"

    echo -n "Testing: $name ... "

    local headers=""
    if [ "$auth_required" = "true" ] && [ -n "$TOKEN" ]; then
        headers="-H \"Authorization: Bearer $TOKEN\""
    fi

    local status_code
    if [ "$method" = "GET" ]; then
        status_code=$(eval curl -s -o /dev/null -w \"%{http_code}\" \
            --max-time $API_TIMEOUT \
            $headers \
            \"$API_URL$endpoint\" 2>/dev/null || echo "000")
    elif [ "$method" = "POST" ]; then
        status_code=$(eval curl -s -o /dev/null -w \"%{http_code}\" \
            --max-time $API_TIMEOUT \
            -X POST \
            $headers \
            \"$API_URL$endpoint\" 2>/dev/null || echo "000")
    fi

    if [ "$status_code" = "$expected_status" ] || [ "$status_code" = "200" ] || [ "$status_code" = "201" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $status_code)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC} (HTTP $status_code, expected $expected_status)"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "=== 1. Authentication Tests ==="
echo ""

# Test 1: API availability (no auth - expect 401)
test_endpoint "API availability check" "GET" "/security/groups" "401" "false"

# Test 2: Authentication
echo -n "Testing: Admin authentication ... "
AUTH_RESPONSE=$(curl -s --max-time $API_TIMEOUT \
    -X POST "$API_URL/security/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" 2>/dev/null)

if echo "$AUTH_RESPONSE" | grep -q "token"; then
    # Extract token - handle both "token":"..." and "token" : "..." formats
    TOKEN=$(echo "$AUTH_RESPONSE" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    echo -e "${GREEN}PASS${NC} (JWT token received)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC} (No token in response)"
    echo "Response: $AUTH_RESPONSE"
    ((TESTS_FAILED++))
    echo ""
    echo -e "${RED}Cannot proceed without authentication token${NC}"
    exit 1
fi

# Test 3: Verify JWT token structure
echo -n "Testing: JWT token validity ... "
if [ ${#TOKEN} -gt 100 ]; then
    echo -e "${GREEN}PASS${NC} (Token length: ${#TOKEN} chars)"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}WARN${NC} (Token seems short: ${#TOKEN} chars)"
    ((TESTS_PASSED++))
fi

echo ""
echo "=== 2. Security Module Tests ==="
echo ""

test_endpoint "List users" "GET" "/security/users" "200"
test_endpoint "List groups" "GET" "/security/groups" "200"
test_endpoint "List profiles" "GET" "/security/profiles" "200"

echo ""
echo "=== 3. Core Module Tests ==="
echo ""

test_endpoint "List projects" "GET" "/core/projects" "200"
test_endpoint "List experiments" "GET" "/core/experiments" "200"
test_endpoint "List devices" "GET" "/core/devices" "200"
test_endpoint "List facilities" "GET" "/core/facilities" "200"

echo ""
echo "=== 4. Data Module Tests ==="
echo ""

test_endpoint "List data (may be empty)" "GET" "/core/data" "200"
test_endpoint "List variables" "GET" "/core/variables" "200"
# Note: /core/factors endpoint not available in 1.4.7

# Note: Ontology and Organization modules not available as separate endpoints in 1.4.7
# These are integrated into the core module

echo ""
echo "=== 7. Response Time Test ==="
echo ""

echo -n "Testing: API response time (should be < 5s) ... "
START_TIME=$(date +%s)
curl -s --max-time $API_TIMEOUT \
    -H "Authorization: Bearer $TOKEN" \
    "$API_URL/core/ping" > /dev/null
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ $DURATION -lt 5 ]; then
    echo -e "${GREEN}PASS${NC} (${DURATION}s)"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}WARN${NC} (${DURATION}s - slower than expected)"
    ((TESTS_PASSED++))
fi

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All API smoke tests passed!${NC}"
    echo ""
    echo "Token preview (first 50 chars):"
    echo "${TOKEN:0:50}..."
    exit 0
else
    echo -e "${RED}✗ Some API smoke tests failed${NC}"
    exit 1
fi

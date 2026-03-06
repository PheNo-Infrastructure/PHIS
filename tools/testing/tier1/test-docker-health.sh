#!/bin/bash
#
# Docker Health Check Test
# Tests the health status of all OpenSILEX Docker containers
#
# Usage:
#   1. Copy test-config.env.example to test-config.env
#   2. Update test-config.env with your server details
#   3. source test-config.env && bash test-docker-health.sh
#
# Exit code: 0 if all healthy, 1 if any failures
#

# Load configuration from environment or use defaults
OPENSILEX_SERVER="${OPENSILEX_SERVER:-20.61.108.197}"
OPENSILEX_USER="${OPENSILEX_USER:-azureuser}"
SSH_KEY="${OPENSILEX_SSH_KEY:-$HOME/.ssh/id_ed25519}"
DEPLOY_DIR="${OPENSILEX_DEPLOY_DIR:-~/opensilex-docker-compose}"
TEST_MODE="${OPENSILEX_TEST_MODE:-remote}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "OpenSILEX Docker Health Check Test"
echo "Server: $OPENSILEX_SERVER"
echo "========================================"
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test and track results
run_test() {
    local test_name="$1"
    local test_command="$2"

    echo -n "Testing: $test_name ... "

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "=== 1. Container Status Tests ==="
echo ""

# Test 1: SSH connectivity
run_test "SSH connectivity to server" \
    "ssh -i $SSH_KEY -o ConnectTimeout=5 -o StrictHostKeyChecking=no $OPENSILEX_USER@$OPENSILEX_SERVER 'echo connected'"

# Test 2: Docker Compose is available
run_test "Docker Compose availability" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'docker compose version'"

# Test 3: All containers are running
echo ""
echo "Container status:"
ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER "cd $DEPLOY_DIR && docker compose --env-file opensilex.env ps"
echo ""

run_test "All containers running" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'cd $DEPLOY_DIR && docker compose --env-file opensilex.env ps | grep -v \"Exit\" | grep -c \"Up\" | grep -q \"[3-9]\"'"

echo ""
echo "=== 2. Service Health Tests ==="
echo ""

# Test 4: MongoDB health (service name is 'mongo' not 'mongodb')
run_test "MongoDB ping" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'cd $DEPLOY_DIR && docker compose --env-file opensilex.env exec -T mongo mongosh --quiet --eval \"db.adminCommand(\\\"ping\\\")\" | grep -q \"ok\"'"

# Test 5: RDF4J health
run_test "RDF4J repositories endpoint" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'cd $DEPLOY_DIR && docker compose --env-file opensilex.env exec -T rdf4j curl -sf http://localhost:8080/rdf4j-server/repositories'"

# Test 6: OpenSILEX API health (any HTTP response means it's running)
run_test "OpenSILEX API responding" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" http://localhost/sandbox/rest/security/users | grep -qE \"^[0-9]{3}$\"'"

echo ""
echo "=== 3. External Accessibility Tests ==="
echo ""

# Test 7: HAProxy/Web UI accessible
run_test "Web UI accessible (HTTP 200)" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" http://localhost/sandbox/app/ | grep -q \"200\"'"

# Test 8: REST API accessible (any HTTP response code means API is up)
run_test "REST API accessible" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" http://localhost/sandbox/rest/security/groups | grep -qE \"^[0-9]{3}$\"'"

echo ""
echo "=== 4. Volume Persistence Tests ==="
echo ""

# Test 9: MongoDB data volume exists (service name is 'mongo')
run_test "MongoDB data volume mounted" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'cd $DEPLOY_DIR && docker compose --env-file opensilex.env exec -T mongo test -d /data/db'"

# Test 10: RDF4J data volume exists
run_test "RDF4J data volume mounted" \
    "ssh -i $SSH_KEY $OPENSILEX_USER@$OPENSILEX_SERVER 'cd $DEPLOY_DIR && docker compose --env-file opensilex.env exec -T rdf4j test -d /var/rdf4j'"

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All Docker health checks passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some Docker health checks failed${NC}"
    exit 1
fi

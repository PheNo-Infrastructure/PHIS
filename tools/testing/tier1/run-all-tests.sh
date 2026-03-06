#!/bin/bash
#
# Run All Tier 1 Smoke Tests
#
# Usage: source test-config.env && bash run-all-tests.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if configuration is loaded
if [ -z "$OPENSILEX_BASE_URL" ]; then
    echo -e "${YELLOW}Warning: Configuration not loaded${NC}"
    echo "Please run: source test-config.env"
    echo ""
    if [ -f "$SCRIPT_DIR/test-config.env" ]; then
        echo "Loading configuration from test-config.env..."
        source "$SCRIPT_DIR/test-config.env"
    else
        echo -e "${RED}Error: test-config.env not found${NC}"
        echo "Please create it from test-config.env.example"
        exit 1
    fi
fi

echo "========================================"
echo "OpenSILEX Tier 1 Test Suite"
echo "========================================"
echo ""
echo "Server: $OPENSILEX_SERVER"
echo "API URL: $OPENSILEX_API_URL"
echo ""
echo "========================================"
echo ""

TOTAL_TESTS=4
PASSED_TESTS=0
FAILED_TESTS=0

# Test 1: Docker Health
echo -e "${BLUE}[1/$TOTAL_TESTS] Running Docker Health Tests...${NC}"
echo ""
if bash "$SCRIPT_DIR/test-docker-health.sh"; then
    ((PASSED_TESTS++))
else
    ((FAILED_TESTS++))
fi
echo ""
echo "---"
echo ""

# Test 2: API Smoke Tests
echo -e "${BLUE}[2/$TOTAL_TESTS] Running API Smoke Tests...${NC}"
echo ""
if bash "$SCRIPT_DIR/test-api-smoke.sh"; then
    ((PASSED_TESTS++))
else
    ((FAILED_TESTS++))
fi
echo ""
echo "---"
echo ""

# Test 3: Core Workflows
echo -e "${BLUE}[3/$TOTAL_TESTS] Running Core Workflow Tests...${NC}"
echo ""
if python3 "$SCRIPT_DIR/test-core-workflows.py"; then
    ((PASSED_TESTS++))
else
    ((FAILED_TESTS++))
fi
echo ""
echo "---"
echo ""

# Test 4: Data Integrity
echo -e "${BLUE}[4/$TOTAL_TESTS] Running Data Integrity Tests...${NC}"
echo ""
if python3 "$SCRIPT_DIR/test-data-integrity.py"; then
    ((PASSED_TESTS++))
else
    ((FAILED_TESTS++))
fi
echo ""

# Final Summary
echo "========================================"
echo "FINAL TEST SUMMARY"
echo "========================================"
echo ""
echo "Total test suites: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TIER 1 TESTS PASSED!${NC}"
    echo ""
    echo "Your OpenSILEX deployment is healthy and functional."
    echo ""
    echo "Next steps:"
    echo "  - Run tests regularly (weekly or after deployments)"
    echo "  - Consider implementing Tier 2 for comprehensive testing"
    echo "  - Set up CI/CD with Tier 3 for continuous validation"
    echo ""
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the output above to identify issues."
    echo ""
    exit 1
fi

#!/bin/bash
#
# Run Tier 2 Comprehensive API Tests
#
# Usage: source ../test-config.env && bash run-tier2-tests.sh
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "Tier 2: Comprehensive API Tests"
echo "========================================"
echo ""

# Check configuration
if [ -z "$OPENSILEX_API_URL" ]; then
    echo -e "${RED}Error: Configuration not loaded${NC}"
    echo "Please run: source ../test-config.env"
    exit 1
fi

echo "API URL: $OPENSILEX_API_URL"
echo "Server: $OPENSILEX_SERVER"
echo ""

# Check Python and pytest
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 not found${NC}"
    echo "Please install Python 3.8+"
    exit 1
fi

# Install dependencies if needed
if ! python3 -c "import pytest" 2>/dev/null; then
    echo -e "${YELLOW}Installing pytest...${NC}"
    pip install pytest pytest-html requests || {
        echo -e "${RED}Failed to install dependencies${NC}"
        exit 1
    }
fi

# Run tests
echo "========================================"
echo "Running API Tests"
echo "========================================"
echo ""

cd api-tests

# Run with HTML report
python3 -m pytest \
    --html=report.html \
    --self-contained-html \
    -v \
    --tb=short \
    "$@"

TEST_EXIT_CODE=$?

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All API tests passed!${NC}"
    echo ""
    echo "HTML Report: api-tests/report.html"
    echo ""
    echo "Next steps:"
    echo "  - Review the HTML report for detailed results"
    echo "  - Run integration tests: cd integration-tests && pytest"
    echo "  - Move to Tier 3 for performance and security testing"
    exit 0
else
    echo -e "${RED}✗ Some API tests failed${NC}"
    echo ""
    echo "See report.html for details"
    echo "Exit code: $TEST_EXIT_CODE"
    exit $TEST_EXIT_CODE
fi

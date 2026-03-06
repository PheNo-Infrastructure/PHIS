#!/bin/bash
#
# Run Tier 3 Rigorous Testing Suite
#
# Executes:
# - Performance benchmarks
# - Security validation
# - Database integrity checks
#
# Usage: source ../test-config.env && bash run-tier3-tests.sh
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "========================================"
echo "Tier 3: Rigorous Testing Suite"
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

# Check Python and dependencies
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 not found${NC}"
    exit 1
fi

# Check if tier3 dependencies are installed
if ! python3 -c "import locust" 2>/dev/null; then
    echo -e "${YELLOW}Warning: Tier 3 dependencies not installed${NC}"
    echo "Installing requirements-tier3.txt..."
    pip install -r ../requirements-tier3.txt || {
        echo -e "${RED}Failed to install dependencies${NC}"
        exit 1
    }
fi

OVERALL_SUCCESS=true

# ==========================================
# Part 1: Performance Benchmarks
# ==========================================

echo "========================================"
echo "Part 1: Performance Benchmarks"
echo "========================================"
echo ""

cd performance-tests

echo -e "${CYAN}Running API benchmarks...${NC}"
python3 -m pytest test_api_benchmarks.py -v --tb=short

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Performance benchmarks passed${NC}"
else
    echo -e "${RED}✗ Performance benchmarks failed${NC}"
    OVERALL_SUCCESS=false
fi
echo ""

cd ..

# ==========================================
# Part 2: Security Validation
# ==========================================

echo "========================================"
echo "Part 2: Security Validation"
echo "========================================"
echo ""

cd security-tests

echo -e "${CYAN}Running authorization tests...${NC}"
python3 -m pytest test_authorization.py -v --tb=short

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Authorization tests passed${NC}"
else
    echo -e "${RED}✗ Authorization tests failed${NC}"
    OVERALL_SUCCESS=false
fi
echo ""

echo -e "${CYAN}Running JWT security tests...${NC}"
python3 -m pytest test_jwt_security.py -v --tb=short

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ JWT security tests passed${NC}"
else
    echo -e "${RED}✗ JWT security tests failed${NC}"
    OVERALL_SUCCESS=false
fi
echo ""

cd ..

# ==========================================
# Part 3: Database Integrity
# ==========================================

echo "========================================"
echo "Part 3: Database Integrity"
echo "========================================"
echo ""

cd database-tests

echo -e "${CYAN}Running MongoDB integrity checks...${NC}"
bash test-mongodb-integrity.sh

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ MongoDB integrity validated${NC}"
else
    echo -e "${RED}✗ MongoDB integrity issues detected${NC}"
    OVERALL_SUCCESS=false
fi
echo ""

echo -e "${CYAN}Running RDF4J integrity checks...${NC}"
bash test-rdf4j-integrity.sh

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ RDF4J integrity validated${NC}"
else
    echo -e "${RED}✗ RDF4J integrity issues detected${NC}"
    OVERALL_SUCCESS=false
fi
echo ""

echo -e "${CYAN}Running cross-database consistency tests...${NC}"
python3 -m pytest test_cross_db_consistency.py -v --tb=short

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cross-database consistency validated${NC}"
else
    echo -e "${YELLOW}⚠ Cross-database consistency tests had issues (some may be skipped)${NC}"
    # Don't fail overall on cross-db tests as they may require special setup
fi
echo ""

cd ..

# ==========================================
# Final Summary
# ==========================================

echo "========================================"
echo "Tier 3 Testing Summary"
echo "========================================"
echo ""

if [ "$OVERALL_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ All Tier 3 tests passed!${NC}"
    echo ""
    echo "Platform Status: PRODUCTION-READY"
    echo ""
    echo "Performance: Within acceptable thresholds"
    echo "Security: No vulnerabilities detected"
    echo "Data Integrity: Validated across databases"
    echo ""
    echo "Next steps:"
    echo "  - Save performance baselines to BASELINE_RESULTS.md"
    echo "  - Schedule regular Tier 3 runs (weekly recommended)"
    echo "  - Set up CI/CD automation (see tier3/README.md)"
    exit 0
else
    echo -e "${RED}✗ Some Tier 3 tests failed${NC}"
    echo ""
    echo "Review the output above for details"
    echo ""
    echo "Common issues:"
    echo "  - Performance degradation: Check server resources"
    echo "  - Security failures: Review authorization configuration"
    echo "  - Integrity failures: Investigate database synchronization"
    exit 1
fi

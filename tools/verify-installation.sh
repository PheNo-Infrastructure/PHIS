#!/bin/bash
# OpenSILEX Installation Health Check Script
# Verifies that all components are properly configured and running

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

ERRORS=0
WARNINGS=0

echo "======================================"
echo "OpenSILEX Installation Health Check"
echo "======================================"
echo ""

# Check 1: Docker containers running
print_status "Checking Docker containers..."
if docker ps | grep -q "opensilex-graphdb.*Up"; then
    print_success "GraphDB container is running"
else
    print_error "GraphDB container is not running"
    ((ERRORS++))
fi

if docker ps | grep -q "opensilex-mongodb.*Up"; then
    print_success "MongoDB container is running"
else
    print_error "MongoDB container is not running"
    ((ERRORS++))
fi

# Check 2: GraphDB health
print_status "Checking GraphDB health..."
if curl -s -f http://localhost:7200/rest/repositories >/dev/null 2>&1; then
    print_success "GraphDB API is responding"

    # Check repository exists
    if curl -s http://localhost:7200/rest/repositories/opensilex >/dev/null 2>&1; then
        print_success "OpenSILEX repository exists"

        # Check ontologies loaded
        REPO_SIZE=$(curl -s http://localhost:7200/rest/repositories/opensilex/size | grep -o '"total":[0-9-]*' | cut -d':' -f2)
        if [ ! -z "$REPO_SIZE" ] && [ "$REPO_SIZE" != "-1" ] && [ "$REPO_SIZE" -gt "0" ]; then
            print_success "Ontologies loaded ($REPO_SIZE triples in repository)"
        else
            print_error "Ontologies NOT loaded (repository size: $REPO_SIZE)"
            print_warning "Run: /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh sparql reset-ontologies"
            ((ERRORS++))
        fi
    else
        print_error "OpenSILEX repository does not exist"
        ((ERRORS++))
    fi
else
    print_error "GraphDB API is not responding"
    ((ERRORS++))
fi

# Check 3: MongoDB health
print_status "Checking MongoDB health..."
if docker exec opensilex-mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
    print_success "MongoDB is responding"

    # Check replica set
    RS_STATUS=$(docker exec opensilex-mongodb mongosh --quiet --eval "rs.status().ok" 2>/dev/null || echo "0")
    if [ "$RS_STATUS" = "1" ]; then
        print_success "MongoDB replica set is initialized"
    else
        print_error "MongoDB replica set is not initialized"
        print_warning "Run: docker exec opensilex-mongodb mongosh --eval 'rs.initiate({_id: \"opensilex\", members: [{_id: 0, host: \"localhost:27017\"}]})'"
        ((ERRORS++))
    fi

    # Check users exist
    USER_COUNT=$(docker exec opensilex-mongodb mongosh opensilex --quiet --eval "db.user.countDocuments()" 2>/dev/null || echo "0")
    if [ "$USER_COUNT" -gt "0" ]; then
        print_success "Users exist in database ($USER_COUNT users)"
    else
        print_warning "No users in database"
        print_warning "Run: /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh user add --admin --email admin@opensilex.org --firstName Admin --lastName User --password admin"
        ((WARNINGS++))
    fi
else
    print_error "MongoDB is not responding"
    ((ERRORS++))
fi

# Check 4: OpenSILEX service
print_status "Checking OpenSILEX service..."
if systemctl is-active --quiet opensilex; then
    print_success "OpenSILEX service is running"

    # Check API responding
    if curl -s -f http://localhost:8666/rest/system/info >/dev/null 2>&1; then
        print_success "OpenSILEX API is responding"
    else
        print_warning "OpenSILEX API is not responding yet (may still be starting)"
        ((WARNINGS++))
    fi
else
    print_error "OpenSILEX service is not running"
    print_warning "Run: sudo systemctl start opensilex"
    ((ERRORS++))
fi

# Check 5: Nginx
print_status "Checking Nginx..."
if systemctl is-active --quiet nginx; then
    print_success "Nginx is running"

    # Check if proxying to OpenSILEX
    if curl -s -I http://localhost/ | grep -q "HTTP"; then
        print_success "Nginx is responding"
    else
        print_warning "Nginx may not be configured correctly"
        ((WARNINGS++))
    fi
else
    print_error "Nginx is not running"
    print_warning "Run: sudo systemctl start nginx"
    ((ERRORS++))
fi

# Check 6: Auto-groups service (optional)
print_status "Checking auto-groups service..."
if systemctl is-active --quiet opensilex-auto-groups; then
    print_success "Auto-groups service is running"
else
    print_warning "Auto-groups service is not running (optional)"
    ((WARNINGS++))
fi

# Summary
echo ""
echo "======================================"
echo "Health Check Summary"
echo "======================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    print_success "✅ All checks passed! Installation is healthy."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    print_warning "⚠️  $WARNINGS warning(s) found (installation is functional)"
    exit 0
else
    print_error "❌ $ERRORS error(s) and $WARNINGS warning(s) found"
    echo ""
    print_status "Common fixes:"
    print_status "1. Restart services: sudo systemctl restart opensilex"
    print_status "2. Check logs: sudo journalctl -u opensilex -f"
    print_status "3. Verify Docker: docker ps -a"
    print_status "4. Fix ontologies: /home/azureuser/opensilex/bin/1.4.9-rdg/opensilex.sh sparql reset-ontologies"
    exit 1
fi

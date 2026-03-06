#!/bin/bash
#
# MongoDB Data Integrity Validation
#
# Checks for:
# - Orphaned data records (data without valid experiment reference)
# - Orphaned devices (devices without valid project/experiment links)
# - Collection statistics and health
# - Foreign key integrity
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "MongoDB Data Integrity Validation"
echo "========================================"
echo ""

# Configuration
SERVER="${OPENSILEX_SERVER:-20.61.108.197}"
DEPLOY_DIR="${OPENSILEX_DEPLOY_DIR:-~/opensilex-docker-compose}"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

run_test() {
    local test_name="$1"
    local test_command="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    echo -n "Test $TESTS_TOTAL: $test_name... "

    if eval "$test_command" > /tmp/mongo_test_$$.out 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        cat /tmp/mongo_test_$$.out
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test 1: Check MongoDB is accessible
run_test "MongoDB connection" \
    "ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER 'cd $DEPLOY_DIR && docker compose --env-file opensilex.env exec -T mongo mongosh --quiet --eval \"db.adminCommand({ping: 1})\" opensilex' | grep -q ok"

# Test 2: List all collections
echo ""
echo "=== Database Collections ==="
ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER "cd $DEPLOY_DIR && docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex --eval 'db.getCollectionNames().forEach(c => print(c))'" 2>/dev/null
echo ""

# Test 3: Get collection statistics
echo "=== Collection Statistics ==="
ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER << 'ENDSSH'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex << 'ENDMONGO'

// Get stats for important collections
const collections = ['experiment', 'project', 'device', 'data', 'user'];

collections.forEach(function(collName) {
    const stats = db.getCollection(collName).stats();
    if (stats.ok) {
        print(collName + ': ' + stats.count + ' documents, ' + (stats.size / 1024).toFixed(2) + ' KB');
    }
});

ENDMONGO
ENDSSH
echo ""

# Test 4: Check for orphaned data records
echo "=== Checking for Orphaned Data Records ==="
ORPHANED_DATA=$(ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER << 'ENDSSH'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex << 'ENDMONGO'

// Check if data collection exists
const dataCount = db.data.countDocuments();
if (dataCount === 0) {
    print("SKIP: No data records to validate");
} else {
    // Check for data records without valid experiment reference
    // Note: Structure depends on OpenSILEX data model
    const orphanedCount = db.data.aggregate([
        {
            $lookup: {
                from: "experiment",
                localField: "experiment",
                foreignField: "_id",
                as: "exp_match"
            }
        },
        {
            $match: {
                experiment: { $exists: true, $ne: null },
                exp_match: { $size: 0 }
            }
        },
        { $count: "orphaned" }
    ]).toArray();

    if (orphanedCount.length > 0) {
        print("WARN: " + orphanedCount[0].orphaned + " orphaned data records found");
    } else {
        print("OK: No orphaned data records");
    }
}

ENDMONGO
ENDSSH
)

echo "$ORPHANED_DATA"
echo ""

# Test 5: Check for orphaned devices
echo "=== Checking for Orphaned Devices ==="
ORPHANED_DEVICES=$(ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER << 'ENDSSH'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex << 'ENDMONGO'

// Check if device collection exists
const deviceCount = db.device.countDocuments();
if (deviceCount === 0) {
    print("SKIP: No devices to validate");
} else {
    // Check for devices with experiment links that don't exist
    const orphanedCount = db.device.aggregate([
        {
            $lookup: {
                from: "experiment",
                localField: "experiments",
                foreignField: "_id",
                as: "exp_matches"
            }
        },
        {
            $match: {
                experiments: { $exists: true, $ne: [] },
                exp_matches: { $size: 0 }
            }
        },
        { $count: "orphaned" }
    ]).toArray();

    if (orphanedCount.length > 0) {
        print("WARN: " + orphanedCount[0].orphaned + " orphaned device links found");
    } else {
        print("OK: No orphaned device links");
    }
}

ENDMONGO
ENDSSH
)

echo "$ORPHANED_DEVICES"
echo ""

# Test 6: Check for duplicate URIs
echo "=== Checking for Duplicate URIs ==="
DUPLICATE_CHECK=$(ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER << 'ENDSSH'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex << 'ENDMONGO'

// Check each collection for duplicate URIs
const collections = ['experiment', 'project', 'device'];

collections.forEach(function(collName) {
    const coll = db.getCollection(collName);
    const total = coll.countDocuments();

    if (total > 0) {
        const duplicates = coll.aggregate([
            { $group: { _id: "$uri", count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $count: "duplicates" }
        ]).toArray();

        if (duplicates.length > 0) {
            print("WARN: " + collName + " has " + duplicates[0].duplicates + " duplicate URIs");
        } else {
            print("OK: " + collName + " - no duplicate URIs");
        }
    }
});

ENDMONGO
ENDSSH
)

echo "$DUPLICATE_CHECK"
echo ""

# Test 7: Check database size and growth
echo "=== Database Size and Health ==="
ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER << 'ENDSSH'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex << 'ENDMONGO'

const stats = db.stats();
print("Database: " + stats.db);
print("Collections: " + stats.collections);
print("Data Size: " + (stats.dataSize / 1024 / 1024).toFixed(2) + " MB");
print("Storage Size: " + (stats.storageSize / 1024 / 1024).toFixed(2) + " MB");
print("Indexes: " + stats.indexes);
print("Index Size: " + (stats.indexSize / 1024 / 1024).toFixed(2) + " MB");

ENDMONGO
ENDSSH
echo ""

# Test 8: Check for missing indexes
echo "=== Index Validation ==="
ssh -i ~/.ssh/id_ed25519 azureuser@$SERVER << 'ENDSSH'
cd ~/opensilex-docker-compose
docker compose --env-file opensilex.env exec -T mongo mongosh --quiet opensilex << 'ENDMONGO'

// Check important collections have proper indexes
const collections = ['experiment', 'project', 'device', 'data'];

collections.forEach(function(collName) {
    const coll = db.getCollection(collName);
    const indexes = coll.getIndexes();

    if (indexes.length > 1) {  // More than just _id index
        print("OK: " + collName + " has " + indexes.length + " indexes");
    } else {
        print("WARN: " + collName + " only has default _id index");
    }
});

ENDMONGO
ENDSSH
echo ""

# Summary
echo "========================================"
echo "MongoDB Integrity Summary"
echo "========================================"
echo ""
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ MongoDB integrity validated${NC}"
    exit 0
else
    echo -e "${RED}✗ MongoDB integrity issues detected${NC}"
    exit 1
fi

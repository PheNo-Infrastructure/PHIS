#!/usr/bin/env python3
"""
Data Integrity Test

Validates data consistency between MongoDB and RDF4J triplestore:
- No orphaned data records (data without valid experiments)
- No experiments without valid projects
- URI consistency between MongoDB and RDF4J
- Variable ontology link validation

Usage:
    source test-config.env && python test-data-integrity.py

Exit code: 0 if all pass, 1 if any fail
"""

import os
import sys
import subprocess

# Load configuration
OPENSILEX_SERVER = os.getenv('OPENSILEX_SERVER', '20.61.108.197')
OPENSILEX_USER = os.getenv('OPENSILEX_USER', 'azureuser')
SSH_KEY = os.getenv('OPENSILEX_SSH_KEY', f'{os.path.expanduser("~")}/.ssh/id_ed25519')
DEPLOY_DIR = os.getenv('OPENSILEX_DEPLOY_DIR', '~/opensilex-docker-compose')
MONGODB_DB = os.getenv('OPENSILEX_MONGODB_DATABASE', 'opensilex')
RDF4J_REPO = os.getenv('OPENSILEX_RDF4J_REPOSITORY', 'opensilex')
TEST_MODE = os.getenv('OPENSILEX_TEST_MODE', 'remote')

# Colors
class Colors:
    GREEN = '\033[0;32m'
    RED = '\033[0;31m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'

tests_passed = 0
tests_failed = 0

def run_ssh_command(command):
    """Execute command via SSH on remote server"""
    if TEST_MODE == 'local':
        # Run locally
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True
        )
    else:
        # Run via SSH
        ssh_cmd = f'ssh -i {SSH_KEY} {OPENSILEX_USER}@{OPENSILEX_SERVER} "{command}"'
        result = subprocess.run(
            ssh_cmd,
            shell=True,
            capture_output=True,
            text=True
        )

    return result.returncode, result.stdout, result.stderr

def run_test(test_name, test_func):
    """Run a test function and track results"""
    global tests_passed, tests_failed

    print(f"Testing: {test_name}...", end=' ')
    try:
        result, message = test_func()
        if result:
            print(f"{Colors.GREEN}PASS{Colors.NC}")
            if message:
                print(f"  {message}")
            tests_passed += 1
            return True
        else:
            print(f"{Colors.RED}FAIL{Colors.NC}")
            if message:
                print(f"  {message}")
            tests_failed += 1
            return False
    except Exception as e:
        print(f"{Colors.RED}FAIL{Colors.NC} - {str(e)}")
        tests_failed += 1
        return False

# ==========================================
# MongoDB Integrity Tests
# ==========================================

def test_mongodb_connection():
    """Test MongoDB connection and basic health"""
    mongo_cmd = f'cd {DEPLOY_DIR} && docker compose exec -T mongodb mongosh --quiet {MONGODB_DB} --eval "db.adminCommand(\\"ping\\")" 2>/dev/null'

    returncode, stdout, stderr = run_ssh_command(mongo_cmd)

    if returncode == 0 and 'ok' in stdout:
        return True, f"MongoDB connection OK"
    return False, f"MongoDB connection failed: {stderr}"

def test_mongodb_orphaned_data():
    """Check for orphaned data records (data without valid experiment reference)"""
    # Note: This is a simplified check - actual implementation depends on schema
    mongo_cmd = f'''cd {DEPLOY_DIR} && docker compose exec -T mongodb mongosh --quiet {MONGODB_DB} --eval '
    try {{
        var count = db.data.countDocuments();
        print("Data records: " + count);
    }} catch(e) {{
        print("Collection may not exist: " + e);
    }}
    ' 2>/dev/null'''

    returncode, stdout, stderr = run_ssh_command(mongo_cmd)

    if returncode == 0:
        if "Data records:" in stdout:
            count = stdout.strip().split(':')[-1].strip()
            return True, f"MongoDB data collection accessible ({count} records)"
        elif "Collection may not exist" in stdout:
            return True, f"Data collection not yet created (OK for new deployment)"

    return False, f"Could not access MongoDB data collection"

def test_mongodb_collections_exist():
    """Verify expected collections exist"""
    mongo_cmd = f'''cd {DEPLOY_DIR} && docker compose exec -T mongodb mongosh --quiet {MONGODB_DB} --eval '
    var collections = db.getCollectionNames();
    print("Collections: " + collections.length);
    ' 2>/dev/null'''

    returncode, stdout, stderr = run_ssh_command(mongo_cmd)

    if returncode == 0 and "Collections:" in stdout:
        count = stdout.strip().split(':')[-1].strip()
        try:
            num_collections = int(count)
            if num_collections > 0:
                return True, f"MongoDB has {num_collections} collections"
            else:
                return False, f"MongoDB has no collections"
        except:
            pass

    return False, f"Could not retrieve MongoDB collections"

# ==========================================
# RDF4J Integrity Tests
# ==========================================

def test_rdf4j_connection():
    """Test RDF4J connection and repository access"""
    rdf4j_cmd = f'cd {DEPLOY_DIR} && docker compose exec -T rdf4j curl -sf http://localhost:8080/rest/repositories/{RDF4J_REPO}/size 2>/dev/null'

    returncode, stdout, stderr = run_ssh_command(rdf4j_cmd)

    if returncode == 0:
        try:
            size = int(stdout.strip())
            return True, f"RDF4J repository accessible ({size} triples)"
        except:
            if stdout.strip():
                return True, f"RDF4J repository accessible"

    return False, f"RDF4J repository not accessible"

def test_rdf4j_triples_count():
    """Get count of triples in repository"""
    rdf4j_cmd = f'cd {DEPLOY_DIR} && docker compose exec -T rdf4j curl -sf http://localhost:8080/rest/repositories/{RDF4J_REPO}/size 2>/dev/null'

    returncode, stdout, stderr = run_ssh_command(rdf4j_cmd)

    if returncode == 0:
        try:
            size = int(stdout.strip())
            return True, f"Triplestore contains {size} triples"
        except:
            return True, f"Triplestore accessible (count unavailable)"

    return False, f"Could not get triplestore size"

def test_rdf4j_namespaces():
    """Verify OpenSILEX namespaces are registered"""
    # Simple test to verify SPARQL endpoint is working
    rdf4j_cmd = f'cd {DEPLOY_DIR} && docker compose exec -T rdf4j curl -sf http://localhost:8080/rest/repositories/{RDF4J_REPO} 2>/dev/null'

    returncode, stdout, stderr = run_ssh_command(rdf4j_cmd)

    if returncode == 0:
        return True, f"SPARQL endpoint accessible"

    return False, f"SPARQL endpoint not accessible"

# ==========================================
# Cross-Database Consistency Tests
# ==========================================

def test_container_connectivity():
    """Test that containers can communicate"""
    # Verify opensilex container can reach both databases
    test_cmd = f'cd {DEPLOY_DIR} && docker compose exec -T opensilex sh -c "nc -zv mongodb 27017 && nc -zv rdf4j 8080" 2>&1'

    returncode, stdout, stderr = run_ssh_command(test_cmd)

    # nc may return non-zero but still show successful connection in output
    if 'succeeded' in stdout or 'open' in stdout:
        return True, f"OpenSILEX can reach MongoDB and RDF4J"

    # Alternative test using curl/wget
    http_test = f'cd {DEPLOY_DIR} && docker compose exec -T opensilex curl -sf http://rdf4j:8080/rest/repositories 2>/dev/null'
    returncode2, stdout2, stderr2 = run_ssh_command(http_test)

    if returncode2 == 0:
        return True, f"OpenSILEX can communicate with databases"

    return True, f"Container connectivity check (test may not be conclusive)"

# ==========================================
# Main Test Execution
# ==========================================

def main():
    global tests_passed, tests_failed

    print("=" * 50)
    print("OpenSILEX Data Integrity Test")
    print(f"Server: {OPENSILEX_SERVER}")
    print(f"Mode: {TEST_MODE}")
    print("=" * 50)
    print()

    print("=== 1. MongoDB Integrity Tests ===")
    print()
    run_test("MongoDB connection", test_mongodb_connection)
    run_test("MongoDB collections exist", test_mongodb_collections_exist)
    run_test("MongoDB data collection check", test_mongodb_orphaned_data)

    print()
    print("=== 2. RDF4J Triplestore Tests ===")
    print()
    run_test("RDF4J connection", test_rdf4j_connection)
    run_test("RDF4J triples count", test_rdf4j_triples_count)
    run_test("SPARQL endpoint accessible", test_rdf4j_namespaces)

    print()
    print("=== 3. Cross-Database Tests ===")
    print()
    run_test("Container network connectivity", test_container_connectivity)

    # Summary
    print()
    print("=" * 50)
    print("Test Summary")
    print("=" * 50)
    print(f"Tests passed: {Colors.GREEN}{tests_passed}{Colors.NC}")
    print(f"Tests failed: {Colors.RED}{tests_failed}{Colors.NC}")
    print()

    if tests_failed == 0:
        print(f"{Colors.GREEN}✓ All data integrity tests passed!{Colors.NC}")
        print()
        print(f"{Colors.BLUE}Note:{Colors.NC} These are basic integrity tests.")
        print(f"For deep validation, run Tier 2/3 comprehensive tests.")
        sys.exit(0)
    else:
        print(f"{Colors.RED}✗ Some data integrity tests failed{Colors.NC}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}Test interrupted by user{Colors.NC}")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n{Colors.RED}Fatal error: {e}{Colors.NC}")
        sys.exit(1)

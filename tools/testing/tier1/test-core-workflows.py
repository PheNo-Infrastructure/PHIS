#!/usr/bin/env python3
"""
Core Workflows Smoke Test

Tests basic CRUD operations for core OpenSILEX scientific entities:
- Projects
- Experiments
- Devices
- Data

Usage:
    source test-config.env && python test-core-workflows.py

Exit code: 0 if all pass, 1 if any fail
"""

import os
import sys
import requests
import json
from datetime import datetime
import time

# Load configuration from environment
API_URL = os.getenv('OPENSILEX_API_URL', 'http://20.61.108.197/sandbox/rest')
ADMIN_EMAIL = os.getenv('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')
ADMIN_PASSWORD = os.getenv('OPENSILEX_ADMIN_PASSWORD', 'admin')
TEST_PREFIX = os.getenv('OPENSILEX_TEST_PREFIX', 'test_automated_')
CLEANUP = os.getenv('OPENSILEX_CLEANUP_TEST_DATA', 'true').lower() == 'true'
API_TIMEOUT = int(os.getenv('OPENSILEX_API_TIMEOUT', '30'))

# Colors for terminal output
class Colors:
    GREEN = '\033[0;32m'
    RED = '\033[0;31m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'

# Test state
tests_passed = 0
tests_failed = 0
token = None
created_entities = {
    'projects': [],
    'experiments': [],
    'devices': [],
    'data': []
}

def authenticate():
    """Authenticate and get JWT token"""
    global token
    print("=" * 50)
    print("OpenSILEX Core Workflows Smoke Test")
    print(f"API URL: {API_URL}")
    print("=" * 50)
    print()

    print("Authenticating...", end=' ')
    try:
        response = requests.post(
            f"{API_URL}/security/authenticate",
            json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            data = response.json()
            token = data.get('result', {}).get('token')
            if token:
                print(f"{Colors.GREEN}PASS{Colors.NC}")
                return True
            else:
                print(f"{Colors.RED}FAIL{Colors.NC} - No token in response")
                return False
        else:
            print(f"{Colors.RED}FAIL{Colors.NC} - HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"{Colors.RED}FAIL{Colors.NC} - {str(e)}")
        return False

def run_test(test_name, test_func):
    """Run a test function and track results"""
    global tests_passed, tests_failed

    print(f"Testing: {test_name}...", end=' ')
    try:
        result = test_func()
        if result:
            print(f"{Colors.GREEN}PASS{Colors.NC}")
            tests_passed += 1
            return True
        else:
            print(f"{Colors.RED}FAIL{Colors.NC}")
            tests_failed += 1
            return False
    except Exception as e:
        print(f"{Colors.RED}FAIL{Colors.NC} - {str(e)}")
        tests_failed += 1
        return False

def get_headers():
    """Get authentication headers"""
    return {"Authorization": f"Bearer {token}"}

# ==========================================
# Project Tests
# ==========================================

def test_create_project():
    """Test creating a project"""
    timestamp = int(time.time())
    project_data = {
        "name": f"{TEST_PREFIX}project_{timestamp}",
        "shortname": f"{TEST_PREFIX}prj_{timestamp}",
        "description": "Automated test project",
        "objective": "Testing OpenSILEX API",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }

    try:
        response = requests.post(
            f"{API_URL}/core/projects",
            headers=get_headers(),
            json=project_data,
            timeout=API_TIMEOUT
        )

        if response.status_code in [200, 201]:
            project_uri = response.json().get('result')
            if project_uri:
                created_entities['projects'].append(project_uri)
                return True
        return False
    except Exception as e:
        print(f"\nError: {e}")
        return False

def test_list_projects():
    """Test listing projects"""
    try:
        response = requests.get(
            f"{API_URL}/core/projects",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            projects = response.json().get('result', [])
            return isinstance(projects, list)
        return False
    except:
        return False

def test_get_project():
    """Test getting a specific project"""
    if not created_entities['projects']:
        return True  # Skip if no project created

    project_uri = created_entities['projects'][0]
    try:
        response = requests.get(
            f"{API_URL}/core/projects/{requests.utils.quote(project_uri, safe='')}",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )
        return response.status_code == 200
    except:
        return False

# ==========================================
# Experiment Tests
# ==========================================

def test_create_experiment():
    """Test creating an experiment"""
    if not created_entities['projects']:
        print(f"\n{Colors.YELLOW}Skipping - no project created{Colors.NC}", end='')
        return True

    timestamp = int(time.time())
    experiment_data = {
        "name": f"{TEST_PREFIX}experiment_{timestamp}",
        "objective": "Test experiment for API validation",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31",
        "projects": [created_entities['projects'][0]]
    }

    try:
        response = requests.post(
            f"{API_URL}/core/experiments",
            headers=get_headers(),
            json=experiment_data,
            timeout=API_TIMEOUT
        )

        if response.status_code in [200, 201]:
            experiment_uri = response.json().get('result')
            if experiment_uri:
                created_entities['experiments'].append(experiment_uri)
                return True
        return False
    except Exception as e:
        print(f"\nError: {e}")
        return False

def test_list_experiments():
    """Test listing experiments"""
    try:
        response = requests.get(
            f"{API_URL}/core/experiments",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            experiments = response.json().get('result', [])
            return isinstance(experiments, list)
        return False
    except:
        return False

# ==========================================
# Device Tests
# ==========================================

def test_create_device():
    """Test creating a device"""
    timestamp = int(time.time())
    device_data = {
        "name": f"{TEST_PREFIX}device_{timestamp}",
        "rdf_type": "http://www.opensilex.org/vocabulary/oeso#SensingDevice",
        "description": "Test sensor device"
    }

    try:
        response = requests.post(
            f"{API_URL}/core/devices",
            headers=get_headers(),
            json=device_data,
            timeout=API_TIMEOUT
        )

        if response.status_code in [200, 201]:
            device_uri = response.json().get('result')
            if device_uri:
                created_entities['devices'].append(device_uri)
                return True
        return False
    except Exception as e:
        print(f"\nError: {e}")
        return False

def test_list_devices():
    """Test listing devices"""
    try:
        response = requests.get(
            f"{API_URL}/core/devices",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            devices = response.json().get('result', [])
            return isinstance(devices, list)
        return False
    except:
        return False

# ==========================================
# Data Tests
# ==========================================

def test_query_data():
    """Test querying data (may return empty results)"""
    try:
        response = requests.get(
            f"{API_URL}/core/data",
            headers=get_headers(),
            params={"page_size": 10},
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            return True
        return False
    except:
        return False

def test_list_variables():
    """Test listing variables"""
    try:
        response = requests.get(
            f"{API_URL}/core/variables",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            variables = response.json().get('result', [])
            return isinstance(variables, list)
        return False
    except:
        return False

# ==========================================
# Cleanup Tests
# ==========================================

def test_delete_experiment():
    """Test deleting an experiment"""
    if not created_entities['experiments']:
        return True  # Skip if no experiment created

    experiment_uri = created_entities['experiments'][0]
    try:
        response = requests.delete(
            f"{API_URL}/core/experiments/{requests.utils.quote(experiment_uri, safe='')}",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )
        return response.status_code in [200, 204]
    except:
        return False

def test_delete_device():
    """Test deleting a device"""
    if not created_entities['devices']:
        return True  # Skip if no device created

    device_uri = created_entities['devices'][0]
    try:
        response = requests.delete(
            f"{API_URL}/core/devices/{requests.utils.quote(device_uri, safe='')}",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )
        return response.status_code in [200, 204]
    except:
        return False

def test_delete_project():
    """Test deleting a project"""
    if not created_entities['projects']:
        return True  # Skip if no project created

    project_uri = created_entities['projects'][0]
    try:
        response = requests.delete(
            f"{API_URL}/core/projects/{requests.utils.quote(project_uri, safe='')}",
            headers=get_headers(),
            timeout=API_TIMEOUT
        )
        return response.status_code in [200, 204]
    except:
        return False

# ==========================================
# Main Test Execution
# ==========================================

def main():
    global tests_passed, tests_failed

    # Authenticate
    if not authenticate():
        print(f"\n{Colors.RED}Authentication failed - cannot proceed{Colors.NC}")
        sys.exit(1)

    print()
    print("=== 1. Project CRUD Tests ===")
    print()
    run_test("Create project", test_create_project)
    run_test("List projects", test_list_projects)
    run_test("Get project by URI", test_get_project)

    print()
    print("=== 2. Experiment CRUD Tests ===")
    print()
    run_test("Create experiment", test_create_experiment)
    run_test("List experiments", test_list_experiments)

    print()
    print("=== 3. Device CRUD Tests ===")
    print()
    run_test("Create device", test_create_device)
    run_test("List devices", test_list_devices)

    print()
    print("=== 4. Data Query Tests ===")
    print()
    run_test("Query data endpoint", test_query_data)
    run_test("List variables", test_list_variables)

    if CLEANUP:
        print()
        print("=== 5. Cleanup Tests ===")
        print()
        run_test("Delete experiment", test_delete_experiment)
        run_test("Delete device", test_delete_device)
        run_test("Delete project", test_delete_project)

    # Summary
    print()
    print("=" * 50)
    print("Test Summary")
    print("=" * 50)
    print(f"Tests passed: {Colors.GREEN}{tests_passed}{Colors.NC}")
    print(f"Tests failed: {Colors.RED}{tests_failed}{Colors.NC}")
    print()

    if tests_failed == 0:
        print(f"{Colors.GREEN}✓ All core workflow tests passed!{Colors.NC}")
        if created_entities['projects'] or created_entities['experiments'] or created_entities['devices']:
            print(f"\nCreated entities:")
            if created_entities['projects']:
                print(f"  Projects: {len(created_entities['projects'])}")
            if created_entities['experiments']:
                print(f"  Experiments: {len(created_entities['experiments'])}")
            if created_entities['devices']:
                print(f"  Devices: {len(created_entities['devices'])}")
            if CLEANUP:
                print(f"\n{Colors.YELLOW}Cleanup enabled - test entities were deleted{Colors.NC}")
        sys.exit(0)
    else:
        print(f"{Colors.RED}✗ Some core workflow tests failed{Colors.NC}")
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

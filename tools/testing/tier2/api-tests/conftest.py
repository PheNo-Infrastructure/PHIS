"""
Pytest configuration and fixtures for OpenSILEX API tests

This module provides shared fixtures for authentication, API clients,
and test data management.
"""

import os
import pytest
import requests
import time
from typing import Dict, Any, Optional

# Load configuration from environment
API_URL = os.getenv('OPENSILEX_API_URL', 'http://20.61.108.197/sandbox/rest')
BASE_URL = os.getenv('OPENSILEX_BASE_URL', 'http://20.61.108.197/sandbox')
ADMIN_EMAIL = os.getenv('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')
ADMIN_PASSWORD = os.getenv('OPENSILEX_ADMIN_PASSWORD', 'admin')
API_TIMEOUT = int(os.getenv('OPENSILEX_API_TIMEOUT', '30'))
TEST_PREFIX = os.getenv('OPENSILEX_TEST_PREFIX', 'test_automated_')


class APIClient:
    """OpenSILEX API client with authentication handling"""

    def __init__(self, api_url: str, timeout: int = 30):
        self.api_url = api_url
        self.timeout = timeout
        self.token: Optional[str] = None
        self.session = requests.Session()

    def authenticate(self, email: str, password: str) -> bool:
        """Authenticate and store JWT token"""
        try:
            response = self.session.post(
                f"{self.api_url}/security/authenticate",
                json={"identifier": email, "password": password},
                timeout=self.timeout
            )

            if response.status_code == 200:
                data = response.json()
                self.token = data.get('result', {}).get('token')
                return self.token is not None
            return False
        except Exception as e:
            print(f"Authentication failed: {e}")
            return False

    def get_headers(self) -> Dict[str, str]:
        """Get authentication headers"""
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        return headers

    def get(self, endpoint: str, params: Optional[Dict] = None) -> requests.Response:
        """GET request with authentication"""
        return self.session.get(
            f"{self.api_url}{endpoint}",
            headers=self.get_headers(),
            params=params,
            timeout=self.timeout
        )

    def post(self, endpoint: str, data: Dict[str, Any]) -> requests.Response:
        """POST request with authentication"""
        return self.session.post(
            f"{self.api_url}{endpoint}",
            headers=self.get_headers(),
            json=data,
            timeout=self.timeout
        )

    def put(self, endpoint: str, data: Dict[str, Any]) -> requests.Response:
        """PUT request with authentication"""
        return self.session.put(
            f"{self.api_url}{endpoint}",
            headers=self.get_headers(),
            json=data,
            timeout=self.timeout
        )

    def delete(self, endpoint: str) -> requests.Response:
        """DELETE request with authentication"""
        return self.session.delete(
            f"{self.api_url}{endpoint}",
            headers=self.get_headers(),
            timeout=self.timeout
        )


@pytest.fixture(scope="session")
def api_client():
    """Provide authenticated API client for all tests"""
    client = APIClient(API_URL, API_TIMEOUT)

    # Authenticate before any tests run
    if not client.authenticate(ADMIN_EMAIL, ADMIN_PASSWORD):
        pytest.fail("Failed to authenticate with OpenSILEX API")

    yield client


@pytest.fixture(scope="session")
def admin_token(api_client):
    """Provide admin JWT token"""
    return api_client.token


@pytest.fixture
def unique_id():
    """Generate unique ID for test entities"""
    return f"{TEST_PREFIX}{int(time.time() * 1000)}"


@pytest.fixture
def cleanup_tracker():
    """Track created entities for cleanup"""
    tracker = {
        'projects': [],
        'experiments': [],
        'devices': [],
        'data': [],
        'variables': []
    }

    yield tracker

    # Cleanup after test (if enabled)
    if os.getenv('OPENSILEX_CLEANUP_TEST_DATA', 'true').lower() == 'true':
        # Note: Cleanup will be handled by individual test files
        pass


@pytest.fixture
def test_project_data(unique_id):
    """Provide test project data"""
    return {
        "name": f"{unique_id}_project",
        "shortname": f"{unique_id}_prj",
        "description": "Automated test project",
        "objective": "Testing OpenSILEX API",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }


@pytest.fixture
def test_experiment_data(unique_id):
    """Provide test experiment data"""
    return {
        "name": f"{unique_id}_experiment",
        "objective": "Test experiment for API validation",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }


@pytest.fixture
def test_device_data(unique_id):
    """Provide test device data"""
    return {
        "name": f"{unique_id}_device",
        "rdf_type": "http://www.opensilex.org/vocabulary/oeso#SensingDevice",
        "description": "Test sensor device"
    }


def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "smoke: mark test as smoke test (quick validation)"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (slower)"
    )
    config.addinivalue_line(
        "markers", "regression: mark test as regression test"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers"""
    for item in items:
        # Add smoke marker to quick tests
        if "test_list" in item.nodeid or "test_get" in item.nodeid:
            item.add_marker(pytest.mark.smoke)

        # Add integration marker to workflow tests
        if "workflow" in item.nodeid or "integration" in item.parent.name:
            item.add_marker(pytest.mark.integration)

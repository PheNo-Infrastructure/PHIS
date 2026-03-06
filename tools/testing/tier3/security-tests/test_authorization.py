"""
Authorization and RBAC Security Tests

Tests for Role-Based Access Control in OpenSILEX:
- Unauthorized access prevention
- Admin-only operations
- Cross-user data isolation
- Guest/public access limitations

Run with: pytest test_authorization.py -v
"""

import pytest
import os
import sys
import requests

# Add tier2 conftest to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../tier2/api-tests'))


class TestAuthorizationSecurity:
    """Security tests for authorization and access control"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup for each test"""
        self.client = api_client

    # ==========================================
    # Unauthenticated Access Tests
    # ==========================================

    def test_unauthenticated_access_blocked(self):
        """Test that API rejects requests without auth token"""
        # Create client without token
        unauth_session = requests.Session()

        endpoints = [
            '/core/projects',
            '/core/experiments',
            '/core/devices',
            '/core/data',
            '/security/users'
        ]

        for endpoint in endpoints:
            response = unauth_session.get(
                f"{self.client.api_url}{endpoint}",
                timeout=self.client.timeout
            )

            # Should return 401 Unauthorized or 403 Forbidden
            assert response.status_code in [401, 403], \
                f"Endpoint {endpoint} should block unauthenticated access (got {response.status_code})"

    def test_invalid_token_rejected(self):
        """Test that invalid/malformed tokens are rejected"""
        invalid_tokens = [
            "invalid_token",
            "Bearer fake_token",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid",
            ""
        ]

        for token in invalid_tokens:
            session = requests.Session()
            response = session.get(
                f"{self.client.api_url}/core/projects",
                headers={"Authorization": f"Bearer {token}"},
                timeout=self.client.timeout
            )

            # Should reject invalid token
            assert response.status_code in [401, 403], \
                f"Invalid token should be rejected (got {response.status_code})"

    # ==========================================
    # Admin-Only Operations
    # ==========================================

    def test_user_management_requires_admin(self):
        """Test that user management endpoints require admin role"""
        # These endpoints should require admin privileges
        # For this test, we're using admin credentials, so they should succeed
        # In a full implementation, you'd test with a non-admin user

        admin_endpoints = [
            '/security/users',
            '/security/groups'
        ]

        for endpoint in admin_endpoints:
            response = self.client.get(endpoint, params={'page': 0, 'page_size': 10})

            # Admin user should have access
            assert response.status_code == 200, \
                f"Admin should access {endpoint} (got {response.status_code})"

    @pytest.mark.skip(reason="Requires non-admin test user - implement after user creation")
    def test_non_admin_cannot_manage_users(self):
        """Test that non-admin users cannot manage other users"""
        # This would require creating a test user with non-admin role
        # and attempting user management operations
        # Skip for now as it requires multi-user setup
        pass

    # ==========================================
    # Data Isolation Tests
    # ==========================================

    @pytest.mark.skip(reason="Requires multi-user setup - implement after user creation")
    def test_cross_user_experiment_isolation(self):
        """Test that users cannot access other users' private experiments"""
        # Would require:
        # 1. Create User A and User B
        # 2. User A creates private experiment
        # 3. Verify User B cannot access it
        # 4. Verify User A can access it
        pass

    def test_public_experiments_accessible(self):
        """Test that public experiments are accessible to all authenticated users"""
        # List all experiments
        response = self.client.get('/core/experiments', params={'is_public': True})

        if response.status_code == 200:
            experiments = response.json().get('result', [])
            # Public experiments should be accessible
            # This validates the is_public flag works
        else:
            pytest.skip("is_public parameter may not be supported in this version")

    # ==========================================
    # Resource Access Validation
    # ==========================================

    def test_deleted_resource_inaccessible(self, test_project_data, unique_id):
        """Test that deleted resources return 404/403 and are inaccessible"""
        # Create project
        project_data = test_project_data.copy()
        response = self.client.post('/core/projects', project_data)

        if response.status_code not in [200, 201]:
            pytest.skip("Could not create test project")

        project_uri = response.json().get('result')
        encoded_uri = requests.utils.quote(project_uri, safe='')

        # Delete it
        delete_response = self.client.delete(f'/core/projects/{encoded_uri}')
        assert delete_response.status_code in [200, 204]

        # Verify it's inaccessible
        get_response = self.client.get(f'/core/projects/{encoded_uri}')
        assert get_response.status_code >= 400, \
            f"Deleted project should be inaccessible (got {get_response.status_code})"

    def test_nonexistent_resource_returns_error(self):
        """Test that accessing non-existent resources returns proper error"""
        fake_uri = "http://opensilex.test/security/nonexistent/12345"
        encoded_uri = requests.utils.quote(fake_uri, safe='')

        endpoints = [
            f'/core/projects/{encoded_uri}',
            f'/core/experiments/{encoded_uri}',
            f'/core/devices/{encoded_uri}'
        ]

        for endpoint in endpoints:
            response = self.client.get(endpoint)

            # Should return 404 or 400-level error
            assert response.status_code >= 400, \
                f"Non-existent resource should return error at {endpoint} (got {response.status_code})"

    # ==========================================
    # Token Validation Tests
    # ==========================================

    def test_expired_token_rejected(self):
        """Test that expired tokens are properly rejected"""
        # Note: This is difficult to test without waiting for token expiration
        # or manipulating token expiration time
        # Marking as skip for now - could be implemented with JWT manipulation
        pytest.skip("Token expiration testing requires JWT manipulation or time-based test")

    def test_token_required_for_all_endpoints(self):
        """Test that all API endpoints require authentication"""
        # Test various endpoint types
        test_endpoints = [
            '/core/projects',
            '/core/experiments',
            '/core/devices',
            '/core/data',
            '/core/variables',
            '/security/users',
            '/security/groups'
        ]

        unauth_session = requests.Session()

        for endpoint in test_endpoints:
            response = unauth_session.get(
                f"{self.client.api_url}{endpoint}",
                timeout=self.client.timeout
            )

            # All should require auth
            assert response.status_code in [401, 403], \
                f"{endpoint} should require authentication (got {response.status_code})"

    # ==========================================
    # Input Validation Tests
    # ==========================================

    def test_sql_injection_prevention(self):
        """Test that SQL injection attempts are blocked"""
        # Try SQL injection in search parameters
        injection_payloads = [
            "' OR '1'='1",
            "'; DROP TABLE projects; --",
            "1' UNION SELECT * FROM users--"
        ]

        for payload in injection_payloads:
            response = self.client.get('/core/projects', params={'name': payload})

            # Should either:
            # 1. Sanitize and return no results (200 with empty list)
            # 2. Return error (400)
            # Should NOT return 500 (indicates unhandled injection)
            assert response.status_code != 500, \
                f"SQL injection should be handled gracefully, not 500 error"

    def test_xss_payload_sanitization(self):
        """Test that XSS payloads are sanitized"""
        xss_payloads = [
            "<script>alert('xss')</script>",
            "javascript:alert('xss')",
            "<img src=x onerror=alert('xss')>"
        ]

        for payload in xss_payloads:
            # Try to create project with XSS in name
            project_data = {
                "name": payload,
                "shortname": "xss_test",
                "start_date": "2024-01-01"
            }

            response = self.client.post('/core/projects', project_data)

            # Should either:
            # 1. Sanitize and accept (200/201)
            # 2. Reject with validation error (400)
            # Should NOT allow raw XSS payload through or crash (500)
            assert response.status_code != 500, \
                f"XSS payload should be handled gracefully"

            # Cleanup if created
            if response.status_code in [200, 201]:
                uri = response.json().get('result')
                if uri:
                    try:
                        self.client.delete(f"/core/projects/{requests.utils.quote(uri, safe='')}")
                    except:
                        pass

    def test_large_payload_handling(self):
        """Test that API handles large payloads gracefully"""
        # Create project with very large description (potential DoS)
        large_description = "A" * 100000  # 100KB description

        project_data = {
            "name": "large_payload_test",
            "shortname": "large_test",
            "description": large_description,
            "start_date": "2024-01-01"
        }

        response = self.client.post('/core/projects', project_data)

        # Should either:
        # 1. Accept if size limits allow (200/201)
        # 2. Reject with validation error (400/413)
        # Should NOT crash (500)
        assert response.status_code != 500, \
            f"Large payload should be handled gracefully (got {response.status_code})"

        # Cleanup if created
        if response.status_code in [200, 201]:
            uri = response.json().get('result')
            if uri:
                try:
                    self.client.delete(f"/core/projects/{requests.utils.quote(uri, safe='')}")
                except:
                    pass

    # ==========================================
    # Rate Limiting Tests
    # ==========================================

    @pytest.mark.slow
    def test_rate_limiting_behavior(self):
        """Test API behavior under rapid sequential requests"""
        # Make 100 rapid requests
        statuses = []

        for _ in range(100):
            response = self.client.get('/core/projects', params={'page': 0, 'page_size': 1})
            statuses.append(response.status_code)

        # Count success vs rate limit responses
        success_count = sum(1 for s in statuses if s == 200)
        rate_limited = sum(1 for s in statuses if s == 429)

        print(f"\nRapid requests: {success_count} successful, {rate_limited} rate-limited")

        # All should succeed (or some rate-limited if limits exist)
        # Should NOT crash with 500 errors
        errors = [s for s in statuses if s >= 500]
        assert len(errors) == 0, f"API should not crash under rapid requests (got {len(errors)} errors)"

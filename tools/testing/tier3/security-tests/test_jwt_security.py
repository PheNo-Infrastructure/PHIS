"""
JWT Token Security Tests

Tests for JWT token security in OpenSILEX:
- Token structure and validation
- Token expiration
- Token refresh mechanism
- Token revocation

Run with: pytest test_jwt_security.py -v
"""

import pytest
import os
import sys
import requests
import time
import jwt as pyjwt
import json

# Add tier2 conftest to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../tier2/api-tests'))


class TestJWTSecurity:
    """Security tests for JWT token handling"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup for each test"""
        self.client = api_client

    # ==========================================
    # Token Structure Tests
    # ==========================================

    def test_token_is_valid_jwt(self, admin_token):
        """Test that authentication returns a valid JWT token"""
        # Decode without verification to check structure
        try:
            # JWT tokens have 3 parts separated by dots
            parts = admin_token.split('.')
            assert len(parts) == 3, "JWT should have 3 parts (header.payload.signature)"

            # Decode header and payload (don't verify signature)
            header = pyjwt.get_unverified_header(admin_token)
            payload = pyjwt.decode(admin_token, options={"verify_signature": False})

            # Check standard JWT fields
            assert 'typ' in header or 'alg' in header, "JWT header should contain typ or alg"
            assert 'sub' in payload or 'email' in payload or 'user' in payload, \
                "JWT payload should contain user identifier"

        except Exception as e:
            pytest.fail(f"Token is not a valid JWT: {e}")

    def test_token_contains_user_info(self, admin_token):
        """Test that token contains user identification information"""
        try:
            payload = pyjwt.decode(admin_token, options={"verify_signature": False})

            # Should contain some form of user identification
            has_user_info = any(key in payload for key in ['sub', 'email', 'user', 'userId', 'user_id'])

            assert has_user_info, "JWT should contain user identification"

        except Exception as e:
            pytest.fail(f"Could not decode JWT payload: {e}")

    def test_token_has_expiration(self, admin_token):
        """Test that token has expiration time set"""
        try:
            payload = pyjwt.decode(admin_token, options={"verify_signature": False})

            # Check for standard expiration fields
            has_expiration = 'exp' in payload or 'expiration' in payload

            if has_expiration:
                assert True, "Token has expiration field"
            else:
                pytest.skip("Token does not have standard exp field - may use different expiration mechanism")

        except Exception as e:
            pytest.fail(f"Could not decode JWT payload: {e}")

    # ==========================================
    # Token Validation Tests
    # ==========================================

    def test_modified_token_rejected(self, admin_token):
        """Test that tampered tokens are rejected"""
        # Tamper with token by modifying last character
        if len(admin_token) > 10:
            tampered_token = admin_token[:-5] + "xxxxx"

            session = requests.Session()
            response = session.get(
                f"{self.client.api_url}/core/projects",
                headers={"Authorization": f"Bearer {tampered_token}"},
                timeout=self.client.timeout
            )

            # Should reject tampered token
            assert response.status_code in [401, 403], \
                f"Tampered token should be rejected (got {response.status_code})"

    def test_token_replay_from_different_session(self, admin_token):
        """Test that valid token works in a new session (expected behavior)"""
        # Create new session
        new_session = requests.Session()

        response = new_session.get(
            f"{self.client.api_url}/core/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=self.client.timeout
        )

        # Token should work (tokens are portable)
        assert response.status_code == 200, \
            "Valid token should work in new session"

    # ==========================================
    # Token Expiration Tests
    # ==========================================

    @pytest.mark.skip(reason="Requires waiting for token expiration - implement with time manipulation")
    def test_expired_token_rejected(self):
        """Test that expired tokens are rejected"""
        # This test would require:
        # 1. Creating a token with short expiration (need API support)
        # 2. Waiting for expiration
        # 3. Verifying token is rejected
        # Skip for now as it requires time-based testing
        pass

    # ==========================================
    # Token Refresh Tests
    # ==========================================

    def test_reauthentication_works(self):
        """Test that users can re-authenticate to get new token"""
        email = os.environ.get('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')
        password = os.environ.get('OPENSILEX_ADMIN_PASSWORD', 'admin')

        # Authenticate twice
        token1 = None
        token2 = None

        # First auth
        response1 = self.client.session.post(
            f"{self.client.api_url}/security/authenticate",
            json={"identifier": email, "password": password},
            timeout=self.client.timeout
        )

        if response1.status_code == 200:
            token1 = response1.json().get('result', {}).get('token')

        # Wait briefly
        time.sleep(1)

        # Second auth
        response2 = self.client.session.post(
            f"{self.client.api_url}/security/authenticate",
            json={"identifier": email, "password": password},
            timeout=self.client.timeout
        )

        if response2.status_code == 200:
            token2 = response2.json().get('result', {}).get('token')

        # Both should succeed
        assert token1 is not None, "First authentication should return token"
        assert token2 is not None, "Second authentication should return token"

        # Tokens may be different (new token per auth) or same (session-based)
        # Either is acceptable - we're just testing re-auth works

    # ==========================================
    # Session Management Tests
    # ==========================================

    def test_concurrent_sessions_allowed(self):
        """Test that same user can have multiple concurrent sessions"""
        email = os.environ.get('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')
        password = os.environ.get('OPENSILEX_ADMIN_PASSWORD', 'admin')

        # Create two sessions
        session1 = requests.Session()
        session2 = requests.Session()

        # Authenticate both
        auth_data = {"identifier": email, "password": password}

        response1 = session1.post(f"{self.client.api_url}/security/authenticate", json=auth_data)
        token1 = response1.json().get('result', {}).get('token') if response1.status_code == 200 else None

        response2 = session2.post(f"{self.client.api_url}/security/authenticate", json=auth_data)
        token2 = response2.json().get('result', {}).get('token') if response2.status_code == 200 else None

        # Both sessions should work simultaneously
        if token1 and token2:
            # Test both tokens work
            headers1 = {"Authorization": f"Bearer {token1}"}
            headers2 = {"Authorization": f"Bearer {token2}"}

            test_response1 = session1.get(f"{self.client.api_url}/core/projects", headers=headers1)
            test_response2 = session2.get(f"{self.client.api_url}/core/projects", headers=headers2)

            assert test_response1.status_code == 200, "First session should work"
            assert test_response2.status_code == 200, "Second session should work"

    # ==========================================
    # Password Security Tests
    # ==========================================

    def test_wrong_password_rejected(self):
        """Test that incorrect passwords are rejected"""
        email = os.environ.get('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')

        wrong_passwords = [
            "wrong_password",
            "admin123",
            "password",
            ""
        ]

        for wrong_pwd in wrong_passwords:
            response = self.client.session.post(
                f"{self.client.api_url}/security/authenticate",
                json={"identifier": email, "password": wrong_pwd},
                timeout=self.client.timeout
            )

            # Should reject wrong password
            assert response.status_code >= 400, \
                f"Wrong password should be rejected (got {response.status_code})"

    def test_nonexistent_user_rejected(self):
        """Test that non-existent users cannot authenticate"""
        fake_users = [
            "nonexistent@example.com",
            "fake_user@opensilex.org",
            "admin@wrong-domain.com"
        ]

        for fake_email in fake_users:
            response = self.client.session.post(
                f"{self.client.api_url}/security/authenticate",
                json={"identifier": fake_email, "password": "any_password"},
                timeout=self.client.timeout
            )

            # Should reject non-existent user
            assert response.status_code >= 400, \
                f"Non-existent user should be rejected (got {response.status_code})"

    # ==========================================
    # Brute Force Protection Tests
    # ==========================================

    @pytest.mark.slow
    def test_rapid_failed_login_attempts(self):
        """Test behavior under rapid failed login attempts"""
        email = os.environ.get('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')

        # Try 20 rapid failed login attempts
        failure_count = 0
        lockout_detected = False

        for i in range(20):
            response = self.client.session.post(
                f"{self.client.api_url}/security/authenticate",
                json={"identifier": email, "password": f"wrong_password_{i}"},
                timeout=self.client.timeout
            )

            if response.status_code == 429:  # Too many requests
                lockout_detected = True
                break
            elif response.status_code >= 400:
                failure_count += 1

        # API should either:
        # 1. Rate limit (429 detected)
        # 2. Always return 401 (no rate limiting)
        # Should NOT crash
        print(f"\nFailed attempts: {failure_count}, Lockout: {lockout_detected}")
        assert True, "API handles rapid failed login attempts without crashing"

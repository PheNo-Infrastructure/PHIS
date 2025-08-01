#!/usr/bin/env python3
"""
Keycloak authentication manager for OpenSilex API client.

This utility handles OAuth2/OIDC authentication with Keycloak,
token management, and session setup.
"""

import os
import json
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging
from urllib.parse import urlencode, parse_qs, urlparse
import base64
import secrets
import hashlib

logger = logging.getLogger(__name__)

class KeycloakAuthManager:
    """Manages Keycloak OAuth2/OIDC authentication for OpenSilex API."""
    
    def __init__(self, 
                 keycloak_url: str = None,
                 realm: str = None,
                 client_id: str = None,
                 client_secret: str = None,
                 redirect_uri: str = None,
                 token_file: str = None):
        """
        Initialize the Keycloak auth manager.
        
        Args:
            keycloak_url: Keycloak server base URL (e.g., "http://localhost:8080")
            realm: Keycloak realm name
            client_id: OAuth2 client ID
            client_secret: OAuth2 client secret (optional for public clients)
            redirect_uri: OAuth2 redirect URI
            token_file: Path to store/load authentication tokens
        """
        self.keycloak_url = keycloak_url or os.getenv('KEYCLOAK_URL', 'http://localhost:8080')
        self.realm = realm or os.getenv('KEYCLOAK_REALM', 'master')
        self.client_id = client_id or os.getenv('KEYCLOAK_CLIENT_ID', 'opensilex-client')
        self.client_secret = client_secret or os.getenv('KEYCLOAK_CLIENT_SECRET')
        self.redirect_uri = redirect_uri or os.getenv('KEYCLOAK_REDIRECT_URI', 'http://localhost:8080/callback')
        self.token_file = token_file or os.path.expanduser('~/.opensilex_keycloak_token.json')
        
        # OAuth2 endpoints
        self.base_url = f"{self.keycloak_url}/realms/{self.realm}/protocol/openid-connect"
        self.auth_url = f"{self.base_url}/auth"
        self.token_url = f"{self.base_url}/token"
        self.userinfo_url = f"{self.base_url}/userinfo"
        self.logout_url = f"{self.base_url}/logout"
        
        self.token_data = None
        logger.info(f"Keycloak auth manager initialized for realm: {self.realm}")
    
    def get_authorization_url(self, state: str = None) -> tuple[str, str]:
        """
        Generate authorization URL for OAuth2 authorization code flow.
        
        Args:
            state: OAuth2 state parameter for CSRF protection
            
        Returns:
            Tuple of (authorization_url, state)
        """
        if not state:
            state = secrets.token_urlsafe(32)
        
        # Generate PKCE parameters for enhanced security
        code_verifier = secrets.token_urlsafe(32)
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        ).decode().rstrip('=')
        
        params = {
            'response_type': 'code',
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'scope': 'openid profile email',
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'
        }
        
        # Store code verifier for later use
        self._store_code_verifier(code_verifier, state)
        
        auth_url = f"{self.auth_url}?{urlencode(params)}"
        logger.info(f"Generated authorization URL for state: {state}")
        return auth_url, state
    
    def authenticate_with_code(self, authorization_code: str, state: str) -> bool:
        """
        Complete OAuth2 authentication using authorization code.
        
        Args:
            authorization_code: Authorization code from callback
            state: State parameter for verification
            
        Returns:
            True if authentication successful, False otherwise
        """
        try:
            logger.info("Exchanging authorization code for tokens")
            
            # Retrieve code verifier
            code_verifier = self._get_code_verifier(state)
            if not code_verifier:
                logger.error("Code verifier not found for state")
                return False
            
            # Exchange code for tokens
            token_data = {
                'grant_type': 'authorization_code',
                'client_id': self.client_id,
                'code': authorization_code,
                'redirect_uri': self.redirect_uri,
                'code_verifier': code_verifier
            }
            
            # Add client secret for confidential clients
            if self.client_secret:
                token_data['client_secret'] = self.client_secret
            
            response = requests.post(
                self.token_url,
                data=token_data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if response.status_code == 200:
                token_response = response.json()
                
                # Store token data
                self.token_data = {
                    'access_token': token_response.get('access_token'),
                    'refresh_token': token_response.get('refresh_token'),
                    'id_token': token_response.get('id_token'),
                    'token_type': token_response.get('token_type', 'Bearer'),
                    'expires_in': token_response.get('expires_in', 3600),
                    'scope': token_response.get('scope'),
                    'expires_at': (datetime.now() + timedelta(seconds=token_response.get('expires_in', 3600))).isoformat(),
                    'authenticated_at': datetime.now().isoformat()
                }
                
                # Get user info
                user_info = self._get_user_info()
                if user_info:
                    self.token_data.update(user_info)
                
                self._save_token()
                logger.info("Keycloak authentication successful")
                return True
            else:
                logger.error(f"Token exchange failed: HTTP {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return False
        finally:
            # Clean up code verifier
            self._cleanup_code_verifier(state)
    
    def authenticate_with_password(self, username: str, password: str) -> bool:
        """
        Authenticate using Resource Owner Password Credentials Grant (direct access).
        Note: This requires the client to have direct access grants enabled in Keycloak.
        
        Args:
            username: Username
            password: Password
            
        Returns:
            True if authentication successful, False otherwise
        """
        try:
            logger.info(f"Attempting direct authentication for user: {username}")
            
            token_data = {
                'grant_type': 'password',
                'client_id': self.client_id,
                'username': username,
                'password': password,
                'scope': 'openid profile email'
            }
            
            # Add client secret for confidential clients
            if self.client_secret:
                token_data['client_secret'] = self.client_secret
            
            response = requests.post(
                self.token_url,
                data=token_data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if response.status_code == 200:
                token_response = response.json()
                
                # Store token data
                self.token_data = {
                    'access_token': token_response.get('access_token'),
                    'refresh_token': token_response.get('refresh_token'),
                    'id_token': token_response.get('id_token'),
                    'token_type': token_response.get('token_type', 'Bearer'),
                    'expires_in': token_response.get('expires_in', 3600),
                    'scope': token_response.get('scope'),
                    'expires_at': (datetime.now() + timedelta(seconds=token_response.get('expires_in', 3600))).isoformat(),
                    'authenticated_at': datetime.now().isoformat(),
                    'username': username
                }
                
                # Get user info
                user_info = self._get_user_info()
                if user_info:
                    self.token_data.update(user_info)
                
                self._save_token()
                logger.info("Direct password authentication successful")
                return True
            else:
                logger.error(f"Direct authentication failed: HTTP {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Direct authentication failed: {e}")
            return False
    
    def refresh_token(self) -> bool:
        """
        Refresh the access token using the refresh token.
        
        Returns:
            True if refresh successful, False otherwise
        """
        if not self.token_data or not self.token_data.get('refresh_token'):
            logger.error("No refresh token available")
            return False
        
        try:
            logger.info("Refreshing access token")
            
            refresh_data = {
                'grant_type': 'refresh_token',
                'client_id': self.client_id,
                'refresh_token': self.token_data['refresh_token']
            }
            
            # Add client secret for confidential clients
            if self.client_secret:
                refresh_data['client_secret'] = self.client_secret
            
            response = requests.post(
                self.token_url,
                data=refresh_data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if response.status_code == 200:
                token_response = response.json()
                
                # Update token data
                self.token_data.update({
                    'access_token': token_response.get('access_token'),
                    'refresh_token': token_response.get('refresh_token', self.token_data['refresh_token']),
                    'expires_in': token_response.get('expires_in', 3600),
                    'expires_at': (datetime.now() + timedelta(seconds=token_response.get('expires_in', 3600))).isoformat()
                })
                
                self._save_token()
                logger.info("Token refresh successful")
                return True
            else:
                logger.error(f"Token refresh failed: HTTP {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            return False
    
    def load_saved_token(self) -> bool:
        """
        Load a previously saved authentication token.
        
        Returns:
            True if token loaded and still valid, False otherwise
        """
        try:
            if not os.path.exists(self.token_file):
                logger.info("No saved Keycloak token file found")
                return False
            
            with open(self.token_file, 'r') as f:
                self.token_data = json.load(f)
            
            # Check if token is expired
            expires_at = datetime.fromisoformat(self.token_data['expires_at'])
            if datetime.now() >= expires_at:
                logger.info("Saved token has expired, attempting refresh")
                return self.refresh_token()
            
            logger.info(f"Loaded saved Keycloak token for user: {self.token_data.get('username', 'unknown')}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load saved token: {e}")
            return False
    
    def is_authenticated(self) -> bool:
        """Check if currently authenticated with a valid token."""
        if not self.token_data or not self.token_data.get('access_token'):
            return False
        
        try:
            expires_at = datetime.fromisoformat(self.token_data['expires_at'])
            return datetime.now() < expires_at
        except:
            return False
    
    def get_access_token(self) -> Optional[str]:
        """
        Get the current access token.
        
        Returns:
            Access token if authenticated, None otherwise
        """
        if not self.is_authenticated():
            return None
        return self.token_data.get('access_token')
    
    def get_auth_header(self) -> Optional[str]:
        """
        Get the authorization header value.
        
        Returns:
            Authorization header value if authenticated, None otherwise
        """
        token = self.get_access_token()
        if token:
            return f"Bearer {token}"
        return None
    
    def logout(self, revoke_tokens: bool = True):
        """
        Logout and optionally revoke tokens.
        
        Args:
            revoke_tokens: Whether to revoke tokens with Keycloak
        """
        if revoke_tokens and self.token_data:
            try:
                # Revoke refresh token
                if self.token_data.get('refresh_token'):
                    revoke_data = {
                        'client_id': self.client_id,
                        'token': self.token_data['refresh_token'],
                        'token_type_hint': 'refresh_token'
                    }
                    
                    if self.client_secret:
                        revoke_data['client_secret'] = self.client_secret
                    
                    revoke_url = f"{self.base_url}/revoke"
                    requests.post(
                        revoke_url,
                        data=revoke_data,
                        headers={'Content-Type': 'application/x-www-form-urlencoded'}
                    )
                    logger.info("Tokens revoked with Keycloak")
            except Exception as e:
                logger.warning(f"Failed to revoke tokens: {e}")
        
        # Clear local token data
        self.token_data = None
        if os.path.exists(self.token_file):
            os.remove(self.token_file)
        
        logger.info("Logged out successfully")
    
    def get_token_info(self) -> Optional[Dict[str, Any]]:
        """Get information about the current token."""
        if not self.token_data:
            return None
        
        return {
            'username': self.token_data.get('username') or self.token_data.get('preferred_username'),
            'email': self.token_data.get('email'),
            'name': self.token_data.get('name'),
            'authenticated_at': self.token_data.get('authenticated_at'),
            'expires_at': self.token_data.get('expires_at'),
            'is_valid': self.is_authenticated(),
            'scope': self.token_data.get('scope'),
            'auth_method': 'keycloak'
        }
    
    def _get_user_info(self) -> Optional[Dict[str, Any]]:
        """Get user information from Keycloak userinfo endpoint."""
        if not self.token_data or not self.token_data.get('access_token'):
            return None
        
        try:
            response = requests.get(
                self.userinfo_url,
                headers={'Authorization': f"Bearer {self.token_data['access_token']}"}
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"Failed to get user info: HTTP {response.status_code}")
                return None
                
        except Exception as e:
            logger.warning(f"Failed to get user info: {e}")
            return None
    
    def _save_token(self):
        """Save the current token to file."""
        try:
            os.makedirs(os.path.dirname(self.token_file), exist_ok=True)
            with open(self.token_file, 'w') as f:
                json.dump(self.token_data, f, indent=2)
            logger.info(f"Keycloak token saved to: {self.token_file}")
        except Exception as e:
            logger.error(f"Failed to save token: {e}")
    
    def _store_code_verifier(self, code_verifier: str, state: str):
        """Store PKCE code verifier temporarily."""
        verifier_file = os.path.expanduser(f'~/.opensilex_pkce_{state}.tmp')
        try:
            with open(verifier_file, 'w') as f:
                f.write(code_verifier)
        except Exception as e:
            logger.error(f"Failed to store code verifier: {e}")
    
    def _get_code_verifier(self, state: str) -> Optional[str]:
        """Retrieve PKCE code verifier."""
        verifier_file = os.path.expanduser(f'~/.opensilex_pkce_{state}.tmp')
        try:
            if os.path.exists(verifier_file):
                with open(verifier_file, 'r') as f:
                    return f.read().strip()
        except Exception as e:
            logger.error(f"Failed to retrieve code verifier: {e}")
        return None
    
    def _cleanup_code_verifier(self, state: str):
        """Clean up PKCE code verifier file."""
        verifier_file = os.path.expanduser(f'~/.opensilex_pkce_{state}.tmp')
        try:
            if os.path.exists(verifier_file):
                os.remove(verifier_file)
        except Exception as e:
            logger.error(f"Failed to cleanup code verifier: {e}")


def create_keycloak_auth_manager(**kwargs) -> KeycloakAuthManager:
    """
    Convenience function to create a Keycloak auth manager.
    
    Args:
        **kwargs: Arguments to pass to KeycloakAuthManager constructor
        
    Returns:
        Configured Keycloak auth manager
    """
    return KeycloakAuthManager(**kwargs)


def quick_keycloak_auth(username: str = None, password: str = None, **kwargs) -> KeycloakAuthManager:
    """
    Quick Keycloak authentication helper using direct password grant.
    
    Args:
        username: Username (will prompt if not provided)
        password: Password (will prompt if not provided)
        **kwargs: Additional arguments for KeycloakAuthManager
        
    Returns:
        Authenticated Keycloak auth manager
    """
    import getpass
    
    auth_manager = create_keycloak_auth_manager(**kwargs)
    
    # Try to load saved token first
    if auth_manager.load_saved_token():
        token_info = auth_manager.get_token_info()
        print(f"Using saved Keycloak authentication for user: {token_info.get('username', 'unknown')}")
        return auth_manager
    
    # If no saved token, authenticate with password
    if not username:
        username = input("Username: ")
    if not password:
        password = getpass.getpass("Password: ")
    
    if auth_manager.authenticate_with_password(username, password):
        print("Keycloak authentication successful!")
        return auth_manager
    else:
        raise Exception("Keycloak authentication failed")


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)
    
    try:
        # For testing, you can use direct password authentication
        auth_manager = quick_keycloak_auth()
        print("Token info:", auth_manager.get_token_info())
        print("Access token:", auth_manager.get_access_token())
        
    except Exception as e:
        print(f"Error: {e}")
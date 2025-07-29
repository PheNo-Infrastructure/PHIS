#!/usr/bin/env python3
"""
Authentication manager for OpenSilex API client.

This utility handles authentication, token management, and session setup.
"""

import opensilex_swagger_client
import os
import json
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class OpenSilexAuthManager:
    """Manages authentication and token handling for OpenSilex API."""
    
    def __init__(self, host: str = None, token_file: str = None):
        """
        Initialize the auth manager.
        
        Args:
            host: OpenSilex server URL (e.g., "http://98.71.237.204:8666")
            token_file: Path to store/load authentication tokens
        """
        self.host = host or os.getenv('OPENSILEX_HOST', 'http://98.71.237.204:8666')
        self.token_file = token_file or os.path.expanduser('~/.opensilex_token.json')
        self.api_client = None
        self.token_data = None
        self._setup_client()
    
    def _setup_client(self):
        """Setup the API client with host configuration."""
        self.api_client = opensilex_swagger_client.ApiClient()
        # Ensure the host includes the /rest API path
        api_host = self.host.rstrip('/') + '/rest'
        self.api_client.configuration.host = api_host
        logger.info(f"API client configured for host: {api_host}")
    
    def authenticate(self, username: str, password: str, save_token: bool = True) -> bool:
        """
        Authenticate with the OpenSilex server.
        
        Args:
            username: Username for authentication
            password: Password for authentication
            save_token: Whether to save the token to file for reuse
            
        Returns:
            True if authentication successful, False otherwise
        """
        try:
            logger.info(f"Attempting authentication for user: {username}")
            
            # Make direct HTTP request to authentication endpoint
            auth_url = f"{self.host.rstrip('/')}/rest/security/authenticate"
            auth_data = {
                "identifier": username,
                "password": password
            }
            
            response = requests.post(
                auth_url,
                json=auth_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                response_data = response.json()
                
                if 'result' in response_data and 'token' in response_data['result']:
                    token = response_data['result']['token']
                    
                    self.token_data = {
                        'token': token,
                        'expires_at': (datetime.now() + timedelta(hours=1)).isoformat(),  # JWT tokens typically expire in 1 hour
                        'username': username,
                        'authenticated_at': datetime.now().isoformat()
                    }
                    
                    # Set the token in the API client
                    self._set_auth_header(token)
                    
                    if save_token:
                        self._save_token()
                    
                    logger.info("Authentication successful")
                    return True
                else:
                    logger.error(f"Authentication failed: No token in response. Response: {response_data}")
                    return False
            else:
                logger.error(f"Authentication failed: HTTP {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return False
    
    def load_saved_token(self) -> bool:
        """
        Load a previously saved authentication token.
        
        Returns:
            True if token loaded and still valid, False otherwise
        """
        try:
            if not os.path.exists(self.token_file):
                logger.info("No saved token file found")
                return False
            
            with open(self.token_file, 'r') as f:
                self.token_data = json.load(f)
            
            # Check if token is expired
            expires_at = datetime.fromisoformat(self.token_data['expires_at'])
            if datetime.now() >= expires_at:
                logger.info("Saved token has expired")
                return False
            
            # Set the token in the API client
            self._set_auth_header(self.token_data['token'])
            logger.info(f"Loaded saved token for user: {self.token_data.get('username', 'unknown')}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load saved token: {e}")
            return False
    
    def _set_auth_header(self, token: str):
        """Set the authorization header in the API client."""
        self.api_client.set_default_header('Authorization', f'Bearer {token}')
    
    def _save_token(self):
        """Save the current token to file."""
        try:
            os.makedirs(os.path.dirname(self.token_file), exist_ok=True)
            with open(self.token_file, 'w') as f:
                json.dump(self.token_data, f, indent=2)
            logger.info(f"Token saved to: {self.token_file}")
        except Exception as e:
            logger.error(f"Failed to save token: {e}")
    
    def is_authenticated(self) -> bool:
        """Check if currently authenticated with a valid token."""
        if not self.token_data:
            return False
        
        try:
            expires_at = datetime.fromisoformat(self.token_data['expires_at'])
            return datetime.now() < expires_at
        except:
            return False
    
    def get_authenticated_client(self) -> opensilex_swagger_client.ApiClient:
        """
        Get an authenticated API client.
        
        Returns:
            Configured and authenticated API client
            
        Raises:
            Exception: If not authenticated
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated. Call authenticate() first.")
        return self.api_client
    
    def logout(self):
        """Clear authentication data and remove saved token."""
        self.token_data = None
        if os.path.exists(self.token_file):
            os.remove(self.token_file)
        
        # Clear auth header
        if self.api_client and hasattr(self.api_client, 'default_headers'):
            self.api_client.default_headers.pop('Authorization', None)
        
        logger.info("Logged out successfully")
    
    def get_token_info(self) -> Optional[Dict[str, Any]]:
        """Get information about the current token."""
        if not self.token_data:
            return None
        
        return {
            'username': self.token_data.get('username'),
            'authenticated_at': self.token_data.get('authenticated_at'),
            'expires_at': self.token_data.get('expires_at'),
            'is_valid': self.is_authenticated()
        }

def create_auth_manager(host: str = None) -> OpenSilexAuthManager:
    """
    Convenience function to create an auth manager.
    
    Args:
        host: OpenSilex server URL
        
    Returns:
        Configured auth manager
    """
    return OpenSilexAuthManager(host=host)

def quick_auth(username: str = None, password: str = None, host: str = None) -> OpenSilexAuthManager:
    """
    Quick authentication helper.
    
    Args:
        username: Username (will prompt if not provided)
        password: Password (will prompt if not provided)
        host: Server host
        
    Returns:
        Authenticated auth manager
    """
    import getpass
    
    auth_manager = create_auth_manager(host)
    
    # Try to load saved token first
    if auth_manager.load_saved_token():
        print(f"Using saved authentication for user: {auth_manager.token_data['username']}")
        return auth_manager
    
    # If no saved token, authenticate
    if not username:
        username = input("Username: ")
    if not password:
        password = getpass.getpass("Password: ")
    
    if auth_manager.authenticate(username, password):
        print("Authentication successful!")
        return auth_manager
    else:
        raise Exception("Authentication failed")

if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)
    
    try:
        auth_manager = quick_auth()
        print("Token info:", auth_manager.get_token_info())
        
        # Get authenticated client for use with APIs
        client = auth_manager.get_authenticated_client()
        print("Authenticated client ready for API calls")
        
    except Exception as e:
        print(f"Error: {e}")
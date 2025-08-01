#!/usr/bin/env python3
"""
Unified authentication manager that supports both OpenSilex and Keycloak authentication.

This utility provides a single interface for authentication that can use
either the native OpenSilex authentication or Keycloak OAuth2/OIDC.
"""

import logging
from typing import Optional, Dict, Any, Union
from enum import Enum

from .auth_manager import OpenSilexAuthManager
from .keycloak_auth import KeycloakAuthManager

logger = logging.getLogger(__name__)

class AuthMethod(Enum):
    """Supported authentication methods."""
    OPENSILEX = "opensilex"
    KEYCLOAK = "keycloak"
    AUTO = "auto"

class UnifiedAuthManager:
    """
    Unified authentication manager supporting multiple auth methods.
    
    This class provides a single interface that can authenticate using
    either OpenSilex native auth or Keycloak OAuth2/OIDC.
    """
    
    def __init__(self, 
                 auth_method: Union[str, AuthMethod] = AuthMethod.AUTO,
                 opensilex_host: str = None,
                 keycloak_config: Dict[str, Any] = None,
                 **kwargs):
        """
        Initialize the unified auth manager.
        
        Args:
            auth_method: Authentication method to use ('opensilex', 'keycloak', or 'auto')
            opensilex_host: OpenSilex server URL (for OpenSilex auth)
            keycloak_config: Keycloak configuration dict with keys:
                           keycloak_url, realm, client_id, client_secret, redirect_uri
            **kwargs: Additional arguments passed to auth managers
        """
        if isinstance(auth_method, str):
            auth_method = AuthMethod(auth_method.lower())
        
        self.auth_method = auth_method
        self.opensilex_host = opensilex_host
        self.keycloak_config = keycloak_config or {}
        self.kwargs = kwargs
        
        # Auth manager instances
        self.opensilex_auth = None
        self.keycloak_auth = None
        self.active_auth = None
        
        logger.info(f"Unified auth manager initialized with method: {auth_method.value}")
    
    def authenticate(self, username: str = None, password: str = None, **auth_kwargs) -> bool:
        """
        Authenticate using the configured method.
        
        Args:
            username: Username
            password: Password
            **auth_kwargs: Additional authentication arguments
            
        Returns:
            True if authentication successful, False otherwise
        """
        if self.auth_method == AuthMethod.AUTO:
            return self._auto_authenticate(username, password, **auth_kwargs)
        elif self.auth_method == AuthMethod.OPENSILEX:
            return self._authenticate_opensilex(username, password, **auth_kwargs)
        elif self.auth_method == AuthMethod.KEYCLOAK:
            return self._authenticate_keycloak(username, password, **auth_kwargs)
        else:
            raise ValueError(f"Unsupported auth method: {self.auth_method}")
    
    def _auto_authenticate(self, username: str = None, password: str = None, **auth_kwargs) -> bool:
        """
        Automatically try authentication methods in order of preference.
        
        Args:
            username: Username
            password: Password
            **auth_kwargs: Additional authentication arguments
            
        Returns:
            True if any authentication method successful, False otherwise
        """
        logger.info("Attempting auto-authentication")
        
        # Try to load saved tokens first
        if self._try_load_saved_tokens():
            return True
        
        # Try Keycloak first if configured
        if self.keycloak_config and self.keycloak_config.get('keycloak_url'):
            logger.info("Trying Keycloak authentication")
            if self._authenticate_keycloak(username, password, **auth_kwargs):
                return True
        
        # Fall back to OpenSilex authentication
        logger.info("Trying OpenSilex authentication")
        return self._authenticate_opensilex(username, password, **auth_kwargs)
    
    def _authenticate_opensilex(self, username: str = None, password: str = None, **auth_kwargs) -> bool:
        """Authenticate using OpenSilex native authentication."""
        try:
            if not self.opensilex_auth:
                self.opensilex_auth = OpenSilexAuthManager(
                    host=self.opensilex_host,
                    **self.kwargs
                )
            
            # Try loading saved token first
            if self.opensilex_auth.load_saved_token():
                self.active_auth = self.opensilex_auth
                logger.info("Using saved OpenSilex authentication")
                return True
            
            # If no username/password provided, use interactive auth
            if not username or not password:
                from .auth_manager import quick_auth
                self.opensilex_auth = quick_auth(username, password, host=self.opensilex_host)
                self.active_auth = self.opensilex_auth
                return True
            
            # Authenticate with provided credentials
            if self.opensilex_auth.authenticate(username, password, **auth_kwargs):
                self.active_auth = self.opensilex_auth
                logger.info("OpenSilex authentication successful")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"OpenSilex authentication failed: {e}")
            return False
    
    def _authenticate_keycloak(self, username: str = None, password: str = None, **auth_kwargs) -> bool:
        """Authenticate using Keycloak OAuth2/OIDC."""
        try:
            if not self.keycloak_auth:
                self.keycloak_auth = KeycloakAuthManager(
                    **self.keycloak_config,
                    **self.kwargs
                )
            
            # Try loading saved token first
            if self.keycloak_auth.load_saved_token():
                self.active_auth = self.keycloak_auth
                logger.info("Using saved Keycloak authentication")
                return True
            
            # If no username/password provided, use interactive auth
            if not username or not password:
                from .keycloak_auth import quick_keycloak_auth
                self.keycloak_auth = quick_keycloak_auth(username, password, **self.keycloak_config)
                self.active_auth = self.keycloak_auth
                return True
            
            # Authenticate with provided credentials (direct password grant)
            if self.keycloak_auth.authenticate_with_password(username, password, **auth_kwargs):
                self.active_auth = self.keycloak_auth
                logger.info("Keycloak authentication successful")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Keycloak authentication failed: {e}")
            return False
    
    def _try_load_saved_tokens(self) -> bool:
        """Try to load saved tokens from both auth methods."""
        # Try Keycloak first if configured
        if self.keycloak_config and self.keycloak_config.get('keycloak_url'):
            try:
                if not self.keycloak_auth:
                    self.keycloak_auth = KeycloakAuthManager(**self.keycloak_config, **self.kwargs)
                
                if self.keycloak_auth.load_saved_token():
                    self.active_auth = self.keycloak_auth
                    logger.info("Loaded saved Keycloak token")
                    return True
            except Exception as e:
                logger.debug(f"Failed to load Keycloak token: {e}")
        
        # Try OpenSilex
        try:
            if not self.opensilex_auth:
                self.opensilex_auth = OpenSilexAuthManager(host=self.opensilex_host, **self.kwargs)
            
            if self.opensilex_auth.load_saved_token():
                self.active_auth = self.opensilex_auth
                logger.info("Loaded saved OpenSilex token")
                return True
        except Exception as e:
            logger.debug(f"Failed to load OpenSilex token: {e}")
        
        return False
    
    def is_authenticated(self) -> bool:
        """Check if currently authenticated."""
        return self.active_auth is not None and self.active_auth.is_authenticated()
    
    def get_auth_header(self) -> Optional[str]:
        """
        Get the authorization header value.
        
        Returns:
            Authorization header value if authenticated, None otherwise
        """
        if not self.active_auth:
            return None
        
        if hasattr(self.active_auth, 'get_auth_header'):
            # Keycloak auth manager
            return self.active_auth.get_auth_header()
        elif hasattr(self.active_auth, 'token_data'):
            # OpenSilex auth manager
            if self.active_auth.token_data and self.active_auth.token_data.get('token'):
                return f"Bearer {self.active_auth.token_data['token']}"
        
        return None
    
    def get_authenticated_client(self):
        """
        Get an authenticated API client.
        
        Returns:
            Configured and authenticated API client
            
        Raises:
            Exception: If not authenticated
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated. Call authenticate() first.")
        
        if hasattr(self.active_auth, 'get_authenticated_client'):
            return self.active_auth.get_authenticated_client()
        else:
            raise Exception("Active authentication method does not support API client")
    
    def get_token_info(self) -> Optional[Dict[str, Any]]:
        """Get information about the current token."""
        if not self.active_auth:
            return None
        
        token_info = self.active_auth.get_token_info()
        if token_info:
            # Add auth method info
            if isinstance(self.active_auth, KeycloakAuthManager):
                token_info['auth_method'] = 'keycloak'
            elif isinstance(self.active_auth, OpenSilexAuthManager):
                token_info['auth_method'] = 'opensilex'
        
        return token_info
    
    def refresh_token(self) -> bool:
        """
        Refresh the current token if supported.
        
        Returns:
            True if refresh successful, False otherwise
        """
        if not self.active_auth:
            return False
        
        if hasattr(self.active_auth, 'refresh_token'):
            return self.active_auth.refresh_token()
        
        logger.warning("Active authentication method does not support token refresh")
        return False
    
    def logout(self):
        """Logout from all authentication methods."""
        if self.keycloak_auth:
            self.keycloak_auth.logout()
        
        if self.opensilex_auth:
            self.opensilex_auth.logout()
        
        self.active_auth = None
        logger.info("Logged out from all authentication methods")
    
    def get_active_auth_method(self) -> Optional[str]:
        """Get the currently active authentication method."""
        if not self.active_auth:
            return None
        
        if isinstance(self.active_auth, KeycloakAuthManager):
            return 'keycloak'
        elif isinstance(self.active_auth, OpenSilexAuthManager):
            return 'opensilex'
        
        return 'unknown'


def create_unified_auth_manager(**kwargs) -> UnifiedAuthManager:
    """
    Convenience function to create a unified auth manager.
    
    Args:
        **kwargs: Arguments to pass to UnifiedAuthManager constructor
        
    Returns:
        Configured unified auth manager
    """
    return UnifiedAuthManager(**kwargs)


def quick_unified_auth(username: str = None, password: str = None, **config) -> UnifiedAuthManager:
    """
    Quick authentication helper using unified auth manager.
    
    Args:
        username: Username (will prompt if not provided)
        password: Password (will prompt if not provided)
        **config: Configuration for auth methods
        
    Returns:
        Authenticated unified auth manager
    """
    auth_manager = create_unified_auth_manager(**config)
    
    if auth_manager.authenticate(username, password):
        token_info = auth_manager.get_token_info()
        auth_method = auth_manager.get_active_auth_method()
        print(f"Authentication successful using {auth_method} for user: {token_info.get('username', 'unknown')}")
        return auth_manager
    else:
        raise Exception("Authentication failed with all configured methods")


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)
    
    try:
        # Example with auto-detection
        auth_manager = quick_unified_auth(
            auth_method='auto',
            opensilex_host='http://98.71.237.204:8666',
            keycloak_config={
                'keycloak_url': 'http://localhost:8080',
                'realm': 'master',
                'client_id': 'opensilex-client'
            }
        )
        
        print("Token info:", auth_manager.get_token_info())
        print("Active method:", auth_manager.get_active_auth_method())
        
    except Exception as e:
        print(f"Error: {e}")
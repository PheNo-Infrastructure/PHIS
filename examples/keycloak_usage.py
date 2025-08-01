#!/usr/bin/env python3
"""
Example usage of Keycloak authentication with OpenSilex client.

This example demonstrates how to use the new Keycloak authentication
features integrated into the OpenSilex Python client.
"""

import sys
import os
import logging

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from utils import (
    KeycloakAuthManager, 
    quick_keycloak_auth,
    UnifiedAuthManager,
    quick_unified_auth,
    AuthMethod
)

def example_keycloak_direct():
    """Example using Keycloak authentication directly."""
    print("=== Keycloak Direct Authentication Example ===")
    
    # Configure Keycloak settings
    keycloak_config = {
        'keycloak_url': 'http://localhost:8080',
        'realm': 'master',
        'client_id': 'opensilex-client',
        'client_secret': None,  # For public clients
        'redirect_uri': 'http://localhost:8080/callback'
    }
    
    try:
        # Method 1: Direct instantiation
        auth_manager = KeycloakAuthManager(**keycloak_config)
        
        # Try to load saved token first
        if auth_manager.load_saved_token():
            print("✓ Using saved Keycloak token")
        else:
            # Authenticate with username/password (requires direct access grants)
            username = "admin"  # Replace with your username
            password = "admin"  # Replace with your password
            
            if auth_manager.authenticate_with_password(username, password):
                print("✓ Keycloak authentication successful")
            else:
                print("✗ Keycloak authentication failed")
                return
        
        # Display token information
        token_info = auth_manager.get_token_info()
        print(f"User: {token_info.get('username')}")
        print(f"Email: {token_info.get('email')}")
        print(f"Auth method: {token_info.get('auth_method')}")
        print(f"Token expires: {token_info.get('expires_at')}")
        
        # Get access token for API calls
        access_token = auth_manager.get_access_token()
        print(f"Access token: {access_token[:20]}..." if access_token else "No token")
        
    except Exception as e:
        print(f"Error: {e}")

def example_keycloak_quick():
    """Example using quick Keycloak authentication helper."""
    print("\n=== Quick Keycloak Authentication Example ===")
    
    try:
        # Method 2: Quick authentication helper
        auth_manager = quick_keycloak_auth(
            # username="admin",  # Uncomment to provide username
            # password="admin",  # Uncomment to provide password
            keycloak_url='http://localhost:8080',
            realm='master',
            client_id='opensilex-client'
        )
        
        token_info = auth_manager.get_token_info()
        print(f"✓ Authenticated as: {token_info.get('username')}")
        
    except Exception as e:
        print(f"Error: {e}")

def example_unified_auth():
    """Example using unified authentication manager."""
    print("\n=== Unified Authentication Example ===")
    
    try:
        # Method 3: Unified auth manager with auto-detection
        auth_manager = UnifiedAuthManager(
            auth_method=AuthMethod.AUTO,
            opensilex_host='http://98.71.237.204:8666',  # Fallback to OpenSilex
            keycloak_config={
                'keycloak_url': 'http://localhost:8080',
                'realm': 'master',
                'client_id': 'opensilex-client'
            }
        )
        
        # This will try Keycloak first, then fall back to OpenSilex
        if auth_manager.authenticate():
            token_info = auth_manager.get_token_info()
            active_method = auth_manager.get_active_auth_method()
            print(f"✓ Authenticated using {active_method} as: {token_info.get('username')}")
        else:
            print("✗ Authentication failed with all methods")
            
    except Exception as e:
        print(f"Error: {e}")

def example_unified_auth_quick():
    """Example using quick unified authentication."""
    print("\n=== Quick Unified Authentication Example ===")
    
    try:
        # Method 4: Quick unified authentication
        auth_manager = quick_unified_auth(
            auth_method='auto',
            opensilex_host='http://98.71.237.204:8666',
            keycloak_config={
                'keycloak_url': 'http://localhost:8080',
                'realm': 'master',
                'client_id': 'opensilex-client'
            }
        )
        
        print("✓ Authentication successful!")
        
    except Exception as e:
        print(f"Error: {e}")

def example_oauth_flow():
    """Example of OAuth2 authorization code flow (for web applications)."""
    print("\n=== OAuth2 Authorization Code Flow Example ===")
    
    try:
        auth_manager = KeycloakAuthManager(
            keycloak_url='http://localhost:8080',
            realm='master',
            client_id='opensilex-client',
            redirect_uri='http://localhost:8080/callback'
        )
        
        # Generate authorization URL
        auth_url, state = auth_manager.get_authorization_url()
        print(f"1. Open this URL in your browser:")
        print(f"   {auth_url}")
        print(f"2. After authentication, you'll be redirected to the callback URL")
        print(f"3. Extract the 'code' parameter from the callback URL")
        print(f"4. Use the code to complete authentication:")
        
        # In a real application, you would get the code from the callback
        # authorization_code = input("Enter the authorization code: ")
        # if auth_manager.authenticate_with_code(authorization_code, state):
        #     print("✓ OAuth2 authentication successful")
        # else:
        #     print("✗ OAuth2 authentication failed")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Setup logging
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    
    print("Keycloak Authentication Examples")
    print("================================")
    print("\nNote: Make sure Keycloak is running and properly configured")
    print("Required Keycloak setup:")
    print("- Realm: master (or your preferred realm)")
    print("- Client: opensilex-client")
    print("- Client type: public or confidential")
    print("- Direct access grants: enabled (for password authentication)")
    print("- Valid redirect URIs: http://localhost:8080/callback")
    
    try:
        # Run examples
        example_keycloak_direct()
        example_keycloak_quick()
        example_unified_auth()
        example_unified_auth_quick()
        example_oauth_flow()
        
    except KeyboardInterrupt:
        print("\nExamples interrupted by user")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
#!/usr/bin/env python3
"""
Debug Swagger Client Configuration

This script examines the swagger client to understand its structure and configuration.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import opensilex_swagger_client
    print("Swagger client imported successfully")
    
    # Check client configuration
    print(f"\nClient version: {getattr(opensilex_swagger_client, '__version__', 'Unknown')}")
    
    # Examine available APIs
    print(f"\nAvailable APIs:")
    for attr in dir(opensilex_swagger_client):
        if attr.endswith('Api') and not attr.startswith('_'):
            print(f"  - {attr}")
    
    # Examine models
    print(f"\nAvailable Models:")
    models = [attr for attr in dir(opensilex_swagger_client) if attr.endswith('DTO') and not attr.startswith('_')][:10]
    for model in models:
        print(f"  - {model}")
    if len(models) >= 10:
        print("  ... and more")
    
    # Test client creation
    print(f"\nTesting client creation...")
    client = opensilex_swagger_client.ApiClient()
    print(f"  Default host: {client.configuration.host}")
    
    # Check if we can create an AuthenticationApi
    try:
        auth_api = opensilex_swagger_client.AuthenticationApi(client)
        print(f"  AuthenticationApi created: YES")
        
        # Check what methods are available
        auth_methods = [method for method in dir(auth_api) if not method.startswith('_')]
        print(f"  Authentication methods: {auth_methods}")
        
    except Exception as e:
        print(f"  AuthenticationApi creation failed: {e}")
    
    # Try to create an AuthenticationDTO
    try:
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="test",
            password="test"
        )
        print(f"  AuthenticationDTO created: YES")
        print(f"  DTO attributes: {list(vars(auth_dto).keys())}")
        
    except Exception as e:
        print(f"  AuthenticationDTO creation failed: {e}")
    
    # Check configuration
    config = opensilex_swagger_client.Configuration()
    print(f"\nDefault configuration:")
    print(f"  Host: {config.host}")
    print(f"  SSL verification: {config.verify_ssl}")
    print(f"  User agent: {config.user_agent}")
    
    # Try setting our host
    config.host = "http://98.71.237.204:8666"
    client_with_config = opensilex_swagger_client.ApiClient(config)
    print(f"\nCustom client created with host: {client_with_config.configuration.host}")
    
    # Try to make a simple call (this will probably fail but will show us the error)
    print(f"\nTesting authentication call...")
    auth_api = opensilex_swagger_client.AuthenticationApi(client_with_config)
    
    try:
        # First check what the authenticate method signature expects
        import inspect
        sig = inspect.signature(auth_api.authenticate)
        print(f"  authenticate method signature: {sig}")
        
    except Exception as e:
        print(f"  Could not inspect authenticate method: {e}")
    
    # Try different ways to call authenticate
    auth_dto = opensilex_swagger_client.AuthenticationDTO(
        identifier="admin@opensilex.org",
        password="admin"
    )
    
    print(f"\nTrying authentication with different parameters...")
    
    # Method 1: body parameter
    try:
        response = auth_api.authenticate(body=auth_dto)
        print(f"  Method 1 (body=): SUCCESS")
        if hasattr(response, 'result'):
            print(f"    Response has result: {type(response.result)}")
    except Exception as e:
        print(f"  Method 1 (body=): {type(e).__name__}: {e}")
    
    # Method 2: direct parameter
    try:
        response = auth_api.authenticate(auth_dto)
        print(f"  Method 2 (direct): SUCCESS")
    except Exception as e:
        print(f"  Method 2 (direct): {type(e).__name__}: {e}")
    
    # Method 3: named parameter
    try:
        response = auth_api.authenticate(authentication_dto=auth_dto)
        print(f"  Method 3 (named): SUCCESS")
    except Exception as e:
        print(f"  Method 3 (named): {type(e).__name__}: {e}")

except ImportError as e:
    print(f"Error importing swagger client: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Unexpected error: {e}")
    sys.exit(1)

print(f"\nDebugging complete!")
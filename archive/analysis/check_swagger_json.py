#!/usr/bin/env python3
"""
Check the swagger.json file found in the api-docs
"""

import requests
import json
from urllib.parse import urljoin

def main():
    host = "http://98.71.237.204:8666"
    
    # Try the swagger.json path we found
    swagger_urls = [
        f"{host}/rest/swagger.json",
        f"{host}/swagger.json",
        f"{host}/api/swagger.json"
    ]
    
    for url in swagger_urls:
        print(f"Trying: {url}")
        try:
            response = requests.get(url, timeout=10)
            print(f"  Status: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    swagger_data = response.json()
                    print(f"  SUCCESS! Found OpenAPI/Swagger spec")
                    print(f"  Swagger version: {swagger_data.get('swagger', 'unknown')}")
                    print(f"  OpenAPI version: {swagger_data.get('openapi', 'unknown')}")
                    
                    if 'info' in swagger_data:
                        info = swagger_data['info']
                        print(f"  Title: {info.get('title', 'unknown')}")
                        print(f"  Version: {info.get('version', 'unknown')}")
                    
                    if 'host' in swagger_data:
                        print(f"  Host: {swagger_data['host']}")
                    
                    if 'basePath' in swagger_data:
                        print(f"  Base path: {swagger_data['basePath']}")
                    
                    # Look for authentication paths
                    if 'paths' in swagger_data:
                        paths = swagger_data['paths']
                        print(f"  Total paths: {len(paths)}")
                        
                        # Find authentication-related paths
                        auth_paths = {}
                        for path, methods in paths.items():
                            if any(term in path.lower() for term in ['auth', 'login', 'token', 'security']):
                                auth_paths[path] = list(methods.keys())
                        
                        if auth_paths:
                            print(f"  Authentication paths found:")
                            for path, methods in auth_paths.items():
                                print(f"    {path}: {methods}")
                        
                        # Check if /security/authenticate exists
                        if '/security/authenticate' in paths:
                            auth_endpoint = paths['/security/authenticate']
                            print(f"  /security/authenticate endpoint details:")
                            for method, details in auth_endpoint.items():
                                print(f"    {method.upper()}: {details.get('summary', 'No summary')}")
                                if 'parameters' in details:
                                    print(f"      Parameters: {len(details['parameters'])}")
                        else:
                            print(f"  /security/authenticate NOT found in swagger spec")
                            
                            # Show what authentication endpoints ARE available
                            available_auth = [p for p in paths.keys() if 'auth' in p.lower() or 'login' in p.lower()]
                            if available_auth:
                                print(f"  Available auth endpoints: {available_auth}")
                    
                    # Check for security definitions
                    if 'securityDefinitions' in swagger_data:
                        print(f"  Security definitions: {list(swagger_data['securityDefinitions'].keys())}")
                    
                    return  # Success - no need to try other URLs
                    
                except json.JSONDecodeError:
                    print(f"  Not valid JSON")
            else:
                print(f"  Failed: {response.status_code}")
        
        except Exception as e:
            print(f"  Error: {e}")
        
        print()

if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Find the correct base path for the OpenSilex API
"""

import requests
import json

def main():
    host = "http://98.71.237.204:8666"
    
    print("Finding correct base path for OpenSilex API")
    print("=" * 50)
    
    # Get the swagger spec first to check for basePath
    try:
        swagger_response = requests.get(f"{host}/rest/swagger.json", timeout=10)
        if swagger_response.status_code == 200:
            swagger_data = swagger_response.json()
            base_path = swagger_data.get('basePath', '')
            print(f"Swagger spec basePath: '{base_path}'")
            
            if 'host' in swagger_data:
                swagger_host = swagger_data['host']
                print(f"Swagger spec host: '{swagger_host}'")
    except Exception as e:
        print(f"Could not get swagger spec: {e}")
        base_path = ''
    
    # Test different base paths
    base_paths_to_test = [
        "",  # No base path
        "/rest",  # Common REST base path
        "/api",   # Common API base path  
        "/core",  # OpenSilex might use core
        "/opensilex",  # Product name
        "/ws",    # Web service
    ]
    
    auth_data = {
        "identifier": "admin@opensilex.org", 
        "password": "admin"
    }
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    print(f"\nTesting authentication with different base paths:")
    
    for base_path in base_paths_to_test:
        if base_path:
            auth_url = f"{host}{base_path}/security/authenticate"
        else:
            auth_url = f"{host}/security/authenticate"
            
        print(f"\nTrying: {auth_url}")
        
        try:
            response = requests.post(auth_url, json=auth_data, headers=headers, timeout=10)
            print(f"  Status: {response.status_code}")
            
            if response.status_code == 200:
                print(f"  SUCCESS! Found working endpoint")
                try:
                    response_json = response.json()
                    if 'result' in response_json and 'token' in response_json['result']:
                        token = response_json['result']['token']
                        print(f"  Got token: {token[:20]}...")
                        print(f"  CORRECT BASE PATH: {base_path}")
                        return base_path
                except:
                    pass
            elif response.status_code == 404:
                print(f"  Not found")
            elif response.status_code == 400:
                print(f"  Bad request (but endpoint exists)")
                # Even 400 means the endpoint exists, just wrong data format
                print(f"  Response: {response.text[:200]}")
            elif response.status_code == 401:
                print(f"  Unauthorized (but endpoint exists)")
            else:
                print(f"  {response.status_code}: {response.reason}")
                print(f"  Response: {response.text[:200]}")
                
        except Exception as e:
            print(f"  Error: {e}")
    
    print(f"\nNo working authentication endpoint found")
    
    # Let's also try to understand the server structure better
    print(f"\nExploring server structure:")
    
    # Check common paths that might give us clues
    explore_paths = [
        "/",
        "/rest/",
        "/api/", 
        "/core/",
        "/opensilex/",
        "/brapi/",  # We saw this in the api-docs
    ]
    
    for path in explore_paths:
        url = f"{host}{path}"
        try:
            response = requests.get(url, timeout=5)
            print(f"  {path}: {response.status_code} ({len(response.text)} chars)")
            
            # Check if it's HTML or JSON
            content_type = response.headers.get('content-type', '')
            if 'json' in content_type:
                print(f"    JSON response")
            elif 'html' in content_type:
                print(f"    HTML response")
                
        except Exception as e:
            print(f"  {path}: Error - {e}")

if __name__ == "__main__":
    main()
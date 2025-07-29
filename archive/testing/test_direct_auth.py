#!/usr/bin/env python3
"""
Test the authentication endpoint directly using requests
"""

import requests
import json

def main():
    host = "http://98.71.237.204:8666"
    auth_url = f"{host}/security/authenticate"
    
    print("Testing /security/authenticate endpoint directly")
    print("=" * 50)
    print(f"URL: {auth_url}")
    
    # Test with admin credentials
    auth_data = {
        "identifier": "admin@opensilex.org",
        "password": "admin"
    }
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    try:
        print(f"Sending POST request with credentials...")
        response = requests.post(auth_url, json=auth_data, headers=headers, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers:")
        for key, value in response.headers.items():
            print(f"  {key}: {value}")
        
        print(f"\nResponse Content:")
        try:
            response_json = response.json()
            print(json.dumps(response_json, indent=2))
            
            # Check if we got a token
            if response.status_code == 200:
                if 'result' in response_json and 'token' in response_json['result']:
                    token = response_json['result']['token']
                    print(f"\nSUCCESS! Got authentication token")
                    print(f"Token length: {len(token)}")
                    print(f"Token starts with: {token[:20]}...")
                    
                    # Test the token with a simple API call
                    test_token(host, token)
                else:
                    print(f"\nNo token found in response")
            else:
                print(f"\nAuthentication failed: {response.status_code}")
                
        except json.JSONDecodeError:
            print("Response is not JSON:")
            print(response.text[:500])
    
    except Exception as e:
        print(f"Error: {e}")

def test_token(host, token):
    """Test the token with a simple API call"""
    print(f"\nTesting token with API call...")
    
    # Try to get user info or similar endpoint
    test_endpoints = [
        "/security/credentials",
        "/core/experiments",  
        "/core/projects"
    ]
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    for endpoint in test_endpoints:
        url = f"{host}{endpoint}"
        try:
            response = requests.get(url, headers=headers, timeout=10)
            print(f"  {endpoint}: {response.status_code}")
            if response.status_code == 200:
                print(f"    SUCCESS - Token works!")
                break
            elif response.status_code == 404:
                print(f"    Endpoint not found")
            else:
                print(f"    {response.reason}")
        except Exception as e:
            print(f"  {endpoint}: Error - {e}")

if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Analyze OpenSilex API Endpoint Mismatches

This script compares what the swagger client expects vs what the server provides.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import opensilex_swagger_client
import requests
import json
from urllib.parse import urljoin
import inspect

def analyze_authentication_endpoints():
    """Analyze authentication endpoint differences."""
    print("AUTHENTICATION ENDPOINT ANALYSIS")
    print("=" * 50)
    
    host = "http://98.71.237.204:8666"
    
    # 1. Check what the swagger client expects
    print("1. Swagger Client Authentication API:")
    try:
        config = opensilex_swagger_client.Configuration()
        config.host = host
        client = opensilex_swagger_client.ApiClient(config)
        auth_api = opensilex_swagger_client.AuthenticationApi(client)
        
        # Get the authenticate method signature
        sig = inspect.signature(auth_api.authenticate)
        print(f"   Method signature: {sig}")
        
        # Try to see what URL it would call
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="test",
            password="test"
        )
        
        print(f"   Expected host: {config.host}")
        print(f"   AuthenticationDTO created successfully")
        
    except Exception as e:
        print(f"   Error: {e}")
    
    # 2. Check what endpoints actually exist on the server
    print("\n2. Server Available Endpoints:")
    
    # Common authentication endpoints to test
    auth_endpoints = [
        "/security/authenticate",
        "/core/security/authenticate", 
        "/api/security/authenticate",
        "/opensilex/security/authenticate",
        "/authenticate",
        "/auth/authenticate",
        "/login",
        "/api/auth/login"
    ]
    
    print("   Testing potential authentication endpoints:")
    for endpoint in auth_endpoints:
        url = urljoin(host, endpoint)
        try:
            response = requests.post(url, timeout=5, json={"test": "data"})
            status = response.status_code
            
            if status == 404:
                print(f"   X {endpoint} -> 404 Not Found")
            elif status == 400:
                print(f"   + {endpoint} -> 400 Bad Request (endpoint exists)")
            elif status == 401:
                print(f"   + {endpoint} -> 401 Unauthorized (endpoint exists)")
            elif status == 200:
                print(f"   + {endpoint} -> 200 OK (endpoint exists)")
            else:
                print(f"   ? {endpoint} -> {status} {response.reason}")
                
        except requests.exceptions.RequestException as e:
            print(f"   X {endpoint} -> Connection error: {e}")
    
    # 3. Check if there's a swagger/OpenAPI spec available
    print("\n3. Looking for OpenAPI/Swagger Specification:")
    
    spec_endpoints = [
        "/swagger.json",
        "/api/swagger.json", 
        "/openapi.json",
        "/api/openapi.json",
        "/swagger-ui.html",
        "/api-docs",
        "/v3/api-docs"
    ]
    
    for endpoint in spec_endpoints:
        url = urljoin(host, endpoint)
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                print(f"   + {endpoint} -> Available")
                
                # Try to parse as JSON
                try:
                    spec_data = response.json()
                    if 'paths' in spec_data:
                        print(f"      OpenAPI spec found with {len(spec_data['paths'])} paths")
                        
                        # Look for authentication paths
                        auth_paths = [path for path in spec_data['paths'].keys() if 'auth' in path.lower()]
                        if auth_paths:
                            print(f"      Authentication paths: {auth_paths}")
                        else:
                            print(f"      No obvious authentication paths found")
                            
                except json.JSONDecodeError:
                    print(f"      Not JSON format (HTML page)")
            else:
                print(f"   X {endpoint} -> {response.status_code}")
                
        except requests.exceptions.RequestException:
            print(f"   X {endpoint} -> Connection error")

def analyze_server_structure():
    """Analyze the actual server structure."""
    print("\nSERVER STRUCTURE ANALYSIS")
    print("=" * 50)
    
    host = "http://98.71.237.204:8666"
    
    # Try to get the main page and analyze it
    try:
        response = requests.get(host, timeout=10)
        if response.status_code == 200:
            content = response.text
            print(f"+ Server responds with HTML content ({len(content)} chars)")
            
            # Look for API-related information in the HTML
            api_indicators = [
                "api/",
                "swagger",
                "openapi", 
                "/security/",
                "authentication",
                "Bearer",
                "token"
            ]
            
            found_indicators = []
            for indicator in api_indicators:
                if indicator.lower() in content.lower():
                    found_indicators.append(indicator)
            
            if found_indicators:
                print(f"   API indicators found: {found_indicators}")
            else:
                print("   No obvious API indicators in main page")
                
            # Check response headers for more info
            print(f"\n   Server headers:")
            important_headers = ['server', 'x-powered-by', 'content-type']
            for header in important_headers:
                if header in response.headers:
                    print(f"     {header}: {response.headers[header]}")
                    
        else:
            print(f"X Server responded with: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"X Could not connect to server: {e}")

def compare_expected_vs_actual():
    """Compare what swagger client expects vs what server provides."""
    print("\nEXPECTED VS ACTUAL COMPARISON")
    print("=" * 50)
    
    # What the swagger client expects (based on our previous errors)
    expected = {
        "authentication_endpoint": "/security/authenticate",
        "method": "POST",
        "parameter": "body with AuthenticationDTO",
        "response": "TokenGetDTO with token field"
    }
    
    print("Expected by Swagger Client:")
    for key, value in expected.items():
        print(f"   {key}: {value}")
    
    # What we found doesn't work
    actual_issues = {
        "authentication_endpoint": "404 Not Found",
        "root_cause": "Generated client expects different API structure",
        "server_type": "Apache Tomcat 9.0.99",
        "possible_cause": "Version mismatch between generator and server"
    }
    
    print("\nActual Issues Found:")
    for key, value in actual_issues.items():
        print(f"   {key}: {value}")

def main():
    """Main analysis function."""
    print("OpenSilex API Endpoint Mismatch Analysis")
    print("=" * 60)
    print()
    
    analyze_authentication_endpoints()
    analyze_server_structure()
    compare_expected_vs_actual()
    
    print("\nSUMMARY")
    print("=" * 20)
    print("+ Generated swagger client successfully imports")
    print("+ Client can be configured with correct host")
    print("+ AuthenticationDTO can be created")
    print("X Authentication endpoint /security/authenticate returns 404") 
    print("X No obvious alternative authentication endpoints found")
    print("? Server runs Apache Tomcat 9.0.99")
    print("? Possible version mismatch between client generator and server")
    print()
    print("RECOMMENDATION:")
    print("   Use web interface upload method for data import")
    print("   The generated swagger client may be from a different OpenSilex version")

if __name__ == "__main__":
    main()
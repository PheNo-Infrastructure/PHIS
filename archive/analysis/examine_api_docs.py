#!/usr/bin/env python3
"""
Examine the /api-docs endpoint to understand the server's API structure.
"""

import requests
from bs4 import BeautifulSoup
import re

def main():
    host = "http://98.71.237.204:8666"
    
    print("Examining /api-docs endpoint")
    print("=" * 40)
    
    try:
        response = requests.get(f"{host}/api-docs", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type', 'unknown')}")
        print(f"Content length: {len(response.text)} characters")
        
        if response.status_code == 200:
            content = response.text
            
            # Try to parse as HTML and extract useful information
            try:
                soup = BeautifulSoup(content, 'html.parser')
                
                # Look for any API-related links or paths
                links = soup.find_all('a', href=True)
                api_links = []
                for link in links:
                    href = link['href']
                    if any(term in href.lower() for term in ['api', 'auth', 'security', 'swagger', 'docs']):
                        api_links.append(href)
                
                if api_links:
                    print(f"\nAPI-related links found:")
                    for link in api_links[:10]:  # Show first 10
                        print(f"  {link}")
                
                # Look for any mentions of authentication
                text = soup.get_text().lower()
                auth_terms = ['authentication', 'login', 'token', 'bearer', 'security', 'authenticate']
                found_terms = [term for term in auth_terms if term in text]
                
                if found_terms:
                    print(f"\nAuthentication-related terms found: {found_terms}")
                
                # Look for API paths in the content
                api_paths = re.findall(r'/[a-zA-Z0-9/_-]*(?:api|auth|security)[a-zA-Z0-9/_-]*', content, re.IGNORECASE)
                if api_paths:
                    print(f"\nPotential API paths found:")
                    unique_paths = list(set(api_paths))[:10]
                    for path in unique_paths:
                        print(f"  {path}")
                
                # Look for form actions that might indicate endpoints
                forms = soup.find_all('form')
                if forms:
                    print(f"\nForms found:")
                    for form in forms:
                        action = form.get('action', 'No action')
                        method = form.get('method', 'GET')
                        print(f"  {method} {action}")
                
            except Exception as e:
                print(f"Error parsing HTML: {e}")
                
                # Show first 500 characters of raw content
                print(f"\nFirst 500 characters of content:")
                print("-" * 40)
                print(content[:500])
                print("-" * 40)
        
        else:
            print(f"Failed to access /api-docs: {response.status_code}")
    
    except Exception as e:
        print(f"Error accessing /api-docs: {e}")

if __name__ == "__main__":
    main()
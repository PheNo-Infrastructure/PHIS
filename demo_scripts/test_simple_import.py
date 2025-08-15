#!/usr/bin/env python3
"""
Simple test of data import functionality
"""

import requests
import json
import time

def test_simple_import():
    """Test simple import without complex pagination"""
    
    # Configuration
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = "admin@opensilex.org"
    VM_PASS = "admin"
    
    print("=== Testing Simple Import ===")
    
    # Authenticate with sandbox
    print("Authenticating with sandbox...")
    auth_data = {"identifier": SANDBOX_USER, "password": SANDBOX_PASS}
    response = requests.post(f"{SANDBOX_URL}/rest/security/authenticate", json=auth_data)
    if response.status_code != 200:
        print(f"[ERROR] Sandbox auth failed: {response.status_code}")
        return
    sandbox_token = response.json()['result']['token']
    sandbox_headers = {"Authorization": f"Bearer {sandbox_token}", "Content-Type": "application/json"}
    
    # Authenticate with VM
    print("Authenticating with VM...")
    auth_data = {"identifier": VM_USER, "password": VM_PASS}
    response = requests.post(f"{VM_URL}/rest/security/authenticate", json=auth_data)
    if response.status_code != 200:
        print(f"[ERROR] VM auth failed: {response.status_code}")
        return
    vm_token = response.json()['result']['token']
    vm_headers = {"Authorization": f"Bearer {vm_token}", "Content-Type": "application/json"}
    
    # Test 1: Get 2 facilities from sandbox
    print("\n=== Test 1: Facilities ===")
    response = requests.get(f"{SANDBOX_URL}/rest/core/facilities?page=0&pageSize=2", headers=sandbox_headers)
    if response.status_code != 200:
        print(f"[ERROR] Failed to get facilities: {response.status_code}")
        return
    
    facilities = response.json()['result']
    print(f"Got {len(facilities)} facilities from sandbox")
    
    # Try to import 1 facility
    if facilities:
        facility = facilities[0]
        print(f"Importing facility: {facility.get('name', 'unknown')}")
        
        # Clean facility data
        cleaned = {k: v for k, v in facility.items() if k not in ['publication_date', 'last_updated_date', 'created_date']}
        
        # Convert complex objects to URIs
        if 'organizations' in cleaned and cleaned['organizations']:
            cleaned['organizations'] = [org['uri'].replace('opensilex-sandbox:', 'opensilex.test:') for org in cleaned['organizations']]
        if 'sites' in cleaned and cleaned['sites']:
            cleaned['sites'] = [site['uri'].replace('opensilex-sandbox:', 'opensilex.test:') for site in cleaned['sites']]
        
        # Convert relations if present
        if 'relations' in cleaned:
            for relation in cleaned['relations']:
                if 'value' in relation:
                    relation['value'] = relation['value'].replace('opensilex-sandbox:', 'opensilex.test:')
        
        print(f"Cleaned facility: {json.dumps(cleaned, indent=2)}")
        
        # Create facility in VM
        response = requests.post(f"{VM_URL}/rest/core/facilities", json=cleaned, headers=vm_headers)
        print(f"Facility import result: {response.status_code}")
        if response.status_code not in [200, 201, 409]:
            print(f"Error response: {response.text[:500]}")
        else:
            print("[OK] Facility imported successfully")
    
    # Test 2: Get 1 data item from sandbox
    print("\n=== Test 2: Data ===")
    response = requests.get(f"{SANDBOX_URL}/rest/core/data?page=0&pageSize=1", headers=sandbox_headers)
    if response.status_code != 200:
        print(f"[ERROR] Failed to get data: {response.status_code}")
        return
    
    data_items = response.json()['result']
    print(f"Got {len(data_items)} data items from sandbox")
    
    # Try to import 1 data item
    if data_items:
        data_item = data_items[0]
        print(f"Importing data: {data_item.get('variable', 'unknown variable')}")
        
        # Clean data item
        cleaned = {k: v for k, v in data_item.items() if k not in ['publication_date', 'last_updated_date', 'created_date', 'uri']}
        
        # For data API, provenance needs to be a proper provenance object, not just URI
        if 'provenance' in cleaned and isinstance(cleaned['provenance'], dict):
            prov = cleaned['provenance']
            # Keep provenance as object but clean it
            if 'uri' in prov:
                prov['uri'] = prov['uri'].replace('opensilex-sandbox:', 'opensilex.test:').replace('test:provenance/', 'http://opensilex.test/id/provenance/')
            
            # Clean device URIs in provenance
            if 'prov_used' in prov and prov['prov_used']:
                for used_item in prov['prov_used']:
                    if isinstance(used_item, dict) and 'uri' in used_item:
                        used_item['uri'] = used_item['uri'].replace('opensilex-sandbox:', 'opensilex.test:')
            
            if 'prov_was_associated_with' in prov and prov['prov_was_associated_with']:
                for assoc_item in prov['prov_was_associated_with']:
                    if isinstance(assoc_item, dict) and 'uri' in assoc_item:
                        assoc_item['uri'] = assoc_item['uri'].replace('opensilex-sandbox:', 'opensilex.test:')
        
        # Map variable URI
        if 'variable' in cleaned:
            cleaned['variable'] = cleaned['variable'].replace('opensilex-sandbox:', 'opensilex.test:')
        
        print(f"Cleaned data: {json.dumps(cleaned, indent=2)}")
        
        # Create data in VM (as array)
        response = requests.post(f"{VM_URL}/rest/core/data", json=[cleaned], headers=vm_headers)
        print(f"Data import result: {response.status_code}")
        if response.status_code not in [200, 201, 409]:
            print(f"Error response: {response.text[:500]}")
        else:
            print("[OK] Data imported successfully")

if __name__ == "__main__":
    test_simple_import()
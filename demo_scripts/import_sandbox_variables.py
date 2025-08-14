#!/usr/bin/env python3
"""
Import variables from OpenSILEX sandbox into local VM instance.
Handles dependency chain: units -> methods -> entities -> characteristics -> variables
"""

import requests
import json
import time
import sys
from typing import Dict, List, Optional


class OpenSILEXClient:
    def __init__(self, base_url: str, username: str = "", password: str = ""):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.token = None
        
    def authenticate(self) -> bool:
        """Authenticate and get access token"""
        if not self.username or not self.password:
            print(f"[INFO] No credentials provided for {self.base_url} - using guest access")
            return True
            
        auth_data = {
            "identifier": self.username,
            "password": self.password
        }
        
        try:
            response = requests.post(f"{self.base_url}/rest/security/authenticate", json=auth_data)
            if response.status_code == 200:
                result = response.json()
                self.token = result['result']['token']
                print(f"[OK] Authenticated with {self.base_url}")
                return True
            else:
                print(f"[ERROR] Authentication failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"[ERROR] Authentication error: {e}")
            return False
    
    def get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication"""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers
    
    def get_all_items(self, endpoint: str, params: Dict = None) -> List[Dict]:
        """Get all items from paginated endpoint"""
        all_items = []
        page = 0
        page_size = 100
        
        while True:
            current_params = {"page": page, "pageSize": page_size}
            if params:
                current_params.update(params)
                
            try:
                response = requests.get(
                    f"{self.base_url}/rest/{endpoint}",
                    headers=self.get_headers(),
                    params=current_params
                )
                
                if response.status_code != 200:
                    print(f"[ERROR] Failed to fetch {endpoint} page {page}: {response.status_code}")
                    break
                
                data = response.json()
                items = data.get('result', [])
                
                if not items:
                    break
                    
                all_items.extend(items)
                print(f"[INFO] Fetched {len(items)} items from {endpoint} (page {page})")
                
                # Check if we got fewer items than page size (last page)
                if len(items) < page_size:
                    break
                    
                page += 1
                time.sleep(0.1)  # Rate limiting
                
            except Exception as e:
                print(f"[ERROR] Error fetching {endpoint}: {e}")
                break
        
        return all_items
    
    def create_item(self, endpoint: str, item_data: Dict) -> bool:
        """Create a single item"""
        try:
            response = requests.post(
                f"{self.base_url}/rest/{endpoint}",
                headers=self.get_headers(),
                json=item_data
            )
            
            if response.status_code in [200, 201]:
                return True
            else:
                print(f"[ERROR] Failed to create item in {endpoint}: {response.status_code}")
                if response.text:
                    print(f"[ERROR] Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"[ERROR] Error creating item in {endpoint}: {e}")
            return False


def clean_item_for_import(item: Dict, fields_to_remove: List[str] = None) -> Dict:
    """Clean item data for import - remove fields that shouldn't be copied"""
    if fields_to_remove is None:
        fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    
    cleaned = item.copy()
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    return cleaned


def import_sandbox_variables():
    """Main function to import variables from sandbox to VM"""
    
    # Configuration
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://108.143.98.168:8666"
    VM_USER = input("VM Username: ").strip()
    VM_PASS = input("VM Password: ").strip()
    
    # Initialize clients
    sandbox = OpenSILEXClient(SANDBOX_URL, SANDBOX_USER, SANDBOX_PASS)
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    # Authenticate
    print("\n=== Authenticating ===")
    if not sandbox.authenticate():
        print("[ERROR] Failed to authenticate with sandbox")
        return
    
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return
    
    # Import dependency chain
    success_counts = {}
    
    print("\n=== Step 1: Import Units ===")
    units = sandbox.get_all_items("core/units")
    print(f"[INFO] Found {len(units)} units in sandbox")
    
    success_count = 0
    for unit in units:
        cleaned_unit = clean_item_for_import(unit)
        if vm.create_item("core/units", cleaned_unit):
            success_count += 1
        time.sleep(0.2)  # Rate limiting
    
    success_counts['units'] = success_count
    print(f"[OK] Successfully imported {success_count}/{len(units)} units")
    
    print("\n=== Step 2: Import Methods ===")
    methods = sandbox.get_all_items("core/methods")
    print(f"[INFO] Found {len(methods)} methods in sandbox")
    
    success_count = 0
    for method in methods:
        cleaned_method = clean_item_for_import(method)
        if vm.create_item("core/methods", cleaned_method):
            success_count += 1
        time.sleep(0.2)  # Rate limiting
    
    success_counts['methods'] = success_count
    print(f"[OK] Successfully imported {success_count}/{len(methods)} methods")
    
    print("\n=== Step 3: Import Entities ===")
    entities = sandbox.get_all_items("core/species")  # Entities are often called species
    print(f"[INFO] Found {len(entities)} entities in sandbox")
    
    success_count = 0
    for entity in entities:
        cleaned_entity = clean_item_for_import(entity)
        if vm.create_item("core/species", cleaned_entity):
            success_count += 1
        time.sleep(0.2)  # Rate limiting
    
    success_counts['entities'] = success_count
    print(f"[OK] Successfully imported {success_count}/{len(entities)} entities")
    
    print("\n=== Step 4: Import Characteristics ===")
    characteristics = sandbox.get_all_items("core/characteristics")
    print(f"[INFO] Found {len(characteristics)} characteristics in sandbox")
    
    success_count = 0
    for characteristic in characteristics:
        cleaned_char = clean_item_for_import(characteristic)
        if vm.create_item("core/characteristics", cleaned_char):
            success_count += 1
        time.sleep(0.2)  # Rate limiting
    
    success_counts['characteristics'] = success_count
    print(f"[OK] Successfully imported {success_count}/{len(characteristics)} characteristics")
    
    print("\n=== Step 5: Import Variables ===")
    variables = sandbox.get_all_items("core/variables")
    print(f"[INFO] Found {len(variables)} variables in sandbox")
    
    success_count = 0
    for variable in variables:
        cleaned_var = clean_item_for_import(variable)
        if vm.create_item("core/variables", cleaned_var):
            success_count += 1
        time.sleep(0.2)  # Rate limiting
    
    success_counts['variables'] = success_count
    print(f"[OK] Successfully imported {success_count}/{len(variables)} variables")
    
    # Summary
    print("\n=== Import Summary ===")
    for item_type, count in success_counts.items():
        print(f"{item_type.capitalize()}: {count} imported")
    
    total_imported = sum(success_counts.values())
    print(f"\nTotal items imported: {total_imported}")
    
    if total_imported > 0:
        print("\n[SUCCESS] Variable import completed!")
        print("You can now view the imported variables in your OpenSILEX web interface.")
    else:
        print("\n[WARNING] No items were successfully imported. Check the logs above for errors.")


if __name__ == "__main__":
    try:
        import_sandbox_variables()
    except KeyboardInterrupt:
        print("\n[INFO] Import cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        sys.exit(1)
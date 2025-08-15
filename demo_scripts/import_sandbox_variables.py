#!/usr/bin/env python3
"""
Import variables from OpenSILEX sandbox into local VM instance.
Handles dependency chain: units -> methods -> entities -> characteristics -> variables
"""

import requests
import json
import time
import sys
import os
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
                print(f"[ERROR] Response: {response.text}")
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
        """Get all items from endpoint (handles OpenSILEX pagination)"""
        try:
            all_items = []
            page = 0
            page_size = 500  # Larger page size for efficiency
            
            while True:
                query_params = params or {}
                query_params.update({"page": page, "pageSize": page_size})
                
                response = requests.get(
                    f"{self.base_url}/rest/{endpoint}",
                    headers=self.get_headers(),
                    params=query_params
                )
                
                if response.status_code != 200:
                    print(f"[ERROR] Failed to fetch {endpoint} page {page}: {response.status_code}")
                    print(f"[ERROR] Response: {response.text}")
                    break
                
                data = response.json()
                items = data.get('result', [])
                
                if not items:  # No more items
                    break
                    
                all_items.extend(items)
                
                # Check pagination metadata
                metadata = data.get('metadata', {})
                pagination = metadata.get('pagination', {})
                has_next = pagination.get('hasNextPage', False)
                total_count = pagination.get('totalCount', len(all_items))
                
                print(f"[INFO] Fetched page {page}: {len(items)} items (total so far: {len(all_items)}/{total_count})")
                
                if not has_next:
                    break
                    
                page += 1
            
            print(f"[INFO] Fetched {len(all_items)} {endpoint.split('/')[-1]} from sandbox")
            return all_items
            
        except Exception as e:
            print(f"[ERROR] Error fetching {endpoint}: {e}")
            return []
    
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
            elif response.status_code == 409:  # Conflict - item already exists
                print(f"[SKIP] Item already exists: {item_data.get('name', item_data.get('uri', 'unknown'))}")
                return True  # Count as success since item exists
            else:
                print(f"[ERROR] Failed to create item in {endpoint}: {response.status_code}")
                if response.text:
                    try:
                        error_data = response.json()
                        print(f"[ERROR] Response: {json.dumps(error_data, indent=2)}")
                    except:
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


def map_sandbox_uri_to_vm(uri: str) -> str:
    """Map sandbox-specific URIs to VM URIs"""
    if not uri:
        return uri
        
    # Map sandbox method URIs to VM URIs
    if uri.startswith('opensilex-sandbox:id/variable/method.'):
        method_name = uri.replace('opensilex-sandbox:id/variable/method.', '')
        return f'http://opensilex.test/id/variable/method.{method_name}'
    
    # Map sandbox unit URIs to VM URIs
    if uri.startswith('opensilex-sandbox:id/variable/unit.'):
        unit_name = uri.replace('opensilex-sandbox:id/variable/unit.', '')
        return f'http://opensilex.test/id/variable/unit.{unit_name}'
        
    # Map sandbox entity URIs to VM URIs  
    if uri.startswith('opensilex-sandbox:id/variable/entity.'):
        entity_name = uri.replace('opensilex-sandbox:id/variable/entity.', '')
        return f'http://opensilex.test/id/variable/entity.{entity_name}'
    
    # Keep other URIs as-is (they should already exist in VM)
    return uri


def clean_variable_for_import(variable: Dict) -> Dict:
    """Clean variable data for import - convert nested objects to URIs and map sandbox URIs"""
    cleaned = variable.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'onLocal', 'sharedResourceInstance']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Convert nested objects to URI strings and map sandbox URIs
    if 'entity' in cleaned and isinstance(cleaned['entity'], dict):
        cleaned['entity'] = map_sandbox_uri_to_vm(cleaned['entity'].get('uri'))
    
    if 'entity_of_interest' in cleaned and isinstance(cleaned['entity_of_interest'], dict):
        cleaned['entity_of_interest'] = map_sandbox_uri_to_vm(cleaned['entity_of_interest'].get('uri'))
    
    if 'characteristic' in cleaned and isinstance(cleaned['characteristic'], dict):
        cleaned['characteristic'] = map_sandbox_uri_to_vm(cleaned['characteristic'].get('uri'))
    
    if 'method' in cleaned and isinstance(cleaned['method'], dict):
        cleaned['method'] = map_sandbox_uri_to_vm(cleaned['method'].get('uri'))
    
    if 'unit' in cleaned and isinstance(cleaned['unit'], dict):
        cleaned['unit'] = map_sandbox_uri_to_vm(cleaned['unit'].get('uri'))
    
    # Add required datatype if missing (default to decimal for numeric data)
    if 'datatype' not in cleaned or cleaned.get('datatype') is None:
        cleaned['datatype'] = 'http://www.w3.org/2001/XMLSchema#decimal'
    
    return cleaned


def test_vm_connection(vm_client: OpenSILEXClient) -> bool:
    """Test if VM is accessible and can handle requests"""
    try:
        response = requests.get(f"{vm_client.base_url}/rest/core/units?page=0&pageSize=1", 
                              headers=vm_client.get_headers(), timeout=10)
        return response.status_code in [200, 401]  # 401 is OK, means VM is running
    except:
        return False


def import_sandbox_variables():
    """Main function to import variables from sandbox to VM"""
    
    # Configuration
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = os.getenv("VM_USER", "admin@opensilex.org")
    VM_PASS = os.getenv("VM_PASS", "admin")
    
    # If environment variables not set, try to get from command line args
    if len(sys.argv) >= 3:
        VM_USER = sys.argv[1]
        VM_PASS = sys.argv[2]
    
    print(f"[INFO] Using VM credentials: {VM_USER} (password hidden)")
    
    # Initialize clients
    sandbox = OpenSILEXClient(SANDBOX_URL, SANDBOX_USER, SANDBOX_PASS)
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    # Test VM connection first
    print("\n=== Testing VM Connection ===")
    if not test_vm_connection(vm):
        print(f"[ERROR] Cannot connect to VM at {VM_URL}")
        print("[ERROR] Please check that OpenSILEX is running on the VM")
        return
    else:
        print(f"[OK] VM is accessible at {VM_URL}")
    
    # Authenticate
    print("\n=== Authenticating ===")
    if not sandbox.authenticate():
        print("[ERROR] Failed to authenticate with sandbox")
        return
    
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return
    
    # Import dependency chain with small batches for testing
    success_counts = {}
    
    # Define what to import - import all dependencies first, then variables
    import_config = [
        ("core/units", "units", None, "regular"),  # Import ALL units
        ("core/methods", "methods", None, "regular"),  # Import ALL methods  
        ("core/entities", "entities", None, "regular"),  # Import ALL entities  
        ("core/characteristics", "characteristics", None, "regular"),  # Import ALL characteristics
        ("core/variables", "variables", None, "variable"),  # Import ALL variables
    ]
    
    for config in import_config:
        endpoint, name, limit, item_type = config
        print(f"\n=== Step: Import {name.title()} ===")
        items = sandbox.get_all_items(endpoint)
        
        if not items:
            print(f"[WARNING] No {name} found in sandbox")
            success_counts[name] = 0
            continue
        
        # Limit items if specified
        if limit is not None:
            items = items[:limit]
            print(f"[INFO] Importing {len(items)} {name} (limited to {limit} for testing)")
        else:
            print(f"[INFO] Importing ALL {len(items)} {name}")
        
        success_count = 0
        for i, item in enumerate(items):
            # Use appropriate cleaning function based on item type
            if item_type == "variable":
                cleaned_item = clean_variable_for_import(item)
            else:
                cleaned_item = clean_item_for_import(item)
                
            if vm.create_item(endpoint, cleaned_item):
                success_count += 1
                print(f"[OK] Imported {name[:-1]} {i+1}/{len(items)}: {item.get('name', item.get('uri', 'unknown'))}")
            else:
                print(f"[ERROR] Failed to import {name[:-1]} {i+1}/{len(items)}: {item.get('name', item.get('uri', 'unknown'))}")
            
            time.sleep(0.1)  # Small delay to avoid overwhelming the server
        
        success_counts[name] = success_count
        print(f"[OK] Successfully imported {success_count}/{len(items)} {name}")
    
    # Summary
    print("\n=== Import Summary ===")
    for item_type, count in success_counts.items():
        print(f"{item_type.capitalize()}: {count} imported")
    
    total_imported = sum(success_counts.values())
    print(f"\nTotal items imported: {total_imported}")
    
    if total_imported > 0:
        print("\n[SUCCESS] Variable import completed!")
        print("You can now view the imported variables in your OpenSILEX web interface.")
        print(f"Visit: {VM_URL}")
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
        import traceback
        traceback.print_exc()
        sys.exit(1)
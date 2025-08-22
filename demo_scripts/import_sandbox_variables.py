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
    
    # Map test entity URIs to VM URIs
    if uri.startswith('test:id/variable/entity_of_interest.'):
        entity_name = uri.replace('test:id/variable/entity_of_interest.', '')
        return f'http://opensilex.test/id/variable/entity_of_interest.{entity_name}'
    
    if uri.startswith('test:id/variable/entity.'):
        entity_name = uri.replace('test:id/variable/entity.', '')
        return f'http://opensilex.test/id/variable/entity.{entity_name}'
    
    # Map any other test entities
    if uri.startswith('test:id/'):
        test_path = uri.replace('test:id/', '')
        return f'http://opensilex.test/id/{test_path}'
    
    # Keep other URIs as-is (they should already exist in VM)
    return uri


def validate_variable_dependencies(variable: Dict, existing_entities: set, existing_characteristics: set, 
                                 existing_methods: set, existing_units: set, vm_client=None) -> bool:
    """Check if variable has all required dependencies, create them if possible, return True if can be imported"""
    creatable_deps = []
    uncreatable_deps = []
    
    # Check entity dependency
    if 'entity' in variable and isinstance(variable['entity'], dict):
        entity_uri = map_sandbox_uri_to_vm(variable['entity'].get('uri'))
        if entity_uri not in existing_entities:
            creatable_deps.append(f"entity: {entity_uri}")
    
    # Check entity_of_interest dependency
    if 'entity_of_interest' in variable and isinstance(variable['entity_of_interest'], dict):
        entity_uri = map_sandbox_uri_to_vm(variable['entity_of_interest'].get('uri'))
        if entity_uri not in existing_entities:
            creatable_deps.append(f"entity_of_interest: {entity_uri}")
    
    # Check characteristic dependency
    if 'characteristic' in variable and isinstance(variable['characteristic'], dict):
        char_uri = map_sandbox_uri_to_vm(variable['characteristic'].get('uri'))
        if char_uri not in existing_characteristics:
            creatable_deps.append(f"characteristic: {char_uri}")
    
    # Check method dependency
    if 'method' in variable and isinstance(variable['method'], dict):
        method_uri = map_sandbox_uri_to_vm(variable['method'].get('uri'))
        if method_uri not in existing_methods:
            creatable_deps.append(f"method: {method_uri}")
    
    # Check unit dependency
    if 'unit' in variable and isinstance(variable['unit'], dict):
        unit_uri = map_sandbox_uri_to_vm(variable['unit'].get('uri'))
        if unit_uri not in existing_units:
            creatable_deps.append(f"unit: {unit_uri}")
    
    # Most dependencies can be auto-created, so we'll attempt import
    # The clean_variable_for_import function will handle the actual creation
    if creatable_deps:
        var_name = variable.get('name', 'unknown')
        print(f"[INFO] Variable {var_name} needs dependencies: {', '.join(creatable_deps[:3])} - will auto-create")
    
    # Only skip if there are truly uncreatable dependencies (none currently)
    if uncreatable_deps:
        var_name = variable.get('name', 'unknown') 
        print(f"[SKIP] Variable {var_name} has uncreatable dependencies: {', '.join(uncreatable_deps[:3])}")
        return False
    
    return True


def clean_variable_for_import(variable: Dict, existing_entities: set = None, existing_characteristics: set = None, 
                             existing_methods: set = None, existing_units: set = None, vm_client = None) -> Dict:
    """Clean variable data for import with smart dependency creation"""
    cleaned = variable.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'onLocal', 'sharedResourceInstance']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Smart dependency handling for entities
    if 'entity' in cleaned and isinstance(cleaned['entity'], dict):
        original_uri = cleaned['entity'].get('uri')
        entity_uri = map_sandbox_uri_to_vm(original_uri)
        print(f"[DEBUG] Entity URI mapping: {original_uri} -> {entity_uri}")
        
        if existing_entities is not None and entity_uri not in existing_entities:
            if vm_client:
                from opensilex_client import create_minimal_entity
                if create_minimal_entity(vm_client, entity_uri):
                    existing_entities.add(entity_uri)
                    print(f"[INFO] Successfully created and added entity: {entity_uri}")
                    # Small delay to ensure entity is committed before variable creation
                    import time
                    time.sleep(0.2)
                else:
                    print(f"[ERROR] Failed to create entity: {entity_uri}")
                    # Don't add to existing_entities if creation failed
        cleaned['entity'] = entity_uri
    
    if 'entity_of_interest' in cleaned and isinstance(cleaned['entity_of_interest'], dict):
        original_uri = cleaned['entity_of_interest'].get('uri')
        entity_uri = map_sandbox_uri_to_vm(original_uri)
        print(f"[DEBUG] Entity of Interest URI mapping: {original_uri} -> {entity_uri}")
        
        if existing_entities is not None and entity_uri not in existing_entities:
            if vm_client:
                from opensilex_client import create_minimal_entity
                if create_minimal_entity(vm_client, entity_uri):
                    existing_entities.add(entity_uri)
                    print(f"[INFO] Successfully created and added entity_of_interest: {entity_uri}")
                    # Small delay to ensure entity is committed before variable creation
                    import time
                    time.sleep(0.2)
                else:
                    print(f"[ERROR] Failed to create entity_of_interest: {entity_uri}")
                    # Don't add to existing_entities if creation failed
        cleaned['entity_of_interest'] = entity_uri
    
    # Smart dependency handling for characteristics
    if 'characteristic' in cleaned and isinstance(cleaned['characteristic'], dict):
        char_uri = map_sandbox_uri_to_vm(cleaned['characteristic'].get('uri'))
        if existing_characteristics is not None and char_uri not in existing_characteristics:
            if vm_client:
                from opensilex_client import create_minimal_characteristic
                if create_minimal_characteristic(vm_client, char_uri):
                    existing_characteristics.add(char_uri)
                    # Small delay to ensure characteristic is committed
                    import time
                    time.sleep(0.1)
        cleaned['characteristic'] = char_uri
    
    # Smart dependency handling for methods
    if 'method' in cleaned and isinstance(cleaned['method'], dict):
        method_uri = map_sandbox_uri_to_vm(cleaned['method'].get('uri'))
        if existing_methods is not None and method_uri not in existing_methods:
            if vm_client:
                from opensilex_client import create_minimal_method
                if create_minimal_method(vm_client, method_uri):
                    existing_methods.add(method_uri)
                    # Small delay to ensure method is committed
                    import time
                    time.sleep(0.1)
        cleaned['method'] = method_uri
    
    # Smart dependency handling for units
    if 'unit' in cleaned and isinstance(cleaned['unit'], dict):
        unit_uri = map_sandbox_uri_to_vm(cleaned['unit'].get('uri'))
        if existing_units is not None and unit_uri not in existing_units:
            if vm_client:
                from opensilex_client import create_minimal_unit
                if create_minimal_unit(vm_client, unit_uri):
                    existing_units.add(unit_uri)
                    # Small delay to ensure unit is committed
                    import time
                    time.sleep(0.1)
        cleaned['unit'] = unit_uri
    
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
    
    VM_URL = "http://172.211.86.191:8666"
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
    
    # Import dependency chain with smart dependency creation
    success_counts = {}
    
    # Define what to import - import dependencies first, then variables with smart dependency creation
    import_config = [
        ("core/units", "units", None, "regular"),  # Import ALL units
        ("core/methods", "methods", None, "regular"),  # Import ALL methods  
        ("core/entities", "entities", None, "regular"),  # Import ALL entities  
        ("core/characteristics", "characteristics", None, "regular"),  # Import ALL characteristics
        ("core/variables", "variables", None, "variable"),  # Import ALL variables with dependency creation
    ]
    
    # Track existing items for dependency validation
    existing_entities = set()
    existing_characteristics = set()
    existing_methods = set()
    existing_units = set()
    
    for config in import_config:
        endpoint, name, limit, item_type = config
        print(f"\n=== Step: Import {name.title()} ===")
        items = sandbox.get_all_items(endpoint)
        
        if not items:
            print(f"[WARNING] No {name} found in sandbox")
            success_counts[name] = 0
            continue
        
        # Update existing items tracking by fetching from VM after importing dependencies
        if name == "entities":
            # Get what's actually in the VM now (including newly imported items)
            vm_entities = vm.get_all_items(endpoint)
            existing_entities = {item.get('uri', '') for item in vm_entities if item.get('uri')}
            print(f"[INFO] Tracking {len(existing_entities)} entities in VM")
        elif name == "characteristics":
            vm_chars = vm.get_all_items(endpoint)
            existing_characteristics = {item.get('uri', '') for item in vm_chars if item.get('uri')}
            print(f"[INFO] Tracking {len(existing_characteristics)} characteristics in VM")
        elif name == "methods":
            vm_methods = vm.get_all_items(endpoint)
            existing_methods = {item.get('uri', '') for item in vm_methods if item.get('uri')}
            print(f"[INFO] Tracking {len(existing_methods)} methods in VM")
        elif name == "units":
            vm_units = vm.get_all_items(endpoint)
            existing_units = {item.get('uri', '') for item in vm_units if item.get('uri')}
            print(f"[INFO] Tracking {len(existing_units)} units in VM")
        
        # Limit items if specified
        if limit is not None:
            items = items[:limit]
            print(f"[INFO] Importing {len(items)} {name} (limited to {limit} for testing)")
        else:
            print(f"[INFO] Importing ALL {len(items)} {name}")
        
        success_count = 0
        created_dependencies = 0
        skipped_count = 0
        
        for i, item in enumerate(items):
            # Use appropriate cleaning function based on item type
            if item_type == "variable":
                # For variables, first validate dependencies (and try to create missing ones)
                if not validate_variable_dependencies(item, existing_entities, existing_characteristics, 
                                                    existing_methods, existing_units, vm):
                    skipped_count += 1
                    continue
                
                # For variables with valid dependencies, use smart dependency creation
                original_counts = (len(existing_entities), len(existing_characteristics), 
                                 len(existing_methods), len(existing_units))
                
                cleaned_item = clean_variable_for_import(
                    item, existing_entities, existing_characteristics, 
                    existing_methods, existing_units, vm
                )
                
                # Track newly created dependencies
                new_counts = (len(existing_entities), len(existing_characteristics), 
                            len(existing_methods), len(existing_units))
                created_dependencies += sum(new_counts[j] - original_counts[j] for j in range(4))
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
        
        if item_type == "variable":
            if created_dependencies > 0:
                print(f"[INFO] Created {created_dependencies} missing dependencies for variables")
            if skipped_count > 0:
                print(f"[INFO] Skipped {skipped_count} variables with unresolvable dependencies")
    
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
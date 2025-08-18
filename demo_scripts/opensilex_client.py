#!/usr/bin/env python3
"""
Shared OpenSILEX client for all import scripts.
Provides authentication, pagination, and basic CRUD operations.
"""

import requests
import json
import time
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
            page_size = 20  # Smaller page size to match OpenSILEX default and avoid timeouts
            
            while True:
                query_params = (params or {}).copy()  # Create a copy to avoid modifying original
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
                
                # Better termination logic
                if not has_next or len(all_items) >= total_count:
                    break
                    
                page += 1
                
                # Safety break to prevent infinite loops (increased for large datasets)
                if page > 500:
                    print(f"[WARNING] Safety break at page {page}")
                    break
            
            print(f"[INFO] Fetched {len(all_items)} {endpoint.split('/')[-1]} from {self.base_url}")
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

    def create_data_batch(self, data_items: List[Dict]) -> int:
        """Create a batch of data items with error handling for missing variables"""
        if not data_items:
            return 0
            
        try:
            # First try to import the full batch
            response = requests.post(
                f"{self.base_url}/rest/core/data",
                headers=self.get_headers(),
                json=data_items
            )
            
            if response.status_code in [200, 201]:
                print(f"[OK] Successfully imported full batch of {len(data_items)} data items")
                return len(data_items)
            else:
                # If batch fails, check if it's due to missing variables
                error_text = response.text
                if "VariableModel" in error_text and "URIs not found" in error_text:
                    print(f"[WARNING] Batch failed due to missing variables, trying individual import...")
                    return self._import_data_individually(data_items)
                else:
                    print(f"[ERROR] Failed to create data batch: {response.status_code}")
                    if response.text:
                        try:
                            error_data = response.json()
                            print(f"[ERROR] Response: {json.dumps(error_data, indent=2)}")
                        except:
                            print(f"[ERROR] Response: {response.text}")
                    return 0
                
        except Exception as e:
            print(f"[ERROR] Error creating data batch: {e}")
            return 0
    
    def _import_data_individually(self, data_items: List[Dict]) -> int:
        """Import data items one by one, skipping those with missing variables"""
        success_count = 0
        
        for i, item in enumerate(data_items):
            try:
                # Try to import single item
                response = requests.post(
                    f"{self.base_url}/rest/core/data",
                    headers=self.get_headers(),
                    json=[item]  # Single item in array
                )
                
                if response.status_code in [200, 201]:
                    success_count += 1
                    if i % 10 == 0:  # Progress update every 10 items
                        print(f"[OK] Imported data item {i+1}/{len(data_items)}")
                else:
                    # Check if it's a missing variable error
                    if "VariableModel" in response.text and "URIs not found" in response.text:
                        print(f"[SKIP] Data item {i+1}/{len(data_items)}: missing variable {item.get('variable', 'unknown')}")
                    elif "ProvenanceModel" in response.text and "URIs not found" in response.text:
                        print(f"[SKIP] Data item {i+1}/{len(data_items)}: missing provenance")
                    else:
                        print(f"[ERROR] Data item {i+1}/{len(data_items)}: {response.status_code}")
                        
            except Exception as e:
                print(f"[ERROR] Data item {i+1}/{len(data_items)}: {e}")
        
        print(f"[SUMMARY] Individual import: {success_count}/{len(data_items)} data items imported")
        return success_count


def test_vm_connection(vm_client: OpenSILEXClient) -> bool:
    """Test if VM is accessible and can handle requests"""
    try:
        response = requests.get(f"{vm_client.base_url}/rest/core/data?page=0&pageSize=1", 
                              headers=vm_client.get_headers(), timeout=10)
        return response.status_code in [200, 401]  # 401 is OK, means VM is running
    except:
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
        
    # CRITICAL FIX: DON'T map sandbox URIs since VM organizations actually have sandbox URIs!
    # The VM was imported with sandbox URIs, not mapped URIs, so references should use sandbox URIs too
    
    # Map test provenances 
    if uri.startswith('test:provenance/'):
        test_name = uri.replace('test:provenance/', '')
        return f'http://opensilex.test/id/provenance/{test_name}'
    
    # Map test organizations to sandbox format (what VM actually has)
    if uri.startswith('test:id/organization/'):
        org_name = uri.replace('test:id/organization/', '')
        return f'opensilex-sandbox:id/organization/{org_name}'
    
    # Keep sandbox URIs as-is since that's what VM actually has!
    return uri


def create_minimal_organization(vm_client: OpenSILEXClient, org_uri: str) -> bool:
    """Create a minimal organization to satisfy dependencies"""
    try:
        # Extract organization name from URI
        org_name = org_uri.split('/')[-1] if '/' in org_uri else org_uri
        
        minimal_org = {
            'uri': org_uri,
            'name': f"Auto-created: {org_name}",
            'description': f"Automatically created to satisfy dependency: {org_uri}"
        }
        
        print(f"[INFO] Creating missing organization: {org_uri}")
        return vm_client.create_item('core/organisations', minimal_org)
    except Exception as e:
        print(f"[ERROR] Failed to create organization {org_uri}: {e}")
        return False


def create_minimal_facility(vm_client: OpenSILEXClient, facility_uri: str) -> bool:
    """Create a minimal facility to satisfy dependencies"""
    try:
        # Extract facility name from URI
        facility_name = facility_uri.split('/')[-1] if '/' in facility_uri else facility_uri
        
        minimal_facility = {
            'uri': facility_uri,
            'name': f"Auto-created: {facility_name}",
            'description': f"Automatically created to satisfy dependency: {facility_uri}"
        }
        
        print(f"[INFO] Creating missing facility: {facility_uri}")
        return vm_client.create_item('core/facilities', minimal_facility)
    except Exception as e:
        print(f"[ERROR] Failed to create facility {facility_uri}: {e}")
        return False


def create_minimal_provenance(vm_client: OpenSILEXClient, prov_uri: str) -> bool:
    """Create a minimal provenance to satisfy dependencies"""
    try:
        # Extract provenance name from URI
        prov_name = prov_uri.split('/')[-1] if '/' in prov_uri else prov_uri
        
        minimal_prov = {
            'uri': prov_uri,
            'name': f"Auto-created: {prov_name}",
            'description': f"Automatically created to satisfy dependency: {prov_uri}"
        }
        
        print(f"[INFO] Creating missing provenance: {prov_uri}")
        return vm_client.create_item('core/provenances', minimal_prov)
    except Exception as e:
        print(f"[ERROR] Failed to create provenance {prov_uri}: {e}")
        return False


def create_minimal_entity(vm_client: OpenSILEXClient, entity_uri: str) -> bool:
    """Create a minimal entity to satisfy variable dependencies"""
    try:
        # Extract entity name from URI
        entity_name = entity_uri.split('/')[-1] if '/' in entity_uri else entity_uri
        
        minimal_entity = {
            'uri': entity_uri,
            'name': f"Auto-created: {entity_name}",
            'description': f"Automatically created to satisfy variable dependency: {entity_uri}"
        }
        
        print(f"[INFO] Creating missing entity: {entity_uri}")
        return vm_client.create_item('core/entities', minimal_entity)
    except Exception as e:
        print(f"[ERROR] Failed to create entity {entity_uri}: {e}")
        return False


def create_minimal_characteristic(vm_client: OpenSILEXClient, char_uri: str) -> bool:
    """Create a minimal characteristic to satisfy variable dependencies"""
    try:
        # Extract characteristic name from URI
        char_name = char_uri.split('/')[-1] if '/' in char_uri else char_uri
        
        minimal_char = {
            'uri': char_uri,
            'name': f"Auto-created: {char_name}",
            'description': f"Automatically created to satisfy variable dependency: {char_uri}"
        }
        
        print(f"[INFO] Creating missing characteristic: {char_uri}")
        return vm_client.create_item('core/characteristics', minimal_char)
    except Exception as e:
        print(f"[ERROR] Failed to create characteristic {char_uri}: {e}")
        return False


def create_minimal_method(vm_client: OpenSILEXClient, method_uri: str) -> bool:
    """Create a minimal method to satisfy variable dependencies"""
    try:
        # Extract method name from URI
        method_name = method_uri.split('/')[-1] if '/' in method_uri else method_uri
        
        minimal_method = {
            'uri': method_uri,
            'name': f"Auto-created: {method_name}",
            'description': f"Automatically created to satisfy variable dependency: {method_uri}"
        }
        
        print(f"[INFO] Creating missing method: {method_uri}")
        return vm_client.create_item('core/methods', minimal_method)
    except Exception as e:
        print(f"[ERROR] Failed to create method {method_uri}: {e}")
        return False


def create_minimal_unit(vm_client: OpenSILEXClient, unit_uri: str) -> bool:
    """Create a minimal unit to satisfy variable dependencies"""
    try:
        # Extract unit name from URI
        unit_name = unit_uri.split('/')[-1] if '/' in unit_uri else unit_uri
        
        minimal_unit = {
            'uri': unit_uri,
            'name': f"Auto-created: {unit_name}",
            'description': f"Automatically created to satisfy variable dependency: {unit_uri}"
        }
        
        print(f"[INFO] Creating missing unit: {unit_uri}")
        return vm_client.create_item('core/units', minimal_unit)
    except Exception as e:
        print(f"[ERROR] Failed to create unit {unit_uri}: {e}")
        return False


def get_existing_items_by_type(vm_client: OpenSILEXClient, item_type: str) -> set:
    """Get set of URIs for existing items of a given type"""
    endpoint_map = {
        'organizations': 'core/organisations',
        'facilities': 'core/facilities', 
        'devices': 'core/devices',
        'provenances': 'core/provenances',
        'variables': 'core/variables',
        'experiments': 'core/experiments'
    }
    
    try:
        endpoint = endpoint_map.get(item_type)
        if not endpoint:
            print(f"[WARNING] Unknown item type: {item_type}")
            return set()
            
        print(f"[INFO] Checking existing {item_type} in VM...")
        items = vm_client.get_all_items(endpoint)
        item_uris = {item.get('uri', '') for item in items if item.get('uri')}
        print(f"[INFO] Found {len(item_uris)} existing {item_type} in VM")
        return item_uris
    except Exception as e:
        print(f"[WARNING] Could not fetch existing {item_type}: {e}")
        return set()
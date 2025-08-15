#!/usr/bin/env python3
"""
Import data from OpenSILEX sandbox into local VM instance.
Handles dependency chain: experiments -> devices -> provenances -> data
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
                
                # Safety break to prevent infinite loops
                if page > 100:
                    print(f"[WARNING] Safety break at page {page}")
                    break
            
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

    def create_data_batch(self, data_items: List[Dict]) -> int:
        """Create a batch of data items (data API expects arrays)"""
        try:
            response = requests.post(
                f"{self.base_url}/rest/core/data",
                headers=self.get_headers(),
                json=data_items
            )
            
            if response.status_code in [200, 201]:
                return len(data_items)
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
        
    # Map sandbox URIs to VM URIs  
    if uri.startswith('opensilex-sandbox:'):
        # Replace sandbox prefix with VM prefix - use full HTTP URI format
        return uri.replace('opensilex-sandbox:', 'http://opensilex.test/')
    
    # Map test provenances 
    if uri.startswith('test:provenance/'):
        test_name = uri.replace('test:provenance/', '')
        return f'http://opensilex.test/id/provenance/{test_name}'
    
    # Keep other URIs as-is (they should already exist in VM)
    return uri


def clean_organisation_for_import(organisation: Dict) -> Dict:
    """Clean organisation data for import"""
    cleaned = organisation.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # BREAK CIRCULAR DEPENDENCY: Remove facility references for now
    # Organizations will be imported first, then facilities can reference them
    if 'facilities' in cleaned:
        cleaned.pop('facilities')  # Remove facility references to break circular dependency
    
    # Convert parent/children organizations to URIs if they're objects (these should be safe)
    if 'parents' in cleaned and cleaned['parents']:
        cleaned['parents'] = [parent['uri'].replace('opensilex-sandbox:', 'http://opensilex.test/') if isinstance(parent, dict) else map_sandbox_uri_to_vm(parent) for parent in cleaned['parents']]
    
    if 'children' in cleaned and cleaned['children']:
        cleaned['children'] = [child['uri'].replace('opensilex-sandbox:', 'http://opensilex.test/') if isinstance(child, dict) else map_sandbox_uri_to_vm(child) for child in cleaned['children']]
    
    return cleaned


def clean_site_for_import(site: Dict) -> Dict:
    """Clean site data for import"""
    cleaned = site.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # FIX MISSING ONTOLOGY: Remove problematic RDF type that doesn't exist in VM
    if 'rdf_type' in cleaned and cleaned['rdf_type'] == 'org:Site':
        # Remove the problematic RDF type entirely - let the API use defaults
        cleaned.pop('rdf_type', None)
        cleaned.pop('rdf_type_name', None)
    
    # BREAK CIRCULAR DEPENDENCY: Remove facility references for now
    if 'facilities' in cleaned:
        cleaned.pop('facilities')  # Remove facility references to break circular dependency
    
    # Convert organizations to URIs if they're objects (but only if they exist)
    if 'organizations' in cleaned and cleaned['organizations']:
        mapped_orgs = []
        for org in cleaned['organizations']:
            if isinstance(org, dict):
                mapped_orgs.append(org['uri'].replace('opensilex-sandbox:', 'http://opensilex.test/'))
            else:
                mapped_orgs.append(map_sandbox_uri_to_vm(org))
        cleaned['organizations'] = mapped_orgs
    
    return cleaned


def clean_facility_for_import(facility: Dict) -> Dict:
    """Clean facility data for import"""
    cleaned = facility.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # FIX MISSING ONTOLOGY: Remove ALL RDF types that cause null pointer errors
    # Let the API use default types instead of guessing wrong ones
    if 'rdf_type' in cleaned:
        cleaned.pop('rdf_type', None) 
    if 'rdf_type_name' in cleaned:
        cleaned.pop('rdf_type_name', None)
    
    # Convert complex objects to URIs
    if 'organizations' in cleaned and cleaned['organizations']:
        cleaned['organizations'] = [org['uri'].replace('opensilex-sandbox:', 'http://opensilex.test/') if isinstance(org, dict) else map_sandbox_uri_to_vm(org) for org in cleaned['organizations']]
    
    if 'sites' in cleaned and cleaned['sites']:
        cleaned['sites'] = [site['uri'].replace('opensilex-sandbox:', 'http://opensilex.test/') if isinstance(site, dict) else map_sandbox_uri_to_vm(site) for site in cleaned['sites']]
    
    # Remove or simplify relations that reference non-existent users
    if 'relations' in cleaned:
        # Remove dc:creator relations as they reference sandbox users that don't exist in VM
        cleaned['relations'] = [rel for rel in cleaned['relations'] if rel.get('property') != 'dc:creator']
    
    return cleaned


def clean_experiment_for_import(experiment: Dict) -> Dict:
    """Clean experiment data for import"""
    cleaned = experiment.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'state', 'is_public']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Map URIs in species if present
    if 'species' in cleaned and cleaned['species']:
        mapped_species = []
        for species_uri in cleaned['species']:
            mapped_species.append(map_sandbox_uri_to_vm(species_uri))
        cleaned['species'] = mapped_species
    
    # Map facility URIs
    if 'facilities' in cleaned and cleaned['facilities']:
        mapped_facilities = []
        for facility_uri in cleaned['facilities']:
            mapped_facilities.append(map_sandbox_uri_to_vm(facility_uri))
        cleaned['facilities'] = mapped_facilities
    
    return cleaned


def clean_device_for_import(device: Dict) -> Dict:
    """Clean device data for import"""
    cleaned = device.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # FIX: Handle device relations that reference variables
    if 'relations' in cleaned and cleaned['relations']:
        cleaned_relations = []
        for relation in cleaned['relations']:
            if isinstance(relation, dict) and 'value' in relation:
                # Map variable URIs in device relations
                if relation['value'].startswith('opensilex-sandbox:id/variable/'):
                    relation['value'] = map_sandbox_uri_to_vm(relation['value'])
                cleaned_relations.append(relation)
            else:
                cleaned_relations.append(relation)
        cleaned['relations'] = cleaned_relations
    
    return cleaned


def clean_provenance_for_import(provenance: Dict) -> Dict:
    """Clean provenance data for import"""
    cleaned = provenance.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # FIX: Map provenance URI properly to avoid duplicates  
    if 'uri' in cleaned:
        cleaned['uri'] = map_sandbox_uri_to_vm(cleaned['uri'])
    
    # FIX: Remove device references that don't exist yet - import provenances without device dependencies first
    # This breaks the circular dependency between provenances and devices
    if 'prov_used' in cleaned:
        cleaned.pop('prov_used', None)  # Remove device references to break circular dependency
    
    if 'prov_was_associated_with' in cleaned:
        cleaned.pop('prov_was_associated_with', None)  # Remove device references to break circular dependency
    
    return cleaned


def clean_data_for_import(data_item: Dict) -> Dict:
    """Clean data item for import"""
    cleaned = data_item.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'uri']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Map variable URI
    if 'variable' in cleaned:
        cleaned['variable'] = map_sandbox_uri_to_vm(cleaned['variable'])
    
    # Map target URI if present
    if 'target' in cleaned and cleaned['target']:
        cleaned['target'] = map_sandbox_uri_to_vm(cleaned['target'])
    
    # Clean provenance object - keep as object but clean the URIs inside
    if 'provenance' in cleaned and isinstance(cleaned['provenance'], dict):
        prov = cleaned['provenance']
        
        # Map provenance URI
        if 'uri' in prov:
            prov['uri'] = map_sandbox_uri_to_vm(prov['uri'])
        
        # Clean device URIs in provenance
        if 'prov_used' in prov and prov['prov_used']:
            for used_item in prov['prov_used']:
                if isinstance(used_item, dict) and 'uri' in used_item:
                    used_item['uri'] = map_sandbox_uri_to_vm(used_item['uri'])
        
        if 'prov_was_associated_with' in prov and prov['prov_was_associated_with']:
            for assoc_item in prov['prov_was_associated_with']:
                if isinstance(assoc_item, dict) and 'uri' in assoc_item:
                    assoc_item['uri'] = map_sandbox_uri_to_vm(assoc_item['uri'])
    elif 'provenance' not in cleaned or cleaned.get('provenance') is None:
        # If no provenance field, add default one
        cleaned['provenance'] = {
            'uri': 'http://opensilex.test/id/provenance/standard_provenance'
        }
    
    return cleaned


def test_vm_connection(vm_client: OpenSILEXClient) -> bool:
    """Test if VM is accessible and can handle requests"""
    try:
        response = requests.get(f"{vm_client.base_url}/rest/core/data?page=0&pageSize=1", 
                              headers=vm_client.get_headers(), timeout=10)
        return response.status_code in [200, 401]  # 401 is OK, means VM is running
    except:
        return False


def import_sandbox_data():
    """Main function to import data from sandbox to VM"""
    
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
    
    # Import dependency chain
    success_counts = {}
    
    # Define what to import - import ALL items for maximum coverage!
    import_config = [
        ("core/organisations", "organisations", None, "regular"),  # Import ALL 23 organisations 
        ("core/sites", "sites", None, "regular"),  # Import ALL 9 sites
        ("core/facilities", "facilities", 15, "facility"),  # Import 15 facilities (some will still fail but get more)
        ("core/experiments", "experiments", 10, "experiment"),  # Import 10 experiments
        ("core/devices", "devices", 50, "device"),  # Import 50 devices (increase significantly)
        ("core/provenances", "provenances", 20, "provenance"),  # Import 20 provenances
        ("core/data", "data", 20, "data"),  # Import 20 data points
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
        
        # Handle data differently (batch processing)
        if item_type == "data":
            # Clean all data items first
            cleaned_data = []
            for item in items:
                cleaned_item = clean_data_for_import(item)
                cleaned_data.append(cleaned_item)
            
            # Send data in batch
            batch_success = vm.create_data_batch(cleaned_data)
            success_count = batch_success
            if batch_success > 0:
                print(f"[OK] Imported {batch_success}/{len(items)} data items in batch")
            else:
                print(f"[ERROR] Failed to import data batch")
        else:
            # Handle other items individually
            for i, item in enumerate(items):
                # Use appropriate cleaning function based on item type
                if item_type == "facility":
                    cleaned_item = clean_facility_for_import(item)
                elif item_type == "experiment":
                    cleaned_item = clean_experiment_for_import(item)
                elif item_type == "device":
                    cleaned_item = clean_device_for_import(item)
                elif item_type == "provenance":
                    cleaned_item = clean_provenance_for_import(item)
                else:
                    # Handle organizations, sites, and other regular items
                    if 'organisation' in name:
                        cleaned_item = clean_organisation_for_import(item)
                    elif 'site' in name:
                        cleaned_item = clean_site_for_import(item)
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
        print("\n[SUCCESS] Data import completed!")
        print("You can now view the imported data in your OpenSILEX web interface.")
        print(f"Visit: {VM_URL}")
    else:
        print("\n[WARNING] No items were successfully imported. Check the logs above for errors.")


if __name__ == "__main__":
    try:
        import_sandbox_data()
    except KeyboardInterrupt:
        print("\n[INFO] Import cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
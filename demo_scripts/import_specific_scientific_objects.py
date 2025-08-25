#!/usr/bin/env python3
"""
Import specific scientific objects needed for data import.
This script focuses on importing just the objects referenced by data items.
"""

import sys
import os
import requests
from typing import Dict, Set
from opensilex_client import (OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm)


def get_scientific_object_by_uri(sandbox_client: OpenSILEXClient, uri: str) -> Dict:
    """Get a specific scientific object by URI"""
    encoded_uri = uri.replace(':', '%3A').replace('/', '%2F')
    
    try:
        response = requests.get(
            f"{sandbox_client.base_url}/rest/core/scientific_objects/{encoded_uri}",
            headers=sandbox_client.get_headers(),
            timeout=30
        )
        
        if response.status_code == 200:
            return response.json().get('result', {})
        else:
            print(f"[ERROR] Failed to fetch scientific object {uri}: {response.status_code}")
            return {}
    except Exception as e:
        print(f"[ERROR] Error fetching scientific object {uri}: {e}")
        return {}


def clean_scientific_object_for_import(scientific_object: Dict) -> Dict:
    """Clean scientific object data for import"""
    cleaned = scientific_object.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'creation_date', 'destruction_date', 'publisher']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Remove complex dependencies for now to ensure import works
    if 'experiment' in cleaned:
        cleaned.pop('experiment')  # Remove experiment dependency
    
    if 'parent' in cleaned:
        cleaned.pop('parent')  # Remove parent dependency
    
    if 'relations' in cleaned:
        cleaned.pop('relations')  # Remove relations
    
    return cleaned


def get_scientific_objects_from_data(sandbox_client: OpenSILEXClient) -> Set[str]:
    """Get all scientific object URIs referenced in data items"""
    print("[INFO] Fetching data items to identify required scientific objects...")
    
    try:
        data_items = sandbox_client.get_all_items("core/data")
        scientific_object_uris = set()
        
        for data_item in data_items:
            target = data_item.get('target')
            if target and 'scientific-object' in target:
                scientific_object_uris.add(target)
        
        print(f"[INFO] Found {len(scientific_object_uris)} unique scientific objects referenced in data")
        return scientific_object_uris
    
    except Exception as e:
        print(f"[ERROR] Failed to fetch data items: {e}")
        return set()


def main():
    """Main function to import specific scientific objects"""
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
    
    # Test VM connection
    print("\n=== Testing VM Connection ===")
    if not test_vm_connection(vm):
        print(f"[ERROR] Cannot connect to VM at {VM_URL}")
        return False
    else:
        print(f"[OK] VM is accessible at {VM_URL}")
    
    # Authenticate
    print("\n=== Authenticating ===")
    if not sandbox.authenticate():
        print("[ERROR] Failed to authenticate with sandbox")
        return False
    
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return False
    
    # Get specific scientific objects needed for data import
    print("\n=== Identifying Required Scientific Objects ===")
    required_uris = get_scientific_objects_from_data(sandbox)
    
    if not required_uris:
        print("[WARNING] No scientific objects found in data references")
        return False
    
    # Import each required scientific object
    print(f"\n=== Importing {len(required_uris)} Required Scientific Objects ===")
    success_count = 0
    
    for i, uri in enumerate(required_uris):
        print(f"\n[{i+1}/{len(required_uris)}] Processing: {uri}")
        
        # Fetch the scientific object from sandbox
        scientific_object = get_scientific_object_by_uri(sandbox, uri)
        
        if not scientific_object:
            print(f"[ERROR] Could not fetch scientific object: {uri}")
            continue
        
        # Clean for import
        cleaned_object = clean_scientific_object_for_import(scientific_object)
        
        # Import to VM
        if vm.create_item('core/scientific_objects', cleaned_object):
            success_count += 1
            print(f"[OK] Imported: {cleaned_object.get('name', uri)}")
        else:
            print(f"[ERROR] Failed to import: {cleaned_object.get('name', uri)}")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count}/{len(required_uris)} scientific objects imported successfully!")
        print(f"You can now try running the data import again.")
        return True
    else:
        print("\n[WARNING] No scientific objects were imported")
        return False


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n[INFO] Import cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
#!/usr/bin/env python3
"""
Import provenances from OpenSILEX sandbox into local VM instance.
Provenances may reference devices and are needed for data import.
"""

import sys
import os
from typing import Dict
from opensilex_client import OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm


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
    
    # FIX: Map device URIs in provenance but only if devices exist in VM
    # Keep device references and let them resolve naturally after device import
    if 'prov_used' in cleaned and cleaned['prov_used']:
        mapped_used = []
        for used_item in cleaned['prov_used']:
            if isinstance(used_item, dict) and 'uri' in used_item:
                used_item['uri'] = map_sandbox_uri_to_vm(used_item['uri'])
                mapped_used.append(used_item)
            else:
                mapped_used.append(map_sandbox_uri_to_vm(used_item) if isinstance(used_item, str) else used_item)
        cleaned['prov_used'] = mapped_used
    
    if 'prov_was_associated_with' in cleaned and cleaned['prov_was_associated_with']:
        mapped_associated = []
        for assoc_item in cleaned['prov_was_associated_with']:
            if isinstance(assoc_item, dict) and 'uri' in assoc_item:
                assoc_item['uri'] = map_sandbox_uri_to_vm(assoc_item['uri'])
                mapped_associated.append(assoc_item)
            else:
                mapped_associated.append(map_sandbox_uri_to_vm(assoc_item) if isinstance(assoc_item, str) else assoc_item)
        cleaned['prov_was_associated_with'] = mapped_associated
    
    return cleaned


def main():
    """Main function to import provenances"""
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
    
    # Import provenances
    print("\n=== Importing Provenances ===")
    provenances = sandbox.get_all_items("core/provenances")
    
    if not provenances:
        print("[WARNING] No provenances found in sandbox")
        return False
    
    print(f"[INFO] Importing {len(provenances)} provenances")
    success_count = 0
    
    for i, provenance in enumerate(provenances):
        cleaned_provenance = clean_provenance_for_import(provenance)
        
        if vm.create_item('core/provenances', cleaned_provenance):
            success_count += 1
            print(f"[OK] Imported provenance {i+1}/{len(provenances)}: {provenance.get('name', provenance.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import provenance {i+1}/{len(provenances)}: {provenance.get('name', provenance.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(provenances)} provenances")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} provenances imported successfully!")
        return True
    else:
        print("\n[WARNING] No provenances were imported")
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
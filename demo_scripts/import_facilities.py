#!/usr/bin/env python3
"""
Import facilities from OpenSILEX sandbox into local VM instance.
Uses ultra-minimal approach to avoid ontology errors.
"""

import sys
import os
from typing import Dict
from opensilex_client import OpenSILEXClient, test_vm_connection


def clean_facility_for_import(facility: Dict) -> Dict:
    """Clean facility data for import - ULTRA MINIMAL approach to avoid ontology errors"""
    
    # SOLUTION: Since minimal facilities work but complex ones cause ontology errors,
    # create only the most essential facility structure
    
    essential_facility = {
        'name': facility.get('name', 'Imported Facility'),
        'description': facility.get('description', f"Imported from sandbox: {facility.get('name', 'Unknown facility')}")
    }
    
    # CRITICAL FIX: Preserve original URI so experiments can reference it
    if 'uri' in facility and facility['uri']:
        essential_facility['uri'] = facility['uri']
    
    # Add safe optional fields only if they exist and are simple
    safe_optional_fields = ['address']
    for field in safe_optional_fields:
        if field in facility and facility[field] and isinstance(facility[field], str):
            essential_facility[field] = facility[field]
    
    # Add geometry if it exists and is valid
    if 'geometry' in facility and facility['geometry']:
        try:
            # Only add geometry if it's a valid structure
            geom = facility['geometry']
            if isinstance(geom, dict) and 'type' in geom:
                essential_facility['geometry'] = geom
        except:
            print(f"[WARNING] Skipping invalid geometry for {facility.get('name')}")
    
    # CRITICAL: Skip organizations/sites/relations that cause ontology errors
    # These can be linked later through a separate process if needed
    
    print(f"[FACILITY] Minimized {facility.get('name', 'Unknown')} to avoid ontology errors")
    return essential_facility


def main():
    """Main function to import facilities"""
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
    
    # Import facilities
    print("\n=== Importing Facilities ===")
    facilities = sandbox.get_all_items("core/facilities")
    
    if not facilities:
        print("[WARNING] No facilities found in sandbox")
        return False
    
    print(f"[INFO] Importing {len(facilities)} facilities (ultra-minimal mode)")
    success_count = 0
    
    for i, facility in enumerate(facilities):
        cleaned_facility = clean_facility_for_import(facility)
        
        if vm.create_item('core/facilities', cleaned_facility):
            success_count += 1
            print(f"[OK] Imported facility {i+1}/{len(facilities)}: {facility.get('name', facility.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import facility {i+1}/{len(facilities)}: {facility.get('name', facility.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(facilities)} facilities")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} facilities imported successfully!")
        return True
    else:
        print("\n[WARNING] No facilities were imported")
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
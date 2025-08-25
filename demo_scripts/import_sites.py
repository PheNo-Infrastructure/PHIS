#!/usr/bin/env python3
"""
Import sites from OpenSILEX sandbox into local VM instance.
Sites depend on organizations.
"""

import sys
import os
from typing import Dict
from opensilex_client import (OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm, 
                              create_minimal_organization, get_existing_items_by_type)


def clean_site_for_import(site: Dict, existing_orgs: set = None, vm_client: OpenSILEXClient = None) -> Dict:
    """Clean site data for import with smart organization dependency handling"""
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
    
    # Smart organization handling: Create missing organizations if needed
    if 'organizations' in cleaned and cleaned['organizations']:
        valid_orgs = []
        missing_orgs = []
        
        for org in cleaned['organizations']:
            if isinstance(org, dict):
                org_uri = org['uri'].replace('opensilex-sandbox:', 'http://opensilex.test/')
            else:
                org_uri = map_sandbox_uri_to_vm(org)
            
            if existing_orgs is not None:
                if org_uri in existing_orgs:
                    valid_orgs.append(org_uri)
                    print(f"[✓] Organization exists: {org_uri}")
                else:
                    missing_orgs.append(org_uri)
                    print(f"[✗] Organization missing: {org_uri}")
            else:
                valid_orgs.append(org_uri)
        
        # Create missing organizations if we have VM client
        if missing_orgs and vm_client:
            for missing_org_uri in missing_orgs:
                if create_minimal_organization(vm_client, missing_org_uri):
                    valid_orgs.append(missing_org_uri)
                    existing_orgs.add(missing_org_uri)
                    print(f"[✓] Created missing organization: {missing_org_uri}")
        
        cleaned['organizations'] = valid_orgs if valid_orgs else []
        
        if not valid_orgs:
            print(f"[WARNING] Site {cleaned.get('name', 'unknown')} has no valid organization references")
    
    return cleaned


def main():
    """Main function to import sites"""
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
    
    # Import sites with smart organization dependency creation
    print("\n=== Importing Sites ===")
    sites = sandbox.get_all_items("core/sites")
    
    if not sites:
        print("[WARNING] No sites found in sandbox")
        return False
    
    # Get existing organizations for validation
    existing_orgs = get_existing_items_by_type(vm, 'organizations')
    
    print(f"[INFO] Importing {len(sites)} sites with organization dependency creation")
    success_count = 0
    created_orgs = 0
    
    for i, site in enumerate(sites):
        # Clean site with smart organization handling
        cleaned_site = clean_site_for_import(site, existing_orgs, vm)
        
        # Count newly created organizations
        original_org_count = len(existing_orgs)
        
        if vm.create_item('core/sites', cleaned_site):
            success_count += 1
            print(f"[OK] Imported site {i+1}/{len(sites)}: {site.get('name', site.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import site {i+1}/{len(sites)}: {site.get('name', site.get('uri', 'unknown'))}")
        
        # Track newly created organizations
        new_org_count = len(existing_orgs)
        if new_org_count > original_org_count:
            created_orgs += (new_org_count - original_org_count)
    
    print(f"[OK] Successfully imported {success_count}/{len(sites)} sites")
    if created_orgs > 0:
        print(f"[INFO] Created {created_orgs} missing organizations to preserve relationships")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} sites imported successfully!")
        return True
    else:
        print("\n[WARNING] No sites were imported")
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
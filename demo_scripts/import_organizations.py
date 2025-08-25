#!/usr/bin/env python3
"""
Import organizations from OpenSILEX sandbox into local VM instance.
Handles circular dependencies between parent/child organizations.
"""

import sys
import os
from typing import Dict, Set
from opensilex_client import OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm


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


class OrganizationImporter:
    """Handles organization import with circular dependency resolution"""
    
    def __init__(self, sandbox_client: OpenSILEXClient, vm_client: OpenSILEXClient):
        self.sandbox = sandbox_client
        self.vm = vm_client
        self.imported_items = set()  # Track what's been imported
        self.failed_items = set()  # Items that failed to import
    
    def import_single_organization(self, organization: Dict, processing_stack: Set[str] = None) -> bool:
        """Import a single organization with dependency resolution"""
        if processing_stack is None:
            processing_stack = set()
        
        # Check if already imported
        org_uri = organization.get('uri', '')
        vm_uri = map_sandbox_uri_to_vm(org_uri)
        
        if vm_uri in self.imported_items:
            return True
        
        # Detect circular dependencies
        if vm_uri in processing_stack:
            print(f"[WARNING] Circular dependency detected for {org_uri}, skipping for now")
            return True  # Return True to continue processing
        
        # Add to processing stack
        processing_stack.add(vm_uri)
        
        # Import parent organizations first
        if 'parents' in organization and organization['parents']:
            for parent in organization['parents']:
                parent_uri = parent['uri'] if isinstance(parent, dict) else parent
                if parent_uri != org_uri:  # Avoid self-reference
                    # Find parent in all organizations and import it
                    parent_org = None
                    for org in getattr(self, 'all_organizations', []):
                        if org.get('uri') == parent_uri:
                            parent_org = org
                            break
                    
                    if parent_org:
                        self.import_single_organization(parent_org, processing_stack.copy())
        
        # Clean organization for import
        cleaned_org = clean_organisation_for_import(organization)
        
        # Import organization
        if self.vm.create_item('core/organisations', cleaned_org):
            self.imported_items.add(vm_uri)
            processing_stack.remove(vm_uri)
            print(f"[OK] Imported organization: {organization.get('name', vm_uri)}")
            return True
        else:
            self.failed_items.add(vm_uri)
            processing_stack.remove(vm_uri)
            print(f"[ERROR] Failed to import organization: {organization.get('name', vm_uri)}")
            return False
    
    def import_all_organizations(self) -> int:
        """Import all organizations with dependency resolution"""
        # Pre-fetch all organizations to resolve circular dependencies
        print("[INFO] Pre-fetching organizations for dependency resolution...")
        self.all_organizations = self.sandbox.get_all_items("core/organisations")
        
        if not self.all_organizations:
            print("[WARNING] No organizations found in sandbox")
            return 0
        
        print(f"[INFO] Importing {len(self.all_organizations)} organizations")
        success_count = 0
        
        for org in self.all_organizations:
            if self.import_single_organization(org):
                success_count += 1
        
        print(f"[OK] Successfully imported {success_count}/{len(self.all_organizations)} organizations")
        return success_count


def link_organizations_to_facilities(sandbox_client: OpenSILEXClient, vm_client: OpenSILEXClient) -> int:
    """Link organizations to their facilities after both have been imported"""
    print("\n=== Linking Organizations to Facilities ===")
    
    # Get facilities from sandbox to see organization relationships
    facilities = sandbox_client.get_all_items("core/facilities")
    if not facilities:
        print("[WARNING] No facilities found in sandbox")
        return 0
    
    # Build mapping of organization URI -> list of facility URIs
    from opensilex_client import map_sandbox_uri_to_vm
    org_to_facilities = {}
    
    for facility in facilities:
        if 'organizations' in facility and facility['organizations']:
            facility_vm_uri = map_sandbox_uri_to_vm(facility['uri'])
            
            for org in facility['organizations']:
                org_sandbox_uri = org['uri'] if isinstance(org, dict) else org
                org_vm_uri = map_sandbox_uri_to_vm(org_sandbox_uri)
                
                if org_vm_uri not in org_to_facilities:
                    org_to_facilities[org_vm_uri] = []
                org_to_facilities[org_vm_uri].append(facility_vm_uri)
    
    print(f"[INFO] Found {len(org_to_facilities)} organizations with facility relationships")
    
    # Update each organization to include its facilities
    success_count = 0
    
    for org_uri, facility_uris in org_to_facilities.items():
        # Get the current organization data
        org_data = vm_client.get_item_by_uri('core/organisations', org_uri)
        
        if org_data:
            # Add facilities to organization
            org_data['facilities'] = facility_uris
            
            # Update the organization
            if vm_client.update_item('core/organisations', org_data):
                success_count += 1
                print(f"[OK] Linked organization {org_uri} to {len(facility_uris)} facilities")
            else:
                print(f"[ERROR] Failed to update organization {org_uri}")
        else:
            print(f"[WARNING] Organization {org_uri} not found in VM")
    
    print(f"[OK] Successfully linked {success_count}/{len(org_to_facilities)} organizations to facilities")
    return success_count


def main():
    """Main function to import organizations"""
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
    
    # Import organizations
    print("\n=== Importing Organizations ===")
    importer = OrganizationImporter(sandbox, vm)
    success_count = importer.import_all_organizations()
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} organizations imported successfully!")
        return True
    else:
        print("\n[WARNING] No organizations were imported")
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
#!/usr/bin/env python3
"""
Import user groups from OpenSILEX sandbox into local VM instance.
Groups are used for access control and permissions.
"""

import sys
import os
from typing import Dict
from opensilex_client import OpenSILEXClient, test_vm_connection


def clean_group_for_import(group: Dict) -> Dict:
    """Clean group data for import"""
    cleaned = group.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    return cleaned


def main():
    """Main function to import groups"""
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
    
    # Import groups
    print("\n=== Importing Groups ===")
    groups = sandbox.get_all_items("security/groups")
    
    if not groups:
        print("[WARNING] No groups found in sandbox")
        return False
    
    print(f"[INFO] Importing {len(groups)} groups")
    success_count = 0
    
    for i, group in enumerate(groups):
        cleaned_group = clean_group_for_import(group)
        
        if vm.create_item('security/groups', cleaned_group):
            success_count += 1
            print(f"[OK] Imported group {i+1}/{len(groups)}: {group.get('name', group.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import group {i+1}/{len(groups)}: {group.get('name', group.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(groups)} groups")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} groups imported successfully!")
        return True
    else:
        print("\n[WARNING] No groups were imported")
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
#!/usr/bin/env python3
"""
Import users from OpenSILEX sandbox into local VM instance.
Users are needed for scientific_supervisors, technical_supervisors references.
"""

import sys
import os
from typing import Dict
from opensilex_client import OpenSILEXClient, test_vm_connection


def clean_user_for_import(user: Dict) -> Dict:
    """Clean user data for import"""
    cleaned = user.copy()
    
    # Remove fields that shouldn't be copied or are sensitive
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'password']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Ensure admin field is present (default to False for imported users)
    if 'admin' not in cleaned:
        cleaned['admin'] = False
    
    # Ensure enable field is present (default to True)
    if 'enable' not in cleaned:
        cleaned['enable'] = True
        
    return cleaned


def main():
    """Main function to import users"""
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
    
    # Import users
    print("\n=== Importing Users ===")
    users = sandbox.get_all_items("security/users")
    
    if not users:
        print("[WARNING] No users found in sandbox")
        return False
    
    print(f"[INFO] Importing {len(users)} users")
    success_count = 0
    
    for i, user in enumerate(users):
        cleaned_user = clean_user_for_import(user)
        
        # Skip if no email (required field)
        if not cleaned_user.get('email'):
            print(f"[WARNING] Skipping user {i+1} - no email address")
            continue
        
        if vm.create_item('security/users', cleaned_user):
            success_count += 1
            print(f"[OK] Imported user {i+1}/{len(users)}: {user.get('email', user.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import user {i+1}/{len(users)}: {user.get('email', user.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(users)} users")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} users imported successfully!")
        return True
    else:
        print("\n[WARNING] No users were imported")
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
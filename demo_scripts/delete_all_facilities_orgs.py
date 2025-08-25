#!/usr/bin/env python3
"""
Delete all facilities and organizations from the VM.
Use this to start fresh for re-importing with proper linking.
"""

import sys
import os
import requests
import urllib.parse
from opensilex_client import OpenSILEXClient, test_vm_connection


def delete_all_items(vm_client: OpenSILEXClient, endpoint: str, item_type: str) -> int:
    """Delete all items of a specific type"""
    print(f"\n=== Deleting All {item_type.title()} ===")
    
    # Get all items
    items = vm_client.get_all_items(endpoint)
    if not items:
        print(f"[INFO] No {item_type} found to delete")
        return 0
    
    print(f"[INFO] Found {len(items)} {item_type} to delete")
    success_count = 0
    
    for i, item in enumerate(items):
        item_uri = item.get('uri', '')
        item_name = item.get('name', 'Unknown')
        
        if not item_uri:
            print(f"[WARNING] {item_type} {i+1} has no URI, skipping")
            continue
        
        # URL encode the URI
        encoded_uri = urllib.parse.quote(item_uri, safe='')
        
        try:
            response = requests.delete(
                f"{vm_client.base_url}/rest/{endpoint}/{encoded_uri}",
                headers=vm_client.get_headers()
            )
            
            if response.status_code == 200:
                success_count += 1
                print(f"[OK] Deleted {item_type} {i+1}/{len(items)}: {item_name}")
            else:
                print(f"[ERROR] Failed to delete {item_type} {item_name}: {response.status_code}")
                if response.text:
                    print(f"[ERROR] Response: {response.text[:200]}")
        
        except Exception as e:
            print(f"[ERROR] Error deleting {item_type} {item_name}: {e}")
    
    print(f"[OK] Successfully deleted {success_count}/{len(items)} {item_type}")
    return success_count


def main():
    """Main function to delete all facilities and organizations"""
    VM_URL = "http://172.211.86.191:8666"
    VM_USER = os.getenv("VM_USER", "admin@opensilex.org")
    VM_PASS = os.getenv("VM_PASS", "admin")
    
    # If environment variables not set, try to get from command line args
    if len(sys.argv) >= 3:
        VM_USER = sys.argv[1]
        VM_PASS = sys.argv[2]
    
    print(f"[INFO] Using VM credentials: {VM_USER} (password hidden)")
    
    # Confirmation prompt
    response = input(f"\n⚠️  WARNING: This will DELETE ALL facilities and organizations from {VM_URL}\nAre you sure? Type 'yes' to confirm: ")
    if response.lower() != 'yes':
        print("[INFO] Operation cancelled")
        return False
    
    # Initialize client
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
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return False
    
    # Delete facilities first (in case they reference organizations)
    facilities_deleted = delete_all_items(vm, 'core/facilities', 'facilities')
    
    # Delete organizations
    organizations_deleted = delete_all_items(vm, 'core/organisations', 'organizations')
    
    total_deleted = facilities_deleted + organizations_deleted
    
    if total_deleted > 0:
        print(f"\n[SUCCESS] Deleted {facilities_deleted} facilities and {organizations_deleted} organizations!")
        print("You can now run fresh imports with organization linking enabled.")
        return True
    else:
        print("\n[INFO] Nothing was deleted")
        return False


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n[INFO] Deletion cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
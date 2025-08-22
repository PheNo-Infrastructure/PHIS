#!/usr/bin/env python3
"""
Import devices from OpenSILEX sandbox into local VM instance.
Devices may have relations that reference variables.
"""

import sys
import os
from typing import Dict
from opensilex_client import OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm


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


def main():
    """Main function to import devices"""
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
    
    # Import devices
    print("\n=== Importing Devices ===")
    devices = sandbox.get_all_items("core/devices")
    
    if not devices:
        print("[WARNING] No devices found in sandbox")
        return False
    
    print(f"[INFO] Importing {len(devices)} devices")
    success_count = 0
    
    for i, device in enumerate(devices):
        cleaned_device = clean_device_for_import(device)
        
        if vm.create_item('core/devices', cleaned_device):
            success_count += 1
            print(f"[OK] Imported device {i+1}/{len(devices)}: {device.get('name', device.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import device {i+1}/{len(devices)}: {device.get('name', device.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(devices)} devices")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} devices imported successfully!")
        return True
    else:
        print("\n[WARNING] No devices were imported")
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
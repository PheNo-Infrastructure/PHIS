#!/usr/bin/env python3
"""
Analyze duplicate data in VM to understand what's causing the duplicate key errors.
"""

import sys
import os
from collections import defaultdict
sys.path.append('demo_scripts')
from opensilex_client import OpenSILEXClient

def analyze_vm_data():
    """Analyze existing data in VM to understand duplicates"""
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = "admin@opensilex.org"
    VM_PASS = "admin"
    
    print(f"[INFO] Analyzing data in VM: {VM_URL}")
    
    # Initialize VM client
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    # Authenticate
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return False
    
    # Get all data from VM
    print("[INFO] Fetching all data from VM...")
    vm_data = vm.get_all_items("core/data")
    
    if not vm_data:
        print("[INFO] No data found in VM")
        return True
    
    print(f"[INFO] Found {len(vm_data)} data items in VM")
    
    # Analyze duplicates by the unique key: (variable, provenance_uri, target, date)
    key_counts = defaultdict(list)
    
    for item in vm_data:
        variable = item.get('variable', '')
        target = item.get('target', '')
        date = item.get('date', '')
        
        # Extract provenance URI
        prov_uri = ''
        if 'provenance' in item and isinstance(item['provenance'], dict):
            prov_uri = item['provenance'].get('uri', '')
        
        # Create the unique key that MongoDB uses
        unique_key = (variable, prov_uri, target, date)
        key_counts[unique_key].append(item)
    
    # Find actual duplicates
    duplicates = {key: items for key, items in key_counts.items() if len(items) > 1}
    
    print(f"\n[ANALYSIS] Data Analysis Results:")
    print(f"Total unique keys: {len(key_counts)}")
    print(f"Duplicate keys found: {len(duplicates)}")
    
    if duplicates:
        print(f"\n[DUPLICATES] Found {len(duplicates)} duplicate key combinations:")
        for i, (key, items) in enumerate(list(duplicates.items())[:5]):  # Show first 5
            variable, prov_uri, target, date = key
            print(f"\nDuplicate #{i+1}:")
            print(f"  Variable: {variable}")
            print(f"  Provenance: {prov_uri}")
            print(f"  Target: {target}")
            print(f"  Date: {date}")
            print(f"  Count: {len(items)} items")
            
            # Show the values for these duplicates
            for j, item in enumerate(items[:3]):  # Show first 3 values
                value = item.get('value', 'N/A')
                uri = item.get('uri', 'N/A')
                print(f"    Item {j+1}: value={value}, uri={uri}")
        
        if len(duplicates) > 5:
            print(f"  ... and {len(duplicates) - 5} more duplicate key combinations")
    else:
        print("[INFO] No duplicates found in existing VM data")
    
    # Show sample of unique keys
    print(f"\n[SAMPLE] Sample of unique keys (first 5):")
    for i, (key, items) in enumerate(list(key_counts.items())[:5]):
        variable, prov_uri, target, date = key
        variable_str = variable[:50] + '...' if variable and len(variable) > 50 else (variable or 'None')
        target_str = target[:50] + '...' if target and len(target) > 50 else (target or 'None')
        prov_str = prov_uri[:50] + '...' if prov_uri and len(prov_uri) > 50 else (prov_uri or 'None')
        print(f"  {i+1}. Variable: {variable_str}")
        print(f"     Target: {target_str}")
        print(f"     Date: {date}")
        print(f"     Provenance: {prov_str}")
        print()
    
    return True

if __name__ == "__main__":
    try:
        analyze_vm_data()
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
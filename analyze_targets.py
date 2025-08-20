#!/usr/bin/env python3
"""
Analyze what target types are referenced in sandbox data
"""

import sys
sys.path.append('demo_scripts')
from opensilex_client import OpenSILEXClient
from collections import defaultdict

def analyze_sandbox_targets():
    """Analyze target dependencies in sandbox data"""
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = "admin@opensilex.org"
    VM_PASS = "admin"
    
    print("[INFO] Analyzing sandbox data targets...")
    
    # Initialize clients
    sandbox = OpenSILEXClient(SANDBOX_URL, SANDBOX_USER, SANDBOX_PASS)
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    if not sandbox.authenticate() or not vm.authenticate():
        print("[ERROR] Failed to authenticate")
        return
    
    # Get first 200 data items from sandbox (representative sample)
    print("[INFO] Fetching sample of sandbox data...")
    data_items = []
    page = 0
    while len(data_items) < 200:
        import requests
        response = requests.get(
            f"{SANDBOX_URL}/rest/core/data?page={page}&pageSize=20",
            headers=sandbox.get_headers()
        )
        if response.status_code == 200:
            items = response.json().get('result', [])
            if not items:
                break
            data_items.extend(items)
            page += 1
        else:
            break
    
    print(f"[INFO] Analyzing {len(data_items)} data items...")
    
    # Analyze target patterns
    target_patterns = defaultdict(int)
    target_examples = defaultdict(list)
    
    for item in data_items:
        target = item.get('target')
        if target:
            # Classify target type
            if 'scientific-object' in target:
                pattern = 'scientific-object'
            elif 'facility' in target:
                pattern = 'facility'
            elif 'organization' in target:
                pattern = 'organization'
            elif 'experiment' in target:
                pattern = 'experiment'
            else:
                pattern = 'other'
            
            target_patterns[pattern] += 1
            if len(target_examples[pattern]) < 5:
                target_examples[pattern].append(target)
    
    print(f"\n[ANALYSIS] Target Types in Sandbox Data:")
    for pattern, count in target_patterns.items():
        print(f"  {pattern}: {count} items")
        print(f"    Examples: {target_examples[pattern][:3]}")
    
    # Check what's available in VM
    print(f"\n[VM CHECK] What exists in VM:")
    try:
        vm_facilities = vm.get_all_items("core/facilities")
        print(f"  Facilities: {len(vm_facilities)}")
        if vm_facilities:
            print(f"    Sample: {[f.get('uri', 'no-uri') for f in vm_facilities[:3]]}")
    except:
        print("  Facilities: Error fetching")
    
    try:
        vm_orgs = vm.get_all_items("core/organisations") 
        print(f"  Organizations: {len(vm_orgs)}")
        if vm_orgs:
            print(f"    Sample: {[o.get('uri', 'no-uri') for o in vm_orgs[:3]]}")
    except:
        print("  Organizations: Error fetching")
    
    try:
        vm_experiments = vm.get_all_items("core/experiments")
        print(f"  Experiments: {len(vm_experiments)}")
        if vm_experiments:
            print(f"    Sample: {[e.get('uri', 'no-uri') for e in vm_experiments[:3]]}")
    except:
        print("  Experiments: Error fetching")
    
    try:
        vm_scientific_objects = vm.get_all_items("core/scientific-objects")
        print(f"  Scientific Objects: {len(vm_scientific_objects)}")
        if vm_scientific_objects:
            print(f"    Sample: {[s.get('uri', 'no-uri') for s in vm_scientific_objects[:3]]}")
    except:
        print("  Scientific Objects: Error fetching")

if __name__ == "__main__":
    analyze_sandbox_targets()
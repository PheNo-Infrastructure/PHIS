#!/usr/bin/env python3
"""
Import or create missing target dependencies for data import
"""

import sys
sys.path.append('demo_scripts')
from opensilex_client import OpenSILEXClient
from collections import defaultdict

def import_missing_targets():
    """Import/create missing targets referenced in sandbox data"""
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = "admin@opensilex.org"
    VM_PASS = "admin"
    
    print("[INFO] Creating missing target dependencies...")
    
    # Initialize clients
    sandbox = OpenSILEXClient(SANDBOX_URL, SANDBOX_USER, SANDBOX_PASS)
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    if not sandbox.authenticate() or not vm.authenticate():
        print("[ERROR] Failed to authenticate")
        return
    
    # Get all unique targets from sandbox data
    print("[INFO] Analyzing all sandbox data targets...")
    data_items = sandbox.get_all_items("core/data")
    
    unique_targets = set()
    for item in data_items:
        target = item.get('target')
        if target and target not in [None, '']:
            unique_targets.add(target)
    
    print(f"[INFO] Found {len(unique_targets)} unique targets in sandbox data")
    
    # Categorize targets
    scientific_objects = []
    facilities = []
    organizations = []
    experiments = []
    other_targets = []
    
    for target in unique_targets:
        if 'scientific-object' in target:
            scientific_objects.append(target)
        elif 'facility' in target:
            facilities.append(target)
        elif 'organization' in target:
            organizations.append(target)
        elif 'experiment' in target:
            experiments.append(target)
        else:
            other_targets.append(target)
    
    print(f"[ANALYSIS] Target breakdown:")
    print(f"  Scientific objects: {len(scientific_objects)}")
    print(f"  Facilities: {len(facilities)}")
    print(f"  Organizations: {len(organizations)}")
    print(f"  Experiments: {len(experiments)}")
    print(f"  Other: {len(other_targets)}")
    
    # Try to create missing scientific objects
    if scientific_objects:
        print(f"\n[CREATE] Attempting to create {len(scientific_objects)} scientific objects...")
        success_count = 0
        
        for target_uri in scientific_objects[:10]:  # Start with first 10
            # Extract name from URI
            target_name = target_uri.split('/')[-1] if '/' in target_uri else target_uri
            
            # Try different endpoints for scientific objects
            endpoints_to_try = [
                'core/scientific-objects',
                'core/scientificObjects', 
                'scientific-objects',
                'scientificObjects'
            ]
            
            minimal_object = {
                'uri': target_uri,
                'name': f"Auto-created: {target_name}",
                'rdf_type': 'http://www.opensilex.org/vocabulary/oeso#ScientificObject'
            }
            
            created = False
            for endpoint in endpoints_to_try:
                print(f"[TRY] Creating {target_uri} via {endpoint}")
                
                try:
                    import requests
                    response = requests.post(
                        f"{VM_URL}/rest/{endpoint}",
                        headers=vm.get_headers(),
                        json=minimal_object
                    )
                    
                    if response.status_code in [200, 201]:
                        print(f"[OK] Created scientific object: {target_uri}")
                        success_count += 1
                        created = True
                        break
                    elif response.status_code == 409:
                        print(f"[SKIP] Scientific object already exists: {target_uri}")
                        success_count += 1
                        created = True
                        break
                    else:
                        print(f"[ERROR] Failed via {endpoint}: {response.status_code}")
                        if response.text:
                            error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
                            print(f"  Response: {str(error_data)[:200]}...")
                except Exception as e:
                    print(f"[ERROR] Exception with {endpoint}: {e}")
            
            if not created:
                print(f"[FAILED] Could not create {target_uri} via any endpoint")
        
        print(f"[SUMMARY] Successfully created/verified {success_count}/{min(10, len(scientific_objects))} scientific objects")

if __name__ == "__main__":
    import_missing_targets()
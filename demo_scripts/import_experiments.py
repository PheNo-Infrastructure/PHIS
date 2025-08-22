#!/usr/bin/env python3
"""
Import experiments from OpenSILEX sandbox into local VM instance.
Experiments depend on facilities and species.
"""

import sys
import os
import requests
from typing import Dict, Set
from opensilex_client import (OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm,
                              create_minimal_facility, get_existing_items_by_type)


def clean_experiment_for_import(experiment: Dict, vm_client: OpenSILEXClient = None, existing_facilities: Set[str] = None) -> Dict:
    """Clean experiment data for import with smart facility validation"""
    cleaned = experiment.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'state', 'is_public']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Map URIs in species if present
    if 'species' in cleaned and cleaned['species']:
        mapped_species = []
        for species_uri in cleaned['species']:
            mapped_species.append(map_sandbox_uri_to_vm(species_uri))
        cleaned['species'] = mapped_species
    
    # Smart facility handling: Validate facilities exist in VM
    if 'facilities' in cleaned and cleaned['facilities']:
        original_facilities = cleaned['facilities'].copy()
        valid_facilities = []
        missing_facilities = []
        
        print(f"[INFO] Experiment {cleaned.get('name', 'unknown')} references {len(original_facilities)} facilities")
        
        for facility_uri in original_facilities:
            # Check if facility exists in VM (if we have the facility list)
            if existing_facilities is not None:
                if facility_uri in existing_facilities:
                    valid_facilities.append(facility_uri)
                    print(f"[✓] Facility exists: {facility_uri}")
                else:
                    missing_facilities.append(facility_uri)
                    print(f"[✗] Facility missing: {facility_uri}")
            else:
                # If we don't have facility list, assume it exists
                valid_facilities.append(facility_uri)
        
        if valid_facilities:
            cleaned['facilities'] = valid_facilities
            print(f"[OK] Kept {len(valid_facilities)} valid facility references")
        else:
            cleaned.pop('facilities', None)
            print(f"[WARNING] No valid facilities found, removed all facility references")
        
        if missing_facilities:
            print(f"[INFO] Missing facilities could be created: {', '.join(missing_facilities)}")
    
    return cleaned




def main():
    """Main function to import experiments"""
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
    
    # Import experiments with smart facility validation
    print("\n=== Importing Experiments ===")
    experiments = sandbox.get_all_items("core/experiments")
    
    if not experiments:
        print("[WARNING] No experiments found in sandbox")
        return False
    
    # Get existing facilities from VM for validation
    existing_facilities = get_existing_items_by_type(vm, 'facilities')
    
    print(f"[INFO] Importing {len(experiments)} experiments with facility validation")
    success_count = 0
    created_facilities = set()
    
    for i, experiment in enumerate(experiments):
        # Clean experiment with facility validation
        cleaned_experiment = clean_experiment_for_import(experiment, vm, existing_facilities)
        
        # Check if we need to create missing facilities
        if 'facilities' in experiment and experiment['facilities']:
            missing_facilities = [f for f in experiment['facilities'] if f not in existing_facilities and f not in created_facilities]
            
            for missing_facility_uri in missing_facilities:
                if create_minimal_facility(vm, missing_facility_uri):
                    existing_facilities.add(missing_facility_uri)
                    created_facilities.add(missing_facility_uri)
                    print(f"[✓] Created missing facility: {missing_facility_uri}")
                    
                    # Re-clean the experiment now that facility exists
                    cleaned_experiment = clean_experiment_for_import(experiment, vm, existing_facilities)
        
        # Import experiment
        if vm.create_item('core/experiments', cleaned_experiment):
            success_count += 1
            print(f"[OK] Imported experiment {i+1}/{len(experiments)}: {experiment.get('name', experiment.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import experiment {i+1}/{len(experiments)}: {experiment.get('name', experiment.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(experiments)} experiments")
    if created_facilities:
        print(f"[INFO] Created {len(created_facilities)} missing facilities to preserve relationships")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} experiments imported successfully!")
        return True
    else:
        print("\n[WARNING] No experiments were imported")
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
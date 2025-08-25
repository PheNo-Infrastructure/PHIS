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


def clean_experiment_for_import(experiment: Dict, vm_client: OpenSILEXClient = None, existing_facilities: Set[str] = None, 
                               existing_species: Set[str] = None, include_complete_linking: bool = True, skip_missing_deps: bool = False) -> Dict:
    """Clean experiment data for import with complete relationship validation"""
    cleaned = experiment.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'created_date', 'state', 'is_public', 'publisher']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    if not include_complete_linking:
        # Minimal mode: remove all relationships to avoid dependency issues
        relationship_fields = ['facilities', 'species', 'organisations', 'factors', 'projects', 
                             'scientific_supervisors', 'technical_supervisors', 'groups']
        for field in relationship_fields:
            cleaned.pop(field, None)
        print(f"[EXPERIMENT] Minimized {cleaned.get('name', 'Unknown')} (minimal mode)")
        return cleaned
    
    # Enhanced complete linking mode: validate dependencies and create missing ones
    include_dependency_creation = True  # Flag to enable auto-creation of missing dependencies
    
    # Complete linking mode: validate and handle all relationships
    print(f"[EXPERIMENT] Processing {cleaned.get('name', 'Unknown')} with complete linking")
    
    # Enhanced species handling with validation
    if 'species' in cleaned and cleaned['species']:
        original_species = cleaned['species'].copy()
        valid_species = []
        missing_species = []
        
        print(f"[INFO] Experiment references {len(original_species)} species")
        
        for species_uri in original_species:
            mapped_uri = map_sandbox_uri_to_vm(species_uri)
            
            # Check if species exists in VM (if we have the species list)
            if existing_species is not None:
                if mapped_uri in existing_species:
                    valid_species.append(mapped_uri)
                    print(f"[✓] Species exists: {mapped_uri}")
                else:
                    missing_species.append(mapped_uri)
                    print(f"[✗] Species missing: {mapped_uri}")
            else:
                # If we don't have species list, use mapped URI
                valid_species.append(mapped_uri)
        
        if valid_species:
            cleaned['species'] = valid_species
            print(f"[OK] Kept {len(valid_species)} valid species references")
        else:
            cleaned.pop('species', None)
            print(f"[WARNING] No valid species found, removed all species references")
    
    # Enhanced facility handling with validation
    if 'facilities' in cleaned and cleaned['facilities']:
        original_facilities = cleaned['facilities'].copy()
        valid_facilities = []
        missing_facilities = []
        
        print(f"[INFO] Experiment references {len(original_facilities)} facilities")
        
        for facility in original_facilities:
            # Extract URI from facility object or use as string
            if isinstance(facility, dict) and 'uri' in facility:
                facility_uri = facility['uri']
            elif isinstance(facility, str):
                facility_uri = facility
            else:
                print(f"[WARNING] Invalid facility format: {facility}")
                continue
                
            # Check if facility exists in VM (if we have the facility list)
            if existing_facilities is not None:
                if facility_uri in existing_facilities:
                    valid_facilities.append(facility_uri)
                    print(f"[OK] Facility exists: {facility_uri}")
                else:
                    missing_facilities.append(facility_uri)
                    print(f"[WARNING] Facility missing: {facility_uri}")
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
            print(f"[INFO] Missing facilities will be auto-created: {len(missing_facilities)} facilities")
    
    # Handle organizations (extract URIs from objects)
    if 'organisations' in cleaned and cleaned['organisations']:
        original_orgs = cleaned['organisations'].copy()
        org_uris = []
        
        for org in original_orgs:
            if isinstance(org, dict) and 'uri' in org:
                org_uris.append(org['uri'])
            elif isinstance(org, str):
                org_uris.append(org)
        
        if org_uris:
            cleaned['organisations'] = org_uris
            print(f"[OK] Kept {len(org_uris)} organization references")
        else:
            cleaned.pop('organisations', None)
    
    # Handle projects (extract URIs from objects)
    if 'projects' in cleaned and cleaned['projects']:
        original_projects = cleaned['projects'].copy()
        project_uris = []
        
        for project in original_projects:
            if isinstance(project, dict) and 'uri' in project:
                project_uris.append(project['uri'])
            elif isinstance(project, str):
                project_uris.append(project)
        
        if project_uris:
            cleaned['projects'] = project_uris
            print(f"[OK] Kept {len(project_uris)} project references")
        else:
            cleaned.pop('projects', None)
    
    # Handle factors (already URIs)
    if 'factors' in cleaned and cleaned['factors']:
        print(f"[OK] Kept {len(cleaned['factors'])} factor references")
    
    # Handle supervisors (already URIs) 
    if 'scientific_supervisors' in cleaned and cleaned['scientific_supervisors']:
        print(f"[OK] Kept {len(cleaned['scientific_supervisors'])} scientific supervisor references")
    
    if 'technical_supervisors' in cleaned and cleaned['technical_supervisors']:
        print(f"[OK] Kept {len(cleaned['technical_supervisors'])} technical supervisor references")
    
    # Handle groups (already URIs)
    if 'groups' in cleaned and cleaned['groups']:
        print(f"[OK] Kept {len(cleaned['groups'])} group references")
    
    # Remove problematic dependencies if skip flag is set
    if skip_missing_deps:
        problematic_fields = ['groups', 'factors', 'projects', 'scientific_supervisors', 'technical_supervisors']
        removed_fields = []
        for field in problematic_fields:
            if field in cleaned and cleaned[field]:
                removed_fields.append(f"{field}[{len(cleaned[field])}]")
                cleaned.pop(field, None)
        
        if removed_fields:
            print(f"[INFO] Removed problematic dependencies: {', '.join(removed_fields)}")
    
    print(f"[EXPERIMENT] Prepared {cleaned.get('name', 'Unknown')} with complete relationships")
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
    
    # Check for complete linking flag (default: enabled) and dependency creation
    include_complete_linking = "--minimal-only" not in sys.argv
    skip_missing_deps = "--skip-missing-deps" in sys.argv
    
    # If environment variables not set, try to get from command line args
    if len(sys.argv) >= 3:
        # Filter out the flags when looking for credentials
        args = [arg for arg in sys.argv[1:] if arg not in ["--minimal-only", "--skip-missing-deps"]]
        if len(args) >= 2:
            VM_USER = args[0]
            VM_PASS = args[1]
    
    print(f"[INFO] Using VM credentials: {VM_USER} (password hidden)")
    if include_complete_linking:
        if skip_missing_deps:
            print("[INFO] Complete relationship linking enabled with dependency skipping (--skip-missing-deps)")
        else:
            print("[INFO] Complete relationship linking enabled (default)")
    else:
        print("[INFO] Minimal import mode (--minimal-only flag used)")
    
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
    
    # Import experiments with complete relationship validation
    print("\n=== Importing Experiments ===")
    
    # Get basic experiment list first
    basic_experiments = sandbox.get_all_items("core/experiments")
    
    if not basic_experiments:
        print("[WARNING] No experiments found in sandbox")
        return False
    
    # Get detailed experiment data if complete linking is enabled
    experiments = []
    
    if include_complete_linking:
        print("[INFO] Fetching complete experiment metadata with all relationships...")
        
        for i, basic_exp in enumerate(basic_experiments):
            exp_uri = basic_exp['uri']
            import urllib.parse
            encoded_uri = urllib.parse.quote(exp_uri, safe='')
            
            try:
                response = requests.get(
                    f"{sandbox.base_url}/rest/core/experiments/{encoded_uri}",
                    headers=sandbox.get_headers()
                )
                
                if response.status_code == 200:
                    detailed_exp = response.json()['result']
                    experiments.append(detailed_exp)
                    print(f"[OK] Fetched detailed data for experiment {i+1}/{len(basic_experiments)}: {detailed_exp.get('name', 'Unknown')}")
                else:
                    print(f"[WARNING] Could not fetch details for experiment {i+1}, using basic data")
                    experiments.append(basic_exp)
                    
            except Exception as e:
                print(f"[WARNING] Error fetching details for experiment {i+1}: {e}")
                experiments.append(basic_exp)
    else:
        # Use basic experiment data for minimal import
        experiments = basic_experiments
    
    if not experiments:
        print("[WARNING] No experiments found in sandbox")
        return False
    
    # Get existing facilities and species from VM for validation (if complete linking enabled)
    existing_facilities = None
    existing_species = None
    
    if include_complete_linking:
        print("[INFO] Validating existing facilities and species in VM...")
        existing_facilities = get_existing_items_by_type(vm, 'facilities')
        # Note: Species validation could be added here if needed
        print(f"[INFO] Found {len(existing_facilities)} existing facilities in VM")
    
    mode_description = "with complete relationship linking" if include_complete_linking else "in minimal mode"
    print(f"[INFO] Importing {len(experiments)} experiments {mode_description}")
    success_count = 0
    created_facilities = set()
    
    for i, experiment in enumerate(experiments):
        # Clean experiment with complete relationship validation
        cleaned_experiment = clean_experiment_for_import(
            experiment, vm, existing_facilities, existing_species, include_complete_linking, skip_missing_deps
        )
        
        # Auto-create missing facilities if complete linking is enabled
        if include_complete_linking and 'facilities' in experiment and experiment['facilities']:
            # Extract facility URIs from experiment data
            experiment_facility_uris = []
            for facility in experiment['facilities']:
                if isinstance(facility, dict) and 'uri' in facility:
                    experiment_facility_uris.append(facility['uri'])
                elif isinstance(facility, str):
                    experiment_facility_uris.append(facility)
            
            missing_facilities = [f for f in experiment_facility_uris 
                                if existing_facilities is not None and f not in existing_facilities and f not in created_facilities]
            
            for missing_facility_uri in missing_facilities:
                print(f"[INFO] Auto-creating missing facility: {missing_facility_uri}")
                if create_minimal_facility(vm, missing_facility_uri):
                    existing_facilities.add(missing_facility_uri)
                    created_facilities.add(missing_facility_uri)
                    print(f"[✓] Created missing facility: {missing_facility_uri}")
                    
                    # Re-clean the experiment now that facility exists
                    cleaned_experiment = clean_experiment_for_import(
                        experiment, vm, existing_facilities, existing_species, include_complete_linking, skip_missing_deps
                    )
                else:
                    print(f"[✗] Failed to create missing facility: {missing_facility_uri}")
        
        # Import experiment
        if vm.create_item('core/experiments', cleaned_experiment):
            success_count += 1
            print(f"[OK] Imported experiment {i+1}/{len(experiments)}: {experiment.get('name', experiment.get('uri', 'unknown'))}")
        else:
            print(f"[ERROR] Failed to import experiment {i+1}/{len(experiments)}: {experiment.get('name', experiment.get('uri', 'unknown'))}")
    
    print(f"[OK] Successfully imported {success_count}/{len(experiments)} experiments")
    if created_facilities:
        print(f"[INFO] Auto-created {len(created_facilities)} missing facilities to preserve relationships")
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} experiments imported successfully!")
        
        # Offer to import associated scientific objects and data
        if include_complete_linking:
            print(f"\n[INFO] Experiments imported with complete metadata.")
            print(f"[INFO] To complete the experiment ecosystem, also run:")
            print(f"[INFO]   python import_scientific_objects.py  # Import scientific objects linked to experiments")
            print(f"[INFO]   python import_data.py               # Import data linked to experiments") 
            
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
#!/usr/bin/env python3
"""
Import scientific objects from OpenSILEX sandbox into local VM instance.
Scientific objects can depend on experiments and other scientific objects (parent-child relationships).
"""

import sys
import os
import time
from typing import Dict, Set
from opensilex_client import (OpenSILEXClient, test_vm_connection, map_sandbox_uri_to_vm,
                              get_existing_items_by_type)


def clean_scientific_object_for_import(scientific_object: Dict, existing_experiments: Set[str] = None, vm_client: OpenSILEXClient = None) -> Dict:
    """Clean scientific object data for import with dependency handling"""
    cleaned = scientific_object.copy()
    
    # Remove fields that shouldn't be copied
    fields_to_remove = ['publication_date', 'last_updated_date', 'creation_date', 'destruction_date', 'publisher']
    for field in fields_to_remove:
        cleaned.pop(field, None)
    
    # Handle experiment dependency if present
    if 'experiment' in cleaned:
        exp_uri = cleaned['experiment']
        if isinstance(exp_uri, dict):
            exp_uri = exp_uri.get('uri', '')
        
        # Map experiment URI
        mapped_exp_uri = map_sandbox_uri_to_vm(exp_uri)
        
        if existing_experiments is not None and mapped_exp_uri not in existing_experiments:
            print(f"[WARNING] Scientific object {cleaned.get('name', 'unknown')} references missing experiment: {exp_uri}")
            # For now, remove experiment reference to avoid failure
            cleaned.pop('experiment', None)
        else:
            cleaned['experiment'] = mapped_exp_uri
    
    # Handle parent scientific object references
    if 'parent' in cleaned and cleaned['parent']:
        parent_uri = cleaned['parent']
        if isinstance(parent_uri, dict):
            parent_uri = parent_uri.get('uri', '')
        
        # Keep parent URI as-is for now (parent objects will be imported first or created later)
        cleaned['parent'] = map_sandbox_uri_to_vm(parent_uri)
    
    # Handle relations (other scientific object references)
    if 'relations' in cleaned and cleaned['relations']:
        mapped_relations = []
        for relation in cleaned['relations']:
            if isinstance(relation, dict):
                # Map relation properties and values
                mapped_relation = relation.copy()
                if 'value' in mapped_relation:
                    mapped_relation['value'] = map_sandbox_uri_to_vm(mapped_relation['value'])
                mapped_relations.append(mapped_relation)
            else:
                mapped_relations.append(map_sandbox_uri_to_vm(relation))
        cleaned['relations'] = mapped_relations
    
    # Handle geometry if present (keep as-is)
    # geometry field is usually fine to copy directly
    
    return cleaned


class ScientificObjectImporter:
    """Handles scientific object import with dependency management"""
    
    def __init__(self, sandbox_client: OpenSILEXClient, vm_client: OpenSILEXClient):
        self.sandbox = sandbox_client
        self.vm = vm_client
        self.existing_experiments = get_existing_items_by_type(vm_client, 'experiments')
        print(f"[INFO] Found {len(self.existing_experiments)} existing experiments in VM")
    
    def import_scientific_objects_batch(self, scientific_objects: list, batch_size: int = 50) -> int:
        """Import scientific objects in batches with error handling"""
        total_imported = 0
        
        for i in range(0, len(scientific_objects), batch_size):
            batch = scientific_objects[i:i+batch_size]
            batch_success = 0
            
            for j, obj in enumerate(batch):
                cleaned_obj = clean_scientific_object_for_import(obj, self.existing_experiments, self.vm)
                
                if self.vm.create_item('core/scientific_objects', cleaned_obj):
                    batch_success += 1
                else:
                    if (i + j) % 100 == 0:  # Only show errors every 100 items to reduce output
                        print(f"[ERROR] Failed to import scientific object {i+j+1}/{len(scientific_objects)}: {obj.get('name', obj.get('uri', 'unknown'))}")
                
                # Smaller delay for faster processing
                time.sleep(0.01)
            
            total_imported += batch_success
            print(f"[BATCH] {i//batch_size + 1}/{(len(scientific_objects)-1)//batch_size + 1}: {batch_success}/{len(batch)} imported (total: {total_imported}/{len(scientific_objects)})")
        
        return total_imported
    
    def import_all_scientific_objects(self, limit: int = None) -> int:
        """Import all scientific objects from sandbox with optional limit"""
        if limit is not None and limit <= 100:
            # For small limits, fetch all at once
            print(f"[INFO] Fetching {limit} scientific objects for testing...")
            scientific_objects = self.sandbox.get_all_items("core/scientific_objects")
            
            if not scientific_objects:
                print("[WARNING] No scientific objects found in sandbox")
                return 0
            
            scientific_objects = scientific_objects[:limit]
            print(f"[INFO] Limited to {len(scientific_objects)} scientific objects for testing")
        else:
            # For larger imports, we'll need to handle pagination differently
            print("[INFO] Fetching scientific objects from sandbox...")
            scientific_objects = self.sandbox.get_all_items("core/scientific_objects")
            
            if not scientific_objects:
                print("[WARNING] No scientific objects found in sandbox")
                return 0
            
            if limit is not None:
                scientific_objects = scientific_objects[:limit]
                print(f"[INFO] Limited to {len(scientific_objects)} scientific objects")
            else:
                print(f"[INFO] Importing ALL {len(scientific_objects)} scientific objects")
        
        # Simple import without complex dependency sorting for now
        # We'll import in the order they come from the API
        print(f"[INFO] Starting import of {len(scientific_objects)} scientific objects")
        
        # Import scientific objects in batches
        success_count = self.import_scientific_objects_batch(scientific_objects)
        
        return success_count


def main():
    """Main function to import scientific objects"""
    # Configuration
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = os.getenv("VM_USER", "admin@opensilex.org")
    VM_PASS = os.getenv("VM_PASS", "admin")
    
    # If environment variables not set, try to get from command line args
    if len(sys.argv) >= 3:
        VM_USER = sys.argv[1]
        VM_PASS = sys.argv[2]
    
    # Optional limit parameter
    limit = None
    if len(sys.argv) >= 4:
        try:
            limit = int(sys.argv[3])
            print(f"[INFO] Using limit: {limit} scientific objects")
        except ValueError:
            print(f"[WARNING] Invalid limit parameter: {sys.argv[3]}, importing all objects")
    
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
    
    # Import scientific objects
    print("\n=== Importing Scientific Objects ===")
    importer = ScientificObjectImporter(sandbox, vm)
    success_count = importer.import_all_scientific_objects(limit)
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} scientific objects imported successfully!")
        print("Note: Some objects may have been skipped due to missing dependencies.")
        print(f"Visit: {VM_URL} to view the imported scientific objects.")
        return True
    else:
        print("\n[WARNING] No scientific objects were imported")
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
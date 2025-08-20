#!/usr/bin/env python3
"""
Import projects from OpenSILEX sandbox into local VM instance.
Projects contain research project metadata including coordinators, contacts, and funding information.
"""

import sys
import os
import time
from typing import Dict, List
from opensilex_client import OpenSILEXClient, clean_item_for_import


class ProjectImporter:
    """Handles project import with dependency management"""
    
    def __init__(self, sandbox_client: OpenSILEXClient, vm_client: OpenSILEXClient):
        self.sandbox = sandbox_client
        self.vm = vm_client
        self.existing_project_uris = self._get_existing_projects()
    
    def _get_existing_projects(self) -> set:
        """Get URIs of existing projects in VM"""
        try:
            existing_projects = self.vm.get_all_items("core/projects")
            project_uris = {project.get('uri', '') for project in existing_projects if project.get('uri')}
            print(f"[INFO] Found {len(project_uris)} existing projects in VM")
            return project_uris
        except Exception as e:
            print(f"[WARNING] Could not fetch existing projects: {e}")
            return set()
    
    def clean_project_for_import(self, project: Dict) -> Dict:
        """Clean project data for import"""
        # Use base cleaning function
        cleaned = clean_item_for_import(project)
        
        # Additional project-specific cleaning
        fields_to_remove = ['publisher', 'uri']
        for field in fields_to_remove:
            cleaned.pop(field, None)
        
        # Ensure required fields exist
        if not cleaned.get('name'):
            print(f"[WARNING] Project missing name: {project.get('uri', 'unknown')}")
            return None
        
        # Handle empty lists and None values
        list_fields = ['related_projects', 'coordinators', 'scientific_contacts', 'administrative_contacts']
        for field in list_fields:
            if field in cleaned and cleaned[field] is None:
                cleaned[field] = []
        
        # CRITICAL: Remove person/user references that cause import failures
        # These require person entities that don't exist in the VM
        person_fields = ['coordinators', 'scientific_contacts', 'administrative_contacts']
        for field in person_fields:
            if field in cleaned and cleaned[field]:
                print(f"[CLEAN] Removing {len(cleaned[field])} {field} references (missing persons in VM)")
                cleaned[field] = []
        
        # Handle date formats - ensure proper format
        date_fields = ['start_date', 'end_date']
        for field in date_fields:
            if field in cleaned and cleaned[field]:
                # OpenSILEX expects date format: YYYY-MM-DD
                date_val = cleaned[field]
                if 'T' in str(date_val):  # Remove time part if present
                    cleaned[field] = str(date_val).split('T')[0]
        
        return cleaned
    
    def import_project(self, project: Dict) -> bool:
        """Import a single project"""
        project_uri = project.get('uri', '')
        project_name = project.get('name', 'Unknown Project')
        
        # Check if already exists
        if project_uri in self.existing_project_uris:
            print(f"[SKIP] Project already exists: {project_name}")
            return True
        
        # Clean project data
        cleaned_project = self.clean_project_for_import(project)
        if not cleaned_project:
            print(f"[SKIP] Project failed cleaning: {project_name}")
            return False
        
        try:
            print(f"[IMPORT] Importing project: {project_name}")
            
            success = self.vm.create_item('core/projects', cleaned_project)
            
            if success:
                print(f"[OK] Successfully imported project: {project_name}")
                self.existing_project_uris.add(project_uri)  # Track for future imports
                return True
            else:
                print(f"[ERROR] Failed to import project: {project_name}")
                return False
                
        except Exception as e:
            print(f"[ERROR] Exception importing project {project_name}: {e}")
            return False
    
    def import_projects_batch(self, projects: List[Dict], batch_size: int = 5) -> int:
        """Import projects in batches"""
        total_imported = 0
        total_skipped = 0
        
        print(f"[INFO] Starting import of {len(projects)} projects...")
        
        for i in range(0, len(projects), batch_size):
            batch = projects[i:i+batch_size]
            batch_success = 0
            
            print(f"\n[BATCH] Processing batch {i//batch_size + 1}/{(len(projects)-1)//batch_size + 1}")
            
            for j, project in enumerate(batch):
                project_name = project.get('name', f'Project_{i+j}')
                print(f"[{i+j+1}/{len(projects)}] Processing: {project_name}")
                
                if self.import_project(project):
                    if project.get('uri', '') in self.existing_project_uris:
                        if project.get('uri', '') not in [p.get('uri', '') for p in projects[:i+j]]:
                            # Only count as success if we actually imported it (not skipped)
                            batch_success += 1
                            total_imported += 1
                        else:
                            total_skipped += 1
                    else:
                        batch_success += 1
                        total_imported += 1
                
                # Small delay between projects
                time.sleep(0.5)
            
            print(f"[BATCH] Batch complete: {batch_success} projects processed")
            
            # Pause between batches
            time.sleep(1)
        
        print(f"\n[SUMMARY] Import complete: {total_imported} imported, {total_skipped} skipped (already existed)")
        return total_imported
    
    def import_all_projects(self) -> int:
        """Import all projects from sandbox"""
        # Fetch all projects from sandbox
        projects = self.sandbox.get_all_items("core/projects")
        
        if not projects:
            print("[WARNING] No projects found in sandbox")
            return 0
        
        print(f"[INFO] Found {len(projects)} projects in sandbox")
        
        # Analyze what we're importing
        self.analyze_projects(projects)
        
        # Import all projects
        success_count = self.import_projects_batch(projects, batch_size=3)
        
        return success_count
    
    def analyze_projects(self, projects: List[Dict]):
        """Analyze projects to understand what we're importing"""
        if not projects:
            print("[INFO] No projects to analyze")
            return
        
        print(f"\n[ANALYSIS] Analyzing {len(projects)} projects...")
        
        # Project characteristics analysis
        has_coordinators = [p for p in projects if p.get('coordinators')]
        has_scientific = [p for p in projects if p.get('scientific_contacts')]
        has_admin = [p for p in projects if p.get('administrative_contacts')]
        has_funding = [p for p in projects if p.get('financial_funding')]
        has_related = [p for p in projects if p.get('related_projects')]
        has_website = [p for p in projects if p.get('website')]
        has_dates = [p for p in projects if p.get('start_date')]
        
        print(f"  Projects with coordinators: {len(has_coordinators)}")
        print(f"  Projects with scientific contacts: {len(has_scientific)}")
        print(f"  Projects with admin contacts: {len(has_admin)}")
        print(f"  Projects with funding info: {len(has_funding)}")
        print(f"  Projects with related projects: {len(has_related)}")
        print(f"  Projects with websites: {len(has_website)}")
        print(f"  Projects with start dates: {len(has_dates)}")
        
        print(f"\n[ANALYSIS] Project names:")
        for i, project in enumerate(projects[:8]):  # Show first 8
            name = project.get('name', 'No name')
            shortname = project.get('shortname', '')
            start_date = project.get('start_date', 'No start date')
            print(f"  {i+1}. {name} ({shortname}) - Start: {start_date}")
        
        if len(projects) > 8:
            print(f"  ... and {len(projects) - 8} more projects")


def main():
    """Main function to import projects"""
    # Configuration
    SANDBOX_URL = "http://opensilex.org/sandbox"
    SANDBOX_USER = "guest@opensilex.org"
    SANDBOX_PASS = "guest"
    
    VM_URL = "http://20.61.118.92:8666"
    VM_USER = os.getenv("VM_USER", "admin@opensilex.org")
    VM_PASS = os.getenv("VM_PASS", "admin")
    
    # Command line args override
    if len(sys.argv) >= 3:
        VM_USER = sys.argv[1]
        VM_PASS = sys.argv[2]
    
    print(f"[INFO] Using VM credentials: {VM_USER}")
    
    # Initialize clients
    sandbox = OpenSILEXClient(SANDBOX_URL, SANDBOX_USER, SANDBOX_PASS)
    vm = OpenSILEXClient(VM_URL, VM_USER, VM_PASS)
    
    # Authenticate
    print("\n=== Authenticating ===")
    if not sandbox.authenticate():
        print("[ERROR] Failed to authenticate with sandbox")
        return False
    
    if not vm.authenticate():
        print("[ERROR] Failed to authenticate with VM")
        return False
    
    # Import projects
    print("\n=== Importing Projects ===")
    importer = ProjectImporter(sandbox, vm)
    
    success_count = importer.import_all_projects()
    
    if success_count > 0:
        print(f"\n[SUCCESS] {success_count} projects imported successfully!")
        return True
    else:
        print("\n[INFO] No new projects were imported")
        print("This may mean all projects already exist in the VM.")
        return True


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
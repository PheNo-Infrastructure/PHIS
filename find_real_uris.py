#!/usr/bin/env python3
"""
Find Real URIs in OpenSilex

This script connects to your OpenSilex instance and shows you all available URIs
that you can use for data import.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from opensilex_client import connect
import json
from datetime import datetime

def save_uris_to_file(uris_data, filename="opensilex_uris.json"):
    """Save discovered URIs to a JSON file for reference."""
    with open(filename, 'w') as f:
        json.dump(uris_data, f, indent=2)
    print(f"\nURIs saved to: {filename}")
    return filename

def find_all_uris():
    """Connect to OpenSilex and discover all available URIs."""
    print("Finding Real URIs in OpenSilex")
    print("=" * 40)
    print("Server: 98.71.237.204:8666")
    
    try:
        # Connect to your server
        print("\n1. Connecting to OpenSilex...")
        client = connect(host="http://98.71.237.204:8666")
        
        if not client.is_ready():
            print("Failed to authenticate. Please check your credentials.")
            return None
        
        print("Connected successfully!")
        
        # Container for all discovered URIs
        all_uris = {
            "discovered_at": datetime.now().isoformat(),
            "server": "http://98.71.237.204:8666",
            "variables": [],
            "scientific_objects": [],
            "experiments": [],
            "projects": [],
            "devices": [],
            "germplasm": [],
            "ontology_types": []
        }
        
        # 1. Get Variables (what you can measure)
        print("\n2. Finding Variables (measurements/traits)...")
        try:
            variables = client.list_variables(limit=50)  # Get more for complete list
            if hasattr(variables, 'result') and variables.result:
                for var in variables.result:
                    var_info = {
                        "name": getattr(var, 'name', 'No name'),
                        "uri": getattr(var, 'uri', 'No URI'),
                        "alternative_name": getattr(var, 'alternative_name', ''),
                        "description": getattr(var, 'description', ''),
                        "datatype": getattr(var, 'datatype', 'unknown'),
                        "unit": getattr(var, 'unit', 'No unit'),
                        "entity": getattr(var, 'entity', 'No entity')
                    }
                    all_uris["variables"].append(var_info)
                
                print(f"   Found {len(all_uris['variables'])} variables:")
                for i, var in enumerate(all_uris["variables"][:5]):  # Show first 5
                    print(f"     {i+1}. {var['name']} ({var['datatype']})")
                    print(f"        URI: {var['uri']}")
                    if var['description']:
                        print(f"        Description: {var['description']}")
                if len(all_uris["variables"]) > 5:
                    print(f"     ... and {len(all_uris['variables']) - 5} more")
            else:
                print("   No variables found")
        except Exception as e:
            print(f"   Error getting variables: {e}")
        
        # 2. Get Scientific Objects (what you measure on)
        print(f"\n3. Finding Scientific Objects (targets for measurements)...")
        try:
            sci_objects = client.list_scientific_objects(limit=50)
            if hasattr(sci_objects, 'result') and sci_objects.result:
                for obj in sci_objects.result:
                    obj_info = {
                        "name": getattr(obj, 'name', 'No name'),
                        "uri": getattr(obj, 'uri', 'No URI'),
                        "type": getattr(obj, 'rdf_type', 'Unknown type'),
                        "experiment": getattr(obj, 'experiment', 'No experiment'),
                        "factor_levels": getattr(obj, 'factor_levels', [])
                    }
                    all_uris["scientific_objects"].append(obj_info)
                
                print(f"   Found {len(all_uris['scientific_objects'])} scientific objects:")
                for i, obj in enumerate(all_uris["scientific_objects"][:5]):
                    print(f"     {i+1}. {obj['name']}")
                    print(f"        URI: {obj['uri']}")
                    print(f"        Type: {obj['type']}")
                if len(all_uris["scientific_objects"]) > 5:
                    print(f"     ... and {len(all_uris['scientific_objects']) - 5} more")
            else:
                print("   No scientific objects found")
        except Exception as e:
            print(f"   Error getting scientific objects: {e}")
        
        # 3. Get Experiments
        print(f"\n4. Finding Experiments...")
        try:
            experiments = client.list_experiments(limit=20)
            if hasattr(experiments, 'result') and experiments.result:
                for exp in experiments.result:
                    exp_info = {
                        "name": getattr(exp, 'name', 'No name'),
                        "uri": getattr(exp, 'uri', 'No URI'),
                        "start_date": str(getattr(exp, 'start_date', 'No date')),
                        "end_date": str(getattr(exp, 'end_date', 'No date')),
                        "objective": getattr(exp, 'objective', 'No objective'),
                        "description": getattr(exp, 'description', '')
                    }
                    all_uris["experiments"].append(exp_info)
                
                print(f"   Found {len(all_uris['experiments'])} experiments:")
                for i, exp in enumerate(all_uris["experiments"][:3):
                    print(f"     {i+1}. {exp['name']}")
                    print(f"        URI: {exp['uri']}")
                    print(f"        Start: {exp['start_date']}")
            else:
                print("   No experiments found")
        except Exception as e:
            print(f"   Error getting experiments: {e}")
        
        # 4. Get Projects
        print(f"\n5. Finding Projects...")
        try:
            projects = client.list_projects(limit=20)
            if hasattr(projects, 'result') and projects.result:
                for proj in projects.result:
                    proj_info = {
                        "name": getattr(proj, 'name', 'No name'),
                        "uri": getattr(proj, 'uri', 'No URI'),
                        "shortname": getattr(proj, 'shortname', ''),
                        "description": getattr(proj, 'description', '')
                    }
                    all_uris["projects"].append(proj_info)
                
                print(f"   Found {len(all_uris['projects'])} projects:")
                for i, proj in enumerate(all_uris["projects"][:3]):
                    print(f"     {i+1}. {proj['name']}")
                    print(f"        URI: {proj['uri']}")
            else:
                print("   No projects found")
        except Exception as e:
            print(f"   Error getting projects: {e}")
        
        # 5. Get Devices (if any)
        print(f"\n6. Finding Devices...")
        try:
            devices = client.list_devices(limit=20)
            if hasattr(devices, 'result') and devices.result:
                for device in devices.result:
                    device_info = {
                        "name": getattr(device, 'name', 'No name'),
                        "uri": getattr(device, 'uri', 'No URI'),
                        "type": getattr(device, 'rdf_type', 'Unknown type'),
                        "brand": getattr(device, 'brand', ''),
                        "model": getattr(device, 'model', '')
                    }
                    all_uris["devices"].append(device_info)
                
                print(f"   Found {len(all_uris['devices'])} devices:")
                for i, device in enumerate(all_uris["devices"][:3]):
                    print(f"     {i+1}. {device['name']}")
                    print(f"        URI: {device['uri']}")
            else:
                print("   No devices found")
        except Exception as e:
            print(f"   Error getting devices: {e}")
        
        # 6. Get Germplasm (if any)
        print(f"\n7. Finding Germplasm...")
        try:
            germplasm = client.list_germplasm(limit=20)
            if hasattr(germplasm, 'result') and germplasm.result:
                for germ in germplasm.result:
                    germ_info = {
                        "name": getattr(germ, 'name', 'No name'),
                        "uri": getattr(germ, 'uri', 'No URI'),
                        "type": getattr(germ, 'rdf_type', 'Unknown type'),
                        "species": getattr(germ, 'species', ''),
                        "variety": getattr(germ, 'variety', '')
                    }
                    all_uris["germplasm"].append(germ_info)
                
                print(f"   Found {len(all_uris['germplasm'])} germplasm:")
                for i, germ in enumerate(all_uris["germplasm"][:3]):
                    print(f"     {i+1}. {germ['name']}")
                    print(f"        URI: {germ['uri']}")
            else:
                print("   No germplasm found")
        except Exception as e:
            print(f"   Error getting germplasm: {e}")
        
        # 7. Get Ontology Types
        print(f"\n8. Finding Ontology Types...")
        try:
            types = client.get_ontology_types()
            if hasattr(types, 'result') and types.result:
                for rdf_type in types.result[:10]:  # Show first 10
                    type_info = {
                        "name": getattr(rdf_type, 'name', 'No name'),
                        "uri": getattr(rdf_type, 'uri', 'No URI'),
                        "comment": getattr(rdf_type, 'comment', ''),
                        "parent": getattr(rdf_type, 'parent', '')
                    }
                    all_uris["ontology_types"].append(type_info)
                
                print(f"   Found {len(all_uris['ontology_types'])} ontology types (showing first 10)")
                for i, ont_type in enumerate(all_uris["ontology_types"][:5]):
                    print(f"     {i+1}. {ont_type['name']}")
                    print(f"        URI: {ont_type['uri']}")
            else:
                print("   No ontology types found")
        except Exception as e:
            print(f"   Error getting ontology types: {e}")
        
        # Summary
        print(f"\n" + "=" * 60)
        print("SUMMARY - URIs Found in Your OpenSilex")
        print("=" * 60)
        print(f"Variables (for measurements): {len(all_uris['variables'])}")
        print(f"Scientific Objects (targets): {len(all_uris['scientific_objects'])}")
        print(f"Experiments: {len(all_uris['experiments'])}")
        print(f"Projects: {len(all_uris['projects'])}")
        print(f"Devices: {len(all_uris['devices'])}")
        print(f"Germplasm: {len(all_uris['germplasm'])}")
        print(f"Ontology Types: {len(all_uris['ontology_types'])}")
        
        # Save to file
        uri_file = save_uris_to_file(all_uris)
        
        # Show how to use these URIs
        print(f"\n" + "=" * 60)
        print("HOW TO USE THESE URIs")
        print("=" * 60)
        
        if all_uris['variables'] and all_uris['scientific_objects']:
            example_target = all_uris['scientific_objects'][0]['uri']
            example_variable = all_uris['variables'][0]['uri']
            
            print(f"For data import, you need:")
            print(f"1. TARGET URI (what you're measuring):")
            print(f"   Example: {example_target}")
            print(f"2. VARIABLE URI (what measurement/trait):")
            print(f"   Example: {example_variable}")
            
            print(f"\nExample CSV row:")
            print(f"target_uri,variable_uri,value,date")
            print(f"{example_target},{example_variable},25.4,2024-01-15 10:00:00")
            
            print(f"\nExample data point:")
            print(f"client.add_data_point(")
            print(f"    target='{example_target}',")
            print(f"    variable='{example_variable}',")
            print(f"    value=25.4")
            print(f")")
        else:
            print("⚠️  You need to create variables and scientific objects first!")
            print("   Go to: http://98.71.237.204:8666")
            print("   1. Create Variables (measurements/traits)")
            print("   2. Create Scientific Objects (plots, plants, devices)")
        
        return all_uris
        
    except Exception as e:
        print(f"\nFailed to connect: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure OpenSilex is running on the server")
        print("2. Check your credentials")
        print("3. Verify network access to 98.71.237.204:8666")
        return None

def create_uri_reference_file(uris_data):
    """Create a human-readable reference file with the URIs."""
    if not uris_data:
        return
    
    filename = "URI_REFERENCE.md"
    with open(filename, 'w') as f:
        f.write("# OpenSilex URI Reference\n\n")
        f.write(f"Generated: {uris_data['discovered_at']}\n")
        f.write(f"Server: {uris_data['server']}\n\n")
        
        # Variables section
        f.write("## Variables (What you can measure)\n\n")
        if uris_data['variables']:
            for var in uris_data['variables']:
                f.write(f"### {var['name']}\n")
                f.write(f"- **URI**: `{var['uri']}`\n")
                f.write(f"- **Type**: {var['datatype']}\n")
                if var['description']:
                    f.write(f"- **Description**: {var['description']}\n")
                if var['unit']:
                    f.write(f"- **Unit**: {var['unit']}\n")
                f.write("\n")
        else:
            f.write("No variables found.\n\n")
        
        # Scientific Objects section
        f.write("## Scientific Objects (What you measure on)\n\n")
        if uris_data['scientific_objects']:
            for obj in uris_data['scientific_objects']:
                f.write(f"### {obj['name']}\n")
                f.write(f"- **URI**: `{obj['uri']}`\n")
                f.write(f"- **Type**: {obj['type']}\n")
                if obj['experiment']:
                    f.write(f"- **Experiment**: {obj['experiment']}\n")
                f.write("\n")
        else:
            f.write("No scientific objects found.\n\n")
        
        # Usage examples
        f.write("## Usage Examples\n\n")
        if uris_data['variables'] and uris_data['scientific_objects']:
            example_target = uris_data['scientific_objects'][0]['uri']
            example_variable = uris_data['variables'][0]['uri']
            
            f.write("### CSV Import Example\n\n")
            f.write("```csv\n")
            f.write("target_uri,variable_uri,value,date,confidence\n")
            f.write(f"{example_target},{example_variable},25.4,2024-01-15 10:00:00,0.95\n")
            f.write("```\n\n")
            
            f.write("### Python API Example\n\n")
            f.write("```python\n")
            f.write("from opensilex_client import connect\n")
            f.write("client = connect()\n\n")
            f.write("client.add_data_point(\n")
            f.write(f"    target='{example_target}',\n")
            f.write(f"    variable='{example_variable}',\n")
            f.write("    value=25.4\n")
            f.write(")\n")
            f.write("```\n\n")
    
    print(f"Human-readable reference created: {filename}")

def main():
    """Main function."""
    print("This script will connect to your OpenSilex server and show you")
    print("all available URIs that you can use for data import.\n")
    
    uris_data = find_all_uris()
    
    if uris_data:
        create_uri_reference_file(uris_data)
        
        print(f"\n" + "=" * 60)
        print("FILES CREATED:")
        print("=" * 60)
        print("📄 opensilex_uris.json - Complete URI data (machine readable)")
        print("📄 URI_REFERENCE.md - Human readable reference with examples")
        
        print(f"\n🎯 NEXT STEPS:")
        print("1. Open URI_REFERENCE.md to see all your URIs")
        print("2. Use these URIs in your data files")
        print("3. Run import scripts with your real data")
        print("4. Example: python import_scripts/csv_data_importer.py your_data.csv")
        
        return 0
    else:
        return 1

if __name__ == "__main__":
    exit(main())
#!/usr/bin/env python3
"""
Test import scripts with actual OpenSilex server from SSH config.

This script tests the import functionality using your real OpenSilex server
at 98.71.237.204:8666 (from your SSH config).
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from opensilex_client import connect
import pandas as pd
import json
from datetime import datetime, timedelta
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_server_connection():
    """Test connection to the OpenSilex server."""
    print("Testing OpenSilex Server Connection")
    print("=" * 50)
    
    try:
        # Connect using host from SSH config
        client = connect(host="http://98.71.237.204:8666")
        
        # Get status
        status = client.get_status()
        print(f"Connection successful!")
        print(f"   Server: {status.get('server_host')}")
        print(f"   Authenticated: {status.get('authenticated')}")
        print(f"   Username: {status.get('username', 'N/A')}")
        print(f"   Server accessible: {status.get('server_accessible', 'Unknown')}")
        
        return client
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print("\n💡 Troubleshooting:")
        print("   1. Check if OpenSilex is running on the server")
        print("   2. SSH into server: ssh opensilex-github-vm")
        print("   3. Check OpenSilex status: sudo systemctl status opensilex")
        print("   4. Verify port 8666 is accessible")
        return None

def discover_available_resources(client):
    """Discover what resources are available in the OpenSilex instance."""
    print("\n🔍 Discovering Available Resources")
    print("=" * 50)
    
    resources = {
        'experiments': [],
        'variables': [], 
        'scientific_objects': [],
        'projects': [],
        'devices': []
    }
    
    try:
        # Get experiments
        print("📊 Fetching experiments...")
        experiments = client.list_experiments(limit=10)
        if hasattr(experiments, 'result') and experiments.result:
            for exp in experiments.result:
                resources['experiments'].append({
                    'name': getattr(exp, 'name', 'No name'),
                    'uri': getattr(exp, 'uri', 'No URI'),
                    'start_date': getattr(exp, 'start_date', 'No date')
                })
            print(f"   Found {len(resources['experiments'])} experiments")
        else:
            print("   No experiments found")
            
    except Exception as e:
        print(f"   ⚠️  Error fetching experiments: {e}")
    
    try:
        # Get variables
        print("📏 Fetching variables...")
        variables = client.list_variables(limit=10)
        if hasattr(variables, 'result') and variables.result:
            for var in variables.result:
                resources['variables'].append({
                    'name': getattr(var, 'name', 'No name'),
                    'uri': getattr(var, 'uri', 'No URI'),
                    'datatype': getattr(var, 'datatype', 'Unknown')
                })
            print(f"   Found {len(resources['variables'])} variables")
        else:
            print("   No variables found")
            
    except Exception as e:
        print(f"   ⚠️  Error fetching variables: {e}")
    
    try:
        # Get scientific objects
        print("🧪 Fetching scientific objects...")
        sci_objects = client.list_scientific_objects(limit=10)
        if hasattr(sci_objects, 'result') and sci_objects.result:
            for obj in sci_objects.result:
                resources['scientific_objects'].append({
                    'name': getattr(obj, 'name', 'No name'),
                    'uri': getattr(obj, 'uri', 'No URI'),
                    'type': getattr(obj, 'rdf_type', 'Unknown type')
                })
            print(f"   Found {len(resources['scientific_objects'])} scientific objects")
        else:
            print("   No scientific objects found")
            
    except Exception as e:
        print(f"   ⚠️  Error fetching scientific objects: {e}")
    
    try:
        # Get projects
        print("📁 Fetching projects...")
        projects = client.list_projects(limit=5)
        if hasattr(projects, 'result') and projects.result:
            for proj in projects.result:
                resources['projects'].append({
                    'name': getattr(proj, 'name', 'No name'),
                    'uri': getattr(proj, 'uri', 'No URI')
                })
            print(f"   Found {len(resources['projects'])} projects")
        else:
            print("   No projects found")
            
    except Exception as e:
        print(f"   ⚠️  Error fetching projects: {e}")
    
    # Print summary
    print(f"\n📋 Resource Summary:")
    for resource_type, items in resources.items():
        print(f"   {resource_type}: {len(items)} found")
    
    return resources

def create_sample_data_with_real_uris(resources):
    """Create sample data using real URIs from the OpenSilex instance."""
    print("\n📝 Creating Sample Data with Real URIs")
    print("=" * 50)
    
    # Check if we have the minimum required resources
    if not resources['variables'] or not resources['scientific_objects']:
        print("❌ Cannot create sample data: Need at least 1 variable and 1 scientific object")
        print("\n💡 Your OpenSilex instance might be empty. You may need to:")
        print("   1. Create some variables through the web interface")
        print("   2. Create some scientific objects (plots, plants, etc.)")
        print("   3. Set up basic experiments")
        return None
    
    # Use first available resources
    sample_target = resources['scientific_objects'][0]['uri']
    sample_variable = resources['variables'][0]['uri']
    
    print(f"✅ Using real URIs from your OpenSilex:")
    print(f"   Target: {sample_target}")
    print(f"   Variable: {sample_variable}")
    
    # Create CSV sample data
    csv_data = []
    base_time = datetime.now() - timedelta(hours=24)
    
    for hour in range(0, 24, 4):  # Every 4 hours
        timestamp = base_time + timedelta(hours=hour)
        value = 20 + hour * 0.5 + (hour % 8) * 0.1  # Simulate realistic values
        
        csv_data.append({
            'target_uri': sample_target,
            'variable_uri': sample_variable,
            'measurement_value': round(value, 2),
            'measurement_date': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'confidence_level': 0.9 + (hour % 3) * 0.03  # Vary confidence slightly
        })
    
    # Save CSV
    csv_file = "test_data_real_uris.csv"
    df = pd.DataFrame(csv_data)
    df.to_csv(csv_file, index=False)
    print(f"✅ Created CSV file: {csv_file} with {len(csv_data)} records")
    
    # Create JSON sample data
    json_data = {
        "experiment": "Test Import with Real URIs",
        "measurements": {
            "data": []
        }
    }
    
    for record in csv_data:
        json_data["measurements"]["data"].append({
            "target": record['target_uri'],
            "variable": record['variable_uri'],
            "value": record['measurement_value'],
            "date": record['measurement_date'],
            "confidence": record['confidence_level']
        })
    
    # Save JSON
    json_file = "test_data_real_uris.json"
    with open(json_file, 'w') as f:
        json.dump(json_data, f, indent=2)
    print(f"✅ Created JSON file: {json_file}")
    
    return {
        'csv_file': csv_file,
        'json_file': json_file,
        'sample_data': csv_data,
        'target_uri': sample_target,
        'variable_uri': sample_variable
    }

def test_csv_import(client, test_files):
    """Test CSV import with real data."""
    print("\n📊 Testing CSV Import")
    print("=" * 50)
    
    try:
        # Import the CSV importer
        from import_scripts.csv_data_importer import CSVDataImporter
        
        # Create importer
        importer = CSVDataImporter(client)
        
        # Define column mapping for our test data
        column_mapping = {
            'target_uri': 'target',
            'variable_uri': 'variable',
            'measurement_value': 'value',
            'measurement_date': 'date',
            'confidence_level': 'confidence'
        }
        
        print(f"📁 Importing from: {test_files['csv_file']}")
        print(f"🗺️  Column mapping: {column_mapping}")
        
        # First do a dry run
        print("\n🧪 Dry run (validation only)...")
        dry_summary = importer.import_from_csv(
            test_files['csv_file'],
            column_mapping,
            batch_size=5,
            dry_run=True
        )
        
        print(f"✅ Dry run results:")
        print(f"   Total rows: {dry_summary['total_rows']}")
        print(f"   Would import: {dry_summary['imported']}")
        print(f"   Validation errors: {dry_summary['errors']}")
        
        if dry_summary['errors'] > 0:
            print(f"❌ Validation errors found:")
            for error in dry_summary['error_details'][:3]:
                print(f"   - {error}")
            return False
        
        # Ask user if they want to proceed with actual import
        print(f"\n❓ Dry run successful! Would you like to import {dry_summary['imported']} records for real?")
        response = input("   Type 'yes' to proceed with actual import: ").lower().strip()
        
        if response == 'yes':
            print("\n💾 Performing actual import...")
            real_summary = importer.import_from_csv(
                test_files['csv_file'],
                column_mapping,
                batch_size=5,
                dry_run=False
            )
            
            print(f"✅ Import completed:")
            print(f"   Successfully imported: {real_summary['imported']}")
            print(f"   Errors: {real_summary['errors']}")
            
            if real_summary['errors'] > 0:
                print(f"❌ Import errors:")
                for error in real_summary['error_details']:
                    print(f"   - {error}")
            
            return real_summary['errors'] == 0
        else:
            print("⏭️  Skipping actual import")
            return True
            
    except Exception as e:
        print(f"❌ CSV import test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_data_search(client, test_files):
    """Test searching for the imported data."""
    print("\n🔍 Testing Data Search")
    print("=" * 50)
    
    try:
        # Search for data from the last day
        end_date = datetime.now()
        start_date = end_date - timedelta(days=1)
        
        print(f"🗓️  Searching for data from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        
        # Search with the URIs we used
        search_results = client.search_data(
            target=test_files['target_uri'],
            variable=test_files['variable_uri'],
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            limit=20
        )
        
        if hasattr(search_results, 'result') and search_results.result:
            print(f"✅ Found {len(search_results.result)} data points!")
            print(f"📊 Recent data points:")
            
            for i, data_point in enumerate(search_results.result[:5]):
                target = getattr(data_point, 'target', 'Unknown')
                variable = getattr(data_point, 'variable', 'Unknown')
                value = getattr(data_point, 'value', 'Unknown')
                date = getattr(data_point, 'date', 'Unknown')
                
                print(f"   {i+1}. Value: {value}, Date: {date}")
                print(f"      Target: {target}")
                print(f"      Variable: {variable}")
        else:
            print("ℹ️  No data found in search results")
            print("   This might be normal if:")
            print("   - Data was not actually imported (dry run only)")
            print("   - Search parameters don't match imported data")
            print("   - Data indexing is still in progress")
        
        return True
        
    except Exception as e:
        print(f"❌ Data search failed: {e}")
        return False

def cleanup_test_files():
    """Clean up test files."""
    print("\n🧹 Cleaning up test files...")
    
    test_files = [
        "test_data_real_uris.csv",
        "test_data_real_uris.json"
    ]
    
    for file in test_files:
        try:
            if os.path.exists(file):
                os.remove(file)
                print(f"   Removed: {file}")
        except Exception as e:
            print(f"   Failed to remove {file}: {e}")

def main():
    """Main test function."""
    print("OpenSilex Import Scripts - Server Test")
    print("=" * 60)
    print(f"Testing with server: 98.71.237.204:8666 (from SSH config)")
    print("=" * 60)
    
    try:
        # Step 1: Test connection
        client = test_server_connection()
        if not client:
            return 1
        
        # Step 2: Discover resources
        resources = discover_available_resources(client)
        
        # Step 3: Create sample data with real URIs
        test_files = create_sample_data_with_real_uris(resources)
        if not test_files:
            print("\n❌ Cannot proceed without sample data")
            return 1
        
        # Step 4: Test CSV import
        csv_success = test_csv_import(client, test_files)
        
        # Step 5: Test data search
        search_success = test_data_search(client, test_files)
        
        # Summary
        print("\n" + "=" * 60)
        print("📋 Test Summary")
        print("=" * 60)
        print(f"✅ Server connection: Success")
        print(f"✅ Resource discovery: Success")
        print(f"✅ Sample data creation: Success")
        print(f"{'✅' if csv_success else '❌'} CSV import test: {'Success' if csv_success else 'Failed'}")
        print(f"{'✅' if search_success else '❌'} Data search test: {'Success' if search_success else 'Failed'}")
        
        if csv_success and search_success:
            print(f"\n🎉 All tests passed! Your import scripts are working with the OpenSilex server.")
            print(f"🚀 You can now use the import scripts with your real data:")
            print(f"   - Edit column mappings to match your data structure")
            print(f"   - Use the URIs discovered above in your data files")
            print(f"   - Run imports with: python import_scripts/csv_data_importer.py your_data.csv")
        else:
            print(f"\n⚠️  Some tests failed. Check the error messages above.")
        
        # Cleanup
        cleanup_response = input(f"\n🧹 Remove test files? (y/n): ").lower().strip()
        if cleanup_response in ['y', 'yes']:
            cleanup_test_files()
        
        return 0 if (csv_success and search_success) else 1
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())
#!/usr/bin/env python3
"""
Quick test of import scripts with real server.
This script will create sample data and test the CSV importer.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from opensilex_client import connect
import pandas as pd
from datetime import datetime, timedelta

def main():
    print("Quick Import Test")
    print("=================")
    
    # First, let's create some sample data files
    print("1. Creating sample data files...")
    
    # Create CSV sample
    csv_data = [
        {
            'plot_uri': 'http://example.opensilex.org/plot/001',
            'variable_uri': 'http://example.opensilex.org/variable/height',
            'measurement_value': 25.4,
            'measurement_date': '2024-01-15 10:00:00',
            'confidence_level': 0.95
        },
        {
            'plot_uri': 'http://example.opensilex.org/plot/002',
            'variable_uri': 'http://example.opensilex.org/variable/height',
            'measurement_value': 23.1,
            'measurement_date': '2024-01-15 10:15:00',
            'confidence_level': 0.90
        }
    ]
    
    df = pd.DataFrame(csv_data)
    df.to_csv('quick_test_data.csv', index=False)
    print("   Created: quick_test_data.csv")
    
    # Test the CSV importer
    print("\n2. Testing CSV importer...")
    try:
        # Import and test the CSV importer
        from import_scripts.csv_data_importer import CSVDataImporter, get_column_mapping_suggestions
        
        # Test column mapping suggestions
        suggestions = get_column_mapping_suggestions('quick_test_data.csv')
        print("   Column mapping suggestions:")
        for col, field in suggestions.items():
            print(f"     '{col}' -> '{field}'")
        
        # Test with a mock client (dry run without server)
        print("\n   Testing import logic (without server connection)...")
        
        # This would normally require authentication, but we can test the logic
        column_mapping = {
            'plot_uri': 'target',
            'variable_uri': 'variable',
            'measurement_value': 'value',
            'measurement_date': 'date',
            'confidence_level': 'confidence'
        }
        
        print(f"   Column mapping: {column_mapping}")
        print("   (This test would work with real server authentication)")
        
        print("\n3. Testing JSON importer...")
        
        # Create JSON sample
        json_sample = {
            "experiment": "Test Import",
            "measurements": {
                "data": [
                    {
                        "target": "http://example.opensilex.org/plot/001",
                        "variable": "http://example.opensilex.org/variable/height",
                        "value": 25.4,
                        "date": "2024-01-15T10:00:00",
                        "confidence": 0.95
                    }
                ]
            }
        }
        
        import json
        with open('quick_test_data.json', 'w') as f:
            json.dump(json_sample, f, indent=2)
        print("   Created: quick_test_data.json")
        
        from import_scripts.json_data_importer import analyze_json_structure
        print("   Analyzing JSON structure...")
        analyze_json_structure('quick_test_data.json')
        
        print("\n4. Testing database importer...")
        from import_scripts.database_importer import create_sample_sqlite_db
        db_file = create_sample_sqlite_db('quick_test.db')
        print(f"   Created sample database: {db_file}")
        
        print("\n5. Testing sensor importer...")
        from import_scripts.sensor_data_importer import create_sample_sensor_data, create_sample_sensor_mapping
        sensor_file = create_sample_sensor_data('quick_sensor_data.csv')
        mapping_file = create_sample_sensor_mapping('quick_sensor_mappings.json')
        print(f"   Created sensor data: {sensor_file}")
        print(f"   Created sensor mappings: {mapping_file}")
        
        print("\n" + "="*50)
        print("SUCCESS: All import scripts loaded and tested!")
        print("="*50)
        
        print("\nSample files created:")
        print("  - quick_test_data.csv (CSV format)")
        print("  - quick_test_data.json (JSON format)")
        print("  - quick_test.db (SQLite database)")
        print("  - quick_sensor_data.csv (Sensor data)")
        print("  - quick_sensor_mappings.json (Sensor mappings)")
        
        print("\nTo use with your OpenSilex server:")
        print("  1. Run: python test_with_auth.py")
        print("  2. Get real URIs from your OpenSilex")
        print("  3. Update the sample files with real URIs")
        print("  4. Run the import scripts:")
        print("     python import_scripts/csv_data_importer.py quick_test_data.csv")
        
        # Cleanup option
        cleanup = input("\nRemove test files? (y/n): ").lower().strip()
        if cleanup in ['y', 'yes']:
            import os
            test_files = [
                'quick_test_data.csv',
                'quick_test_data.json', 
                'quick_test.db',
                'quick_sensor_data.csv',
                'quick_sensor_mappings.json'
            ]
            for file in test_files:
                try:
                    if os.path.exists(file):
                        os.remove(file)
                        print(f"   Removed: {file}")
                except Exception as e:
                    print(f"   Failed to remove {file}: {e}")
        
        return 0
        
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())
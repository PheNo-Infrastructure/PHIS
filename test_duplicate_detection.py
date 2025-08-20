#!/usr/bin/env python3
"""
Test the duplicate detection logic with actual data structures
"""

import sys
sys.path.append('demo_scripts')
from import_data import DataImporter
from opensilex_client import OpenSILEXClient

def test_duplicate_detection():
    """Test duplicate detection with sample data"""
    
    # Sample existing data (what's in VM)
    existing_data_sample = [
        {
            'variable': 'http://opensilex.test/id/variable/air_temperature_datalogging_degreecelsius',
            'target': None,
            'date': '2025-07-30T19:30:42.663Z',
            'provenance': {
                'uri': 'opensilex-sandbox:id/provenance/datalogging',
                'provUsed': [{'type': 'http://www.opensilex.org/vocabulary/oeso#TemperatureSensor', 'uri': 'opensilex-sandbox:id/device/datalogging_temperature'}],
                'provWasAssociatedWith': [{'type': 'http://www.opensilex.org/vocabulary/oeso#TemperatureSensor', 'uri': 'opensilex-sandbox:id/device/datalogging_temperature'}]
            }
        }
    ]
    
    # Sample new data (what we're trying to import)
    new_data_sample = [
        {
            'variable': 'http://opensilex.test/id/variable/air_temperature_datalogging_degreecelsius',
            'target': None,
            'date': '2025-07-30T19:30:42.663Z',
            'provenance': {'uri': 'opensilex-sandbox:id/provenance/datalogging'}  # Simplified provenance
        },
        {
            'variable': 'http://opensilex.test/id/variable/air_temperature_datalogging_degreecelsius',
            'target': None,
            'date': '2025-07-30T19:31:00.000Z',  # Different date - should be new
            'provenance': {'uri': 'opensilex-sandbox:id/provenance/datalogging'}
        }
    ]
    
    # Create a mock importer to test the logic
    class MockClient:
        def get_all_items(self, endpoint):
            if endpoint == "core/data":
                return existing_data_sample
            return []
    
    class MockImporter:
        def __init__(self):
            self.existing_data_keys = self._get_existing_data_keys()
        
        def _get_existing_data_keys(self):
            data_keys = set()
            for item in existing_data_sample:
                variable = item.get('variable', '')
                target = item.get('target', '')
                date = item.get('date', '')
                prov_key = self._normalize_provenance_for_key(item.get('provenance'))
                unique_key = (variable, prov_key, target, date)
                data_keys.add(unique_key)
            return data_keys
        
        def _normalize_provenance_for_key(self, provenance):
            if not provenance:
                return ''
            if isinstance(provenance, str):
                return provenance
            if isinstance(provenance, dict):
                if 'uri' in provenance:
                    return provenance['uri']
                if 'provUsed' in provenance or 'provWasAssociatedWith' in provenance:
                    import json
                    return json.dumps(provenance, sort_keys=True)
            return str(provenance)
        
        def _data_exists(self, data_item):
            variable = data_item.get('variable', '')
            target = data_item.get('target', '')
            date = data_item.get('date', '')
            prov_key = self._normalize_provenance_for_key(data_item.get('provenance'))
            unique_key = (variable, prov_key, target, date)
            return unique_key in self.existing_data_keys
    
    # Test the logic
    mock_importer = MockImporter()
    
    print("Testing duplicate detection...")
    print(f"Existing data keys: {len(mock_importer.existing_data_keys)}")
    
    for i, item in enumerate(new_data_sample):
        exists = mock_importer._data_exists(item)
        print(f"Item {i+1}: {'DUPLICATE' if exists else 'NEW'}")
        print(f"  Variable: {item['variable'][:50]}...")
        print(f"  Date: {item['date']}")
        print(f"  Target: {item['target']}")
        
        # Show the provenance key being used
        prov_key = mock_importer._normalize_provenance_for_key(item.get('provenance'))
        print(f"  Provenance key: {prov_key}")
        
        unique_key = (item.get('variable', ''), prov_key, item.get('target', ''), item.get('date', ''))
        print(f"  Full key in existing? {unique_key in mock_importer.existing_data_keys}")
        print()

if __name__ == "__main__":
    test_duplicate_detection()
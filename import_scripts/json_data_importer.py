#!/usr/bin/env python3
"""
JSON Data Importer for OpenSilex

This script imports data from JSON files into OpenSilex using the API.
Supports various JSON formats including nested structures.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from opensilex_client import connect
import json
from datetime import datetime
import logging
from typing import Dict, List, Any, Optional, Union
import argparse

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class JSONDataImporter:
    """Import data from JSON files into OpenSilex."""
    
    def __init__(self, client):
        """
        Initialize the importer.
        
        Args:
            client: Authenticated OpenSilex client
        """
        self.client = client
        self.imported_count = 0
        self.error_count = 0
        self.errors = []
    
    def import_from_json(self, json_file: str, data_path: str = None,
                        field_mapping: Dict[str, str] = None,
                        date_fields: List[str] = None,
                        date_format: str = '%Y-%m-%dT%H:%M:%S',
                        batch_size: int = 100,
                        dry_run: bool = False) -> Dict[str, Any]:
        """
        Import data from a JSON file.
        
        Args:
            json_file: Path to JSON file
            data_path: JSONPath to the data array (e.g., 'measurements.data')
            field_mapping: Mapping of JSON fields to OpenSilex fields
            date_fields: List of fields that contain dates
            date_format: Format of date strings in JSON
            batch_size: Number of records to import per batch
            dry_run: If True, validate but don't actually import
            
        Returns:
            Import summary
        """
        logger.info(f"Starting import from {json_file}")
        logger.info(f"Data path: {data_path}")
        logger.info(f"Field mapping: {field_mapping}")
        logger.info(f"Dry run: {dry_run}")
        
        try:
            # Read JSON file
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            # Extract data array based on path
            if data_path:
                data_array = self._extract_data_by_path(data, data_path)
            elif isinstance(data, list):
                data_array = data
            elif isinstance(data, dict) and 'data' in data:
                data_array = data['data']
            else:
                raise ValueError("Cannot find data array in JSON. Use data_path parameter.")
            
            logger.info(f"Loaded {len(data_array)} records from JSON")
            
            # Process data in batches
            total_batches = (len(data_array) + batch_size - 1) // batch_size
            logger.info(f"Processing {total_batches} batches of {batch_size} records each")
            
            for batch_num in range(total_batches):
                start_idx = batch_num * batch_size
                end_idx = min((batch_num + 1) * batch_size, len(data_array))
                batch_data = data_array[start_idx:end_idx]
                
                logger.info(f"Processing batch {batch_num + 1}/{total_batches} (records {start_idx}-{end_idx-1})")
                self._process_batch(batch_data, field_mapping, date_fields, date_format, dry_run)
            
            # Return summary
            summary = {
                'total_records': len(data_array),
                'imported': self.imported_count,
                'errors': self.error_count,
                'error_details': self.errors,
                'dry_run': dry_run
            }
            
            logger.info(f"Import complete: {self.imported_count} imported, {self.error_count} errors")
            return summary
            
        except Exception as e:
            logger.error(f"Import failed: {e}")
            raise
    
    def _extract_data_by_path(self, data: Dict, path: str) -> List:
        """Extract data array from nested JSON using dot notation path."""
        parts = path.split('.')
        current = data
        
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                raise ValueError(f"Path '{path}' not found in JSON structure")
        
        if not isinstance(current, list):
            raise ValueError(f"Path '{path}' does not point to an array")
        
        return current
    
    def _process_batch(self, batch_data: List[Dict], field_mapping: Dict[str, str],
                      date_fields: List[str], date_format: str, dry_run: bool):
        """Process a batch of records."""
        data_points = []
        
        for idx, record in enumerate(batch_data):
            try:
                # Apply field mapping if provided
                if field_mapping:
                    mapped_record = {}
                    for json_field, opensilex_field in field_mapping.items():
                        if json_field in record:
                            mapped_record[opensilex_field] = record[json_field]
                    record = mapped_record
                
                # Process date fields
                if date_fields:
                    for date_field in date_fields:
                        if date_field in record and record[date_field] is not None:
                            if isinstance(record[date_field], str):
                                try:
                                    record[date_field] = datetime.strptime(record[date_field], date_format)
                                except ValueError:
                                    # Try ISO format as fallback
                                    try:
                                        record[date_field] = datetime.fromisoformat(record[date_field].replace('Z', '+00:00'))
                                    except ValueError:
                                        logger.warning(f"Could not parse date: {record[date_field]}")
                                        record[date_field] = datetime.now()
                
                # Ensure required fields exist
                if 'date' not in record or record['date'] is None:
                    record['date'] = datetime.now()
                
                # Convert value to appropriate type
                if 'value' in record and record['value'] is not None:
                    try:
                        record['value'] = float(record['value'])
                    except (ValueError, TypeError):
                        # Keep as string if not numeric
                        pass
                
                # Validate required fields
                required_fields = ['target', 'variable', 'value', 'date']
                missing_required = [field for field in required_fields if field not in record or record[field] is None]
                if missing_required:
                    raise ValueError(f"Missing required fields: {missing_required}")
                
                # Validate data point
                if not dry_run:
                    self.client.validate_data_point(
                        record['target'],
                        record['variable'],
                        record['value']
                    )
                
                data_points.append(record)
                
            except Exception as e:
                self.error_count += 1
                error_msg = f"Record {idx}: {str(e)}"
                self.errors.append(error_msg)
                logger.warning(error_msg)
        
        # Submit batch if not dry run
        if data_points and not dry_run:
            try:
                result = self.client.add_multiple_data(data_points)
                self.imported_count += len(data_points)
                logger.info(f"Successfully imported {len(data_points)} data points")
            except Exception as e:
                self.error_count += len(data_points)
                error_msg = f"Batch import failed: {str(e)}"
                self.errors.append(error_msg)
                logger.error(error_msg)
        elif data_points:  # dry_run
            self.imported_count += len(data_points)
            logger.info(f"Dry run: would import {len(data_points)} data points")

def create_sample_json(filename: str = "sample_data.json"):
    """Create a sample JSON file for testing."""
    
    # Format 1: Simple array
    simple_format = [
        {
            "target": "http://opensilex.dev/plot/001",
            "variable": "http://opensilex.dev/variable/plant_height",
            "value": 25.4,
            "date": "2024-01-15T10:00:00",
            "confidence": 0.95
        },
        {
            "target": "http://opensilex.dev/plot/002",
            "variable": "http://opensilex.dev/variable/plant_height", 
            "value": 23.1,
            "date": "2024-01-15T10:15:00",
            "confidence": 0.90
        }
    ]
    
    # Format 2: Nested structure
    nested_format = {
        "experiment": "Growth Study 2024",
        "measurements": {
            "data": [
                {
                    "plot_id": "http://opensilex.dev/plot/001",
                    "trait": "http://opensilex.dev/variable/leaf_count",
                    "measurement": 12,
                    "timestamp": "2024-01-15T10:00:00Z",
                    "quality": 0.85
                },
                {
                    "plot_id": "http://opensilex.dev/plot/002",
                    "trait": "http://opensilex.dev/variable/leaf_count",
                    "measurement": 14,
                    "timestamp": "2024-01-15T10:15:00Z",
                    "quality": 0.90
                }
            ]
        },
        "metadata": {
            "created": "2024-01-15",
            "source": "automated_measurement_system"
        }
    }
    
    # Format 3: Sensor data format
    sensor_format = {
        "sensor_id": "greenhouse_001",
        "readings": [
            {
                "sensor_location": "http://opensilex.dev/greenhouse/001",
                "parameter": "http://opensilex.dev/variable/temperature",
                "reading_value": 23.5,
                "recorded_at": "2024-01-15T10:00:00",
                "accuracy": 0.95
            },
            {
                "sensor_location": "http://opensilex.dev/greenhouse/001",
                "parameter": "http://opensilex.dev/variable/humidity",
                "reading_value": 65.2,
                "recorded_at": "2024-01-15T10:00:00",
                "accuracy": 0.90
            }
        ]
    }
    
    # Create different sample files
    samples = {
        "sample_simple.json": simple_format,
        "sample_nested.json": nested_format,
        "sample_sensor.json": sensor_format
    }
    
    for filename, data in samples.items():
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Created sample JSON file: {filename}")
    
    return list(samples.keys())

def analyze_json_structure(json_file: str):
    """Analyze JSON structure and suggest mappings."""
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    print(f"JSON Structure Analysis for: {json_file}")
    print("=" * 50)
    
    def analyze_object(obj, path="", level=0):
        indent = "  " * level
        
        if isinstance(obj, dict):
            for key, value in obj.items():
                current_path = f"{path}.{key}" if path else key
                
                if isinstance(value, list) and len(value) > 0:
                    print(f"{indent}{key}: array with {len(value)} items")
                    if isinstance(value[0], dict):
                        print(f"{indent}  Sample item structure:")
                        analyze_object(value[0], current_path, level + 2)
                elif isinstance(value, dict):
                    print(f"{indent}{key}: object")
                    analyze_object(value, current_path, level + 1)
                else:
                    print(f"{indent}{key}: {type(value).__name__} = {repr(value)}")
        elif isinstance(obj, list) and len(obj) > 0:
            print(f"{indent}Array with {len(obj)} items")
            if isinstance(obj[0], dict):
                print(f"{indent}Sample item structure:")
                analyze_object(obj[0], path, level + 1)
    
    analyze_object(data)
    
    # Suggest field mappings
    print(f"\nSuggested Import Configurations:")
    print("=" * 50)
    
    def find_data_arrays(obj, path=""):
        arrays = []
        if isinstance(obj, dict):
            for key, value in obj.items():
                current_path = f"{path}.{key}" if path else key
                if isinstance(value, list) and len(value) > 0 and isinstance(value[0], dict):
                    arrays.append((current_path, value))
                elif isinstance(value, dict):
                    arrays.extend(find_data_arrays(value, current_path))
        return arrays
    
    data_arrays = find_data_arrays(data)
    
    for path, array in data_arrays:
        print(f"\nFor data path '{path}':")
        sample_item = array[0]
        
        # Suggest field mappings
        field_mapping = {}
        date_fields = []
        
        for key in sample_item.keys():
            key_lower = key.lower()
            if any(word in key_lower for word in ['target', 'plot', 'object', 'location']):
                field_mapping[key] = 'target'
            elif any(word in key_lower for word in ['variable', 'trait', 'parameter', 'measurement_type']):
                field_mapping[key] = 'variable'
            elif any(word in key_lower for word in ['value', 'measurement', 'reading', 'result']):
                field_mapping[key] = 'value'
            elif any(word in key_lower for word in ['date', 'time', 'timestamp', 'recorded']):
                field_mapping[key] = 'date'
                date_fields.append('date')
            elif any(word in key_lower for word in ['confidence', 'quality', 'accuracy', 'certainty']):
                field_mapping[key] = 'confidence'
        
        print(f"  data_path = '{path}'")
        print(f"  field_mapping = {field_mapping}")
        if date_fields:
            print(f"  date_fields = {date_fields}")

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="Import JSON data into OpenSilex")
    parser.add_argument('json_file', nargs='?', help='Path to JSON file to import')
    parser.add_argument('--dry-run', action='store_true', help='Validate without importing')
    parser.add_argument('--batch-size', type=int, default=100, help='Batch size for import')
    parser.add_argument('--date-format', default='%Y-%m-%dT%H:%M:%S', help='Date format in JSON')
    parser.add_argument('--data-path', help='JSONPath to data array (e.g., measurements.data)')
    parser.add_argument('--create-samples', action='store_true', help='Create sample JSON files')
    parser.add_argument('--analyze', action='store_true', help='Analyze JSON structure')
    
    args = parser.parse_args()
    
    if args.create_samples:
        create_sample_json()
        return
    
    if not args.json_file:
        print("Error: JSON file required (or use --create-samples)")
        return 1
    
    if args.analyze:
        if not os.path.exists(args.json_file):
            print(f"Error: JSON file {args.json_file} not found")
            return 1
        analyze_json_structure(args.json_file)
        return
    
    if not os.path.exists(args.json_file):
        print(f"Error: JSON file {args.json_file} not found")
        return 1
    
    try:
        # Connect to OpenSilex
        print("Connecting to OpenSilex...")
        client = connect()
        
        # Example field mappings for different formats
        # You need to modify these based on your JSON structure
        field_mapping_examples = {
            'simple': None,  # Fields already match OpenSilex format
            'nested': {
                'plot_id': 'target',
                'trait': 'variable',
                'measurement': 'value',
                'timestamp': 'date',
                'quality': 'confidence'
            },
            'sensor': {
                'sensor_location': 'target',
                'parameter': 'variable',
                'reading_value': 'value',
                'recorded_at': 'date',
                'accuracy': 'confidence'
            }
        }
        
        # Determine data path and field mapping based on filename
        if 'nested' in args.json_file:
            data_path = args.data_path or 'measurements.data'
            field_mapping = field_mapping_examples['nested']
        elif 'sensor' in args.json_file:
            data_path = args.data_path or 'readings'
            field_mapping = field_mapping_examples['sensor']
        else:
            data_path = args.data_path
            field_mapping = field_mapping_examples['simple']
        
        print(f"Using data path: {data_path}")
        print(f"Using field mapping: {field_mapping}")
        
        # Create importer and run
        importer = JSONDataImporter(client)
        summary = importer.import_from_json(
            args.json_file,
            data_path=data_path,
            field_mapping=field_mapping,
            date_fields=['date'] if field_mapping else None,
            date_format=args.date_format,
            batch_size=args.batch_size,
            dry_run=args.dry_run
        )
        
        # Print summary
        print(f"\nImport Summary:")
        print(f"Total records: {summary['total_records']}")
        print(f"Successfully imported: {summary['imported']}")
        print(f"Errors: {summary['errors']}")
        
        if summary['error_details']:
            print(f"\nError details:")
            for error in summary['error_details'][:10]:  # Show first 10 errors
                print(f"  {error}")
            if len(summary['error_details']) > 10:
                print(f"  ... and {len(summary['error_details']) - 10} more errors")
    
    except Exception as e:
        print(f"Import failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
#!/usr/bin/env python3
"""
Sensor Data Importer for OpenSilex

This script imports real-time sensor data into OpenSilex using the API.
Supports various sensor data formats and real-time streaming.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from opensilex_client import connect
import pandas as pd
from datetime import datetime, timedelta
import logging
from typing import Dict, List, Any, Optional, Union
import argparse
import time
import json
import requests
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SensorDataImporter:
    """Import sensor data into OpenSilex with various input sources."""
    
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
        self.sensor_mappings = {}
    
    def load_sensor_mappings(self, mapping_file: str):
        """Load sensor ID to OpenSilex URI mappings."""
        try:
            with open(mapping_file, 'r') as f:
                self.sensor_mappings = json.load(f)
            logger.info(f"Loaded {len(self.sensor_mappings)} sensor mappings")
        except Exception as e:
            logger.error(f"Failed to load sensor mappings: {e}")
            raise
    
    def import_sensor_log_file(self, log_file: str, sensor_format: str = 'csv',
                              time_column: str = 'timestamp',
                              value_columns: List[str] = None,
                              sensor_id_column: str = 'sensor_id',
                              batch_size: int = 100,
                              dry_run: bool = False) -> Dict[str, Any]:
        """
        Import sensor data from log files.
        
        Args:
            log_file: Path to sensor log file
            sensor_format: Format of the log file ('csv', 'json', 'txt')
            time_column: Name of timestamp column
            value_columns: List of columns containing sensor values
            sensor_id_column: Column containing sensor identifiers
            batch_size: Number of records to import per batch
            dry_run: If True, validate but don't actually import
            
        Returns:
            Import summary
        """
        logger.info(f"Importing sensor data from {log_file}")
        logger.info(f"Format: {sensor_format}")
        
        try:
            # Read sensor data based on format
            if sensor_format == 'csv':
                df = pd.read_csv(log_file)
            elif sensor_format == 'json':
                df = pd.read_json(log_file)
            elif sensor_format == 'txt':
                # Assume space or tab delimited
                df = pd.read_csv(log_file, delimiter=r'\s+')
            else:
                raise ValueError(f"Unsupported format: {sensor_format}")
            
            logger.info(f"Loaded {len(df)} sensor readings")
            
            # Auto-detect value columns if not specified
            if value_columns is None:
                numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
                value_columns = [col for col in numeric_columns if col not in [time_column, sensor_id_column]]
                logger.info(f"Auto-detected value columns: {value_columns}")
            
            # Process data
            data_points = []
            for idx, row in df.iterrows():
                try:
                    sensor_id = str(row[sensor_id_column])
                    timestamp = pd.to_datetime(row[time_column])
                    
                    # Create data points for each sensor value
                    for value_col in value_columns:
                        if pd.isna(row[value_col]):
                            continue
                        
                        # Map sensor ID to OpenSilex URIs
                        if sensor_id in self.sensor_mappings:
                            mapping = self.sensor_mappings[sensor_id]
                            target_uri = mapping.get('target_uri')
                            variable_mapping = mapping.get('variables', {})
                            
                            if value_col in variable_mapping:
                                variable_uri = variable_mapping[value_col]
                                
                                data_point = {
                                    'target': target_uri,
                                    'variable': variable_uri,
                                    'value': float(row[value_col]),
                                    'date': timestamp,
                                    'confidence': mapping.get('confidence', 0.9)
                                }
                                
                                data_points.append(data_point)
                        else:
                            logger.warning(f"No mapping found for sensor ID: {sensor_id}")
                
                except Exception as e:
                    self.error_count += 1
                    error_msg = f"Row {idx}: {str(e)}"
                    self.errors.append(error_msg)
                    logger.warning(error_msg)
            
            # Import in batches
            total_batches = (len(data_points) + batch_size - 1) // batch_size
            for batch_num in range(total_batches):
                start_idx = batch_num * batch_size
                end_idx = min((batch_num + 1) * batch_size, len(data_points))
                batch_data = data_points[start_idx:end_idx]
                
                if batch_data and not dry_run:
                    try:
                        result = self.client.add_multiple_data(batch_data)
                        self.imported_count += len(batch_data)
                        logger.info(f"Imported batch {batch_num + 1}/{total_batches}: {len(batch_data)} points")
                    except Exception as e:
                        self.error_count += len(batch_data)
                        error_msg = f"Batch {batch_num + 1} import failed: {str(e)}"
                        self.errors.append(error_msg)
                        logger.error(error_msg)
                elif batch_data:  # dry_run
                    self.imported_count += len(batch_data)
                    logger.info(f"Dry run batch {batch_num + 1}/{total_batches}: would import {len(batch_data)} points")
            
            return {
                'total_readings': len(df),
                'data_points_created': len(data_points),
                'imported': self.imported_count,
                'errors': self.error_count,
                'error_details': self.errors,
                'dry_run': dry_run
            }
            
        except Exception as e:
            logger.error(f"Import failed: {e}")
            raise
    
    def import_real_time_data(self, api_endpoint: str, polling_interval: int = 60,
                             duration_minutes: int = None,
                             auth_headers: Dict[str, str] = None,
                             data_path: str = None,
                             dry_run: bool = False):
        """
        Import real-time sensor data from an API endpoint.
        
        Args:
            api_endpoint: URL of the sensor API endpoint
            polling_interval: Seconds between API calls
            duration_minutes: How long to run (None = run indefinitely)
            auth_headers: Authentication headers for the API
            data_path: JSONPath to data in API response
            dry_run: If True, validate but don't actually import
        """
        logger.info(f"Starting real-time import from {api_endpoint}")
        logger.info(f"Polling interval: {polling_interval} seconds")
        
        start_time = datetime.now()
        end_time = start_time + timedelta(minutes=duration_minutes) if duration_minutes else None
        
        while True:
            try:
                # Check if we should stop
                if end_time and datetime.now() > end_time:
                    logger.info("Duration limit reached, stopping")
                    break
                
                # Fetch data from API
                headers = auth_headers or {}
                response = requests.get(api_endpoint, headers=headers)
                response.raise_for_status()
                
                data = response.json()
                
                # Extract sensor readings
                if data_path:
                    readings = self._extract_data_by_path(data, data_path)
                elif isinstance(data, list):
                    readings = data
                else:
                    readings = [data]
                
                # Process readings
                data_points = []
                for reading in readings:
                    try:
                        data_point = self._process_sensor_reading(reading)
                        if data_point:
                            data_points.append(data_point)
                    except Exception as e:
                        logger.warning(f"Failed to process reading: {e}")
                
                # Import data points
                if data_points and not dry_run:
                    try:
                        result = self.client.add_multiple_data(data_points)
                        self.imported_count += len(data_points)
                        logger.info(f"Imported {len(data_points)} real-time data points")
                    except Exception as e:
                        logger.error(f"Real-time import failed: {e}")
                elif data_points:  # dry_run
                    self.imported_count += len(data_points)
                    logger.info(f"Dry run: would import {len(data_points)} real-time data points")
                
                # Wait for next polling cycle
                time.sleep(polling_interval)
                
            except KeyboardInterrupt:
                logger.info("Interrupted by user, stopping")
                break
            except Exception as e:
                logger.error(f"Real-time import error: {e}")
                time.sleep(polling_interval)  # Wait before retrying
    
    def _extract_data_by_path(self, data: Dict, path: str) -> List:
        """Extract data array from nested JSON using dot notation path."""
        parts = path.split('.')
        current = data
        
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return []
        
        if isinstance(current, list):
            return current
        else:
            return [current]
    
    def _process_sensor_reading(self, reading: Dict) -> Optional[Dict]:
        """Process a single sensor reading into OpenSilex format."""
        # This is a generic processor - customize based on your sensor data format
        try:
            sensor_id = reading.get('sensor_id') or reading.get('id')
            if sensor_id not in self.sensor_mappings:
                return None
            
            mapping = self.sensor_mappings[sensor_id]
            timestamp = reading.get('timestamp') or reading.get('time') or datetime.now()
            
            if isinstance(timestamp, str):
                timestamp = pd.to_datetime(timestamp)
            
            # Find value field
            value = reading.get('value') or reading.get('measurement') or reading.get('reading')
            if value is None:
                return None
            
            return {
                'target': mapping['target_uri'],
                'variable': mapping['variable_uri'],
                'value': float(value),
                'date': timestamp,
                'confidence': mapping.get('confidence', 0.9)
            }
            
        except Exception as e:
            logger.warning(f"Failed to process sensor reading: {e}")
            return None

def create_sample_sensor_data(filename: str = "sample_sensor_data.csv"):
    """Create sample sensor data file."""
    # Generate 24 hours of sensor data
    start_time = datetime.now() - timedelta(hours=24)
    
    data = []
    sensors = ['temp_01', 'temp_02', 'humidity_01', 'humidity_02']
    
    for hour in range(24):
        for minute in range(0, 60, 15):  # Every 15 minutes
            timestamp = start_time + timedelta(hours=hour, minutes=minute)
            
            for sensor in sensors:
                if 'temp' in sensor:
                    # Temperature data
                    value = 20 + (hour / 24) * 10 + (minute / 60) * 2 + (hash(sensor) % 5)
                else:
                    # Humidity data
                    value = 60 + (hour / 24) * 20 + (minute / 60) * 5 + (hash(sensor) % 10)
                
                data.append({
                    'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                    'sensor_id': sensor,
                    'temperature': value if 'temp' in sensor else None,
                    'humidity': value if 'humidity' in sensor else None,
                    'quality': 0.9 + (hash(f"{sensor}{timestamp}") % 10) / 100
                })
    
    df = pd.DataFrame(data)
    df.to_csv(filename, index=False)
    logger.info(f"Created sample sensor data: {filename} with {len(df)} readings")
    return filename

def create_sample_sensor_mapping(filename: str = "sensor_mappings.json"):
    """Create sample sensor mapping file."""
    mappings = {
        "temp_01": {
            "target_uri": "http://opensilex.dev/greenhouse/001",
            "variable_uri": "http://opensilex.dev/variable/air_temperature",
            "confidence": 0.95
        },
        "temp_02": {
            "target_uri": "http://opensilex.dev/greenhouse/002", 
            "variable_uri": "http://opensilex.dev/variable/air_temperature",
            "confidence": 0.95
        },
        "humidity_01": {
            "target_uri": "http://opensilex.dev/greenhouse/001",
            "variable_uri": "http://opensilex.dev/variable/relative_humidity",
            "confidence": 0.90
        },
        "humidity_02": {
            "target_uri": "http://opensilex.dev/greenhouse/002",
            "variable_uri": "http://opensilex.dev/variable/relative_humidity", 
            "confidence": 0.90
        }
    }
    
    with open(filename, 'w') as f:
        json.dump(mappings, f, indent=2)
    
    logger.info(f"Created sample sensor mappings: {filename}")
    return filename

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="Import sensor data into OpenSilex")
    parser.add_argument('--log-file', help='Path to sensor log file')
    parser.add_argument('--sensor-format', choices=['csv', 'json', 'txt'], default='csv',
                       help='Format of sensor log file')
    parser.add_argument('--mappings', help='Path to sensor mappings JSON file')
    parser.add_argument('--time-column', default='timestamp', help='Name of timestamp column')
    parser.add_argument('--value-columns', nargs='+', help='Names of value columns')
    parser.add_argument('--sensor-id-column', default='sensor_id', help='Name of sensor ID column')
    parser.add_argument('--batch-size', type=int, default=100, help='Batch size for import')
    parser.add_argument('--dry-run', action='store_true', help='Validate without importing')
    
    # Real-time import options
    parser.add_argument('--real-time', action='store_true', help='Enable real-time import mode')
    parser.add_argument('--api-endpoint', help='Sensor API endpoint URL')
    parser.add_argument('--polling-interval', type=int, default=60, help='Polling interval in seconds')
    parser.add_argument('--duration-minutes', type=int, help='Duration to run (default: indefinite)')
    
    # Sample data generation
    parser.add_argument('--create-samples', action='store_true', help='Create sample files')
    
    args = parser.parse_args()
    
    if args.create_samples:
        create_sample_sensor_data()
        create_sample_sensor_mapping()
        return
    
    try:
        # Connect to OpenSilex
        print("Connecting to OpenSilex...")
        client = connect()
        
        # Create importer
        importer = SensorDataImporter(client)
        
        # Load sensor mappings
        if args.mappings:
            importer.load_sensor_mappings(args.mappings)
        else:
            print("Warning: No sensor mappings file specified. Use --mappings option.")
            print("Creating sample mappings file...")
            sample_mappings = create_sample_sensor_mapping()
            importer.load_sensor_mappings(sample_mappings)
        
        if args.real_time:
            # Real-time import mode
            if not args.api_endpoint:
                print("Error: --api-endpoint required for real-time mode")
                return 1
            
            print(f"Starting real-time import from {args.api_endpoint}")
            importer.import_real_time_data(
                args.api_endpoint,
                polling_interval=args.polling_interval,
                duration_minutes=args.duration_minutes,
                dry_run=args.dry_run
            )
        
        elif args.log_file:
            # Log file import mode
            if not os.path.exists(args.log_file):
                print(f"Error: Log file {args.log_file} not found")
                return 1
            
            summary = importer.import_sensor_log_file(
                args.log_file,
                sensor_format=args.sensor_format,
                time_column=args.time_column,
                value_columns=args.value_columns,
                sensor_id_column=args.sensor_id_column,
                batch_size=args.batch_size,
                dry_run=args.dry_run
            )
            
            # Print summary
            print(f"\nImport Summary:")
            print(f"Total sensor readings: {summary['total_readings']}")
            print(f"Data points created: {summary['data_points_created']}")
            print(f"Successfully imported: {summary['imported']}")
            print(f"Errors: {summary['errors']}")
            
            if summary['error_details']:
                print(f"\nError details:")
                for error in summary['error_details'][:10]:
                    print(f"  {error}")
                if len(summary['error_details']) > 10:
                    print(f"  ... and {len(summary['error_details']) - 10} more errors")
        
        else:
            print("Error: Either --log-file or --real-time must be specified")
            print("Use --create-samples to generate test data")
            return 1
    
    except Exception as e:
        print(f"Import failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
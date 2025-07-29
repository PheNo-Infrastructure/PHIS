#!/usr/bin/env python3
"""
CSV Data Importer for OpenSilex

This script imports data from CSV files into OpenSilex using the API.
Supports various CSV formats with flexible column mapping.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from opensilex_client import connect
import pandas as pd
from datetime import datetime
import logging
from typing import Dict, List, Any, Optional
import argparse

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CSVDataImporter:
    """Import data from CSV files into OpenSilex."""
    
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
    
    def import_from_csv(self, csv_file: str, column_mapping: Dict[str, str],
                       date_format: str = '%Y-%m-%d %H:%M:%S',
                       batch_size: int = 100,
                       dry_run: bool = False) -> Dict[str, Any]:
        """
        Import data from a CSV file.
        
        Args:
            csv_file: Path to CSV file
            column_mapping: Mapping of CSV columns to OpenSilex fields
                          e.g., {'target_id': 'target', 'variable_id': 'variable', 'measurement': 'value', 'timestamp': 'date'}
            date_format: Format of date strings in CSV
            batch_size: Number of records to import per batch
            dry_run: If True, validate but don't actually import
            
        Returns:
            Import summary
        """
        logger.info(f"Starting import from {csv_file}")
        logger.info(f"Column mapping: {column_mapping}")
        logger.info(f"Dry run: {dry_run}")
        
        try:
            # Read CSV file
            df = pd.read_csv(csv_file)
            logger.info(f"Loaded {len(df)} rows from CSV")
            
            # Validate columns exist
            missing_cols = [col for col in column_mapping.keys() if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Missing columns in CSV: {missing_cols}")
            
            # Process data in batches
            total_batches = (len(df) + batch_size - 1) // batch_size
            logger.info(f"Processing {total_batches} batches of {batch_size} records each")
            
            for batch_num in range(total_batches):
                start_idx = batch_num * batch_size
                end_idx = min((batch_num + 1) * batch_size, len(df))
                batch_df = df.iloc[start_idx:end_idx]
                
                logger.info(f"Processing batch {batch_num + 1}/{total_batches} (rows {start_idx}-{end_idx-1})")
                self._process_batch(batch_df, column_mapping, date_format, dry_run)
            
            # Return summary
            summary = {
                'total_rows': len(df),
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
    
    def _process_batch(self, batch_df: pd.DataFrame, column_mapping: Dict[str, str],
                      date_format: str, dry_run: bool):
        """Process a batch of records."""
        data_points = []
        
        for idx, row in batch_df.iterrows():
            try:
                # Map CSV columns to OpenSilex fields
                data_point = {}
                
                for csv_col, opensilex_field in column_mapping.items():
                    value = row[csv_col]
                    
                    # Handle different field types
                    if opensilex_field == 'date':
                        if pd.isna(value):
                            data_point[opensilex_field] = datetime.now()
                        else:
                            # Parse date and add timezone
                            dt = datetime.strptime(str(value), date_format)
                            data_point[opensilex_field] = dt.strftime('%Y-%m-%dT%H:%M:%S+00:00')
                    elif opensilex_field == 'value':
                        # Convert to numeric if possible
                        if pd.isna(value):
                            continue  # Skip rows with missing values
                        try:
                            data_point[opensilex_field] = float(value)
                        except (ValueError, TypeError):
                            data_point[opensilex_field] = str(value)
                    elif opensilex_field in ['confidence']:
                        # Handle optional numeric fields
                        if not pd.isna(value):
                            data_point[opensilex_field] = float(value)
                    else:
                        # String fields (target, variable, etc.)
                        if pd.isna(value):
                            raise ValueError(f"Required field {opensilex_field} is missing")
                        data_point[opensilex_field] = str(value)
                
                # Validate required fields
                required_fields = ['target', 'variable', 'value', 'date']
                missing_required = [field for field in required_fields if field not in data_point]
                if missing_required:
                    raise ValueError(f"Missing required fields: {missing_required}")
                
                # Validate data point
                if not dry_run:
                    self.client.validate_data_point(
                        data_point['target'], 
                        data_point['variable'], 
                        data_point['value']
                    )
                
                data_points.append(data_point)
                
            except Exception as e:
                self.error_count += 1
                error_msg = f"Row {idx}: {str(e)}"
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

def create_sample_csv(filename: str = "sample_data.csv"):
    """Create a sample CSV file for testing."""
    sample_data = {
        'plot_uri': [
            'http://opensilex.dev/plot/001',
            'http://opensilex.dev/plot/002', 
            'http://opensilex.dev/plot/003',
            'http://opensilex.dev/plot/001',
            'http://opensilex.dev/plot/002'
        ],
        'variable_uri': [
            'http://opensilex.dev/variable/plant_height',
            'http://opensilex.dev/variable/plant_height',
            'http://opensilex.dev/variable/plant_height',
            'http://opensilex.dev/variable/leaf_count',
            'http://opensilex.dev/variable/leaf_count'
        ],
        'measurement_value': [25.4, 23.1, 27.2, 12, 14],
        'measurement_date': [
            '2024-01-15 10:00:00',
            '2024-01-15 10:15:00',
            '2024-01-15 10:30:00',
            '2024-01-15 10:00:00',
            '2024-01-15 10:15:00'
        ],
        'confidence_level': [0.95, 0.90, 0.95, 0.85, 0.90]
    }
    
    df = pd.DataFrame(sample_data)
    df.to_csv(filename, index=False)
    print(f"Created sample CSV file: {filename}")
    return filename

def get_column_mapping_suggestions(csv_file: str) -> Dict[str, str]:
    """Suggest column mappings based on CSV headers."""
    df = pd.read_csv(csv_file, nrows=1)  # Just read headers
    columns = df.columns.tolist()
    
    suggestions = {}
    
    # Common patterns for mapping
    target_patterns = ['target', 'plot', 'object', 'specimen', 'plant', 'device']
    variable_patterns = ['variable', 'trait', 'measurement', 'sensor', 'parameter']
    value_patterns = ['value', 'measurement', 'reading', 'result', 'data']
    date_patterns = ['date', 'time', 'timestamp', 'datetime', 'when']
    confidence_patterns = ['confidence', 'certainty', 'reliability', 'quality']
    
    for col in columns:
        col_lower = col.lower()
        
        if any(pattern in col_lower for pattern in target_patterns):
            suggestions[col] = 'target'
        elif any(pattern in col_lower for pattern in variable_patterns):
            suggestions[col] = 'variable'
        elif any(pattern in col_lower for pattern in value_patterns):
            suggestions[col] = 'value'
        elif any(pattern in col_lower for pattern in date_patterns):
            suggestions[col] = 'date'
        elif any(pattern in col_lower for pattern in confidence_patterns):
            suggestions[col] = 'confidence'
    
    return suggestions

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="Import CSV data into OpenSilex")
    parser.add_argument('csv_file', help='Path to CSV file to import')
    parser.add_argument('--dry-run', action='store_true', help='Validate without importing')
    parser.add_argument('--batch-size', type=int, default=100, help='Batch size for import')
    parser.add_argument('--date-format', default='%Y-%m-%d %H:%M:%S', help='Date format in CSV')
    parser.add_argument('--create-sample', action='store_true', help='Create sample CSV file')
    parser.add_argument('--suggest-mapping', action='store_true', help='Suggest column mappings')
    
    args = parser.parse_args()
    
    if args.create_sample:
        create_sample_csv()
        return
    
    if args.suggest_mapping:
        if not os.path.exists(args.csv_file):
            print(f"Error: CSV file {args.csv_file} not found")
            return
        
        suggestions = get_column_mapping_suggestions(args.csv_file)
        print("Suggested column mappings:")
        for csv_col, opensilex_field in suggestions.items():
            print(f"  '{csv_col}' -> '{opensilex_field}'")
        
        print("\nExample column mapping dictionary:")
        print(f"column_mapping = {suggestions}")
        return
    
    if not os.path.exists(args.csv_file):
        print(f"Error: CSV file {args.csv_file} not found")
        return
    
    try:
        # Connect to OpenSilex
        print("Connecting to OpenSilex...")
        client = connect()
        
        # You need to define your column mapping here
        # This is an example - modify based on your CSV structure
        column_mapping = {
            'target_uri': 'target',
            'variable_uri': 'variable', 
            'value': 'value',
            'date': 'date',
            'confidence': 'confidence'
        }
        
        print("IMPORTANT: Update the column_mapping in the script to match your CSV!")
        print(f"Current mapping: {column_mapping}")
        
        # Create importer and run
        importer = CSVDataImporter(client)
        summary = importer.import_from_csv(
            args.csv_file,
            column_mapping,
            date_format=args.date_format,
            batch_size=args.batch_size,
            dry_run=args.dry_run
        )
        
        # Print summary
        print(f"\nImport Summary:")
        print(f"Total rows: {summary['total_rows']}")
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
#!/usr/bin/env python3
"""
Database Data Importer for OpenSilex

This script imports data from various databases into OpenSilex using the API.
Supports SQL Server, MySQL, PostgreSQL, SQLite, and other SQL databases.
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
from sqlalchemy import create_engine, text
import urllib.parse

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DatabaseImporter:
    """Import data from databases into OpenSilex."""
    
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
    
    def import_from_database(self, connection_string: str, query: str,
                           column_mapping: Dict[str, str],
                           date_columns: List[str] = None,
                           batch_size: int = 1000,
                           dry_run: bool = False) -> Dict[str, Any]:
        """
        Import data from a database.
        
        Args:
            connection_string: Database connection string
            query: SQL query to fetch data
            column_mapping: Mapping of database columns to OpenSilex fields
            date_columns: List of columns that contain dates
            batch_size: Number of records to import per batch
            dry_run: If True, validate but don't actually import
            
        Returns:
            Import summary
        """
        logger.info(f"Starting database import")
        logger.info(f"Query: {query}")
        logger.info(f"Column mapping: {column_mapping}")
        logger.info(f"Dry run: {dry_run}")
        
        try:
            # Create database connection
            engine = create_engine(connection_string)
            logger.info("Database connection established")
            
            # Execute query and fetch data in chunks
            chunk_iter = pd.read_sql(query, engine, chunksize=batch_size)
            
            total_processed = 0
            for chunk_num, chunk_df in enumerate(chunk_iter):
                logger.info(f"Processing chunk {chunk_num + 1} with {len(chunk_df)} records")
                
                # Process the chunk
                self._process_chunk(chunk_df, column_mapping, date_columns, dry_run)
                total_processed += len(chunk_df)
            
            # Close database connection
            engine.dispose()
            
            # Return summary
            summary = {
                'total_records': total_processed,
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
    
    def _process_chunk(self, chunk_df: pd.DataFrame, column_mapping: Dict[str, str],
                      date_columns: List[str], dry_run: bool):
        """Process a chunk of database records."""
        data_points = []
        
        for idx, row in chunk_df.iterrows():
            try:
                # Map database columns to OpenSilex fields
                data_point = {}
                
                for db_col, opensilex_field in column_mapping.items():
                    if db_col not in chunk_df.columns:
                        continue
                    
                    value = row[db_col]
                    
                    # Handle different field types
                    if opensilex_field == 'date':
                        if pd.isna(value):
                            data_point[opensilex_field] = datetime.now()
                        elif isinstance(value, str):
                            # Try to parse string dates
                            try:
                                data_point[opensilex_field] = pd.to_datetime(value)
                            except:
                                data_point[opensilex_field] = datetime.now()
                        else:
                            data_point[opensilex_field] = pd.to_datetime(value)
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

def create_connection_string(db_type: str, **kwargs) -> str:
    """Create a database connection string."""
    
    connection_strings = {
        'sqlite': lambda: f"sqlite:///{kwargs.get('database', 'data.db')}",
        
        'mysql': lambda: (
            f"mysql+pymysql://{kwargs.get('username')}:{urllib.parse.quote_plus(kwargs.get('password', ''))}@"
            f"{kwargs.get('host', 'localhost')}:{kwargs.get('port', 3306)}/{kwargs.get('database')}"
        ),
        
        'postgresql': lambda: (
            f"postgresql://{kwargs.get('username')}:{urllib.parse.quote_plus(kwargs.get('password', ''))}@"
            f"{kwargs.get('host', 'localhost')}:{kwargs.get('port', 5432)}/{kwargs.get('database')}"
        ),
        
        'sqlserver': lambda: (
            f"mssql+pyodbc://{kwargs.get('username')}:{urllib.parse.quote_plus(kwargs.get('password', ''))}@"
            f"{kwargs.get('host', 'localhost')}:{kwargs.get('port', 1433)}/{kwargs.get('database')}"
            f"?driver=ODBC+Driver+17+for+SQL+Server"
        ),
        
        'oracle': lambda: (
            f"oracle+cx_oracle://{kwargs.get('username')}:{urllib.parse.quote_plus(kwargs.get('password', ''))}@"
            f"{kwargs.get('host', 'localhost')}:{kwargs.get('port', 1521)}/{kwargs.get('database')}"
        )
    }
    
    if db_type not in connection_strings:
        raise ValueError(f"Unsupported database type: {db_type}")
    
    return connection_strings[db_type]()

def create_sample_sqlite_db(filename: str = "sample_data.db"):
    """Create a sample SQLite database for testing."""
    import sqlite3
    
    conn = sqlite3.connect(filename)
    cursor = conn.cursor()
    
    # Create sample tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS measurements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plot_uri TEXT NOT NULL,
            variable_uri TEXT NOT NULL,
            measurement_value REAL NOT NULL,
            measurement_date DATETIME NOT NULL,
            confidence_level REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_location TEXT NOT NULL,
            parameter_type TEXT NOT NULL,
            reading_value REAL NOT NULL,
            recorded_at DATETIME NOT NULL,
            quality_score REAL,
            device_id TEXT
        )
    ''')
    
    # Insert sample data
    measurements_data = [
        ('http://opensilex.dev/plot/001', 'http://opensilex.dev/variable/plant_height', 25.4, '2024-01-15 10:00:00', 0.95),
        ('http://opensilex.dev/plot/002', 'http://opensilex.dev/variable/plant_height', 23.1, '2024-01-15 10:15:00', 0.90),
        ('http://opensilex.dev/plot/003', 'http://opensilex.dev/variable/plant_height', 27.2, '2024-01-15 10:30:00', 0.95),
        ('http://opensilex.dev/plot/001', 'http://opensilex.dev/variable/leaf_count', 12, '2024-01-15 10:00:00', 0.85),
        ('http://opensilex.dev/plot/002', 'http://opensilex.dev/variable/leaf_count', 14, '2024-01-15 10:15:00', 0.90)
    ]
    
    cursor.executemany('''
        INSERT INTO measurements (plot_uri, variable_uri, measurement_value, measurement_date, confidence_level)
        VALUES (?, ?, ?, ?, ?)
    ''', measurements_data)
    
    sensor_data = [
        ('http://opensilex.dev/greenhouse/001', 'http://opensilex.dev/variable/temperature', 23.5, '2024-01-15 10:00:00', 0.95, 'temp_sensor_01'),
        ('http://opensilex.dev/greenhouse/001', 'http://opensilex.dev/variable/humidity', 65.2, '2024-01-15 10:00:00', 0.90, 'humidity_sensor_01'),
        ('http://opensilex.dev/greenhouse/002', 'http://opensilex.dev/variable/temperature', 24.1, '2024-01-15 10:05:00', 0.95, 'temp_sensor_02'),
        ('http://opensilex.dev/greenhouse/002', 'http://opensilex.dev/variable/humidity', 62.8, '2024-01-15 10:05:00', 0.90, 'humidity_sensor_02')
    ]
    
    cursor.executemany('''
        INSERT INTO sensor_readings (sensor_location, parameter_type, reading_value, recorded_at, quality_score, device_id)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', sensor_data)
    
    conn.commit()
    conn.close()
    
    print(f"Created sample SQLite database: {filename}")
    print("Tables created: measurements, sensor_readings")
    return filename

def show_database_info(connection_string: str):
    """Show information about database tables and columns."""
    try:
        engine = create_engine(connection_string)
        
        # Get table names
        inspector = engine.inspect(engine)
        table_names = inspector.get_table_names()
        
        print(f"Database Tables ({len(table_names)} found):")
        print("=" * 50)
        
        for table_name in table_names:
            print(f"\nTable: {table_name}")
            columns = inspector.get_columns(table_name)
            
            for col in columns:
                print(f"  {col['name']}: {col['type']}")
            
            # Show sample data
            sample_query = f"SELECT * FROM {table_name} LIMIT 3"
            try:
                sample_df = pd.read_sql(sample_query, engine)
                if not sample_df.empty:
                    print(f"  Sample data ({len(sample_df)} rows):")
                    for idx, row in sample_df.iterrows():
                        print(f"    Row {idx + 1}: {dict(row)}")
            except Exception as e:
                print(f"  Could not fetch sample data: {e}")
        
        engine.dispose()
        
    except Exception as e:
        print(f"Error connecting to database: {e}")

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="Import database data into OpenSilex")
    parser.add_argument('--db-type', choices=['sqlite', 'mysql', 'postgresql', 'sqlserver', 'oracle'],
                       default='sqlite', help='Database type')
    parser.add_argument('--host', help='Database host')
    parser.add_argument('--port', type=int, help='Database port')
    parser.add_argument('--database', help='Database name')
    parser.add_argument('--username', help='Database username')
    parser.add_argument('--password', help='Database password')
    parser.add_argument('--connection-string', help='Full connection string (overrides other db options)')
    parser.add_argument('--query', help='SQL query to fetch data')
    parser.add_argument('--table', help='Table name (alternative to query)')
    parser.add_argument('--dry-run', action='store_true', help='Validate without importing')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for import')
    parser.add_argument('--create-sample', action='store_true', help='Create sample SQLite database')
    parser.add_argument('--show-tables', action='store_true', help='Show database table information')
    
    args = parser.parse_args()
    
    if args.create_sample:
        create_sample_sqlite_db()
        return
    
    # Build connection string
    if args.connection_string:
        connection_string = args.connection_string
    else:
        db_params = {
            'host': args.host,
            'port': args.port,
            'database': args.database or 'sample_data.db',
            'username': args.username,
            'password': args.password
        }
        connection_string = create_connection_string(args.db_type, **db_params)
    
    print(f"Connection string: {connection_string}")
    
    if args.show_tables:
        show_database_info(connection_string)
        return
    
    # Build query
    if args.query:
        query = args.query
    elif args.table:
        query = f"SELECT * FROM {args.table}"
    else:
        print("Error: Either --query or --table must be specified")
        return 1
    
    try:
        # Connect to OpenSilex
        print("Connecting to OpenSilex...")
        client = connect()
        
        # Define column mappings (examples - modify based on your database schema)
        column_mapping_examples = {
            'measurements': {
                'plot_uri': 'target',
                'variable_uri': 'variable',
                'measurement_value': 'value',
                'measurement_date': 'date',
                'confidence_level': 'confidence'
            },
            'sensor_readings': {
                'sensor_location': 'target',
                'parameter_type': 'variable',
                'reading_value': 'value',
                'recorded_at': 'date',
                'quality_score': 'confidence'
            }
        }
        
        # Determine column mapping based on table name or use default
        if args.table and args.table in column_mapping_examples:
            column_mapping = column_mapping_examples[args.table]
        else:
            # Default mapping - you should customize this
            column_mapping = {
                'target': 'target',
                'variable': 'variable',
                'value': 'value',
                'date': 'date',
                'confidence': 'confidence'
            }
        
        print(f"IMPORTANT: Update the column_mapping in the script to match your database schema!")
        print(f"Current mapping: {column_mapping}")
        
        # Create importer and run
        importer = DatabaseImporter(client)
        summary = importer.import_from_database(
            connection_string,
            query,
            column_mapping,
            date_columns=['date'],
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
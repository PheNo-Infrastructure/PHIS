#!/usr/bin/env python3
"""
File Data Importer for OpenSilex

This script imports entire data files (CSV) into OpenSilex using the native
import_csv_data API endpoint, which handles the complete file import process.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from opensilex_client import connect
from utils.auth_manager import OpenSilexAuthManager
import logging
from typing import Dict, Any, Optional
import argparse
import json

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FileDataImporter:
    """Import entire data files into OpenSilex using the native API."""
    
    def __init__(self, client):
        """
        Initialize the importer.
        
        Args:
            client: Authenticated OpenSilex client
        """
        self.client = client
        self.auth_manager = client.auth_manager if hasattr(client, 'auth_manager') else None
    
    def import_csv_file(self, csv_file_path: str, provenance_uri: str, 
                       experiment_uri: str = None, dry_run: bool = False) -> Dict[str, Any]:
        """
        Import an entire CSV file using OpenSilex's native import API.
        
        Args:
            csv_file_path: Path to the CSV file to import
            provenance_uri: URI of the provenance for this data
            experiment_uri: Optional experiment URI to associate with the data
            dry_run: If True, validate but don't actually import
            
        Returns:
            Import result summary
        """
        logger.info(f"Starting file import: {csv_file_path}")
        logger.info(f"Provenance URI: {provenance_uri}")
        logger.info(f"Experiment URI: {experiment_uri}")
        logger.info(f"Dry run: {dry_run}")
        
        if not os.path.exists(csv_file_path):
            raise FileNotFoundError(f"CSV file not found: {csv_file_path}")
        
        try:
            # Get the API client and auth token
            api_client = self.client.auth_manager.get_authenticated_client()
            auth_token = None
            
            # Extract auth token from client headers
            if hasattr(api_client, 'default_headers') and 'Authorization' in api_client.default_headers:
                auth_token = api_client.default_headers['Authorization']
            elif self.client.auth_manager and self.client.auth_manager.token_data:
                auth_token = f"Bearer {self.client.auth_manager.token_data['token']}"
            else:
                raise Exception("No authentication token found")
            
            # Import from opensilex_swagger_client API
            from opensilex_swagger_client.api.data_api import DataApi
            
            data_api = DataApi(api_client)
            
            if dry_run:
                # Use validation endpoint for dry run
                logger.info("Performing dry run validation...")
                with open(csv_file_path, 'rb') as file:
                    result = data_api.validate_csv(
                        file=file,
                        authorization=auth_token,
                        provenance=provenance_uri,
                        experiment=experiment_uri
                    )
                
                logger.info("Dry run validation completed")
                return {
                    'success': True,
                    'dry_run': True,
                    'validation_result': result.to_dict() if hasattr(result, 'to_dict') else str(result),
                    'file_path': csv_file_path,
                    'provenance_uri': provenance_uri,
                    'experiment_uri': experiment_uri
                }
            else:
                # Perform actual import
                logger.info("Importing CSV file...")
                with open(csv_file_path, 'rb') as file:
                    result = data_api.import_csv_data(
                        file=file,
                        authorization=auth_token,
                        provenance=provenance_uri,
                        experiment=experiment_uri
                    )
                
                logger.info("CSV file import completed")
                return {
                    'success': True,
                    'dry_run': False,
                    'import_result': result.to_dict() if hasattr(result, 'to_dict') else str(result),
                    'file_path': csv_file_path,
                    'provenance_uri': provenance_uri,
                    'experiment_uri': experiment_uri
                }
                
        except Exception as e:
            logger.error(f"File import failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'file_path': csv_file_path,
                'provenance_uri': provenance_uri,
                'experiment_uri': experiment_uri,
                'dry_run': dry_run
            }
    
    def upload_data_file(self, file_path: str, description: Dict[str, Any]) -> Dict[str, Any]:
        """
        Upload a data file (any format) with metadata.
        
        Args:
            file_path: Path to the file to upload
            description: Metadata description including rdf_type, date, target, provenance, etc.
            
        Returns:
            Upload result
        """
        logger.info(f"Uploading data file: {file_path}")
        logger.info(f"Description: {description}")
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        try:
            # Get the API client and auth token
            api_client = self.client.auth_manager.get_authenticated_client()
            auth_token = None
            
            # Extract auth token from client headers
            if hasattr(api_client, 'default_headers') and 'Authorization' in api_client.default_headers:
                auth_token = api_client.default_headers['Authorization']
            elif self.client.auth_manager and self.client.auth_manager.token_data:
                auth_token = f"Bearer {self.client.auth_manager.token_data['token']}"
            else:
                raise Exception("No authentication token found")
            
            # Import from opensilex_swagger_client API
            from opensilex_swagger_client.api.data_api import DataApi
            
            data_api = DataApi(api_client)
            
            # Upload the file
            with open(file_path, 'rb') as file:
                result = data_api.post_data_file(
                    description=json.dumps(description),
                    file=file,
                    authorization=auth_token
                )
            
            logger.info("File upload completed")
            return {
                'success': True,
                'result': result,
                'file_path': file_path,
                'description': description
            }
                
        except Exception as e:
            logger.error(f"File upload failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'file_path': file_path,
                'description': description
            }

def create_sample_provenance_description():
    """Create a sample provenance description for testing."""
    return {
        "rdf_type": "http://www.opensilex.org/vocabulary/oeso#DataFile",
        "date": "2025-07-30T10:00:00+00:00",
        "target": "http://opensilex.dev/id/scientific-object/so-act",
        "provenance": {
            "uri": "http://opensilex.dev/provenance/1598001689415"
        },
        "metadata": {
            "source": "sensor_data",
            "format": "CSV",
            "imported_by": "file_data_importer"
        }
    }

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="Import entire data files into OpenSilex")
    parser.add_argument('file_path', nargs='?', help='Path to file to import')
    
    # CSV import options
    parser.add_argument('--csv-import', action='store_true', help='Import as CSV data using import_csv_data API')
    parser.add_argument('--provenance', help='Provenance URI (required for CSV import)')
    parser.add_argument('--experiment', help='Optional experiment URI for CSV import')
    
    # File upload options
    parser.add_argument('--file-upload', action='store_true', help='Upload as data file using post_data_file API')
    parser.add_argument('--description', help='JSON description for file upload')
    parser.add_argument('--sample-description', action='store_true', help='Use sample description for file upload')
    
    # Common options
    parser.add_argument('--dry-run', action='store_true', help='Validate without importing (CSV only)')
    parser.add_argument('--list-provenances', action='store_true', help='List available provenances')
    
    args = parser.parse_args()
    
    try:
        # Connect to OpenSilex
        print("Connecting to OpenSilex...")
        client = connect()
        
        # Create importer
        importer = FileDataImporter(client)
        
        # List provenances if requested
        if args.list_provenances:
            try:
                from opensilex_swagger_client.api.data_api import DataApi
                api_client = client.auth_manager.get_authenticated_client()
                auth_token = api_client.default_headers.get('Authorization', '')
                data_api = DataApi(api_client)
                
                provenances = data_api.search_provenance(authorization=auth_token)
                print("Available provenances:")
                for prov in provenances:
                    print(f"  URI: {prov.uri}")
                    print(f"  Name: {getattr(prov, 'name', 'N/A')}")
                    print(f"  Description: {getattr(prov, 'description', 'N/A')}")
                    print()
                return 0
            except Exception as e:
                print(f"Failed to list provenances: {e}")
                return 1
        
        # Validate file exists (except for list-provenances)
        if not args.list_provenances and (not args.file_path or not os.path.exists(args.file_path)):
            print(f"Error: File not found: {args.file_path}")
            return 1
        
        # CSV import
        if args.csv_import:
            if not args.provenance:
                print("Error: --provenance is required for CSV import")
                return 1
            
            result = importer.import_csv_file(
                csv_file_path=args.file_path,
                provenance_uri=args.provenance,
                experiment_uri=args.experiment,
                dry_run=args.dry_run
            )
            
            print(f"\nCSV Import Result:")
            print(f"Success: {result['success']}")
            if result['success']:
                if args.dry_run:
                    print("Validation successful!")
                    if 'validation_result' in result:
                        print(f"Validation details: {result['validation_result']}")
                else:
                    print("Import successful!")
                    if 'import_result' in result:
                        print(f"Import details: {result['import_result']}")
            else:
                print(f"Error: {result['error']}")
                return 1
        
        # File upload
        elif args.file_upload:
            description = {}
            
            if args.sample_description:
                description = create_sample_provenance_description()
                print(f"Using sample description: {json.dumps(description, indent=2)}")
            elif args.description:
                try:
                    description = json.loads(args.description)
                except json.JSONDecodeError as e:
                    print(f"Error: Invalid JSON description: {e}")
                    return 1
            else:
                print("Error: --description or --sample-description is required for file upload")
                return 1
            
            result = importer.upload_data_file(
                file_path=args.file_path,
                description=description
            )
            
            print(f"\nFile Upload Result:")
            print(f"Success: {result['success']}")
            if result['success']:
                print("Upload successful!")
                print(f"Result: {result['result']}")
            else:
                print(f"Error: {result['error']}")
                return 1
        
        else:
            print("Error: Must specify either --csv-import or --file-upload")
            return 1
    
    except Exception as e:
        print(f"Import failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
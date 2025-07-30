#!/usr/bin/env python3
"""
DataFiles Explorer for OpenSilex

This script provides access to the datafiles API endpoints to list, search,
and retrieve information about all data files stored in the OpenSilex system.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from opensilex_client import connect
from opensilex_swagger_client.api.data_api import DataApi
import logging
from typing import Dict, List, Any, Optional
import argparse
import json
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DataFilesExplorer:
    """Explore and access data files in OpenSilex."""
    
    def __init__(self, client):
        """
        Initialize the explorer.
        
        Args:
            client: Authenticated OpenSilex client
        """
        self.client = client
        self.api_client = client.auth_manager.get_authenticated_client()
        self.auth_token = None
        
        # Extract auth token from client headers
        if hasattr(self.api_client, 'default_headers') and 'Authorization' in self.api_client.default_headers:
            self.auth_token = self.api_client.default_headers['Authorization']
        elif client.auth_manager and client.auth_manager.token_data:
            self.auth_token = f"Bearer {client.auth_manager.token_data['token']}"
        else:
            raise Exception("No authentication token found")
        
        self.data_api = DataApi(self.api_client)
    
    def search_data_files(self, rdf_type: str = None, start_date: str = None, 
                         end_date: str = None, experiments: List[str] = None,
                         targets: List[str] = None, devices: List[str] = None,
                         provenances: List[str] = None, metadata: str = None,
                         page: int = 0, page_size: int = 20) -> List[Dict[str, Any]]:
        """
        Search for data files using the GET /core/datafiles endpoint.
        
        Args:
            rdf_type: Search by RDF type URI
            start_date: Search by minimal date (YYYY-MM-DDTHH:mm:ssZ)
            end_date: Search by maximal date (YYYY-MM-DDTHH:mm:ssZ)
            experiments: List of experiment URIs
            targets: List of target URIs
            devices: List of device URIs
            provenances: List of provenance URIs
            metadata: Search by metadata
            page: Page number (default 0)
            page_size: Page size (default 20)
            
        Returns:
            List of data file descriptions
        """
        logger.info("Searching data files...")
        
        try:
            result = self.data_api.get_data_file_descriptions_by_search(
                authorization=self.auth_token,
                rdf_type=rdf_type,
                start_date=start_date,
                end_date=end_date,
                experiments=experiments,
                targets=targets,
                devices=devices,
                provenances=provenances,
                metadata=metadata,
                page=page,
                page_size=page_size
            )
            
            # Convert to dictionaries for easier handling
            files = []
            if result:  # Check if result is not None
                for file_dto in result:
                    file_dict = {
                        'uri': getattr(file_dto, 'uri', None),
                        'rdf_type': getattr(file_dto, 'rdf_type', None),
                        'date': getattr(file_dto, 'date', None),
                        'target': getattr(file_dto, 'target', None),
                        'provenance': getattr(file_dto, 'provenance', None),
                        'metadata': getattr(file_dto, 'metadata', None),
                        'path': getattr(file_dto, 'path', None),
                        'filename': getattr(file_dto, 'filename', None)
                    }
                    files.append(file_dict)
            
            logger.info(f"Found {len(files)} data files")
            return files
            
        except Exception as e:
            logger.error(f"Failed to search data files: {e}")
            raise
    
    def get_data_file_description(self, file_uri: str) -> Dict[str, Any]:
        """
        Get detailed description of a specific data file.
        
        Args:
            file_uri: URI of the data file
            
        Returns:
            Data file description
        """
        logger.info(f"Getting data file description: {file_uri}")
        
        try:
            result = self.data_api.get_data_file_description(
                uri=file_uri,
                authorization=self.auth_token
            )
            
            file_dict = {
                'uri': getattr(result, 'uri', None),
                'rdf_type': getattr(result, 'rdf_type', None),
                'date': getattr(result, 'date', None),
                'target': getattr(result, 'target', None),
                'provenance': getattr(result, 'provenance', None),
                'metadata': getattr(result, 'metadata', None),
                'path': getattr(result, 'path', None),
                'filename': getattr(result, 'filename', None)
            }
            
            return file_dict
            
        except Exception as e:
            logger.error(f"Failed to get data file description: {e}")
            raise
    
    def download_data_file(self, file_uri: str, output_path: str = None) -> str:
        """
        Download a data file from OpenSilex.
        
        Args:
            file_uri: URI of the data file to download
            output_path: Local path to save the file (optional)
            
        Returns:
            Path where the file was saved
        """
        logger.info(f"Downloading data file: {file_uri}")
        
        try:
            # Get the actual file content
            result = self.data_api.get_data_file(
                uri=file_uri,
                authorization=self.auth_token
            )
            
            # Determine output filename
            if not output_path:
                # Get file description to extract filename
                description = self.get_data_file_description(file_uri)
                filename = description.get('filename', 'downloaded_file')
                output_path = f"downloaded_{filename}"
            
            # Save the file
            with open(output_path, 'wb') as f:
                f.write(result)
            
            logger.info(f"File downloaded to: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Failed to download data file: {e}")
            raise
    
    def count_data_files(self) -> int:
        """
        Count total number of data files.
        
        Returns:
            Number of data files
        """
        try:
            result = self.data_api.count_datafiles(authorization=self.auth_token)
            logger.info(f"Total data files: {result}")
            return result
        except Exception as e:
            logger.error(f"Failed to count data files: {e}")
            raise
    
    def search_by_targets(self, target_uris: List[str], **kwargs) -> List[Dict[str, Any]]:
        """
        Search data files for a large list of targets using POST endpoint.
        
        Args:
            target_uris: List of target URIs to search for
            **kwargs: Additional search parameters
            
        Returns:
            List of data file descriptions
        """
        logger.info(f"Searching data files by {len(target_uris)} targets...")
        
        try:
            result = self.data_api.get_data_file_descriptions_by_targets(
                authorization=self.auth_token,
                body=target_uris,
                **kwargs
            )
            
            # Convert to dictionaries
            files = []
            for file_dto in result:
                file_dict = {
                    'uri': getattr(file_dto, 'uri', None),
                    'rdf_type': getattr(file_dto, 'rdf_type', None),
                    'date': getattr(file_dto, 'date', None),
                    'target': getattr(file_dto, 'target', None),
                    'provenance': getattr(file_dto, 'provenance', None),
                    'metadata': getattr(file_dto, 'metadata', None),
                    'path': getattr(file_dto, 'path', None),
                    'filename': getattr(file_dto, 'filename', None)
                }
                files.append(file_dict)
            
            logger.info(f"Found {len(files)} data files for targets")
            return files
            
        except Exception as e:
            logger.error(f"Failed to search data files by targets: {e}")
            raise

def print_data_files(files: List[Dict[str, Any]], detailed: bool = False):
    """Print data files in a formatted way."""
    if not files:
        print("No data files found.")
        return
    
    print(f"\nFound {len(files)} data files:")
    print("=" * 80)
    
    for i, file in enumerate(files, 1):
        print(f"\n{i}. Data File:")
        print(f"   URI: {file.get('uri', 'N/A')}")
        print(f"   Type: {file.get('rdf_type', 'N/A')}")
        print(f"   Date: {file.get('date', 'N/A')}")
        print(f"   Target: {file.get('target', 'N/A')}")
        print(f"   Filename: {file.get('filename', 'N/A')}")
        
        if detailed:
            print(f"   Path: {file.get('path', 'N/A')}")
            print(f"   Provenance: {file.get('provenance', 'N/A')}")
            print(f"   Metadata: {file.get('metadata', 'N/A')}")

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="Explore data files in OpenSilex")
    
    parser.add_argument('--list', action='store_true', help='List all data files')
    parser.add_argument('--count', action='store_true', help='Count total data files')
    parser.add_argument('--detailed', action='store_true', help='Show detailed information')
    
    # Search parameters
    parser.add_argument('--rdf-type', help='Filter by RDF type URI')
    parser.add_argument('--start-date', help='Filter by start date (YYYY-MM-DDTHH:mm:ssZ)')
    parser.add_argument('--end-date', help='Filter by end date (YYYY-MM-DDTHH:mm:ssZ)')
    parser.add_argument('--target', help='Filter by target URI')
    parser.add_argument('--experiment', help='Filter by experiment URI')
    parser.add_argument('--provenance', help='Filter by provenance URI')
    parser.add_argument('--metadata', help='Filter by metadata')
    
    # Pagination
    parser.add_argument('--page', type=int, default=0, help='Page number (default: 0)')
    parser.add_argument('--page-size', type=int, default=20, help='Page size (default: 20)')
    
    # File operations
    parser.add_argument('--get-description', help='Get description of specific file URI')
    parser.add_argument('--download', help='Download specific file URI')
    parser.add_argument('--output', help='Output path for downloaded file')
    
    args = parser.parse_args()
    
    try:
        # Connect to OpenSilex
        print("Connecting to OpenSilex...")
        client = connect()
        
        # Create explorer
        explorer = DataFilesExplorer(client)
        
        # Count data files
        if args.count:
            count = explorer.count_data_files()
            print(f"Total data files: {count}")
            return 0
        
        # Get specific file description
        if args.get_description:
            description = explorer.get_data_file_description(args.get_description)
            print(f"\nData File Description:")
            print(json.dumps(description, indent=2, default=str))
            return 0
        
        # Download specific file
        if args.download:
            output_path = explorer.download_data_file(args.download, args.output)
            print(f"File downloaded to: {output_path}")
            return 0
        
        # List/search data files
        if args.list or any([args.rdf_type, args.start_date, args.end_date, 
                           args.target, args.experiment, args.provenance, args.metadata]):
            
            # Prepare search parameters
            targets = [args.target] if args.target else None
            experiments = [args.experiment] if args.experiment else None
            provenances = [args.provenance] if args.provenance else None
            
            files = explorer.search_data_files(
                rdf_type=args.rdf_type,
                start_date=args.start_date,
                end_date=args.end_date,
                experiments=experiments,
                targets=targets,
                provenances=provenances,
                metadata=args.metadata,
                page=args.page,
                page_size=args.page_size
            )
            
            print_data_files(files, detailed=args.detailed)
            return 0
        
        # Default: show help
        parser.print_help()
        return 0
    
    except Exception as e:
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    exit(main())
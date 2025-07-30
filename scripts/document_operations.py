#!/usr/bin/env python3
"""
Document operations: create, update, delete, and download documents.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.auth_manager import quick_auth
from opensilex_swagger_client.api.documents_api import DocumentsApi
from opensilex_swagger_client.rest import ApiException
import argparse
import json

def get_document_metadata(auth_manager, uri):
    """Get document metadata by URI."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Getting metadata for document: {uri}")
        
        document = documents_api.get_document_metadata(
            uri=uri,
            authorization=auth_header
        )
        
        print("\nDocument Metadata:")
        print("-" * 50)
        print(f"URI: {document.uri}")
        print(f"Title: {document.title}")
        print(f"Description: {document.description}")
        print(f"Type: {document.rdf_type}")
        print(f"Date: {document.date}")
        print(f"Authors: {document.authors}")
        print(f"Keywords: {document.keywords}")
        print(f"Language: {getattr(document, 'language', 'N/A')}")
        print(f"Format: {getattr(document, 'format', 'N/A')}")
        print(f"Deprecated: {getattr(document, 'deprecated', 'N/A')}")
        if document.targets:
            print(f"Targets: {', '.join(document.targets) if isinstance(document.targets, list) else document.targets}")
        
        return document
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error getting document metadata: {e}")
        return None

def download_document_file(auth_manager, uri, output_path=None):
    """Download document file by URI."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Downloading document file: {uri}")
        
        # Get the file content
        file_content = documents_api.get_document_file(
            uri=uri,
            authorization=auth_header
        )
        
        # If no output path specified, create one based on URI
        if not output_path:
            # Extract filename from URI or use a default
            filename = uri.split('/')[-1] if '/' in uri else 'document'
            output_path = f"downloaded_{filename}"
        
        # Write file content
        with open(output_path, 'wb') as f:
            f.write(file_content)
        
        print(f"Document downloaded to: {output_path}")
        return output_path
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error downloading document: {e}")
        return None

def create_document(auth_manager, file_path, description_json):
    """Create a new document."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Creating document from file: {file_path}")
        print(f"Description: {description_json}")
        
        # Read file content
        with open(file_path, 'rb') as f:
            file_content = f.read()
        
        # Create document
        result = documents_api.create_document(
            description=description_json,
            file=file_content,
            authorization=auth_header
        )
        
        print(f"Document created successfully. Result: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error creating document: {e}")
        return None

def update_document(auth_manager, description_json):
    """Update document description."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Updating document with description: {description_json}")
        
        result = documents_api.update_document(
            description=description_json,
            authorization=auth_header
        )
        
        print(f"Document updated successfully. Result: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error updating document: {e}")
        return None

def delete_document(auth_manager, uri):
    """Delete a document by URI."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Deleting document: {uri}")
        
        # Confirm deletion
        response = input(f"Are you sure you want to delete document {uri}? (y/N): ")
        if response.lower() != 'y':
            print("Deletion cancelled.")
            return None
        
        result = documents_api.delete_document(
            uri=uri,
            authorization=auth_header
        )
        
        print(f"Document deleted successfully. Result: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error deleting document: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Document operations for OpenSilex')
    subparsers = parser.add_subparsers(dest='operation', help='Available operations')
    
    # Get metadata subcommand
    get_parser = subparsers.add_parser('get', help='Get document metadata')
    get_parser.add_argument('uri', help='Document URI')
    get_parser.add_argument('--export-json', help='Export metadata to JSON file')
    
    # Download subcommand
    download_parser = subparsers.add_parser('download', help='Download document file')
    download_parser.add_argument('uri', help='Document URI')
    download_parser.add_argument('-o', '--output', help='Output file path')
    
    # Create subcommand
    create_parser = subparsers.add_parser('create', help='Create new document')
    create_parser.add_argument('file', help='File to upload')
    create_parser.add_argument('description', help='Document description (JSON string)')
    
    # Update subcommand  
    update_parser = subparsers.add_parser('update', help='Update document description')
    update_parser.add_argument('description', help='Updated document description (JSON string)')
    
    # Delete subcommand
    delete_parser = subparsers.add_parser('delete', help='Delete document')
    delete_parser.add_argument('uri', help='Document URI to delete')
    
    args = parser.parse_args()
    
    if not args.operation:
        parser.print_help()
        sys.exit(1)
    
    try:
        # Authenticate
        auth_manager = quick_auth()
        
        if args.operation == 'get':
            document = get_document_metadata(auth_manager, args.uri)
            
            if document and args.export_json:
                doc_dict = {
                    'uri': document.uri,
                    'title': document.title,
                    'description': document.description,
                    'rdf_type': document.rdf_type,
                    'date': document.date,
                    'authors': document.authors,
                    'keywords': document.keywords,
                    'targets': document.targets,
                    'deprecated': getattr(document, 'deprecated', None),
                    'format': getattr(document, 'format', None),
                    'language': getattr(document, 'language', None)
                }
                
                with open(args.export_json, 'w') as f:
                    json.dump(doc_dict, f, indent=2, default=str)
                print(f"Metadata exported to: {args.export_json}")
        
        elif args.operation == 'download':
            download_document_file(auth_manager, args.uri, args.output)
        
        elif args.operation == 'create':
            if not os.path.exists(args.file):
                print(f"Error: File not found: {args.file}")
                sys.exit(1)
            create_document(auth_manager, args.file, args.description)
        
        elif args.operation == 'update':
            update_document(auth_manager, args.description)
        
        elif args.operation == 'delete':
            delete_document(auth_manager, args.uri)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
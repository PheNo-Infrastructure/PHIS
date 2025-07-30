#!/usr/bin/env python3
"""
Search and list documents using the OpenSilex Documents API.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.auth_manager import quick_auth
from opensilex_swagger_client.api.documents_api import DocumentsApi
from opensilex_swagger_client.rest import ApiException
import argparse
import json

def search_documents(auth_manager, **search_params):
    """Search documents with optional filters."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        # Remove None values from search params
        filtered_params = {k: v for k, v in search_params.items() if v is not None}
        
        print("Searching documents with parameters:", filtered_params)
        
        # Search documents
        documents = documents_api.search_documents(
            authorization=auth_header,
            **filtered_params
        )
        
        print(f"\nFound {len(documents)} documents:")
        print("-" * 80)
        
        for i, doc in enumerate(documents, 1):
            print(f"\n{i}. {doc.title or 'Untitled'}")
            print(f"   URI: {doc.uri}")
            print(f"   Type: {doc.rdf_type}")
            print(f"   Date: {doc.date}")
            print(f"   Description: {doc.description[:100]}..." if doc.description and len(doc.description) > 100 else f"   Description: {doc.description}")
            if doc.authors:
                print(f"   Authors: {doc.authors}")
            if doc.keywords:
                print(f"   Keywords: {doc.keywords}")
            if doc.targets:
                print(f"   Targets: {', '.join(doc.targets) if isinstance(doc.targets, list) else doc.targets}")
        
        return documents
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error searching documents: {e}")
        return None

def count_documents(auth_manager, target=None):
    """Count total documents."""
    try:
        client = auth_manager.get_authenticated_client()
        documents_api = DocumentsApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        count = documents_api.count_documents(
            authorization=auth_header,
            target=target
        )
        
        print(f"Total documents: {count}")
        return count
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error counting documents: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Search documents in OpenSilex')
    parser.add_argument('--title', help='Filter by title (regex pattern)')
    parser.add_argument('--authors', help='Filter by authors (regex pattern)')
    parser.add_argument('--keyword', help='Filter by keyword (regex pattern)') 
    parser.add_argument('--multiple', help='Filter by keyword or title (regex pattern)')
    parser.add_argument('--rdf-type', help='Search by RDF type')
    parser.add_argument('--targets', help='Search by targets')
    parser.add_argument('--date', help='Filter by date (regex pattern)')
    parser.add_argument('--deprecated', help='Include deprecated documents (true/false)')
    parser.add_argument('--page', type=int, default=0, help='Page number (default: 0)')
    parser.add_argument('--page-size', type=int, default=20, help='Page size (default: 20)')
    parser.add_argument('--order-by', action='append', help='Sort by field (can be used multiple times)')
    parser.add_argument('--count-only', action='store_true', help='Only count documents, do not list them')
    parser.add_argument('--export-json', help='Export results to JSON file')
    
    args = parser.parse_args()
    
    try:
        # Authenticate
        auth_manager = quick_auth()
        
        if args.count_only:
            count_documents(auth_manager)
        else:
            # Build search parameters
            search_params = {
                'title': args.title,
                'authors': args.authors,
                'keyword': args.keyword,
                'multiple': args.multiple,
                'rdf_type': args.rdf_type,
                'targets': args.targets,
                '_date': args.date,
                'deprecated': args.deprecated,
                'page': args.page,
                'page_size': args.page_size,
                'order_by': args.order_by
            }
            
            documents = search_documents(auth_manager, **search_params)
            
            if documents and args.export_json:
                # Convert documents to dict for JSON serialization
                docs_data = []
                for doc in documents:
                    doc_dict = {
                        'uri': doc.uri,
                        'title': doc.title,
                        'description': doc.description,
                        'rdf_type': doc.rdf_type,
                        'date': doc.date,
                        'authors': doc.authors,
                        'keywords': doc.keywords,
                        'targets': doc.targets,
                        'deprecated': doc.deprecated if hasattr(doc, 'deprecated') else None,
                        'format': doc.format if hasattr(doc, 'format') else None,
                        'language': doc.language if hasattr(doc, 'language') else None
                    }
                    docs_data.append(doc_dict)
                
                with open(args.export_json, 'w') as f:
                    json.dump(docs_data, f, indent=2, default=str)
                print(f"\nResults exported to: {args.export_json}")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
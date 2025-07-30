#!/usr/bin/env python3
"""
Interactive document explorer for OpenSilex.
Browse, search, and examine documents interactively.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.auth_manager import quick_auth
from opensilex_swagger_client.api.documents_api import DocumentsApi
from opensilex_swagger_client.rest import ApiException
import json
from datetime import datetime

class DocumentExplorer:
    def __init__(self, auth_manager):
        self.auth_manager = auth_manager
        self.client = auth_manager.get_authenticated_client()
        self.documents_api = DocumentsApi(self.client)
        self.auth_header = f"Bearer {auth_manager.token_data['token']}"
        self.current_documents = []
        self.current_page = 0
        self.page_size = 10
    
    def show_menu(self):
        """Display the main menu."""
        print("\n" + "="*60)
        print("                Document Explorer")
        print("="*60)
        print("1. List all documents")
        print("2. Search documents")
        print("3. Get document details")
        print("4. Count documents")
        print("5. Filter by document type")
        print("6. Filter by date range")
        print("7. Export current results")
        print("8. Show statistics")
        print("9. Next page")
        print("10. Previous page")
        print("0. Exit")
        print("-"*60)
    
    def list_documents(self, **filters):
        """List documents with optional filters."""
        try:
            print("\nFetching documents...")
            
            documents = self.documents_api.search_documents(
                authorization=self.auth_header,
                page=self.current_page,
                page_size=self.page_size,
                **filters
            )
            
            self.current_documents = documents
            
            if not documents:
                print("No documents found.")
                return
            
            print(f"\nDocuments (Page {self.current_page + 1}, {len(documents)} results):")
            print("-"*80)
            
            for i, doc in enumerate(documents):
                print(f"\n{i+1}. {doc.title or 'Untitled'}")
                print(f"   URI: {doc.uri}")
                print(f"   Type: {self._format_type(doc.rdf_type)}")
                print(f"   Date: {doc.date or 'N/A'}")
                print(f"   Description: {self._truncate_text(doc.description, 60)}")
                if doc.authors:
                    print(f"   Authors: {doc.authors}")
            
        except ApiException as e:
            print(f"Error fetching documents: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")
    
    def search_documents(self):
        """Interactive document search."""
        print("\n--- Document Search ---")
        print("Enter search criteria (press Enter to skip):")
        
        filters = {}
        
        title = input("Title (regex): ").strip()
        if title:
            filters['title'] = title
        
        authors = input("Authors (regex): ").strip()
        if authors:
            filters['authors'] = authors
        
        keyword = input("Keyword (regex): ").strip()
        if keyword:
            filters['keyword'] = keyword
        
        rdf_type = input("Document type URI: ").strip()
        if rdf_type:
            filters['rdf_type'] = rdf_type
        
        targets = input("Target URI: ").strip()
        if targets:
            filters['targets'] = targets
        
        if not filters:
            print("No search criteria provided.")
            return
        
        self.current_page = 0  # Reset to first page
        self.list_documents(**filters)
    
    def get_document_details(self):
        """Get detailed information about a specific document."""
        if not self.current_documents:
            print("No documents loaded. Please list documents first.")
            return
        
        try:
            choice = input(f"\nEnter document number (1-{len(self.current_documents)}) or URI: ").strip()
            
            if choice.isdigit():
                index = int(choice) - 1
                if 0 <= index < len(self.current_documents):
                    doc_uri = self.current_documents[index].uri
                else:
                    print("Invalid document number.")
                    return
            else:
                doc_uri = choice
            
            print(f"\nFetching details for: {doc_uri}")
            
            document = self.documents_api.get_document_metadata(
                uri=doc_uri,
                authorization=self.auth_header
            )
            
            self._display_document_details(document)
            
        except ApiException as e:
            print(f"Error fetching document details: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")
    
    def count_documents(self):
        """Count total documents."""
        try:
            total = self.documents_api.count_documents(
                authorization=self.auth_header
            )
            print(f"\nTotal documents in system: {total}")
            
        except ApiException as e:
            print(f"Error counting documents: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")
    
    def filter_by_type(self):
        """Filter documents by RDF type."""
        print("\nCommon document types:")
        print("1. Scientific Document: http://www.opensilex.org/vocabulary/oeso#ScientificDocument")
        print("2. Image: http://www.opensilex.org/vocabulary/oeso#Image")
        print("3. Document: http://www.opensilex.org/vocabulary/oeso#Document")
        print("4. Custom type (enter URI)")
        
        choice = input("Select type (1-4): ").strip()
        
        type_mapping = {
            '1': 'http://www.opensilex.org/vocabulary/oeso#ScientificDocument',
            '2': 'http://www.opensilex.org/vocabulary/oeso#Image',
            '3': 'http://www.opensilex.org/vocabulary/oeso#Document'
        }
        
        if choice in type_mapping:
            rdf_type = type_mapping[choice]
        elif choice == '4':
            rdf_type = input("Enter RDF type URI: ").strip()
        else:
            print("Invalid choice.")
            return
        
        if rdf_type:
            self.current_page = 0
            self.list_documents(rdf_type=rdf_type)
    
    def filter_by_date(self):
        """Filter documents by date range."""
        print("\nDate filtering (YYYY-MM-DD format):")
        
        start_date = input("Start date (or press Enter to skip): ").strip()
        end_date = input("End date (or press Enter to skip): ").strip()
        
        # For OpenSilex, we might need to use regex patterns for date filtering
        if start_date or end_date:
            if start_date and end_date:
                date_pattern = f"{start_date}.*{end_date}"
            elif start_date:
                date_pattern = f"{start_date}.*"
            else:
                date_pattern = f".*{end_date}"
            
            self.current_page = 0
            self.list_documents(_date=date_pattern)
    
    def export_results(self):
        """Export current results to JSON."""
        if not self.current_documents:
            print("No documents to export. Please search first.")
            return
        
        filename = input("Export filename (default: documents_export.json): ").strip()
        if not filename:
            filename = "documents_export.json"
        
        try:
            docs_data = []
            for doc in self.current_documents:
                doc_dict = {
                    'uri': doc.uri,
                    'title': doc.title,
                    'description': doc.description,
                    'rdf_type': doc.rdf_type,
                    'date': doc.date,
                    'authors': doc.authors,
                    'keywords': doc.keywords,
                    'targets': doc.targets,
                    'deprecated': getattr(doc, 'deprecated', None),
                    'format': getattr(doc, 'format', None),
                    'language': getattr(doc, 'language', None)
                }
                docs_data.append(doc_dict)
            
            export_data = {
                'export_timestamp': datetime.now().isoformat(),
                'page': self.current_page,
                'page_size': self.page_size,
                'total_results': len(docs_data),
                'documents': docs_data
            }
            
            with open(filename, 'w') as f:
                json.dump(export_data, f, indent=2, default=str)
            
            print(f"Exported {len(docs_data)} documents to: {filename}")
            
        except Exception as e:
            print(f"Error exporting results: {e}")
    
    def show_statistics(self):
        """Show document statistics."""
        if not self.current_documents:
            print("No documents loaded. Please search first.")
            return
        
        print(f"\n--- Statistics for Current Results ---")
        print(f"Total documents shown: {len(self.current_documents)}")
        
        # Count by type
        types = {}
        authors_set = set()
        dates = []
        
        for doc in self.current_documents:
            # Count types
            doc_type = self._format_type(doc.rdf_type)
            types[doc_type] = types.get(doc_type, 0) + 1
            
            # Collect authors
            if doc.authors:
                if isinstance(doc.authors, list):
                    authors_set.update(doc.authors)
                else:
                    authors_set.add(doc.authors)
            
            # Collect dates
            if doc.date:
                dates.append(doc.date)
        
        print(f"\nDocument types:")
        for doc_type, count in sorted(types.items()):
            print(f"  {doc_type}: {count}")
        
        print(f"\nUnique authors: {len(authors_set)}")
        if dates:
            print(f"Date range: {min(dates)} to {max(dates)}")
    
    def next_page(self):
        """Go to next page."""
        self.current_page += 1
        self.list_documents()
    
    def previous_page(self):
        """Go to previous page."""
        if self.current_page > 0:
            self.current_page -= 1
            self.list_documents()
        else:
            print("Already on first page.")
    
    def _display_document_details(self, document):
        """Display detailed document information."""
        print("\n" + "="*60)
        print("                Document Details")
        print("="*60)
        print(f"URI: {document.uri}")
        print(f"Title: {document.title or 'N/A'}")
        print(f"Type: {self._format_type(document.rdf_type)}")
        print(f"Date: {document.date or 'N/A'}")
        print(f"Language: {getattr(document, 'language', 'N/A')}")
        print(f"Format: {getattr(document, 'format', 'N/A')}")
        print(f"Deprecated: {getattr(document, 'deprecated', 'N/A')}")
        
        if document.authors:
            print(f"Authors: {document.authors}")
        
        if document.keywords:
            print(f"Keywords: {document.keywords}")
        
        if document.targets:
            print(f"Targets:")
            if isinstance(document.targets, list):
                for target in document.targets:
                    print(f"  - {target}")
            else:
                print(f"  - {document.targets}")
        
        if document.description:
            print(f"\nDescription:")
            print(f"{document.description}")
        
        print("="*60)
    
    def _format_type(self, rdf_type):
        """Format RDF type for display."""
        if not rdf_type:
            return "Unknown"
        
        # Extract the last part after # or /
        if '#' in rdf_type:
            return rdf_type.split('#')[-1]
        elif '/' in rdf_type:
            return rdf_type.split('/')[-1]
        return rdf_type
    
    def _truncate_text(self, text, max_length):
        """Truncate text to specified length."""
        if not text:
            return "N/A"
        if len(text) <= max_length:
            return text
        return text[:max_length-3] + "..."
    
    def run(self):
        """Run the interactive explorer."""
        print("Welcome to the OpenSilex Document Explorer!")
        print("Connecting to the API...")
        
        try:
            # Test connection
            self.count_documents()
            
            while True:
                self.show_menu()
                choice = input("Select option: ").strip()
                
                if choice == '0':
                    print("Goodbye!")
                    break
                elif choice == '1':
                    self.current_page = 0
                    self.list_documents()
                elif choice == '2':
                    self.search_documents()
                elif choice == '3':
                    self.get_document_details()
                elif choice == '4':
                    self.count_documents()
                elif choice == '5':
                    self.filter_by_type()
                elif choice == '6':
                    self.filter_by_date()
                elif choice == '7':
                    self.export_results()
                elif choice == '8':
                    self.show_statistics()
                elif choice == '9':
                    self.next_page()
                elif choice == '10':
                    self.previous_page()
                else:
                    print("Invalid choice. Please try again.")
        
        except KeyboardInterrupt:
            print("\n\nExiting...")
        except Exception as e:
            print(f"Error: {e}")

def main():
    try:
        # Authenticate
        auth_manager = quick_auth()
        
        # Start explorer
        explorer = DocumentExplorer(auth_manager)
        explorer.run()
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
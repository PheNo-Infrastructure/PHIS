# OpenSilex Documents API Scripts

This directory contains Python scripts for working with the OpenSilex Documents API. These scripts demonstrate how to search, retrieve, create, update, and manage documents through the REST API.

## Prerequisites

1. Make sure you have authenticated access to an OpenSilex instance
2. The `opensilex_python_client` should be installed and configured
3. Update the `utils/auth_manager.py` with your server details if needed

## Scripts Overview

### 1. search_documents.py
Command-line tool for searching and listing documents with extensive filtering options.

**Usage:**
```bash
# List all documents
python scripts/search_documents.py

# Search by title
python scripts/search_documents.py --title "protocol"

# Search by multiple criteria
python scripts/search_documents.py --title "experiment" --authors "Smith" --keyword "phenotyping"

# Filter by document type
python scripts/search_documents.py --rdf-type "http://www.opensilex.org/vocabulary/oeso#ScientificDocument"

# Export results to JSON
python scripts/search_documents.py --title "data" --export-json "search_results.json"

# Count documents only
python scripts/search_documents.py --count-only

# Pagination
python scripts/search_documents.py --page 1 --page-size 50
```

**Available filters:**
- `--title`: Filter by title (regex pattern)
- `--authors`: Filter by authors (regex pattern)
- `--keyword`: Filter by keyword (regex pattern)
- `--multiple`: Filter by keyword or title (regex pattern)
- `--rdf-type`: Search by RDF type
- `--targets`: Search by targets
- `--date`: Filter by date (regex pattern)
- `--deprecated`: Include deprecated documents (true/false)
- `--order-by`: Sort by field (can be used multiple times)
- `--page`: Page number (default: 0)
- `--page-size`: Page size (default: 20)

### 2. document_operations.py
Perform CRUD operations on individual documents.

**Usage:**

#### Get document metadata:
```bash
python scripts/document_operations.py get "http://example.com/document/123"

# Export metadata to JSON
python scripts/document_operations.py get "http://example.com/document/123" --export-json "doc_metadata.json"
```

#### Download document file:
```bash
python scripts/document_operations.py download "http://example.com/document/123"

# Specify output filename
python scripts/document_operations.py download "http://example.com/document/123" -o "my_document.pdf"
```

#### Create new document:
```bash
python scripts/document_operations.py create "path/to/file.pdf" '{"title":"My Document","description":"A test document","rdf_type":"http://www.opensilex.org/vocabulary/oeso#Document"}'
```

#### Update document description:
```bash
python scripts/document_operations.py update '{"uri":"http://example.com/document/123","title":"Updated Title","description":"Updated description"}'
```

#### Delete document:
```bash
python scripts/document_operations.py delete "http://example.com/document/123"
```

### 3. document_explorer.py
Interactive command-line interface for browsing and exploring documents.

**Usage:**
```bash
python scripts/document_explorer.py
```

**Features:**
- Interactive menu-driven interface
- Browse documents with pagination
- Advanced search with multiple filters
- Document type filtering
- Date range filtering
- Export current results to JSON
- Document statistics
- Detailed document view

**Menu Options:**
1. List all documents
2. Search documents (interactive)
3. Get document details
4. Count documents
5. Filter by document type
6. Filter by date range
7. Export current results
8. Show statistics
9. Next page
10. Previous page
0. Exit

## Common Use Cases

### Finding Documents by Type
```bash
# Scientific documents
python scripts/search_documents.py --rdf-type "http://www.opensilex.org/vocabulary/oeso#ScientificDocument"

# Images
python scripts/search_documents.py --rdf-type "http://www.opensilex.org/vocabulary/oeso#Image"
```

### Searching by Content
```bash
# Documents with "protocol" in title
python scripts/search_documents.py --title "protocol"

# Documents by specific author
python scripts/search_documents.py --authors "John.*Smith"

# Documents with specific keywords
python scripts/search_documents.py --keyword "phenotyping"

# Search in title or keywords
python scripts/search_documents.py --multiple "experiment"
```

### Working with Document Metadata
```bash
# Get full metadata for a document
python scripts/document_operations.py get "http://opensilex.dev/document/doc123"

# Export metadata to analyze structure
python scripts/document_operations.py get "http://opensilex.dev/document/doc123" --export-json "metadata.json"
```

### Bulk Operations
```bash
# Export all scientific documents
python scripts/search_documents.py --rdf-type "http://www.opensilex.org/vocabulary/oeso#ScientificDocument" --export-json "scientific_docs.json"

# Get count of documents by author
python scripts/search_documents.py --authors "Smith" --count-only
```

## Data Formats

### Document Metadata Structure
Documents returned by the API typically include:
- `uri`: Unique identifier
- `title`: Document title
- `description`: Document description
- `rdf_type`: RDF type/class
- `date`: Creation/publication date
- `authors`: Document authors
- `keywords`: Associated keywords
- `targets`: Target entities
- `language`: Document language
- `format`: File format
- `deprecated`: Whether deprecated

### Search Parameters
The API supports regex patterns for text-based searches:
- Use `.*` for wildcard matching
- Use `^` and `$` for exact matches
- Use `|` for OR operations
- Use character classes like `[0-9]` for patterns

## Error Handling

All scripts include comprehensive error handling:
- Authentication errors
- API errors (with details)
- File I/O errors
- Network connectivity issues
- Invalid parameters

## Authentication

Scripts use the `utils/auth_manager.py` for authentication:
- Automatically tries to load saved tokens
- Prompts for credentials if needed
- Handles token expiration
- Supports multiple OpenSilex instances

## Tips

1. **Use the interactive explorer** (`document_explorer.py`) to understand the data structure before writing automated scripts
2. **Start with small page sizes** when exploring large document collections
3. **Export results to JSON** for further analysis with other tools
4. **Use regex patterns** effectively for flexible searching
5. **Check document types** available in your OpenSilex instance with the type filter

## Troubleshooting

### Common Issues:
1. **Authentication fails**: Check server URL and credentials
2. **No documents found**: Verify your search criteria and data availability
3. **API errors**: Check the OpenSilex server logs and API documentation
4. **File download fails**: Ensure you have appropriate permissions and the document exists

### Getting Help:
- Run scripts with `-h` or `--help` for detailed usage information
- Check the OpenSilex API documentation
- Use the interactive explorer to understand data structure
- Enable logging in the auth manager for debugging
#!/usr/bin/env python3
"""
Area operations: create, read, update, delete, and search areas.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.auth_manager import quick_auth
from opensilex_swagger_client.api.area_api import AreaApi
from opensilex_swagger_client.models.area_creation_dto import AreaCreationDTO
from opensilex_swagger_client.models.area_update_dto import AreaUpdateDTO
from opensilex_swagger_client.rest import ApiException
import argparse
import json

def create_area(auth_manager, area_data):
    """Create a new area."""
    try:
        client = auth_manager.get_authenticated_client()
        area_api = AreaApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Creating area with data: {area_data}")
        
        # Create AreaCreationDTO object
        area_dto = AreaCreationDTO(
            uri=area_data.get('uri'),
            name=area_data['name'],
            rdf_type=area_data['rdf_type'],
            is_structural_area=area_data['is_structural_area'],
            description=area_data.get('description'),
            geometry=area_data.get('geometry'),
            event=area_data.get('event')
        )
        
        result = area_api.create_area(
            authorization=auth_header,
            body=area_dto
        )
        
        print(f"Area created successfully. URI: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error creating area: {e}")
        return None

def get_area(auth_manager, uri):
    """Get area by URI."""
    try:
        client = auth_manager.get_authenticated_client()
        area_api = AreaApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Getting area: {uri}")
        
        area = area_api.get_by_uri(
            uri=uri,
            authorization=auth_header
        )
        
        print("\nArea Details:")
        print("-" * 50)
        print(f"URI: {area.uri}")
        print(f"Name: {area.name}")
        print(f"Type: {area.rdf_type}")
        print(f"Description: {area.description}")
        print(f"Is Structural: {area.is_structural_area}")
        print(f"Publisher: {area.publisher.email if area.publisher else 'N/A'}")
        print(f"Publication Date: {area.publication_date}")
        print(f"Last Updated: {area.last_updated_date}")
        if area.geometry:
            print(f"Geometry Type: {area.geometry.type if hasattr(area.geometry, 'type') else 'N/A'}")
        if area.event:
            print(f"Event: {area.event.uri if hasattr(area.event, 'uri') else 'N/A'}")
        
        return area
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error getting area: {e}")
        return None

def update_area(auth_manager, area_data):
    """Update an existing area."""
    try:
        client = auth_manager.get_authenticated_client()
        area_api = AreaApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Updating area with data: {area_data}")
        
        # Create AreaUpdateDTO object
        area_dto = AreaUpdateDTO(
            uri=area_data['uri'],  # Required for update
            name=area_data.get('name'),
            rdf_type=area_data.get('rdf_type'),
            is_structural_area=area_data.get('is_structural_area'),
            description=area_data.get('description'),
            geometry=area_data.get('geometry'),
            event=area_data.get('event')
        )
        
        result = area_api.update_area(
            body=area_dto,
            authorization=auth_header
        )
        
        print(f"Area updated successfully. Result: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error updating area: {e}")
        return None

def delete_area(auth_manager, uri):
    """Delete an area by URI."""
    try:
        client = auth_manager.get_authenticated_client()
        area_api = AreaApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Deleting area: {uri}")
        
        # Confirm deletion
        response = input(f"Are you sure you want to delete area {uri}? (y/N): ")
        if response.lower() != 'y':
            print("Deletion cancelled.")
            return None
        
        result = area_api.delete_area(
            uri=uri,
            authorization=auth_header
        )
        
        print(f"Area deleted successfully. Result: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error deleting area: {e}")
        return None

def search_intersects(auth_manager, geometry_geojson, start_date=None, end_date=None):
    """Search for areas that intersect with given geometry."""
    try:
        client = auth_manager.get_authenticated_client()
        area_api = AreaApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Searching areas intersecting with geometry: {geometry_geojson}")
        if start_date:
            print(f"Start date filter: {start_date}")
        if end_date:
            print(f"End date filter: {end_date}")
        
        areas = area_api.search_intersects(
            body=geometry_geojson,
            authorization=auth_header,
            start=start_date,
            end=end_date
        )
        
        print(f"\nFound {len(areas)} intersecting areas:")
        print("-" * 50)
        for i, area in enumerate(areas, 1):
            print(f"{i}. {area.name} ({area.uri})")
            print(f"   Type: {area.rdf_type}")
            print(f"   Structural: {area.is_structural_area}")
            if area.description:
                print(f"   Description: {area.description}")
            print()
        
        return areas
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error searching intersecting areas: {e}")
        return None

def export_geospatial(auth_manager, areas_geometry, export_format='geojson', selected_props=None, page_size=1000):
    """Export areas to geospatial format (shapefile or geojson)."""
    try:
        client = auth_manager.get_authenticated_client()
        area_api = AreaApi(client)
        
        # Get authorization header
        auth_header = f"Bearer {auth_manager.token_data['token']}"
        
        print(f"Exporting areas to {export_format} format")
        if selected_props:
            print(f"Selected properties: {selected_props}")
        
        result = area_api.export_geospatial(
            authorization=auth_header,
            body=areas_geometry,
            format=export_format,
            selected_props=selected_props,
            page_size=page_size
        )
        
        print(f"Export completed. Result: {result}")
        return result
        
    except ApiException as e:
        print(f"API Error: {e}")
        return None
    except Exception as e:
        print(f"Error exporting geospatial data: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Area operations for OpenSilex')
    subparsers = parser.add_subparsers(dest='operation', help='Available operations')
    
    # Create subcommand
    create_parser = subparsers.add_parser('create', help='Create new area')
    create_parser.add_argument('data', help='Area data as JSON string or file path')
    create_parser.add_argument('--file', action='store_true', help='Treat data argument as file path')
    
    # Get subcommand
    get_parser = subparsers.add_parser('get', help='Get area by URI')
    get_parser.add_argument('uri', help='Area URI')
    get_parser.add_argument('--export-json', help='Export area data to JSON file')
    
    # Update subcommand
    update_parser = subparsers.add_parser('update', help='Update existing area')
    update_parser.add_argument('data', help='Area data as JSON string or file path')
    update_parser.add_argument('--file', action='store_true', help='Treat data argument as file path')
    
    # Delete subcommand
    delete_parser = subparsers.add_parser('delete', help='Delete area')
    delete_parser.add_argument('uri', help='Area URI to delete')
    
    # Search intersects subcommand
    search_parser = subparsers.add_parser('search-intersects', help='Search areas by geometry intersection')
    search_parser.add_argument('geometry', help='GeoJSON geometry as string or file path')
    search_parser.add_argument('--file', action='store_true', help='Treat geometry argument as file path')
    search_parser.add_argument('--start-date', help='Start date filter (ISO format)')
    search_parser.add_argument('--end-date', help='End date filter (ISO format)')
    search_parser.add_argument('--export-json', help='Export results to JSON file')
    
    # Export subcommand
    export_parser = subparsers.add_parser('export', help='Export areas to geospatial format')
    export_parser.add_argument('geometry', help='Areas geometry as JSON string or file path')
    export_parser.add_argument('--file', action='store_true', help='Treat geometry argument as file path')
    export_parser.add_argument('--format', choices=['shp', 'geojson'], default='geojson', help='Export format')
    export_parser.add_argument('--props', nargs='*', help='Selected properties to export')
    export_parser.add_argument('--page-size', type=int, default=1000, help='Page size (max 10000)')
    
    args = parser.parse_args()
    
    if not args.operation:
        parser.print_help()
        sys.exit(1)
    
    try:
        # Authenticate
        auth_manager = quick_auth()
        
        if args.operation == 'create':
            # Parse area data
            if args.file and os.path.exists(args.data):
                with open(args.data, 'r') as f:
                    area_data = json.load(f)
            else:
                area_data = json.loads(args.data)
            
            create_area(auth_manager, area_data)
        
        elif args.operation == 'get':
            area = get_area(auth_manager, args.uri)
            
            if area and args.export_json:
                area_dict = {
                    'uri': area.uri,
                    'name': area.name,
                    'rdf_type': area.rdf_type,
                    'description': area.description,
                    'is_structural_area': area.is_structural_area,
                    'publisher': area.publisher.to_dict() if area.publisher else None,
                    'geometry': area.geometry.to_dict() if area.geometry else None,
                    'event': area.event.to_dict() if area.event else None,
                    'publication_date': area.publication_date,
                    'last_updated_date': area.last_updated_date
                }
                
                with open(args.export_json, 'w') as f:
                    json.dump(area_dict, f, indent=2, default=str)
                print(f"Area data exported to: {args.export_json}")
        
        elif args.operation == 'update':
            # Parse area data
            if args.file and os.path.exists(args.data):
                with open(args.data, 'r') as f:
                    area_data = json.load(f)
            else:
                area_data = json.loads(args.data)
            
            update_area(auth_manager, area_data)
        
        elif args.operation == 'delete':
            delete_area(auth_manager, args.uri)
        
        elif args.operation == 'search-intersects':
            # Parse geometry data
            if args.file and os.path.exists(args.geometry):
                with open(args.geometry, 'r') as f:
                    geometry_data = json.load(f)
            else:
                geometry_data = json.loads(args.geometry)
            
            areas = search_intersects(auth_manager, geometry_data, args.start_date, args.end_date)
            
            if areas and args.export_json:
                areas_list = []
                for area in areas:
                    areas_list.append({
                        'uri': area.uri,
                        'name': area.name,
                        'rdf_type': area.rdf_type,
                        'description': area.description,
                        'is_structural_area': area.is_structural_area,
                        'geometry': area.geometry.to_dict() if area.geometry else None,
                        'publication_date': area.publication_date,
                        'last_updated_date': area.last_updated_date
                    })
                
                with open(args.export_json, 'w') as f:
                    json.dump(areas_list, f, indent=2, default=str)
                print(f"Search results exported to: {args.export_json}")
        
        elif args.operation == 'export':
            # Parse geometry data
            if args.file and os.path.exists(args.geometry):
                with open(args.geometry, 'r') as f:
                    geometry_data = json.load(f)
            else:
                geometry_data = json.loads(args.geometry)
            
            export_geospatial(auth_manager, geometry_data, args.format, args.props, args.page_size)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
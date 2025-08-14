#!/usr/bin/env python3
"""
Comprehensive AgroPortal Import - Populate OpenSILEX with AgroPortal ontology terms
This script imports terms for entities, characteristics, methods, and units
"""

import requests
import json
import argparse
import time

def authenticate(server_url, username, password):
    """Authenticate and get token"""
    auth_data = {"identifier": username, "password": password}
    response = requests.post(f"{server_url}/rest/security/authenticate", json=auth_data)
    
    if response.status_code == 200:
        return response.json()['result']['token']
    else:
        print(f"[ERROR] Authentication failed: {response.status_code}")
        return None

def search_and_create_entities(server_url, token):
    """Search AgroPortal and create entities"""
    print("\n=== IMPORTING ENTITIES ===")
    
    entity_search_terms = [
        'plant', 'crop', 'tree', 'seed', 'fruit', 'vegetable', 'cereal', 
        'wheat', 'rice', 'corn', 'tomato', 'potato', 'carrot', 'apple',
        'livestock', 'cattle', 'sheep', 'pig', 'chicken', 'fish',
        'soil', 'water', 'fertilizer', 'organism', 'microorganism'
    ]
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    created_count = 0
    
    for search_term in entity_search_terms:
        print(f"\nSearching for entities: '{search_term}'")
        
        try:
            # Search AgroPortal
            search_response = requests.get(
                f"{server_url}/rest/core/agroportal/search",
                params={"name": search_term, "ontologies": "AGROVOC"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if search_response.status_code == 200:
                terms = search_response.json().get('result', [])
                
                # Create entities from first 3 relevant terms
                for term in terms[:3]:
                    if not term.get('obsolete', False):
                        entity_data = {
                            "uri": term.get('id'),
                            "name": term.get('name', 'Unknown'),
                            "description": f"Entity from AGROVOC: {term.get('definitions', ['Agricultural entity'])[0] if term.get('definitions') else 'Agricultural entity'}"
                        }
                        
                        # Create entity
                        response = requests.post(
                            f"{server_url}/rest/core/entities",
                            json=entity_data,
                            headers=headers
                        )
                        
                        if response.status_code == 201:
                            created_count += 1
                            print(f"  [OK] Created entity: {entity_data['name']}")
                        elif response.status_code == 409:
                            print(f"  [EXISTS] Entity already exists: {entity_data['name']}")
                        else:
                            print(f"  [FAIL] Failed to create entity {entity_data['name']}: {response.status_code}")
                            
        except Exception as e:
            print(f"  [ERROR] Error processing {search_term}: {e}")
        
        time.sleep(0.2)  # Rate limiting
    
    print(f"\n[SUMMARY] Created {created_count} entities")
    return created_count

def search_and_create_characteristics(server_url, token):
    """Search AgroPortal and create characteristics"""
    print("\n=== IMPORTING CHARACTERISTICS ===")
    
    characteristic_search_terms = [
        'height', 'weight', 'length', 'width', 'diameter', 'color', 'shape',
        'quality', 'maturity', 'ripeness', 'hardness', 'texture', 'taste',
        'yield', 'productivity', 'growth rate', 'biomass', 'density',
        'concentration', 'pH', 'moisture', 'temperature', 'humidity',
        'disease resistance', 'pest resistance', 'drought tolerance',
        'nutritional content', 'protein content', 'fat content', 'fiber'
    ]
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    created_count = 0
    
    for search_term in characteristic_search_terms:
        print(f"\nSearching for characteristics: '{search_term}'")
        
        try:
            search_response = requests.get(
                f"{server_url}/rest/core/agroportal/search",
                params={"name": search_term, "ontologies": "AGROVOC"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if search_response.status_code == 200:
                terms = search_response.json().get('result', [])
                
                for term in terms[:3]:
                    if not term.get('obsolete', False):
                        char_data = {
                            "uri": term.get('id'),
                            "name": term.get('name', 'Unknown'),
                            "description": f"Characteristic from AGROVOC: {term.get('definitions', ['Agricultural characteristic'])[0] if term.get('definitions') else 'Agricultural characteristic'}"
                        }
                        
                        response = requests.post(
                            f"{server_url}/rest/core/characteristics",
                            json=char_data,
                            headers=headers
                        )
                        
                        if response.status_code == 201:
                            created_count += 1
                            print(f"  [OK] Created characteristic: {char_data['name']}")
                        elif response.status_code == 409:
                            print(f"  [EXISTS] Characteristic already exists: {char_data['name']}")
                        else:
                            print(f"  [FAIL] Failed to create characteristic {char_data['name']}: {response.status_code}")
                            
        except Exception as e:
            print(f"  [ERROR] Error processing {search_term}: {e}")
        
        time.sleep(0.2)
    
    print(f"\n[SUMMARY] Created {created_count} characteristics")
    return created_count

def search_and_create_methods(server_url, token):
    """Search AgroPortal and create methods"""
    print("\n=== IMPORTING METHODS ===")
    
    method_search_terms = [
        'measurement', 'observation', 'analysis', 'assessment', 'evaluation',
        'visual inspection', 'manual measurement', 'weighing', 'counting',
        'sampling', 'testing', 'monitoring', 'recording', 'survey',
        'microscopy', 'spectroscopy', 'chromatography', 'titration',
        'field measurement', 'laboratory analysis', 'sensory evaluation',
        'image analysis', 'remote sensing', 'GPS measurement'
    ]
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    created_count = 0
    
    for search_term in method_search_terms:
        print(f"\nSearching for methods: '{search_term}'")
        
        try:
            search_response = requests.get(
                f"{server_url}/rest/core/agroportal/search",
                params={"name": search_term, "ontologies": "AGROVOC"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if search_response.status_code == 200:
                terms = search_response.json().get('result', [])
                
                for term in terms[:2]:  # Fewer methods to avoid overwhelming
                    if not term.get('obsolete', False):
                        method_data = {
                            "uri": term.get('id'),
                            "name": term.get('name', 'Unknown'),
                            "description": f"Method from AGROVOC: {term.get('definitions', ['Agricultural method'])[0] if term.get('definitions') else 'Agricultural method'}"
                        }
                        
                        response = requests.post(
                            f"{server_url}/rest/core/methods",
                            json=method_data,
                            headers=headers
                        )
                        
                        if response.status_code == 201:
                            created_count += 1
                            print(f"  [OK] Created method: {method_data['name']}")
                        elif response.status_code == 409:
                            print(f"  [EXISTS] Method already exists: {method_data['name']}")
                        else:
                            print(f"  [FAIL] Failed to create method {method_data['name']}: {response.status_code}")
                            
        except Exception as e:
            print(f"  [ERROR] Error processing {search_term}: {e}")
        
        time.sleep(0.2)
    
    print(f"\n[SUMMARY] Created {created_count} methods")
    return created_count

def search_and_create_units(server_url, token):
    """Search AgroPortal and create units"""
    print("\n=== IMPORTING UNITS ===")
    
    unit_search_terms = [
        'gram', 'kilogram', 'pound', 'meter', 'centimeter', 'inch', 'foot',
        'liter', 'milliliter', 'gallon', 'hectare', 'acre', 'square meter',
        'degree', 'celsius', 'fahrenheit', 'percent', 'percentage',
        'parts per million', 'milligram per liter', 'pH unit',
        'days', 'weeks', 'months', 'years', 'hours', 'minutes',
        'count', 'number', 'pieces', 'items', 'units'
    ]
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    created_count = 0
    
    for search_term in unit_search_terms:
        print(f"\nSearching for units: '{search_term}'")
        
        try:
            search_response = requests.get(
                f"{server_url}/rest/core/agroportal/search",
                params={"name": search_term, "ontologies": "AGROVOC"},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if search_response.status_code == 200:
                terms = search_response.json().get('result', [])
                
                for term in terms[:2]:
                    if not term.get('obsolete', False):
                        unit_data = {
                            "uri": term.get('id'),
                            "name": term.get('name', 'Unknown'),
                            "description": f"Unit from AGROVOC: {term.get('definitions', ['Agricultural unit'])[0] if term.get('definitions') else 'Agricultural unit'}",
                            "symbol": term.get('name', 'Unknown')[:10]  # Use name as symbol, truncated
                        }
                        
                        response = requests.post(
                            f"{server_url}/rest/core/units",
                            json=unit_data,
                            headers=headers
                        )
                        
                        if response.status_code == 201:
                            created_count += 1
                            print(f"  [OK] Created unit: {unit_data['name']}")
                        elif response.status_code == 409:
                            print(f"  [EXISTS] Unit already exists: {unit_data['name']}")
                        else:
                            print(f"  [FAIL] Failed to create unit {unit_data['name']}: {response.status_code}")
                            
        except Exception as e:
            print(f"  [ERROR] Error processing {search_term}: {e}")
        
        time.sleep(0.2)
    
    print(f"\n[SUMMARY] Created {created_count} units")
    return created_count

def main():
    parser = argparse.ArgumentParser(description='Comprehensive AgroPortal ontology import')
    parser.add_argument('--server', default='http://108.143.98.168:8666', help='OpenSILEX server URL')
    parser.add_argument('--username', default='admin@opensilex.org', help='Username')
    parser.add_argument('--password', default='admin', help='Password')
    parser.add_argument('--categories', nargs='+', 
                       choices=['entities', 'characteristics', 'methods', 'units', 'all'],
                       default=['all'], 
                       help='Categories to import (default: all)')
    
    args = parser.parse_args()
    
    print("Comprehensive AgroPortal Ontology Import")
    print("=" * 50)
    
    # Authenticate
    token = authenticate(args.server, args.username, args.password)
    if not token:
        return
    
    print("[OK] Authenticated successfully")
    
    total_created = 0
    
    # Import based on selected categories
    if 'all' in args.categories or 'entities' in args.categories:
        total_created += search_and_create_entities(args.server, token)
    
    if 'all' in args.categories or 'characteristics' in args.categories:
        total_created += search_and_create_characteristics(args.server, token)
    
    if 'all' in args.categories or 'methods' in args.categories:
        total_created += search_and_create_methods(args.server, token)
    
    if 'all' in args.categories or 'units' in args.categories:
        total_created += search_and_create_units(args.server, token)
    
    print(f"\n{'='*50}")
    print(f"[SUCCESS] Import completed!")
    print(f"Total ontology terms created: {total_created}")
    print("Your OpenSILEX instance now has a rich set of agricultural ontology terms!")

if __name__ == "__main__":
    main()
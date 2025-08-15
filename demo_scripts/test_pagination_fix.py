#!/usr/bin/env python3
"""
Test pagination fix
"""

import requests
import json

def test_pagination():
    """Test pagination logic"""
    
    # Authenticate with sandbox
    auth_data = {"identifier": "guest@opensilex.org", "password": "guest"}
    response = requests.post("http://opensilex.org/sandbox/rest/security/authenticate", json=auth_data)
    token = response.json()['result']['token']
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    print("=== Testing Facilities Pagination ===")
    
    all_items = []
    page = 0
    page_size = 20
    seen_uris = set()
    
    while True:
        query_params = {"page": page, "pageSize": page_size}
        print(f"Requesting page {page} with pageSize {page_size}")
        
        response = requests.get(
            "http://opensilex.org/sandbox/rest/core/facilities",
            headers=headers,
            params=query_params
        )
        
        if response.status_code != 200:
            print(f"[ERROR] Failed to fetch page {page}: {response.status_code}")
            break
        
        data = response.json()
        items = data.get('result', [])
        
        if not items:
            print(f"[INFO] No items on page {page}, stopping")
            break
        
        # Check for duplicates
        duplicates = 0
        for item in items:
            uri = item.get('uri', 'unknown')
            if uri in seen_uris:
                duplicates += 1
                print(f"[WARNING] Duplicate URI found: {uri}")
            else:
                seen_uris.add(uri)
                all_items.append(item)
        
        # Check pagination metadata
        metadata = data.get('metadata', {})
        pagination = metadata.get('pagination', {})
        has_next = pagination.get('hasNextPage', False)
        total_count = pagination.get('totalCount', len(all_items))
        current_page = pagination.get('currentPage', page)
        
        print(f"[INFO] Page {page}: {len(items)} items ({duplicates} duplicates), hasNext: {has_next}, totalCount: {total_count}")
        print(f"[INFO] API says currentPage: {current_page}, unique items so far: {len(all_items)}")
        
        if not has_next:
            print(f"[INFO] hasNextPage is False, stopping pagination")
            break
        
        if len(all_items) >= total_count:
            print(f"[INFO] Reached total count {total_count}, stopping")
            break
            
        page += 1
        
        if page > 10:  # Safety break
            print(f"[WARNING] Safety break at page {page}")
            break
    
    print(f"\n=== Results ===")
    print(f"Total unique facilities: {len(all_items)}")
    print(f"Expected facilities: 35")
    print(f"First 3 facilities:")
    for i, facility in enumerate(all_items[:3]):
        print(f"  {i+1}: {facility.get('name', 'unknown')} ({facility.get('uri', 'unknown')})")

if __name__ == "__main__":
    test_pagination()
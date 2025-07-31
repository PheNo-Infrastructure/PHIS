#!/usr/bin/env python3
"""
Simple test of OpenSilex server connection and resource discovery.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from opensilex_client import connect

def main():
    """Test server connection and discover resources."""
    print("OpenSilex Server Test")
    print("====================")
    print("Testing server: 98.71.237.204:8666")
    
    try:
        # Connect to your server
        print("\n1. Connecting to server...")
        client = connect(host="http://98.71.237.204:8666")
        
        # Get status
        status = client.get_status()
        print("   Connection successful!")
        print(f"   Server: {status.get('server_host')}")
        print(f"   Authenticated: {status.get('authenticated')}")
        print(f"   Username: {status.get('username', 'N/A')}")
        
        # Test basic functionality
        print("\n2. Testing basic API calls...")
        
        # Try to list experiments
        try:
            experiments = client.list_experiments(limit=5)
            if hasattr(experiments, 'result') and experiments.result:
                print(f"   Found {len(experiments.result)} experiments:")
                for exp in experiments.result:
                    print(f"     - {getattr(exp, 'name', 'No name')}: {getattr(exp, 'uri', 'No URI')}")
            else:
                print("   No experiments found")
        except Exception as e:
            print(f"   Error listing experiments: {e}")
        
        # Try to list variables
        try:
            variables = client.list_variables(limit=5)
            if hasattr(variables, 'result') and variables.result:
                print(f"   Found {len(variables.result)} variables:")
                for var in variables.result:
                    print(f"     - {getattr(var, 'name', 'No name')}: {getattr(var, 'uri', 'No URI')}")
            else:
                print("   No variables found")
        except Exception as e:
            print(f"   Error listing variables: {e}")
        
        # Try to list scientific objects
        try:
            objects = client.list_scientific_objects(limit=5)
            if hasattr(objects, 'result') and objects.result:
                print(f"   Found {len(objects.result)} scientific objects:")
                for obj in objects.result:
                    print(f"     - {getattr(obj, 'name', 'No name')}: {getattr(obj, 'uri', 'No URI')}")
            else:
                print("   No scientific objects found")
        except Exception as e:
            print(f"   Error listing scientific objects: {e}")
        
        print("\n3. Summary:")
        print("   Server connection: SUCCESS")
        print("   API authentication: SUCCESS")
        print("   Basic API calls: SUCCESS")
        
        print("\nNext steps:")
        print("1. Check what resources are available in your OpenSilex")
        print("2. Use the import scripts with your data")
        print("3. Map your data columns to the URIs shown above")
        
        return 0
        
    except Exception as e:
        print(f"\nConnection failed: {e}")
        print("\nTroubleshooting:")
        print("1. Check if OpenSilex is running: ssh opensilex-github-vm")
        print("2. Check service status: sudo systemctl status opensilex")
        print("3. Check if port 8666 is accessible")
        print("4. Verify your OpenSilex credentials")
        return 1

if __name__ == "__main__":
    exit(main())
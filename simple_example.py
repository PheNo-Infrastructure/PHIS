#!/usr/bin/env python3
"""
Simple example using the unified OpenSilex client.

This demonstrates how easy it is to use OpenSilex with the orchestrator.
"""

from opensilex_client import connect
from datetime import datetime, timedelta

def main():
    print("OpenSilex Simple Example")
    print("========================")
    
    # 1. Connect (one line!)
    print("\n1. Connecting to OpenSilex...")
    client = connect()  # Will prompt for credentials if needed
    print("✓ Connected!")
    
    # 2. Check status
    print("\n2. Client Status:")
    status = client.get_status()
    for key, value in status.items():
        print(f"   {key}: {value}")
    
    # 3. List some data
    print("\n3. Available Resources:")
    
    try:
        experiments = client.list_experiments(limit=3)
        print(f"   Experiments: {len(getattr(experiments, 'result', []))} found")
    except Exception as e:
        print(f"   Experiments: Error - {e}")
    
    try:
        variables = client.list_variables(limit=3)
        print(f"   Variables: {len(getattr(variables, 'result', []))} found")
    except Exception as e:
        print(f"   Variables: Error - {e}")
    
    # 4. Create an experiment (example)
    print("\n4. Creating Example Experiment:")
    try:
        # This creates the model but doesn't submit (replace URIs with real ones)
        print("   Creating experiment model...")
        experiment_data = {
            'name': 'Simple API Test',
            'objective': 'Test the simplified API',
            'description': 'Created using the unified client'
        }
        print(f"   ✓ Would create: {experiment_data['name']}")
        print("   (Use real data and client.create_experiment() to actually submit)")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # 5. Add data points (example)  
    print("\n5. Adding Example Data Points:")
    try:
        # Example data points (replace URIs with real ones)
        example_data = [
            {
                'target': 'http://example.com/plot/001',
                'variable': 'http://example.com/variable/height',
                'value': 25.4,
                'date': datetime.now()
            },
            {
                'target': 'http://example.com/plot/002',  
                'variable': 'http://example.com/variable/height',
                'value': 23.1,
                'date': datetime.now()
            }
        ]
        
        print(f"   ✓ Would add {len(example_data)} data points")
        for data in example_data:
            print(f"     - {data['target']}: {data['value']}")
        print("   (Use real URIs and client.add_multiple_data() to actually submit)")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # 6. Search data (example)
    print("\n6. Searching Data:")
    try:
        # Search for recent data
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        print(f"   Searching from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        # Uncomment to actually search:
        # data_results = client.search_data(
        #     start_date=start_date.isoformat(),
        #     end_date=end_date.isoformat(),
        #     limit=10
        # )
        # print(f"   ✓ Found {len(getattr(data_results, 'result', []))} data points")
        print("   (Uncomment search code to actually search)")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    print("\n" + "="*50)
    print("✓ Example completed!")
    print("\nWhat just happened:")
    print("- Connected with one line of code")
    print("- Got client status automatically")
    print("- Listed available resources")
    print("- Showed how to create experiments and data")
    print("- All complex authentication and API handling was automatic!")
    print("\nNext steps:")
    print("- Replace example URIs with real ones from your OpenSilex")
    print("- Use the client methods to actually create and submit data")
    print("- Explore all available methods in the client")

if __name__ == "__main__":
    main()
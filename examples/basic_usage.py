#!/usr/bin/env python3
"""
Basic usage example of OpenSilex utilities.

This demonstrates the most common operations using the utility classes.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import quick_auth, create_api_wrapper, quick_data_point, quick_experiment
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Demonstrate basic OpenSilex operations."""
    print("OpenSilex Basic Usage Example")
    print("=============================")
    
    try:
        # Step 1: Authentication
        print("\n1. Authentication")
        print("-" * 20)
        
        # This will prompt for credentials if no saved token exists
        auth_manager = quick_auth()
        print(f"✓ Authenticated successfully")
        
        # Show token info
        token_info = auth_manager.get_token_info()
        print(f"  User: {token_info['username']}")
        print(f"  Valid until: {token_info['expires_at']}")
        
        # Step 2: Create API wrapper
        print("\n2. API Wrapper Setup")
        print("-" * 20)
        
        api = create_api_wrapper(auth_manager)
        print("✓ API wrapper created")
        
        # Step 3: Test system info (if available)
        print("\n3. System Information")
        print("-" * 20)
        
        try:
            system_info = api.get_system_info()
            print("✓ System info retrieved")
            if hasattr(system_info, 'result'):
                print(f"  Version: {getattr(system_info.result, 'version', 'N/A')}")
        except Exception as e:
            print(f"⚠ System info not available: {e}")
        
        # Step 4: List experiments
        print("\n4. List Experiments")
        print("-" * 20)
        
        try:
            experiments = api.list_experiments(limit=5)
            print(f"✓ Retrieved experiments")
            if hasattr(experiments, 'result') and experiments.result:
                for i, exp in enumerate(experiments.result[:3]):  # Show first 3
                    print(f"  {i+1}. {getattr(exp, 'name', 'N/A')} ({getattr(exp, 'uri', 'N/A')})")
            else:
                print("  No experiments found or no access")
        except Exception as e:
            print(f"⚠ Could not list experiments: {e}")
        
        # Step 5: List variables
        print("\n5. List Variables")
        print("-" * 20)
        
        try:
            variables = api.list_variables(limit=5)
            print(f"✓ Retrieved variables")
            if hasattr(variables, 'result') and variables.result:
                for i, var in enumerate(variables.result[:3]):  # Show first 3
                    print(f"  {i+1}. {getattr(var, 'name', 'N/A')} ({getattr(var, 'uri', 'N/A')})")
            else:
                print("  No variables found or no access")
        except Exception as e:
            print(f"⚠ Could not list variables: {e}")
        
        # Step 6: Create a data point (example - won't actually submit)
        print("\n6. Create Data Point (Example)")
        print("-" * 20)
        
        try:
            data_point = quick_data_point(
                target="http://example.com/plot/1",
                variable="http://example.com/variable/height", 
                value=25.4,
                date=datetime.now()
            )
            print("✓ Data point model created successfully")
            print(f"  Target: {data_point.target}")
            print(f"  Variable: {data_point.variable}")
            print(f"  Value: {data_point.value}")
            print(f"  Date: {data_point._date}")
            print("  (Note: This is just a model example, not submitted to server)")
        except Exception as e:
            print(f"⚠ Could not create data point: {e}")
        
        # Step 7: Create an experiment (example - won't actually submit)
        print("\n7. Create Experiment (Example)")
        print("-" * 20)
        
        try:
            experiment = quick_experiment(
                name="Example Experiment",
                objective="Demonstrate API usage"
            )
            print("✓ Experiment model created successfully")
            print(f"  Name: {experiment.name}")
            print(f"  Objective: {experiment.objective}")
            print(f"  Start date: {experiment.start_date}")
            print("  (Note: This is just a model example, not submitted to server)")
        except Exception as e:
            print(f"⚠ Could not create experiment: {e}")
        
        print("\n" + "="*50)
        print("✓ Basic usage example completed successfully!")
        print("\nNext steps:")
        print("- Modify the examples above to use real URIs from your system")
        print("- Use api.add_data() to actually submit data points")
        print("- Use api.create_experiment() to create real experiments")
        print("- Explore other API methods in the wrapper")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        logger.exception("Full error details:")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
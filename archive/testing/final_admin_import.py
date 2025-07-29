#!/usr/bin/env python3
"""
Final Admin Import - Import Mock Data to OpenSilex

This script uses the correct swagger client configuration to import mock data.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import opensilex_swagger_client
from opensilex_swagger_client.rest import ApiException
import pandas as pd
import json
from datetime import datetime

def main():
    """Main import function."""
    print("OpenSilex Mock Data Import - Final Attempt")
    print("=" * 55)
    
    host = "http://98.71.237.204:8666"
    
    try:
        # Step 1: Configure client properly
        print("1. Configuring API client...")
        config = opensilex_swagger_client.Configuration()
        config.host = host
        api_client = opensilex_swagger_client.ApiClient(config)
        print(f"   Client configured for: {config.host}")
        
        # Step 2: Authenticate
        print("2. Authenticating...")
        auth_api = opensilex_swagger_client.AuthenticationApi(api_client)
        
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="admin@opensilex.org",
            password="admin"
        )
        
        try:
            response = auth_api.authenticate(body=auth_dto)
            
            if response and hasattr(response, 'result') and hasattr(response.result, 'token'):
                token = response.result.token
                api_client.set_default_header('Authorization', f'Bearer {token}')
                print(f"   Authentication successful! Token length: {len(token)}")
            else:
                print(f"   Authentication failed: No token in response")
                print(f"   Response type: {type(response)}")
                if hasattr(response, 'result'):
                    print(f"   Result type: {type(response.result)}")
                return 1
                
        except ApiException as e:
            print(f"   API Exception during authentication:")
            print(f"   Status: {e.status}")
            print(f"   Reason: {e.reason}")
            print(f"   Body: {e.body}")
            return 1
        
        # Step 3: Load data
        print("3. Loading mock data...")
        try:
            df = pd.read_csv("website_population_measurements.csv")
            print(f"   Loaded {len(df)} measurements")
            
            # Test with just first 5 measurements
            test_df = df.head(5)
            print(f"   Testing with {len(test_df)} sample measurements")
            
        except FileNotFoundError:
            print("   Error: website_population_measurements.csv not found")
            return 1
        
        # Step 4: Test data API
        print("4. Testing data API...")
        try:
            data_api = opensilex_swagger_client.DataApi(api_client)
            print("   Data API created successfully")
            
            # Try to get existing data (just to test the endpoint)
            try:
                existing_data = data_api.search_data_list(page=0, page_size=1)
                print("   Data API endpoint accessible")
            except ApiException as e:
                if e.status in [200, 401, 403]:
                    print("   Data API endpoint exists")
                else:
                    print(f"   Data API test: {e.status} - {e.reason}")
            
        except Exception as e:
            print(f"   Data API creation error: {e}")
            return 1
        
        # Step 5: Attempt import
        print("5. Attempting data import...")
        
        successful_imports = 0
        failed_imports = 0
        errors = []
        
        for index, row in test_df.iterrows():
            try:
                # Format the date properly
                date_str = row['date']
                if not date_str.endswith('Z') and '+' not in date_str:
                    dt = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                    date_str = dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')
                
                # Create data point
                data_point = opensilex_swagger_client.DataCreationDTO(
                    target=row['target_uri'],
                    variable=row['variable_uri'],
                    value=float(row['value']),
                    date=date_str,
                    confidence=float(row['confidence']) if pd.notna(row['confidence']) else None
                )
                
                # Import single data point
                response = data_api.create_data_list(body=[data_point])
                
                print(f"   Measurement {index + 1}: SUCCESS")
                successful_imports += 1
                
            except ApiException as e:
                print(f"   Measurement {index + 1}: FAILED - {e.status} {e.reason}")
                failed_imports += 1
                errors.append(f"Measurement {index + 1}: {e.reason}")
                
                # Stop on authentication errors
                if e.status in [401, 403]:
                    print("   Authentication error - stopping")
                    break
                    
            except Exception as e:
                print(f"   Measurement {index + 1}: ERROR - {e}")
                failed_imports += 1
                errors.append(f"Measurement {index + 1}: {e}")
        
        # Step 6: Results
        print(f"6. Import Results")
        print(f"   Total attempted: {successful_imports + failed_imports}")
        print(f"   Successful: {successful_imports}")
        print(f"   Failed: {failed_imports}")
        print(f"   Success rate: {(successful_imports/(successful_imports + failed_imports)*100):.1f}%" if (successful_imports + failed_imports) > 0 else "0%")
        
        # Save report
        report = {
            "timestamp": datetime.now().isoformat(),
            "server": host,
            "authentication": "successful",
            "attempted": successful_imports + failed_imports,
            "successful": successful_imports,
            "failed": failed_imports,
            "errors": errors[:5]  # First 5 errors
        }
        
        with open("final_import_report.json", 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\nFINAL RESULTS:")
        print("=" * 30)
        
        if successful_imports > 0:
            print(f"SUCCESS! {successful_imports} measurements imported")
            print(f"Your OpenSilex website now has sample data!")
            print(f"Visit: {host}")
            print(f"")
            print(f"To import the full dataset ({len(df)} measurements):")
            print(f"1. Use the working authentication method above")
            print(f"2. Process in batches to import all data")
            print(f"3. Or use the web interface to upload the CSV")
            return 0
        else:
            print("Import failed - no data was imported")
            if errors:
                print(f"Primary error: {errors[0]}")
            print(f"Try using the web interface at: {host}")
            return 1
    
    except Exception as e:
        print(f"Fatal error: {e}")
        return 1

if __name__ == "__main__":
    exit(main())
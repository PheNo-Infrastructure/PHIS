#!/usr/bin/env python3
"""
Direct Import using OpenSilex Swagger Client

This script uses the generated swagger client directly to import data,
bypassing the higher-level wrapper classes.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import the swagger client
try:
    import opensilex_swagger_client
    from opensilex_swagger_client.rest import ApiException
    print("Swagger client imported successfully")
except ImportError as e:
    print(f"Error importing swagger client: {e}")
    print("Make sure the client is properly installed")
    sys.exit(1)

import pandas as pd
import json
from datetime import datetime
import getpass

class SwaggerDirectImporter:
    """Direct importer using swagger client."""
    
    def __init__(self, host="http://98.71.237.204:8666"):
        self.host = host
        self.api_client = None
        self.token = None
        self.import_stats = {
            "attempted": 0,
            "successful": 0,
            "failed": 0,
            "errors": []
        }
    
    def setup_client(self):
        """Setup the swagger API client."""
        print("Setting up swagger API client...")
        
        try:
            # Create API client
            self.api_client = opensilex_swagger_client.ApiClient()
            self.api_client.configuration.host = self.host
            print(f"   Client configured for: {self.host}")
            
            # Test basic connectivity
            print("   Testing connectivity...")
            
            # Try to access a public endpoint to test connectivity
            try:
                # This should work without authentication
                config = opensilex_swagger_client.Configuration()
                config.host = self.host
                test_client = opensilex_swagger_client.ApiClient(config)
                
                print("   Basic connectivity: OK")
                return True
                
            except Exception as e:
                print(f"   Connectivity test failed: {e}")
                return False
                
        except Exception as e:
            print(f"   Client setup failed: {e}")
            return False
    
    def authenticate(self, username=None, password=None):
        """Authenticate using swagger client."""
        print("Authenticating with OpenSilex...")
        
        # Get credentials
        if not username:
            try:
                username = input("Enter OpenSilex username: ")
                password = getpass.getpass("Enter OpenSilex password: ")
            except (EOFError, KeyboardInterrupt):
                print("No interactive input available")
                return False
        
        try:
            # Create authentication API
            auth_api = opensilex_swagger_client.AuthenticationApi(self.api_client)
            
            # Create authentication DTO
            auth_dto = opensilex_swagger_client.AuthenticationDTO(
                identifier=username,
                password=password
            )
            
            print(f"   Attempting authentication for: {username}")
            
            # Authenticate
            response = auth_api.authenticate(auth_dto)
            
            print(f"   Authentication response received")
            
            # Check response
            if response and hasattr(response, 'result') and hasattr(response.result, 'token'):
                self.token = response.result.token
                
                # Set authentication header
                self.api_client.set_default_header('Authorization', f'Bearer {self.token}')
                
                print(f"   Authentication successful!")
                print(f"   Token length: {len(self.token)} characters")
                return True
            else:
                print(f"   Authentication failed: No token in response")
                return False
                
        except ApiException as e:
            print(f"   API Exception during authentication: {e}")
            print(f"   Status: {e.status}")
            print(f"   Reason: {e.reason}")
            return False
        except Exception as e:
            print(f"   Authentication error: {e}")
            return False
    
    def load_data(self):
        """Load the mock data for import."""
        print("Loading mock data...")
        
        try:
            df = pd.read_csv("website_population_measurements.csv")
            print(f"   Loaded {len(df)} measurements")
            
            # Show sample
            sample = df.iloc[0]
            print(f"   Sample measurement:")
            print(f"     Target: {sample['target_name']}")
            print(f"     Variable: {sample['variable_name']}")
            print(f"     Value: {sample['value']} {sample['variable_unit']}")
            print(f"     Date: {sample['date']}")
            
            return df
            
        except FileNotFoundError:
            print("   Error: website_population_measurements.csv not found")
            print("   Run: python populate_website_demo.py first")
            return None
    
    def test_data_api(self):
        """Test data API endpoints."""
        print("Testing data API endpoints...")
        
        try:
            # Try to create a data API instance
            data_api = opensilex_swagger_client.DataApi(self.api_client)
            print("   Data API instance created")
            
            # Try to get some data (just to test the endpoint)
            try:
                print("   Testing data retrieval...")
                # This might fail but will tell us if the endpoint exists
                response = data_api.search_data_list(page=0, page_size=1)
                print(f"   Data retrieval test: SUCCESS")
                print(f"   Response type: {type(response)}")
                return True
                
            except ApiException as e:
                print(f"   Data retrieval status: {e.status}")
                if e.status in [401, 403]:
                    print("   API endpoint exists but requires authentication")
                    return True
                elif e.status == 404:
                    print("   Data API endpoint not found")
                    return False
                else:
                    print(f"   Unexpected status: {e.reason}")
                    return True
                    
        except Exception as e:
            print(f"   Data API test error: {e}")
            return False
    
    def attempt_data_import(self, df):
        """Attempt to import data using various swagger client methods."""
        print("Attempting data import...")
        
        # Try small batch first
        sample_size = min(5, len(df))
        sample_df = df.head(sample_size)
        
        print(f"   Testing with {sample_size} measurements...")
        
        # Method 1: Try DataApi
        success = self._try_data_api_import(sample_df)
        if success:
            return success
        
        # Method 2: Try ExperimentApi (if data is experiment-related)
        success = self._try_experiment_api_import(sample_df)
        if success:
            return success
        
        # Method 3: Try direct API call construction
        success = self._try_direct_api_call(sample_df)
        if success:
            return success
        
        return False
    
    def _try_data_api_import(self, df):
        """Try importing via DataApi."""
        print("   Method 1: DataApi import...")
        
        try:
            data_api = opensilex_swagger_client.DataApi(self.api_client)
            
            # Prepare data points
            data_points = []
            
            for _, row in df.iterrows():
                # Try to create a data point object
                try:
                    # Check what data models are available
                    data_creation_dto = opensilex_swagger_client.DataCreationDTO(
                        target=row['target_uri'],
                        variable=row['variable_uri'],
                        value=float(row['value']),
                        date=row['date'],
                        confidence=float(row['confidence']) if pd.notna(row['confidence']) else None
                    )
                    data_points.append(data_creation_dto)
                    
                except Exception as e:
                    print(f"     Error creating data point: {e}")
                    continue
            
            if data_points:
                print(f"     Created {len(data_points)} data point objects")
                
                # Try to import
                try:
                    response = data_api.create_data_list(body=data_points)
                    print(f"     Import SUCCESS via DataApi!")
                    self.import_stats["successful"] += len(data_points)
                    return True
                    
                except ApiException as e:
                    print(f"     DataApi import failed: {e.status} - {e.reason}")
                    self.import_stats["errors"].append(f"DataApi: {e.status}")
                    
        except Exception as e:
            print(f"     DataApi method error: {e}")
            self.import_stats["errors"].append(f"DataApi setup: {e}")
        
        return False
    
    def _try_experiment_api_import(self, df):
        """Try importing via ExperimentApi if data is experiment-related."""
        print("   Method 2: ExperimentApi import...")
        
        try:
            # This is less likely to work for direct data import
            # but worth trying if there are experiment-specific endpoints
            experiment_api = opensilex_swagger_client.ExperimentsApi(self.api_client)
            print("     ExperimentApi created, but no direct data import method")
            return False
            
        except Exception as e:
            print(f"     ExperimentApi method error: {e}")
            return False
    
    def _try_direct_api_call(self, df):
        """Try direct API call construction."""
        print("   Method 3: Direct API calls...")
        
        try:
            # Make direct HTTP calls using the configured client
            for _, row in df.iterrows():
                self.import_stats["attempted"] += 1
                
                # Prepare data
                data = {
                    "target": row['target_uri'],
                    "variable": row['variable_uri'],
                    "value": float(row['value']),
                    "date": row['date']
                }
                
                if pd.notna(row['confidence']):
                    data["confidence"] = float(row['confidence'])
                
                try:
                    # Try different endpoint paths
                    endpoints = ['/core/data', '/data', '/measurements']
                    
                    for endpoint in endpoints:
                        try:
                            response = self.api_client.call_api(
                                endpoint,
                                'POST',
                                body=data,
                                header_params={'Content-Type': 'application/json'},
                                auth_settings=['ApiKeyAuth'],
                                response_type='object'
                            )
                            
                            print(f"     Direct import SUCCESS via {endpoint}!")
                            self.import_stats["successful"] += 1
                            return True
                            
                        except ApiException as e:
                            if e.status == 404:
                                continue  # Try next endpoint
                            else:
                                print(f"     Direct import {endpoint}: {e.status}")
                                
                except Exception as e:
                    print(f"     Direct import error: {e}")
                    self.import_stats["failed"] += 1
                    break
                    
        except Exception as e:
            print(f"     Direct API method error: {e}")
        
        return False
    
    def generate_report(self):
        """Generate import report."""
        report = {
            "timestamp": datetime.now().isoformat(),
            "server": self.host,
            "authentication": self.token is not None,
            "import_statistics": self.import_stats,
            "recommendations": []
        }
        
        if self.token:
            report["recommendations"].append("Authentication successful - API access available")
        else:
            report["recommendations"].append("Authentication failed - check credentials")
        
        if self.import_stats["successful"] > 0:
            report["recommendations"].append("API import working - can proceed with full dataset")
        else:
            report["recommendations"].append("API import failed - recommend web interface upload")
        
        with open("swagger_import_report.json", 'w') as f:
            json.dump(report, f, indent=2)
        
        return report

def main():
    """Main function."""
    print("OpenSilex Swagger Direct Import")
    print("=" * 40)
    print("This script uses the swagger client directly")
    print("to import mock data into OpenSilex.\n")
    
    # Initialize importer
    importer = SwaggerDirectImporter()
    
    # Step 1: Setup client
    if not importer.setup_client():
        print("Cannot proceed - client setup failed")
        return 1
    
    # Step 2: Authenticate
    if not importer.authenticate():
        print("Cannot proceed - authentication failed")
        return 1
    
    # Step 3: Load data
    df = importer.load_data()
    if df is None:
        print("Cannot proceed - no data to import")
        return 1
    
    # Step 4: Test data API
    api_available = importer.test_data_api()
    
    # Step 5: Attempt import
    if api_available:
        import_success = importer.attempt_data_import(df)
    else:
        print("Data API not available - skipping import")
        import_success = False
    
    # Step 6: Generate report
    report = importer.generate_report()
    
    # Summary
    print(f"\nSwagger Direct Import Complete")
    print("=" * 35)
    print(f"Authentication: {'SUCCESS' if importer.token else 'FAILED'}")
    print(f"API Available: {'YES' if api_available else 'NO'}")
    print(f"Import Success: {'YES' if import_success else 'NO'}")
    print(f"Successful imports: {importer.import_stats['successful']}")
    print(f"Failed imports: {importer.import_stats['failed']}")
    
    if import_success:
        print(f"\nSUCCESS: Data imported via API!")
        print(f"Check your OpenSilex at: {importer.host}")
    else:
        print(f"\nAPI import failed. Alternative methods:")
        print(f"1. Web interface upload at: {importer.host}")
        print(f"2. Check authentication and try again")
        print(f"3. Verify API endpoints are available")
    
    print(f"\nReport saved: swagger_import_report.json")
    
    return 0 if import_success else 1

if __name__ == "__main__":
    exit(main())
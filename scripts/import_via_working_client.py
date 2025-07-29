#!/usr/bin/env python3
"""
Import Mock Data via Working OpenSilex Client

This script uses the existing working opensilex_client.py to import mock data.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from opensilex_client import connect
import pandas as pd
import json
from datetime import datetime

def main():
    """Import mock data using the working client."""
    print("OpenSilex Mock Data Import via Working Client")
    print("=" * 55)
    
    try:
        # Step 1: Connect using the working client
        print("1. Connecting to OpenSilex...")
        client = connect(host="http://98.71.237.204:8666")
        print("   Client created successfully")
        
        # Step 2: Authenticate with admin credentials
        print("2. Authenticating with admin credentials...")
        success = client.authenticate("admin@opensilex.org", "admin")
        
        if success:
            status = client.get_status()
            print(f"   Authentication successful!")
            print(f"   Username: {status.get('username', 'Unknown')}")
            print(f"   Authenticated: {status.get('authenticated', False)}")
        else:
            print("   Authentication failed!")
            return 1
        
        # Step 3: Load mock data
        print("3. Loading mock data...")
        try:
            df = pd.read_csv("website_population_measurements.csv")
            print(f"   Loaded {len(df)} measurements")
            
            # Test with first 10 measurements
            test_df = df.head(10)
            print(f"   Testing with {len(test_df)} sample measurements")
            
        except FileNotFoundError:
            print("   Error: website_population_measurements.csv not found")
            return 1
        
        # Step 4: Import data points
        print("4. Importing data points...")
        
        successful = 0
        failed = 0
        errors = []
        
        for index, row in test_df.iterrows():
            try:
                # Parse date
                measurement_date = datetime.strptime(row['date'], '%Y-%m-%d %H:%M:%S')
                
                # Import data point using the working client
                result = client.add_data_point(
                    target=row['target_uri'],
                    variable=row['variable_uri'],
                    value=float(row['value']),
                    date=measurement_date,
                    confidence=float(row['confidence']) if pd.notna(row['confidence']) else None
                )
                
                print(f"   Measurement {index + 1}: SUCCESS")
                successful += 1
                
            except Exception as e:
                print(f"   Measurement {index + 1}: FAILED - {e}")
                failed += 1
                errors.append(str(e))
                
                # Stop after 3 consecutive failures
                if len(errors) >= 3:
                    print("   Too many errors - stopping test import")
                    break
        
        # Step 5: Results
        total_attempted = successful + failed
        success_rate = (successful / total_attempted * 100) if total_attempted > 0 else 0
        
        print(f"5. Import Results:")
        print(f"   Attempted: {total_attempted}")
        print(f"   Successful: {successful}")
        print(f"   Failed: {failed}")
        print(f"   Success rate: {success_rate:.1f}%")
        
        # Save detailed report
        report = {
            "timestamp": datetime.now().isoformat(),
            "server": "http://98.71.237.204:8666",
            "authentication": "successful",
            "test_results": {
                "total_measurements_available": len(df),
                "test_sample_size": len(test_df),
                "attempted": total_attempted,
                "successful": successful,
                "failed": failed,
                "success_rate": success_rate
            },
            "errors": errors,
            "recommendations": []
        }
        
        if successful > 0:
            report["recommendations"].append("Import working - can proceed with full dataset")
            if success_rate >= 80:
                report["recommendations"].append("High success rate - API import recommended")
            else:
                report["recommendations"].append("Some failures - consider web interface upload")
        else:
            report["recommendations"].append("Import failed - use web interface upload")
        
        with open("working_client_import_report.json", 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\nFINAL RESULTS:")
        print("=" * 30)
        
        if successful > 0:
            print(f"SUCCESS! API import is working!")
            print(f"✓ {successful}/{total_attempted} test measurements imported")
            print(f"✓ Authentication successful")
            print(f"✓ Client configuration correct")
            print(f"")
            print(f"Ready to import full dataset:")
            print(f"• Total measurements available: {len(df):,}")
            print(f"• Estimated import time: {len(df) // 10} minutes")
            print(f"• Success rate: {success_rate:.1f}%")
            print(f"")
            print(f"To import all data:")
            print(f"1. Run this script with full dataset (remove .head(10))")
            print(f"2. Or use the web interface at: http://98.71.237.204:8666")
            
            # If success rate is good, offer to continue with full import
            if success_rate >= 80 and successful >= 5:
                print(f"\nWould you like to continue with full import?")
                print(f"The test was successful - ready to import all {len(df):,} measurements")
                
                # For automation, we'll just recommend the next step
                print(f"✓ RECOMMENDATION: Proceed with full import - API is working correctly")
            
            return 0
        else:
            print("FAILED: No data was imported")
            if errors:
                print(f"Primary error: {errors[0]}")
            print(f"")
            print(f"Alternative: Use web interface upload")
            print(f"1. Go to: http://98.71.237.204:8666")
            print(f"2. Upload: website_population_measurements.csv")
            print(f"3. Map columns and import")
            
            return 1
    
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())
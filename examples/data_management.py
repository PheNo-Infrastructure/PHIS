#!/usr/bin/env python3
"""
Data management example using OpenSilex utilities.

This demonstrates how to work with data: searching, adding, and managing data points.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import quick_auth, create_api_wrapper, quick_data_point, ModelFactory
from datetime import datetime, timedelta
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Demonstrate data management operations."""
    print("OpenSilex Data Management Example")
    print("=================================")
    
    try:
        # Authentication
        print("\n1. Authentication")
        print("-" * 20)
        auth_manager = quick_auth()
        api = create_api_wrapper(auth_manager)
        print("✓ Authenticated and API ready")
        
        # Search for existing data
        print("\n2. Search Existing Data")
        print("-" * 20)
        
        try:
            # Search data from the last 30 days
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)
            
            data_results = api.search_data(
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                limit=10
            )
            
            print("✓ Data search completed")
            if hasattr(data_results, 'result') and data_results.result:
                print(f"  Found {len(data_results.result)} data points")
                for i, data in enumerate(data_results.result[:3]):  # Show first 3
                    print(f"  {i+1}. Target: {getattr(data, 'target', 'N/A')}")
                    print(f"     Value: {getattr(data, 'value', 'N/A')}")
                    print(f"     Date: {getattr(data, 'date', 'N/A')}")
            else:
                print("  No data found in the specified period")
                
        except Exception as e:
            print(f"⚠ Data search failed: {e}")
        
        # Create individual data points
        print("\n3. Create Individual Data Points")
        print("-" * 20)
        
        try:
            # Example data points (using example URIs - replace with real ones)
            example_data_points = [
                {
                    'target': 'http://example.com/plot/001',
                    'variable': 'http://example.com/variable/plant_height',
                    'value': 45.2,
                    'date': datetime.now() - timedelta(days=1)
                },
                {
                    'target': 'http://example.com/plot/002', 
                    'variable': 'http://example.com/variable/plant_height',
                    'value': 42.8,
                    'date': datetime.now() - timedelta(days=1)
                },
                {
                    'target': 'http://example.com/plot/001',
                    'variable': 'http://example.com/variable/leaf_count',
                    'value': 12,
                    'date': datetime.now()
                }
            ]
            
            # Create data point models
            data_models = []
            for data_info in example_data_points:
                data_point = quick_data_point(
                    target=data_info['target'],
                    variable=data_info['variable'],
                    value=data_info['value'],
                    date=data_info['date']
                )
                data_models.append(data_point)
                print(f"✓ Created data point: {data_info['target']} = {data_info['value']}")
            
            print(f"✓ Created {len(data_models)} data point models")
            
            # Note: To actually submit these, you would use:
            # result = api.add_multiple_data(example_data_points)
            print("  (Models created but not submitted - use api.add_multiple_data() to submit)")
            
        except Exception as e:
            print(f"⚠ Data point creation failed: {e}")
        
        # Advanced data creation with validation
        print("\n4. Advanced Data Creation with Validation")
        print("-" * 20)
        
        try:
            factory = ModelFactory(validate=True)
            
            # Create data point with confidence
            advanced_data = factory.create_data_point(
                target="http://example.com/sensor/temp001",
                variable="http://example.com/variable/temperature",
                value=23.5,
                confidence=0.95,
                date=datetime.now()
            )
            
            print("✓ Advanced data point created with confidence")
            print(f"  Target: {advanced_data.target}")
            print(f"  Value: {advanced_data.value}")
            print(f"  Confidence: {advanced_data.confidence}")
            
        except Exception as e:
            print(f"⚠ Advanced data creation failed: {e}")
        
        # Bulk data operations
        print("\n5. Bulk Data Operations")
        print("-" * 20)
        
        try:
            # Generate multiple data points for a time series
            time_series_data = []
            base_time = datetime.now() - timedelta(hours=24)
            
            for hour in range(0, 24, 2):  # Every 2 hours for 24 hours
                data_time = base_time + timedelta(hours=hour)
                # Simulate temperature data with some variation
                temp_value = 20 + (hour / 2) + (hour % 4) * 0.5
                
                time_series_data.append({
                    'target': 'http://example.com/greenhouse/001',
                    'variable': 'http://example.com/variable/air_temperature',
                    'value': round(temp_value, 1),
                    'date': data_time,
                    'confidence': 0.9
                })
            
            print(f"✓ Generated {len(time_series_data)} time series data points")
            print(f"  Time range: {time_series_data[0]['date']} to {time_series_data[-1]['date']}")
            print(f"  Value range: {min(d['value'] for d in time_series_data)} to {max(d['value'] for d in time_series_data)}")
            
            # To submit bulk data, you would use:
            # result = api.add_multiple_data(time_series_data)
            print("  (Data generated but not submitted - use api.add_multiple_data() to submit)")
            
        except Exception as e:
            print(f"⚠ Bulk data generation failed: {e}")
        
        # Data validation examples
        print("\n6. Data Validation Examples")
        print("-" * 20)
        
        try:
            from utils.model_helpers import ValidationHelpers
            validator = ValidationHelpers()
            
            # Test various validations
            print("Testing data validation:")
            
            # Valid cases
            validator.validate_uri("http://example.com/test", "Test URI")
            print("  ✓ URI validation passed")
            
            validator.validate_numeric_value(25.5, "Temperature")
            print("  ✓ Numeric validation passed")
            
            validator.validate_confidence(0.95)
            print("  ✓ Confidence validation passed")
            
            # Test invalid cases (these will raise exceptions)
            try:
                validator.validate_confidence(1.5)  # Should fail
            except ValueError as e:
                print(f"  ✓ Caught invalid confidence: {e}")
            
            try:
                validator.validate_numeric_value("not_a_number", "Test Value")  # Should fail
            except ValueError as e:
                print(f"  ✓ Caught invalid numeric value: {e}")
            
        except Exception as e:
            print(f"⚠ Validation testing failed: {e}")
        
        print("\n" + "="*50)
        print("✓ Data management example completed!")
        print("\nKey takeaways:")
        print("- Use quick_data_point() for simple data creation")
        print("- Use ModelFactory for advanced data with validation")
        print("- Use api.search_data() to find existing data")
        print("- Use api.add_data() for single data points")
        print("- Use api.add_multiple_data() for bulk operations")
        print("- Always validate your data before submission")
        print("\nRemember to replace example URIs with real ones from your OpenSilex instance!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        logger.exception("Full error details:")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
#!/usr/bin/env python3
"""
Experiment management example using OpenSilex utilities.

This demonstrates how to work with experiments: creating, listing, and managing experiments.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import quick_auth, create_api_wrapper, quick_experiment, ModelFactory
from datetime import datetime, timedelta
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Demonstrate experiment management operations."""
    print("OpenSilex Experiment Management Example")
    print("=======================================")
    
    try:
        # Authentication
        print("\n1. Authentication")
        print("-" * 20)
        auth_manager = quick_auth()
        api = create_api_wrapper(auth_manager)
        print("✓ Authenticated and API ready")
        
        # List existing experiments
        print("\n2. List Existing Experiments")
        print("-" * 20)
        
        try:
            experiments = api.list_experiments(limit=10)
            print("✓ Experiments retrieved")
            
            if hasattr(experiments, 'result') and experiments.result:
                print(f"  Found {len(experiments.result)} experiments")
                for i, exp in enumerate(experiments.result[:5]):  # Show first 5
                    name = getattr(exp, 'name', 'N/A')
                    uri = getattr(exp, 'uri', 'N/A')
                    start_date = getattr(exp, 'start_date', 'N/A')
                    print(f"  {i+1}. {name}")
                    print(f"     URI: {uri}")
                    print(f"     Start: {start_date}")
                    print()
            else:
                print("  No experiments found or no access")
                
        except Exception as e:
            print(f"⚠ Could not list experiments: {e}")
        
        # Create simple experiment
        print("\n3. Create Simple Experiment")
        print("-" * 20)
        
        try:
            simple_exp = quick_experiment(
                name="Simple Test Experiment",
                objective="Demonstrate basic experiment creation"
            )
            
            print("✓ Simple experiment model created")
            print(f"  Name: {simple_exp.name}")
            print(f"  Objective: {simple_exp.objective}")
            print(f"  Start date: {simple_exp.start_date}")
            print("  (Model created but not submitted)")
            
        except Exception as e:
            print(f"⚠ Simple experiment creation failed: {e}")
        
        # Create detailed experiment
        print("\n4. Create Detailed Experiment")
        print("-" * 20)
        
        try:
            factory = ModelFactory(validate=True)
            
            # Create a more detailed experiment
            detailed_exp = factory.create_simple_experiment(
                name="Detailed Plant Growth Study",
                objective="Study the effect of different light conditions on plant growth",
                start_date=datetime.now(),
                description="This experiment will test how different LED light spectra affect the growth rate of lettuce plants over a 6-week period."
            )
            
            print("✓ Detailed experiment model created")
            print(f"  Name: {detailed_exp.name}")
            print(f"  Objective: {detailed_exp.objective}")
            print(f"  Description: {detailed_exp.description}")
            print(f"  Start date: {detailed_exp.start_date}")
            
            # To actually create this experiment, you would use:
            # result = api.create_experiment(
            #     name=detailed_exp.name,
            #     start_date=detailed_exp.start_date,
            #     objective=detailed_exp.objective,
            #     description=detailed_exp.description
            # )
            print("  (Model created but not submitted - use api.create_experiment() to submit)")
            
        except Exception as e:
            print(f"⚠ Detailed experiment creation failed: {e}")
        
        # Create experiment with timeline
        print("\n5. Create Experiment with Timeline")
        print("-" * 20)
        
        try:
            start_date = datetime.now()
            end_date = start_date + timedelta(weeks=8)  # 8-week experiment
            
            timeline_exp = api.create_experiment.__func__.__defaults__  # Get the function to see parameters
            
            # Create experiment data structure
            timeline_data = {
                'name': 'Long-term Growth Analysis',
                'start_date': start_date,
                'end_date': end_date,
                'objective': 'Analyze plant growth patterns over 8 weeks under controlled conditions',
                'description': 'A comprehensive study tracking multiple growth parameters including height, leaf count, biomass, and flowering time.'
            }
            
            print("✓ Timeline experiment data prepared")
            print(f"  Name: {timeline_data['name']}")
            print(f"  Duration: {timeline_data['start_date'].strftime('%Y-%m-%d')} to {timeline_data['end_date'].strftime('%Y-%m-%d')}")
            print(f"  Length: {(timeline_data['end_date'] - timeline_data['start_date']).days} days")
            print("  (Ready for submission with api.create_experiment())")
            
        except Exception as e:
            print(f"⚠ Timeline experiment preparation failed: {e}")
        
        # Get specific experiment details
        print("\n6. Get Experiment Details")
        print("-" * 20)
        
        try:
            # First, try to get an experiment URI from the list
            experiments = api.list_experiments(limit=1)
            
            if hasattr(experiments, 'result') and experiments.result:
                first_exp = experiments.result[0]
                exp_uri = getattr(first_exp, 'uri', None)
                
                if exp_uri:
                    exp_details = api.get_experiment(exp_uri)
                    print("✓ Experiment details retrieved")
                    
                    if hasattr(exp_details, 'result'):
                        exp = exp_details.result
                        print(f"  Name: {getattr(exp, 'name', 'N/A')}")
                        print(f"  URI: {getattr(exp, 'uri', 'N/A')}")
                        print(f"  Start: {getattr(exp, 'start_date', 'N/A')}")
                        print(f"  End: {getattr(exp, 'end_date', 'N/A')}")
                        print(f"  Objective: {getattr(exp, 'objective', 'N/A')}")
                else:
                    print("  No experiment URI available")
            else:
                print("  No experiments available to get details from")
                
        except Exception as e:
            print(f"⚠ Could not get experiment details: {e}")
        
        # Experiment validation examples
        print("\n7. Experiment Validation")
        print("-" * 20)
        
        try:
            from utils.model_helpers import ValidationHelpers
            validator = ValidationHelpers()
            
            print("Testing experiment validation:")
            
            # Valid experiment data
            validator.validate_required_string("Test Experiment", "Name")
            validator.validate_required_string("Test objective", "Objective")
            validator.validate_date(datetime.now(), "Start Date")
            print("  ✓ All validations passed")
            
            # Test invalid cases
            try:
                validator.validate_required_string("", "Name")  # Should fail
            except ValueError as e:
                print(f"  ✓ Caught empty name: {e}")
            
            try:
                validator.validate_required_string("   ", "Objective")  # Should fail
            except ValueError as e:
                print(f"  ✓ Caught whitespace-only objective: {e}")
            
        except Exception as e:
            print(f"⚠ Validation testing failed: {e}")
        
        # Planning multiple related experiments
        print("\n8. Planning Multiple Related Experiments")
        print("-" * 20)
        
        try:
            # Create a series of related experiments
            base_conditions = [
                ("Low Light", "Test plant response to low light conditions"),
                ("Medium Light", "Test plant response to medium light conditions"), 
                ("High Light", "Test plant response to high light conditions")
            ]
            
            planned_experiments = []
            start_date = datetime.now()
            
            for i, (condition, description) in enumerate(base_conditions):
                exp_start = start_date + timedelta(weeks=i*2)  # Stagger starts
                exp_name = f"Light Study - {condition}"
                
                exp_data = {
                    'name': exp_name,
                    'start_date': exp_start,
                    'end_date': exp_start + timedelta(weeks=6),
                    'objective': f"Evaluate plant growth under {condition.lower()} conditions",
                    'description': description
                }
                
                planned_experiments.append(exp_data)
            
            print(f"✓ Planned {len(planned_experiments)} related experiments")
            for i, exp in enumerate(planned_experiments):
                print(f"  {i+1}. {exp['name']}")
                print(f"     Start: {exp['start_date'].strftime('%Y-%m-%d')}")
                print(f"     End: {exp['end_date'].strftime('%Y-%m-%d')}")
                print()
            
            print("  (Experiment series planned - submit individually with api.create_experiment())")
            
        except Exception as e:
            print(f"⚠ Multiple experiment planning failed: {e}")
        
        print("\n" + "="*50)
        print("✓ Experiment management example completed!")
        print("\nKey takeaways:")
        print("- Use quick_experiment() for simple experiment creation")
        print("- Use ModelFactory for advanced experiments with validation")
        print("- Use api.list_experiments() to see existing experiments")
        print("- Use api.get_experiment(uri) to get detailed information")
        print("- Use api.create_experiment() to actually create experiments")
        print("- Plan experiment timelines carefully to avoid conflicts")
        print("- Validate all experiment data before submission")
        print("\nNext steps:")
        print("- Replace example data with real experiment information")
        print("- Connect experiments to your scientific objects and variables")
        print("- Set up proper project and organization associations")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        logger.exception("Full error details:")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
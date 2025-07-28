#!/usr/bin/env python3
"""
Direct testing of OpenSilex models with proper required fields.
"""

import opensilex_swagger_client
from datetime import datetime
from pprint import pprint
import traceback

def test_authentication_dto():
    """Test AuthenticationDTO model."""
    print("=== Testing AuthenticationDTO ===")
    
    try:
        # Create with required fields
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="test_user",
            password="test_password"
        )
        
        print(f"Created: {auth_dto}")
        print(f"Identifier: {auth_dto.identifier}")
        print(f"Password: {auth_dto.password}")
        
        # Test to_dict method
        auth_dict = auth_dto.to_dict()
        print(f"to_dict(): {auth_dict}")
        
        # Test to_str method
        auth_str = auth_dto.to_str()
        print(f"to_str(): {auth_str}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_data_creation_dto():
    """Test DataCreationDTO model with required fields."""
    print("\n=== Testing DataCreationDTO ===")
    
    try:
        # Create with required fields - date is required
        from datetime import datetime
        current_date = datetime.now()
        
        data_dto = opensilex_swagger_client.DataCreationDTO(
            _date=current_date,
            target="http://example.com/target/1",
            variable="http://example.com/variable/1"
        )
        
        print(f"Created: {data_dto}")
        print(f"Date: {data_dto._date}")
        print(f"Target: {data_dto.target}")
        print(f"Variable: {data_dto.variable}")
        
        # Test optional fields
        data_dto.value = 25.5
        data_dto.confidence = 0.95
        print(f"Value: {data_dto.value}")
        print(f"Confidence: {data_dto.confidence}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_experiment_creation_dto():
    """Test ExperimentCreationDTO model."""
    print("\n=== Testing ExperimentCreationDTO ===")
    
    try:
        # Create with required fields
        exp_dto = opensilex_swagger_client.ExperimentCreationDTO(
            name="Test Experiment",
            start_date=datetime.now(),
            objective="Test objective"
        )
        
        print(f"Created: {exp_dto}")
        print(f"Name: {exp_dto.name}")
        print(f"Start date: {exp_dto.start_date}")
        print(f"Objective: {exp_dto.objective}")
        
        # Test optional fields
        exp_dto.description = "This is a test experiment"
        exp_dto.uri = "http://example.com/experiment/1"
        print(f"Description: {exp_dto.description}")
        print(f"URI: {exp_dto.uri}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_germplasm_creation_dto():
    """Test GermplasmCreationDTO model."""
    print("\n=== Testing GermplasmCreationDTO ===")
    
    try:
        # Create with required fields
        germplasm_dto = opensilex_swagger_client.GermplasmCreationDTO(
            rdf_type="http://www.opensilex.org/vocabulary/oeso#Germplasm",
            name="Test Germplasm"
        )
        
        print(f"Created: {germplasm_dto}")
        print(f"RDF Type: {germplasm_dto.rdf_type}")
        print(f"Name: {germplasm_dto.name}")
        
        # Test optional fields
        germplasm_dto.uri = "http://example.com/germplasm/1"
        germplasm_dto.species = "http://example.com/species/1"
        print(f"URI: {germplasm_dto.uri}")
        print(f"Species: {germplasm_dto.species}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_variable_creation_dto():
    """Test VariableCreationDTO model."""
    print("\n=== Testing VariableCreationDTO ===")
    
    try:
        # Create with required fields
        variable_dto = opensilex_swagger_client.VariableCreationDTO(
            name="Test Variable",
            alternative_name="test_var",
            description="A test variable",
            characteristic="http://example.com/characteristic/1",
            method="http://example.com/method/1",
            unit="http://example.com/unit/1",
            datatype="decimal"
        )
        
        print(f"Created: {variable_dto}")
        print(f"Name: {variable_dto.name}")
        print(f"Alternative name: {variable_dto.alternative_name}")
        print(f"Description: {variable_dto.description}")
        print(f"Characteristic: {variable_dto.characteristic}")
        print(f"Method: {variable_dto.method}")
        print(f"Unit: {variable_dto.unit}")
        print(f"Datatype: {variable_dto.datatype}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_error_dto():
    """Test ErrorDTO model."""
    print("\n=== Testing ErrorDTO ===")
    
    try:
        # This might not have required fields
        error_dto = opensilex_swagger_client.ErrorDTO()
        
        print(f"Created: {error_dto}")
        
        # Set some fields
        error_dto.title = "Test Error"
        error_dto.message = "This is a test error message"
        print(f"Title: {error_dto.title}")
        print(f"Message: {error_dto.message}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_pagination_dto():
    """Test PaginationDTO model."""
    print("\n=== Testing PaginationDTO ===")
    
    try:
        # This should be a simple model
        pagination_dto = opensilex_swagger_client.PaginationDTO()
        
        print(f"Created: {pagination_dto}")
        
        # Set pagination fields
        pagination_dto.page = 0
        pagination_dto.page_size = 20
        pagination_dto.total_count = 100
        pagination_dto.total_pages = 5
        
        print(f"Page: {pagination_dto.page}")
        print(f"Page size: {pagination_dto.page_size}")
        print(f"Total count: {pagination_dto.total_count}")
        print(f"Total pages: {pagination_dto.total_pages}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def test_model_serialization():
    """Test model serialization methods."""
    print("\n=== Testing Model Serialization ===")
    
    try:
        # Create a model with data
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="test_user",
            password="test_password"
        )
        
        # Test to_dict
        auth_dict = auth_dto.to_dict()
        print(f"to_dict() type: {type(auth_dict)}")
        print(f"to_dict() content: {auth_dict}")
        
        # Test to_str
        auth_str = auth_dto.to_str()
        print(f"to_str() type: {type(auth_str)}")
        print(f"to_str() preview: {auth_str[:100]}...")
        
        # Test attribute access
        print(f"Direct attribute access: {auth_dto.identifier}")
        
        # Test swagger_types if available
        if hasattr(auth_dto, 'swagger_types'):
            print(f"swagger_types: {auth_dto.swagger_types}")
        
        # Test attribute_map if available
        if hasattr(auth_dto, 'attribute_map'):
            print(f"attribute_map: {auth_dto.attribute_map}")
        
        return True
    except Exception as e:
        print(f"Failed: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all model tests."""
    print("OpenSilex Python Client Model Testing")
    print("====================================")
    
    tests = [
        test_authentication_dto,
        test_data_creation_dto,
        test_experiment_creation_dto,
        test_germplasm_creation_dto,
        test_variable_creation_dto,
        test_error_dto,
        test_pagination_dto,
        test_model_serialization
    ]
    
    results = []
    for test_func in tests:
        result = test_func()
        results.append((test_func.__name__, result))
    
    print("\n=== Test Results Summary ===")
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"{test_name}: {status}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("✅ All model tests passed! The models work correctly when provided with required fields.")
    else:
        print("❌ Some model tests failed. Check the error messages above.")

if __name__ == "__main__":
    main()
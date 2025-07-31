#!/usr/bin/env python3
"""
Direct testing of OpenSilex APIs and models.
"""

import opensilex_swagger_client
from pprint import pprint
import traceback

def test_system_api():
    """Test System API - might not require authentication."""
    print("=== Testing System API ===")
    
    api_client = opensilex_swagger_client.ApiClient()
    api_client.configuration.host = "http://98.71.237.204:8666"
    
    sys_api = opensilex_swagger_client.SystemApi(api_client)
    
    try:
        # Try to get version info
        print("Getting version info...")
        version_info = sys_api.get_version_info()
        print("Success! Version info:")
        pprint(version_info)
        return True
    except Exception as e:
        print(f"Failed: {e}")
        print("Traceback:")
        traceback.print_exc()
        return False

def test_api_client_configuration():
    """Test basic API client configuration."""
    print("\n=== Testing API Client Configuration ===")
    
    try:
        # Test basic client creation
        api_client = opensilex_swagger_client.ApiClient()
        print(f"Default host: {api_client.configuration.host}")
        
        # Update host
        api_client.configuration.host = "http://98.71.237.204:8666"
        print(f"Updated host: {api_client.configuration.host}")
        
        # Test API instantiation
        auth_api = opensilex_swagger_client.AuthenticationApi(api_client)
        print(f"AuthenticationApi created: {type(auth_api)}")
        
        data_api = opensilex_swagger_client.DataApi(api_client)
        print(f"DataApi created: {type(data_api)}")
        
        return True
    except Exception as e:
        print(f"Configuration test failed: {e}")
        traceback.print_exc()
        return False

def test_model_creation():
    """Test model creation and basic operations."""
    print("\n=== Testing Model Creation ===")
    
    try:
        # Test AuthenticationDTO model
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="test_user",
            password="test_pass"
        )
        print(f"AuthenticationDTO created: {auth_dto}")
        print(f"Identifier: {auth_dto.identifier}")
        print(f"Password: {auth_dto.password}")
        
        # Test another model - DataCreationDTO
        data_dto = opensilex_swagger_client.DataCreationDTO()
        print(f"DataCreationDTO created: {data_dto}")
        
        # Test model with some attributes
        if hasattr(data_dto, 'uri'):
            data_dto.uri = "http://test.example.com/data/1"
            print(f"DataCreationDTO URI set: {data_dto.uri}")
        
        return True
    except Exception as e:
        print(f"Model creation test failed: {e}")
        traceback.print_exc()
        return False

def test_api_methods():
    """Test API method availability."""
    print("\n=== Testing API Methods ===")
    
    try:
        api_client = opensilex_swagger_client.ApiClient()
        api_client.configuration.host = "http://98.71.237.204:8666"
        
        # Test AuthenticationApi methods
        auth_api = opensilex_swagger_client.AuthenticationApi(api_client)
        print("AuthenticationApi methods:")
        auth_methods = [method for method in dir(auth_api) if not method.startswith('_')]
        for method in auth_methods[:5]:  # Show first 5 methods
            print(f"  - {method}")
        
        # Test DataApi methods
        data_api = opensilex_swagger_client.DataApi(api_client)
        print("DataApi methods:")
        data_methods = [method for method in dir(data_api) if not method.startswith('_')]
        for method in data_methods[:5]:  # Show first 5 methods
            print(f"  - {method}")
        
        # Test GermplasmApi methods
        germplasm_api = opensilex_swagger_client.GermplasmApi(api_client)
        print("GermplasmApi methods:")
        germplasm_methods = [method for method in dir(germplasm_api) if not method.startswith('_')]
        for method in germplasm_methods[:5]:  # Show first 5 methods
            print(f"  - {method}")
        
        return True
    except Exception as e:
        print(f"API methods test failed: {e}")
        traceback.print_exc()
        return False

def test_model_properties():
    """Test model properties and attributes."""
    print("\n=== Testing Model Properties ===")
    
    try:
        # Test various models and their properties
        models_to_test = [
            'AuthenticationDTO',
            'DataCreationDTO', 
            'ExperimentCreationDTO',
            'GermplasmCreationDTO',
            'VariableCreationDTO'
        ]
        
        for model_name in models_to_test:
            try:
                model_class = getattr(opensilex_swagger_client, model_name)
                model_instance = model_class()
                print(f"\n{model_name}:")
                
                # Get all attributes that don't start with underscore
                attrs = [attr for attr in dir(model_instance) if not attr.startswith('_')]
                print(f"  Available attributes: {attrs[:5]}...")  # Show first 5
                
                # Test if the model has expected properties
                if hasattr(model_instance, 'to_dict'):
                    print(f"  Has to_dict method: True")
                if hasattr(model_instance, 'to_str'):
                    print(f"  Has to_str method: True")
                    
            except AttributeError:
                print(f"  {model_name}: Not found")
            except Exception as e:
                print(f"  {model_name}: Error - {e}")
        
        return True
    except Exception as e:
        print(f"Model properties test failed: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all tests."""
    print("OpenSilex Python Client Direct Testing")
    print("=====================================")
    
    tests = [
        test_api_client_configuration,
        test_model_creation,
        test_api_methods,
        test_model_properties,
        test_system_api  # This one might fail due to network/auth
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

if __name__ == "__main__":
    main()
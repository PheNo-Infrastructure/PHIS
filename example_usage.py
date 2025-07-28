#!/usr/bin/env python3
"""
Example usage of the generated OpenSilex Python client (Swagger Codegen).

This script demonstrates how to use the generated Swagger Codegen client to interact
with the OpenSilex API.
"""

import opensilex_swagger_client
from pprint import pprint

def main():
    # Configuration
    # The API server URL - update this to match your server
    api_client = opensilex_swagger_client.ApiClient()
    api_client.configuration.host = "http://98.71.237.204:8666"  # Update this to your server URL
        
    # Example 1: Authentication
    print("=== Authentication Example ===")
    auth_api = opensilex_swagger_client.AuthenticationApi(api_client)
    
    try:
        # Create authentication DTO with your credentials
        auth_dto = opensilex_swagger_client.AuthenticationDTO(
            identifier="your_username",  # Replace with your username
            password="your_password"      # Replace with your password
        )
        
        # Authenticate - uncomment and update credentials to test
        # api_response = auth_api.authenticate(auth_dto)
        # print("Authentication successful!")
        # print("Token:", api_response.result.token)
        print("Authentication example ready (update credentials to test)")
        
    except Exception as e:
        print(f"Authentication failed: {e}")
    
    # Example 2: Get System Information
    print("\n=== System Information Example ===")
    sys_api = opensilex_swagger_client.SystemApi(api_client)
    
    try:
        # Get system version info - this usually doesn't require authentication
        # version_info = sys_api.get_version_info()
        # print("System version info:")
        # pprint(version_info)
        print("System API example ready")
        
    except Exception as e:
        print(f"Failed to get system info: {e}")
    
    # Example 3: List Experiments (requires authentication)
    print("\n=== Experiments Example ===")
    exp_api = opensilex_swagger_client.ExperimentsApi(api_client)
    
    try:
        # This would require a valid authentication token
        # experiments = exp_api.search_experiments()
        # print("Experiments:")
        # for exp in experiments.result:
        #     print(f"- {exp.name} ({exp.uri})")
        print("Experiments API example ready (requires authentication)")
        
    except Exception as e:
        print(f"Failed to get experiments: {e}")
    
    # Example 4: Data API
    print("\n=== Data API Example ===")
    data_api_instance = opensilex_swagger_client.DataApi(api_client)
    
    try:
        # Search for data - this typically requires authentication and specific parameters
        # data_results = data_api_instance.search_data_list(
        #     start_date="2023-01-01T00:00:00+00:00",
        #     end_date="2023-12-31T23:59:59+00:00"
        # )
        # print("Data search results:")
        # pprint(data_results)
        print("Data API example ready (requires authentication and parameters)")
        
    except Exception as e:
        print(f"Failed to search data: {e}")

def example_with_authentication_token():
    """
    Example showing how to use the client with an authentication token.
    """
    print("\n=== Authenticated Request Example ===")
    
    # If you have an authentication token, you can set it like this:
    api_client = opensilex_swagger_client.ApiClient()
    api_client.configuration.host = "http://98.71.237.204:8666"
    
    # Set the access token in the default header
    # api_client.set_default_header('Authorization', 'Bearer your_bearer_token_here')
    
    # Now you can make authenticated requests
    exp_api = opensilex_swagger_client.ExperimentsApi(api_client)
    
    try:
        # This would work with a valid token
        # experiments = exp_api.search_experiments()
        # print("Authenticated request successful!")
        print("Token-based authentication example ready")
        
    except Exception as e:
        print(f"Authenticated request failed: {e}")

def print_available_apis():
    """
    Print all available API classes in the generated client.
    """
    print("\n=== Available APIs ===")
    api_classes = [
        "AgroportalAPIApi",
        "AnnotationsApi", 
        "AreaApi",
        "AuthenticationApi",
        "BRAPIApi",
        "DataApi",
        "DevicesApi",
        "DocumentsApi",
        "EventsApi",
        "ExperimentsApi",
        "FactorsApi",
        "FaidareApi",
        "GermplasmApi",
        "MetricsApi",
        "OntologyApi",
        "OrganizationsApi",
        "PositionsApi",
        "ProjectsApi",
        "ScientificObjectsApi",
        "SecurityApi",
        "SpeciesApi",
        "StapleAPIApi",
        "SystemApi",
        "UriSearchApi",
        "VariablesApi",
        "VueJsApi",
        "VueJsOntologyExtensionApi"
    ]
    
    for api_class in api_classes:
        print(f"- {api_class}")
    
    print(f"\nTotal: {len(api_classes)} API classes available")

if __name__ == "__main__":
    print("OpenSilex Python Client Usage Example")
    print("=====================================")
    
    # Print available APIs
    print_available_apis()
    
    # Run basic examples
    main()
    
    # Show authentication token example
    example_with_authentication_token()
    
    print("\n=== Next Steps ===")
    print("1. Install the client: pip install -e ./opensilex_python_client")
    print("2. Update the credentials and server URL in this script")
    print("3. Run this script to test the API client")
    print("4. Check the 'docs' folder for detailed API documentation")
    print("5. Explore the 'opensilex_swagger_client' module for available models")
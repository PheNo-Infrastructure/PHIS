#!/usr/bin/env python3
"""
API wrapper utility for OpenSilex client.

This provides a high-level interface to common OpenSilex API operations.
"""

import opensilex_swagger_client
from typing import List, Dict, Any, Optional, Union
import logging
from datetime import datetime
from .auth_manager import OpenSilexAuthManager

logger = logging.getLogger(__name__)

class OpenSilexAPIWrapper:
    """High-level wrapper for OpenSilex APIs with authentication management."""
    
    def __init__(self, auth_manager: OpenSilexAuthManager):
        """
        Initialize the API wrapper.
        
        Args:
            auth_manager: Authenticated OpenSilexAuthManager instance
        """
        self.auth_manager = auth_manager
        self.client = auth_manager.get_authenticated_client()
        
        # Initialize API instances
        self.auth_api = opensilex_swagger_client.AuthenticationApi(self.client)
        self.data_api = opensilex_swagger_client.DataApi(self.client)
        self.experiments_api = opensilex_swagger_client.ExperimentsApi(self.client)
        self.germplasm_api = opensilex_swagger_client.GermplasmApi(self.client)
        self.variables_api = opensilex_swagger_client.VariablesApi(self.client)
        self.devices_api = opensilex_swagger_client.DevicesApi(self.client)
        self.projects_api = opensilex_swagger_client.ProjectsApi(self.client)
        self.scientific_objects_api = opensilex_swagger_client.ScientificObjectsApi(self.client)
        self.system_api = opensilex_swagger_client.SystemApi(self.client)
        self.ontology_api = opensilex_swagger_client.OntologyApi(self.client)
        
    def _handle_api_call(self, api_call, operation_name: str):
        """Handle API calls with error handling and logging."""
        try:
            logger.debug(f"Executing {operation_name}")
            result = api_call()
            logger.debug(f"Successfully executed {operation_name}")
            return result
        except Exception as e:
            logger.error(f"Failed to execute {operation_name}: {e}")
            raise
    
    # Experiment operations
    def list_experiments(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List experiments with pagination."""
        def call():
            return self.experiments_api.search_experiments(
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "list_experiments")
    
    def get_experiment(self, experiment_uri: str) -> Dict[str, Any]:
        """Get a specific experiment by URI."""
        def call():
            return self.experiments_api.get_experiment(experiment_uri)
        return self._handle_api_call(call, f"get_experiment({experiment_uri})")
    
    def create_experiment(self, name: str, start_date: datetime, objective: str, 
                         description: str = None, end_date: datetime = None,
                         **kwargs) -> Dict[str, Any]:
        """Create a new experiment."""
        experiment_dto = opensilex_swagger_client.ExperimentCreationDTO(
            name=name,
            start_date=start_date,
            objective=objective,
            description=description,
            end_date=end_date,
            **kwargs
        )
        
        def call():
            return self.experiments_api.create_experiment(experiment_dto)
        return self._handle_api_call(call, f"create_experiment({name})")
    
    # Data operations
    def search_data(self, start_date: str = None, end_date: str = None, 
                   target: str = None, variable: str = None,
                   limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Search for data with filters."""
        def call():
            return self.data_api.search_data_list(
                start_date=start_date,
                end_date=end_date,
                target=target,
                variable=variable,
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "search_data")
    
    def add_data(self, target: str, variable: str, date: datetime, 
                value: Union[float, int, str], confidence: float = None,
                **kwargs) -> Dict[str, Any]:
        """Add a single data point."""
        data_dto = opensilex_swagger_client.DataCreationDTO(
            target=target,
            variable=variable,
            _date=date,
            value=value,
            confidence=confidence,
            **kwargs
        )
        
        def call():
            return self.data_api.add_list_data([data_dto])
        return self._handle_api_call(call, f"add_data({target}, {variable})")
    
    def add_multiple_data(self, data_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Add multiple data points using direct HTTP request."""
        import requests
        
        # Get the token from the auth manager
        token = self.auth_manager.token_data['token'] if self.auth_manager.token_data else None
        if not token:
            raise Exception("No authentication token available")
        
        # Prepare the data for direct HTTP request
        json_data = []
        for data in data_list:
            data_point = {
                'target': data['target'],
                'variable': data['variable'],
                'value': data['value'],
                'date': data['date'],
                'confidence': data.get('confidence'),
                'provenance': {
                    'uri': 'dev:provenance/standard_provenance'
                }
            }
            json_data.append(data_point)
        
        # Make direct HTTP request
        url = f"{self.auth_manager.host.rstrip('/')}/rest/core/data"
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.post(url, json=json_data, headers=headers)
        
        if response.status_code == 201:
            logger.info(f"Successfully imported {len(data_list)} data points")
            return response.json()
        else:
            error_msg = f"HTTP {response.status_code}: {response.text[:500]}"
            logger.error(f"Data import failed: {error_msg}")
            raise Exception(error_msg)
    
    # Germplasm operations
    def list_germplasm(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List germplasm with pagination."""
        def call():
            return self.germplasm_api.search_germplasm(
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "list_germplasm")
    
    def get_germplasm(self, germplasm_uri: str) -> Dict[str, Any]:
        """Get a specific germplasm by URI."""
        def call():
            return self.germplasm_api.get_germplasm(germplasm_uri)
        return self._handle_api_call(call, f"get_germplasm({germplasm_uri})")
    
    def create_germplasm(self, name: str, rdf_type: str = None,
                        species: str = None, variety: str = None,
                        **kwargs) -> Dict[str, Any]:
        """Create a new germplasm."""
        germplasm_dto = opensilex_swagger_client.GermplasmCreationDTO(
            name=name,
            rdf_type=rdf_type or "http://www.opensilex.org/vocabulary/oeso#Germplasm",
            species=species,
            variety=variety,
            **kwargs
        )
        
        def call():
            return self.germplasm_api.create_germplasm(germplasm_dto)
        return self._handle_api_call(call, f"create_germplasm({name})")
    
    # Variable operations
    def list_variables(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List variables with pagination."""
        def call():
            return self.variables_api.search_variables(
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "list_variables")
    
    def get_variable(self, variable_uri: str) -> Dict[str, Any]:
        """Get a specific variable by URI."""
        def call():
            return self.variables_api.get_variable(variable_uri)
        return self._handle_api_call(call, f"get_variable({variable_uri})")
    
    def create_variable(self, name: str, alternative_name: str, description: str,
                       characteristic: str, method: str, unit: str, 
                       entity: str, datatype: str = "decimal",
                       **kwargs) -> Dict[str, Any]:
        """Create a new variable."""
        variable_dto = opensilex_swagger_client.VariableCreationDTO(
            name=name,
            alternative_name=alternative_name,
            description=description,
            characteristic=characteristic,
            method=method,
            unit=unit,
            entity=entity,
            datatype=datatype,
            **kwargs
        )
        
        def call():
            return self.variables_api.create_variable(variable_dto)
        return self._handle_api_call(call, f"create_variable({name})")
    
    # Scientific Objects operations
    def list_scientific_objects(self, experiment: str = None, limit: int = 50, 
                               offset: int = 0) -> List[Dict[str, Any]]:
        """List scientific objects."""
        def call():
            return self.scientific_objects_api.search_scientific_objects(
                experiment=experiment,
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "list_scientific_objects")
    
    def get_scientific_object(self, so_uri: str) -> Dict[str, Any]:
        """Get a specific scientific object by URI."""
        def call():
            return self.scientific_objects_api.get_scientific_object(so_uri)
        return self._handle_api_call(call, f"get_scientific_object({so_uri})")
    
    # Project operations
    def list_projects(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List projects with pagination."""
        def call():
            return self.projects_api.search_projects(
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "list_projects")
    
    def get_project(self, project_uri: str) -> Dict[str, Any]:
        """Get a specific project by URI."""
        def call():
            return self.projects_api.get_project(project_uri)
        return self._handle_api_call(call, f"get_project({project_uri})")
    
    # Device operations
    def list_devices(self, rdf_type: str = None, limit: int = 50, 
                    offset: int = 0) -> List[Dict[str, Any]]:
        """List devices with pagination."""
        def call():
            return self.devices_api.search_devices(
                rdf_type=rdf_type,
                page_size=limit,
                page=offset // limit
            )
        return self._handle_api_call(call, "list_devices")
    
    def get_device(self, device_uri: str) -> Dict[str, Any]:
        """Get a specific device by URI."""
        def call():
            return self.devices_api.get_device(device_uri)
        return self._handle_api_call(call, f"get_device({device_uri})")
    
    # System operations
    def get_system_info(self) -> Dict[str, Any]:
        """Get system version and information."""
        def call():
            return self.system_api.get_version_info()
        return self._handle_api_call(call, "get_system_info")
    
    # Ontology operations
    def get_rdf_types(self, parent_type: str = None) -> List[Dict[str, Any]]:
        """Get RDF types from ontology."""
        def call():
            return self.ontology_api.get_rdf_types(parent_type=parent_type)
        return self._handle_api_call(call, "get_rdf_types")
    
    def get_properties(self, rdf_type: str) -> List[Dict[str, Any]]:
        """Get properties for an RDF type."""
        def call():
            return self.ontology_api.get_properties(rdf_type)
        return self._handle_api_call(call, f"get_properties({rdf_type})")

def create_api_wrapper(auth_manager: OpenSilexAuthManager) -> OpenSilexAPIWrapper:
    """
    Convenience function to create an API wrapper.
    
    Args:
        auth_manager: Authenticated auth manager
        
    Returns:
        Configured API wrapper
    """
    if not auth_manager.is_authenticated():
        raise Exception("Auth manager must be authenticated")
    return OpenSilexAPIWrapper(auth_manager)

if __name__ == "__main__":
    # Example usage
    from .auth_manager import quick_auth
    
    logging.basicConfig(level=logging.INFO)
    
    try:
        # Get authenticated manager
        auth_manager = quick_auth()
        
        # Create API wrapper
        api = create_api_wrapper(auth_manager)
        
        # Test some operations
        print("Testing system info...")
        try:
            info = api.get_system_info()
            print("System info retrieved successfully")
        except Exception as e:
            print(f"System info failed: {e}")
        
        print("API wrapper ready for use!")
        
    except Exception as e:
        print(f"Error: {e}")
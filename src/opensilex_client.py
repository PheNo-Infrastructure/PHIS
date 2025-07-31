#!/usr/bin/env python3
"""
OpenSilex Client Orchestrator

A single, unified interface for all OpenSilex operations.
This file provides a simple, high-level API that orchestrates all the utilities.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
import sys
import os

# Add utils to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils import (
    OpenSilexAuthManager, 
    OpenSilexAPIWrapper, 
    ModelFactory,
    get_config,
    quick_auth,
    create_api_wrapper,
    quick_data_point,
    quick_experiment,
    quick_germplasm
)

class OpenSilexClient:
    """
    Unified OpenSilex client that orchestrates authentication, API calls, and model creation.
    
    This is the main entry point for all OpenSilex operations.
    """
    
    def __init__(self, host: str = None, username: str = None, password: str = None, 
                 config_file: str = None, auto_auth: bool = True):
        """
        Initialize the OpenSilex client.
        
        Args:
            host: OpenSilex server URL (optional, uses config/env if not provided)
            username: Username for authentication (optional, will prompt if needed)
            password: Password for authentication (optional, will prompt if needed)
            config_file: Configuration file path (optional)
            auto_auth: Whether to automatically authenticate on initialization
        """
        # Setup configuration
        self.config = get_config(config_file)
        if host:
            self.config.set('server', 'host', host)
        
        # Setup logging
        self.config.setup_logging()
        self.logger = logging.getLogger(__name__)
        
        # Initialize components
        self.auth_manager = None
        self.api = None
        self.model_factory = ModelFactory(validate=True)
        
        # Auto-authenticate if requested
        if auto_auth:
            self.authenticate(username, password)
    
    def authenticate(self, username: str = None, password: str = None) -> bool:
        """
        Authenticate with the OpenSilex server.
        
        Args:
            username: Username (will prompt if not provided)
            password: Password (will prompt if not provided)
            
        Returns:
            True if authentication successful
        """
        try:
            if username and password:
                # Create auth manager with explicit credentials
                host = self.config.get('server', 'host')
                self.auth_manager = OpenSilexAuthManager(host=host)
                success = self.auth_manager.authenticate(username, password)
                if not success:
                    raise Exception("Authentication failed with provided credentials")
            else:
                # Use quick_auth for interactive authentication
                self.auth_manager = quick_auth(username, password, 
                                              host=self.config.get('server', 'host'))
            
            # Create API wrapper
            self.api = create_api_wrapper(self.auth_manager)
            self.logger.info("OpenSilex client authenticated and ready")
            return True
            
        except Exception as e:
            self.logger.error(f"Authentication failed: {e}")
            return False
    
    def is_ready(self) -> bool:
        """Check if the client is authenticated and ready for use."""
        return (self.auth_manager is not None and 
                self.auth_manager.is_authenticated() and 
                self.api is not None)
    
    def _ensure_ready(self):
        """Ensure the client is ready, raise exception if not."""
        if not self.is_ready():
            raise Exception("Client not authenticated. Call authenticate() first.")
    
    # =======================
    # HIGH-LEVEL OPERATIONS
    # =======================
    
    def get_status(self) -> Dict[str, Any]:
        """Get client and server status information."""
        status = {
            'authenticated': self.auth_manager.is_authenticated() if self.auth_manager else False,
            'server_host': self.config.get('server', 'host'),
            'ready': self.is_ready()
        }
        
        if self.auth_manager:
            token_info = self.auth_manager.get_token_info()
            if token_info:
                status.update({
                    'username': token_info.get('username'),
                    'token_expires': token_info.get('expires_at'),
                    'token_valid': token_info.get('is_valid')
                })
        
        # Try to get system info
        if self.is_ready():
            try:
                system_info = self.api.get_system_info()
                status['server_accessible'] = True
                if hasattr(system_info, 'result'):
                    status['server_version'] = getattr(system_info.result, 'version', 'Unknown')
            except Exception as e:
                status['server_accessible'] = False
                status['server_error'] = str(e)
        
        return status
    
    # =======================
    # DATA OPERATIONS
    # =======================
    
    def add_data_point(self, target: str, variable: str, value: Union[float, int, str],
                      date: datetime = None, confidence: float = None) -> Dict[str, Any]:
        """
        Add a single data point.
        
        Args:
            target: URI of the target object
            variable: URI of the variable
            value: The measured value
            date: Date of measurement (default: now)
            confidence: Confidence level (0-1)
            
        Returns:
            API response
        """
        self._ensure_ready()
        
        if date is None:
            date = datetime.now()
        
        return self.api.add_data(target, variable, date, value, confidence)
    
    def add_multiple_data(self, data_points: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Add multiple data points in one operation.
        
        Args:
            data_points: List of data point dictionaries with keys:
                        target, variable, value, date (optional), confidence (optional)
                        
        Returns:
            API response
        """
        self._ensure_ready()
        return self.api.add_multiple_data(data_points)
    
    def search_data(self, target: str = None, variable: str = None,
                   start_date: str = None, end_date: str = None,
                   limit: int = None) -> List[Dict[str, Any]]:
        """
        Search for data points.
        
        Args:
            target: Target URI filter
            variable: Variable URI filter
            start_date: Start date filter (ISO format)
            end_date: End date filter (ISO format)
            limit: Maximum number of results
            
        Returns:
            List of data points
        """
        self._ensure_ready()
        
        limit = limit or self.config.get('api', 'default_page_size', 50)
        return self.api.search_data(start_date, end_date, target, variable, limit)
    
    def create_time_series(self, target: str, variable: str, 
                          values_with_dates: List[tuple],
                          confidence: float = None) -> Dict[str, Any]:
        """
        Create a time series of data points.
        
        Args:
            target: Target URI
            variable: Variable URI
            values_with_dates: List of (value, datetime) tuples
            confidence: Default confidence for all points
            
        Returns:
            API response
        """
        self._ensure_ready()
        
        data_points = []
        for value, date in values_with_dates:
            data_points.append({
                'target': target,
                'variable': variable,
                'value': value,
                'date': date,
                'confidence': confidence
            })
        
        return self.add_multiple_data(data_points)
    
    # =======================
    # EXPERIMENT OPERATIONS
    # =======================
    
    def create_experiment(self, name: str, objective: str, 
                         start_date: datetime = None, end_date: datetime = None,
                         description: str = None) -> Dict[str, Any]:
        """
        Create a new experiment.
        
        Args:
            name: Experiment name
            objective: Experiment objective
            start_date: Start date (default: now)
            end_date: End date (optional)
            description: Description (optional)
            
        Returns:
            API response with created experiment
        """
        self._ensure_ready()
        
        if start_date is None:
            start_date = datetime.now()
        
        return self.api.create_experiment(name, start_date, objective, description, end_date)
    
    def list_experiments(self, limit: int = None) -> List[Dict[str, Any]]:
        """
        List experiments.
        
        Args:
            limit: Maximum number of results
            
        Returns:
            List of experiments
        """
        self._ensure_ready()
        
        limit = limit or self.config.get('api', 'default_page_size', 50)
        return self.api.list_experiments(limit)
    
    def get_experiment(self, experiment_uri: str) -> Dict[str, Any]:
        """
        Get detailed information about an experiment.
        
        Args:
            experiment_uri: Experiment URI
            
        Returns:
            Experiment details
        """
        self._ensure_ready()
        return self.api.get_experiment(experiment_uri)
    
    # =======================
    # GERMPLASM OPERATIONS
    # =======================
    
    def create_germplasm(self, name: str, species: str = None, 
                        variety: str = None) -> Dict[str, Any]:
        """
        Create a new germplasm.
        
        Args:
            name: Germplasm name
            species: Species URI (optional)
            variety: Variety name (optional)
            
        Returns:
            API response with created germplasm
        """
        self._ensure_ready()
        
        kwargs = {}
        if species:
            kwargs['species'] = species
        if variety:
            kwargs['variety'] = variety
        
        return self.api.create_germplasm(name, species=species, variety=variety)
    
    def list_germplasm(self, limit: int = None) -> List[Dict[str, Any]]:
        """
        List germplasm.
        
        Args:
            limit: Maximum number of results
            
        Returns:
            List of germplasm
        """
        self._ensure_ready()
        
        limit = limit or self.config.get('api', 'default_page_size', 50)
        return self.api.list_germplasm(limit)
    
    def get_germplasm(self, germplasm_uri: str) -> Dict[str, Any]:
        """
        Get detailed information about a germplasm.
        
        Args:
            germplasm_uri: Germplasm URI
            
        Returns:
            Germplasm details
        """
        self._ensure_ready()
        return self.api.get_germplasm(germplasm_uri)
    
    # =======================
    # VARIABLE OPERATIONS
    # =======================
    
    def create_variable(self, name: str, alternative_name: str, description: str,
                       characteristic: str, method: str, unit: str, entity: str,
                       datatype: str = "decimal") -> Dict[str, Any]:
        """
        Create a new variable.
        
        Args:
            name: Variable name
            alternative_name: Alternative name
            description: Description
            characteristic: Characteristic URI
            method: Method URI
            unit: Unit URI
            entity: Entity URI
            datatype: Data type (default: decimal)
            
        Returns:
            API response with created variable
        """
        self._ensure_ready()
        
        return self.api.create_variable(
            name, alternative_name, description,
            characteristic, method, unit, entity, datatype
        )
    
    def list_variables(self, limit: int = None) -> List[Dict[str, Any]]:
        """
        List variables.
        
        Args:
            limit: Maximum number of results
            
        Returns:
            List of variables
        """
        self._ensure_ready()
        
        limit = limit or self.config.get('api', 'default_page_size', 50)
        return self.api.list_variables(limit)
    
    def get_variable(self, variable_uri: str) -> Dict[str, Any]:
        """
        Get detailed information about a variable.
        
        Args:
            variable_uri: Variable URI
            
        Returns:
            Variable details
        """
        self._ensure_ready()
        return self.api.get_variable(variable_uri)
    
    # =======================
    # SCIENTIFIC OBJECTS
    # =======================
    
    def list_scientific_objects(self, experiment: str = None, 
                               limit: int = None) -> List[Dict[str, Any]]:
        """
        List scientific objects.
        
        Args:
            experiment: Experiment URI filter (optional)
            limit: Maximum number of results
            
        Returns:
            List of scientific objects
        """
        self._ensure_ready()
        
        limit = limit or self.config.get('api', 'default_page_size', 50)
        return self.api.list_scientific_objects(experiment, limit)
    
    def get_scientific_object(self, so_uri: str) -> Dict[str, Any]:
        """
        Get detailed information about a scientific object.
        
        Args:
            so_uri: Scientific object URI
            
        Returns:
            Scientific object details
        """
        self._ensure_ready()
        return self.api.get_scientific_object(so_uri)
    
    # =======================
    # UTILITY METHODS
    # =======================
    
    def logout(self):
        """Logout and clear authentication."""
        if self.auth_manager:
            self.auth_manager.logout()
        self.auth_manager = None
        self.api = None
        self.logger.info("Logged out successfully")
    
    def get_ontology_types(self, parent_type: str = None) -> List[Dict[str, Any]]:
        """
        Get RDF types from ontology.
        
        Args:
            parent_type: Parent type filter (optional)
            
        Returns:
            List of RDF types
        """
        self._ensure_ready()
        return self.api.get_rdf_types(parent_type)
    
    def validate_data_point(self, target: str, variable: str, value: Any) -> bool:
        """
        Validate a data point before submission.
        
        Args:
            target: Target URI
            variable: Variable URI
            value: Value to validate
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If validation fails
        """
        from utils.model_helpers import ValidationHelpers
        validator = ValidationHelpers()
        
        validator.validate_uri(target, "Target")
        validator.validate_uri(variable, "Variable")
        validator.validate_numeric_value(value, "Value")
        
        return True

# =======================
# CONVENIENCE FUNCTIONS
# =======================

def connect(host: str = None, username: str = None, password: str = None) -> OpenSilexClient:
    """
    Quick connection to OpenSilex server.
    
    Args:
        host: Server URL (optional)
        username: Username (optional, will prompt if needed)
        password: Password (optional, will prompt if needed)
        
    Returns:
        Connected OpenSilexClient instance
    """
    return OpenSilexClient(host=host, username=username, password=password, auto_auth=True)

def create_client(host: str = None, auto_auth: bool = False) -> OpenSilexClient:
    """
    Create OpenSilex client without automatic authentication.
    
    Args:
        host: Server URL (optional)
        auto_auth: Whether to auto-authenticate (default: False)
        
    Returns:
        OpenSilexClient instance
    """
    return OpenSilexClient(host=host, auto_auth=auto_auth)

# =======================
# MAIN FUNCTION FOR CLI
# =======================

def main():
    """Main function for command-line usage."""
    import argparse
    
    parser = argparse.ArgumentParser(description="OpenSilex Client")
    parser.add_argument('--host', type=str, help='OpenSilex server URL')
    parser.add_argument('--username', type=str, help='Username')
    parser.add_argument('--status', action='store_true', help='Show client status')
    parser.add_argument('--list-experiments', action='store_true', help='List experiments')
    parser.add_argument('--list-variables', action='store_true', help='List variables')
    parser.add_argument('--config', action='store_true', help='Show configuration')
    
    args = parser.parse_args()
    
    try:
        if args.config:
            from utils.config import print_config_info
            print_config_info()
            return
        
        # Create client
        client = connect(host=args.host, username=args.username)
        
        if args.status:
            status = client.get_status()
            print("OpenSilex Client Status")
            print("======================")
            for key, value in status.items():
                print(f"{key}: {value}")
        
        elif args.list_experiments:
            experiments = client.list_experiments(limit=10)
            print("Experiments:")
            if hasattr(experiments, 'result') and experiments.result:
                for exp in experiments.result:
                    name = getattr(exp, 'name', 'N/A')
                    uri = getattr(exp, 'uri', 'N/A')
                    print(f"  - {name} ({uri})")
            else:
                print("  No experiments found")
        
        elif args.list_variables:
            variables = client.list_variables(limit=10)
            print("Variables:")
            if hasattr(variables, 'result') and variables.result:
                for var in variables.result:
                    name = getattr(var, 'name', 'N/A')
                    uri = getattr(var, 'uri', 'N/A')
                    print(f"  - {name} ({uri})")
            else:
                print("  No variables found")
        
        else:
            print("OpenSilex client ready! Use --help for available commands.")
            print(f"Status: {client.get_status()}")
    
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
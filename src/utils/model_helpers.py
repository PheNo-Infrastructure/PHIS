#!/usr/bin/env python3
"""
Model helper utilities for OpenSilex client.

This provides helper functions to create models with proper required fields
and validation.
"""

import opensilex_swagger_client
from datetime import datetime
from typing import Dict, Any, List, Optional, Union
import logging

logger = logging.getLogger(__name__)

class ModelHelpers:
    """Helper class for creating OpenSilex models with proper validation."""
    
    @staticmethod
    def create_authentication_dto(identifier: str, password: str) -> opensilex_swagger_client.AuthenticationDTO:
        """
        Create an AuthenticationDTO with validation.
        
        Args:
            identifier: Username or email
            password: User password
            
        Returns:
            AuthenticationDTO instance
        """
        if not identifier or not password:
            raise ValueError("Both identifier and password are required")
        
        return opensilex_swagger_client.AuthenticationDTO(
            identifier=identifier,
            password=password
        )
    
    @staticmethod
    def create_data_dto(target: str, variable: str, date: datetime, 
                       value: Union[float, int, str],
                       confidence: Optional[float] = None,
                       provenance: Optional[Any] = None,
                       **kwargs) -> opensilex_swagger_client.DataCreationDTO:
        """
        Create a DataCreationDTO with all required fields.
        
        Args:
            target: URI of the target object
            variable: URI of the variable
            date: Date of the measurement
            value: The measured value (required!)
            confidence: Confidence level (0-1)
            provenance: Data provenance model (required! Will create default if None)
            **kwargs: Additional optional fields
            
        Returns:
            DataCreationDTO instance
        """
        if not target or not variable or not date or value is None:
            raise ValueError("target, variable, date, and value are all required")
        
        # Create default provenance if not provided
        if provenance is None:
            try:
                provenance = opensilex_swagger_client.DataProvenanceModel()
            except Exception:
                # If we can't create a provenance model, use an empty dict as fallback
                provenance = {}
        
        return opensilex_swagger_client.DataCreationDTO(
            target=target,
            variable=variable,
            _date=date,
            value=value,
            confidence=confidence,
            provenance=provenance,
            **kwargs
        )
    
    @staticmethod
    def create_experiment_dto(name: str, start_date: datetime, objective: str,
                             description: Optional[str] = None,
                             end_date: Optional[datetime] = None,
                             **kwargs) -> opensilex_swagger_client.ExperimentCreationDTO:
        """
        Create an ExperimentCreationDTO with required fields.
        
        Args:
            name: Experiment name
            start_date: Start date of the experiment
            objective: Experiment objective
            description: Optional description
            end_date: Optional end date
            **kwargs: Additional optional fields
            
        Returns:
            ExperimentCreationDTO instance
        """
        if not name or not start_date or not objective:
            raise ValueError("name, start_date, and objective are required")
        
        return opensilex_swagger_client.ExperimentCreationDTO(
            name=name,
            start_date=start_date,
            objective=objective,
            description=description,
            end_date=end_date,
            **kwargs
        )
    
    @staticmethod
    def create_germplasm_dto(name: str, 
                            rdf_type: str = "http://www.opensilex.org/vocabulary/oeso#Germplasm",
                            **kwargs) -> opensilex_swagger_client.GermplasmCreationDTO:
        """
        Create a GermplasmCreationDTO with required fields.
        
        Args:
            name: Germplasm name
            rdf_type: RDF type (defaults to standard germplasm type)
            **kwargs: Additional optional fields
            
        Returns:
            GermplasmCreationDTO instance
        """
        if not name or not rdf_type:
            raise ValueError("name and rdf_type are required")
        
        return opensilex_swagger_client.GermplasmCreationDTO(
            name=name,
            rdf_type=rdf_type,
            **kwargs
        )
    
    @staticmethod
    def create_variable_dto(name: str, alternative_name: str, description: str,
                           characteristic: str, method: str, unit: str, entity: str,
                           datatype: str = "decimal",
                           **kwargs) -> opensilex_swagger_client.VariableCreationDTO:
        """
        Create a VariableCreationDTO with all required fields.
        
        Args:
            name: Variable name
            alternative_name: Alternative name
            description: Variable description
            characteristic: URI of the characteristic
            method: URI of the method
            unit: URI of the unit
            entity: URI of the entity (required!)
            datatype: Data type (default: decimal)
            **kwargs: Additional optional fields
            
        Returns:
            VariableCreationDTO instance
        """
        required_fields = [name, alternative_name, description, characteristic, method, unit, entity]
        if any(field is None or field == "" for field in required_fields):
            raise ValueError("All fields (name, alternative_name, description, characteristic, method, unit, entity) are required")
        
        return opensilex_swagger_client.VariableCreationDTO(
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
    
    @staticmethod
    def create_device_dto(name: str, rdf_type: str, **kwargs) -> opensilex_swagger_client.DeviceCreationDTO:
        """
        Create a DeviceCreationDTO with required fields.
        
        Args:
            name: Device name
            rdf_type: RDF type of the device
            **kwargs: Additional optional fields
            
        Returns:
            DeviceCreationDTO instance
        """
        if not name or not rdf_type:
            raise ValueError("name and rdf_type are required")
        
        return opensilex_swagger_client.DeviceCreationDTO(
            name=name,
            rdf_type=rdf_type,
            **kwargs
        )

class ValidationHelpers:
    """Helper class for validating model data before creation."""
    
    @staticmethod
    def validate_uri(uri: str, field_name: str = "URI") -> bool:
        """Validate URI format."""
        if not uri:
            raise ValueError(f"{field_name} cannot be empty")
        
        if not (uri.startswith('http://') or uri.startswith('https://')):
            logger.warning(f"{field_name} should start with http:// or https://")
        
        return True
    
    @staticmethod
    def validate_date(date: datetime, field_name: str = "Date") -> bool:
        """Validate date object."""
        if not isinstance(date, datetime):
            raise ValueError(f"{field_name} must be a datetime object")
        return True
    
    @staticmethod
    def validate_required_string(value: str, field_name: str) -> bool:
        """Validate required string field."""
        if not value or not isinstance(value, str) or value.strip() == "":
            raise ValueError(f"{field_name} is required and cannot be empty")
        return True
    
    @staticmethod
    def validate_confidence(confidence: float) -> bool:
        """Validate confidence value."""
        if confidence is not None:
            if not isinstance(confidence, (int, float)):
                raise ValueError("Confidence must be a number")
            if not (0 <= confidence <= 1):
                raise ValueError("Confidence must be between 0 and 1")
        return True
    
    @staticmethod
    def validate_numeric_value(value: Union[int, float, str], field_name: str = "Value") -> bool:
        """Validate numeric value."""
        if value is None:
            raise ValueError(f"{field_name} cannot be None")
        
        if isinstance(value, str):
            try:
                float(value)
            except ValueError:
                raise ValueError(f"{field_name} must be a valid number if provided as string")
        elif not isinstance(value, (int, float)):
            raise ValueError(f"{field_name} must be a number or numeric string")
        
        return True

class ModelFactory:
    """Factory class for creating complex models with validation."""
    
    def __init__(self, validate: bool = True):
        """
        Initialize factory.
        
        Args:
            validate: Whether to perform validation (default: True)
        """
        self.validate = validate
        self.helpers = ModelHelpers()
        self.validator = ValidationHelpers()
    
    def create_data_point(self, target: str, variable: str, value: Union[float, int, str],
                         date: datetime = None, confidence: float = None) -> opensilex_swagger_client.DataCreationDTO:
        """
        Create a data point with automatic validation.
        
        Args:
            target: Target URI
            variable: Variable URI
            value: Measured value
            date: Measurement date (default: now)
            confidence: Confidence level
            
        Returns:
            DataCreationDTO instance
        """
        if date is None:
            date = datetime.now()
        
        if self.validate:
            self.validator.validate_uri(target, "Target")
            self.validator.validate_uri(variable, "Variable")
            self.validator.validate_numeric_value(value)
            self.validator.validate_date(date)
            self.validator.validate_confidence(confidence)
        
        return self.helpers.create_data_dto(target, variable, date, value, confidence)
    
    def create_simple_experiment(self, name: str, objective: str, 
                                start_date: datetime = None,
                                description: str = None) -> opensilex_swagger_client.ExperimentCreationDTO:
        """
        Create a simple experiment with automatic validation.
        
        Args:
            name: Experiment name
            objective: Experiment objective
            start_date: Start date (default: now)
            description: Optional description
            
        Returns:
            ExperimentCreationDTO instance
        """
        if start_date is None:
            start_date = datetime.now()
        
        if self.validate:
            self.validator.validate_required_string(name, "Name")
            self.validator.validate_required_string(objective, "Objective")
            self.validator.validate_date(start_date)
        
        return self.helpers.create_experiment_dto(name, start_date, objective, description)
    
    def create_simple_germplasm(self, name: str, species: str = None, 
                               variety: str = None) -> opensilex_swagger_client.GermplasmCreationDTO:
        """
        Create a simple germplasm with automatic validation.
        
        Args:
            name: Germplasm name
            species: Species URI
            variety: Variety name
            
        Returns:
            GermplasmCreationDTO instance
        """
        if self.validate:
            self.validator.validate_required_string(name, "Name")
            if species:
                self.validator.validate_uri(species, "Species")
        
        kwargs = {}
        if species:
            kwargs['species'] = species
        if variety:
            kwargs['variety'] = variety
        
        return self.helpers.create_germplasm_dto(name, **kwargs)

# Convenience functions
def quick_data_point(target: str, variable: str, value: Union[float, int, str],
                    date: datetime = None) -> opensilex_swagger_client.DataCreationDTO:
    """Quick way to create a data point."""
    factory = ModelFactory()
    return factory.create_data_point(target, variable, value, date)

def quick_experiment(name: str, objective: str) -> opensilex_swagger_client.ExperimentCreationDTO:
    """Quick way to create an experiment."""
    factory = ModelFactory()
    return factory.create_simple_experiment(name, objective)

def quick_germplasm(name: str) -> opensilex_swagger_client.GermplasmCreationDTO:
    """Quick way to create a germplasm."""
    factory = ModelFactory()
    return factory.create_simple_germplasm(name)

if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)
    
    try:
        # Test data point creation
        data_point = quick_data_point(
            target="http://example.com/plot/1",
            variable="http://example.com/variable/height",
            value=15.5
        )
        print(f"Created data point: {data_point}")
        
        # Test experiment creation
        experiment = quick_experiment(
            name="Test Experiment",
            objective="Testing the model helpers"
        )
        print(f"Created experiment: {experiment.name}")
        
        # Test germplasm creation
        germplasm = quick_germplasm("Test Germplasm")
        print(f"Created germplasm: {germplasm.name}")
        
        print("Model helpers working correctly!")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()